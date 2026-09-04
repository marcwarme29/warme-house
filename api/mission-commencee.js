/* =============================================================================
   MAISON WARME — prévenir le propriétaire qu'un ménage vient de commencer
   (session 34, D-174)
   =============================================================================

   POURQUOI CE FICHIER EXISTE, ET POURQUOI CE N'EST PAS `api/mail.js`

   Demandé le 29 août : *« j'aimerais avoir un mail m'avertissant quand une
   mission de ménage est commencée. »*

   C'est la PRESTATAIRE qui appuie sur « Commencer la mission ». Or :

     · `api/mail.js` **refuse tout appelant qui n'est pas le propriétaire**
       (son verrou 2). C'est voulu : sans lui, n'importe quel compte connecté
       pourrait faire poster n'importe quoi à n'importe qui. On ne le relâche
       donc pas — on écrit une seconde porte, beaucoup plus étroite.

     · Le téléphone de la prestataire **ne connaît pas l'adresse du
       propriétaire** : ni `profiles` ni les réglages d'envoi ne lui sont
       ouverts, et c'est très bien ainsi.

   CE QUE CETTE PORTE ACCEPTE, ET RIEN D'AUTRE

   Un seul geste possible : « la mission <identifiant> vient de commencer ».
   L'appelante ne choisit **ni le destinataire, ni le sujet, ni le texte** —
   tout est décidé ici. Le pire qu'un compte malveillant puisse faire, c'est
   annoncer au propriétaire le début d'un de ses propres ménages.

   TROIS VERROUS
     1. le jeton doit être celui d'un compte connecté (Supabase le vérifie) ;
     2. la fonction `infos_debut_menage` (script 15) ne répond QUE si la
        mission appartient à ce compte ET qu'elle est bien « en cours » —
        elle s'exécute avec le jeton de l'appelante, pas avec un secret ;
     3. l'alerte doit être **allumée** par le propriétaire dans ses réglages.

   AUCUN SECRET NOUVEAU À POSER CHEZ VERCEL : on réutilise la clé d'envoi du
   §34. Contrairement au robot du §35, il n'y a pas de `CRON_SECRET` ici,
   puisque personne n'agit à la place de personne.

   AUCUNE DÉPENDANCE, `module.exports` : mêmes règles que les trois autres
   fichiers de ce dossier, pour les mêmes raisons.
   ========================================================================== */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uwuuygcbpoppdzcummal.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_C5n_II_vveay2TddJ5FlcA_K_1XCq_J';
const DELAI_MAX = 12000;

function avecDelai(ms) {
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), ms);
  return { signal: stop.signal, fin: () => clearTimeout(minuteur) };
}

function adresseValide(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

function coupe(v, n) {
  return String(v === undefined || v === null ? '' : v).slice(0, n);
}

function lireCorps(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return null;
}

/* --------------------------------------------------------------------------
   « Demain 14 h » ne veut rien dire dans un e-mail lu ailleurs et plus tard
   (règle 22 bis, D-152) : on écrit toujours la date en toutes lettres.
   -------------------------------------------------------------------------- */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function dateLongue(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return Number(m[3]) + ' ' + MOIS[Number(m[2]) - 1] + ' ' + m[1];
}

function heureParis() {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}

/* --------------------------------------------------------------------------
   Les deux services d'envoi possibles — même forme que dans `api/mail.js`.
   -------------------------------------------------------------------------- */
async function posterBrevo(cle, expediteur, lettre) {
  const t = avecDelai(DELAI_MAX);
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: t.signal,
      headers: { 'api-key': cle, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: expediteur.nom, email: expediteur.email },
        to: [{ email: lettre.email }],
        subject: lettre.sujet,
        textContent: lettre.texte
      })
    });
    if (r.ok) return { ok: true };
    let dit = '';
    try { const j = await r.json(); dit = (j && (j.message || j.error)) || ''; } catch (e) { dit = ''; }
    return { ok: false, raison: 'Le service d’envoi a refusé (' + r.status + ') ' + dit };
  } catch (e) {
    return { ok: false, raison: 'Le service d’envoi n’a pas répondu à temps.' };
  } finally { t.fin(); }
}

async function posterResend(cle, expediteur, lettre) {
  const t = avecDelai(DELAI_MAX);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: t.signal,
      headers: { Authorization: 'Bearer ' + cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: expediteur.nom + ' <' + expediteur.email + '>',
        to: [lettre.email],
        subject: lettre.sujet,
        text: lettre.texte
      })
    });
    if (r.ok) return { ok: true };
    let dit = '';
    try { const j = await r.json(); dit = (j && (j.message || (j.error && j.error.message))) || ''; } catch (e) { dit = ''; }
    return { ok: false, raison: 'Le service d’envoi a refusé (' + r.status + ') ' + dit };
  } catch (e) {
    return { ok: false, raison: 'Le service d’envoi n’a pas répondu à temps.' };
  } finally { t.fin(); }
}

