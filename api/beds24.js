/* =============================================================================
   MAISON WARME — la porte Beds24, première marche : se relier et REGARDER (D-228)
   =============================================================================

   POURQUOI CE FICHIER EXISTE

   Le 6 novembre 2026, Marc a relié Airbnb et Booking à Beds24 (pour
   « Appartement cosy ») et a demandé : *« commence la mise en place pour
   mettre sur mon appli »*. Beds24 sait des choses que les calendriers iCal
   ne disent pas : le nom du voyageur, son téléphone, son e-mail, le nombre
   d'adultes et d'enfants, le vrai montant, la plateforme, l'heure d'arrivée
   annoncée, et les annulations dites comme telles (§17.12 de
   `docs/02-MODES-EMPLOI.md`).

   Un navigateur ne peut pas parler à Beds24 tout seul : il faut une clé
   d'accès, et une clé posée dans `config.js` serait lisible par n'importe
   qui. Même réponse que le facteur (`api/mail.js`) et le traducteur
   (`api/traduire.js`) : un petit programme chez Vercel, la clé dans un coffre
   (variable d'environnement), jamais dans le dépôt ni dans le navigateur
   (règle 2).

   CETTE PREMIÈRE MARCHE NE FAIT QUE LIRE. Elle n'écrit rien, ni chez Beds24,
   ni dans le cahier partagé. C'est voulu (D-152) : on n'écrit pas la
   « traduction » d'une réservation Beds24 vers MAISON WARME contre une
   documentation, sans jamais avoir vu les vraies réservations de Marc. On
   les regarde d'abord, ensemble ; l'import vient à la marche suivante.

   Quatre demandes, toutes réservées au propriétaire (ou à son administrateur) :

     · `etat`      — la clé est-elle posée ? Beds24 l'accepte-t-il ? Quels
                     logements et quelles chambres voit-il ? Quels droits ?
     · `inviter`   — échange le « code d'invitation » que Marc génère chez
                     Beds24 (il périme vite) contre la clé permanente, que Marc
                     colle ensuite chez Vercel. Rien n'est gardé ici.
     · `sejours`   — les réservations que Beds24 connaît, en lecture seule,
                     présentées simplement (l'import se fait dans l'application,
                     D-229) ;
     · `messages`  — la messagerie Airbnb / Booking des 120 derniers jours, en
                     lecture seule (D-231). Répondre viendra ensuite, avec une
                     clé qui en aura le droit. *(Obsolète depuis la session 49 :
                     répondre est fait, voir ci-dessous.)*

   SESSION 49 — TROIS DEMANDES DE PLUS, LES SEULES QUI ÉCRIVENT CHEZ BEDS24, et
   seulement dans la conversation d'une réservation (jamais prix, dates ni
   réservations). Elles exigent une clé avec « bookings » en écriture (§54) :

     · `envoyer`   — un message écrit par le propriétaire, relu dans l'aperçu
                     (D-232) ;
     · `lu`        — marquer « lus » les messages du voyageur qu'il a ouverts ;
     · `robot`     — envoyer les messages programmés dont l'heure est venue
                     (D-233). Appelée par le propriétaire connecté, OU sans
                     compte avec le secret du robot (`CRON_SECRET`), par le
                     réveil que pose le script 19 dans Supabase.

   -----------------------------------------------------------------------------
   CE QU'IL FAUT AVOIR FAIT POUR QUE ÇA MARCHE (une seule fois)

   Chez Vercel → le projet `warme-house` → Settings → Environment Variables :

     · `BEDS24_REFRESH_TOKEN` = la clé permanente rendue par l'étape `inviter`.

   Puis **Redeploy**. ⚠️ Cette clé ne se périme pas tant qu'elle sert au moins
   une fois tous les 30 jours (documentation Beds24) : la marche suivante la
   fera servir chaque jour.

   AUCUNE DÉPENDANCE, AUCUNE ÉTAPE DE CONSTRUCTION, `module.exports` : mêmes
   contraintes que les autres fichiers de `api/`.
   ========================================================================== */

