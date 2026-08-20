/* =============================================================================
   MAISON WARME — le facteur : prévenir les prestataires par e-mail
   =============================================================================

   POURQUOI CE FICHIER EXISTE

   Depuis le début du projet, l'application ne sait pas envoyer d'e-mail. Ce
   n'est pas un oubli : **un navigateur n'a pas le droit d'envoyer du courrier**.
   Poster une lettre demande un serveur de courrier, et un serveur de courrier
   demande une clé secrète — or toute clé posée dans `config.js` serait lisible
   par n'importe qui (c'est précisément ce que dit l'avertissement de ce
   fichier-là). C'est pour cette raison que « aucun mail n'est envoyé » figurait
   dans les limites du projet depuis la session 1, sous le nom de « phase 8 ».

   Ce fichier lève cette limite, par le même chemin que `api/ical.js` : un tout
   petit programme qui tourne **chez Vercel**, sur la même adresse que le site
   (`/api/mail`). La clé secrète y vit dans une **variable d'environnement** —
   c'est-à-dire un coffre chez Vercel, jamais dans le dépôt, jamais dans le
   navigateur.

   AUCUNE DÉPENDANCE, AUCUNE ÉTAPE DE CONSTRUCTION, et `module.exports` plutôt
   qu'`export default` : mêmes contraintes que `api/ical.js`, pour les mêmes
   raisons. Les relire là-bas si besoin.

   -----------------------------------------------------------------------------
   CE QUI EMPÊCHE CE FICHIER DE DEVENIR UNE BOÎTE AUX LETTRES POUR TOUT LE MONDE

   Une adresse publique qui envoie des e-mails à qui le demande est un cadeau
   offert aux expéditeurs de courrier indésirable : en quelques heures, la clé
   est brûlée et l'adresse d'expédition est mise sur liste noire partout. Trois
   verrous, et il faut les trois :

     1. **Seul un compte connecté est écouté.** L'appel doit porter le jeton de
        session Supabase de la personne. On le fait vérifier par Supabase
        lui-même : un jeton inventé ou périmé ne passe pas.
     2. **Seul le PROPRIÉTAIRE peut faire partir du courrier.** On relit la
        fiche du compte (`profiles.role`) et on exige `owner`. Une prestataire
        connectée, même de bonne foi, n'envoie rien.
     3. **On ne poste que des quantités raisonnables** : 25 destinataires par
        appel au maximum, un sujet et un texte bornés.

   Ce n'est pas de la méfiance envers Marc : c'est que l'adresse `/api/mail`
   est publique, comme `/api/ical`, et que n'importe qui sur internet peut la
   trouver. Le verrou ne protège pas de Marc, il protège Marc.

   -----------------------------------------------------------------------------
   CE QU'IL FAUT AVOIR FAIT POUR QUE ÇA MARCHE (une seule fois)

   Chez Vercel → le projet `warme-house` → Settings → Environment Variables :

     · `BREVO_API_KEY`  = la clé donnée par Brevo (recommandé — voir §34 du
                          mode d'emploi : gratuit, en français, et il suffit de
                          faire valider son adresse d'expédition)
       ou
     · `RESEND_API_KEY` = la clé donnée par Resend (il faut alors posséder un
                          nom de domaine à soi)

   Facultatif, si on veut forcer l'expéditeur depuis Vercel plutôt que depuis
   l'application :
     · `MAIL_EXPEDITEUR`     = l'adresse d'expédition (ex. moi@exemple.fr)
     · `MAIL_EXPEDITEUR_NOM` = le nom affiché (ex. MAISON WARME)

   Tant qu'aucune clé n'est posée, ce programme répond une phrase en français
   qui **dit exactement ce qui manque**. Il ne fait jamais semblant d'avoir
   envoyé (règle 4 du §6 : une écriture refusée doit se voir ; règle 13 : un
   écran qui a l'air de marcher est pire qu'un écran absent).
   ========================================================================== */

/* L'adresse du cahier partagé et sa clé publique. Ce sont les deux mêmes
   valeurs que `config.js`, et elles sont **publiques par conception** : elles
   ne font qu'annoncer « je frappe à la porte du projet MAISON WARME ». On les
   redit ici parce qu'un programme qui tourne chez Vercel ne lit pas les
   fichiers du site ; les variables d'environnement, si elles existent,
   l'emportent, ce qui permet de déménager le projet Supabase sans toucher au
   code.
   ⚠️ Ne JAMAIS mettre ici la clé « service_role » (règle 2, D-60). */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uwuuygcbpoppdzcummal.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_C5n_II_vveay2TddJ5FlcA_K_1XCq_J';

const MAX_DESTINATAIRES = 25;
const MAX_SUJET = 300;
const MAX_TEXTE = 20000;
const DELAI_MAX = 15000;

/* --------------------------------------------------------------------------
   Petites aides
   -------------------------------------------------------------------------- */

