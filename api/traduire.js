/* =============================================================================
   MAISON WARME — le traducteur : le livret d'accueil en anglais (D-227)
   =============================================================================

   POURQUOI CE FICHIER EXISTE

   Le livret du voyageur est bilingue depuis la session 12 (D-57) : tous ses
   textes FIXES sont traduits une fois pour toutes, mais les textes écrits par
   le propriétaire (mot d'accueil, blocs des rubriques) n'ont de version
   anglaise que s'il l'écrit lui-même. Le 5 novembre 2026, Marc a demandé s'il
   existait une traduction automatique.

   Un navigateur ne peut pas la faire seul : il faut un service de traduction,
   et ce service demande une clé secrète — or toute clé posée dans `config.js`
   serait lisible par n'importe qui. C'est exactement le cas du facteur
   (`api/mail.js`, D-150), et la réponse est la même : un tout petit programme
   qui tourne **chez Vercel**, sur la même adresse que le site
   (`/api/traduire`), avec la clé dans une **variable d'environnement** — un
   coffre chez Vercel, jamais dans le dépôt, jamais dans le navigateur
   (règle 2 du document de projet).

   Le service retenu est **DeepL**, offre « API Free » : gratuite jusqu'à
   500 000 caractères par mois (un livret entier en fait quelques milliers),
   et la meilleure en français. Langue d'arrivée : anglais britannique
   (`EN-GB`), celui des voyageurs européens.

   CE QUE CE FICHIER NE FAIT PAS : il n'écrit rien dans le livret. Il rend des
   traductions à l'application, qui ne remplit que les cases anglaises VIDES et
   les garde cachées aux voyageurs tant que le propriétaire ne les a pas
   relues (app.js, `livret-traduire`). Une traduction automatique se trompe
   volontiers sur une consigne pratique (« la clé est sous le pot » …) : c'est
   pour cela que la session 12 l'avait écartée, et c'est pour cela qu'elle
   passe ici par une relecture.

   AUCUNE DÉPENDANCE, AUCUNE ÉTAPE DE CONSTRUCTION, et `module.exports` plutôt
   qu'`export default` : mêmes contraintes que `api/ical.js` et `api/mail.js`.

   -----------------------------------------------------------------------------
   CE QUI EMPÊCHE CE FICHIER DE TRADUIRE POUR TOUT LE MONDE

   L'adresse `/api/traduire` est publique. Sans verrou, n'importe qui pourrait
   y faire traduire ses propres textes et épuiser en une heure le quota gratuit
   du mois. Les trois mêmes verrous que le facteur :

     1. **Seul un compte connecté est écouté** : l'appel porte le jeton de
        session Supabase, que Supabase lui-même vérifie.
     2. **Seul le propriétaire** (`profiles.role` = `owner`) — ou l'aide qu'il
        a nommée administrateur (`admin`, D-194) — peut faire traduire.
     3. **Des quantités raisonnables** : 50 textes par appel (la limite de
        DeepL), 5 000 caractères par texte, 30 000 par appel.

   -----------------------------------------------------------------------------
   CE QU'IL FAUT AVOIR FAIT POUR QUE ÇA MARCHE (une seule fois)

   Chez Vercel → le projet `warme-house` → Settings → Environment Variables :

     · `DEEPL_API_KEY` = la clé donnée par DeepL (compte « API Free » ; elle
                         finit par `:fx`). Mode d'emploi : §52 de
                         `docs/02-MODES-EMPLOI.md`.

   Puis **Redeploy**, sans quoi Vercel ne la voit pas.

   Tant qu'aucune clé n'est posée, ce programme répond une phrase en français
   qui **dit exactement ce qui manque** (règle 4 : une action refusée doit se
   voir ; règle 13 : un bouton qui a l'air de marcher est pire qu'un bouton
   absent).
   ========================================================================== */

/* L'adresse du cahier partagé et sa clé publique : les deux mêmes valeurs que
   `config.js` et `api/mail.js`, publiques par conception. Les variables
   d'environnement, si elles existent, l'emportent.
   ⚠️ Ne JAMAIS mettre ici la clé « service_role » (règle 2, D-60). */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uwuuygcbpoppdzcummal.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_C5n_II_vveay2TddJ5FlcA_K_1XCq_J';