/* L'adresse du cahier partagé et sa clé publique, publiques par conception.
   ⚠️ Ne JAMAIS mettre ici la clé « service_role » (règle 2, D-60). */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uwuuygcbpoppdzcummal.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_C5n_II_vveay2TddJ5FlcA_K_1XCq_J';

const BEDS24 = 'https://beds24.com/api/v2';
const DELAI_MAX = 20000;
const MAX_PAGES = 10;

/* --------------------------------------------------------------------------
   Petites aides — les mêmes que `api/traduire.js`
   -------------------------------------------------------------------------- */

function lireCorps(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return null;
}

function avecDelai(ms) {
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), ms);
  return { signal: stop.signal, fin: () => clearTimeout(minuteur) };
}

async function quiEstCe(jeton) {
  const t = avecDelai(DELAI_MAX);
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
      signal: t.signal,
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + jeton }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id } : null;
  } catch (e) {
    return null;
  } finally {
    t.fin();
  }
}

async function sonRole(jeton, id) {
  const t = avecDelai(DELAI_MAX);
  try {
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/profiles?select=role&id=eq.' + encodeURIComponent(id),
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
   Parler à Beds24
   -------------------------------------------------------------------------- */

/** Un appel à Beds24. Rend `{ ok, statut, j }` — jamais d'exception. */
async function appel(chemin, entetes) {
  const t = avecDelai(DELAI_MAX);
  try {
    const r = await fetch(BEDS24 + chemin, { signal: t.signal, headers: Object.assign({ accept: 'application/json' }, entetes) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    return { ok: r.ok && !(j && j.success === false), statut: r.status, j };
  } catch (e) {
    return { ok: false, statut: 0, j: null };
  } finally {
    t.fin();
  }
}

/** Les refus de Beds24, dits en français (règle 5, D-134). */
function refusBeds24(rep, quoi) {
  const dit = String((rep.j && (rep.j.error || rep.j.message)) || '');
  if (rep.statut === 0) {
    return { code: 'injoignable', erreur: 'Beds24 n’a pas répondu à temps. Réessayer dans un instant : rien n’a été modifié.' };
  }
  if (rep.statut === 401 || rep.statut === 403 || /token|invalid|expired/i.test(dit)) {
    return {
      code: 'cle-refusee',
      erreur: quoi === 'inviter'
        ? 'Beds24 refuse ce code d’invitation : il a été mal recopié, ou il a déjà périmé (il ne vaut que ' +
          'peu de temps). En générer un nouveau chez Beds24 et le coller aussitôt.'
        : 'Beds24 refuse la clé posée chez Vercel : elle a été mal recopiée, ou elle a périmé (plus de ' +
          '30 jours sans servir). Refaire l’étape « code d’invitation » du mode d’emploi (§53).' +
          // Session 49 bis : la phrase de Beds24, pour distinguer « clé fausse » de « droit d'écrire manquant ».
          ' [' + (quoi === 'envoyer' ? 'à l’envoi' : 'à la connexion') + ', code ' + rep.statut +
          (dit ? ', Beds24 : « ' + dit.slice(0, 200) + ' »' : '') + ']'
    };
  }
  if (rep.statut === 429 || /credit|limit/i.test(dit)) {
    return { code: 'occupe', erreur: 'Beds24 limite le nombre de demandes : réessayer dans cinq minutes.' };
  }
  return {
    code: 'refus',
    erreur: 'Beds24 a refusé la demande (code ' + rep.statut + ')' + (dit ? ' : « ' + dit + ' »' : '') + '.'
  };
}

/* Le jeton d'une heure, gardé tant que l'instance Vercel reste chaude : inutile
   d'en redemander un à chaque appel (chaque demande coûte des « crédits »). */
let jetonCache = { valeur: '', jusqua: 0, cle: '' };

async function jetonBeds24(cle) {
  /* Session 49 bis : la mémoire est liée à LA clé qui l'a obtenue — une clé
     remplacée chez Vercel ne doit jamais réutiliser le jeton de l'ancienne. */
  if (jetonCache.valeur && jetonCache.cle === cle && Date.now() < jetonCache.jusqua) return { ok: true, jeton: jetonCache.valeur };
  const rep = await appel('/authentication/token', { refreshToken: cle });
  if (!rep.ok || !rep.j || !rep.j.token) return { ok: false, rep };
  const duree = Math.max(60, (parseInt(rep.j.expiresIn, 10) || 3600) - 120) * 1000;
  jetonCache = { valeur: rep.j.token, jusqua: Date.now() + duree, cle: cle };
  return { ok: true, jeton: rep.j.token };
}

/** Toutes les pages d'une liste Beds24 (`data`), dans la limite de MAX_PAGES. */
async function toutesLesPages(chemin, jeton) {
  let tout = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const sep = chemin.indexOf('?') >= 0 ? '&' : '?';
    const rep = await appel(chemin + sep + 'page=' + page, { token: jeton });
    if (!rep.ok) return { ok: false, rep };
    const data = rep.j && Array.isArray(rep.j.data) ? rep.j.data : [];
    tout = tout.concat(data);
    const suite = rep.j && rep.j.pages && rep.j.pages.nextPageExists;
    if (!suite) break;
  }
  return { ok: true, data: tout };
}

/* --------------------------------------------------------------------------
   ÉCRIRE CHEZ BEDS24 — un message au voyageur (session 49, D-232)
   --------------------------------------------------------------------------
   Une seule écriture existe, et elle est étroite : poster un message dans la
   conversation Airbnb / Booking d'une réservation (ou marquer un message
   « lu »). Rien d'autre n'est jamais écrit chez Beds24 depuis ici : ni prix,
   ni disponibilités, ni réservation. */

/** Un envoi à Beds24 (POST). Rend `{ ok, statut, j }` — jamais d'exception. */
async function poster(chemin, jeton, corps) {
  const t = avecDelai(DELAI_MAX);
  try {
    const r = await fetch(BEDS24 + chemin, {
      method: 'POST', signal: t.signal,
      headers: { accept: 'application/json', 'Content-Type': 'application/json', token: jeton },
      body: JSON.stringify(corps)
    });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    /* Beds24 répond 201 avec une LISTE, une ligne par message, chacune avec son
       propre `success` : un 201 ne suffit pas, il faut lire la ligne (règle 4 —
       on ne coche « parti » que pour ce qui a réellement été accepté). */
    const ligne = Array.isArray(j) ? j[0] : null;
    const ok = r.ok && !!ligne && ligne.success === true;
    return { ok, statut: r.status, j, ligne };
  } catch (e) {
    return { ok: false, statut: 0, j: null, ligne: null };
  } finally {
    t.fin();
  }
}

/** Le refus d'un ENVOI, dit en français. `definitif` : inutile de réessayer seul. */
function refusEnvoi(rep) {
  const ligne = rep.ligne || {};
  const errs = Array.isArray(ligne.errors) ? ligne.errors : [];
  const dit = String((errs[0] && errs[0].message) || (rep.j && !Array.isArray(rep.j) && (rep.j.error || rep.j.message)) || '');
  if (rep.statut === 403 || /scope|permission|not allowed|no access|write/i.test(dit)) {
    return {
      code: 'sans-droit-ecrire', definitif: true,
      erreur: 'La clé Beds24 posée chez Vercel ne donne que le droit de LIRE. Pour écrire aux voyageurs, ' +
        'refaire un code d’invitation chez Beds24 avec « bookings » ET « bookings-personal » en lecture ET écriture, l’échanger dans ' +
        'MAISON WARME et remplacer la clé chez Vercel (§54 du mode d’emploi).'
    };
  }
  /* Session 49 bis, premier essai réel (7/11) : Booking.com filtre le CONTENU
     des messages — un lien internet (même celui du livret) est refusé avec
     « Message content failed to pass security filters », que Beds24 rend
     souvent sous la forme « message could not be sent ». */
  if (/security filter|could not be sent/i.test(dit)) {
    return {
      code: 'filtre-plateforme', definitif: true,
      erreur: 'La plateforme a refusé ce message (filtre de sécurité). Booking.com refuse les liens internet, ' +
        'les numéros de téléphone et les adresses e-mail dans ses messages : retire-les, ou envoie-les par ' +
        'WhatsApp. Beds24 a répondu : « ' + dit.slice(0, 200) + ' ».'
    };
  }
  if (rep.statut === 0 || rep.statut === 429 || rep.statut >= 500 || /credit|limit/i.test(dit)) {
    const r = refusBeds24(rep, 'envoyer');
    return { code: r.code, definitif: false, erreur: r.erreur };
  }
  if (rep.statut === 401) {
    /* Session 49 bis : premier essai réel de Marc, refusé en « clé refusée »
       sans qu'on sache si la clé était mauvaise ou si elle n'avait que le
       droit de lire. La phrase de Beds24 est désormais recopiée (règle 5). */
    const r = refusBeds24(rep, 'envoyer');
    return { code: r.code, definitif: true, erreur: r.erreur };
  }
  return {
    code: 'refus', definitif: true,
    erreur: 'Beds24 n’a pas accepté le message' + (dit ? ' : « ' + dit + ' »' : ' (code ' + rep.statut + ')') +
      '. Le voyageur ne l’a pas reçu.'
  };
}

/* --------------------------------------------------------------------------
   LE ROBOT DES MESSAGES PROGRAMMÉS (session 49, D-233)
   --------------------------------------------------------------------------
   MAISON WARME prépare à l'avance, dans le cahier partagé (table
   `messages_sortants`, script 19), chaque message programmé rempli pour son
   voyageur, avec son heure d'envoi. Ce robot ne compose RIEN : il prend ceux
   dont l'heure est venue et les poste chez Beds24. Toute la mise en forme
   reste dans `app.js` (`remplirVars`), à un seul endroit.

   Qui le réveille : le cahier partagé lui-même, toutes les dix minutes
   (Supabase Cron, script 19), avec le secret du robot ; et le navigateur du
   propriétaire, quand il est ouvert et qu'un message est dû. Les deux peuvent
   tomber en même temps : c'est le cahier qui tranche, en « prenant » chaque
   message dans une seule transaction — un message pris par l'un n'est pas
   rendu à l'autre (`for update skip locked`).

   Trois vérifications avant chaque envoi :
     1. la réservation existe encore chez Beds24 et n'y est pas annulée ;
     2. le même texte n'est pas DÉJÀ dans la conversation (un passage coupé
        après l'envoi et avant la note ne doit pas faire partir un doublon) ;
     3. l'envoi est accepté, ligne lue (voir `poster`).
   Un refus passager (Beds24 occupé) remet le message en file pour le passage
   suivant ; au troisième essai, il est marqué « échec » et l'écran le dit. */
const MAX_PAR_PASSAGE = 4;
const STATUTS_TOUS = '&status=confirmed&status=request&status=new&status=cancelled&status=black&status=inquiry';

async function rpc(nom, corps) {
  const t = avecDelai(DELAI_MAX);
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + nom, {
      method: 'POST', signal: t.signal,
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    return { ok: r.ok, statut: r.status, j };
  } catch (e) {
    return { ok: false, statut: 0, j: null };
  } finally {
    t.fin();
  }
}

/** Le refus du cahier partagé, dit en français : quel script manque, ou quel secret. */
function refusFile(rep) {
  const dit = String((rep.j && (rep.j.message || rep.j.hint)) || '');
  if (rep.statut === 404 || /could not find the function|does not exist/i.test(dit)) {
    return { code: 'sans-script', erreur: 'Le script 19 (messages-beds24) n’est pas encore collé dans Supabase : ' +
      'la file des messages programmés n’existe pas. §54 du mode d’emploi.' };
  }
  if (/secret/i.test(dit)) {
    return { code: 'secret-refuse', erreur: 'Le secret du robot (CRON_SECRET chez Vercel) ne correspond pas à celui ' +
      'du script 19. Les deux doivent être identiques (§35 et §54 du mode d’emploi).' };
  }
  if (rep.statut === 0) return { code: 'injoignable', erreur: 'Le cahier partagé n’a pas répondu à temps.' };
  return { code: 'file', erreur: 'Le cahier partagé a refusé (code ' + rep.statut + ')' + (dit ? ' : « ' + dit + ' »' : '') + '.' };
}

function memeTexte(a, b) {
  const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  return n(a) === n(b);
}

async function traiterUn(m, jeton) {
  const id = parseInt(m.booking_b24, 10);
  if (!id) return { statut: 'echec', erreur: 'Numéro de réservation Beds24 manquant.' };
  if (!String(m.texte || '').trim()) return { statut: 'echec', erreur: 'Message vide.' };

  const b = await appel('/bookings?id=' + id + STATUTS_TOUS, { token: jeton });
  if (!b.ok) return { statut: 'prevu', erreur: refusBeds24(b, 'robot').erreur };
  const resa = b.j && Array.isArray(b.j.data) ? b.j.data[0] : null;
  if (!resa) return { statut: 'annule', erreur: 'Beds24 ne connaît plus cette réservation : rien n’est parti.' };
  if (String(resa.status) === 'cancelled') return { statut: 'annule', erreur: 'Réservation annulée chez Beds24 : rien n’est parti.' };

  const deja = await appel('/bookings/messages?bookingId=' + id + '&source=host&maxAge=90', { token: jeton });
  if (!deja.ok) return { statut: 'prevu', erreur: refusBeds24(deja, 'robot').erreur };
  if ((Array.isArray(deja.j && deja.j.data) ? deja.j.data : []).some((x) => memeTexte(x.message, m.texte))) {
    return { statut: 'envoye', erreur: 'Déjà dans la conversation : pas renvoyé une seconde fois.' };
  }

  const p = await poster('/bookings/messages', jeton, [{ bookingId: id, message: String(m.texte).slice(0, 5000) }]);
  if (p.ok) return { statut: 'envoye', erreur: '' };
  const ref = refusEnvoi(p);
  return { statut: ref.definitif ? 'echec' : 'prevu', erreur: ref.erreur };
}

async function passageRobot(secret) {
  const dus = await rpc('robot_messages_dus', { p_secret: secret, p_max: MAX_PAR_PASSAGE });
  if (!dus.ok) return { statut: 503, corps: refusFile(dus) };
  const j = dus.j || {};
  if (j.actif === false) {
    return { statut: 200, corps: { actif: false, envoyes: 0, texte: 'L’envoi automatique est coupé dans MAISON WARME : rien n’est parti.' } };
  }
  const liste = Array.isArray(j.messages) ? j.messages : [];
  const bilan = { actif: true, pris: liste.length, envoyes: 0, annules: 0, reportes: 0, echecs: 0, details: [] };
  if (!liste.length) return { statut: 200, corps: bilan };

  /* Une panne de clé remet TOUT en file, sans rien perdre ni rien envoyer. */
  const rendre = async (erreur) => {
    for (const m of liste) await rpc('robot_message_fait', { p_secret: secret, p_id: m.id, p_statut: 'prevu', p_erreur: erreur });
  };
  const cle = String(process.env.BEDS24_REFRESH_TOKEN || '').trim();
  if (!cle) {
    const e = 'La clé Beds24 n’est pas posée chez Vercel (BEDS24_REFRESH_TOKEN).';
    await rendre(e);
    return { statut: 503, corps: { code: 'sans-cle', erreur: e } };
  }
  const acces = await jetonBeds24(cle);
  if (!acces.ok) {
    const r = refusBeds24(acces.rep, 'robot');
    await rendre(r.erreur);
    return { statut: 502, corps: r };
  }

  for (const m of liste) {
    const r = await traiterUn(m, acces.jeton);
    await rpc('robot_message_fait', { p_secret: secret, p_id: m.id, p_statut: r.statut, p_erreur: r.erreur || '' });
    if (r.statut === 'envoye') bilan.envoyes++;
    else if (r.statut === 'annule') bilan.annules++;
    else if (r.statut === 'prevu') bilan.reportes++;
    else bilan.echecs++;
    bilan.details.push({ id: m.id, statut: r.statut, erreur: r.erreur || '' });
  }
  return { statut: 200, corps: bilan };
}

/** Le secret du robot, comparé sans laisser deviner sa longueur au chronomètre. */
function bonSecret(donne) {
  const attendu = String(process.env.CRON_SECRET || '');
  if (!attendu || typeof donne !== 'string' || !donne) return false;
  const a = Buffer.from(attendu), b = Buffer.from(donne);
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

/* --------------------------------------------------------------------------
   Présenter une réservation — SEULEMENT pour l'aperçu
   --------------------------------------------------------------------------
   Rien de ceci n'est encore la traduction vers MAISON WARME : c'est ce qu'on
   lira ensemble avant de l'écrire (D-152). On garde les champs bruts utiles,
   sans rien inventer (règle 5) : ce que Beds24 ne dit pas reste vide. */
function presenter(b) {
  const n = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    id: b.id,
    propertyId: b.propertyId,
    roomId: b.roomId,
    statut: n(b.status),
    arrivee: n(b.arrival),
    depart: n(b.departure),
    adultes: parseInt(b.numAdult, 10) || 0,
    enfants: parseInt(b.numChild, 10) || 0,
    prenom: n(b.firstName),
    nom: n(b.lastName),
    email: n(b.email),
    telephone: n(b.mobile || b.phone),
    heureArrivee: n(b.arrivalTime),
    prix: b.price === null || b.price === undefined ? null : Number(b.price),
    canal: n(b.channel),
    referer: n(b.referer),
    reference: n(b.apiReference),
    reserveLe: n(b.bookingTime),
    modifieLe: n(b.modifiedTime),
    annuleLe: n(b.cancelTime),
    aUnMessage: !!(b.comments || b.message || b.notes)
  };
}

/* --------------------------------------------------------------------------
   Le programme
   -------------------------------------------------------------------------- */

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ erreur: 'Cette adresse ne répond qu’aux demandes de MAISON WARME.' });
  }
  const corps = lireCorps(req);
  if (!corps) return res.status(400).json({ erreur: 'La demande est illisible.' });

  /* --- Le robot, réveillé par le cahier partagé (D-233) -------------------
     Pas de compte connecté ici : c'est le secret du robot qui ouvre la porte,
     et il n'ouvre que celle-ci. Sans `CRON_SECRET` chez Vercel, refus. */
  if (corps.action === 'robot' && !corps.jeton) {
    const entete = String(req.headers && (req.headers.authorization || '') || '').replace(/^Bearer\s+/i, '');
    const donne = typeof corps.secret === 'string' && corps.secret ? corps.secret : entete;
    if (!String(process.env.CRON_SECRET || '')) {
      return res.status(503).json({ code: 'sans-secret', erreur: 'Le secret du robot (CRON_SECRET) n’est pas posé chez Vercel (§35 du mode d’emploi).' });
    }
    if (!bonSecret(donne)) return res.status(401).json({ erreur: 'Secret du robot absent ou faux.' });
    const p = await passageRobot(process.env.CRON_SECRET);
    return res.status(p.statut).json(p.corps);
  }

  /* --- Verrous : un compte connecté, et c'est le propriétaire ------------ */
  const jeton = typeof corps.jeton === 'string' ? corps.jeton : '';
  if (!jeton) {
    return res.status(401).json({ erreur: 'La connexion à MAISON WARME a été perdue. Recharger la page et se reconnecter.' });
  }
  const qui = await quiEstCe(jeton);
  if (!qui) {
    return res.status(401).json({ erreur: 'La connexion a expiré. Recharger la page, se reconnecter, puis réessayer.' });
  }
  const role = await sonRole(jeton, qui.id);
  if (role !== 'owner' && role !== 'admin') {
    return res.status(403).json({ erreur: 'Seul le compte du propriétaire peut parler à Beds24.' });
  }

  const action = String(corps.action || '');
  const cle = String(process.env.BEDS24_REFRESH_TOKEN || '').trim();

  /* --- robot, demandé par le propriétaire connecté -------------------------
     Même passage que celui du réveil : MAISON WARME ouvert le déclenche dès
     qu'un message est dû, sans attendre les dix minutes. Le secret reste chez
     Vercel ; le navigateur ne le connaît pas. */
  if (action === 'robot') {
    if (!String(process.env.CRON_SECRET || '')) {
      return res.status(503).json({ code: 'sans-secret', erreur: 'Le secret du robot (CRON_SECRET) n’est pas posé chez Vercel : ' +
        'les messages programmés ne peuvent pas partir tout seuls (§35 et §54 du mode d’emploi).' });
    }
    const p = await passageRobot(process.env.CRON_SECRET);
    return res.status(p.statut).json(p.corps);
  }

  /* --- inviter : code d'invitation → clé permanente ---------------------- */
  if (action === 'inviter') {
    const code = String(corps.code || '').trim();
    if (!code) return res.status(400).json({ erreur: 'Coller d’abord le code d’invitation généré chez Beds24.' });
    if (code.length > 2000) return res.status(400).json({ erreur: 'Ce code est anormalement long : vérifier ce qui a été collé.' });
    const rep = await appel('/authentication/setup', { code: code, deviceName: 'MAISON WARME' });
    if (!rep.ok || !rep.j || !rep.j.refreshToken) {
      return res.status(502).json(refusBeds24(rep, 'inviter'));
    }
    /* On ne garde rien ici : la clé part au navigateur du propriétaire, une
       fois, pour qu'il la colle dans le coffre de Vercel. */
    return res.status(200).json({ refreshToken: rep.j.refreshToken, dejaPosee: !!cle });
  }

  /* --- les autres demandes supposent la clé posée ------------------------ */
  if (!cle) {
    return res.status(503).json({
      code: 'sans-cle',
      erreur: 'Beds24 n’est pas encore relié : la clé permanente n’a pas été posée chez Vercel ' +
        '(BEDS24_REFRESH_TOKEN). Commencer par l’étape « code d’invitation » (§53 du mode d’emploi).'
    });
  }
  const acces = await jetonBeds24(cle);
  if (!acces.ok) return res.status(502).json(refusBeds24(acces.rep, 'etat'));

  if (action === 'etat') {
    const details = await appel('/authentication/details', { token: acces.jeton });
    const props = await toutesLesPages('/properties?includeAllRooms=true', acces.jeton);
    if (!props.ok) return res.status(502).json(refusBeds24(props.rep, 'etat'));
    /* Session 49 bis : Beds24 range les droits sous `token.scopes` (apiV2.yaml),
       pas à la racine — d'où « non précisés » jusqu'ici. Les deux sont lus. */
    const dj = (details.ok && details.j) || {};
    const scopes = Array.isArray(dj.scopes) ? dj.scopes : (dj.token && Array.isArray(dj.token.scopes) ? dj.token.scopes : []);
    return res.status(200).json({
      relie: true,
      droits: scopes,
      /* Session 49 bis : si les droits restent introuvables, ce que Beds24 dit
         de la clé, tel quel (aucun secret dedans : propriétaire, dates, droits). */
      droitsBrut: scopes.length ? '' : (details.ok ? JSON.stringify(dj).slice(0, 600) : 'détails refusés, code ' + details.statut),
      logements: props.data.map((p) => ({
        id: p.id,
        nom: String(p.name || ''),
        chambres: (Array.isArray(p.roomTypes) ? p.roomTypes : []).map((r) => ({ id: r.id, nom: String(r.name || '') }))
      }))
    });
  }

  if (action === 'sejours') {
    /* Du jour J moins 30 à J plus 365, annulés compris : l'aperçu doit montrer
       aussi ce que Beds24 dit des annulations, c'est un de ses apports. */
    const auj = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const depuis = iso(new Date(auj.getTime() - 30 * 86400000));
    const jusqua = iso(new Date(auj.getTime() + 365 * 86400000));
    const chemin = '/bookings?departureFrom=' + depuis + '&arrivalTo=' + jusqua +
      '&status=confirmed&status=request&status=new&status=cancelled&status=black';
    const l = await toutesLesPages(chemin, acces.jeton);
    if (!l.ok) return res.status(502).json(refusBeds24(l.rep, 'sejours'));
    return res.status(200).json({ depuis, jusqua, sejours: l.data.map(presenter) });
  }

  /* --- messages : la messagerie Airbnb / Booking, en LECTURE (D-231) ------
     Les 120 derniers jours, tous logements. Les notes internes de l'hôte ne
     sont pas des messages au voyageur : écartées. Rien n'est marqué « lu »
     chez Beds24 — lire ici ne change rien là-bas. */
  if (action === 'messages') {
    const l = await toutesLesPages('/bookings/messages?maxAge=120', acces.jeton);
    if (!l.ok) return res.status(502).json(refusBeds24(l.rep, 'messages'));
    const garde = { guest: 1, host: 1, system: 1 };
    return res.status(200).json({
      messages: l.data.filter((m) => m && garde[m.source]).map((m) => ({
        id: m.id,
        bookingId: m.bookingId,
        roomId: m.roomId,
        propertyId: m.propertyId,
        quand: String(m.time || ''),
        de: m.source,
        lu: m.read === true,
        texte: String(m.message || '').slice(0, 5000),
        piece: m.attachmentName ? String(m.attachmentName) : ''
      }))
    });
  }

  /* --- envoyer : un message écrit par le propriétaire (D-232) -------------
     Il l'a relu dans l'aperçu et confirmé : on le poste tel quel. */
  if (action === 'envoyer') {
    const bookingId = parseInt(corps.bookingId, 10);
    const texte = String(corps.texte || '').trim();
    if (!bookingId) return res.status(400).json({ erreur: 'Ce séjour n’est pas relié à une réservation Beds24 : impossible d’y écrire d’ici.' });
    if (!texte) return res.status(400).json({ erreur: 'Le message est vide.' });
    if (texte.length > 5000) return res.status(400).json({ erreur: 'Le message est trop long (5 000 caractères au plus).' });
    const p = await poster('/bookings/messages', acces.jeton, [{ bookingId: bookingId, message: texte }]);
    if (!p.ok) return res.status(502).json(refusEnvoi(p));
    return res.status(200).json({ envoye: true, id: (p.ligne && p.ligne.new && p.ligne.new.id) || null });
  }

  /* --- lu : les messages du voyageur ouverts dans MAISON WARME ------------
     Sans ce geste, « non lu » resterait affiché pour toujours : c'est Beds24
     qui garde cette information. Facultatif : un refus ne bloque rien. */
  if (action === 'lu') {
    const ids = (Array.isArray(corps.ids) ? corps.ids : []).map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 50);
    if (!ids.length) return res.status(200).json({ lus: 0 });
    const p = await poster('/bookings/messages', acces.jeton, ids.map((id) => ({ id: id, read: true })));
    if (!p.ok) return res.status(502).json(refusEnvoi(p));
    return res.status(200).json({ lus: ids.length });
  }

  return res.status(400).json({ erreur: 'Demande inconnue : « ' + action + ' ».' });
};