function adresseValide(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

function coupe(v, n) {
  return String(v === undefined || v === null ? '' : v).slice(0, n);
}

/* Le corps de la requête. Vercel le décode tout seul quand l'appel annonce du
   JSON, mais pas toujours selon la façon dont il est posté : on accepte les
   deux formes plutôt que de tomber sur un cas de figure. */
function lireCorps(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return null;
}

function avecDelai(promesse, ms) {
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), ms);
  return { signal: stop.signal, fin: () => clearTimeout(minuteur) };
}

/* --------------------------------------------------------------------------
   Verrou 1 et 2 : qui appelle, et a-t-il le droit ?
   -------------------------------------------------------------------------- */

/** Rend `{ id, email }` si le jeton est valable, sinon `null`. */
async function quiEstCe(jeton) {
  const t = avecDelai(null, DELAI_MAX);
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
      signal: t.signal,
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + jeton }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: u.email || '' } : null;
  } catch (e) {
    return null;
  } finally {
    t.fin();
  }
}

/** Le rôle inscrit sur sa fiche : 'owner', 'provider', ou '' si illisible. */
async function sonRole(jeton, id) {
  const t = avecDelai(null, DELAI_MAX);
  try {
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/profiles?select=role,full_name&id=eq.' + encodeURIComponent(id),
      { signal: t.signal, headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + jeton } }
    );
    if (!r.ok) return '';
    const l = await r.json();
    return (Array.isArray(l) && l[0] && l[0].role) || '';
  } catch (e) {
    return '';
  } finally {
    t.fin();
  }
}

/* --------------------------------------------------------------------------
   Les deux services d'envoi possibles
   --------------------------------------------------------------------------
   On garde la même forme des deux côtés — `{ ok, raison }` par lettre — pour
   que l'application n'ait pas à savoir lequel des deux est branché. */

async function posterBrevo(cle, expediteur, lettre) {
  const t = avecDelai(null, DELAI_MAX);
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: t.signal,
      headers: { 'api-key': cle, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: expediteur.nom, email: expediteur.email },
        replyTo: { email: expediteur.repondreA || expediteur.email, name: expediteur.nom },
        to: [{ email: lettre.email, name: lettre.nom || lettre.email }],
        subject: lettre.sujet,
        textContent: lettre.texte,
        htmlContent: lettre.html || undefined
      })
    });
    if (r.ok) return { ok: true };
    let dit = '';
    try {
      const j = await r.json();
      dit = (j && (j.message || j.error)) || '';
    } catch (e) { dit = ''; }
    return { ok: false, raison: traduireRefus(r.status, dit, expediteur) };
  } catch (e) {
    return { ok: false, raison: 'Le service d’envoi n’a pas répondu à temps. Réessaie dans un instant.' };
  } finally {
    t.fin();
  }
}

async function posterResend(cle, expediteur, lettre) {
  const t = avecDelai(null, DELAI_MAX);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: t.signal,
      headers: { Authorization: 'Bearer ' + cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: expediteur.nom + ' <' + expediteur.email + '>',
        reply_to: expediteur.repondreA || expediteur.email,
        to: [lettre.email],
        subject: lettre.sujet,
        text: lettre.texte,
        html: lettre.html || undefined
      })
    });
    if (r.ok) return { ok: true };
    let dit = '';
    try {
      const j = await r.json();
      dit = (j && (j.message || (j.error && j.error.message))) || '';
    } catch (e) { dit = ''; }
    return { ok: false, raison: traduireRefus(r.status, dit, expediteur) };
  } catch (e) {
    return { ok: false, raison: 'Le service d’envoi n’a pas répondu à temps. Réessaie dans un instant.' };
  } finally {
    t.fin();
  }
}

/* NE JAMAIS RECOPIER UN MESSAGE QUE PERSONNE NE PEUT COMPRENDRE (règle 5,
   D-134). Les services d'envoi répondent en anglais et en jargon. Les trois
   refus qu'on rencontrera pour de vrai sont toujours les mêmes, et chacun a un
   geste précis : on les traduit, et on garde la phrase d'origine à la suite
   pour qu'elle reste recopiable si ce n'est aucun des trois. */
