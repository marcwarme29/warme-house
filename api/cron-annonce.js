/* =============================================================================
   MAISON WARME — le ROBOT : annoncer les missions à heure fixe, même
   application fermée (session 30, D-161)
   =============================================================================

   POURQUOI CE FICHIER EXISTE

   `api/mail.js` sait déjà poster un e-mail — mais seulement quand quelqu'un de
   connecté le demande depuis un navigateur (D-150). C'est la limite écrite au
   §7 du document d'état : « les calendriers, et l'annonce qui les suit, ne se
   relèvent que si l'application est ouverte ». Ici, personne n'est connecté :
   c'est **Vercel lui-même**, sur une horloge (`vercel.json`, `crons`), qui
   appelle cette adresse — une fois par heure, toute la journée.

   CE QUE CE PROGRAMME FAIT, DANS L'ORDRE
     1. Vérifie qu'il est bien appelé par Vercel (ou par Marc, pour un essai —
        voir plus bas), et par personne d'autre : cette adresse est publique.
     2. Va lire, chez Supabase, deux choses : l'heure choisie par Marc et
        l'interrupteur (branché ou non), et les missions encore libres.
     3. S'il n'est pas encore l'heure, ou que l'envoi automatique n'est pas
        coché, ou qu'il a déjà agi aujourd'hui : il ne fait rien, et le dit.
     4. Sinon : il compose les mêmes lettres que celles qu'écrit MAISON WARME
        quand Marc clique sur « Annoncer » (`api/_annonce.js`, une copie
        volontaire de `lettreAnnonce()`), les poste, et note ce qui est parti.

   AUCUNE CLÉ `service_role` ICI (règle 2, D-60). Ce programme lit et écrit un
   tout petit nombre de choses très précises — jamais toute la base — par
   deux fonctions Supabase (`cron_donnees_annonce`, `cron_ecrire_reglage`)
   protégées par un secret que SEUL Vercel connaît (`CRON_SECRET`), pas par la
   clé `service_role`. Coller le script `13-envoi-automatique.sql` explique ce
   choix en détail.

   AUCUNE DÉPENDANCE, AUCUNE ÉTAPE DE CONSTRUCTION, `module.exports` : mêmes
   règles que `api/mail.js` et `api/ical.js`, pour les mêmes raisons.
   ========================================================================== */

var annonce = require('./_annonce.js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uwuuygcbpoppdzcummal.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_C5n_II_vveay2TddJ5FlcA_K_1XCq_J';
const DELAI_MAX = 15000;
const MAX_DESTINATAIRES = 25;

function avecDelai(ms) {
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), ms);
  return { signal: stop.signal, fin: () => clearTimeout(minuteur) };
}

/* --------------------------------------------------------------------------
   La date et l'heure, à Paris — pas celles du serveur, qui tourne en UTC.
   -------------------------------------------------------------------------- */
function dateHeureParis() {
  var jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  var heure = parseInt(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(new Date()), 10);
  return { jour: jour, heure: heure % 24 };
}

/* --------------------------------------------------------------------------
   Les deux appels à Supabase : lire, puis (s'il y a lieu) écrire.
   -------------------------------------------------------------------------- */
async function appelerRpc(nom, corps) {
  var t = avecDelai(DELAI_MAX);
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + nom, {
      method: 'POST', signal: t.signal,
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    });
    var j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok) {
      var msg = (j && (j.message || j.hint)) || ('code ' + r.status);
      throw new Error('Supabase (' + nom + ') a refusé : ' + msg);
    }
    return j;
  } finally { t.fin(); }
}

/* --------------------------------------------------------------------------
   Les deux services d'envoi possibles — mêmes fonctions que `api/mail.js`,
   copiées ici pour la même raison qu'`api/_annonce.js` : ce fichier n'importe
   rien de ce qui tourne dans un navigateur.
   -------------------------------------------------------------------------- */
function adresseValide(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }
function coupe(v, n) { return String(v === undefined || v === null ? '' : v).slice(0, n); }

function traduireRefus(code, dit) {
  var brut = String(dit || '').toLowerCase();
  if (code === 401 || code === 403 || /unauthorized|api key|api-key|invalid key/.test(brut)) return 'clé d’envoi refusée';
  if (/sender|from|not validated|not verified|domain|unverified/.test(brut)) return 'adresse d’expédition non validée';
  if (code === 429 || /limit|quota|too many/.test(brut)) return 'limite d’envoi atteinte';
  return 'refusé (code ' + code + ')' + (dit ? ' : ' + dit : '');
}

