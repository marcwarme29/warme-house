/* =============================================================================
   MAISON WARME — le releveur de calendriers iCal
   =============================================================================

   POURQUOI CE FICHIER EXISTE

   Un navigateur n'a pas le droit d'aller lire une page hébergée sur un autre
   site que celui qu'il affiche : c'est la règle CORS, elle protège l'internet
   entier et elle ne se contourne pas depuis le navigateur. C'est pour cela que
   les liens iCal collés par le propriétaire étaient, depuis la session 5,
   « mis de côté et rien de plus » (D-42).

   Ce fichier est un très petit programme qui, lui, tourne CHEZ VERCEL — donc
   pas dans un navigateur, donc pas soumis à cette règle. Il va chercher le
   calendrier et le rend à l'application.

   IL EST SUR LA MÊME ADRESSE QUE LE SITE (`/api/ical`). Il n'y a donc aucun
   CORS à régler, aucun compte à créer, aucun abonnement : Vercel exécute tout
   fichier placé dans `api/`, et la publication reste le `git push` habituel.

   AUCUNE DÉPENDANCE, AUCUNE ÉTAPE DE CONSTRUCTION : on n'utilise que ce que
   Node fournit déjà (`fetch`, `AbortController`). C'est la même règle que pour
   le reste du projet — le poste du propriétaire n'a ni node ni npm.

   ⚠️ ÉCRIT EN `module.exports`, ET PAS EN `export default`. Sans fichier
   `package.json` portant `"type": "module"`, Vercel lit un `.js` comme du
   CommonJS : un `export default` provoquerait une erreur au démarrage de la
   fonction — c'est-à-dire **au premier relevé**, pas à la publication. Et
   ajouter un `package.json` pour contourner cela ferait croire à Vercel qu'il
   y a un projet à construire, alors que le site est volontairement fait de
   fichiers statiques sans étape de construction.

   CE QUE CE PROGRAMME NE FAIT PAS, ET POURQUOI
   Il ne relaie **pas** n'importe quelle adresse. Un relais ouvert à tout vent
   est une porte offerte : n'importe qui pourrait s'en servir pour faire lire,
   depuis nos serveurs, des adresses internes ou interdites (c'est ce qu'on
   appelle une faille SSRF). On n'accepte donc que les hébergeurs de
   calendriers connus, listés ci-dessous, et rien d'autre. Si le propriétaire
   utilise une plateforme absente de cette liste, le message le dit en
   nommant l'hébergeur refusé : il suffira de l'ajouter ici.
   ========================================================================== */

/* Les hébergeurs de calendriers qu'on accepte de relever. On compare sur le
   nom de domaine et ses sous-domaines — jamais sur un simple « contient »,
   qui laisserait passer `airbnb.fr.attaquant.com`. */
const HEBERGEURS = [
  'airbnb.com', 'airbnb.fr', 'airbnb.co.uk', 'airbnb.ca', 'airbnb.be', 'airbnb.ch',
  'booking.com',
  'vrbo.com', 'abritel.fr', 'homeaway.com', 'homeaway.fr',
  'expedia.com', 'expedia.fr',
  'tripadvisor.com', 'holidu.fr', 'gites-de-france.com',
  'google.com', 'googleusercontent.com',       // Google Agenda
  'beds24.com', 'smoobu.com', 'lodgify.com', 'hostaway.com'
];

const TAILLE_MAX = 2 * 1024 * 1024;            // 2 Mo : un calendrier honnête pèse quelques Ko
const DELAI_MAX = 12000;                       // 12 s, au-delà on considère que l'hôte ne répond pas

function hebergeurAutorise(hote) {
  const h = String(hote || '').toLowerCase();
  return HEBERGEURS.some((d) => h === d || h.endsWith('.' + d));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const brut = (req.query && req.query.url) || '';
  if (!brut) {
    return res.status(400).json({ erreur: 'Aucun lien à relever n’a été fourni.' });
  }

  let cible;
  try {
    cible = new URL(String(brut));
  } catch (e) {
    return res.status(400).json({ erreur: 'Ce lien n’est pas une adresse valide.' });
  }

  // `webcal://` est ce que copient certaines plateformes : c'est du https déguisé.
  if (cible.protocol === 'webcal:') cible.protocol = 'https:';

  if (cible.protocol !== 'https:' && cible.protocol !== 'http:') {
    return res.status(400).json({ erreur: 'Seules les adresses commençant par https sont acceptées.' });
  }

  if (!hebergeurAutorise(cible.hostname)) {
    return res.status(403).json({
      erreur: 'Ce site n’est pas dans la liste des calendriers autorisés : « ' + cible.hostname +
        ' ». Si c’est bien la plateforme que tu utilises, signale-le : il suffit de l’ajouter.'
    });
  }

  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), DELAI_MAX);

  try {
    const r = await fetch(cible.toString(), {
      signal: stop.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'MaisonWarme/1.0 (calendrier)', 'Accept': 'text/calendar, text/plain, */*' }
    });

    if (!r.ok) {
      return res.status(502).json({
        erreur: 'La plateforme a refusé de rendre ce calendrier (code ' + r.status + '). ' +
          'Le lien a peut-être été régénéré de son côté : recopie-le depuis Airbnb ou Booking.'
      });
    }

    const texte = await r.text();

    if (texte.length > TAILLE_MAX) {
      return res.status(502).json({ erreur: 'Ce calendrier est anormalement gros : il n’a pas été relevé.' });
    }

    /* On vérifie que c'est bien un calendrier, et pas une page d'erreur en
       HTML — les plateformes en rendent volontiers une, avec un code 200,
       quand le lien a expiré. Sans ce contrôle, on annoncerait « 0 séjour
       trouvé » là où il faut dire « ce lien ne marche plus ». */
    if (texte.indexOf('BEGIN:VCALENDAR') < 0) {
      return res.status(502).json({
        erreur: 'Ce lien ne rend pas un calendrier. Il a probablement expiré ou été régénéré : ' +
          'recopie-le depuis la plateforme.'
      });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(texte);
  } catch (e) {
    const abandon = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return res.status(504).json({
      erreur: abandon
        ? 'La plateforme n’a pas répondu dans les temps. Réessaie dans un instant.'
        : 'Le calendrier n’a pas pu être relevé : ' + ((e && e.message) || 'raison inconnue') + '.'
    });
  } finally {
    clearTimeout(minuteur);
  }
};