/* --------------------------------------------------------------------------
   Le programme
   -------------------------------------------------------------------------- */
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ erreur: 'Cette adresse ne répond qu’à un envoi.' });
  }

  const corps = lireCorps(req);
  if (!corps) return res.status(400).json({ erreur: 'Demande illisible.' });

  const jeton = typeof corps.jeton === 'string' ? corps.jeton : '';
  const mission = coupe(corps.mission, 120);
  if (!jeton || !mission) {
    return res.status(400).json({ erreur: 'Il manque le jeton ou la mission.' });
  }

  /* --- Verrous 1 et 2 : la fonction du script 15 fait les deux -------------
     Elle s'exécute avec le jeton de l'appelante et ne répond que si la
     mission est la sienne et qu'elle est bien commencée. Une réponse vide
     n'est donc PAS une erreur : c'est un refus, et il n'y a rien à envoyer. */
  let ligne = null;
  {
    const t = avecDelai(DELAI_MAX);
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/infos_debut_menage', {
        method: 'POST',
        signal: t.signal,
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + jeton,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_mission: mission })
      });
      if (r.status === 401 || r.status === 403) {
        return res.status(401).json({ erreur: 'Session expirée.' });
      }
      if (!r.ok) {
        let dit = '';
        try { const j = await r.json(); dit = (j && (j.message || j.hint)) || ''; } catch (e) { dit = ''; }
        /* Le script 15 n'est pas collé : on le DIT, en nommant le fichier
           (règle 19). L'application, elle, n'en fait pas une histoire — la
           prestataire n'a pas à lire ça. */
        if (/Could not find the function|schema cache/i.test(dit)) {
          return res.status(503).json({
            erreur: 'Le script « 15-alerte-debut-menage.sql » n’a pas encore été collé dans Supabase.',
            code: 'sans-script'
          });
        }
        return res.status(502).json({ erreur: 'Le cahier partagé a refusé : ' + dit });
      }
      const l = await r.json();
      ligne = Array.isArray(l) ? l[0] : null;
    } catch (e) {
      return res.status(504).json({ erreur: 'Le cahier partagé n’a pas répondu à temps.' });
    } finally { t.fin(); }
  }

  if (!ligne) {
    // Mission inconnue, pas la sienne, ou pas commencée : rien à envoyer, et
    // ce n'est pas une panne.
    return res.status(200).json({ envoye: false, raison: 'rien-a-envoyer' });
  }

  /* --- Verrou 3 : le propriétaire a-t-il demandé cette alerte ? ----------- */
  if (!ligne.alerte_active) {
    return res.status(200).json({ envoye: false, raison: 'alerte-eteinte' });
  }

  const destinataire = coupe(ligne.destinataire, 200).trim().toLowerCase();
  if (!adresseValide(destinataire)) {
    return res.status(200).json({ envoye: false, raison: 'sans-adresse' });
  }

  const cleBrevo = process.env.BREVO_API_KEY || '';
  const cleResend = process.env.RESEND_API_KEY || '';
  if (!cleBrevo && !cleResend) {
    return res.status(503).json({
      erreur: 'Aucun service d’envoi n’est branché (§34).',
      code: 'sans-cle'
    });
  }
  const poster = cleBrevo ? posterBrevo : posterResend;
  const cle = cleBrevo || cleResend;

  const expediteur = {
    nom: coupe(process.env.MAIL_EXPEDITEUR_NOM || ligne.exp_nom || 'MAISON WARME', 80),
    email: coupe(process.env.MAIL_EXPEDITEUR || ligne.exp_mail || '', 200).trim().toLowerCase()
  };
  if (!adresseValide(expediteur.email)) {
    return res.status(200).json({ envoye: false, raison: 'sans-expediteur' });
  }

  /* --- La lettre, composée ICI et nulle part ailleurs ---------------------
     Tout y est écrit en clair : le logement, la date en toutes lettres, le
     créneau et le nom de la personne. Un e-mail se lit ailleurs et plus tard
     que l'écran qui l'a déclenché (règle 22 bis). */
  const qui = coupe(ligne.prestataire, 120).trim() || 'Une prestataire';
  const logement = coupe(ligne.logement, 120) || 'un logement';
  const jour = dateLongue(ligne.jour);
  const creneau = coupe(ligne.creneau, 60);

  const lettre = {
    email: destinataire,
    sujet: '🧹 Ménage commencé — ' + logement,
    texte:
      qui + ' vient de commencer le ménage.\n\n' +
      'Logement : ' + logement + '\n' +
      'Mission du : ' + jour + (creneau ? '\nCréneau : ' + creneau : '') + '\n' +
      'Commencé à : ' + heureParis() + ' (heure de Paris)\n\n' +
      'Tu recevras la checklist, les photos et le relevé de stock quand elle aura terminé.\n\n' +
      '— MAISON WARME\n' +
      'Pour ne plus recevoir cette alerte : Prestataires → « Prévenir les prestataires par ' +
      'e-mail » → décoche « Me prévenir quand un ménage commence ».'
  };

  const bilan = await poster(cle, expediteur, lettre);
  if (!bilan.ok) {
    // Règle 4 : un envoi qui ne part pas ne s'annonce jamais comme parti.
    return res.status(502).json({ envoye: false, erreur: bilan.raison });
  }
  return res.status(200).json({ envoye: true, a: destinataire });
};