async function posterBrevo(cle, expediteur, lettre) {
  var t = avecDelai(DELAI_MAX);
  try {
    var r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', signal: t.signal,
      headers: { 'api-key': cle, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: expediteur.nom, email: expediteur.email },
        replyTo: { email: expediteur.repondreA || expediteur.email, name: expediteur.nom },
        to: [{ email: lettre.email, name: lettre.nom || lettre.email }],
        subject: lettre.sujet, textContent: lettre.texte, htmlContent: lettre.html || undefined
      })
    });
    if (r.ok) return { ok: true };
    var dit = ''; try { var j = await r.json(); dit = (j && (j.message || j.error)) || ''; } catch (e) {}
    return { ok: false, raison: traduireRefus(r.status, dit) };
  } catch (e) {
    return { ok: false, raison: 'le service d’envoi n’a pas répondu à temps' };
  } finally { t.fin(); }
}

async function posterResend(cle, expediteur, lettre) {
  var t = avecDelai(DELAI_MAX);
  try {
    var r = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: t.signal,
      headers: { Authorization: 'Bearer ' + cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: expediteur.nom + ' <' + expediteur.email + '>', reply_to: expediteur.repondreA || expediteur.email,
        to: [lettre.email], subject: lettre.sujet, text: lettre.texte, html: lettre.html || undefined
      })
    });
    if (r.ok) return { ok: true };
    var dit = ''; try { var j = await r.json(); dit = (j && (j.message || (j.error && j.error.message))) || ''; } catch (e) {}
    return { ok: false, raison: traduireRefus(r.status, dit) };
  } catch (e) {
    return { ok: false, raison: 'le service d’envoi n’a pas répondu à temps' };
  } finally { t.fin(); }
}

/* --------------------------------------------------------------------------
   Qui peut être prévenu de cette mission ? Même règle que `mayTakeMission()`
   dans app.js : pas une remise de clés, une adresse valable, ce logement lui
   est confié, et cette prestation le concerne (ou il n'a pas de liste, ce qui
   veut dire « tout »).
   -------------------------------------------------------------------------- */