function traduireRefus(code, dit, expediteur) {
  const brut = String(dit || '').toLowerCase();

  if (code === 401 || code === 403 || /unauthorized|api key|api-key|invalid key/.test(brut)) {
    return 'La clé d’envoi est refusée. Elle a été mal recopiée, ou elle a été supprimée du ' +
      'service. Refais l’étape « coller la clé chez Vercel » du mode d’emploi.';
  }
  if (/sender|from|not validated|not verified|domain|unverified/.test(brut)) {
    return 'L’adresse d’expédition « ' + expediteur.email + ' » n’est pas encore validée chez le ' +
      'service d’envoi. Ouvre le message de confirmation qu’il t’a adressé, ou ajoute cette ' +
      'adresse dans ses « expéditeurs ».';
  }
  if (code === 429 || /limit|quota|too many/.test(brut)) {
    return 'Le service d’envoi a atteint sa limite de courriers pour aujourd’hui. Les prestataires ' +
      'non prévenus le seront demain, ou tout de suite en les appelant.';
  }
  return 'Le service d’envoi a refusé cette lettre (code ' + code + ')' +
    (dit ? ' : « ' + dit + ' »' : '') + '.';
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
  if (!corps) {
    return res.status(400).json({ erreur: 'La demande d’envoi est illisible.' });
  }

  /* --- Verrou 1 : un compte connecté ------------------------------------- */
  const jeton = typeof corps.jeton === 'string' ? corps.jeton : '';
  if (!jeton) {
    return res.status(401).json({
      erreur: 'Tu n’es plus connecté à MAISON WARME. Recharge la page et reconnecte-toi.'
    });
  }
  const qui = await quiEstCe(jeton);
  if (!qui) {
    return res.status(401).json({
      erreur: 'Ta connexion a expiré. Recharge la page et reconnecte-toi, puis relance l’envoi.'
    });
  }

  /* --- Verrou 2 : et c'est bien le propriétaire -------------------------- */
  const role = await sonRole(jeton, qui.id);
  if (role !== 'owner') {
    return res.status(403).json({
      erreur: 'Seul le compte du propriétaire peut envoyer des e-mails aux prestataires.'
    });
  }

  /* --- Y a-t-il un service d'envoi branché ? ----------------------------- */
  const cleBrevo = process.env.BREVO_API_KEY || '';
  const cleResend = process.env.RESEND_API_KEY || '';
  if (!cleBrevo && !cleResend) {
    return res.status(503).json({
      erreur: 'Aucun service d’envoi n’est branché : la clé n’a pas encore été posée chez Vercel. ' +
        'C’est la seule chose qui manque — mode d’emploi §34, « Prévenir les prestataires par ' +
        'e-mail ». Tant que ce n’est pas fait, aucun courrier ne part.',
      code: 'sans-cle'
    });
  }
  const fournisseur = cleBrevo ? 'Brevo' : 'Resend';
  const poster = cleBrevo ? posterBrevo : posterResend;
  const cle = cleBrevo || cleResend;

  /* --- L'expéditeur ------------------------------------------------------ */
  const exp = corps.expediteur || {};
  const expediteur = {
    nom: coupe(process.env.MAIL_EXPEDITEUR_NOM || exp.nom || 'MAISON WARME', 80),
    email: coupe(process.env.MAIL_EXPEDITEUR || exp.email || '', 200).trim().toLowerCase(),
    repondreA: coupe(exp.repondreA || '', 200).trim().toLowerCase()
  };
  if (!adresseValide(expediteur.email)) {
    return res.status(400).json({
      erreur: 'L’adresse qui envoie les e-mails n’est pas renseignée. Écris-la dans MAISON WARME : ' +
        'Prestataires → « Prévenir par e-mail » → « Adresse qui envoie ». Ce doit être une adresse ' +
        'que tu as fait valider chez ' + fournisseur + '.',
      code: 'sans-expediteur'
    });
  }
  if (expediteur.repondreA && !adresseValide(expediteur.repondreA)) expediteur.repondreA = '';

  /* --- Verrou 3 : des quantités raisonnables ----------------------------- */
  const demande = Array.isArray(corps.envois) ? corps.envois : [];
  if (!demande.length) {
    return res.status(400).json({ erreur: 'Il n’y a personne à prévenir dans cette demande.' });
  }
  if (demande.length > MAX_DESTINATAIRES) {
    return res.status(400).json({
      erreur: 'Trop de destinataires d’un coup (' + demande.length + ', maximum ' +
        MAX_DESTINATAIRES + '). C’est une protection : préviens-les en plusieurs fois.'
    });
  }

  /* --- On poste, une lettre après l'autre -------------------------------- */
  const envoyes = [];
  const echecs = [];

  for (const brute of demande) {
    const lettre = {
      email: coupe(brute && brute.email, 200).trim().toLowerCase(),
      nom: coupe(brute && brute.nom, 120),
      sujet: coupe(brute && brute.sujet, MAX_SUJET),
      texte: coupe(brute && brute.texte, MAX_TEXTE),
      html: coupe(brute && brute.html, MAX_TEXTE)
    };

    if (!adresseValide(lettre.email)) {
      echecs.push({
        email: lettre.email || '(adresse vide)',
        nom: lettre.nom,
        raison: 'Cette adresse e-mail n’a pas une forme valable. Corrige-la sur sa fiche de prestataire.'
      });
      continue;
    }
    if (!lettre.sujet || !lettre.texte) {
      echecs.push({ email: lettre.email, nom: lettre.nom, raison: 'Lettre vide : rien n’a été envoyé.' });
      continue;
    }

    /* Une lettre qui échoue n'empêche pas les suivantes de partir. C'est
       l'inverse d'un envoi groupé au cahier partagé, qui tombe en entier
       (règle 21) : ici chaque destinataire est indépendant, et on rend le
       détail pour que l'application puisse DIRE qui n'a pas été prévenu. */
    const r = await poster(cle, expediteur, lettre);
    if (r.ok) envoyes.push({ email: lettre.email, nom: lettre.nom });
    else echecs.push({ email: lettre.email, nom: lettre.nom, raison: r.raison });
  }

  return res.status(200).json({
    fournisseur: fournisseur,
    expediteur: expediteur.email,
    envoyes: envoyes,
    echecs: echecs
  });
};