/* Les deux portes de DeepL. Une clé « API Free » finit par `:fx` et n'est
   acceptée QUE par la première ; une clé payante, que par la seconde. Se
   tromper de porte rend un refus 403 qui ressemble à une clé fausse : on
   choisit donc la porte d'après la clé, pour que le jour où l'offre change,
   rien ne casse. */
const DEEPL_GRATUIT = 'https://api-free.deepl.com/v2/translate';
const DEEPL_PAYANT = 'https://api.deepl.com/v2/translate';

const MAX_TEXTES = 50;
const MAX_TEXTE = 5000;
const MAX_TOTAL = 30000;
const DELAI_MAX = 20000;

/* Une phrase de contexte, que DeepL lit pour choisir ses mots sans la
   traduire ni la compter dans le quota : « Arrivée autonome » ou « Poubelles »
   ne se traduisent pas pareil hors d'une location de vacances. */
const CONTEXTE = 'Livret d’accueil remis aux voyageurs d’une location de vacances en France : ' +
  'consignes d’arrivée et de départ, équipements du logement, adresses du quartier.';

/* --------------------------------------------------------------------------
   Petites aides — les mêmes que `api/mail.js`
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

/* --------------------------------------------------------------------------
   Verrous 1 et 2 : qui appelle, et a-t-il le droit ?
   -------------------------------------------------------------------------- */

/** Rend `{ id }` si le jeton est valable, sinon `null`. */
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

/** Le rôle inscrit sur sa fiche : 'owner', 'admin', 'provider', ou '' si illisible. */
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
   Les refus de DeepL, dits en français
   --------------------------------------------------------------------------
   NE JAMAIS RECOPIER UN MESSAGE QUE PERSONNE NE PEUT COMPRENDRE (règle 5,
   D-134). DeepL répond en anglais et par des codes. Ceux qu'on rencontrera
   pour de vrai ont chacun un geste précis ; pour les autres, on garde la
   phrase d'origine à la suite, pour qu'elle reste recopiable. */
function traduireRefus(code, dit) {
  const brut = String(dit || '').toLowerCase();

  if (code === 401 || code === 403 || /auth|wrong endpoint|invalid key/.test(brut)) {
    return {
      code: 'cle-refusee',
      erreur: 'DeepL refuse la clé de traduction : elle a été mal recopiée chez Vercel, ou elle a ' +
        'été supprimée du compte DeepL. Refaire l’étape « coller la clé chez Vercel » du mode ' +
        'd’emploi (§52).'
    };
  }
  if (code === 456 || /quota/.test(brut)) {
    return {
      code: 'quota',
      erreur: 'Le quota gratuit de DeepL est épuisé pour ce mois-ci (500 000 caractères). Il se ' +
        'renouvelle le mois prochain ; d’ici là, les cases anglaises s’écrivent à la main.'
    };
  }
  if (code === 429 || code === 529 || /too many/.test(brut)) {
    return {
      code: 'occupe',
      erreur: 'DeepL reçoit trop de demandes en ce moment. Réessayer dans une minute.'
    };
  }
  if (code === 413) {
    return {
      code: 'trop-long',
      erreur: 'Trop de texte d’un coup pour DeepL. Traduire rubrique par rubrique, ou raccourcir ' +
        'le bloc le plus long.'
    };
  }
  if (code >= 500) {
    return {
      code: 'indisponible',
      erreur: 'DeepL est momentanément indisponible (code ' + code + '). Réessayer plus tard : ' +
        'rien n’a été modifié dans le livret.'
    };
  }
  return {
    code: 'refus',
    erreur: 'DeepL a refusé la traduction (code ' + code + ')' + (dit ? ' : « ' + dit + ' »' : '') + '.'
  };
}