function destinatairesDe(m, prestataires) {
  return prestataires.filter(function (a) {
    if (!a || a.kind === 'cles') return false;
    if (!adresseValide(a.email)) return false;
    if (!Array.isArray(a.props) || a.props.indexOf(m.property_id) < 0) return false;
    if (Array.isArray(a.services) && a.services.indexOf(m.type) < 0) return false;
    return true;
  }).map(function (a) { return { id: a.id, name: a.name || '', email: a.email }; });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  var secretAttendu = process.env.CRON_SECRET || '';
  if (!secretAttendu) {
    return res.status(503).json({ erreur: 'CRON_SECRET n’est pas posé chez Vercel : le robot ne peut pas encore tourner.' });
  }
  var recu = (req.headers.authorization === 'Bearer ' + secretAttendu) || (req.query && req.query.secret === secretAttendu);
  if (!recu) return res.status(401).json({ erreur: 'Secret manquant ou incorrect.' });

  var dh = dateHeureParis();

  var donnees;
  try {
    donnees = await appelerRpc('cron_donnees_annonce', { p_secret: secretAttendu });
  } catch (e) {
    return res.status(502).json({ erreur: (e && e.message) || 'Lecture Supabase impossible.' });
  }
  if (!donnees || donnees.erreur) {
    return res.status(200).json({ agi: false, raison: (donnees && donnees.erreur) || 'Aucune donnée.' });
  }

  var mr = donnees.mailReglages || {};
  if (!mr.actif || !mr.robotActif) {
    return res.status(200).json({ agi: false, raison: 'Envoi automatique à heure fixe non activé.' });
  }
  if (!adresseValide(mr.expMail)) {
    return res.status(200).json({ agi: false, raison: 'Adresse d’expédition manquante ou invalide.' });
  }
  /* UNE SEULE VISITE PAR JOUR, ET ELLE EST FIXÉE PAR `vercel.json` (D-162).
     La première version réveillait le robot **chaque heure** et n'agissait qu'à
     l'heure exacte choisie. Le forfait gratuit de Vercel n'autorise qu'un seul
     passage par jour : la publication entière était refusée, et rien de la
     session 30 n'atteignait le site — pas seulement le robot.

     Le robot passe donc une fois, à l'heure inscrite dans `vercel.json`, et
     agit si cette heure a **atteint ou dépassé** celle que Marc a choisie. Si
     Marc choisit une heure PLUS TARDIVE que le passage du robot, celui-ci ne
     ferait jamais rien : plutôt que de se taire, il le DIT (règle 4 — un
     automatisme muet est ce que la règle 13 interdit), et la phrase nomme le
     geste : changer l'heure dans `vercel.json`. */
  if (typeof mr.heureAuto !== 'number') {
    return res.status(200).json({ agi: false, raison: 'Aucune heure choisie dans les réglages.' });
  }
  if (dh.heure < mr.heureAuto) {
    return res.status(200).json({
      agi: false,
      raison: 'Le robot passe à ' + dh.heure + ' h (heure de Paris), mais l’heure choisie dans ' +
        'MAISON WARME est ' + mr.heureAuto + ' h — donc plus tard. Il ne partira jamais rien ainsi : ' +
        'il faut soit choisir une heure au plus tard ' + dh.heure + ' h dans l’application, soit faire ' +
        'changer l’heure de passage du robot dans vercel.json (§35.4 du mode d’emploi).'
    });
  }
  if (mr.dernierEnvoiRobot === dh.jour) {
    return res.status(200).json({ agi: false, raison: 'Déjà passé aujourd’hui (' + dh.jour + ').' });
  }

  var cleBrevo = process.env.BREVO_API_KEY || '';
  var cleResend = process.env.RESEND_API_KEY || '';
  if (!cleBrevo && !cleResend) {
    return res.status(200).json({ agi: false, raison: 'Aucun service d’envoi branché (clé Brevo ou Resend absente).' });
  }
  var fournisseur = cleBrevo ? 'Brevo' : 'Resend';
  var poster = cleBrevo ? posterBrevo : posterResend;
  var cle = cleBrevo || cleResend;
  var expediteur = {
    nom: coupe(process.env.MAIL_EXPEDITEUR_NOM || mr.expNom || 'MAISON WARME', 80),
    email: coupe(process.env.MAIL_EXPEDITEUR || mr.expMail || '', 200).trim().toLowerCase(),
    repondreA: coupe(mr.expMail || '', 200).trim().toLowerCase()
  };

  var proprietes = {}; (donnees.properties || []).forEach(function (p) { proprietes[p.id] = p; });
  var prestations = {}; (donnees.services || []).forEach(function (s) { prestations[s.key] = s; });
  var mailsEnvoyes = donnees.mailsEnvoyes || {};
  var appUrl = 'https://' + (process.env.VERCEL_URL || 'warme-house.vercel.app') + '/';

  var missions = (donnees.missions || []).filter(function (m) {
    return m.status === 'dispo' && m.date >= dh.jour && !mailsEnvoyes[m.id];
  }).map(function (m) {
    var p = proprietes[m.property_id] || { name: 'Logement' };
    var s = prestations[m.type] || { label: m.type };
    return {
      id: m.id, date: m.date, price: m.price, windowLabel: m.window_label,
      turnover: m.turnover, note: m.note, nextAt: (m.next_guest && m.next_guest.at) || '',
      prop: { name: p.name }, service: { label: s.label },
      destinataires: destinatairesDe(m, donnees.prestataires || [])
    };
  }).filter(function (m) { return m.destinataires.length > 0; });

  var lots = annonce.repartirParPrestataire(missions);

  var envoyes = [], echecs = [];
  if (lots.length) {
    if (lots.length > MAX_DESTINATAIRES) lots = lots.slice(0, MAX_DESTINATAIRES);
    for (var i = 0; i < lots.length; i++) {
      var lettre = annonce.lettreAnnonce(lots[i].a, lots[i].missions, dh.jour, appUrl);
      var r = await poster(cle, expediteur, lettre);
      if (r.ok) envoyes.push({ email: lettre.email, lot: lots[i] });
      else echecs.push({ email: lettre.email, raison: r.raison });
    }
  }

  /* MÊME RÈGLE QUE DANS `app.js` : on ne marque « annoncée » que ce qui est
     VRAIMENT parti (règle 4). */
  var quand = new Date().toISOString();
  envoyes.forEach(function (e) {
    e.lot.missions.forEach(function (m) {
      var d = mailsEnvoyes[m.id] || { at: quand, a: [] };
      if (d.a.indexOf(e.email) < 0) d.a.push(e.email);
      d.at = quand;
      mailsEnvoyes[m.id] = d;
    });
  });

  try {
    await appelerRpc('cron_ecrire_reglage', { p_secret: secretAttendu, p_cle: 'mailsEnvoyes', p_valeur: mailsEnvoyes });
    var mrEcrit = Object.assign({}, mr, { dernierEnvoiRobot: dh.jour });
    await appelerRpc('cron_ecrire_reglage', { p_secret: secretAttendu, p_cle: 'mailReglages', p_valeur: mrEcrit });
  } catch (e) {
    // Écrit ou pas, la réponse HTTP le dit (règle 4) : ce n'est jamais avalé.
    return res.status(200).json({
      agi: true, fournisseur: fournisseur, prevenus: envoyes.length, echecs: echecs.length,
      erreurEcriture: (e && e.message) || 'Écriture Supabase impossible : la même heure sera retentée demain, ou deux fois aujourd’hui si le robot repasse.'
    });
  }

  return res.status(200).json({ agi: true, fournisseur: fournisseur, prevenus: envoyes.length, missions: missions.length, echecs: echecs });
};
