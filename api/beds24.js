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

   Trois demandes, toutes réservées au propriétaire (ou à son administrateur) :

     · `etat`      — la clé est-elle posée ? Beds24 l'accepte-t-il ? Quels
                     logements et quelles chambres voit-il ? Quels droits ?
     · `inviter`   — échange le « code d'invitation » que Marc génère chez
                     Beds24 (il périme vite) contre la clé permanente, que Marc
                     colle ensuite chez Vercel. Rien n'est gardé ici.
     · `sejours`   — les réservations que Beds24 connaît, en lecture seule,
                     présentées simplement, pour l'aperçu.

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
          '30 jours sans servir). Refaire l’étape « code d’invitation » du mode d’emploi (§53).'
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
let jetonCache = { valeur: '', jusqua: 0 };

async function jetonBeds24(cle) {
  if (jetonCache.valeur && Date.now() < jetonCache.jusqua) return { ok: true, jeton: jetonCache.valeur };
  const rep = await appel('/authentication/token', { refreshToken: cle });
  if (!rep.ok || !rep.j || !rep.j.token) return { ok: false, rep };
  const duree = Math.max(60, (parseInt(rep.j.expiresIn, 10) || 3600) - 120) * 1000;
  jetonCache = { valeur: rep.j.token, jusqua: Date.now() + duree };
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
    const scopes = details.ok && details.j && Array.isArray(details.j.scopes) ? details.j.scopes : [];
    return res.status(200).json({
      relie: true,
      droits: scopes,
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

  return res.status(400).json({ erreur: 'Demande inconnue : « ' + action + ' ».' });
};