/* --------------------------------------------------------------------------
   Le programme
   -------------------------------------------------------------------------- */

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ erreur: 'Cette adresse ne répond qu’à une demande de traduction.' });
  }

  const corps = lireCorps(req);
  if (!corps) {
    return res.status(400).json({ erreur: 'La demande de traduction est illisible.' });
  }

  /* --- Verrou 1 : un compte connecté ------------------------------------- */
  const jeton = typeof corps.jeton === 'string' ? corps.jeton : '';
  if (!jeton) {
    return res.status(401).json({
      erreur: 'La connexion à MAISON WARME a été perdue. Recharger la page et se reconnecter.'
    });
  }
  const qui = await quiEstCe(jeton);
  if (!qui) {
    return res.status(401).json({
      erreur: 'La connexion a expiré. Recharger la page, se reconnecter, puis relancer la traduction.'
    });
  }

  /* --- Verrou 2 : et c'est bien le propriétaire -------------------------- */
  const role = await sonRole(jeton, qui.id);
  if (role !== 'owner' && role !== 'admin') {
    return res.status(403).json({
      erreur: 'Seul le compte du propriétaire peut faire traduire le livret.'
    });
  }

  /* --- Y a-t-il un service de traduction branché ? ----------------------- */
  const cle = String(process.env.DEEPL_API_KEY || '').trim();
  if (!cle) {
    return res.status(503).json({
      erreur: 'La traduction automatique n’est pas encore branchée : la clé DeepL n’a pas été ' +
        'posée chez Vercel. C’est la seule chose qui manque — mode d’emploi §52, « Traduire le ' +
        'livret en anglais ». En attendant, les cases anglaises s’écrivent à la main.',
      code: 'sans-cle'
    });
  }

  /* --- Verrou 3 : des quantités raisonnables ----------------------------- */
  const textes = Array.isArray(corps.textes) ? corps.textes : [];
  if (!textes.length) {
    return res.status(400).json({ erreur: 'Il n’y a aucun texte à traduire dans cette demande.' });
  }
  if (textes.length > MAX_TEXTES) {
    return res.status(400).json({
      erreur: 'Trop de textes d’un coup (' + textes.length + ', maximum ' + MAX_TEXTES + ').'
    });
  }
  let total = 0;
  for (const x of textes) {
    if (typeof x !== 'string' || !x.trim()) {
      return res.status(400).json({ erreur: 'Un des textes à traduire est vide.' });
    }
    if (x.length > MAX_TEXTE) {
      return res.status(400).json({
        erreur: 'Un bloc du livret est trop long pour être traduit d’un coup (' + x.length +
          ' caractères, maximum ' + MAX_TEXTE + '). Le couper en deux blocs.'
      });
    }
    total += x.length;
  }
  if (total > MAX_TOTAL) {
    return res.status(400).json({
      erreur: 'Trop de texte d’un coup (' + total + ' caractères, maximum ' + MAX_TOTAL + ').'
    });
  }

  /* --- On demande à DeepL ------------------------------------------------ */
  const porte = /:fx$/.test(cle) ? DEEPL_GRATUIT : DEEPL_PAYANT;
  const t = avecDelai(DELAI_MAX);
  let r;
  try {
    r = await fetch(porte, {
      method: 'POST',
      signal: t.signal,
      headers: { Authorization: 'DeepL-Auth-Key ' + cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: textes,
        source_lang: 'FR',
        target_lang: 'EN-GB',
        preserve_formatting: true,
        context: CONTEXTE
      })
    });
  } catch (e) {
    t.fin();
    return res.status(504).json({
      erreur: 'DeepL n’a pas répondu à temps. Réessayer dans un instant : rien n’a été modifié ' +
        'dans le livret.',
      code: 'delai'
    });
  }
  t.fin();

  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }

  if (!r.ok) {
    const refus = traduireRefus(r.status, (j && j.message) || '');
    return res.status(502).json(refus);
  }

  /* UNE RÉPONSE INCOMPLÈTE N'EST PAS UNE TRADUCTION. DeepL rend les textes
     dans l'ordre où on les a donnés ; si le compte n'y est pas, on ne sait
     plus quelle traduction va dans quelle case — on refuse tout plutôt que
     d'en mettre une au mauvais endroit (règle 15 : ne jamais deviner). */
  const liste = j && Array.isArray(j.translations) ? j.translations : null;
  if (!liste || liste.length !== textes.length) {
    return res.status(502).json({
      erreur: 'La réponse de DeepL est incomplète : rien n’a été modifié dans le livret. Réessayer.',
      code: 'reponse-incomplete'
    });
  }

  return res.status(200).json({
    service: 'DeepL',
    caracteres: total,
    traductions: liste.map((x) => String((x && x.text) || ''))
  });
};
