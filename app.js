/* ==========================================================================
   MAISON WARME — application de gestion locative
   Port du prototype « WARME House.dc.html » en page web autonome.
   Aucune dépendance, aucune étape de construction : 3 fichiers statiques.

   Sommaire
     1. Données de référence
     2. État, sauvegarde locale
     3. Utilitaires
     4. Routage (adresses en #/…)
     5. Vues prestataire
     6. Vues propriétaire
     7. Actions
     8. Rendu et démarrage
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. Données de référence

   Il n'y a PLUS de données de démonstration ici (session 14) : ni logement
   inventé, ni voyageur inventé, ni prestataire inventé. L'application démarre
   vide et se remplit de deux façons seulement — ce que le propriétaire saisit,
   et ce que le grand cahier partagé lui rend.
   Ce qui reste ci-dessous est ce qui n'appartient à personne en particulier :
   la palette, les prestations proposées par défaut, la liste des articles de
   stock, les rubriques du livret et leurs traductions.
   ========================================================================== */

var C = { terracotta: '#C75B39', vert: '#2F8F6B', ambre: '#D99A2B', bleu: '#3E7FA8', ink: '#241E1A' };

/* La vraie date du jour. Le prototype travaillait sur une date figée au
   30 juillet 2026 : c'était le propre de la démonstration, et avec de vraies
   réservations cela décalait tout. */
function isoDate(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

var TODAY = isoDate(new Date());
var TODAY_LABEL = new Date().toLocaleDateString('fr-FR',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
var CURRENT_MONTH = TODAY.slice(0, 7);
var MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
var MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

var PROPS = [];

/* Prestations : liste commune à tous les biens (nom + durée réglables).
   Le tarif, lui, reste propre à chaque bien — voir state.tariffs. */
var SERVICES = [
  { key: 'menage', label: 'Ménage après séjour', duration: '≈ 2 h' },
  { key: 'menage_jardin', label: 'Ménage + extérieur', duration: '≈ 3 h' },
  { key: 'stock', label: 'Réapprovisionnement', duration: '≈ 45 min' },
  { key: 'maintenance', label: 'Petite réparation', duration: '≈ 1 h' }
];

var PLATS = {
  'Airbnb': { bg: '#F7E7DF', fg: '#B04A26', color: C.terracotta },
  'Booking.com': { bg: '#E4EDF4', fg: '#2F6C93', color: C.bleu },
  'Direct': { bg: '#E3F0E9', fg: '#227052', color: C.vert }
};

/* D'où vient une réservation. Toutes suivent le même format (voir normaliserResa) :
   c'est ce qui permettra de brancher Beds24 sans réécrire les écrans. */
var SOURCES = {
  manuel: { label: 'Saisie manuelle', court: 'Manuel', color: '#8A6A4F', bg: '#EFE7DA', fg: '#6B5138' },
  ical: { label: 'Lien iCal', court: 'iCal', color: C.vert, bg: '#E3F0E9', fg: '#227052' },
  beds24: { label: 'Beds24', court: 'Beds24', color: '#7A6BA8', bg: '#EAE6F4', fg: '#5B4E85' }
};

/* Ce que chaque connecteur sait faire aujourd'hui. `direct` = appelable depuis
   le navigateur ; les deux sont à false, d'où la phase serveur (voir D-42). */
var CONNECTEURS = [
  {
    key: 'ical', label: 'Liens iCal (Airbnb, Booking.com)', direct: false,
    besoin: 'Le navigateur refuse de lire un calendrier hébergé ailleurs (règle de sécurité CORS). ' +
      'Il faut un serveur qui lise les liens à intervalle régulier.',
    apporte: 'Les dates occupées. Le nom du voyageur et le montant n’y figurent pas toujours.'
  },
  {
    key: 'beds24', label: 'Beds24 (toutes plateformes réunies)', direct: false,
    besoin: 'Une clé secrète, qui ne doit jamais se trouver dans le code d’une page publique. ' +
      'Elle vivra sur le serveur, jamais dans ce navigateur.',
    apporte: 'Réservations complètes : voyageur, montant, plateforme, statut, annulations, et les messages.'
  }
];

/* Le champ `tel4` reproduit fidèlement la réalité des flux iCal :
   **Airbnb est la seule plateforme à transmettre les 4 derniers chiffres du
   téléphone** (dans le DESCRIPTION de l'événement, depuis décembre 2019).
   Booking.com n'envoie rien d'exploitable — ces séjours-là passeront donc par
   la voie B de la porte d'entrée (D-47). Une réservation en direct porte le
   numéro parce que le propriétaire l'a lui-même saisi. */
var RESAS = {};

/* `props` = biens sur lesquels le prestataire a le droit de se positionner. */
/* Deux métiers cohabitent (voir D-39) :
     'menage' — prend les missions, exécute la checklist, relève les stocks ;
     'cles'   — remet les clés au voyageur : il ne voit que le calendrier des
                logements confiés, avec le nom du voyageur. Aucune mission,
                aucune rémunération dans l'application. */
var AGENT_KINDS = [
  { key: 'menage', label: 'Ménage & prestations', short: 'Ménage',
    hint: 'Prend les missions, fait la checklist, relève les stocks et suit ses gains.' },
  { key: 'cles', label: 'Remise des clés', short: 'Clés',
    hint: 'Voit seulement le calendrier des logements confiés : arrivées, départs, nom du voyageur.' }
];

/* Les prestataires sont créés par le propriétaire, puis invités par lien
   (§19.8). `services` retient les prestations que la personne fait réellement
   (D-53) : une femme de ménage ne verra jamais les missions de maintenance. */
var AGENTS = [];

/* Palette d'identité proposée à la création d'un bien ou d'un prestataire. */
var PALETTE = [
  { color: C.terracotta, tint: '#F7E7DF', fg: '#B04A26' },
  { color: C.bleu, tint: '#E4EDF4', fg: '#2F6C93' },
  { color: C.vert, tint: '#E3F0E9', fg: '#227052' },
  { color: C.ambre, tint: '#F7EEDC', fg: '#996B12' },
  { color: '#8A6A4F', tint: '#EFE7DA', fg: '#6B5138' },
  { color: '#7A6BA8', tint: '#EAE6F4', fg: '#5B4E85' }
];

/* Les six derniers mois, à partir d'aujourd'hui : c'est ce qui alimente le
   sélecteur de mois des gains et de la paie. Aucun mois n'est « déjà payé » —
   ce qui est versé se coche dans l'application (state.payouts). */
function moisRecents(n) {
  var out = [], auj = new Date();
  for (var i = 0; i < n; i++) {
    var m = new Date(auj.getFullYear(), auj.getMonth() - i, 1);
    var suivant = new Date(auj.getFullYear(), auj.getMonth() - i + 1, 5);
    out.push({
      key: isoDate(m).slice(0, 7),
      label: MOIS_LONGS[m.getMonth()].charAt(0).toUpperCase() + MOIS_LONGS[m.getMonth()].slice(1) + ' ' + m.getFullYear(),
      paid: false,
      payNote: 'Versement prévu le 5 ' + MOIS_LONGS[suivant.getMonth()]
    });
  }
  return out;
}

var MONTHS = moisRecents(6);

/* L'historique de paie des mois passés. Vide : il se remplit tout seul, mission
   terminée après mission terminée (state.done). */
var HISTORY = [];

var ARTICLES = [
  ['Salle de bain', [
    ['pq', 'Papier toilette', 'rouleaux', 12, 6], ['savon', 'Savon pour les mains', 'flacons', 4, 2],
    ['kit', 'Kit shampooing', 'kits', 8, 4], ['sacsdb', 'Sacs poubelle salle de bain', 'rouleaux', 3, 1],
    ['nettsdb', 'Nettoyant salle de bain', 'flacons', 2, 1], ['wc', 'Produit WC', 'flacons', 2, 1],
    ['calcaire', 'Spray anti-calcaire', 'flacons', 2, 1]
  ]],
  ['Cuisine', [
    ['vaisselle', 'Liquide vaisselle', 'flacons', 3, 1], ['pastilles', 'Pastilles lave-vaisselle', 'pastilles', 30, 12],
    ['eponge', 'Éponge', 'unités', 6, 3], ['lavette', 'Lavette microfibre', 'unités', 6, 3],
    ['essuietout', 'Essuie-tout', 'rouleaux', 6, 3], ['alu', 'Papier aluminium', 'rouleaux', 2, 1],
    ['film', 'Film alimentaire', 'rouleaux', 2, 1], ['cuisson', 'Papier cuisson', 'rouleaux', 2, 1],
    ['sel', 'Sel', 'boîtes', 1, 1], ['poivre', 'Poivre', 'boîtes', 1, 1],
    ['huile', 'Huile d’olive', 'bouteilles', 1, 1], ['vinaigre', 'Vinaigre', 'bouteilles', 1, 1],
    ['sucre', 'Sucre', 'paquets', 1, 1], ['cafe', 'Café', 'capsules', 40, 16]
  ]],
  ['Entretien', [
    ['multi', 'Nettoyant multi-usages', 'flacons', 3, 1], ['vitres', 'Nettoyant vitres', 'flacons', 2, 1],
    ['sol', 'Détergent sol', 'bidons', 2, 1], ['javel', 'Javel', 'bidons', 1, 1]
  ]],
  ['Linge', [
    ['draps', 'Draps', 'parures', 6, 3], ['serviettes', 'Serviettes', 'unités', 12, 6],
    ['couette', 'Housses de couette', 'unités', 6, 3], ['taies', 'Taies d’oreiller', 'unités', 12, 6]
  ]]
];

/* Liste d'articles de départ, à plat. Elle devient modifiable : voir state.articles,
   et les fonctions arts() / groups() / grouped() de la partie 3. */
function baseArticles() {
  return ARTICLES.reduce(function (acc, g) {
    return acc.concat(g[1].map(function (a) {
      return { key: a[0], label: a[1], unit: a[2], par: a[3], group: g[0] };
    }));
  }, []);
}

/* Modèle de checklist proposé à la création d'un logement. Générique exprès :
   le propriétaire ajoute, retire et renomme ensuite pièce par pièce depuis la
   fiche du bien. Le chiffre 1 veut dire « photo demandée à cette étape ». */
var CHECK_MODELE = [
  ['Séjour & entrée', [['Aspirer et laver le sol', 1], ['Dépoussiérer les surfaces', 1]]],
  ['Cuisine', [['Frigo vidé et nettoyé', 1], ['Plaques, évier, plan de travail', 1]]],
  ['Salle de bain', [['Douche et WC désinfectés', 1], ['Serviettes propres pliées', 1]]],
  ['Chambre', [['Lit refait, draps propres', 1]]],
  ['Avant de partir', [['Poubelles sorties', 1], ['Vue d’ensemble du logement', 1]]]
];

var RAW_CHECK = {};

var BIEN_INFO = {};

/* Champs de la fiche bien : clé technique, libellé, et présence dans le livret. */
var INFO_FIELDS = [
  { k: 'capacity', label: 'Capacité' },
  { k: 'surface', label: 'Surface' },
  { k: 'code', label: 'Accès / clés' },
  { k: 'wifi', label: 'Wi-Fi' },
  { k: 'parking', label: 'Stationnement' },
  { k: 'linge', label: 'Linge fourni' },
  { k: 'checkin', label: 'Heure d’arrivée' },
  { k: 'checkout', label: 'Heure de départ' },
  /* Sert de base au montant d'un séjour quand la plateforme ne le donne pas
     (nuits × prix). Le montant reste modifiable réservation par réservation. */
  { k: 'prixNuit', label: 'Prix par nuit (€)', num: true }
];

/* Livret d'accueil : 5 rubriques, chacune une liste de blocs
   { titre, texte, media } — media = adresse internet d'une photo ou d'une vidéo.
   Le voyageur voit d'abord ces rubriques en grandes tuiles, puis ouvre celle
   qui l'intéresse : `icon` et `hint` sont ce qu'il lit sur la tuile. */
var LIVRET_SECTIONS = [
  { k: 'arrivee', label: 'Arrivée autonome', labelEn: 'Self check-in', icon: '🔑',
    hint: 'Comment entrer dans le logement, étape par étape.',
    hintEn: 'How to get into the property, step by step.' },
  { k: 'questions', label: 'Questions fréquentes', labelEn: 'Good to know', icon: '💡',
    hint: 'La télé, le chauffage, la machine à laver, les poubelles…',
    hintEn: 'The TV, the heating, the washing machine, the bins…' },
  { k: 'activites', label: 'Activités autour', labelEn: 'Things to do', icon: '🗺️',
    hint: 'À voir, à faire, à quelle distance.',
    hintEn: 'What to see, what to do, and how far it is.' },
  { k: 'restos', label: 'Où manger', labelEn: 'Where to eat', icon: '🍽️',
    hint: 'Vos adresses préférées du quartier.',
    hintEn: 'Our favourite places in the neighbourhood.' },
  { k: 'depart', label: 'Instructions de départ', labelEn: 'Before you leave', icon: '👋',
    hint: 'Poubelles, clés, fenêtres : ce qu\'il reste à faire avant de partir.',
    hintEn: 'Bins, keys, windows: what to do before you go.' }
];

/* --------------------------------------------------------------------------
   Livret en deux langues (session 12 — D-57)

   Tout ce qui est **fixe** est traduit ici, une fois pour toutes : le
   propriétaire n'a rien à faire. Ses **propres textes** (mot d'accueil, blocs)
   portent une version anglaise facultative, qu'il écrit dans l'onglet Livret ;
   si elle est vide, l'anglais affiche le français plutôt que rien.

   Aucune traduction automatique : elle demanderait un serveur et un service
   payant, et se trompe sur des consignes pratiques.
   -------------------------------------------------------------------------- */

var LANGS = [{ k: 'fr', label: 'Français', court: 'FR' }, { k: 'en', label: 'English', court: 'EN' }];

var T = {
  // Cartes clés du livret
  checkin:      ['Arrivée à partir de', 'Check-in from'],
  checkout:     ['Départ avant', 'Check-out before'],
  code:         ['Code d’accès', 'Access code'],
  wifi:         ['Wi-Fi', 'Wi-Fi'],
  // Pied de page et messages généraux
  bonSejour:    ['Bon séjour ! — MAISON WARME', 'Enjoy your stay! — MAISON WARME'],
  livretVide:   ['Le livret de ce logement n’est pas encore rempli.',
                 'This guidebook has not been filled in yet.'],
  rubriqueVide: ['Cette rubrique est vide.', 'This section is empty.'],
  retourLivret: ['← Le livret', '← Guidebook'],
  revenirLivret:['← Revenir au livret', '← Back to the guidebook'],
  voirMedia:    ['Voir la photo ou la vidéo →', 'See the photo or video →'],
  yAller:       ['Y aller →', 'Take me there →'],
  // Accès verrouillé
  lockTitre:    ['🔒 Code d’accès et Wi-Fi', '🔒 Access code and Wi-Fi'],
  lockInconnu:  ['Pour des raisons de sécurité, ils ne s’affichent qu’aux voyageurs dont le séjour est en cours. C’est immédiat : il suffit de la date de votre arrivée et des 4 derniers chiffres de votre téléphone.',
                 'For security reasons, they are only shown to guests whose stay is under way. It takes a second: just your arrival date and the last 4 digits of your phone number.'],
  lockBouton:   ['Retrouver mon séjour', 'Find my booking'],
  lockAttente:  ['🔒 En attente de confirmation', '🔒 Waiting for confirmation'],
  lockAttenteP: ['Votre hôte a été prévenu. Le code d’accès et le Wi-Fi apparaîtront ici dès qu’il aura confirmé votre réservation — c’est en général très rapide. Tout le reste du livret vous est déjà accessible.',
                 'Your host has been notified. The access code and Wi-Fi will appear here as soon as your booking is confirmed — usually very quickly. Everything else in the guidebook is already available to you.'],
  lockAvant:    ['Ils s’afficheront ici <strong>le jour de votre arrivée</strong>, le ',
                 'They will appear here <strong>on the day you arrive</strong>, on '],
  lockAvant2:   ['. D’ici là, tout le reste du livret est à vous : les instructions d’arrivée, les bonnes adresses et les activités du coin.',
                 '. Until then, the rest of the guidebook is yours: check-in instructions, good addresses and things to do nearby.'],
  relance:      ['Aidez votre hôte à préparer votre arrivée — 20 secondes',
                 'Help your host prepare your arrival — 20 seconds'],
  // Logement prêt en avance
  pretBadge:    ['✨ Le logement est prêt !', '✨ Your place is ready!'],
  pretP1:       ['Le ménage s’est terminé à ', 'Cleaning finished at '],
  pretP2:       ['. Vous n’avez pas besoin d’attendre ', '. No need to wait until '],
  pretP3:       [' : vous pouvez arriver dès ', ': you can arrive from '],
  pretPlancher: [' Nous ne proposons pas d’arrivée avant ', ' We do not offer check-in before '],
  // Départ
  departTitre:  ['Vous quittez le logement ?', 'Leaving the property?'],
  departP:      ['Prévenez-nous en un geste : la personne qui fait le ménage saura que le logement est libre et pourra commencer plus tôt. Départ prévu avant ',
                 'Let us know in one tap: our housekeeper will know the place is free and can start earlier. Check-out is before '],
  departBtn:    ['J’ai quitté le logement', 'I have left the property'],
  departOk:     ['✓ Votre départ est signalé', '✓ Your departure is recorded'],
  departOkP1:   ['Enregistré à ', 'Recorded at '],
  departOkP2:   ['. Le ménage a été prévenu que le logement est libre. Merci et à bientôt !',
                 '. Housekeeping has been notified that the place is free. Thank you, and see you soon!'],
  // Notes
  noteMenageT:  ['Le logement était-il bien propre ?', 'Was the place nice and clean?'],
  noteMenageS:  ['Notez la propreté que vous avez trouvée en arrivant. Votre note va directement à la personne qui a fait le ménage.',
                 'Rate the cleanliness you found on arrival. Your rating goes straight to the person who cleaned.'],
  noteMenageP:  ['Un mot sur la propreté (facultatif)', 'A word about the cleanliness (optional)'],
  noteMenageM:  ['Votre note sur la propreté', 'Your cleanliness rating'],
  noteSejourT:  ['Comment s’est passé votre séjour ?', 'How was your stay?'],
  noteSejourS:  ['Votre avis nous aide à améliorer le logement pour les prochains voyageurs.',
                 'Your feedback helps us improve the place for future guests.'],
  noteSejourP:  ['Ce que vous avez aimé, ce qui pourrait être mieux (facultatif)',
                 'What you enjoyed, what could be better (optional)'],
  noteSejourM:  ['Votre avis sur le séjour', 'Your review of the stay'],
  noteEnvoyer:  ['Envoyer ma note', 'Send my rating'],
  noteMerci:    ['Merci, c’est bien enregistré.', 'Thank you, it has been saved.'],
  noteEtoiles:  ['Choisissez d’abord un nombre d’étoiles.', 'Please choose a number of stars first.'],
  // Porte d'entrée
  bvSous:       ['Vous arrivez dans un logement MAISON WARME', 'You are arriving at a MAISON WARME property'],
  bvTitre:      ['Retrouvez votre séjour', 'Find your booking'],
  bvP:          ['Deux informations suffisent : votre nom, tel que vous l’avez donné au moment de réserver, et la date de votre arrivée.',
                 'Two details are enough: your name, as given when you booked, and your arrival date.'],
  bvDate:       ['Date de votre arrivée', 'Your arrival date'],
  bvNomTitre:   ['Votre nom', 'Your name'],
  bvErrNomCourt: ['Indiquez votre nom (au moins 3 lettres).', 'Please enter your name (at least 3 letters).'],
  bvCherche:    ['Recherche…', 'Searching…'],
  bvTel:        ['4 derniers chiffres de votre téléphone', 'Last 4 digits of your phone number'],
  bvContinuer:  ['Continuer', 'Continue'],
  bvSaisPas:    ['Je ne sais pas quoi mettre →', 'I don’t know what to enter →'],
  bvErrDate:    ['Indiquez d’abord la date de votre arrivée.', 'Please enter your arrival date first.'],
  bvErrTel:     ['Il faut les 4 derniers chiffres de votre téléphone.', 'We need the last 4 digits of your phone number.'],
  bvErrRien:    ['Aucun séjour ne correspond. Vérifiez l’orthographe de votre nom et la date, ou passez par « Je ne sais pas quoi mettre ».',
                 'No booking matches. Check the spelling of your name and the date, or use “I don’t know what to enter”.'],
  bvChoixT:     ['Lequel est le vôtre ?', 'Which one is yours?'],
  bvChoixP:     ['Plusieurs séjours correspondent. Choisissez votre logement.',
                 'Several bookings match. Please choose your property.'],
  bvChoixSous:  ['Presque terminé', 'Almost there'],
  bvArriveeLe:  ['arrivée le ', 'arriving on '],
  bvBTitre:     ['Pas de souci', 'No problem'],
  bvBP:         ['Certaines plateformes, comme Booking.com, ne nous transmettent pas votre numéro. Dites-nous simplement où vous allez : vous aurez accès au livret tout de suite.',
                 'Some platforms, such as Booking.com, do not pass on your phone number. Just tell us where you are staying: you will get the guidebook straight away.'],
  bvBSous:      ['Nous ne vous avons pas trouvé', 'We could not find you'],
  bvLogement:   ['Votre logement', 'Your property'],
  bvChoisir:    ['— Choisir —', '— Select —'],
  bvNom:        ['Votre nom', 'Your name'],
  bvNomPh:      ['Prénom et nom', 'First and last name'],
  bvAcceder:    ['Accéder au livret', 'Open the guidebook'],
  bvBNote:      ['Le code d’accès et le Wi-Fi vous seront affichés dès que votre hôte aura confirmé votre réservation. Tout le reste du livret est accessible immédiatement.',
                 'The access code and Wi-Fi will be shown as soon as your host confirms your booking. Everything else is available right away.'],
  bvJaiMes:     ['← J’ai mes 4 chiffres', '← I have my 4 digits'],
  bvErrLog:     ['Choisissez votre logement.', 'Please choose your property.'],
  bvErrNom:     ['Indiquez votre nom.', 'Please enter your name.'],
  bvTrouve:     ['✓ C’est bien vous', '✓ That’s you'],
  bvSousTrouve: ['Nous vous avons trouvé', 'We found you'],
  bvArrivee:    ['Arrivée le ', 'Arriving on '],
  bvDepart:     ['départ le ', 'leaving on '],
  bvNuits:      [' nuit', ' night'],
  bvInfosP:     ['Quelques informations pour préparer votre arrivée. Rien n’est obligatoire.',
                 'A few details to help us prepare your arrival. Nothing is required.'],
  bvTelC:       ['Votre téléphone', 'Your phone number'],
  bvMail:       ['Votre e-mail', 'Your email'],
  bvCombien:    ['Vous serez combien ?', 'How many of you?'],
  bvHeure:      ['Vers quelle heure ?', 'Around what time?'],
  bvHeureNote:  ['Arrivée prévue à partir de ', 'Check-in is from '],
  bvHeureNote2: ['. Si vous arrivez plus tard, dites-le nous : la personne qui vous remet les clés s’organisera.',
                 '. If you are arriving later, let us know: whoever hands over the keys will plan accordingly.'],
  bvOptin:      ['Je souhaite recevoir les offres et nouveautés de MAISON WARME',
                 'I would like to receive offers and news from MAISON WARME'],
  bvOptinS:     ['Facultatif. Vous pourrez vous désinscrire à tout moment.',
                 'Optional. You can unsubscribe at any time.'],
  bvEnregistrer:['Enregistrer et voir le livret', 'Save and open the guidebook'],
  bvPlusTard:   ['Plus tard →', 'Later →'],
  bvBienvenue:  ['Bienvenue', 'Welcome']
};

/** Le texte fixe, dans la langue choisie par le visiteur. */
function t(cle) {
  var v = T[cle];
  if (!v) return '';
  return state.lvLang === 'en' ? v[1] : v[0];
}

/** Un texte écrit par le propriétaire : sa version anglaise si elle existe,
    sinon le français — mieux vaut du français que du vide. */
function tx(obj, champ) {
  if (!obj) return '';
  if (state.lvLang === 'en') {
    var en = obj[champ + 'En'];
    if (en && String(en).trim()) return en;
  }
  return obj[champ] || '';
}

/** Le nom d'une rubrique, dans la langue du visiteur. */
function secLabel(s) { return state.lvLang === 'en' && s.labelEn ? s.labelEn : s.label; }
function secHint(s) { return state.lvLang === 'en' && s.hintEn ? s.hintEn : s.hint; }

/** Le sélecteur de langue, en haut du livret et de la porte d'entrée. */
function langSwitch() {
  return '<div class="lv-lang">' + LANGS.map(function (l) {
    return '<button type="button" aria-pressed="' + (state.lvLang === l.k) + '"' +
      act('lv-lang', { l: l.k }) + '>' + l.court + '</button>';
  }).join('') + '</div>';
}

/* Le livret d'un logement neuf : un mot d'accueil à compléter et deux
   consignes de départ, pour ne pas partir de la page blanche. */
function livretModele(ville) {
  return {
    mot: 'Bienvenue ! Vous trouverez ici tout ce qu’il faut pour votre séjour' +
      (ville ? ' à ' + ville : '') + '. Bon séjour !',
    arrivee: [],
    questions: [], activites: [], restos: [],
    depart: [
      { titre: 'Avant de fermer la porte', texte: 'Sortez les poubelles, laissez la vaisselle propre et rangée, fermez les fenêtres.', media: '' },
      { titre: 'Les clés', texte: 'Remettez les clés là où vous les avez trouvées à votre arrivée.', media: '' }
    ]
  };
}

function baseLivret() { return {}; }

var BIEN_NOTES = {};

var TARIFFS = {};

var MISSIONS = [];

var STATUS = {
  dispo: { label: 'Disponible', cls: 'badge--terra' },
  prise: { label: 'Acceptée', cls: 'badge--blue' },
  encours: { label: 'En cours', cls: 'badge--amber' },
  termine: { label: 'Terminée', cls: 'badge--green' }
};

/* --------------------------------------------------------------------------
   Fabriques de données initiales
   -------------------------------------------------------------------------- */

function buildChecklists() {
  var out = {}, n = 0;
  Object.keys(RAW_CHECK).forEach(function (pid) {
    out[pid] = RAW_CHECK[pid].map(function (r) {
      return {
        name: r[0],
        steps: r[1].map(function (s) { return { id: 's' + (++n), label: s[0], photo: !!s[1] }; })
      };
    });
  });
  return out;
}

/* La checklist d'un logement neuf, à partir du modèle. Les identifiants
   d'étape doivent être uniques dans toute l'application : les photos sont
   rangées par mission ET par étape. */
function checklistModele() {
  return CHECK_MODELE.map(function (r) {
    return {
      name: r[0],
      steps: r[1].map(function (s) {
        return { id: slug(s[0], 's'), label: s[0], photo: !!s[1] };
      })
    };
  });
}

/* Les stocks partent vides : ils se créent logement par logement, à zéro,
   et se relèvent à la fin de chaque ménage. */
function baseStock() { return {}; }

function baseSeuils() {
  var s = {};
  ARTICLES.forEach(function (g) {
    g[1].forEach(function (a) { s[a[0]] = a[4]; });
  });
  return s;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function initialState() {
  return {
    auth: null,                       // null | 'owner' | 'presta'
    me: null,                         // prestataire connecté (son legacy_id)
    loginEmail: '',
    loginPwd: '',
    loginErreur: '',
    loginEnCours: false,
    migMsg: '',
    migEnCours: false,
    majEnCours: false,     // relecture demandée par le bouton « ⟳ » du prestataire
    mMsg: '',              // message affiché sur l'écran prestataire
    priseEnCours: null,    // mission dont la prise est en cours d'arbitrage
    comptes: [],           // les comptes existants dans le cahier partagé
    lienCompte: {},        // { idFiche: uidCompte } — choix en cours de rapprochement

    // Invitations (session 14) — voir D-63
    invits: [],            // invitations en attente, relues depuis le cahier
    invitLien: {},         // { idFiche: lien } — le lien qui vient d'être fabriqué
    inv: {                 // l'écran « je finalise mon inscription »
      token: '', email: '', nom: '', etat: '', pwd: '', pwd2: '',
      erreur: '', enCours: false
    },

    // Données de référence, désormais modifiables depuis l'interface
    props: clone(PROPS),              // les biens
    services: clone(SERVICES),        // les prestations, communes à tous les biens
    agents: clone(AGENTS),            // les prestataires, avec leurs biens autorisés
    articles: baseArticles(),         // les articles de stock
    resas: clone(RESAS),              // les réservations, par bien
    livret: baseLivret(),             // le livret d'accueil, par bien

    durations: {},                    // { pid: { prestation: '≈ 2 h' } } — la durée est propre à chaque bien

    // Ce que le voyageur renvoie depuis son livret
    departs: {},                      // { 'pid:début:fin': 'HH:MM' } — « j'ai quitté le logement »
    ready: {},                        // { pid: { date, at, mid, agent } } — ménage terminé, logement prêt
    avis: [],                         // [{ id, pid, resa, kind, stars, texte, agent, mid, dateLabel }]

    // Intégration des plateformes (session 10). Aucune clé secrète ici :
    // elle vivra sur le serveur le jour de la connexion réelle (D-42).
    beds24: { actif: false, compte: '', dernierSync: null },
    messages: [],                     // [{ id, resa, pid, plat, sens, texte, at, lu }]
    autoMsgs: [],                     // messages programmés (modèles + déclencheur)

    missions: clone(MISSIONS),
    photos: {},                       // { missionId: { stepId: photo enregistrée sur l'appareil } }
    photosEnvoi: {},                  // { 'missionId:stepId': 'encours' | 'ok' | 'erreur' } — dépôt dans le casier (lot 2)
    stock: baseStock(),
    seuils: baseSeuils(),
    draft: null,                      // { id, prop, qty }
    checklists: buildChecklists(),
    tariffs: clone(TARIFFS),
    info: clone(BIEN_INFO),
    notes: Object.assign({}, BIEN_NOTES),
    done: [],
    reports: {},                      // { missionId: compte rendu figé d'une mission terminée }
    payouts: {},                      // { 'Sofia:2026-07': true } — versement effectué
    /* Problèmes signalés par un prestataire pendant sa mission (session 16).
       Chacun porte : { id, kind, texte, photo, agent, mission, prop, date,
       at, statut } — `photo` est une image gardée sur l'appareil, `statut`
       vaut 'ouvert' ou 'traite'. Les entrées d'avant la session 16 n'avaient
       ni identifiant ni commentaire : `upgrade()` les complète. */
    problems: [],
    lastDone: null,
    extraFeeds: {},

    // Préférences d'affichage
    missionFilter: 'all',
    stockScope: 'all',
    stockGroup: 'Tous',
    stockTab: 'matrice',
    mStockGroup: 'Tous',
    ownerMonth: CURRENT_MONTH,
    openAgent: null,
    openReglages: null,    // fiche prestataire dont les réglages sont dépliés
    openGainMonth: null,
    bienTab: 'infos',
    calMonth: CURRENT_MONTH,
    showNew: false,
    nm: { prop: '', type: 'menage', date: '', window: '11:00 → 15:00', price: 0, note: '' },
    stepDrafts: {},
    newRoom: '',
    newFeed: '',
    problemKind: null,
    problemTexte: '',                 // le commentaire en cours d'écriture (session 16)
    problemPhoto: '',                 // la photo en cours, gardée sur l'appareil (session 16)
    photoPlein: null,                 // 'missionId:etapeId' affiché en grand, ou 'probleme:id'
    apercuSejour: null,               // le propriétaire regarde le lien personnel de ce séjour (session 17)
    sejourNet: null,                  // { rid, etat, msg } — séjour demandé au cahier partagé (lot 3)

    // Formulaires de création ajoutés en session 7
    showNewBien: false,
    nb: { name: '', city: '', address: '', color: C.terracotta },
    showNewAgent: false,
    na: { name: '', kind: 'menage', role: 'Ménage', email: '', color: C.terracotta },
    showNewArticle: false,
    nar: { label: '', unit: 'unités', par: 4, seuil: 2, group: 'Salle de bain' },
    showNewResa: false,
    // `pid` sert au formulaire ouvert depuis le calendrier, qui n'est pas
    // déjà posé sur un logement (session 16) : il faut donc le choisir.
    nr: { plat: 'Airbnb', guest: '', guests: 2, start: '', end: '', montant: '', pid: '' },

    // Porte d'entrée du livret (session 11) — voir D-46 à D-48.
    acces: [],                        // demandes à confirmer : [{ id, pid, resa, nom, date, at, statut }]
    guestPass: null,                  // souvenir posé dans le navigateur du VOYAGEUR : { resa, pid, niveau, at }
    bienvenue: { date: '', tel4: '', pid: '', nom: '', etape: 'recherche', erreur: '', choix: null, enCours: false },
    gform: { nom: '', tel: '', mail: '', guests: '', arrivee: '', optin: false },
    repFiltre: 'tous',                // filtre du répertoire voyageurs (session 12)
    lvLang: 'fr',                     // langue du livret côté voyageur (session 12)
    lvEdLang: 'fr',                   // langue en cours d'écriture, côté propriétaire

    // Écrans de la session 10
    planStart: TODAY,                 // premier jour affiché dans le planning
    planProps: null,                  // logements affichés (null = tous)
    statMonth: CURRENT_MONTH,         // mois des statistiques
    msgFilter: 'encours',             // 'encours' | 'avenir' | 'tous'
    showNewAuto: false,
    am: null,                         // message programmé en cours d'écriture
    newService: '',
    coursesScope: 'bien',             // 'bien' | 'global'
    coursesProps: null,               // biens cochés dans la liste de courses (null = tous)
    avisFilter: { kind: 'tous', prop: 'tous', stars: 'toutes' },
    livretSection: 'arrivee',
    livretCopie: [],                  // logements cochés pour recopier une rubrique
    livretBlocs: null,                // blocs cochés pour la copie (null = tous)
    livretDrafts: {},                 // { 'pid:section': { titre, texte, adresse, media } }
    avisDrafts: {}                    // { 'pid:kind': { stars, texte } } — la note en cours de saisie
  };
}

/* ==========================================================================
   2. État et sauvegarde locale
   ========================================================================== */

var STORE_KEY = 'warme-house.v1';
var state = initialState();
var flash = null;   // identifiant d'étape qui vient d'être photographiée (non sauvegardé)

function save() {
  var ecrit = true;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    /* Navigation privée ou mémoire pleine : l'application reste utilisable,
       mais il faut le DIRE — depuis que les photos sont de vraies photos,
       c'est la mémoire de l'appareil qui se remplit (session 15). */
    ecrit = false;
  }
  // Le navigateur reste la mémoire de secours ; le grand cahier partagé reçoit
  // la même chose, sans qu'on l'attende — l'interface ne doit jamais figer
  // parce que le réseau est lent. Ne fait rien tant que personne n'est connecté.
  if (typeof DB !== 'undefined' && DB.estDispo()) DB.pousser();
  return ecrit;
}

function load() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      var saved = JSON.parse(raw);
      var base = initialState();
      Object.keys(base).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(saved, k) && saved[k] !== undefined) base[k] = saved[k];
      });
      state = base;
    }
  } catch (e) {
    state = initialState();
  }
  /* Les « en cours » ne sont pas des données : ce sont des attentes de réponse,
     et une attente ne survit pas à la fermeture de la page. À faire ici, dans
     `load()`, et surtout **pas** dans `upgrade()` — qui tourne aussi à chaque
     lecture du cahier, et effacerait des messages qu'on vient d'afficher.

     `priseEnCours` était le plus dommageable : enregistré tel quel, il faisait
     revenir au rechargement le bouton « Prendre cette mission » sous la forme
     « Un instant… » — un libellé **sans action attachée**. La mission devenait
     alors définitivement impossible à prendre. Constaté en session 14. */
  state.priseEnCours = null;
  state.loginEnCours = false;
  state.migEnCours = false;
  state.majEnCours = false;           // le bouton « ⟳ » du prestataire (session 19)
  state.mMsg = '';
  state.migMsg = '';
  state.photoPlein = null;            // une photo ouverte en grand n'est pas une donnée
  state.apercuSejour = null;          // un aperçu n'est pas une donnée non plus
  state.sejourNet = null;             // une demande en cours ne survit pas à la page
  if (state.bienvenue) state.bienvenue.enCours = false;
  if (state.inv) state.inv.enCours = false;

  // Appelé aussi sur un navigateur neuf : c'est upgrade() qui pose les valeurs
  // dérivées (durées par bien, arrivée anticipée…) absentes des constantes.
  upgrade();
}

/* Mise à niveau des données déjà enregistrées dans le navigateur.
   Une version précédente de l'application ne connaissait ni les heures
   d'arrivée, ni les livrets, ni les biens autorisés : on complète ce qui
   manque sans jamais écraser ce que le propriétaire a saisi. */
function upgrade() {
  var seedInfo = BIEN_INFO, seedLivret = baseLivret();

  // Session 13 — le cahier partagé. `comptes` est rempli à chaque lecture ;
  // `lienCompte` ne retient qu'un choix en cours, jamais une donnée utile.
  if (!Array.isArray(state.comptes)) state.comptes = [];
  if (!state.lienCompte) state.lienCompte = {};

  // Session 15 — le dépôt des photos dans le casier partagé (lot 2).
  // Un envoi resté « encours » à la fermeture de la page n'a jamais abouti :
  // on le rouvre, pour que le filet de fin de mission le reprenne.
  if (!state.photosEnvoi) state.photosEnvoi = {};
  Object.keys(state.photosEnvoi).forEach(function (k) {
    if (state.photosEnvoi[k] === 'encours') state.photosEnvoi[k] = 'erreur';
  });

  /* Session 16 — les signalements de problème deviennent de vraies fiches.
     Avant, on n'enregistrait qu'un type ({ kind, agent, mission }) : ni
     commentaire, ni photo, ni identifiant, et le propriétaire ne pouvait donc
     rien en faire. On complète les anciennes lignes sans en perdre une. */
  if (!Array.isArray(state.problems)) state.problems = [];
  state.problems = state.problems.map(function (p, i) {
    var m = p.mission ? state.missions.find(function (x) { return x.id === p.mission; }) : null;
    return {
      id: p.id || ('pb_anc_' + i),
      kind: p.kind || 'casse',
      texte: p.texte || '',
      photo: p.photo || '',
      agent: p.agent || '',
      mission: p.mission || '',
      prop: p.prop || (m ? m.prop : ''),
      date: p.date || (m ? m.date : TODAY),
      at: p.at || '',
      statut: p.statut === 'traite' ? 'traite' : 'ouvert'
    };
  });
  if (typeof state.problemTexte !== 'string') state.problemTexte = '';
  // `problemPhoto` valait un booléen dans la maquette : c'est une image, désormais.
  if (typeof state.problemPhoto !== 'string') state.problemPhoto = '';

  // Session 16 — le formulaire de séjour s'ouvre aussi depuis le calendrier,
  // où aucun logement n'est encore choisi.
  if (state.nr && typeof state.nr.pid !== 'string') state.nr.pid = '';

  // Session 14 — les invitations, et la fin de la connexion de démonstration.
  if (!Array.isArray(state.invits)) state.invits = [];
  if (!state.invitLien) state.invitLien = {};
  if (!state.inv) {
    state.inv = { token: '', email: '', nom: '', etat: '', pwd: '', pwd2: '', erreur: '', enCours: false };
  }
  // Ces deux-là servaient à choisir son rôle dans une liste, sans mot de passe.
  delete state.loginRole;
  delete state.loginPresta;
  if (state.me && !agentExiste(state.me)) state.me = null;
  if (state.openAgent && !agentExiste(state.openAgent)) state.openAgent = null;

  // Nouveautés de la session 8 : durées par bien, départs signalés, avis.
  // Posées d'abord : les boucles ci-dessous s'appuient dessus.
  if (!state.durations) state.durations = {};
  if (!state.departs) state.departs = {};
  if (!state.ready) state.ready = {};
  if (!Array.isArray(state.avis)) state.avis = [];
  if (!state.avisDrafts) state.avisDrafts = {};
  if (!state.avisFilter) state.avisFilter = { kind: 'tous', prop: 'tous', stars: 'toutes' };
  if (!Array.isArray(state.livretCopie)) state.livretCopie = [];
  if (state.coursesProps === undefined) state.coursesProps = null;

  state.props.forEach(function (p) {
    var pid = p.id;

    // Champs de la fiche bien : on ne remplit que les cases absentes.
    var inf = state.info[pid] || (state.info[pid] = {});
    INFO_FIELDS.forEach(function (f) {
      if (inf[f.k] === undefined) {
        inf[f.k] = (seedInfo[pid] && seedInfo[pid][f.k]) ||
          (f.k === 'checkin' ? '16:00' : f.k === 'checkout' ? '11:00' : f.num ? 0 : '');
      }
    });
    // Identifiant du logement chez Beds24 : rempli le jour de la connexion.
    if (inf.beds24 === undefined) inf.beds24 = '';

    // Format commun des réservations (voir normaliserResa) : les anciennes
    // saisies n'ont ni identifiant, ni source, ni statut.
    resasOf(pid).forEach(function (r) {
      if (!r.id) r.id = slugResa(pid, r);
      if (!r.source) r.source = 'manuel';
      if (r.uid === undefined) r.uid = '';
      if (r.montant === undefined) r.montant = null;   // null = calculé au prix par nuit
      if (!r.statut) r.statut = 'confirme';

      // Coordonnées du voyageur (session 11). `tel4` vient de la plateforme
      // (iCal Airbnb ou Beds24) ; les trois suivants du voyageur lui-même,
      // via le formulaire de la porte d'entrée. Voir D-46 à D-48.
      if (r.tel4 === undefined) r.tel4 = '';
      if (r.tel === undefined) r.tel = '';
      if (r.mail === undefined) r.mail = '';
      if (r.arriveePrevue === undefined) r.arriveePrevue = '';
      if (r.guestOk === undefined) r.guestOk = false;
      // Accord de démarchage (session 12) : jamais vrai par défaut (D-56).
      if (r.demarchable === undefined) r.demarchable = false;
    });

    if (state.notes[pid] === undefined) state.notes[pid] = '';
    if (!state.resas[pid]) state.resas[pid] = [];
    if (!state.checklists[pid]) state.checklists[pid] = [];

    // Livret : structure complète, même vide.
    var lv = state.livret[pid] || (state.livret[pid] = seedLivret[pid] || {});
    if (lv.mot === undefined) lv.mot = '';
    LIVRET_SECTIONS.forEach(function (s) { if (!Array.isArray(lv[s.k])) lv[s.k] = []; });

    // Arrivée anticipée autorisée par défaut : c'est le service rendu au voyageur.
    if (inf.early === undefined) inf.early = true;

    // Un tarif et une durée par prestation, une quantité par article.
    var tf = state.tariffs[pid] || (state.tariffs[pid] = {});
    state.services.forEach(function (s) { if (tf[s.key] === undefined) tf[s.key] = 0; });
    // La durée était commune à tous les biens : on la recopie une fois dans chacun,
    // puis chaque logement suit la sienne.
    var du = state.durations[pid] || (state.durations[pid] = {});
    state.services.forEach(function (s) { if (du[s.key] === undefined) du[s.key] = s.duration || ''; });
    var st = state.stock[pid] || (state.stock[pid] = {});
    state.articles.forEach(function (a) { if (st[a.key] === undefined) st[a.key] = 0; });
  });

  state.articles.forEach(function (a) {
    if (state.seuils[a.key] === undefined) state.seuils[a.key] = 0;
  });

  // Sans attribution enregistrée, un prestataire garde accès à tous les biens :
  // c'est le comportement qu'il avait avant l'arrivée de cette option.
  state.agents.forEach(function (a) {
    if (!Array.isArray(a.props)) a.props = state.props.map(function (p) { return p.id; });
    // Métier du prestataire : les comptes créés avant cette option font du ménage.
    if (a.kind !== 'cles') a.kind = 'menage';
    // Prestations autorisées (session 12) : sans liste, il les voit toutes,
    // comme avant. On ne matérialise rien ici — allowedServices() s'en charge —
    // mais on retire les prestations supprimées entre-temps.
    if (Array.isArray(a.services)) {
      a.services = a.services.filter(function (k) {
        return state.services.some(function (s) { return s.key === k; });
      });
    }
  });
  if (!state.na.kind) state.na.kind = 'menage';

  // Nouveautés de la session 10 : intégration des plateformes et écrans associés.
  if (!state.beds24) state.beds24 = { actif: false, compte: '', dernierSync: null };
  if (!Array.isArray(state.messages)) state.messages = [];
  if (!Array.isArray(state.autoMsgs)) state.autoMsgs = [];
  if (!state.planStart) state.planStart = premierJourDuMois(TODAY);
  if (state.planProps === undefined) state.planProps = null;
  if (!state.statMonth) state.statMonth = CURRENT_MONTH;
  if (!state.msgFilter) state.msgFilter = 'encours';
  if (state.nr.montant === undefined) state.nr.montant = '';
  if (Array.isArray(state.planProps)) {
    state.planProps = state.planProps.filter(function (pid) { return !prop(pid).gone; });
  }

  // Nouveautés de la session 11 : la porte d'entrée du livret voyageur.
  if (!Array.isArray(state.acces)) state.acces = [];
  if (state.guestPass === undefined) state.guestPass = null;
  if (!state.bienvenue) state.bienvenue = { date: '', tel4: '', pid: '', nom: '', etape: 'recherche', erreur: '', choix: null };
  if (!state.gform) state.gform = { nom: '', tel: '', mail: '', guests: '', arrivee: '', optin: false };
  if (!state.repFiltre) state.repFiltre = 'tous';
  if (state.lvLang !== 'en') state.lvLang = 'fr';
  if (state.lvEdLang !== 'en') state.lvEdLang = 'fr';
  // Une demande qui vise un logement ou un séjour disparu n'a plus de sens.
  state.acces = state.acces.filter(function (d) { return !prop(d.pid).gone; });

  state.missions.forEach(function (m) { if (m.note === undefined) m.note = ''; });
  if (state.nm.note === undefined) state.nm.note = '';

  // Les biens supprimés ne doivent pas rester cochés dans la liste de courses.
  if (Array.isArray(state.coursesProps)) {
    state.coursesProps = state.coursesProps.filter(function (pid) { return !prop(pid).gone; });
  }

  reconstruireReady();
}

/* L'HEURE DE FIN DE MÉNAGE N'EST PAS UNE DONNÉE À PART (session 19)

   `state.ready` décide de l'arrivée anticipée du voyageur suivant. Il était
   écrit par `finish()`, donc **sur le téléphone du prestataire uniquement** :
   ni le propriétaire ni le voyageur ne l'ont jamais vu. Plutôt que de créer
   une table pour une information entièrement déductible, on la reconstruit
   depuis les missions terminées — qui voyagent, elles — en lisant l'heure
   posée dans leur compte rendu (`report.fini`).

   On ne reconstruit que ce qu'on sait : une mission d'avant la session 19 n'a
   pas d'heure de fin, et laisse alors la valeur locale en place plutôt que de
   l'effacer (règle D-75, la relecture met à jour, elle ne remplace pas). */
function reconstruireReady() {
  if (!state.ready) state.ready = {};
  (state.missions || []).forEach(function (m) {
    if (m.status !== 'termine') return;
    var rep = state.reports[m.id];
    var at = rep && rep.fini;
    if (!at) return;
    var actuel = state.ready[m.prop];
    // Le ménage le plus récent gagne : c'est lui qui décrit l'état du logement.
    if (actuel && actuel.date > m.date) return;
    if (actuel && actuel.date === m.date && actuel.at >= at) return;
    state.ready[m.prop] = { date: m.date, at: at, mid: m.id, agent: m.taker || (rep && rep.agent) || null };
  });
}

/** Cette fiche de prestataire existe-t-elle encore ? */
function agentExiste(id) {
  return (state.agents || []).some(function (a) { return a.id === id; });
}

/* Les quatre logements de la démonstration d'origine. Ils ne peuvent pas être
   confondus avec un vrai logement : ceux créés depuis l'interface portent un
   identifiant fabriqué à partir de leur nom ('bmaison_des_pins_k3x9'). */
var IDS_DEMO = ['p1', 'p2', 'p3', 'p4'];

function resteDeDemo() {
  return (state.props || []).some(function (p) { return IDS_DEMO.indexOf(p.id) >= 0; });
}

/* Repartir de zéro : on jette tout ce qui décrit une activité — logements,
   séjours, missions, prestataires, stocks, avis — et on garde ce qui n'est
   à personne : la liste des prestations, les articles, la connexion en cours.
   Le cahier partagé est vidé séparément, par DB.viderDonnees(). */
function viderTout() {
  var auth = state.auth, me = state.me, mail = state.loginEmail;
  state = initialState();
  upgrade();
  state.auth = auth;
  state.me = me;
  state.loginEmail = mail;
  save();
}

/* ==========================================================================
   3. Utilitaires
   ========================================================================== */

function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  var p = String(iso).split('-');
  return parseInt(p[2], 10) + ' ' + MOIS[parseInt(p[1], 10) - 1];
}

function nights(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

/* Recherches tolérantes : un bien, un prestataire ou une prestation supprimé
   reste cité dans l'historique. On rend alors un objet de remplacement plutôt
   que `undefined`, pour que rien ne casse à l'affichage. */
/** Les couleurs d'une plateforme, avec un repli sûr. Aucun écran ne doit
    tomber parce qu'une réservation vient d'ailleurs, ou de nulle part. */
function platCouleurs(nom) {
  return PLATS[nom] || PLATS['Direct'];
}

function prop(id) {
  return state.props.find(function (p) { return p.id === id; }) ||
    { id: id, name: 'Bien supprimé', short: 'Supprimé', city: '', address: '', color: '#A4978C', tint: '#EFEAE2', gone: true };
}
function agent(id) {
  return state.agents.find(function (a) { return a.id === id; }) ||
    { id: id, name: id || 'Prestataire supprimé', init: '··', role: '', since: '', note: '—', email: '', iban: '—', avatarBg: '#EFEAE2', avatarFg: '#8A7D72', roleBg: '#EFEAE2', roleFg: '#8A7D72', props: [], gone: true };
}
function service(key) {
  return state.services.find(function (s) { return s.key === key; }) ||
    { key: key, label: 'Prestation supprimée', duration: '', gone: true };
}
function mission(id) { return state.missions.find(function (m) { return m.id === id; }); }
function rooms(pid) { return state.checklists[pid] || []; }
function resasOf(pid) { return state.resas[pid] || []; }

/* --------------------------------------------------------------------------
   Dates : petits calculs sur des chaînes « AAAA-MM-JJ »
   -------------------------------------------------------------------------- */

function jourPlus(iso, n) {
  var d = new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000);
  return d.toISOString().slice(0, 10);
}
function premierJourDuMois(iso) { return iso.slice(0, 7) + '-01'; }
function moisDe(iso) { return iso.slice(0, 7); }
function nbJoursMois(mois) {
  var y = parseInt(mois.slice(0, 4), 10), m = parseInt(mois.slice(5, 7), 10);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function moisPlus(mois, n) {
  var y = parseInt(mois.slice(0, 4), 10), m = parseInt(mois.slice(5, 7), 10) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + String(m + 1).padStart(2, '0');
}
var MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function moisLabel(mois) {
  return MOIS_LONG[parseInt(mois.slice(5, 7), 10) - 1] + ' ' + mois.slice(0, 4);
}

/* --------------------------------------------------------------------------
   Réservations : un format commun, quelle que soit la source

   Une réservation porte toujours : id (le nôtre), uid (celui de la plateforme,
   pour ne pas la créer deux fois), source, plat, guest, guests, start, end,
   montant (null = calculé au prix par nuit) et statut.
   -------------------------------------------------------------------------- */

/* L'identifiant d'un séjour sert aussi d'adresse au **lien personnel** envoyé
   au voyageur (session 16, D-80) : il ne doit donc pas être devinable. Les
   quatre caractères tirés au hasard de la session 10 ne suffisaient plus —
   on en met douze, tirés par le générateur du navigateur quand il existe.
   Les séjours plus anciens gardent leur identifiant court : le code d'accès
   et le Wi-Fi restent, eux, protégés par les dates du séjour (D-51). */
function jeton(n) {
  var alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var out = '';
  if (window.crypto && window.crypto.getRandomValues) {
    var a = new Uint8Array(n);
    window.crypto.getRandomValues(a);
    for (var i = 0; i < n; i++) out += alpha[a[i] % alpha.length];
    return out;
  }
  while (out.length < n) out += Math.random().toString(36).slice(2);
  return out.slice(0, n);
}

function slugResa(pid, r) { return 'r_' + pid + '_' + r.start + '_' + jeton(12); }

/** Toutes les réservations, à plat, avec leur logement, dans l'ordre du temps. */
function allResas() {
  var out = [];
  state.props.forEach(function (p) {
    resasOf(p.id).forEach(function (r) { out.push({ pid: p.id, r: r }); });
  });
  return out.sort(function (a, b) { return a.r.start < b.r.start ? -1 : a.r.start > b.r.start ? 1 : 0; });
}

function resaById(id) {
  var f = allResas().find(function (x) { return x.r.id === id; });
  return f || null;
}

/** Montant d'un séjour : celui saisi, sinon nuits × prix par nuit du logement. */
function montantResa(pid, r) {
  if (r.montant !== null && r.montant !== undefined && r.montant !== '') return Math.round(r.montant);
  var prix = parseInt((state.info[pid] || {}).prixNuit, 10) || 0;
  return prix * nights(r.start, r.end);
}
/** Le montant a-t-il été calculé, faute de chiffre venu de la plateforme ? */
function montantEstime(r) { return r.montant === null || r.montant === undefined || r.montant === ''; }

/** Met une réservation brute (formulaire, iCal, Beds24) au format commun. */
function normaliserResa(brut, source, pid) {
  var r = {
    id: brut.id || '',
    uid: brut.uid || '',
    source: source || 'manuel',
    plat: PLATS[brut.plat] ? brut.plat : 'Direct',
    guest: String(brut.guest || '').trim() || 'Voyageur',
    guests: Math.max(1, parseInt(brut.guests, 10) || 1),
    start: brut.start,
    end: brut.end,
    montant: (brut.montant === '' || brut.montant === undefined || brut.montant === null)
      ? null : Math.round(parseFloat(brut.montant) || 0),
    statut: brut.statut === 'annule' ? 'annule' : 'confirme',

    // Coordonnées du voyageur. `tel4` est ce que la plateforme veut bien
    // donner ; Beds24 rendant le numéro complet, on en déduit les 4 chiffres.
    tel: String(brut.tel || '').trim(),
    tel4: quatreChiffres(brut.tel4 || brut.tel),
    mail: String(brut.mail || '').trim(),
    arriveePrevue: String(brut.arriveePrevue || '').trim(),
    guestOk: !!brut.guestOk
  };
  if (!r.id) r.id = slugResa(pid, r);
  return r;
}

/** Un nom comparable : sans accents, sans majuscules, sans ponctuation.
    « Émilie DUPONT », « emilie dupont » et « Emilie  Dupont » sont le même
    nom (session 18). Même règle que `nom_simple()` côté base. */
function nomSimple(t) {
  return String(t || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Les 4 derniers chiffres d'un numéro, quelle que soit sa mise en forme
    (« 06 12 34 42 71 », « +33612344271 » ou déjà « 4271 »). */
function quatreChiffres(v) {
  var d = String(v || '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : '';
}

/** Mission de ménage créée au départ du voyageur (règle D-06). */
function creerMissionDepart(pid, resa) {
  var sv = state.services[0];
  if (!sv) return null;
  var suivante = resasOf(pid).find(function (x) { return x.start === resa.end && x !== resa; });
  var inf = state.info[pid] || {};
  var m = {
    id: slug(resa.guest, 'm'), prop: pid, type: sv.key, date: resa.end,
    dateLabel: resa.end === TODAY ? 'Aujourd’hui' : fmtDate(resa.end),
    windowLabel: (inf.checkout || '11:00') + ' → ' + (inf.checkin || '16:00'),
    price: (state.tariffs[pid] || {})[sv.key] || 0,
    status: 'dispo',
    urgent: suivante ? 'Turnover · arrivée ' + (inf.checkin || '16:00') : '',
    turnover: !!suivante,
    note: '',
    fromResa: resaKey(pid, resa),
    res: { plat: resa.plat, guest: resa.guest, guests: resa.guests, nights: nights(resa.start, resa.end) },
    next: suivante ? { guest: suivante.guest, guests: suivante.guests, at: inf.checkin || '16:00' } : null
  };
  state.missions.push(m);
  state.missions.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return m;
}

/* QUI ARRIVE DERRIÈRE ? (corrigé en session 15)
   Une réservation qui commence le jour où une autre se termine fait de la
   mission de ce jour-là un « turnover » : le prestataire doit savoir qui
   arrive, combien ils sont, et à quelle heure.
   Cette information n'était posée qu'au moment de créer la mission —
   c'est-à-dire seulement si le séjour suivant était DÉJÀ saisi. Or on saisit
   les séjours dans l'ordre du calendrier : le suivant n'existe jamais encore.
   Résultat, aucune mission n'apprenait jamais qui arrivait. On la pose donc
   aussi dans l'autre sens, quand le séjour suivant est enregistré. */
function rattacherArrivee(pid, resa) {
  var inf = state.info[pid] || {};
  var heure = resa.arriveePrevue || inf.checkin || '16:00';
  state.missions.forEach(function (m) {
    if (m.prop !== pid || m.date !== resa.start || m.status === 'termine') return;
    m.next = { guest: resa.guest, guests: resa.guests, at: heure };
    m.turnover = true;
    if (!m.urgent) m.urgent = 'Turnover · arrivée ' + heure;
  });
}

/** Ajoute une réservation déjà normalisée et crée sa mission de départ. */
function ajouterResa(pid, resa) {
  state.resas[pid] = resasOf(pid).concat([resa]).sort(function (a, b) {
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  });
  creerMissionDepart(pid, resa);
  rattacherArrivee(pid, resa);
  return resa;
}

/** Retire une réservation et, si elle n'a pas été prise, sa mission de départ. */
function retirerResa(pid, resa) {
  state.resas[pid] = resasOf(pid).filter(function (x) { return x !== resa; });
  var cle = resaKey(pid, resa);
  var missionsRetirees = state.missions.filter(function (m) {
    return m.fromResa === cle && m.status === 'dispo';
  }).map(function (m) { return m.id; });
  state.missions = state.missions.filter(function (m) {
    return !(m.fromResa === cle && m.status === 'dispo');
  });

  /* LE CAHIER PARTAGÉ DOIT L'APPRENDRE (session 16).
     `pousser()` ne sait qu'ajouter et modifier : sans cette suppression
     explicite, le séjour effacé revenait à la première relecture, et rien de
     ce qu'on supprimait ne tenait. */
  if (typeof DB !== 'undefined' && DB.estDispo() && DB.profil()) {
    missionsRetirees.forEach(function (id) { DB.supprimerMission(id); });
    DB.supprimerResa(resa.id);
  }

  // Plus personne n'arrive ce jour-là : la mission de la veille n'est plus
  // un turnover, et ne doit plus annoncer un voyageur qui ne viendra pas.
  var encore = resasOf(pid).some(function (x) { return x.start === resa.start; });
  if (encore) return;
  state.missions.forEach(function (m) {
    if (m.prop !== pid || m.date !== resa.start || m.status === 'termine') return;
    m.next = null;
    m.turnover = false;
    if (/^Turnover/.test(m.urgent || '')) m.urgent = '';
  });
}

/* Fusion d'un lot de réservations venu d'une source extérieure (iCal, Beds24).
   Rien ne l'appelle encore : le navigateur ne peut pas interroger ces services
   (voir CONNECTEURS et D-42). C'est la porte d'entrée prête pour le serveur,
   et elle est écrite ici pour que les écrans n'aient rien à changer ce jour-là.

   Règle de rapprochement : l'identifiant d'origine (uid). À défaut, un séjour
   qui a les mêmes dates dans le même logement est considéré comme le même.
   Rend le détail de ce qui a été fait, pour l'afficher au propriétaire. */
function fusionnerResas(pid, lot, source) {
  var bilan = { ajoutees: 0, majs: 0, annulees: 0, inchangees: 0 };

  lot.forEach(function (brut) {
    var incoming = normaliserResa(brut, source, pid);
    var connue = resasOf(pid).find(function (x) {
      return (incoming.uid && x.uid === incoming.uid) ||
        (!incoming.uid && x.start === incoming.start && x.end === incoming.end);
    });

    if (!connue) {
      if (incoming.statut === 'annule') return;      // annulation d'un séjour inconnu : rien à faire
      ajouterResa(pid, incoming);
      bilan.ajoutees++;
      return;
    }

    if (incoming.statut === 'annule') {
      retirerResa(pid, connue);
      bilan.annulees++;
      return;
    }

    var change = ['plat', 'guest', 'guests', 'start', 'end', 'montant'].some(function (k) {
      return incoming[k] !== null && connue[k] !== incoming[k];
    });
    if (!change) { bilan.inchangees++; return; }

    // Les dates ont bougé : la mission de départ doit suivre.
    var datesBougent = connue.end !== incoming.end;
    if (datesBougent) retirerResa(pid, connue);
    ['plat', 'guest', 'guests', 'start', 'end', 'uid', 'source'].forEach(function (k) { connue[k] = incoming[k]; });
    if (incoming.montant !== null) connue.montant = incoming.montant;

    // Ce que le voyageur a saisi lui-même ne doit jamais être effacé par une
    // synchronisation : la plateforme ne le connaît pas (D-48). On ne recopie
    // donc que les valeurs réellement apportées par le lot.
    ['tel', 'tel4', 'mail', 'arriveePrevue'].forEach(function (k) {
      if (incoming[k]) connue[k] = incoming[k];
    });
    if (datesBougent) { state.resas[pid] = resasOf(pid).concat([connue]); creerMissionDepart(pid, connue); }
    bilan.majs++;
  });

  state.resas[pid] = resasOf(pid).sort(function (a, b) {
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  });
  return bilan;
}

/** Nuits d'un séjour qui tombent dans un mois donné (un séjour peut être à cheval). */
function nuitsDansMois(r, mois) {
  var n = 0;
  for (var j = r.start; j < r.end; j = jourPlus(j, 1)) if (moisDe(j) === mois) n++;
  return n;
}

/* Articles de stock : liste à plat, noms de catégories, et regroupement. */
function arts() { return state.articles; }
function groups() {
  var out = [];
  state.articles.forEach(function (a) { if (out.indexOf(a.group) < 0) out.push(a.group); });
  return out;
}
function grouped() {
  return groups().map(function (g) {
    return [g, state.articles.filter(function (a) { return a.group === g; })];
  });
}

/* Biens confiés à un prestataire : missions pour une femme de ménage,
   calendrier pour une remise des clés. */
/* Les logements ouverts au COMPTE connecté, tels que le cahier partagé les
   voit — c'est-à-dire tels qu'ils décident réellement de ce qui s'affiche.
   Sur le téléphone du prestataire, c'est cette liste qui fait foi (D-69) : sa
   fiche locale peut être en retard, ou porter un ancien nom. Sans ce repli,
   il voyait « aucun logement confié » alors que le propriétaire lui avait
   tout coché — et que la base, elle, lui envoyait bien ses missions. */
function propsDuCompte() {
  if (typeof DB === 'undefined' || !DB.estDispo()) return null;
  var p = DB.profil();
  return p && p.role !== 'owner' && Array.isArray(p.props) ? p.props : null;
}

function allowedProps(agentId) {
  var a = state.agents.find(function (x) { return x.id === agentId; });
  var fiche = a && Array.isArray(a.props) ? a.props : null;
  if (fiche && fiche.length) return fiche;

  // C'est moi, et ma fiche ne dit rien : je crois le compte plutôt que le vide.
  if (state.auth === 'presta' && agentId === state.me) {
    var compte = propsDuCompte();
    if (compte && compte.length) return compte;
  }
  return fiche || [];
}

/** Ce prestataire remet-il les clés (au lieu de faire le ménage) ? */
function isCles(agentId) { return agent(agentId).kind === 'cles'; }

/** Voit-il ce logement (calendrier, adresse, voyageurs) ? */
function maySee(agentId, pid) { return allowedProps(agentId).indexOf(pid) >= 0; }

/** Peut-il prendre une mission sur ce logement ? Jamais pour une remise des
    clés : ce métier ne passe pas par les missions. */
function mayTake(agentId, pid) { return !isCles(agentId) && maySee(agentId, pid); }

/* Prestations autorisées (session 12). Une femme de ménage n'a rien à faire
   des missions de jardinage, et inversement : chacun ne voit que son métier,
   pour que son téléphone reste lisible. Sans liste enregistrée, il voit tout —
   c'est le comportement d'avant, et il vaut mieux retirer un droit que d'en
   oublier un (même règle que les logements, D-28). */
function allowedServices(agentId) {
  var a = state.agents.find(function (x) { return x.id === agentId; });
  return a && Array.isArray(a.services) ? a.services : state.services.map(function (s) { return s.key; });
}

/** Cette prestation le concerne-t-elle ? */
function mayDo(agentId, key) { return allowedServices(agentId).indexOf(key) >= 0; }

/** Peut-il prendre CETTE mission ? Le logement **et** la prestation. */
function mayTakeMission(agentId, m) { return mayTake(agentId, m.prop) && mayDo(agentId, m.type); }

/** Écran d'accueil du compte connecté. */
function homePath() {
  if (state.auth === 'owner') return '#/admin';
  if (state.auth === 'presta') {
    if (!accesOuvert()) return '#/app/attente';
    return isCles(state.me) ? '#/app/calendrier' : '#/app/missions';
  }
  return '#/login';
}

/* Le compte est bien créé, mais le propriétaire ne lui a encore confié aucun
   logement : il n'y a littéralement rien à afficher, et la base ne lui
   laisserait rien lire non plus. Mieux vaut le dire que montrer du vide. */
function accesOuvert() {
  return allowedProps(state.me).length > 0;
}

/* Entrée dans l'application avec un vrai compte : c'est la fiche du compte
   (table `profiles`) qui décide du rôle. Il n'y a plus d'autre porte : la
   connexion de démonstration, qui laissait entrer sans mot de passe, a été
   retirée en session 14 (D-63). */
function entrerAvecProfil(p) {
  state.auth = p.role === 'owner' ? 'owner' : 'presta';
  if (state.auth === 'presta') {
    var moi = DB.identifiantDeCompte(p);
    state.me = moi;
    state.openAgent = moi;
  }
  state.loginPwd = '';
  state.loginErreur = '';
  if (typeof DB !== 'undefined') DB.ecouter(surChangementDistant);
  save();
  location.replace(homePath());
  render();
  if (state.auth === 'owner') relireInvitations();
}

/* Les invitations encore en attente, relues depuis le cahier. Le propriétaire
   seul peut les lire ; pour tous les autres la liste reste vide, et l'écran
   des prestataires se comporte comme si personne n'était invité. */
function relireInvitations() {
  if (typeof DB === 'undefined' || !DB.estDispo()) return Promise.resolve();
  return DB.invitations().then(function (l) {
    state.invits = (l || []).filter(function (i) { return !i.accepted_at; });

    // Un lien gardé sur cet ordinateur alors que l'invitation a été acceptée
    // (ou annulée depuis un autre appareil) ne doit plus s'afficher.
    var vivants = {};
    state.invits.forEach(function (i) { if (i.legacy_id) vivants[i.legacy_id] = true; });
    Object.keys(state.invitLien || {}).forEach(function (id) {
      if (!vivants[id]) delete state.invitLien[id];
    });

    save();
    render();
  }).catch(function () { /* pas grave : l'écran reste utilisable */ });
}

/* Quelqu'un d'autre a écrit dans le grand cahier : on relit et on redessine.
   Le champ en cours de frappe est préservé par `render()` (§3.1 bis). */
var relectureEnCours = false;
function surChangementDistant() {
  if (relectureEnCours) return;
  relectureEnCours = true;
  // Le prestataire vient peut-être de déposer une photo : les adresses gardées
  // en mémoire sont donc à redemander (lot 2).
  photosParMission = {};
  photosDemandees = {};
  DB.charger()
    .then(function () { render(); })
    .catch(function () { })
    .then(function () { relectureEnCours = false; });
}

/* Nom court pour les en-têtes de colonnes : on coupe entre deux mots,
   jamais au milieu d'un mot. */
function shortName(nom) {
  var mots = String(nom).trim().split(/\s+/), out = '';
  for (var i = 0; i < mots.length; i++) {
    if (out && (out + ' ' + mots[i]).length > 14) break;
    out = out ? out + ' ' + mots[i] : mots[i];
  }
  return out.slice(0, 16);
}

/* Identifiant unique et lisible, dérivé d'un texte saisi. */
function slug(txt, prefix) {
  var base = String(txt).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
  return (prefix || '') + (base || 'x') + '_' + Date.now().toString(36).slice(-4);
}

function stepIds(pid) {
  return rooms(pid).reduce(function (a, r) {
    return a.concat(r.steps.map(function (s) { return s.id; }));
  }, []);
}

function photoCount(m) {
  var ph = state.photos[m.id] || {};
  return stepIds(m.prop).filter(function (s) { return ph[s]; }).length;
}

/* --------------------------------------------------------------------------
   Séjours en cours, départs signalés, logement prêt
   -------------------------------------------------------------------------- */

/** Heure de l'horloge, au format 09:05. */
function nowHM() {
  var d = new Date();
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}

/** Identifiant d'un séjour : il n'y a pas d'identifiant sur les réservations. */
function resaKey(pid, r) { return pid + ':' + r.start + ':' + r.end; }

/* Le jour d'un turnover, deux voyageurs différents ouvrent le même livret :
   celui qui s'en va et celui qui arrive. On les distingue par les dates.

   stayLeaving  — celui qui part aujourd'hui : bouton de départ, note du séjour.
   stayCurrent  — celui qui occupe le logement : note de la propreté trouvée.
   stayArriving — celui qui arrive aujourd'hui : message « le logement est prêt ». */

function stayLeaving(pid) {
  return resasOf(pid).find(function (r) { return r.end === TODAY; }) || null;
}

function stayCurrent(pid) {
  return resasOf(pid).find(function (r) { return r.start <= TODAY && TODAY < r.end; }) || null;
}

function stayArriving(pid) {
  return resasOf(pid).find(function (r) { return r.start === TODAY; }) || null;
}

/* Depuis la session 11, la porte d'entrée sait **exactement** qui regarde le
   livret : inutile de deviner par les dates quand on a le renseignement.
   Les trois fonctions ci-dessous partent du séjour du visiteur quand il est
   connu, et retombent sur la déduction par dates sinon (aperçu du
   propriétaire, ou visiteur qui ne s'est pas identifié). Rend D-31 caduque
   pour tout voyageur passé par `#/bienvenue`. */

/* CLOISONNER LES VOYAGEURS (session 17 — D-85)

   Jusqu'ici, quand on ne savait pas qui regardait le livret, on **devinait
   par les dates**. C'était le repli assumé de D-52, et D-31 restait ouverte
   pour ce cas. Le jour d'un turnover, cela donnait exactement ce que le
   propriétaire a constaté : **le voyageur qui arrive voyait le formulaire de
   notation du voyageur qui part, et le commentaire que celui-ci venait de
   laisser** — « séjour bruyant, voisins pénibles » sous les yeux du suivant.

   Deviner n'est plus nécessaire : depuis la session 16, chaque séjour a son
   **lien personnel** (D-80). On ne devine donc plus. Un visiteur qu'on ne
   reconnaît pas ne voit **aucun formulaire et aucun avis**, seulement une
   invitation à retrouver son séjour.

   Une seule exception, clairement annoncée à l'écran : le **propriétaire**
   qui regarde son propre livret depuis l'administration. C'est un aperçu, il
   est chez lui, et il doit pouvoir tout voir. */

/** Le propriétaire regarde-t-il l'aperçu général (et non le lien d'un
    voyageur précis) ? Seul cas où la déduction par dates subsiste. */
function apercuGeneral() {
  return state.auth === 'owner' && !state.apercuSejour;
}

/** Le séjour du visiteur, s'il s'est identifié et qu'il regarde bien ce
    logement-là. Rend null quand on ne sait pas qui c'est. */
function sejourDuVisiteur(pid) {
  if (state.auth === 'owner') {
    // Le propriétaire a ouvert le lien personnel d'un voyageur : il doit voir
    // ce que CE voyageur verra, pas la somme de tout le monde.
    if (!state.apercuSejour) return null;
    var a = resaById(state.apercuSejour);
    return a && a.pid === pid ? a.r : null;
  }
  var f = sejourDuPass();
  return f && f.pid === pid ? f.r : null;
}

function visiteurLeaving(pid) {
  var v = sejourDuVisiteur(pid);
  if (v) return v.end === TODAY ? v : null;
  return apercuGeneral() ? stayLeaving(pid) : null;
}

function visiteurCurrent(pid) {
  var v = sejourDuVisiteur(pid);
  if (v) return (v.start <= TODAY && TODAY < v.end) ? v : null;
  return apercuGeneral() ? stayCurrent(pid) : null;
}

function visiteurArriving(pid) {
  var v = sejourDuVisiteur(pid);
  if (v) return v.start === TODAY ? v : null;
  return apercuGeneral() ? stayArriving(pid) : null;
}

/** Le séjour concerné par une note : la propreté est notée par celui qui
    occupe le logement, le séjour par celui qui s'en va. */
function stayForAvis(pid, kind) {
  return kind === 'menage' ? visiteurCurrent(pid) : visiteurLeaving(pid);
}

/** Le voyageur a-t-il signalé son départ ? Rend l'heure, ou null. */
function departAt(pid, r) {
  return (r && state.departs[resaKey(pid, r)]) || null;
}

/** Un logement est libre pour une mission dès que le voyageur qui part
    ce jour-là a appuyé sur « J'ai quitté le logement ». */
function freeAt(m) {
  var r = resasOf(m.prop).find(function (x) { return x.end === m.date && departAt(m.prop, x); });
  return r ? departAt(m.prop, r) : null;
}

/** Durée d'une prestation dans ce logement (le nom reste commun, la durée non). */
function duration(pid, key) {
  var d = (state.durations[pid] || {})[key];
  return d !== undefined && d !== '' ? d : (service(key).duration || '');
}

/* Une arrivée anticipée ne descend jamais sous cette heure : un ménage bouclé
   à 8 h du matin ne doit pas faire venir le voyageur à 8 h. */
var EARLY_FLOOR = '12:00';

/** Heure à laquelle le prochain voyageur peut réellement entrer.
    Rend null si rien n'est avancé par rapport à l'heure officielle.

    Trois conditions, toutes nécessaires :
      1. quelqu'un arrive aujourd'hui dans ce logement ;
      2. le ménage a été fait **le jour même de cette arrivée** — un ménage
         terminé trois jours plus tôt n'avance rien du tout ;
      3. le bien autorise l'arrivée anticipée. */
function readyInfo(pid) {
  var arr = stayArriving(pid);
  if (!arr) return null;

  var rd = state.ready[pid];
  if (!rd || rd.date !== arr.start) return null;

  var inf = state.info[pid] || {};
  if (inf.early === false) return null;

  var officielle = inf.checkin || '16:00';
  var at = rd.at < EARLY_FLOOR ? EARLY_FLOOR : rd.at;   // jamais avant midi
  if (at >= officielle) return null;                    // rien à gagner

  return { at: at, fin: rd.at, avance: true, plancher: rd.at < EARLY_FLOOR, agent: rd.agent };
}

/* --------------------------------------------------------------------------
   Porte d'entrée du livret (session 11 — D-46 à D-48)

   Un seul lien, `#/bienvenue`, envoyé à tous les voyageurs de tous les
   logements et de toutes les plateformes. Le voyageur se situe lui-même :
   date d'arrivée + 4 derniers chiffres de son téléphone.

   Deux niveaux d'accès :
     'complet' — les 4 chiffres correspondent, ou le propriétaire a confirmé ;
     'partiel' — le voyageur s'est déclaré sans pouvoir le prouver : il voit
                 tout le livret SAUF le code d'accès et le Wi-Fi (D-47).
   -------------------------------------------------------------------------- */

/** Séjours correspondant à une date d'arrivée et à 4 chiffres, tous logements
    confondus. Tolérant : un voyageur déjà sur place donne souvent la date du
    jour plutôt que celle de son arrivée. */
function trouverSejour(date, tel4) {
  var q = quatreChiffres(tel4);
  if (!date || q.length !== 4) return [];
  return allResas().filter(function (x) {
    var r = x.r;
    if (r.statut === 'annule') return false;
    // Un séjour passé ne se retrouve plus : sinon le souvenir posé serait
    // aussitôt oublié (voir sejourDuPass) et le voyageur tournerait en rond.
    if (r.end < TODAY) return false;
    if (quatreChiffres(r.tel4) !== q) return false;
    return r.start === date || (r.start <= date && date < r.end);
  });
}

/** Séjours d'un logement autour d'une date, pour rattacher une demande à
    confirmer (voie B : le voyageur n'a pas ses 4 chiffres). */
function sejourDuJour(pid, date) {
  if (!date) return null;
  return resasOf(pid).find(function (r) {
    return r.statut !== 'annule' && (r.start === date || (r.start <= date && date < r.end));
  }) || null;
}

/** Le séjour désigné par le souvenir posé dans le navigateur du voyageur.
    Rend null — et efface le souvenir — dès que le séjour est terminé. */
function sejourDuPass() {
  var g = state.guestPass;
  if (!g || !g.resa) return null;
  var f = resaById(g.resa);
  if (!f || f.r.statut === 'annule' || f.r.end < TODAY) return null;
  return f;
}

/* Le séjour est-il en cours ? Le jour du départ compte encore : le voyageur
   est dans le logement jusqu'à l'heure de départ, et peut sortir puis rentrer.
   Le livret reste **un livret par logement**, partagé par tous les séjours
   successifs (D-31) : les dates sont donc le vrai garde-fou du code d'accès. */
function dansLesDates(r) {
  return r.start <= TODAY && TODAY <= r.end;
}

/** Niveau d'accès du visiteur sur le livret d'un logement donné.
      null        — on ne sait pas qui c'est ;
      'partiel'   — il s'est déclaré, le propriétaire n'a pas encore confirmé ;
      'horsdates' — reconnu, mais son séjour n'a pas commencé (ou est fini) ;
      'complet'   — reconnu et sur place.
    Le propriétaire voit tout : c'est son aperçu. */
function niveauAcces(pid) {
  if (state.auth === 'owner') {
    // Aperçu du lien d'un voyageur précis : on applique **ses** dates, sinon
    // l'aperçu montrerait un code que ce voyageur-là ne verra jamais (D-85).
    if (state.apercuSejour) {
      var a = resaById(state.apercuSejour);
      if (!a || a.pid !== pid) return null;
      return dansLesDates(a.r) ? 'complet' : 'horsdates';
    }
    return 'complet';
  }
  var f = sejourDuPass();
  if (!f || f.pid !== pid) return null;

  // Une confirmation du propriétaire fait passer le séjour en accès complet,
  // même si le souvenir posé sur le téléphone disait « partiel ».
  var confirme = f.r.guestOk || state.guestPass.niveau === 'complet';
  if (!confirme) return 'partiel';
  return dansLesDates(f.r) ? 'complet' : 'horsdates';
}

/** Le code d'accès et le Wi-Fi ne s'affichent qu'au voyageur reconnu **et**
    seulement pendant les dates de son séjour (D-47, D-51). */
function peutVoirSensible(pid) { return niveauAcces(pid) === 'complet'; }

/** Demandes de confirmation en attente, les plus récentes d'abord. */
function demandesEnAttente() {
  return state.acces.filter(function (d) { return d.statut === 'attente'; })
    .slice().reverse();
}

/** Le voyageur s'est déclaré sans pouvoir le prouver : on enregistre la
    demande et on lui ouvre le livret en accès partiel, tout de suite. */
function demanderAcces(pid, date, nom) {
  var r = sejourDuJour(pid, date);
  var d = {
    id: 'ac_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    pid: pid, resa: r ? r.id : '', nom: String(nom || '').trim() || 'Voyageur',
    date: date, at: nowHM(), statut: 'attente'
  };
  state.acces.push(d);
  state.guestPass = { resa: r ? r.id : '', pid: pid, niveau: 'partiel', at: nowHM(), demande: d.id };

  /* ET SURTOUT : ON LE DIT AU PROPRIÉTAIRE (session 19, audit du stockage).
     La demande restait sur le téléphone du voyageur — celui qui la dépose est
     précisément celui qui ne peut rien en faire. Le propriétaire ne l'a donc
     jamais vue, et le voyageur attendait une confirmation qui ne pouvait pas
     venir. Porte étroite `demander_acces()` du script 09.
     On garde l'identifiant rendu par la base : c'est lui qui fera foi quand
     le propriétaire validera, depuis son écran. */
  if (typeof DB !== 'undefined' && DB.estDispo()) {
    DB.demanderAcces(pid, date, d.nom).then(function (id) {
      if (!id) return;
      if (state.guestPass && state.guestPass.demande === d.id) state.guestPass.demande = id;
      d.id = id;
      save();
    });
  }
  return d;
}

/** Le propriétaire reconnaît son voyageur : le séjour passe en accès complet
    et le nom déclaré remplace « Voyageur Airbnb » s'il n'y avait rien. */
function validerAcces(id) {
  var d = state.acces.find(function (x) { return x.id === id; });
  if (!d) return;
  d.statut = 'valide';
  var f = d.resa ? resaById(d.resa) : null;
  if (f) {
    f.r.guestOk = true;
    if (!f.r.guest || f.r.guest === 'Voyageur') f.r.guest = d.nom;
  }
  if (state.guestPass && state.guestPass.demande === id) state.guestPass.niveau = 'complet';
}

/* Le séjour est établi : on pose le souvenir dans le navigateur du voyageur et
   on prépare le formulaire. Séparé de `ouvrirSejour()` depuis la session 16 :
   le lien personnel a besoin de poser le souvenir **pendant** un dessin
   d'écran, où un `render()` de plus se rappellerait lui-même sans fin. */
function poserSejour(f) {
  state.guestPass = { resa: f.r.id, pid: f.pid, niveau: 'complet', at: nowHM(), demande: '' };
  f.r.guestOk = true;
  prefillGform(f, '');
  state.bienvenue.etape = 'form';
  state.bienvenue.erreur = '';
}

/* LE LIVRET VENU DU CAHIER PARTAGÉ (lot 3 — session 18, D-89)

   Le voyageur n'a pas de compte, et son téléphone ne contient rien de ce
   projet. Le cahier partagé lui répond quand même, par une **porte étroite** :
   `sejour_par_lien()` rend le logement, son livret, les dates du séjour, et —
   seulement pendant ces dates — le code d'accès et le Wi-Fi.

   Plutôt que d'inventer un deuxième chemin d'affichage, on **installe** ce que
   le serveur renvoie dans `state`, exactement à la place où les écrans le
   cherchent déjà. Tous les écrans du livret fonctionnent alors sans une ligne
   de changement, et le voyageur retrouve sa page même hors réseau la fois
   suivante. On n'efface jamais rien au passage (règle D-63). */
function installerSejour(l) {
  var pid = l.property_id;

  if (!state.props.some(function (p) { return p.id === pid; })) {
    state.props.push({
      id: pid, name: l.property_name || 'Logement',
      short: (l.property_name || 'Logement').split(' ')[0],
      city: l.city || '', address: l.address || '',
      color: l.color || C.terracotta, tint: l.tint || '#F6E9E1'
    });
  }

  // Le code et le Wi-Fi ne sont renseignés que si la base a bien voulu les
  // rendre — c'est-à-dire pendant le séjour. Hors dates, ils valent vide, et
  // c'est le comportement voulu, pas une donnée manquante.
  state.info[pid] = Object.assign({}, l.info || {}, { code: l.code || '', wifi: l.wifi || '' });
  state.livret[pid] = l.livret || lvVide();

  var r = normaliserResa({
    id: l.reservation_id, plat: 'Direct', guest: l.guest, guests: l.guests,
    start: l.start_date, end: l.end_date, tel: l.tel, mail: l.mail,
    arriveePrevue: l.arrivee_prevue, guestOk: true
  }, 'manuel', pid);
  r.demarchable = !!l.demarchable;

  var liste = (state.resas[pid] || []).filter(function (x) { return x.id !== r.id; });
  liste.push(r);
  state.resas[pid] = liste.sort(function (a, b) { return a.start < b.start ? -1 : 1; });

  if (l.depart_at) state.departs[resaKey(pid, r)] = l.depart_at;

  return { pid: pid, r: r };
}

/** Demande au cahier partagé le séjour d'un lien personnel, puis l'installe. */
function chargerSejourEnLigne(rid) {
  if (typeof DB === 'undefined' || !DB.estDispo()) {
    state.sejourNet = { rid: rid, etat: 'absent' };
    render();
    return;
  }
  DB.sejourParLien(rid)
    .then(function (l) {
      if (!l) { state.sejourNet = { rid: rid, etat: 'absent' }; render(); return; }
      var f = installerSejour(l);
      poserSejour(f);
      state.sejourNet = { rid: rid, etat: 'ok' };
      save();
      render();

      /* L'ARRIVÉE ANTICIPÉE (session 19). Le voyageur n'a pas le droit de lire
         les missions : sans ce second guichet, il ne pouvait pas savoir que le
         ménage était déjà fait, et l'écran lui annonçait l'heure officielle.
         La réponse arrive après coup, sans faire attendre le livret. */
      DB.menageFini(rid).then(function (mf) {
        if (!mf) return;
        state.ready[f.pid] = { date: mf.date, at: mf.at, mid: null, agent: null };
        save();
        render();
      });
    })
    .catch(function (e) {
      state.sejourNet = { rid: rid, etat: 'erreur', msg: DB.messageClair(e) };
      render();
    });
}

/** Les 4 chiffres correspondent : accès complet, et on propose le formulaire. */
function ouvrirSejour(f) {
  poserSejour(f);
  save();
  render();
}

/** Le formulaire part de ce qu'on sait déjà, pour n'avoir qu'à compléter. */
function prefillGform(f, nom) {
  var r = f ? f.r : null;
  state.gform = {
    nom: (r && r.guest && r.guest !== 'Voyageur' ? r.guest : '') || nom || '',
    tel: (r && r.tel) || '',
    mail: (r && r.mail) || '',
    guests: r && r.guests ? String(r.guests) : '',
    arrivee: (r && r.arriveePrevue) || '',
    optin: !!(r && r.demarchable)      // jamais coché d'avance (D-56)
  };
}

/* Les informations données par le voyageur doivent redescendre sur la mission
   de ménage du jour de son départ — c'est là que le prestataire les lit —
   et sur la mission de la veille, dont il est le voyageur « suivant ». */
function majMissionsDepuisResa(pid, r) {
  state.missions.forEach(function (m) {
    if (m.prop !== pid || m.status === 'termine') return;
    if (m.res && m.date === r.end) {
      m.res.guest = r.guest;
      m.res.guests = r.guests;
    }
    if (m.next && m.date === r.start) {
      m.next.guest = r.guest;
      m.next.guests = r.guests;
      if (r.arriveePrevue) m.next.at = r.arriveePrevue;
    }
  });
}

/* --------------------------------------------------------------------------
   Calendrier de la remise des clés
   -------------------------------------------------------------------------- */

var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « Aujourd’hui », « Demain », sinon « vendredi 31 juil. ». */
function jourLabel(iso) {
  if (iso === TODAY) return 'Aujourd’hui';
  var d = new Date(Date.parse(iso + 'T00:00:00Z'));
  var demain = new Date(Date.parse(TODAY + 'T00:00:00Z') + 86400000);
  if (d.getTime() === demain.getTime()) return 'Demain';
  return JOURS[d.getUTCDay()] + ' ' + fmtDate(iso);
}

/** Arrivées et départs des logements confiés à un prestataire de remise des
    clés, dans l'ordre du temps. Un séjour donne deux mouvements : le voyageur
    qui arrive (on lui remet les clés) et celui qui part (on les récupère). */
function keyEvents(agentId) {
  var out = [];
  allowedProps(agentId).forEach(function (pid) {
    var inf = state.info[pid] || {};
    resasOf(pid).forEach(function (r) {
      // Le logement peut être prêt en avance : c'est l'heure réelle qui compte.
      var rd = r.start === TODAY ? readyInfo(pid) : null;
      // Mais si le voyageur a annoncé son heure d'arrivée depuis son livret,
      // c'est elle le vrai rendez-vous : elle passe avant tout le reste (D-48).
      out.push({
        pid: pid, kind: 'arrivee', date: r.start,
        hour: r.arriveePrevue || (rd && rd.at) || inf.checkin || '16:00',
        early: !!rd, annonce: !!r.arriveePrevue,
        guest: r.guest, guests: r.guests, nights: nights(r.start, r.end), resa: r
      });
      out.push({
        pid: pid, kind: 'depart', date: r.end,
        hour: inf.checkout || '11:00', parti: departAt(pid, r),
        guest: r.guest, guests: r.guests, nights: nights(r.start, r.end), resa: r
      });
    });
  });

  // Le même jour, on récupère les clés du partant avant d'accueillir l'arrivant.
  out.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === 'depart' ? -1 : 1;
    return a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0;
  });
  return out;
}

/** Les mouvements d'un jour précis. */
function keyEventsOn(agentId, iso) {
  return keyEvents(agentId).filter(function (e) { return e.date === iso; });
}

/** Les mouvements à venir, aujourd'hui exclu. */
function keyEventsNext(agentId) {
  return keyEvents(agentId).filter(function (e) { return e.date > TODAY; });
}

/* --------------------------------------------------------------------------
   Avis des voyageurs (propreté à l'arrivée, séjour au départ)
   -------------------------------------------------------------------------- */

/** La mission de ménage qui a préparé le logement pour ce séjour :
    la dernière mission terminée du bien, au plus tard le jour de l'arrivée. */
function cleanerFor(pid, r) {
  return state.missions
    .filter(function (m) { return m.prop === pid && m.status === 'termine' && m.date <= r.start; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; })[0] || null;
}

function avisOf(kind, test) {
  return state.avis.filter(function (v) { return v.kind === kind && (!test || test(v)); });
}

/** Avis déjà déposé pour ce séjour et ce type de note. */
function avisDone(pid, r, kind) {
  if (!r) return null;
  var k = resaKey(pid, r);
  return state.avis.find(function (v) { return v.resa === k && v.kind === kind; }) || null;
}

/** Note globale d'un prestataire : la moyenne de toutes les notes de ménage
    reçues. Rend null tant qu'il n'a été noté par personne. */
function agentRating(agentId) {
  var list = avisOf('menage', function (v) { return v.agent === agentId; });
  if (!list.length) return null;
  var somme = list.reduce(function (n, v) { return n + v.stars; }, 0);
  return { avg: Math.round(somme / list.length * 10) / 10, n: list.length, list: list };
}

/** « 4,7 » plutôt que « 4.7 » : virgule décimale française. */
function fmtNote(n) { return String(n).replace('.', ','); }

/** « d'Emma » plutôt que « de Emma ». Les noms viennent des voyageurs : on ne
    choisit pas leur première lettre. */
function de(nom) {
  var n = String(nom || '').trim();
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(n) ? 'd’' + n : 'de ' + n;
}

/* --------------------------------------------------------------------------
   Invitation d'un prestataire

   Un site statique ne peut envoyer aucun message par lui-même : il faudrait un
   serveur. On prépare donc le message et on l'ouvre dans le logiciel de
   messagerie du propriétaire, qui n'a plus qu'à appuyer sur « Envoyer ».
   Le vrai envoi automatique arrivera avec la phase 3.
   -------------------------------------------------------------------------- */

/** Adresse publique de l'application, sans la partie après le # . */
function appUrl() {
  return location.origin + location.pathname;
}

/* LE LIEN PERSONNEL D'UN SÉJOUR (session 16 — D-80)

   Jusqu'ici il n'existait qu'une seule adresse pour tous les voyageurs,
   `#/bienvenue`, où chacun devait se reconnaître lui-même (date d'arrivée +
   4 chiffres de son téléphone). C'était la seule solution tant que rien ne
   distinguait un séjour d'un autre dans une adresse.

   Désormais chaque réservation a la sienne : `#/sejour/<identifiant>`. Le
   voyageur qui l'ouvre est reconnu **sans rien taper**. Le lien unique reste
   en place — il sert de repli quand un voyageur a perdu le sien.

   Ce que ce lien ne fait PAS : il n'ouvre pas le code d'accès en dehors des
   dates du séjour (D-51 : `dansLesDates` reste le garde-fou). Un lien
   transféré à un tiers, ou retrouvé un an plus tard, ne donne donc pas la
   clé du logement. */
function lienSejour(rid) {
  return appUrl() + '#/sejour/' + rid;
}

/** Le message tout prêt à envoyer au voyageur avec son lien personnel. */
function texteSejour(pid, r) {
  var p = prop(pid), inf = state.info[pid] || {};
  return 'Bonjour ' + r.guest + ',\n\n' +
    'Voici votre livret d’accueil personnel pour ' + p.name + ' :\n' +
    lienSejour(r.id) + '\n\n' +
    'Vous y trouverez l’adresse, les horaires, le code d’accès et le Wi-Fi ' +
    'pendant votre séjour, ainsi que nos conseils sur place.\n\n' +
    'Arrivée le ' + fmtDate(r.start) + ' à partir de ' + (inf.checkin || '16:00') + ' · ' +
    'départ le ' + fmtDate(r.end) + ' avant ' + (inf.checkout || '11:00') + '.\n\n' +
    'À très bientôt !';
}

/* Copie dans le presse-papiers, avec repli quand le navigateur refuse
   (page non sécurisée, permission retirée) : on affiche alors le texte pour
   qu'il soit sélectionnable à la main. Même parti pris qu'en session 8. */
function copier(texte, message) {
  var replier = function () { prompt('Sélectionnez ce texte et copiez-le :', texte); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texte).then(function () { alert(message); }, replier);
  } else {
    replier();
  }
}

/* Téléchargement d'un fichier fabriqué dans le navigateur : aucun serveur
   n'est nécessaire, le contenu ne quitte jamais la machine. */
function telecharger(nom, contenu, type) {
  try {
    var blob = new Blob([contenu], { type: type || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  } catch (e) {
    alert('Le téléchargement a été refusé par le navigateur.');
  }
}

/** Lien vers un plan. Ce format est compris par Google Maps, et l'iPhone le
    propose dans Plans : c'est le plus sûr sans dépendre d'un service précis. */
function planUrl(adresse) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(adresse);
}

/* Le message à envoyer avec le lien d'invitation. Réécrit en session 15 : la
   version précédente datait de la session 8 et expliquait de choisir son nom
   dans une liste, sans mot de passe — un parcours supprimé depuis (D-65). Elle
   aurait envoyé le prestataire dans le mur.
   Ce texte-ci **contient le lien** : c'est lui qu'on copie, pas le lien seul,
   pour que le propriétaire n'ait rien à rédiger. */
function inviteTexte(a, url) {
  var prenom = String(a.name || '').split(/\s+/)[0] || '';
  return 'Bonjour ' + prenom + ',\n\n' +
    (a.kind === 'cles'
      ? 'Tu peux désormais consulter depuis ton téléphone, avec MAISON WARME, le calendrier ' +
        'des logements dont tu remets les clés : qui arrive, qui repart, à quelle heure, ' +
        'le nom du voyageur et le nombre de personnes.\n\n'
      : 'Tu peux désormais suivre tes missions depuis ton téléphone avec MAISON WARME : ' +
        'les ménages à prendre, la checklist en photos, le relevé des stocks et tes gains du mois.\n\n') +
    'Voici ton lien personnel pour créer ton compte :\n' + url + '\n\n' +
    '1. Ouvre ce lien sur ton téléphone\n' +
    '2. Choisis ton mot de passe (6 caractères au minimum)\n' +
    '3. C\'est fait : tu es connecté(e)\n\n' +
    'Ce lien n\'est valable que 14 jours, et une seule fois. Il ne fonctionne que pour ' +
    'l\'adresse ' + (a.email || 'la tienne') + '.\n\n' +
    'Astuce : depuis ton navigateur, choisis « Ajouter à l\'écran d\'accueil ». ' +
    'L\'application s\'ouvrira ensuite comme une vraie application.\n\n' +
    'À bientôt,\nMAISON WARME';
}

/** Cinq étoiles pleines ou vides, en lecture seule. */
function starsRead(n) {
  var out = '';
  for (var i = 1; i <= 5; i++) out += '<span class="star' + (i <= n ? ' star--on' : '') + '">★</span>';
  return '<span class="stars">' + out + '</span>';
}

/** Biens retenus pour la liste de courses. null = tous, y compris les biens
    créés après le dernier réglage : c'est le comportement le plus sûr. */
function coursesPropIds() {
  if (!Array.isArray(state.coursesProps)) return state.props.map(function (p) { return p.id; });
  return state.coursesProps.slice();
}

/* LE REGISTRE DE PAIE (revu en session 17 — D-87)

   Il était bâti sur `state.done`, une liste alimentée par `finish()`. Or
   `finish()` tourne sur **le téléphone du prestataire**, et `state.done` ne
   voyage pas : le propriétaire n'en recevait donc jamais rien. Résultat, dès
   que Sofia a eu son propre compte, l'écran « Prestataires » n'affichait plus
   aucun historique et **aucun montant à lui verser** — alors que la mission
   était bien terminée sous ses yeux, dans « Missions ».

   On repart donc de la seule source que les deux écrans partagent : les
   **missions terminées** du cahier partagé. Chacune porte tout ce qu'il faut
   — qui l'a faite, quand, sur quel logement, pour combien.

   `state.done` est conservé en second rang : il rattrape les missions
   supprimées depuis, et les données d'avant la session 17. */
function ledger() {
  var vues = {};
  var out = [];

  (state.missions || []).forEach(function (m) {
    if (m.status !== 'termine' || !m.taker) return;
    vues[m.id] = true;
    out.push({
      mid: m.id, agent: m.taker, month: moisDe(m.date), prop: m.prop, type: m.type,
      dateLabel: m.date === TODAY ? 'Aujourd’hui' : fmtDate(m.date), price: m.price || 0
    });
  });

  (state.done || []).forEach(function (r) {
    if (r && r.mid && !vues[r.mid]) { vues[r.mid] = true; out.push(r); }
  });

  return out.concat(HISTORY);
}
function monthRows(a, month) { return ledger().filter(function (r) { return r.agent === a && r.month === month; }); }
function monthTotal(a, month) { return monthRows(a, month).reduce(function (n, r) { return n + r.price; }, 0); }

/* Versement d'un prestataire pour un mois. Tant que le propriétaire n'a rien
   coché, on retient le statut par défaut du mois (MONTHS). */
function isPaid(agentId, month) {
  var k = agentId + ':' + month;
  if (Object.prototype.hasOwnProperty.call(state.payouts, k)) return !!state.payouts[k];
  var md = MONTHS.find(function (m) { return m.key === month; });
  return !!(md && md.paid);
}

function lowsFor(pid) {
  return arts().filter(function (a) { return (state.stock[pid][a.key] || 0) <= state.seuils[a.key]; });
}

/** Attributs d'une action cliquable : nom + paramètres optionnels.
 *  Attention : le nom de l'action occupe `data-a`. Un paramètre appelé « a »
 *  produirait un second `data-a` et le navigateur ne garderait que le premier,
 *  ce qui ferait lire le nom de l'action à la place de la valeur attendue.
 *  Il est donc refusé — utiliser « ag », « id », « k »… à la place. */
function act(name, params) {
  var out = ' data-a="' + esc(name) + '"';
  if (params) Object.keys(params).forEach(function (k) {
    if (k === 'a') throw new Error('act(' + name + ') : paramètre « a » réservé au nom de l\'action.');
    out += ' data-' + k + '="' + esc(params[k]) + '"';
  });
  return out;
}

/* ==========================================================================
   4. Routage
   ========================================================================== */

var route = { name: 'login', id: null, sec: null };

var PRESTA_TABS = [
  { key: 'missions', path: '#/app/missions', label: 'Disponibles' },
  { key: 'mes-missions', path: '#/app/mes-missions', label: 'Mes missions' },
  { key: 'notes', path: '#/app/notes', label: 'Mes notes' },
  { key: 'gains', path: '#/app/gains', label: 'Gains' },
  { key: 'profil', path: '#/app/profil', label: 'Profil' }
];

/* Une remise des clés n'a ni mission, ni gain, ni note : deux onglets suffisent. */
var CLES_TABS = [
  { key: 'calendrier', path: '#/app/calendrier', label: 'Calendrier' },
  { key: 'profil', path: '#/app/profil', label: 'Profil' }
];

var OWNER_NAV = [
  { key: 'dash', path: '#/admin', label: 'Tableau de bord', color: C.terracotta },
  { key: 'calendrier', path: '#/admin/calendrier', label: 'Calendrier', color: C.bleu },
  { key: 'missions', path: '#/admin/missions', label: 'Missions', color: C.bleu },
  { key: 'messages', path: '#/admin/messages', label: 'Messages', color: C.vert },
  { key: 'auto', path: '#/admin/messages-programmes', label: 'Messages programmés', color: '#7A6BA8' },
  { key: 'stats', path: '#/admin/statistiques', label: 'Statistiques', color: C.ambre },
  { key: 'agents', path: '#/admin/prestataires', label: 'Prestataires', color: '#8A6A4F' },
  { key: 'avis', path: '#/admin/commentaires', label: 'Commentaires', color: '#7A6BA8' },
  { key: 'repertoire', path: '#/admin/repertoire', label: 'Répertoire voyageurs', color: '#8A6A4F' },
  { key: 'stocks', path: '#/admin/stocks', label: 'Stocks', color: C.ambre },
  { key: 'biens', path: '#/admin/biens', label: 'Biens & connexions', color: C.vert }
];

function parseRoute() {
  var h = location.hash.replace(/^#/, '');
  var seg = h.split('/').filter(Boolean);          // ex. ['app','missions','m1','checklist']

  // Porte d'entrée du livret : le lien unique envoyé à tous les voyageurs,
  // toutes plateformes et tous logements confondus (D-46). Page publique.
  if (seg[0] === 'bienvenue') return { name: 'bienvenue', id: null, sec: null };

  // Lien PERSONNEL d'un séjour (session 16 — D-80). Page publique : le
  // voyageur est reconnu par l'adresse elle-même, il n'a rien à taper.
  if (seg[0] === 'sejour' && seg[1]) return { name: 'sejour', id: seg[1], sec: null };

  // Le lien d'invitation d'un prestataire (§19.8). Page publique : celui qui
  // l'ouvre n'a pas encore de compte — c'est justement ce qu'il vient créer.
  if (seg[0] === 'invitation') return { name: 'invitation', id: seg[1] || null, sec: null };

  // Livret d'accueil : page publique, destinée au voyageur (pas de connexion).
  // Sans troisième segment, c'est l'accueil : les grandes rubriques à choisir.
  if (seg[0] === 'livret' && seg[1]) {
    return { name: seg[2] ? 'livret-sec' : 'livret', id: seg[1], sec: seg[2] || null };
  }

  if (seg[0] === 'app') {
    if (seg[1] === 'missions' && seg[2]) {
      var sub = seg[3];
      if (sub === 'checklist') return { name: 'p-checklist', id: seg[2] };
      if (sub === 'stock') return { name: 'p-stock', id: seg[2] };
      if (sub === 'fin') return { name: 'p-fin', id: seg[2] };
      if (sub === 'incident') return { name: 'p-incident', id: seg[2] };
      return { name: 'p-detail', id: seg[2] };
    }
    if (seg[1] === 'attente') return { name: 'p-attente', id: null };
    if (seg[1] === 'calendrier') return { name: 'p-cles', id: null };
    if (seg[1] === 'mes-missions') return { name: 'p-mes', id: null };
    if (seg[1] === 'notes') return { name: 'p-notes', id: null };
    if (seg[1] === 'gains') return { name: 'p-gains', id: null };
    if (seg[1] === 'profil') return { name: 'p-profil', id: null };
    return { name: 'p-missions', id: null };
  }

  if (seg[0] === 'admin') {
    if (seg[1] === 'missions') return { name: seg[2] ? 'o-mission' : 'o-missions', id: seg[2] || null };
    if (seg[1] === 'calendrier') return { name: 'o-cal', id: null };
    if (seg[1] === 'reservations') return { name: 'o-resa', id: seg[2] || null };
    if (seg[1] === 'messages') return { name: seg[2] ? 'o-msg' : 'o-msgs', id: seg[2] || null };
    if (seg[1] === 'messages-programmes') return { name: 'o-auto', id: null };
    if (seg[1] === 'statistiques') return { name: 'o-stats', id: null };
    if (seg[1] === 'prestataires') return { name: 'o-agents', id: null };
    if (seg[1] === 'commentaires') return { name: 'o-avis', id: null };
    if (seg[1] === 'repertoire') return { name: 'o-repertoire', id: null };
    if (seg[1] === 'stocks') return { name: 'o-stocks', id: null };
    if (seg[1] === 'biens') return { name: seg[2] ? 'o-bien' : 'o-biens', id: seg[2] || null };
    return { name: 'o-dash', id: null };
  }

  return { name: 'login', id: null };
}

function go(path) {
  if (location.hash === path) render();
  else location.hash = path;
}

/** Redirige si la page demandée n'est pas accessible au rôle connecté. */
function guard() {
  var r = parseRoute();
  var isPresta = r.name.indexOf('p-') === 0;
  var isOwner = r.name.indexOf('o-') === 0;

  // Le livret et sa porte d'entrée s'ouvrent sans connexion : ce sont les
  // pages du voyageur.
  if (r.name === 'bienvenue') return r;
  if (r.name === 'sejour') return r;
  if (r.name === 'invitation') return r;
  if (r.name === 'livret') return r;
  if (r.name === 'livret-sec') {
    var ok = LIVRET_SECTIONS.some(function (s) { return s.k === r.sec; });
    if (!ok) { location.replace('#/livret/' + r.id); return null; }
    return r;
  }

  if (!state.auth) {
    if (r.name !== 'login') { location.replace('#/login'); return null; }
    return r;
  }
  if (state.auth === 'presta' && (isOwner || r.name === 'login')) { location.replace(homePath()); return null; }
  if (state.auth === 'owner' && (isPresta || r.name === 'login')) { location.replace('#/admin'); return null; }

  // Chaque métier reste chez lui : la remise des clés n'a que son calendrier
  // et son profil ; une femme de ménage n'a pas ce calendrier.
  if (state.auth === 'presta') {
    // Compte créé, mais aucun logement confié : une seule page, qui l'explique.
    if (!accesOuvert()) {
      if (r.name !== 'p-attente' && r.name !== 'p-profil') { location.replace('#/app/attente'); return null; }
      return r;
    }
    if (r.name === 'p-attente') { location.replace(homePath()); return null; }

    var cles = isCles(state.me);
    if (cles && r.name !== 'p-cles' && r.name !== 'p-profil') { location.replace('#/app/calendrier'); return null; }
    if (!cles && r.name === 'p-cles') { location.replace('#/app/missions'); return null; }
  }

  // Une mission ouverte doit exister.
  if (r.id && isPresta && !mission(r.id)) { location.replace('#/app/missions'); return null; }

  // La fiche mission du propriétaire suppose que la mission existe.
  if (r.name === 'o-mission' && !mission(r.id)) { location.replace('#/admin/missions'); return null; }

  // Réservation et conversation : seulement sur un séjour qui existe encore.
  if (r.name === 'o-resa' && !resaById(r.id)) { location.replace('#/admin/calendrier'); return null; }
  if (r.name === 'o-msg' && !resaById(r.id)) { location.replace('#/admin/messages'); return null; }

  // Un prestataire ne voit que les biens qui lui sont autorisés, et depuis la
  // session 12 que les prestations de son métier (D-53). Une mission déjà
  // prise reste accessible : on ne lui retire pas un travail en cours parce
  // que le propriétaire a décoché une case entre-temps.
  if (r.id && isPresta) {
    var pm = mission(r.id);
    if (pm && pm.taker !== state.me && !mayTakeMission(state.me, pm)) {
      // Sans ce message, le clic sur une mission semblait ne rien faire du
      // tout : l'écran revenait à la liste, sans un mot. Corrigé en session 14.
      state.mMsg = !mayTake(state.me, pm.prop)
        ? 'Ce logement ne t\'est pas confié : demande au propriétaire de te l\'ouvrir.'
        : 'Cette prestation n\'est pas dans ta liste : demande au propriétaire de te l\'ajouter.';
      location.replace('#/app/missions'); return null;
    }
  }

  // La checklist et le signalement ne s'ouvrent que sur une mission démarrée ;
  // le relevé de stock, qu'après la checklist.
  if (r.name === 'p-checklist' || r.name === 'p-incident') {
    var m = mission(r.id);
    if (m.status === 'dispo' || m.status === 'prise') { location.replace('#/app/missions/' + r.id); return null; }
  }
  if (r.name === 'p-stock' && (!state.draft || state.draft.id !== r.id)) {
    location.replace('#/app/missions/' + r.id); return null;
  }

  return r;
}

/* ==========================================================================
   5. Vues prestataire
   ========================================================================== */

/** Présentation commune d'une mission (équivalent de decorate() du prototype). */
function decorate(m) {
  var p = prop(m.prop), ty = service(m.type), st = STATUS[m.status];
  var total = stepIds(m.prop).length, done = photoCount(m);

  // Le voyageur a signalé son départ : le logement est libre, la mission peut
  // démarrer même si l'heure de départ officielle n'est pas encore passée.
  var free = freeAt(m);
  var canStart = m.date <= TODAY || !!free;
  var mine = m.taker === state.me;

  var ctaLabel, ctaCls, ctaAction = '';
  if (m.status === 'termine') { ctaLabel = 'Mission terminée'; ctaCls = 'btn--muted'; }
  else if (m.status === 'encours') { ctaLabel = 'Reprendre la checklist'; ctaCls = 'btn--go'; ctaAction = 'resume'; }
  else if (canStart) { ctaLabel = 'Commencer la mission'; ctaCls = 'btn--go'; ctaAction = 'start'; }
  else { ctaLabel = 'Démarrage le ' + m.dateLabel.toLowerCase(); ctaCls = 'btn--muted'; }

  return {
    id: m.id, raw: m, mine: mine,
    propName: p.name, city: p.city, address: p.address + ', ' + p.city, color: p.color, tint: p.tint,
    typeLabel: ty.label, durationLabel: duration(m.prop, m.type),
    dateLabel: m.dateLabel, windowLabel: m.windowLabel,
    free: free, freeLabel: free ? 'Logement libre depuis ' + free : '',
    day: m.date.split('-')[2], month: MOIS[parseInt(m.date.split('-')[1], 10) - 1],
    priceLabel: m.price + ' €',
    urgent: !!m.urgent, urgentLabel: m.urgent,
    redoLabel: m.redo || '',
    note: m.note || '',
    reviewed: m.review === 'valide',
    // « si connu » : un logement en iCal seul ne transmet pas le nombre de
    // personnes, et « 1 voyageurs » serait un mensonge (session 15).
    hasRes: !!(m.res && parseInt(m.res.guests, 10) > 0),
    guestsLabel: m.res && parseInt(m.res.guests, 10) > 0
      ? m.res.guests + (m.res.guests > 1 ? ' voyageurs' : ' voyageur') : '',
    statusLabel: m.status === 'prise' && m.taker ? 'Acceptée · ' + m.taker
      : m.status === 'termine' && m.taker ? 'Faite · ' + m.taker
        : st.label,
    statusCls: st.cls,
    total: total, done: done,
    progressPct: total ? Math.round(done / total * 100) : 0,
    progressLabel: m.status === 'termine' ? 'Terminée · relevé de stock envoyé' : done + ' / ' + total + ' étapes validées',
    canStart: canStart,
    ctaLabel: ctaLabel, ctaCls: ctaCls, ctaAction: ctaAction
  };
}

function prestaShell(head, body, foot, opts) {
  opts = opts || {};
  // Message venu du cahier partagé — « mission déjà prise », perte de réseau…
  // Il apparaît en tête du corps et disparaît au clic.
  var msg = state.mMsg
    ? '<div class="presta-msg" role="alert"' + act('fermer-msg') + '>' + esc(state.mMsg) +
      '<span class="presta-msg-x">✕</span></div>'
    : '';
  return '<div class="presta">' + head +
    '<div class="presta-body' + (opts.flush ? ' presta-body--flush' : '') + '">' + msg + body + '</div>' +
    (foot || '') +
    (opts.noTabs ? '' : tabBar()) +
    '</div>';
}

function tabBar() {
  var cles = isCles(state.me);
  var dispoCount = cles ? keyEventsOn(state.me, TODAY).length : dispoForMe().length;
  return '<nav class="tabbar">' + (cles ? CLES_TABS : PRESTA_TABS).map(function (t) {
    var on = routeTab() === t.key;
    var badge = dispoCount > 0 && (cles ? t.key === 'calendrier' : t.key === 'missions')
      ? '<div class="tab-badge num">' + dispoCount + (cles ? ' auj.' : ' new') + '</div>' : '';
    return '<button type="button"' + (on ? ' aria-current="page"' : '') + act('nav', { path: t.path }) + '>' +
      '<div class="tab-dot"></div><div class="tab-label">' + t.label + '</div>' + badge + '</button>';
  }).join('') + '</nav>';
}

function routeTab() {
  if (route.name === 'p-cles') return 'calendrier';
  if (route.name === 'p-mes') return 'mes-missions';
  if (route.name === 'p-notes') return 'notes';
  if (route.name === 'p-gains') return 'gains';
  if (route.name === 'p-profil') return 'profil';
  return 'missions';
}

/* LE BOUTON QUI MANQUAIT (session 19)

   Un téléphone n'a pas de touche F5 : on ne « recharge » pas une application
   ajoutée à l'écran d'accueil. Quand le propriétaire confiait un nouveau
   logement, la prestataire n'avait donc aucun geste à sa disposition pour
   aller chercher la nouveauté — et l'écran restait désespérément vide.
   Le geste existe désormais, et il est écrit en toutes lettres. */
function boutonActualiser() {
  if (typeof DB === 'undefined' || !DB.estDispo()) return '';
  return '<button type="button" class="presta-maj" aria-label="Actualiser"' +
    (state.majEnCours ? ' disabled' : '') + act('presta-actualiser') + '>' +
    (state.majEnCours ? '…' : '⟳') + '</button>';
}

function prestaHeader(kicker, title) {
  var me = agent(state.me);
  return '<header class="presta-head">' +
    '<div><div class="presta-kicker">' + esc(kicker) + '</div>' +
    '<h1 class="presta-title">' + esc(title) + '</h1></div>' +
    boutonActualiser() +
    '<div class="avatar" style="background:' + me.avatarBg + ';color:' + me.avatarFg + '">' + me.init + '</div>' +
    '</header>';
}

/* --- Liste des missions disponibles ------------------------------------- */

/* Missions ouvertes que le prestataire connecté a le droit de prendre. */
function dispoForMe() {
  return state.missions.filter(function (m) {
    return m.status === 'dispo' && mayTakeMission(state.me, m);
  });
}

function viewPrestaMissions() {
  var list = dispoForMe().map(decorate);

  // On distingue les deux raisons de ne pas voir une mission : ce n'est pas
  // ton logement, ou ce n'est pas ton métier. La seconde est nouvelle (D-53).
  var dispos = state.missions.filter(function (m) { return m.status === 'dispo'; });
  var horsBien = dispos.filter(function (m) { return !mayTake(state.me, m.prop); }).length;
  var horsMetier = dispos.filter(function (m) {
    return mayTake(state.me, m.prop) && !mayDo(state.me, m.type);
  }).length;

  // Cas le plus fréquent quand « rien ne s'affiche » : aucun logement n'a été
  // coché sur la fiche. On le dit franchement, plutôt que de laisser un écran
  // vide qui ressemble à une panne.
  var sansLogement = !allowedProps(state.me).length;

  var body = '<div class="stack">' + (list.length
    ? list.map(missionCard).join('')
    : '<p class="empty">' + (sansLogement
        ? 'Aucun logement ne t’a encore été attribué.<br>Le propriétaire doit cocher tes logements ; les missions apparaîtront ensuite ici.'
        : 'Aucune mission disponible pour le moment.') + '</p>') +
    '<p class="center sec-note" style="padding-top:8px">Une mission apparaît dès qu\'un check-out est détecté sur l\'iCal.' +
      (horsBien ? '<br>' + horsBien + ' mission(s) concernent des logements qui ne te sont pas attribués.' : '') +
      (horsMetier ? '<br>' + horsMetier + ' mission(s) concernent des prestations que tu ne fais pas.' : '') +
      '<br><a href="#/app/profil" style="color:var(--terra);font-weight:600">Voir mon accès</a></p>' +
    '</div>';
  return prestaShell(prestaHeader(list.length + ' missions à prendre', 'Missions'), body);
}

function missionCard(m) {
  return '<button type="button" class="mission" style="--accent:' + m.color + '"' +
    act('open-mission', { id: m.id }) + '>' +
    '<div class="mission-top">' +
      '<div class="grow">' +
        '<div class="mission-type"><span class="dot" style="background:' + m.color + '"></span>' + esc(m.typeLabel) + '</div>' +
        '<div class="mission-name">' + esc(m.propName) + '</div>' +
        '<div class="mission-city">' + esc(m.city) + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex:none">' +
        '<div class="mission-price num">' + esc(m.priceLabel) + '</div>' +
        '<div class="mission-dur num">' + esc(m.durationLabel) + '</div>' +
      '</div>' +
    '</div>' +
    (m.note ? '<div class="mission-note">✎ ' + esc(m.note) + '</div>' : '') +
    '<div class="mission-chips">' +
      (m.redoLabel ? '<span class="badge badge--terra">↻ ' + esc(m.redoLabel) + '</span>' : '') +
      (m.free ? '<span class="badge badge--green num">✓ ' + esc(m.freeLabel) + '</span>' : '') +
      '<span class="badge badge--soft num">' + esc(m.dateLabel) + '</span>' +
      '<span class="badge badge--soft num">' + esc(m.windowLabel) + '</span>' +
      (m.hasRes ? '<span class="badge badge--soft num">' + esc(m.guestsLabel) + '</span>' : '') +
      (m.urgent ? '<span class="badge badge--terra">' + esc(m.urgentLabel) + '</span>' : '') +
    '</div>' +
    '</button>';
}

/* --- Mes missions -------------------------------------------------------- */

function viewPrestaMes() {
  var mine = state.missions
    .filter(function (m) { return m.taker === state.me && m.status !== 'termine'; })
    .map(decorate);

  var cards = mine.length ? mine.map(function (m) {
    return '<article class="card card--lift pop">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">' +
        '<span class="badge ' + m.statusCls + '">' + esc(m.statusLabel) + '</span>' +
        '<span class="num" style="font:600 12px Figtree,sans-serif;color:var(--muted)">' + esc(m.dateLabel) + ' · ' + esc(m.windowLabel) + '</span>' +
      '</div>' +
      '<button type="button" style="width:100%"' + act('open-mission', { id: m.id }) + '>' +
        '<div style="font:700 18px/1.25 Figtree,sans-serif;margin-top:9px">' + esc(m.propName) + '</div>' +
        '<div class="num" style="font:500 13px Figtree,sans-serif;color:var(--muted);margin-top:2px">' + esc(m.typeLabel) + ' · ' + esc(m.priceLabel) + '</div>' +
        '<div class="progress" style="margin-top:12px"><span style="width:' + m.progressPct + '%;background:' + m.color + '"></span></div>' +
        '<div class="num" style="font:600 11px Figtree,sans-serif;color:var(--muted2);margin-top:6px">' + esc(m.progressLabel) + '</div>' +
      '</button>' +
      '<button type="button" class="btn btn--sm ' + m.ctaCls + '" style="width:100%;margin-top:12px"' +
        (m.ctaAction ? act(m.ctaAction, { id: m.id }) : '') + '>' + esc(m.ctaLabel) + '</button>' +
      '</article>';
  }).join('') : '<p class="empty">Aucune mission acceptée pour le moment.<br>Va voir les missions disponibles.</p>';

  var hist = ledger().filter(function (r) { return r.agent === state.me; }).slice(0, 6);
  var history = '<div style="margin-top:10px">' +
    '<h2 class="sec-title" style="margin:0 4px 9px">Historique</h2>' +
    '<div class="card card--flush"><div class="list">' +
    (hist.length ? hist.map(function (r) {
      var p = prop(r.prop);
      return '<div class="list-row">' +
        '<span style="width:5px;height:28px;border-radius:9px;background:' + p.color + ';flex:none"></span>' +
        '<div class="grow"><div style="font:600 14px Figtree,sans-serif">' + esc(p.name) + '</div>' +
        '<div class="num" style="font:500 11.5px Figtree,sans-serif;color:var(--muted2);margin-top:1px">' + esc(r.dateLabel) + ' · ' + esc(service(r.type).label) + '</div></div>' +
        '<span class="num" style="font:700 14px Figtree,sans-serif;flex:none">' + r.price + ' €</span>' +
        '</div>';
    }).join('') : '<p class="empty">Pas encore de mission terminée.</p>') +
    '</div></div></div>';

  return prestaShell(
    prestaHeader(mine.length + ' mission(s) acceptée(s)', 'Mes missions'),
    '<div class="stack">' + cards + history + '</div>'
  );
}

/* --- Détail d'une mission ------------------------------------------------ */

function viewPrestaDetail() {
  var m = mission(route.id), d = decorate(m);
  var inf = state.info[m.prop];
  /* Une plateforme inconnue — et surtout une plateforme **vide**, ce que rend
     le cahier partagé pour toute mission relue — donnait ici `undefined`, puis
     une erreur à la première couleur lue. Le rendu s'arrêtait net : le
     prestataire cliquait sur sa mission, et **rien ne se passait**. Constaté
     en session 14. Un repli, toujours. */
  var pl = platCouleurs(m.res && m.res.plat);

  var btn;
  if (m.status === 'dispo') {
    var enCours = state.priseEnCours === m.id;
    btn = { label: enCours ? 'Un instant…' : 'Prendre cette mission',
      cls: enCours ? 'btn--muted' : 'btn--primary', action: enCours ? '' : 'take',
      note: 'Premier arrivé, premier servi · ' + d.total + ' étapes' };
  } else if (m.status === 'termine') {
    btn = { label: 'Mission terminée', cls: 'btn--muted', action: '', note: 'Merci ! Paiement le 5 du mois.' };
  } else if (m.status === 'encours') {
    btn = { label: 'Reprendre la checklist', cls: 'btn--go', action: 'resume', note: 'À faire dans le créneau indiqué' };
  } else if (d.canStart) {
    btn = { label: 'Commencer la mission', cls: 'btn--go', action: 'start',
      note: d.free ? 'Le voyageur est parti : tu peux y aller' : 'À faire dans le créneau indiqué' };
  } else {
    btn = { label: 'Démarrage le ' + m.dateLabel.toLowerCase(), cls: 'btn--muted', action: '',
      note: 'La checklist s’ouvrira le jour de la mission' };
  }

  /* Le nombre de voyageurs n'est pas toujours connu — un logement en iCal seul
     ne le transmet pas (§0.4). On l'écrit alors « nombre inconnu » plutôt que
     d'afficher « 1 voyageurs » ou « null voyageurs ». */
  function combien(n) {
    var v = parseInt(n, 10);
    return v > 0 ? v + (v > 1 ? ' voyageurs' : ' voyageur') : 'nombre de voyageurs inconnu';
  }

  /* La prochaine arrivée était enfermée dans la carte du séjour qui se
     termine : sans nom pour le voyageur sortant, le prestataire ne voyait
     donc NI qui part, NI qui arrive. Les deux blocs sont désormais
     indépendants (session 15). */
  var blocSortant = m.res ? '<div style="display:flex;align-items:center;gap:11px">' +
      '<div class="avatar" style="width:38px;height:38px;font-size:13px;background:' + pl.bg + ';color:' + pl.fg + '">' +
        esc(String(m.res.guest || '?').split(' ').map(function (w) { return w.charAt(0); }).join('').slice(0, 2)) + '</div>' +
      '<div class="grow"><div style="font:600 15px Figtree,sans-serif">' + esc(m.res.guest) + '</div>' +
      '<div class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:1px">' +
        esc(combien(m.res.guests) + (m.res.nights ? ' · ' + m.res.nights + ' nuits' : '')) + '</div></div>' +
      '<span class="badge" style="background:' + pl.bg + ';color:' + pl.fg + '">' + esc(m.res.plat) + '</span>' +
    '</div>' : '';

  var blocSuivant = m.next ? '<div style="' + (blocSortant ? 'margin-top:14px;padding-top:14px;border-top:1px solid rgba(36,30,26,.08)' : '') + '">' +
      '<div style="font:600 11.5px Figtree,sans-serif;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">Prochaine arrivée</div>' +
      '<div style="font:600 15px Figtree,sans-serif;margin-top:5px">' + esc(m.next.guest || 'Voyageur') + '</div>' +
      '<div class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:1px">' +
        esc(combien(m.next.guests) + (m.next.at ? ' · arrivée ' + m.next.at : '')) + '</div>' +
    '</div>' : '';

  var guest = (blocSortant || blocSuivant) ? '<div class="card">' +
    '<h2 style="font:700 14px Figtree,sans-serif;margin:0 0 10px">' +
      (blocSortant ? 'Séjour qui se termine' : 'Ce logement') + '</h2>' +
    blocSortant + blocSuivant +
    '</div>' : '';

  var urgentNote = m.turnover
    ? 'Un nouveau voyageur arrive à 16:00 : le logement doit être prêt à 15:30.'
    : m.urgent;

  var body =
    '<div class="detail-hero" style="background:' + d.tint + '">' +
      '<button type="button" class="btn-back"' + act('back-list') + '>← Retour</button>' +
      '<div class="detail-kicker">' + esc(d.typeLabel) + '</div>' +
      '<h1 class="detail-name">' + esc(d.propName) + '</h1>' +
      '<div class="detail-addr">' + esc(d.address) + '</div>' +
      '<div class="detail-boxes">' +
        '<div class="detail-box"><div class="k">Créneau</div><div class="v num">' + esc(d.windowLabel) + '</div><div class="s num">' + esc(d.dateLabel) + '</div></div>' +
        '<div class="detail-box"><div class="k">Rémunération</div><div class="v serif num" style="font-size:24px">' + esc(d.priceLabel) + '</div><div class="s num">' + esc(d.durationLabel) + '</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="detail-body">' +
      (d.free ? '<div class="free-note">' +
        '<div class="k">✓ Le logement est libre</div>' +
        '<div class="t">' + esc(m.res ? m.res.guest : 'Le voyageur') + ' a signalé son départ à ' + esc(d.free) + '. ' +
        'Tu peux commencer sans attendre l\'heure de départ prévue.</div></div>' : '') +
      (m.redo ? '<div class="redo-note">' +
        '<div class="k">↻ ' + esc(m.redo) + '</div>' +
        '<div class="t">Cette mission avait déjà été faite : le propriétaire demande de la reprendre. ' +
        'La checklist est à refaire en entier.</div></div>' : '') +
      (m.note ? '<div class="owner-note">' +
        '<div class="k">✎ Note du propriétaire</div>' +
        '<div class="t">' + esc(m.note) + '</div></div>' : '') +
      /* Le code de la porte et le Wi-Fi. Ils ne vivent pas avec le reste du
         logement : ils sont rangés à part dans le cahier partagé (D-60), et
         jusqu'à la session 17 **seul le propriétaire avait le droit de les
         lire**. Sur le téléphone du prestataire, les deux cases affichaient
         donc un tiret, sans un mot d'explication — il ne pouvait pas entrer.
         Le script `06-code-porte-prestataire.sql` ouvre cette lecture ; en
         attendant, ou si le propriétaire n'a rien saisi, on **dit lequel des
         deux cas c'est** au lieu d'un tiret muet (D-86, règle D-74). */
      '<div class="access-card">' +
        '<div class="access-item"><div class="k">Entrée / clés</div><div class="v num">' + esc(inf.code || '—') + '</div></div>' +
        '<div class="access-item"><div class="k">Wi-Fi</div><div class="v num">' + esc(inf.wifi || '—') + '</div></div>' +
      '</div>' +
      (!inf.code && !inf.wifi
        ? '<div style="background:var(--terra-bg2);border-radius:16px;padding:13px 15px;font:600 12.5px/1.5 Figtree,sans-serif;color:var(--terra-dd)">' +
            (m.status === 'prise' || m.status === 'encours'
              ? 'Le code d’accès et le Wi-Fi ne s’affichent pas. Préviens le propriétaire : soit il ne les a pas encore ' +
                'renseignés sur la fiche du logement, soit le cahier partagé ne t’autorise pas encore à les lire ' +
                '(script « 06-code-porte-prestataire.sql »).'
              : 'Le code d’accès apparaîtra ici une fois que tu auras pris cette mission.') +
          '</div>'
        : '') +
      (urgentNote ? '<div style="background:var(--terra-bg2);border-radius:16px;padding:13px 15px;font:600 13px/1.45 Figtree,sans-serif;color:var(--terra-dd)">' + esc(urgentNote) + '</div>' : '') +
      guest +
      '<div>' +
        '<h2 class="sec-title" style="margin-bottom:8px">Ce qu\'il y a à faire</h2>' +
        '<div class="card card--flush"><div class="list">' +
        rooms(m.prop).map(function (r) {
          return '<div class="kv" style="padding:13px 0;font-size:15px"><span>' + esc(r.name) + '</span>' +
            '<span class="num" style="color:var(--muted2);font-size:13px">' + r.steps.length + (r.steps.length > 1 ? ' étapes' : ' étape') + '</span></div>';
        }).join('') +
        '</div></div>' +
        '<p class="sec-note" style="margin-top:8px">Checklist propre à ce logement, définie par le propriétaire.</p>' +
      '</div>' +
      '<div class="card">' +
        '<h2 style="font:700 14px Figtree,sans-serif;margin:0 0 8px">Le logement</h2>' +
        [['Capacité', inf.capacity], ['Surface', inf.surface], ['Stationnement', inf.parking],
         ['Linge', inf.linge], ['Départ voyageur', inf.checkout], ['Arrivée suivante', inf.checkin],
         ['Consigne', state.notes[m.prop]]]
          .filter(function (r) { return r[1]; })
          .map(function (r) {
            return '<div class="kv"><span class="k">' + esc(r[0]) + '</span><span class="v num">' + esc(r[1]) + '</span></div>';
          }).join('') +
      '</div>' +
    '</div>';

  var foot = '<div class="presta-foot">' +
    '<button type="button" class="btn ' + btn.cls + '"' + (btn.action ? act(btn.action, { id: m.id }) : '') + '>' + esc(btn.label) + '</button>' +
    '<div class="note num">' + esc(btn.note) + '</div>' +
    '</div>';

  return prestaShell('', '<div class="slide">' + body + '</div>', foot, { flush: true, noTabs: true });
}

/* --- Checklist ----------------------------------------------------------- */

function viewPrestaChecklist() {
  var m = mission(route.id);
  var ph = state.photos[m.id] || {};
  var total = stepIds(m.prop).length, done = photoCount(m);
  var pct = total ? Math.round(done / total * 100) : 0;

  var head = '<div class="check-head">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">' +
      '<button type="button" class="btn-back"' + act('back-list') + '>← Quitter</button>' +
      '<span style="font:600 12px Figtree,sans-serif;color:var(--muted)">' + esc(prop(m.prop).name) + '</span>' +
    '</div>' +
    '<div class="check-count"><span class="n num">' + done + '/' + total + '</span><span class="t">étapes validées</span></div>' +
    '<div class="progress progress--lg" style="margin-top:10px"><span style="width:' + pct + '%;background:var(--green)"></span></div>' +
    '</div>';

  var body = '<div class="stack-l">' + rooms(m.prop).map(function (r) {
    var dn = r.steps.filter(function (s) { return ph[s.id]; }).length;
    var all = dn === r.steps.length && r.steps.length > 0;
    return '<section>' +
      '<div class="room-head"><span class="n">' + esc(r.name) + '</span>' +
      '<span class="badge num ' + (all ? 'badge--green' : '') + '" style="' + (all ? '' : 'background:var(--fill);color:var(--muted)') + ';font-size:11px;padding:3px 8px">' + dn + '/' + r.steps.length + '</span></div>' +
      '<div class="stack" style="gap:10px">' + r.steps.map(function (s) {
        var val = ph[s.id];
        var ok = !!val;
        // Une vraie photo est une image enregistrée ; l'ancienne maquette ne
        // gardait qu'un « oui ». Les deux cohabitent le temps que les missions
        // en cours se terminent.
        var image = typeof val === 'string' && val.indexOf('data:') === 0 ? val : '';
        // Où en est le dépôt de cette photo dans le casier partagé (lot 2) ?
        var envoi = state.photosEnvoi[m.id + ':' + s.id];
        var motEnvoi = envoi === 'ok' ? ' · envoyée'
          : envoi === 'encours' ? ' · envoi en cours…'
            : envoi === 'erreur' ? ' · pas encore envoyée, elle repartira à la fin' : '';
        var hint = ok
          ? (s.photo ? (image ? 'Photo prise' + motEnvoi : 'Validé sans photo · toucher pour photographier') : 'Validé')
          : (s.photo ? 'Photo obligatoire · ouvre l’appareil photo' : 'À cocher');
        var right = image
          ? '<span style="display:flex;align-items:center;gap:8px;flex:none">' +
              '<button type="button" class="step-thumb" style="padding:0;overflow:hidden;background:var(--fill)"' +
                act('shoot', { mid: m.id, sid: s.id }) + '>' +
                '<img src="' + esc(image) + '" alt="Photo de l’étape ' + esc(s.label) + '" ' +
                'style="width:100%;height:100%;object-fit:cover;display:block">' +
              '</button>' +
              '<button type="button" class="step-act" aria-label="Supprimer la photo" ' +
                'style="background:var(--fill);color:var(--muted);padding:0 12px"' +
                act('unshoot', { mid: m.id, sid: s.id }) + '>✕</button>' +
            '</span>'
          : '<button type="button" class="step-act" style="' +
              (ok ? 'background:var(--fill);color:var(--muted)' : s.photo ? 'background:var(--ink);color:#fff' : 'background:var(--green);color:#fff') +
              '"' + act('shoot', { mid: m.id, sid: s.id }) + '>' +
              (s.photo ? '📷 Photo' : ok ? 'Annuler' : 'Fait') + '</button>';
        return '<div class="step' + (flash === m.id + s.id ? ' flashing' : '') + '" data-done="' + (ok ? 1 : 0) + '">' +
          '<div class="step-ring">' + (ok ? '✓' : '') + '</div>' +
          '<div class="grow"><div class="step-label">' + esc(s.label) + '</div><div class="step-hint">' + hint + '</div></div>' +
          right + '</div>';
      }).join('') + '</div>' +
      '</section>';
  }).join('') +
    '<button type="button" class="btn btn--sm" style="background:transparent;color:var(--terra-d);width:100%"' +
      act('nav', { path: '#/app/missions/' + m.id + '/incident' }) + '>Signaler un problème dans le logement</button>' +
    '</div>';

  var ready = done === total && total > 0;
  var foot = '<div class="presta-foot">' +
    '<button type="button" class="btn ' + (ready ? 'btn--dark' : 'btn--muted') + '"' +
      (ready ? act('nav', { path: '#/app/missions/' + m.id + '/stock' }) : '') + '>' +
      (ready ? 'Passer au relevé des stocks' : (total - done) + ' étape(s) à valider') + '</button>' +
    '</div>';

  return prestaShell(head, body, foot, { noTabs: true });
}

/* --- Relevé de stock ----------------------------------------------------- */

function viewPrestaStock() {
  var m = mission(route.id);
  var d = state.draft;
  if (!d || d.id !== m.id) { location.replace('#/app/missions/' + m.id + '/checklist'); return ''; }
  var q = d.qty;

  var head = '<div class="check-head">' +
    '<button type="button" class="btn-back"' + act('nav', { path: '#/app/missions/' + m.id + '/checklist' }) + '>← Checklist</button>' +
    '<h1 style="font:700 24px/1.2 Figtree,sans-serif;margin:4px 0 0;letter-spacing:-.01em">Ce qu\'il reste sur place</h1>' +
    '<p class="sec-note" style="margin:4px 0 0">Pré-rempli avec le dernier relevé. Corrige ce qui a changé.</p>' +
    '<div class="chiprow chiprow--scroll" style="margin-top:12px">' +
      ['Tous'].concat(groups()).map(function (g) {
        return '<button type="button" class="chip chip--sm" aria-pressed="' + (state.mStockGroup === g) + '"' +
          act('m-stock-group', { g: g }) + '>' + esc(g) + '</button>';
      }).join('') +
    '</div></div>';

  var blocs = state.mStockGroup === 'Tous' ? grouped() : grouped().filter(function (g) { return g[0] === state.mStockGroup; });
  var body = '<div class="stack-l">' + blocs.map(function (g) {
    return '<section>' +
      '<h2 style="font:700 14px Figtree,sans-serif;margin:0 4px 8px;color:var(--ink-soft)">' + esc(g[0]) + '</h2>' +
      '<div class="card card--flush" style="padding:4px 14px"><div class="list">' +
      g[1].map(function (a) {
        var qty = q[a.key] || 0, seuil = state.seuils[a.key] || 0, low = qty <= seuil;
        return '<div class="list-row" style="padding:10px 0">' +
          '<div class="grow">' +
            '<div style="font:600 14px Figtree,sans-serif;color:' + (low ? 'var(--terra-d)' : 'var(--ink)') + '">' + esc(a.label) + '</div>' +
            '<div class="num" style="font:500 11px Figtree,sans-serif;margin-top:1px;color:' + (low ? 'var(--terra-d)' : 'var(--muted2)') + '">' +
              esc(low ? 'sous le seuil de ' + seuil + ' ' + a.unit : a.unit + ' · dotation ' + a.par) + '</div>' +
          '</div>' +
          '<div class="stepper">' +
            '<button type="button" aria-label="Retirer un ' + esc(a.label) + '"' + act('bump', { k: a.key, d: -1 }) + '>−</button>' +
            '<span class="val num">' + qty + '</span>' +
            '<button type="button" aria-label="Ajouter un ' + esc(a.label) + '"' + act('bump', { k: a.key, d: 1 }) + '>+</button>' +
          '</div></div>';
      }).join('') +
      '</div></div></section>';
  }).join('') + '</div>';

  var lowCount = arts().filter(function (a) { return (q[a.key] || 0) <= state.seuils[a.key]; }).length;
  var foot = '<div class="presta-foot">' +
    '<button type="button" class="btn btn--go"' + act('finish', { id: m.id }) + '>Terminer la mission</button>' +
    '<div class="note">' + (lowCount > 0
      ? lowCount + ' article(s) sous le seuil seront ajoutés à la liste de courses'
      : 'Tous les stocks sont au niveau') + '</div>' +
    '</div>';

  return prestaShell(head, body, foot, { noTabs: true });
}

/* --- Fin de mission ------------------------------------------------------ */

function viewPrestaFin() {
  var ld = state.lastDone || { price: 0, photos: 0, low: 0 };
  var body = '<div class="done-wrap">' +
    '<div class="done-check">✓</div>' +
    '<h1 style="font:700 27px/1.2 Figtree,sans-serif;margin:22px 0 0;letter-spacing:-.02em">Mission terminée</h1>' +
    '<p style="font:500 15px/1.55 Figtree,sans-serif;color:var(--muted3);margin:8px 0 0">Le propriétaire a reçu tes photos et ton relevé de stock.</p>' +
    '<div class="card" style="margin-top:24px;width:100%;text-align:left">' +
      [['Photos envoyées', String(ld.photos || 0)],
       ['Articles à racheter', String(ld.low || 0)],
       ['Ajouté à tes gains', (ld.price || 0) + ' €']].map(function (r) {
        return '<div class="kv" style="padding:9px 0;font-size:14px"><span class="k">' + r[0] + '</span><span class="v num" style="font-weight:700">' + r[1] + '</span></div>';
      }).join('') +
    '</div>' +
    '<button type="button" class="btn btn--dark btn--sm" style="margin-top:26px"' + act('nav', { path: '#/app/gains' }) + '>Voir mes gains</button>' +
    '</div>';
  return '<div class="presta">' + body + '</div>';
}

/* --- Signalement de problème -------------------------------------------- */

/* Refait en session 16. Il manquait deux choses essentielles : la photo
   n'était qu'un interrupteur de maquette — appuyer allumait le mot
   « PHOTO AJOUTÉE » sans rien photographier — et il n'y avait aucun endroit
   pour écrire ce qui s'était passé. Un type de problème tout seul
   (« quelque chose est cassé ») n'apprend rien au propriétaire. */
function viewPrestaIncident() {
  var m = mission(route.id);
  var kinds = ['casse', 'degat', 'manque', 'acces'];
  var dejas = problemesDe(m.id);
  var pret = !!state.problemKind;

  var body =
    '<button type="button" class="btn-back"' + act('nav', { path: '#/app/missions/' + m.id + '/checklist' }) + '>← Retour</button>' +
    '<h1 style="font:700 24px/1.2 Figtree,sans-serif;margin:4px 0 0">Signaler un problème</h1>' +
    '<p class="sec-note" style="margin:5px 0 0">Le propriétaire le verra dans cette mission, ' +
      'avec ta photo et ton commentaire.</p>' +

    (state.mMsg ? '<div class="alert alert--amber" style="margin-top:14px"><div class="det">' +
      esc(state.mMsg) + '</div></div>' : '') +

    '<div class="stack" style="gap:10px;margin-top:18px">' + kinds.map(function (k) {
      var ty = typeProbleme(k);
      var on = state.problemKind === k;
      return '<button type="button" style="background:' + (on ? '#FFF7F0' : '#fff') +
        ';border:1.5px solid ' + (on ? C.terracotta : 'rgba(36,30,26,.1)') +
        ';border-radius:18px;min-height:54px;padding:14px 16px;display:flex;align-items:center;gap:12px;width:100%"' +
        act('problem-kind', { k: k }) + '>' +
        '<span class="dot" style="width:10px;height:10px;background:' + ty[1] + '"></span>' +
        '<span style="font:600 15px Figtree,sans-serif">' + esc(ty[0]) + '</span></button>';
    }).join('') + '</div>' +

    '<div class="card" style="margin-top:18px;border-radius:18px;padding:15px">' +
      '<label class="lab" for="pb-txt" style="font:600 12px Figtree,sans-serif;color:var(--muted)">' +
        'Ce que tu as constaté</label>' +
      '<textarea class="inp" id="pb-txt" rows="3" style="margin-top:8px" ' +
        'placeholder="Ex. Le pied gauche du canapé est cassé, je l’ai calé avec un livre."' +
        ' data-fid="pb-txt" data-in="problem-texte">' + esc(state.problemTexte || '') + '</textarea>' +
    '</div>' +

    '<div class="card" style="margin-top:14px;border-radius:18px;padding:15px">' +
      '<div style="font:600 12px Figtree,sans-serif;color:var(--muted)">Photo du problème (facultative)</div>' +
      (state.problemPhoto
        ? '<div style="margin-top:10px;display:flex;gap:10px;align-items:flex-start">' +
            '<img src="' + esc(state.problemPhoto) + '" alt="Photo du problème" ' +
              'style="width:120px;height:96px;object-fit:cover;border-radius:14px;display:block;flex:none">' +
            '<div class="grow" style="display:flex;flex-direction:column;gap:8px">' +
              '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
                act('problem-photo') + '>Reprendre la photo</button>' +
              '<button type="button" class="btn-danger-xs" style="align-self:flex-start"' +
                act('problem-photo-off') + '>Retirer la photo</button>' +
            '</div>' +
          '</div>'
        : '<button type="button" class="stripe" style="margin-top:10px;height:100px;width:100%;border-radius:14px;display:flex;align-items:center;justify-content:center;font:600 10px ui-monospace,Menlo,monospace;color:var(--muted)"' +
            act('problem-photo') + '>TOUCHER POUR PHOTOGRAPHIER</button>') +
    '</div>' +

    '<button type="button" class="btn ' + (pret ? 'btn--primary' : 'btn--muted') + '" style="margin-top:20px"' +
      (pret ? act('send-problem', { id: m.id }) : '') + '>' +
      (pret ? 'Envoyer au propriétaire' : 'Choisis un type de problème') + '</button>' +

    /* Ce qui a déjà été signalé sur cette mission : sans ce rappel, on ne
       sait pas si l'envoi est parti, et on signale deux fois. */
    (!dejas.length ? '' :
      '<h2 class="sec-title" style="margin:26px 0 10px;font-size:15px">Déjà signalé sur cette mission</h2>' +
      '<div class="stack" style="gap:10px">' + dejas.map(function (p) {
        var ty = typeProbleme(p.kind);
        return '<div class="card" style="border-radius:16px;padding:13px 14px">' +
          '<div style="display:flex;align-items:center;gap:9px">' +
            '<span class="dot" style="width:9px;height:9px;background:' + ty[1] + '"></span>' +
            '<span style="font:600 14px Figtree,sans-serif;flex:1;min-width:0">' + esc(ty[0]) + '</span>' +
            '<span class="num" style="font:500 11.5px Figtree,sans-serif;color:var(--muted2)">' + esc(p.at || '') + '</span>' +
          '</div>' +
          (p.texte ? '<p style="font:500 13px/1.45 Figtree,sans-serif;margin:8px 0 0;white-space:pre-wrap">' +
            esc(p.texte) + '</p>' : '') +
          (p.photo ? '<img src="' + esc(p.photo) + '" alt="Photo du problème" ' +
            'style="margin-top:9px;width:110px;height:84px;object-fit:cover;border-radius:12px;display:block">' : '') +
          '</div>';
      }).join('') + '</div>');

  return prestaShell('', body, '', { noTabs: true });
}

/* --- Gains --------------------------------------------------------------- */

function viewPrestaGains() {
  var me = state.me;
  var current = monthTotal(me, CURRENT_MONTH);
  var currentCount = monthRows(me, CURRENT_MONTH).length;

  var months = MONTHS.filter(function (m) { return m.key !== CURRENT_MONTH; }).map(function (m) {
    var rows = monthRows(me, m.key);
    var open = state.openGainMonth === m.key;
    var paye = isPaid(me, m.key);
    return '<article class="card" style="border-radius:22px;padding:6px 18px 10px">' +
      '<button type="button" class="gain-month"' + act('toggle-gain', { m: m.key }) + '>' +
        '<div class="grow"><div style="font:700 16px Figtree,sans-serif">' + esc(m.label) + '</div>' +
        '<div class="num" style="font:500 12px Figtree,sans-serif;color:var(--muted);margin-top:2px">' + rows.length + ' missions · ' + esc(m.payNote) + '</div></div>' +
        '<span class="badge ' + (paye ? 'badge--green' : 'badge--amber') + '" style="font-size:11.5px;padding:4px 9px">' + (paye ? 'Payé' : 'À venir') + '</span>' +
        '<span class="serif num" style="font-size:24px;flex:none">' + rows.reduce(function (n, r) { return n + r.price; }, 0) + ' €</span>' +
      '</button>' +
      (open ? '<div style="border-top:1px solid rgba(36,30,26,.07);padding-top:4px">' +
        (rows.length ? rows.map(function (r) {
          return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0">' +
            '<span class="num" style="width:52px;font:600 12px Figtree,sans-serif;color:var(--muted2);flex:none">' + esc(r.dateLabel) + '</span>' +
            '<span class="grow" style="font:500 13.5px Figtree,sans-serif">' + esc(prop(r.prop).name) + '</span>' +
            '<span class="num" style="font:600 13.5px Figtree,sans-serif;flex:none">' + r.price + ' €</span></div>';
        }).join('') : '<p class="empty" style="padding:20px">Aucune mission sur ce mois.</p>') +
        '</div>' : '') +
      '</article>';
  }).join('');

  var body = '<div class="stack" style="gap:14px">' +
    '<article class="card" style="border-radius:22px">' +
      '<div style="font:600 12px Figtree,sans-serif;color:var(--muted)">Mois en cours · juillet 2026</div>' +
      '<div class="gain-big num">' + current + ' €</div>' +
      '<div class="num" style="font:500 13px Figtree,sans-serif;color:var(--muted);margin-top:4px">' + currentCount + ' missions terminées ce mois</div>' +
      '<div style="height:1px;background:rgba(36,30,26,.08);margin:14px 0"></div>' +
      '<div style="display:flex;justify-content:space-between;font:500 13px Figtree,sans-serif;color:var(--ink-soft2)">' +
        '<span>Versement prévu</span><span class="num" style="font-weight:700">5 août 2026</span></div>' +
    '</article>' + months + '</div>';

  return prestaShell(prestaHeader(agent(me).name, 'Mes gains'), body);
}

/* --- Mes notes ----------------------------------------------------------- */

/* Les notes de propreté laissées par les voyageurs sur les ménages que ce
   prestataire a réellement faits. Leur moyenne est sa note globale. */
function viewPrestaNotes() {
  var r = agentRating(state.me);

  var entete = '<article class="card" style="border-radius:22px;text-align:center">' +
    (r
      ? '<div class="serif num" style="font-size:52px;line-height:1;color:var(--amber-t)">' + fmtNote(r.avg) + '</div>' +
        '<div style="margin-top:8px">' + starsRead(Math.round(r.avg)) + '</div>' +
        '<div style="font:500 13px Figtree,sans-serif;color:var(--muted);margin-top:8px">' +
          'Moyenne sur ' + r.n + ' avis de voyageurs</div>'
      : '<div style="font-size:34px;line-height:1">⭐</div>' +
        '<h2 style="font:700 17px Figtree,sans-serif;margin:12px 0 0">Pas encore de note</h2>' +
        /* NE JAMAIS LAISSER CROIRE À UN OUBLI DES VOYAGEURS (règle 5 du §6).
           Tant que le script 08 n'est pas collé, l'écran affichait « pas
           encore de note » alors que les notes existaient — elles n'avaient
           simplement nulle part où voyager. On dit lequel des deux c'est. */
        (typeof DB !== 'undefined' && DB.estDispo() && DB.avisIndisponibles()
          ? '<p class="sec-note" style="margin-top:6px;color:var(--terra)">Les notes des voyageurs ne ' +
            'sont pas encore partagées : le propriétaire a une mise en service à terminer de son côté. ' +
            'Signale-le-lui — ce n\'est pas que personne ne t\'a notée.</p>'
          : '<p class="sec-note" style="margin-top:6px">Après chaque séjour, le voyageur note la propreté ' +
            'depuis son livret d\'accueil. Ses étoiles et son commentaire arrivent ici.</p>')) +
    '</article>';

  /* Répartition : combien de 5 étoiles, de 4… Utile pour situer une note isolée. */
  var repartition = '';
  if (r) {
    var lignes = [5, 4, 3, 2, 1].map(function (n) {
      var c = r.list.filter(function (v) { return v.stars === n; }).length;
      var pct = Math.round(c / r.n * 100);
      return '<div class="note-bar">' +
        '<span class="note-bar-n num">' + n + ' ★</span>' +
        '<span class="note-bar-track"><span style="width:' + pct + '%"></span></span>' +
        '<span class="note-bar-c num">' + c + '</span></div>';
    }).join('');
    repartition = '<article class="card" style="border-radius:22px">' +
      '<h2 style="font:700 15px Figtree,sans-serif;margin:0 0 12px">Répartition</h2>' + lignes + '</article>';
  }

  var liste = r
    ? '<div class="stack" style="gap:12px">' + r.list.slice().reverse().map(function (v) {
        return '<article class="card" style="border-radius:20px">' +
          '<div class="avis-top">' + starsRead(v.stars) +
            '<span class="avis-meta num">' + esc(v.dateLabel) + '</span></div>' +
          (v.texte
            ? '<p class="avis-txt" style="font-size:15px">« ' + esc(v.texte) + ' »</p>'
            : '<p class="avis-txt avis-txt--none">Sans commentaire.</p>') +
          '<div class="num" style="font:600 12px Figtree,sans-serif;color:var(--muted);margin-top:10px">' +
            esc(prop(v.pid).name) + '</div>' +
          '</article>';
      }).join('') + '</div>'
    : '';

  var body = '<div class="stack" style="gap:14px">' + entete + repartition +
    (r ? '<h2 class="sec-title" style="margin:6px 0 0">Ce que les voyageurs ont écrit</h2>' : '') +
    liste + '</div>';

  return prestaShell(prestaHeader(agent(state.me).name, 'Mes notes'), body);
}

/* --- Profil -------------------------------------------------------------- */

/* --- Calendrier de la remise des clés ------------------------------------ */

/** Une ligne d'arrivée ou de départ, avec le nom du voyageur. */
function keyRow(e) {
  var p = prop(e.pid), arr = e.kind === 'arrivee';
  return '<article class="card kd-row" style="--accent:' + p.color + '">' +
    '<div class="day-badge">' +
      '<div class="d num">' + e.date.split('-')[2] + '</div>' +
      '<div class="m">' + MOIS[parseInt(e.date.split('-')[1], 10) - 1] + '</div>' +
    '</div>' +
    '<span class="bar" style="background:' + p.color + '"></span>' +
    '<div class="grow">' +
      '<div class="kd-top">' +
        '<span class="badge ' + (arr ? 'badge--green' : 'badge--amber') + '">' +
          (arr ? '→ Remise des clés' : '← Retour des clés') + '</span>' +
        '<span class="kd-hour num">' + esc(e.hour) + '</span>' +
      '</div>' +
      '<div class="kd-guest">' + esc(e.guest) + '</div>' +
      '<div class="kd-meta num">' + e.guests + (e.guests > 1 ? ' voyageurs' : ' voyageur') +
        ' · ' + e.nights + ' nuits · ' + esc(jourLabel(e.date)) + '</div>' +
      '<div class="kd-place">' + esc(p.name) + '<span class="kd-addr">' + esc(p.address + ', ' + p.city) + '</span></div>' +
      // L'heure annoncée par le voyageur lui-même prime sur l'heure théorique :
      // c'est elle qui fixe le vrai rendez-vous.
      (e.annonce ? '<div class="kd-flag kd-flag--blue">🕐 Heure annoncée par le voyageur : ' + esc(e.hour) + '</div>'
        : e.early ? '<div class="kd-flag kd-flag--green">✨ Logement prêt en avance : clés remises dès ' + esc(e.hour) + '</div>' : '') +
      (e.resa && e.resa.tel ? '<div class="kd-flag kd-flag--blue">📞 ' + esc(e.resa.tel) + '</div>' : '') +
      (e.parti ? '<div class="kd-flag kd-flag--green">✓ Le voyageur a signalé son départ à ' + esc(e.parti) + '</div>' : '') +
    '</div></article>';
}

/** Le mois d'un logement : grille, puis les séjours avec le nom du voyageur. */
function clesCalendar(pid) {
  var p = prop(pid), inf = state.info[pid] || {};
  var cm = state.calMonth;
  var cy = parseInt(cm.split('-')[0], 10), cmo = parseInt(cm.split('-')[1], 10);
  var first = new Date(Date.UTC(cy, cmo - 1, 1));
  var daysIn = new Date(Date.UTC(cy, cmo, 0)).getUTCDate();
  var lead = (first.getUTCDay() + 6) % 7;
  var resas = resasOf(pid);

  var cells = '';
  for (var i = 0; i < lead; i++) cells += '<div class="cal-cell empty"></div>';
  for (var d = 1; d <= daysIn; d++) {
    var iso = cy + '-' + String(cmo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var r = resas.find(function (x) { return iso >= x.start && iso <= x.end; });
    var cls = 'cal-cell' + (iso === TODAY ? ' today' : r ? ' busy' : '');
    var bar = r
      ? '<span class="cal-bar" style="background:' + p.color +
        ';margin-left:' + (r.start === iso ? '45%' : '0') + ';margin-right:' + (r.end === iso ? '45%' : '0') + '"></span>'
      : '';
    cells += '<div class="' + cls + '"><span class="d num">' + d + '</span>' + bar + '</div>';
  }

  // Les séjours qui touchent le mois affiché, dans l'ordre.
  var debut = cy + '-' + String(cmo).padStart(2, '0') + '-01';
  var fin = cy + '-' + String(cmo).padStart(2, '0') + '-' + String(daysIn).padStart(2, '0');
  var dumois = resas.filter(function (x) { return x.end >= debut && x.start <= fin; })
    .slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });

  return '<article class="card" style="border-radius:22px">' +
    '<div class="kd-head">' +
      '<span class="dot" style="background:' + p.color + '"></span>' +
      '<span class="kd-prop">' + esc(p.name) + '</span>' +
    '</div>' +
    '<div class="kd-addr" style="margin-top:2px">' + esc(p.address + ', ' + p.city) + '</div>' +
    '<div class="cal cal--mini">' +
      ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(function (x) { return '<div class="cal-dow">' + x + '</div>'; }).join('') +
      cells +
    '</div>' +
    '<div class="kd-stays">' + (dumois.length ? dumois.map(function (r) {
      return '<div class="kd-stay">' +
        '<div class="kd-stay-name">' + esc(r.guest) + '</div>' +
        '<div class="kd-meta num">' + fmtDate(r.start) + ' → ' + fmtDate(r.end) + ' · ' +
          nights(r.start, r.end) + ' nuits · ' + r.guests + (r.guests > 1 ? ' voyageurs' : ' voyageur') + '</div>' +
        '<div class="kd-meta num">Arrivée ' + esc(inf.checkin || '16:00') + ' · départ ' + esc(inf.checkout || '11:00') +
          (departAt(pid, r) ? ' · parti à ' + esc(departAt(pid, r)) : '') + '</div>' +
        '</div>';
    }).join('') : '<p class="empty" style="padding:14px 0">Aucun séjour ce mois-ci.</p>') + '</div>' +
    '</article>';
}

function viewPrestaCles() {
  var pids = allowedProps(state.me).filter(function (pid) { return !prop(pid).gone; });
  var auj = keyEventsOn(state.me, TODAY);
  var next = keyEventsNext(state.me).slice(0, 10);

  var body = '<div class="stack" style="gap:14px">' +
    '<h2 class="kd-title">Aujourd’hui · ' + esc(TODAY_LABEL) + '</h2>' +
    (auj.length ? auj.map(keyRow).join('')
      : '<p class="empty">Aucune remise de clés aujourd’hui.</p>') +

    '<h2 class="kd-title">À venir</h2>' +
    (next.length ? next.map(keyRow).join('')
      : '<p class="empty">Rien de prévu sur les logements qui te sont confiés.</p>') +

    '<h2 class="kd-title">Calendrier des logements</h2>' +
    '<div class="seg">' + moisCalendrier().map(function (m) {
      return '<button type="button" aria-pressed="' + (state.calMonth === m[0]) + '"' +
        act('cal-month', { m: m[0] }) + '>' + m[1] + '</button>';
    }).join('') + '</div>' +
    (pids.length ? pids.map(clesCalendar).join('')
      : '<p class="empty">Aucun logement ne t’est confié pour le moment. ' +
        'Le propriétaire peut te les attribuer depuis sa rubrique « Prestataires ».</p>') +

    '<p class="sec-note center" style="padding-top:6px">Tu vois les arrivées et les départs des logements ' +
      'qui te sont confiés. Le ménage, les stocks et les gains ne te concernent pas.</p>' +
    '</div>';

  return prestaShell(prestaHeader(auj.length + ' remise(s) de clés aujourd’hui', 'Calendrier'), body);
}

/* Encadré de diagnostic, sur le profil du prestataire (session 13).
   Quand « rien ne marche », il faut pouvoir lire d'un coup d'œil ce que
   l'application sait du compte connecté, plutôt que de deviner. */
function blocDiagnostic() {
  if (typeof DB === 'undefined' || !DB.estDispo()) return '';
  var p = DB.profil();
  if (!p) {
    return '<article class="card" style="border-radius:22px;border-left:4px solid var(--terra)">' +
      '<div style="font:700 14px Figtree,sans-serif;margin-bottom:6px">Hors connexion</div>' +
      '<p class="sec-note" style="margin:0">Le cahier partagé ne répond pas : tu vois ce qui ' +
      'était enregistré sur cet appareil. Reconnecte-toi dès que le réseau revient.</p></article>';
  }

  var fiche = (state.agents || []).filter(function (a) { return a.id === state.me; })[0];
  var ouverts = allowedProps(state.me);
  var lignes = [
    ['Compte', p.email || '—'],
    ['Rôle', p.role === 'owner' ? 'propriétaire' : 'prestataire'],
    ['Fiche reconnue', fiche ? '✅ ' + fiche.name : '⚠️ aucune fiche pour « ' + state.me + ' »'],
    ['Métier', isCles(state.me) ? 'remise des clés' : 'ménage / entretien'],
    ['Logements ouverts par le cahier', (p.props || []).length + ' logement(s)'],
    ['Logements que je vois', ouverts.length + ' sur ' + state.props.length],
    ['Prestations autorisées', allowedServices(state.me).length + ' sur ' + state.services.length],
    ['Missions visibles', dispoForMe().length + ' à prendre · ' +
      state.missions.filter(function (m) { return m.taker === state.me; }).length + ' à moi']
  ];

  var souci = !ouverts.length
    ? 'Aucun logement ne t\'a été attribué : c\'est pour ça que la liste est vide. Le propriétaire doit cocher tes logements dans sa rubrique Prestataires, puis recharger sa page.'
    : !fiche ? 'Ta fiche n\'a pas été retrouvée, mais tes logements sont bien ouverts : préviens quand même le propriétaire.'
      : '';

  return '<article class="card card--flush" style="border-radius:22px' +
    (souci ? ';border-left:4px solid var(--terra)' : '') + '">' +
    '<div style="padding:16px 18px 4px;font:700 14px Figtree,sans-serif">Mon accès</div>' +
    '<div class="list" style="padding:0 18px">' + lignes.map(function (l) {
      return '<div class="kv" style="padding:12px 0;font-size:14px;min-height:44px;align-items:center">' +
        '<span style="color:var(--muted)">' + esc(l[0]) + '</span>' +
        '<span class="num" style="text-align:right">' + esc(l[1]) + '</span></div>';
    }).join('') + '</div>' +
    (souci ? '<p class="sec-note" style="margin:0;padding:4px 18px 16px;color:var(--terra)">' +
      esc(souci) + '</p>' : '') +
    '</article>';
}

function viewPrestaProfil() {
  var me = agent(state.me);
  var r = agentRating(state.me);
  var autorises = allowedProps(state.me).length;

  var cles = isCles(state.me);
  var rows = cles ? [
    ['Métier', 'Remise des clés'],
    ['Logements confiés', autorises + ' sur ' + state.props.length],
    ['Notifications', 'Arrivées et départs']
  ] : [
    ['Biens autorisés', autorises + ' sur ' + state.props.length],
    ['Note des voyageurs', r ? fmtNote(r.avg) + ' / 5' : 'Pas encore de note'],
    ['Coordonnées bancaires', me.iban],
    ['Notifications', 'Nouvelles missions']
  ];

  var body = '<div class="stack" style="gap:14px">' +
    blocDiagnostic() +
    '<article class="card" style="border-radius:22px;display:flex;align-items:center;gap:14px">' +
      '<div class="avatar" style="width:56px;height:56px;font-size:19px;background:' + me.avatarBg + ';color:' + me.avatarFg + '">' + me.init + '</div>' +
      '<div class="grow"><div style="font:700 20px Figtree,sans-serif">' + esc(me.name) + '</div>' +
      '<div style="font:500 13px Figtree,sans-serif;color:var(--muted)">' + esc(me.role) + ' · depuis ' + esc(me.since) + '</div></div>' +
      (r && !cles ? '<button type="button" style="text-align:right;flex:none"' + act('nav', { path: '#/app/notes' }) + '>' +
        '<div class="serif num" style="font-size:22px;line-height:1">' + fmtNote(r.avg) + '</div>' +
        '<div style="font:600 10.5px Figtree,sans-serif;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">sur 5</div>' +
        '</button>' : '') +
    '</article>' +
    '<article class="card card--flush" style="border-radius:22px"><div class="list">' +
      rows.map(function (r) {
        return '<div class="kv" style="padding:14px 0;font-size:15px;min-height:48px;align-items:center">' +
          '<span>' + esc(r[0]) + '</span><span class="num" style="color:var(--muted2);font-size:13px">' + esc(r[1]) + '</span></div>';
      }).join('') +
    '</div></article>' +
    '<button type="button" class="btn btn--quiet"' + act('logout') + '>Se déconnecter</button>' +
    '<p class="sec-note center">Tes missions et tes gains sont enregistrés dans le cahier partagé de MAISON WARME.</p>' +
    '</div>';

  return prestaShell(prestaHeader('Mon compte', 'Profil'), body);
}

/* ==========================================================================
   6. Vues propriétaire
   ========================================================================== */

/** L'adresse e-mail avec laquelle on est connecté, pour ne jamais douter. */
function compteConnecte() {
  var p = typeof DB !== 'undefined' && DB.estDispo() ? DB.profil() : null;
  return p && p.email ? 'Connecté : ' + p.email : 'Connecté';
}

/* L'ALARME QUI MANQUAIT (session 19, règle 4 du §6)

   `pousser()` part sans qu'on l'attende : c'est voulu, l'écran ne doit jamais
   figer parce que le réseau est lent. Mais quand le cahier REFUSE l'écriture,
   personne ne le disait. Le propriétaire saisissait ses séjours, voyait ses
   missions apparaître sur son écran — et elles n'étaient jamais parties. Sur
   le téléphone de la prestataire : rien, sans la moindre explication.

   Ce bandeau est volontairement gros et rouge : il annonce que **ce qui est
   à l'écran n'existe que sur cet ordinateur**. */
function alerteEnvoi() {
  if (typeof DB === 'undefined' || !DB.estDispo()) return '';
  var e = DB.dernierEnvoi();
  if (!e || e.ok) return '';
  return '<div class="alerte-envoi" role="alert">' +
    '<strong>Le cahier partagé a refusé le dernier enregistrement.</strong> ' +
    'Ce que tu vois ici n’est encore parti nulle part : tes prestataires et tes ' +
    'voyageurs ne le voient pas. Raison donnée : « ' + esc(e.erreur || 'inconnue') + ' ».' +
    '<button type="button" class="btn btn--xs" style="background:var(--ink);color:#fff;margin-top:10px"' +
      act('reessayer-envoi') + '>Réessayer maintenant</button>' +
    '</div>';
}

/* LES SCRIPTS QUI MANQUENT, NOMMÉS (session 19)

   Une table absente ne casse plus rien (D-97) — mais alors les données qui
   devaient y aller restent dans ce navigateur, sans que rien ne le dise. Un
   silence de ce genre a déjà coûté deux sessions. On l'écrit donc, une fois,
   en haut de chaque page, et on nomme le fichier à coller. */
function alerteScripts() {
  if (typeof DB === 'undefined' || !DB.estDispo() || !DB.scriptsManquants) return '';
  var m = DB.scriptsManquants();
  if (!m.length) return '';
  return '<div class="alerte-envoi" style="border-left-color:var(--amber-t);color:var(--amber-t);' +
    'background:var(--amber-bg)" role="status">' +
    '<strong>Il reste ' + (m.length > 1 ? m.length + ' scripts' : 'un script') + ' à coller dans Supabase : ' +
    esc(m.join(' et ')) + '.</strong> ' +
    'Tant que ce n’est pas fait, une partie de ce que tu saisis reste sur <em>cet ordinateur</em> ' +
    'et n’est visible ni par tes prestataires, ni sur un autre appareil. ' +
    'Le mode d’emploi est au point 2 de la liste du document d’état.' +
    '</div>';
}

/* UN LOGEMENT NEUF N'EST CONFIÉ À PERSONNE (session 20, D-109)

   Symptôme rapporté : « j'ai créé un logement, je vois ses missions sur mon
   écran, et ma prestataire ne voit rien sur son téléphone. »

   Cause. La règle de sécurité du script 01 ne montre au prestataire que les
   missions dont le logement figure dans `mes_biens()`, c'est-à-dire la liste
   `props` de SON COMPTE. Or `create-bien` ne touchait à aucune fiche : le
   logement neuf n'entrait dans la liste de personne. Les missions partaient
   bien dans le cahier partagé — elles y étaient — et aucun téléphone n'avait
   le droit de les lire. `remove-bien`, lui, retire le logement supprimé de
   chaque fiche : le geste inverse existait, celui-ci manquait.

   C'est la règle 13 du §6 sous une autre forme : tout avait l'air de marcher.
   On le dit donc en haut de chaque page, et on donne le geste qui répare —
   plutôt que d'ouvrir des droits tout seuls, ce qui serait deviner à qui on
   confie un logement (règle 15). */
function prestasDuBien(pid) {
  return (state.agents || []).filter(function (a) {
    return a.kind !== 'cles' && (a.props || []).indexOf(pid) >= 0;
  });
}

function biensNonConfies() {
  return (state.props || []).filter(function (p) { return !prestasDuBien(p.id).length; });
}

function alerteBiensNonConfies() {
  var menagers = (state.agents || []).filter(function (a) { return a.kind !== 'cles'; });
  if (!menagers.length) return '';                 // personne à qui confier : rien à dire
  var orphelins = biensNonConfies();
  if (!orphelins.length) return '';
  var plusieurs = orphelins.length > 1;
  var noms = orphelins.map(function (p) { return '« ' + esc(p.name) + ' »'; }).join(', ');
  var aQui = menagers.length > 1
    ? 'mes ' + menagers.length + ' prestataires'
    : esc(menagers[0].name);
  return '<div class="alerte-envoi" style="border-left-color:var(--amber-t);color:var(--amber-t);' +
    'background:var(--amber-bg)" role="status">' +
    '<strong>' + (plusieurs ? 'Ces logements ne sont confiés' : 'Ce logement n’est confié') +
    ' à personne : ' + noms + '.</strong> ' +
    'Un logement neuf ne se confie pas tout seul. Ses missions existent bien et sont ' +
    'parties dans le cahier partagé, mais <em>aucun téléphone n’a le droit de les voir</em> : ' +
    'tant que personne ne l’a coché, l’écran de tes prestataires reste vide pour ce logement. ' +
    'Le réglage fin est dans « Prestataires » → « ⚙ Réglages et accès ».' +
    '<button type="button" class="btn btn--xs" style="background:var(--ink);color:#fff;margin-top:10px"' +
      act('confier-a-tous') + '>Confier ' + (plusieurs ? 'ces logements' : 'ce logement') +
      ' à ' + aQui + '</button>' +
    '</div>';
}

function ownerShell(page, content) {
  var openCount = state.missions.filter(function (m) { return m.status === 'dispo'; }).length;

  var nav = OWNER_NAV.map(function (n) {
    var on = page === n.key;
    return '<button type="button"' + (on ? ' aria-current="page"' : '') + ' style="--nav:' + n.color + '"' +
      act('nav', { path: n.path }) + '>' +
      '<span class="rail-dot"></span>' + n.label +
      (n.key === 'missions' && openCount > 0 ? '<span class="rail-badge num">' + openCount + '</span>' : '') +
      '</button>';
  }).join('');

  return '<div class="owner">' +
    '<aside class="rail">' +
      '<div><div class="rail-logo">MAISON WARME</div>' +
      '<div class="rail-sub num">' + state.props.length + ' bien' + (state.props.length > 1 ? 's' : '') +
        ' · ' + state.agents.length + ' prestataire' + (state.agents.length > 1 ? 's' : '') +
        ' · ' + TODAY_LABEL + '</div></div>' +
      '<nav class="rail-nav">' + nav + '</nav>' +
      '<div class="rail-foot">' +
        '<div class="rail-sync">' + esc(compteConnecte()) + '<br><br>' +
          'Logements, séjours et missions sont enregistrés dans le cahier partagé.</div>' +
        '<div class="rail-actions">' +
          '<button type="button"' + act('logout') + '>Se déconnecter</button>' +
        '</div>' +
      '</div>' +
    '</aside>' +
    '<main class="owner-main">' + alerteEnvoi() + alerteScripts() + alerteBiensNonConfies() + content + '</main>' +
    '</div>';
}

/* --- Tableau de bord ----------------------------------------------------- */

/** « Bonjour Marc », d'après le nom du compte connecté — plus de prénom en dur. */
function bonjourProprio() {
  var p = typeof DB !== 'undefined' && DB.estDispo() ? DB.profil() : null;
  var nom = (p && (p.full_name || '').trim()) || '';
  var prenom = nom.split(/\s+/)[0];
  return prenom ? 'Bonjour ' + prenom : 'Bonjour';
}

function viewOwnerDash() {
  var openCount = state.missions.filter(function (m) { return m.status === 'dispo'; }).length;
  var lowByProp = state.props.map(function (p) { return { p: p, lows: lowsFor(p.id) }; });
  var totalLow = lowByProp.reduce(function (n, x) { return n + x.lows.length; }, 0);

  var kpis = [
    { v: String(state.missions.filter(function (m) { return m.status !== 'termine'; }).length), l: 'missions à venir', c: C.ink },
    { v: String(openCount), l: 'non prises', c: C.terracotta },
    { v: String(totalLow), l: 'articles sous seuil', c: C.ambre },
    { v: state.agents.reduce(function (n, a) { return n + monthTotal(a.id, CURRENT_MONTH); }, 0) + ' €',
      l: 'à payer en ' + MOIS_LONGS[parseInt(CURRENT_MONTH.split('-')[1], 10) - 1], c: C.vert }
  ];

  /* Les alertes se calculent sur les vraies réservations du jour (session 14 :
     elles étaient écrites en dur, du temps de la démonstration). */
  var turnovers = state.props.map(function (p) {
    var part = stayLeaving(p.id), arrive = stayArriving(p.id);
    if (!part || !arrive) return null;
    var m = state.missions.filter(function (x) {
      return x.prop === p.id && x.date === TODAY && x.type !== 'maintenance';
    })[0];
    return { p: p, part: part, arrive: arrive, m: m };
  }).filter(Boolean);

  var alerts = [];

  turnovers.forEach(function (t) {
    var inf = state.info[t.p.id] || {};
    var m = t.m;
    alerts.push({ cls: 'alert--terra', dot: C.terracotta, kind: 'Turnover serré',
      title: t.p.name + ' · aujourd’hui',
      det: t.part.guest + ' part' + (inf.checkout ? ' à ' + inf.checkout : '') + ', ' +
        t.arrive.guest + ' arrive' + (t.arrive.arriveePrevue || inf.checkin ? ' à ' + (t.arrive.arriveePrevue || inf.checkin) : '') + '. ' +
        (!m ? 'Aucune mission de ménage n’est prévue.'
          : m.status === 'dispo' ? 'Mission encore non prise.'
            : m.status === 'termine' ? 'Ménage terminé par ' + m.taker + '.'
              : m.status === 'encours' ? 'Ménage en cours par ' + m.taker + '.'
                : 'Acceptée par ' + m.taker + '.') });
  });

  alerts.push({ cls: 'alert--amber', dot: C.ambre, kind: 'Stock bas',
    title: totalLow ? totalLow + ' articles sous leur seuil' : 'Aucun article sous son seuil',
    det: lowByProp.filter(function (x) { return x.lows.length; })
      .map(function (x) { return x.p.short + ' (' + x.lows.length + ')'; }).join(' · ') || 'Rien à signaler' });

  /* Les signalements ouverts, avec de quoi savoir où aller (session 16).
     L'alerte se contentait d'un décompte, et rien nulle part ne permettait
     de LIRE le problème : c'est corrigé dans la fiche de la mission. */
  var pbOuverts = tousLesProblemes().filter(function (p) { return p.statut !== 'traite'; });
  alerts.push({ cls: 'alert--blue', dot: C.bleu, kind: 'Signalement',
    title: pbOuverts.length ? pbOuverts.length + ' problème(s) à traiter' : 'Aucun problème signalé',
    det: pbOuverts.length
      ? pbOuverts.slice(0, 3).map(function (p) {
          return prop(p.prop).short + ' · ' + typeProbleme(p.kind)[0].toLowerCase();
        }).join(' · ') + '. Ouvre la mission concernée pour voir la photo et le commentaire.'
      : 'Rien à traiter pour le moment.' });

  /* Départs signalés par les voyageurs eux-mêmes, depuis leur livret d'accueil. */
  var libres = state.props.map(function (p) {
    var r = resasOf(p.id).find(function (x) { return x.end === TODAY && departAt(p.id, x); });
    return r ? { p: p, at: departAt(p.id, r), guest: r.guest } : null;
  }).filter(Boolean);

  var prets = state.props.map(function (p) {
    var rd = readyInfo(p.id);
    return rd ? { p: p, rd: rd } : null;
  }).filter(Boolean);

  if (libres.length) {
    alerts.push({ cls: 'alert--green', dot: C.vert, kind: 'Logement libre',
      title: libres.length + ' voyageur(s) ont signalé leur départ',
      det: libres.map(function (x) { return x.p.short + ' · ' + x.guest + ' à ' + x.at; }).join(' · ') });
  }
  if (prets.length) {
    alerts.push({ cls: 'alert--green', dot: C.vert, kind: 'Prêt en avance',
      title: prets.length + ' logement(s) prêts avant l\'heure',
      det: prets.map(function (x) { return x.p.short + ' · arrivée possible dès ' + x.rd.at; }).join(' · ') });
  }

  /* Voyageurs qui se sont déclarés sans pouvoir prouver qui ils sont : ils
     attendent un clic pour recevoir le code d'accès et le Wi-Fi (D-47). */
  var attente = demandesEnAttente();

  return ownerShell('dash',
    '<div class="page-head">' +
      '<div><h1 class="page-title">' + esc(bonjourProprio()) + '</h1>' +
      '<p class="page-sub">' + openCount + ' mission(s) encore sans prestataire · ' + totalLow + ' articles sous le seuil</p></div>' +
      '<div class="kpis">' + kpis.map(function (k) {
        return '<div class="kpi"><div class="v num" style="color:' + k.c + '">' + esc(k.v) + '</div><div class="l">' + k.l + '</div></div>';
      }).join('') + '</div>' +
    '</div>' +

    '<div class="cols" style="margin-top:24px;gap:12px">' + alerts.map(function (a) {
      return '<div class="alert ' + a.cls + '">' +
        '<div style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:' + a.dot + '"></span>' +
        '<span class="kind">' + a.kind + '</span></div>' +
        '<div class="title" style="color:var(--ink)">' + esc(a.title) + '</div>' +
        '<div class="det">' + esc(a.det) + '</div></div>';
    }).join('') + '</div>' +

    blocDemenagement() +

    blocAcces(attente) +

    '<div class="cols" style="margin-top:26px;gap:20px">' +
      blocResasEnCours() +
      '<section style="flex:1;min-width:min(100%,300px)">' +
        '<h2 class="sec-title">Stocks à surveiller</h2>' +
        '<div class="stack" style="gap:10px">' + lowByProp.map(function (x) {
          var n = x.lows.length;
          var cls = n > 3 ? 'badge--terra' : n ? 'badge--amber' : 'badge--green';
          return '<button type="button" class="card" style="border-radius:18px;padding:15px 17px;width:100%"' +
            act('nav', { path: '#/admin/stocks' }) + '>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">' +
            '<span style="font:600 14.5px Figtree,sans-serif">' + esc(x.p.name) + '</span>' +
            '<span class="badge ' + cls + '">' + (n ? n + ' bas' : 'OK') + '</span></div>' +
            '<div style="font:500 12.5px/1.5 Figtree,sans-serif;color:var(--muted3);margin-top:6px">' +
            (n ? esc(x.lows.slice(0, 4).map(function (a) { return a.label.toLowerCase(); }).join(', ') + (n > 4 ? '…' : ''))
               : 'Tous les articles au-dessus du seuil') + '</div></button>';
        }).join('') + '</div>' +
      '</section>' +
    '</div>');
}

/* --- Répertoire des voyageurs -------------------------------------------- */

/* Tous les voyageurs connus, regroupés en une fiche par personne (session 12).
   Le rapprochement se fait sur l'e-mail — c'est ce qui identifie vraiment
   quelqu'un — et à défaut sur le nom en minuscules. Un habitué qui revient
   trois fois n'apparaît donc qu'une fois, avec ses trois séjours.

   `demarchable` porte l'accord explicite du voyageur (case cochée dans le
   formulaire du livret) : sans lui, on n'a pas le droit de lui envoyer autre
   chose que ce qui concerne son séjour (D-56). */
function repertoire() {
  var parCle = {};

  allResas().forEach(function (x) {
    var r = x.r;
    if (r.statut === 'annule') return;
    var cle = (r.mail || '').trim().toLowerCase() ||
      ('nom:' + String(r.guest || '').trim().toLowerCase());
    if (cle === 'nom:' || cle === 'nom:voyageur') return;   // séjour sans identité

    var f = parCle[cle] || (parCle[cle] = {
      cle: cle, nom: r.guest, mail: '', tel: '', sejours: [], props: [],
      demarchable: false, nuits: 0, total: 0, notes: []
    });

    if (r.mail && !f.mail) f.mail = r.mail;
    if (r.tel && !f.tel) f.tel = r.tel;
    if (r.guest && r.guest !== 'Voyageur') f.nom = r.guest;
    if (r.demarchable) f.demarchable = true;                 // un accord suffit
    if (f.props.indexOf(x.pid) < 0) f.props.push(x.pid);
    f.nuits += nights(r.start, r.end);
    f.total += montantResa(x.pid, r);
    f.sejours.push(x);

    var av = avisDone(x.pid, r, 'sejour');
    if (av) f.notes.push(av.stars);
  });

  return Object.keys(parCle).map(function (k) { return parCle[k]; })
    .map(function (f) {
      f.sejours.sort(function (a, b) { return a.r.start < b.r.start ? 1 : -1; });
      f.dernier = f.sejours[0];
      f.note = f.notes.length
        ? Math.round(f.notes.reduce(function (a, b) { return a + b; }, 0) / f.notes.length * 10) / 10
        : null;
      return f;
    })
    .sort(function (a, b) { return a.dernier.r.start < b.dernier.r.start ? 1 : -1; });
}

/** Les adresses que l'on a le droit d'utiliser pour du démarchage. */
function mailsDemarchables() {
  return repertoire().filter(function (f) { return f.mail && f.demarchable; })
    .map(function (f) { return f.mail; });
}

function viewOwnerRepertoire() {
  var tous = repertoire();
  var filtre = state.repFiltre;
  var liste = tous.filter(function (f) {
    if (filtre === 'demarchables') return f.mail && f.demarchable;
    if (filtre === 'avecmail') return !!f.mail;
    if (filtre === 'sansmail') return !f.mail;
    if (filtre === 'fideles') return f.sejours.length > 1;
    return true;
  });

  var avecMail = tous.filter(function (f) { return f.mail; }).length;
  var okDemarchage = tous.filter(function (f) { return f.mail && f.demarchable; }).length;

  var FILTRES = [
    ['tous', 'Tous', tous.length],
    ['demarchables', 'Démarchage autorisé', okDemarchage],
    ['avecmail', 'Avec e-mail', avecMail],
    ['sansmail', 'Sans e-mail', tous.length - avecMail],
    ['fideles', 'Déjà revenus', tous.filter(function (f) { return f.sejours.length > 1; }).length]
  ];

  return ownerShell('repertoire',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Répertoire voyageurs</h1>' +
      '<p class="page-sub">Tous ceux qui ont séjourné chez vous, regroupés par personne. ' +
        'Les coordonnées viennent du formulaire du livret d\'accueil.</p></div>' +
      '<div class="kpis">' +
        '<div class="kpi"><div class="v num">' + tous.length + '</div><div class="l">voyageurs</div></div>' +
        '<div class="kpi"><div class="v num" style="color:' + C.vert + '">' + okDemarchage + '</div>' +
          '<div class="l">démarchage autorisé</div></div>' +
      '</div>' +
    '</div>' +

    /* Ce qu'on a le droit de faire, dit une fois clairement. */
    '<div class="alert alert--blue" style="margin-top:20px;max-width:none">' +
      '<div style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:' + C.bleu + '"></span>' +
      '<span class="kind">Ce que dit la loi</span></div>' +
      '<div class="det" style="margin-top:6px">Vous pouvez écrire à <strong>n\'importe quel voyageur</strong> ' +
        'pour ce qui concerne son séjour (livret, informations pratiques, facture). ' +
        'Pour lui envoyer des <strong>offres ou des nouveautés</strong>, il faut son accord : ' +
        'c\'est la case à cocher du livret d\'accueil, et c\'est le filtre ' +
        '« Démarchage autorisé » ci-dessous.</div>' +
    '</div>' +

    '<div class="chips" style="margin-top:18px">' + FILTRES.map(function (f) {
      return '<button type="button" class="chip" aria-pressed="' + (filtre === f[0]) + '"' +
        act('rep-filtre', { f: f[0] }) + '>' + esc(f[1]) +
        '<span class="chip-n num">' + f[2] + '</span></button>';
    }).join('') + '</div>' +

    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">' +
      '<button type="button" class="btn btn--dark btn--sm"' + act('rep-mails') + '>' +
        '✉ Copier ' + (okDemarchage > 1 ? 'les ' + okDemarchage + ' adresses' : 'l\'adresse') +
        ' autorisée' + (okDemarchage > 1 ? 's' : '') + '</button>' +
      '<button type="button" class="btn btn--sm" style="background:var(--cream);color:var(--ink-soft)"' +
        act('rep-export') + '>⬇ Exporter le répertoire (CSV)</button>' +
    '</div>' +

    '<div class="stack" style="margin-top:18px">' + (liste.length ? liste.map(function (f) {
      var d = f.dernier;
      return '<div class="card rep-card">' +
        '<div class="rep-top">' +
          '<div class="grow" style="min-width:0">' +
            '<div class="rep-nom">' + esc(f.nom) +
              (f.sejours.length > 1
                ? '<span class="badge badge--green" style="margin-left:8px">' + f.sejours.length + ' séjours</span>'
                : '') +
              (f.demarchable
                ? '<span class="badge badge--blue" style="margin-left:6px">✓ démarchage OK</span>'
                : '') +
            '</div>' +
            '<div class="rep-meta num">' +
              (f.mail ? esc(f.mail) : '<span class="rep-manque">aucune adresse e-mail</span>') +
              (f.tel ? ' · ' + esc(f.tel) : '') +
            '</div>' +
            '<div class="rep-meta num" style="margin-top:3px">' +
              'Dernier séjour : ' + esc(prop(d.pid).short) + ' · ' + esc(fmtDate(d.r.start)) +
              ' · ' + f.nuits + ' nuit' + (f.nuits > 1 ? 's' : '') + ' au total · ' + f.total + ' €' +
              (f.note !== null ? ' · a noté ' + fmtNote(f.note) + '/5' : '') +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;flex:none">' +
            (f.mail
              ? '<a class="btn btn--sm" style="background:var(--ink);color:#fff" href="' +
                  esc(mailtoVoyageur(f)) + '">✉ Écrire</a>'
              : '') +
            '<button type="button" class="btn btn--sm" style="background:var(--cream);color:var(--ink-soft)"' +
              act('open-resa', { rid: d.r.id }) + '>Son séjour →</button>' +
          '</div>' +
        '</div>' +
        '<div class="rep-props">' + f.props.map(function (pid) {
          var p = prop(pid);
          return '<span class="rep-prop"><span class="dot" style="background:' + p.color + '"></span>' +
            esc(p.short) + '</span>';
        }).join('') + '</div>' +
      '</div>';
    }).join('') : '<p class="empty">Aucun voyageur pour ce filtre. Les coordonnées arrivent quand ' +
      'les voyageurs remplissent le formulaire du livret d\'accueil.</p>') + '</div>');
}

/** Message pré-rempli vers un voyageur : l'application ne peut pas envoyer
    elle-même, elle ouvre la messagerie du propriétaire (même parti pris que
    l'invitation d'un prestataire, D-37). */
function mailtoVoyageur(f) {
  var d = f.dernier;
  var sujet = 'MAISON WARME — ' + prop(d.pid).name;
  var corps = 'Bonjour ' + f.nom + ',\n\n' +
    'Nous espérons que votre séjour au ' + prop(d.pid).name + ' s\'est bien passé.\n\n' +
    'Voici le lien de votre livret d\'accueil, si vous en avez besoin :\n' +
    appUrl() + '#/bienvenue\n\n' +
    'À bientôt,\nMAISON WARME';
  return 'mailto:' + encodeURIComponent(f.mail) +
    '?subject=' + encodeURIComponent(sujet) + '&body=' + encodeURIComponent(corps);
}

/* --- Missions ------------------------------------------------------------ */

function viewOwnerMissions() {
  var filters = [['all', 'Toutes'], ['dispo', 'Disponibles'], ['prise', 'Acceptées'], ['termine', 'Terminées']];
  var rows = state.missions
    .filter(function (m) { return state.missionFilter === 'all' || state.missionFilter === m.status; })
    .map(decorate);

  var form = !state.showNew ? '' :
    '<div class="card pop" style="margin-top:18px;padding:22px">' +
      '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 16px">Nouvelle mission</h2>' +
      '<div class="cols" style="gap:14px">' +
        '<div style="flex:2;min-width:220px"><label class="lab" for="nm-prop">Bien</label>' +
          '<select class="inp" id="nm-prop" data-fid="nm-prop" data-ch="nm-prop">' + state.props.map(function (p) {
            return '<option value="' + p.id + '"' + (state.nm.prop === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
          }).join('') + '</select></div>' +
        '<div style="flex:1.4;min-width:180px"><label class="lab" for="nm-type">Type de prestation</label>' +
          '<select class="inp" id="nm-type" data-fid="nm-type" data-ch="nm-type">' + state.services.map(function (s) {
            return '<option value="' + esc(s.key) + '"' + (state.nm.type === s.key ? ' selected' : '') + '>' + esc(s.label) + '</option>';
          }).join('') + '</select></div>' +
        '<div style="flex:1;min-width:150px"><label class="lab" for="nm-date">Date</label>' +
          '<input class="inp num" id="nm-date" type="date" value="' + esc(state.nm.date) + '" data-fid="nm-date" data-ch="nm-date"></div>' +
        '<div style="flex:1;min-width:150px"><label class="lab" for="nm-window">Créneau</label>' +
          '<input class="inp" id="nm-window" type="text" value="' + esc(state.nm.window) + '" data-fid="nm-window" data-in="nm-window"></div>' +
        '<div style="flex:.8;min-width:120px"><label class="lab" for="nm-price">Tarif (€)</label>' +
          '<input class="inp num" id="nm-price" type="number" min="0" value="' + esc(state.nm.price) + '" data-fid="nm-price" data-in="nm-price"></div>' +
      '</div>' +
      '<div style="margin-top:14px"><label class="lab" for="nm-note">Note pour le prestataire (facultatif)</label>' +
        '<input class="inp" id="nm-note" type="text" placeholder="Ex. Prendre les draps dans le placard du couloir." value="' + esc(state.nm.note || '') + '" data-fid="nm-note" data-in="nm-note"></div>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:18px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn--primary btn--sm"' + act('create-mission') + '>Créer la mission</button>' +
        '<button type="button" class="btn btn--sm" style="background:transparent;color:var(--muted)"' + act('toggle-new') + '>Annuler</button>' +
        '<span class="sec-note">Tarif pré-rempli depuis la fiche du bien · publiée aussitôt au pool</span>' +
      '</div>' +
    '</div>';

  return ownerShell('missions',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Missions</h1>' +
      '<p class="page-sub">Créées automatiquement à chaque check-out, ou manuellement.<br>' +
        'Cliquez une mission pour la suivre, y laisser une note, ou revoir les photos et le relevé.</p></div>' +
      '<button type="button" class="btn btn--xs" style="' + (state.showNew ? 'background:var(--cream);color:var(--ink-soft)' : 'background:var(--terra);color:#fff') +
        ';min-height:42px;font-size:13px"' + act('toggle-new') + '>' +
        (state.showNew ? 'Fermer le formulaire' : '+ Créer une mission') + '</button>' +
    '</div>' + form +

    '<div class="chiprow" style="margin:20px 0 16px">' + filters.map(function (f) {
      return '<button type="button" class="chip" aria-pressed="' + (state.missionFilter === f[0]) + '"' +
        act('mission-filter', { f: f[0] }) + '>' + f[1] + '</button>';
    }).join('') + '</div>' +

    '<div class="table"><div class="table-scroll">' +
      '<div class="thead"><span style="width:96px">Date</span><span style="flex:1.4">Bien</span>' +
      '<span style="flex:1">Type</span><span style="width:120px">Créneau</span>' +
      '<span style="flex:1">Statut</span><span style="width:70px;text-align:right">Prix</span>' +
      '<span style="width:76px"></span></div>' +
      (rows.length ? rows.map(function (m) {
        var done = m.raw.status === 'termine';
        var extra = done
          ? '<span class="badge ' + (m.reviewed ? 'badge--green' : 'badge--amber') + '">' +
              (m.reviewed ? 'Validée' : 'À revoir') + '</span>'
          : m.redoLabel ? '<span class="badge badge--terra">Reprise demandée</span>' : '';
        if (m.raw.note) extra += '<span class="badge badge--soft" title="' + esc(m.raw.note) + '">✎ Note</span>';

        return '<button type="button" class="trow trow--link" aria-label="' +
            esc((done ? 'Revoir' : 'Ouvrir') + ' la mission ' + m.typeLabel + ' — ' + m.propName + ', ' + m.dateLabel) + '"' +
            act('nav', { path: '#/admin/missions/' + m.id }) + '>' +
          '<span class="num" style="width:96px;font-weight:600">' + esc(m.dateLabel) + '</span>' +
          '<span style="flex:1.4;display:flex;align-items:center;gap:9px;min-width:0">' +
            '<span class="dot" style="width:7px;height:7px;background:' + m.color + '"></span>' + esc(m.propName) + '</span>' +
          '<span style="flex:1;color:var(--muted3)">' + esc(m.typeLabel) + '</span>' +
          '<span class="num" style="width:120px;color:var(--muted3)">' + esc(m.windowLabel) + '</span>' +
          '<span style="flex:1;display:flex;align-items:center;gap:7px;flex-wrap:wrap">' +
            '<span class="badge ' + m.statusCls + '">' + esc(m.statusLabel) + '</span>' + extra + '</span>' +
          '<span class="num" style="width:70px;text-align:right;font-weight:600">' + esc(m.priceLabel) + '</span>' +
          '<span class="trow-go">' + (done ? 'Revoir →' : 'Ouvrir →') + '</span>' +
          '</button>';
      }).join('') : '<p class="empty">Aucune mission pour ce filtre.</p>') +
    '</div></div>');
}

/* Réservations en cours et à venir — le cœur du tableau de bord depuis la
   session 12. Remplace la liste des missions à 7 jours : ce qui compte, ce
   n'est pas le ménage tout seul, c'est **l'état de chaque séjour**. Une ligne
   par réservation, cliquable, avec quatre signaux (D-54) :
     · où en est le ménage du départ (non prise, acceptée, en cours, terminée) ;
     · où en est le voyageur (à venir, sur place, parti) ;
     · la note de propreté qu'il a laissée ;
     · la note de son séjour.
   On garde les séjours en cours et les 30 jours qui viennent. */
function resasEnCours() {
  var fin = jourPlus(TODAY, 30);
  return allResas().filter(function (x) {
    return x.r.statut !== 'annule' && x.r.end >= TODAY && x.r.start <= fin;
  });
}

/* La mission de ménage d'un séjour. Le lien direct (`fromResa`) n'existe que
   sur les réservations créées depuis la session 7 : pour toutes les autres —
   missions saisies à la main, données anciennes, jeu de démonstration — on
   retombe sur la règle métier, qui ne trompe pas : le ménage d'un séjour est
   celui qui tombe le jour du départ, dans ce logement. */
function missionDuDepart(pid, r) {
  var cle = resaKey(pid, r);
  var direct = state.missions.find(function (q) { return q.fromResa === cle; });
  if (direct) return direct;

  var mm = state.missions.filter(function (q) { return q.prop === pid && q.date === r.end; });
  if (!mm.length) return null;
  // S'il y en a plusieurs ce jour-là, le ménage prime sur le reste.
  var premier = state.services[0] ? state.services[0].key : 'menage';
  return mm.find(function (q) { return q.type === premier; }) || mm[0];
}

/** L'état d'un séjour, prêt à afficher. */
function etatResa(x) {
  var pid = x.pid, r = x.r;
  var m = missionDuDepart(pid, r);
  var parti = departAt(pid, r);

  // Où en est le voyageur ? Le départ signalé prime sur le calcul par dates.
  var sejour = parti ? { l: 'Parti à ' + parti, c: 'badge--green' }
    : r.end === TODAY ? { l: 'Part aujourd’hui', c: 'badge--amber' }
      : r.start === TODAY ? { l: 'Arrive aujourd’hui', c: 'badge--amber' }
        : r.start <= TODAY ? { l: 'Sur place', c: 'badge--green' }
          : { l: 'Dans ' + nights(TODAY, r.start) + ' j', c: 'badge--soft' };

  // Où en est le ménage prévu au départ ?
  var menage = !m ? { l: 'Pas de ménage', c: 'badge--soft' }
    : m.status === 'dispo' ? { l: 'Ménage non pris', c: 'badge--terra' }
      : m.status === 'termine' ? { l: 'Ménage fait · ' + m.taker, c: 'badge--green' }
        : m.status === 'encours' ? { l: 'Ménage en cours · ' + m.taker, c: 'badge--amber' }
          : { l: 'Ménage pris · ' + m.taker, c: 'badge--blue' };

  return {
    pid: pid, r: r, mission: m, sejour: sejour, menage: menage,
    avisMenage: avisDone(pid, r, 'menage'),
    avisSejour: avisDone(pid, r, 'sejour')
  };
}

/* Le déménagement des données vers le grand cahier partagé (§19.6).
   N'apparaît que pour un propriétaire connecté avec un vrai compte, et
   disparaît de lui-même une fois que la base contient les biens. */
function blocDemenagement() {
  if (typeof DB === 'undefined' || !DB.estDispo()) return '';
  var p = DB.profil();
  if (!p || p.role !== 'owner') return '';

  var fini = /^✅/.test(state.migMsg || '');

  return '<div class="card" style="margin-top:20px;border-left:4px solid var(--terra)">' +
    '<h2 class="sec-title" style="margin:0 0 6px">Mise en service — déménager mes données</h2>' +
    '<p class="page-sub" style="margin:0 0 14px">' +
      'Tes logements, réservations et missions vivent encore dans ce navigateur. ' +
      'Ce bouton les recopie dans le cahier partagé, pour que tes prestataires et tes ' +
      'voyageurs les voient enfin. Rien n\'est effacé ici, et tu peux le relancer sans risque.' +
    '</p>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn--primary"' +
        (state.migEnCours ? ' disabled' : '') + act('demenager') + '>' +
        (state.migEnCours ? 'Déménagement en cours…' : 'Déménager mes données') + '</button>' +
      '<button type="button" class="btn" style="background:var(--cream);color:var(--ink-soft)"' +
        act('refaire-missions') + '>Recréer les missions manquantes</button>' +
    '</div>' +
    '<p class="sec-note" style="margin:10px 0 0">' +
      'Le second bouton reconstruit une mission de ménage pour chaque départ à venir qui n\'en a ' +
      'plus. Il ne touche ni aux missions existantes, ni à l\'historique de paie.</p>' +
    (state.migMsg
      ? '<p class="page-sub" style="margin:12px 0 0;color:' + (fini ? 'var(--vert)' : 'var(--terra)') + '">' +
        esc(state.migMsg) + '</p>'
      : '') +
    '</div>' +
    blocRepartirDeZero();
}

/* Repartir de zéro (session 14). Sert une fois : jeter les quatre logements
   de démonstration — « Le Nid du Vieux Port » et les autres — avec leurs
   voyageurs inventés. Tant qu'ils sont là, l'encadré insiste ; ensuite il
   devient discret, mais reste disponible. */
function blocRepartirDeZero() {
  if (typeof DB === 'undefined' || !DB.estDispo()) return '';
  var p = DB.profil();
  if (!p || p.role !== 'owner') return '';

  var demo = resteDeDemo();

  return '<div class="card" style="margin-top:20px;border-left:4px solid ' +
      (demo ? 'var(--terra)' : 'var(--line)') + '">' +
    '<h2 class="sec-title" style="margin:0 0 6px">' +
      (demo ? '⚠️ Il reste des logements de démonstration' : 'Repartir de zéro') + '</h2>' +
    '<p class="page-sub" style="margin:0 0 14px">' +
      (demo
        ? 'Les logements « Le Nid du Vieux Port », « Studio Canal Saint-Martin », ' +
          '« Villa Les Oliviers » et « Loft Bellecour » sont des exemples, avec des voyageurs ' +
          'inventés. Ce bouton les efface — ici et dans le cahier partagé — pour que tu saisisses ' +
          'tes vrais logements sur une page blanche.'
        : 'Efface tous les logements, séjours et missions, ici et dans le cahier partagé. ' +
          'À n\'utiliser que pour tout recommencer.') +
    '</p>' +
    '<button type="button" class="btn" style="background:var(--terra);color:#fff"' +
      act('vider-tout') + '>Tout effacer et repartir de zéro</button>' +
    '<p class="sec-note" style="margin:10px 0 0">Sans retour possible : logements, séjours, ' +
      'missions, stocks, fiches de prestataires et historique de paie repartent à zéro. ' +
      'Seuls les comptes déjà créés (le tien, ceux de tes prestataires) sont conservés — ' +
      'il suffira de les relier à leur nouvelle fiche.</p>' +
    '</div>';
}

function blocResasEnCours() {
  var lignes = resasEnCours().map(etatResa);

  return '<section style="flex:1.7;min-width:min(100%,520px)">' +
    '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">' +
      '<h2 class="sec-title" style="margin:0">Réservations en cours et à venir</h2>' +
      '<button type="button" style="font:600 12.5px Figtree,sans-serif;color:var(--terra)"' +
        act('nav', { path: '#/admin/calendrier' }) + '>Le planning</button>' +
    '</div>' +
    '<div class="card card--flush" style="padding:6px 18px"><div class="list">' +
    (lignes.length ? lignes.map(function (e) {
      var p = prop(e.pid), r = e.r;
      var pl = PLATS[r.plat] || PLATS['Direct'];
      var jour = r.start.split('-');

      return '<button type="button" class="list-row list-row--go"' +
        act('open-resa', { rid: r.id }) + '>' +
        '<div class="day-badge num"><div class="d">' + parseInt(jour[2], 10) + '</div>' +
          '<div class="m">' + MOIS[parseInt(jour[1], 10) - 1] + '</div></div>' +
        '<div class="bar" style="background:' + p.color + '"></div>' +
        '<div class="grow" style="min-width:0">' +
          '<div style="font:600 14.5px Figtree,sans-serif">' + esc(r.guest) + '</div>' +
          '<div class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:2px">' +
            esc(p.short) + ' · ' + esc(fmtDate(r.start)) + ' → ' + esc(fmtDate(r.end)) +
            ' · ' + r.guests + ' pers.</div>' +
          '<div class="resa-tags">' +
            '<span class="badge" style="background:' + pl.bg + ';color:' + pl.fg + '">' + esc(r.plat) + '</span>' +
            '<span class="badge ' + e.sejour.c + '">' + esc(e.sejour.l) + '</span>' +
            '<span class="badge ' + e.menage.c + '">' + esc(e.menage.l) + '</span>' +
            (r.arriveePrevue ? '<span class="badge badge--blue">🕐 ' + esc(r.arriveePrevue) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="resa-notes">' +
          (e.avisMenage
            ? '<span class="resa-note" title="Note de la propreté">' + starsRead(e.avisMenage.stars) +
              '<span class="resa-note-l">propreté</span></span>' : '') +
          (e.avisSejour
            ? '<span class="resa-note" title="Note du séjour">' + starsRead(e.avisSejour.stars) +
              '<span class="resa-note-l">séjour</span></span>' : '') +
        '</div>' +
        '<span class="trow-go">Ouvrir →</span>' +
        '</button>';
    }).join('') : '<p class="empty">Aucune réservation en cours ni dans les 30 jours.</p>') +
    '</div></div>' +
  '</section>';
}

/* Voyageurs à confirmer : ils ont ouvert le livret sans que leur plateforme
   ait transmis de numéro de téléphone (Booking.com et la plupart des autres).
   Un clic leur donne le code d'accès et le Wi-Fi (D-47). */
function blocAcces(attente) {
  if (!attente.length) return '';

  return '<section style="margin-top:26px">' +
    '<h2 class="sec-title" style="margin:0 0 12px">' +
      attente.length + ' voyageur' + (attente.length > 1 ? 's' : '') + ' à confirmer</h2>' +
    '<div class="card" style="padding:18px 20px">' +
      '<p class="sec-note" style="margin:0 0 14px">Ces personnes ont ouvert le livret en indiquant ' +
        'leur logement et leur date d\'arrivée, mais leur plateforme ne nous transmet pas de numéro ' +
        'de téléphone. Elles voient déjà tout le livret, <strong>sauf le code d\'accès et le Wi-Fi</strong>.</p>' +
      '<div class="stack">' + attente.map(function (d) {
        var p = prop(d.pid);
        var f = d.resa ? resaById(d.resa) : null;
        return '<div class="acces-row" style="--accent:' + p.color + '">' +
          '<span class="dot" style="background:' + p.color + '"></span>' +
          '<div class="grow" style="min-width:0">' +
            '<div style="font:700 14.5px Figtree,sans-serif">' + esc(d.nom) + '</div>' +
            '<div class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:2px">' +
              esc(p.name) + ' · arrivée le ' + esc(fmtDate(d.date)) + ' · demandé à ' + esc(d.at) + '</div>' +
            '<div style="font:500 12px Figtree,sans-serif;margin-top:4px;color:' +
              (f ? 'var(--green-t)' : 'var(--terra-d)') + '">' +
              (f ? '✓ Correspond au séjour de ' + esc(f.r.guest) + ' (' + esc(PLATS[f.r.plat] ? f.r.plat : 'Direct') + ')'
                 : '⚠ Aucune réservation ne correspond à cette date') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;flex:none">' +
            '<button type="button" class="btn btn--sm" style="background:var(--green-bg);color:var(--green-t)"' +
              act('acces-valider', { did: d.id }) + '>C\'est bien mon voyageur</button>' +
            '<button type="button" class="btn btn--sm" style="background:var(--cream);color:var(--muted)"' +
              act('acces-refuser', { did: d.id }) + '>Je ne le reconnais pas</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>' +
    '</div></section>';
}

/* --- Revue d'une mission terminée ---------------------------------------- */

/* LES PHOTOS DU CASIER, CÔTÉ PROPRIÉTAIRE (lot 2).
   Le casier n'est pas public : on ne peut pas fabriquer l'adresse d'une photo,
   il faut la **demander** à Supabase, qui en rend une valable une heure. Ces
   adresses ne sont donc **jamais enregistrées** — elles seraient périmées au
   rechargement suivant. On les garde en mémoire vive, le temps de la visite.

   La vue étant une fonction pure appelée à chaque redessin, elle ne peut pas
   attendre : on lance la demande une fois, on redessine quand la réponse
   arrive, et entre les deux l'écran dit « chargement ». */
var photosParMission = {};      // { missionId: { etapeId: adresse } }
var photosDemandees = {};       // { missionId: true } — demande déjà lancée

function photosDeLaMission(mid, rep) {
  if (photosParMission[mid]) return photosParMission[mid];
  if (photosDemandees[mid]) return null;                 // en cours
  if (typeof DB === 'undefined' || !DB.estDispo() || !DB.profil()) return {};

  var etapes = [];
  (rep && rep.rooms ? rep.rooms : []).forEach(function (r) {
    (r.steps || []).forEach(function (s) { if (s.id && s.photo && s.done) etapes.push(s.id); });
  });
  if (!etapes.length) { photosParMission[mid] = {}; return photosParMission[mid]; }

  photosDemandees[mid] = true;
  DB.urlsPhotos(mid, etapes)
    .then(function (urls) { photosParMission[mid] = urls || {}; render(); })
    .catch(function () { photosParMission[mid] = {}; render(); });
  return null;
}

/* LA PHOTO GARDÉE SUR L'APPAREIL (session 16)

   Le casier partagé n'est pas le seul endroit où vit une photo : elle est
   d'abord enregistrée dans le navigateur qui l'a prise. Tant que le
   propriétaire et le prestataire travaillent sur le **même** appareil — la
   mise au point, la recette, le propriétaire qui fait lui-même un ménage —
   la photo est là, sous la main, et la revue affichait pourtant
   « photo restée sur le téléphone ». C'était le principal reproche fait aux
   photos : elles marchaient, mais on ne les voyait jamais.

   On regarde donc les deux endroits, le casier d'abord. */
function photoLocale(mid, sid) {
  var v = (state.photos[mid] || {})[sid];
  return typeof v === 'string' && v.indexOf('data:') === 0 ? v : null;
}

/* Une photo ouverte en grand, par-dessus l'écran. Une vignette de 44 pixels
   n'apprend rien : il faut pouvoir regarder. */
function vueGrandePhoto() {
  if (!state.photoPlein) return '';
  var p = state.photoPlein;
  var url = '';
  if (p.indexOf('probleme:') === 0) {
    var pb = state.problems.find(function (x) { return x.id === p.slice(9); });
    url = pb ? pb.photo : '';
  } else {
    var c = p.split(':');
    url = (photosParMission[c[0]] || {})[c[1]] || photoLocale(c[0], c[1]) || '';
  }
  if (!url) return '';
  return '<div class="photo-plein"' + act('photo-fermer') + '>' +
    '<img src="' + esc(url) + '" alt="Photo en grand">' +
    '<button type="button" class="photo-plein-x" aria-label="Fermer"' + act('photo-fermer') + '>✕</button>' +
    '</div>';
}

/* LES PROBLÈMES SIGNALÉS, ET COMMENT ILS VOYAGENT (session 16 — D-79)

   Ils vivaient dans `state.problems`, c'est-à-dire dans le navigateur de
   celui qui les avait écrits. Un prestataire qui signalait une casse depuis
   son téléphone était donc le seul à la voir : rien ne remontait chez le
   propriétaire.

   La table `missions` ne connaît pas les signalements, et on ne veut pas
   demander un script SQL de plus. On les range donc dans le **compte rendu**
   de la mission (`report`), qui est un champ libre déjà transporté par le
   cahier partagé et que le prestataire a le droit d'écrire sur ses propres
   missions. Le compte rendu peut ainsi exister avant la fin de la mission :
   il ne contient alors que `problemes`, et la revue doit le supporter. */
/* TOUS LES SIGNALEMENTS, D'OÙ QU'ILS VIENNENT (session 19, audit du stockage)

   `state.problems` est la liste locale du prestataire qui les a saisis. Sur
   l'appareil du PROPRIÉTAIRE elle est vide : les signalements lui arrivent
   dans le compte rendu de la mission (`report.problemes`), qui voyage, lui.
   Le tableau de bord ne regardait que `state.problems` : l'alerte « problème
   à traiter » ne s'est donc **jamais** allumée chez le propriétaire, quel que
   soit le nombre de casses signalées. Encore la règle 14. */
function tousLesProblemes() {
  var vus = {};
  var out = [];
  (state.problems || []).forEach(function (p) {
    if (p && p.id) vus[p.id] = true;
    out.push(p);
  });
  Object.keys(state.reports || {}).forEach(function (mid) {
    ((state.reports[mid] || {}).problemes || []).forEach(function (p) {
      if (p && p.id && !vus[p.id]) { vus[p.id] = true; out.push(p); }
    });
  });
  return out;
}

function problemesDe(mid) {
  var vus = {};
  var out = [];
  state.problems.forEach(function (p) {
    if (p.mission !== mid) return;
    vus[p.id] = true;
    out.push(p);
  });
  var rep = state.reports[mid];
  ((rep && rep.problemes) || []).forEach(function (p) {
    if (p && p.id && !vus[p.id]) { vus[p.id] = true; out.push(p); }
  });
  return out.sort(function (a, b) { return (a.at || '') < (b.at || '') ? -1 : 1; });
}

/** Recopie les signalements d'une mission dans son compte rendu, pour qu'ils
    partent dans le cahier partagé avec elle. */
function verserProblemes(mid) {
  var pbs = state.problems.filter(function (p) { return p.mission === mid; });
  if (!pbs.length) return;
  var rep = state.reports[mid] || (state.reports[mid] = {});
  rep.problemes = pbs.map(function (p) { return p; });
}

/** Le libellé d'un type de problème, avec sa couleur. */
var TYPES_PROBLEME = {
  casse: ['Quelque chose est cassé', C.terracotta],
  degat: ['Dégât ou tache importante', '#B04A26'],
  manque: ['Il manque du matériel', C.ambre],
  acces: ['Problème d’accès au logement', C.bleu],
  autre: ['Autre', C.bleu]
};

function typeProbleme(k) { return TYPES_PROBLEME[k] || TYPES_PROBLEME.autre; }

function viewOwnerMission() {
  var m = mission(route.id), d = decorate(m);
  var rep = state.reports[m.id];
  var lotPhotos = photosDeLaMission(m.id, rep);
  var photosEnCours = lotPhotos === null;
  var photosMission = lotPhotos || {};
  var ag = m.taker ? agent(m.taker) : null;
  var fini = m.status === 'termine';
  var valide = m.review === 'valide';

  // Comptes lus dans le compte rendu figé, et non dans la checklist actuelle
  // du bien, qui a pu être modifiée depuis.
  // Un compte rendu peut n'être qu'un porteur de signalements, sur une mission
  // encore en cours (session 16) : il n'a alors ni pièces ni étapes.
  var repComplet = rep && Array.isArray(rep.rooms) ? rep : null;
  var repDone = 0, repTotal = 0;
  if (repComplet) repComplet.rooms.forEach(function (r) {
    repTotal += r.steps.length;
    repDone += r.steps.filter(function (s) { return s.done; }).length;
  });

  /* Colonne de gauche : la checklist telle qu'elle a été exécutée. */
  var checklist = !fini
    ? '<div class="card"><p class="empty">La checklist s\'affichera ici une fois la mission terminée.</p></div>'
    : !repComplet
    ? '<div class="card"><p class="empty">Le détail de cette mission n\'a pas été conservé : ' +
        'elle a été terminée avant la mise en place de la revue.</p></div>'
    : repComplet.rooms.map(function (r) {
        var dn = r.steps.filter(function (s) { return s.done; }).length;
        return '<div class="card" style="padding:18px 20px">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
            '<span class="dot" style="background:' + d.color + '"></span>' +
            '<span style="font:700 16px Figtree,sans-serif;flex:1;min-width:0">' + esc(r.name) + '</span>' +
            '<span class="badge num ' + (dn === r.steps.length ? 'badge--green' : 'badge--amber') + '">' +
              dn + '/' + r.steps.length + '</span>' +
          '</div>' +
          '<div class="revue-grid">' + r.steps.map(function (s) {
            /* La vraie photo, si elle est arrivée dans le casier (lot 2).
               Trois cas, et il faut les distinguer pour ne pas faire croire à
               une panne : l'image est là ; elle est en cours de récupération ;
               ou elle n'a jamais été déposée — comptes rendus d'avant la
               session 15, ou mission faite sans réseau. */
            var duCasier = s.id ? photosMission[s.id] : null;
            var surLAppareil = s.id ? photoLocale(m.id, s.id) : null;
            var url = duCasier || surLAppareil;
            var thumb = url
              ? '<button type="button" class="revue-thumb" style="padding:0;overflow:hidden;cursor:zoom-in"' +
                  act('photo-plein', { p: m.id + ':' + s.id }) + ' aria-label="Voir en grand la photo · ' + esc(s.label) + '">' +
                  '<img src="' + esc(url) + '" alt="Photo · ' + esc(s.label) + '" ' +
                  'style="width:100%;height:100%;object-fit:cover;display:block"></button>'
              : s.photo && s.done
                ? '<span class="revue-thumb stripe">' + (photosEnCours ? '…' : 'PHOTO') + '</span>'
                : '<span class="revue-thumb revue-thumb--none">' + (s.done ? '✓' : '—') + '</span>';
            return '<div class="revue-step">' + thumb +
              '<div class="grow">' +
                '<div style="font:600 13.5px/1.3 Figtree,sans-serif">' + esc(s.label) + '</div>' +
                '<div style="font:500 11.5px Figtree,sans-serif;color:var(--muted2);margin-top:3px">' +
                  (!s.done ? 'Non validé'
                    : !s.photo ? 'Validé sans photo'
                      : duCasier ? 'Photo reçue'
                        : surLAppareil ? 'Photo prise · gardée sur cet appareil'
                          : photosEnCours ? 'Photo en cours de chargement…'
                            : 'Validée · photo restée sur le téléphone') + '</div>' +
              '</div></div>';
          }).join('') + '</div>' +
          '</div>';
      }).join('');

  /* Colonne de droite : qui a fait la mission, et les deux décisions. */
  var recap = !fini ? '' : '<div class="card" style="padding:20px">' +
    '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 14px">Mission réalisée par</h2>' +
    (ag ? '<div style="display:flex;align-items:center;gap:12px">' +
      '<div class="avatar" style="width:44px;height:44px;font-size:15px;background:' + ag.avatarBg + ';color:' + ag.avatarFg + '">' + ag.init + '</div>' +
      '<div><div style="font:700 16px Figtree,sans-serif">' + esc(ag.name) + '</div>' +
      '<div style="font:500 12.5px Figtree,sans-serif;color:var(--muted)">' + esc(ag.role) + '</div></div>' +
      '</div>' : '<p class="sec-note">Prestataire inconnu.</p>') +
    '<div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(36,30,26,.07)">' +
      [['Étapes validées', repComplet ? repDone + ' / ' + repTotal : '—'],
       ['Photos envoyées', repComplet ? String(repComplet.photos) : '—'],
       ['Articles sous le seuil', repComplet ? String(repComplet.lows.length) : '—'],
       ['Rémunération', d.priceLabel]].map(function (r) {
        return '<div class="kv"><span class="k">' + r[0] + '</span><span class="v num" style="font-weight:700">' + esc(r[1]) + '</span></div>';
      }).join('') +
    '</div></div>';

  var decision = !fini ? '' : valide
    ? '<div class="alert alert--green">' +
        '<div style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:' + C.vert + '"></span>' +
        '<span class="kind">Mission validée</span></div>' +
        '<div class="det" style="color:var(--green-t)">Le travail est accepté. Le montant est dû au prestataire.</div></div>'
    : '<div class="card" style="padding:20px">' +
        '<h2 style="font:700 16px Figtree,sans-serif;margin:0">Votre décision</h2>' +
        '<p class="sec-note" style="margin-top:4px">Une reprise renvoie la mission au pool : ' +
          'le montant est retiré des gains tant qu\'elle n\'est pas refaite.</p>' +
        '<button type="button" class="btn btn--go btn--sm" style="width:100%;margin-top:14px"' +
          act('validate-mission', { id: m.id }) + '>Valider la mission</button>' +
        '<button type="button" class="btn btn--quiet btn--sm" style="width:100%;margin-top:10px"' +
          act('ask-redo', { id: m.id }) + '>Demander une reprise</button>' +
      '</div>';

  /* LES PROBLÈMES SIGNALÉS (session 16).
     Le prestataire pouvait les envoyer depuis sa mission ; ils n'étaient
     affichés nulle part côté propriétaire, sinon par un décompte sur le
     tableau de bord. Ils sont désormais lisibles là où on les cherche :
     dans la mission qui les a fait remonter. */
  var pbs = problemesDe(m.id);
  var problemesCard = !pbs.length ? '' : '<div class="card" style="padding:20px">' +
    '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 4px">Problème signalé (' + pbs.length + ')</h2>' +
    '<p class="sec-note" style="margin:0 0 12px">Envoyé par le prestataire pendant la mission.</p>' +
    '<div class="stack" style="gap:12px">' + pbs.map(function (p) {
      var ty = typeProbleme(p.kind);
      return '<div style="border:1.5px solid rgba(36,30,26,.09);border-radius:16px;padding:13px 14px' +
        (p.statut === 'traite' ? ';opacity:.62' : '') + '">' +
        '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">' +
          '<span class="dot" style="width:9px;height:9px;background:' + ty[1] + '"></span>' +
          '<span style="font:700 14px Figtree,sans-serif;flex:1;min-width:0">' + esc(ty[0]) + '</span>' +
          '<span class="badge ' + (p.statut === 'traite' ? 'badge--green' : 'badge--terra') + '">' +
            (p.statut === 'traite' ? 'Traité' : 'À traiter') + '</span>' +
        '</div>' +
        '<div class="num" style="font:500 11.5px Figtree,sans-serif;color:var(--muted2);margin-top:4px">' +
          esc((p.agent ? agent(p.agent).name + ' · ' : '') + fmtDate(p.date) + (p.at ? ' à ' + p.at : '')) + '</div>' +
        (p.texte ? '<p style="font:500 13.5px/1.5 Figtree,sans-serif;margin:9px 0 0;white-space:pre-wrap">' +
          esc(p.texte) + '</p>' : '<p class="sec-note" style="margin:9px 0 0">Sans commentaire.</p>') +
        (p.photo
          ? '<button type="button" style="margin-top:10px;width:120px;height:90px;border-radius:12px;overflow:hidden;padding:0;cursor:zoom-in;background:var(--fill)"' +
              act('photo-plein', { p: 'probleme:' + p.id }) + ' aria-label="Voir la photo du problème en grand">' +
              '<img src="' + esc(p.photo) + '" alt="Photo du problème" style="width:100%;height:100%;object-fit:cover;display:block"></button>'
          : '<p class="sec-note" style="margin-top:8px">Aucune photo jointe.</p>') +
        '<div style="margin-top:10px">' +
          '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
            act('probleme-statut', { id: p.id }) + '>' +
            (p.statut === 'traite' ? 'Rouvrir' : 'Marquer comme traité') + '</button>' +
        '</div>' +
        '</div>';
    }).join('') + '</div></div>';

  /* Note libre, visible par le prestataire dans le détail de sa mission. */
  var noteCard = '<div class="card" style="padding:20px">' +
    '<h2 style="font:700 16px Figtree,sans-serif;margin:0">Note pour le prestataire</h2>' +
    '<p class="sec-note" style="margin-top:4px">Elle s\'affiche en évidence sur son téléphone, avant qu\'il commence.</p>' +
    '<textarea class="inp" style="margin-top:12px" id="mn-' + esc(m.id) + '" placeholder="Ex. Le voisin a la clé de la cave. Penser à arroser le basilic."' +
      ' data-fid="mn-' + esc(m.id) + '" data-in="mission-note" data-id="' + esc(m.id) + '">' + esc(m.note || '') + '</textarea>' +
  '</div>';

  /* Ce que le propriétaire voit sur une mission encore en cours. */
  var suivi = fini ? '' : '<div class="card" style="padding:20px">' +
    '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 14px">Suivi</h2>' +
    [['Statut', d.statusLabel],
     ['Prestataire', m.taker ? agent(m.taker).name : 'Personne pour l\'instant'],
     ['Étapes validées', d.done + ' / ' + d.total],
     ['Rémunération', d.priceLabel],
     ['Voyageur sortant', m.res ? m.res.guest + ' · ' + m.res.guests + ' voyageurs' : '—'],
     ['Prochaine arrivée', m.next ? m.next.guest + ' · ' + m.next.at : '—']].map(function (r) {
      return '<div class="kv"><span class="k">' + r[0] + '</span><span class="v num" style="font-weight:600">' + esc(r[1]) + '</span></div>';
    }).join('') +
  '</div>';

  /* Bas de page : le relevé de stock envoyé avec la mission. */
  var releve = !repComplet ? '' :
    '<h2 class="sec-title" style="margin:30px 0 12px">Relevé de stock envoyé</h2>' +
    '<div class="grid-cards">' + grouped().map(function (g) {
      return '<div class="card">' +
        '<div style="font:700 15px Figtree,sans-serif">' + esc(g[0]) + '</div>' +
        '<div class="list" style="margin-top:8px">' + g[1].map(function (a) {
          var qty = repComplet.qty[a.key] || 0, low = repComplet.lows.indexOf(a.key) >= 0;
          var cls = qty === 0 ? 'cell-q--zero' : low ? 'cell-q--low' : 'cell-q--ok';
          return '<div class="list-row" style="padding:9px 0">' +
            '<span class="grow" style="font:500 13.5px Figtree,sans-serif;color:' + (low ? 'var(--terra-d)' : 'var(--ink)') + '">' +
              esc(a.label) + '</span>' +
            '<span class="cell-q num ' + cls + '" style="min-width:44px">' + qty + '</span>' +
            '</div>';
        }).join('') + '</div></div>';
    }).join('') + '</div>';

  return ownerShell('missions',
    '<button type="button" class="btn-back" style="min-height:38px;font-size:13px;color:var(--muted)"' +
      act('nav', { path: '#/admin/missions' }) + '>← Toutes les missions</button>' +
    '<div class="page-head" style="margin-top:6px">' +
      '<div><h1 class="page-title">' + esc(d.propName) + '</h1>' +
      '<p class="page-sub num">' + esc(d.typeLabel + ' · ' + d.dateLabel + ' · ' + d.windowLabel) + '</p></div>' +
      '<span class="badge ' + (!fini ? d.statusCls : valide ? 'badge--green' : 'badge--amber') + '" style="font-size:13px;padding:8px 14px">' +
        esc(!fini ? d.statusLabel : valide ? 'Validée' : 'En attente de votre validation') + '</span>' +
    '</div>' +

    '<div class="cols" style="margin-top:24px">' +
      '<section style="flex:1.7;min-width:min(100%,380px);display:flex;flex-direction:column;gap:14px">' +
        '<h2 class="sec-title" style="margin:0">Checklist exécutée</h2>' + checklist +
      '</section>' +
      '<section style="flex:1;min-width:min(100%,280px);display:flex;flex-direction:column;gap:14px">' +
        problemesCard + noteCard + suivi + recap + decision +
        (state.migMsg ? '<p class="sec-note">' + esc(state.migMsg) + '</p>' : '') +
        '<button type="button" class="btn-danger-xs" style="align-self:flex-start"' +
          act('remove-mission', { id: m.id }) + '>Supprimer cette mission</button>' +
      '</section>' +
    '</div>' + releve + vueGrandePhoto());
}

/* --- Prestataires -------------------------------------------------------- */

/* --------------------------------------------------------------------------
   Calendrier : le planning de tous les logements
   Logements en lignes, jours en colonnes, une barre par séjour aux couleurs
   de la plateforme. La barre commence et finit au milieu du jour, pour que le
   départ de l'un et l'arrivée de l'autre se voient le même jour (turnover).
   -------------------------------------------------------------------------- */

var PLAN_JOURS = 31;    // nombre de jours affichés
var PLAN_CASE = 38;     // largeur d'un jour en pixels — doit suivre styles.css

/** Logements affichés dans le planning (null = tous). */
function planPropIds() {
  var tous = state.props.map(function (p) { return p.id; });
  if (!Array.isArray(state.planProps) || !state.planProps.length) return tous;
  var l = state.planProps.filter(function (pid) { return tous.indexOf(pid) >= 0; });
  return l.length ? l : tous;
}

function viewOwnerCal() {
  var start = state.planStart, fin = jourPlus(start, PLAN_JOURS - 1);
  var pids = planPropIds();

  // En-tête des jours.
  var entete = '';
  for (var i = 0; i < PLAN_JOURS; i++) {
    var iso = jourPlus(start, i);
    var d = new Date(Date.parse(iso + 'T00:00:00Z'));
    var wd = d.getUTCDay();
    var cls = 'plan-day' + (wd === 0 || wd === 6 ? ' plan-day--we' : '') + (iso === TODAY ? ' plan-day--today' : '');
    entete += '<div class="' + cls + '"><span class="w">' + ['D', 'L', 'M', 'M', 'J', 'V', 'S'][wd] + '</span>' +
      '<span class="n num">' + parseInt(iso.slice(8), 10) + '</span></div>';
  }

  var lignes = pids.map(function (pid) {
    var p = prop(pid);

    var fond = '';
    for (var j = 0; j < PLAN_JOURS; j++) {
      var iso2 = jourPlus(start, j);
      var wd2 = new Date(Date.parse(iso2 + 'T00:00:00Z')).getUTCDay();
      fond += '<div class="plan-cell' + (wd2 === 0 || wd2 === 6 ? ' plan-cell--we' : '') +
        (iso2 === TODAY ? ' plan-cell--today' : '') + '"></div>';
    }

    var nuitsOcc = 0;
    var barres = resasOf(pid).map(function (r) {
      if (r.end <= start || r.start > fin) return '';          // hors de la fenêtre
      var i0 = nights(start, r.start), i1 = nights(start, r.end);
      for (var n = Math.max(0, i0); n < Math.min(PLAN_JOURS, i1); n++) nuitsOcc++;

      var coupeG = i0 < 0, coupeD = i1 > PLAN_JOURS;
      var g = Math.max(0, i0), dte = Math.min(PLAN_JOURS, i1);
      var left = coupeG ? 0 : (g + 0.5) * PLAN_CASE;
      var right = coupeD ? PLAN_JOURS * PLAN_CASE : (dte + 0.5) * PLAN_CASE;
      var pl = PLATS[r.plat] || PLATS['Direct'];

      return '<button type="button" class="plan-bar' + (coupeG ? ' plan-bar--g' : '') + (coupeD ? ' plan-bar--d' : '') + '"' +
        ' style="left:' + Math.round(left + 2) + 'px;width:' + Math.max(26, Math.round(right - left - 4)) + 'px;background:' + pl.color + '"' +
        ' title="' + esc(r.guest + ' · ' + fmtDate(r.start) + ' → ' + fmtDate(r.end) + ' · ' + r.plat) + '"' +
        act('open-resa', { rid: r.id }) + '>' +
        '<span class="plan-guest">' + esc(r.guest) + '</span></button>';
    }).join('');

    var taux = Math.round(nuitsOcc / PLAN_JOURS * 100);

    return '<div class="plan-row">' +
      '<div class="plan-name">' +
        '<button type="button" class="plan-prop"' + act('nav', { path: '#/admin/biens/' + pid }) + '>' +
          '<span class="dot" style="background:' + p.color + '"></span>' +
          '<span class="grow"><span class="plan-prop-n">' + esc(p.short) + '</span>' +
          '<span class="plan-prop-s num">' + taux + ' % occupé</span></span></button>' +
      '</div>' +
      '<div class="plan-days" style="width:' + (PLAN_JOURS * PLAN_CASE) + 'px">' +
        '<div class="plan-cells">' + fond + '</div>' + barres +
      '</div></div>';
  }).join('');

  var totalResas = allResas().filter(function (x) {
    return planPropIds().indexOf(x.pid) >= 0 && x.r.end > start && x.r.start <= fin;
  }).length;

  return ownerShell('calendrier',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Calendrier</h1>' +
      '<p class="page-sub">' + totalResas + ' séjour(s) du ' + fmtDate(start) + ' au ' + fmtDate(fin) +
        ' · cliquez sur une barre pour ouvrir la réservation</p></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
          act('plan-move', { j: '-7' }) + '>← 7 jours</button>' +
        '<button type="button" class="btn btn--xs" style="background:var(--ink);color:#fff"' +
          act('plan-today') + '>Aujourd’hui</button>' +
        '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
          act('plan-move', { j: '7' }) + '>7 jours →</button>' +
        /* Créer un séjour depuis le calendrier (session 16). Il fallait
           jusqu'ici passer par « Biens & connexions », ouvrir le logement,
           puis son onglet « Réservations » : trois écrans pour saisir une
           réservation directe, alors que le calendrier est justement l'endroit
           où l'on voit qu'une date est libre. */
        '<button type="button" class="btn btn--xs" style="' +
          (state.showNewResa ? 'background:var(--cream);color:var(--ink-soft)' : 'background:var(--terra);color:#fff') +
          '"' + act('toggle-new-resa') + '>' +
          (state.showNewResa ? 'Fermer le formulaire' : '+ Nouvelle réservation') + '</button>' +
      '</div>' +
    '</div>' +

    (state.showNewResa
      ? (state.props.length
          ? formNewResa(null)
          : '<p class="empty" style="margin-top:14px">Créez d’abord un logement dans « Biens &amp; connexions ».</p>')
      : '') +

    '<div class="chiprow" style="margin-top:18px">' +
      '<span class="perm-label">Logements :</span>' +
      state.props.map(function (p) {
        var on = planPropIds().indexOf(p.id) >= 0;
        return '<button type="button" class="perm-chip" aria-pressed="' + on + '" style="--accent:' + p.color + '"' +
          act('plan-prop', { pid: p.id }) + '>' +
          '<span class="dot" style="background:' + (on ? p.color : 'rgba(36,30,26,.2)') + '"></span>' + esc(p.short) + '</button>';
      }).join('') +
      '<span style="margin-left:auto;display:flex;gap:14px;flex-wrap:wrap">' + Object.keys(PLATS).map(function (k) {
        return '<span style="display:flex;align-items:center;gap:7px;font:600 12px Figtree,sans-serif;color:var(--muted3)">' +
          '<span style="width:16px;height:8px;border-radius:9px;background:' + PLATS[k].color + '"></span>' + k + '</span>';
      }).join('') + '</span>' +
    '</div>' +

    '<div class="card" style="margin-top:16px;padding:0;overflow:hidden">' +
      '<div class="plan-scroll">' +
        '<div class="plan">' +
          '<div class="plan-row plan-row--head">' +
            '<div class="plan-name plan-name--head">Logement</div>' +
            '<div class="plan-days" style="width:' + (PLAN_JOURS * PLAN_CASE) + 'px">' +
              '<div class="plan-cells">' + entete + '</div></div>' +
          '</div>' +
          (lignes || '<p class="empty">Aucun logement.</p>') +
        '</div>' +
      '</div>' +
    '</div>' +

    '<p class="sec-note" style="margin-top:14px">Les séjours viennent des liens iCal et des saisies manuelles. ' +
      'Avec Beds24, ils arriveront tout seuls, montant compris — voir « Biens & connexions ».</p>');
}

/* --- Fiche d'une réservation --------------------------------------------- */

function viewOwnerResa() {
  var f = resaById(route.id);
  if (!f) return viewOwnerCal();
  var pid = f.pid, r = f.r, p = prop(pid), inf = state.info[pid] || {};
  var pl = PLATS[r.plat] || PLATS['Direct'];
  var src = SOURCES[r.source] || SOURCES.manuel;
  var nb = nights(r.start, r.end);
  var mnt = montantResa(pid, r);
  var lie = state.missions.find(function (m) { return m.fromResa === resaKey(pid, r); });
  var msgs = messagesDe(r.id);
  var parti = departAt(pid, r);
  var avisSej = avisDone(pid, r, 'sejour');
  var avisMen = avisDone(pid, r, 'menage');

  var lignes = [
    ['Plateforme', r.plat],
    ['Origine', src.label + (r.uid ? ' · réf. ' + r.uid : '')],
    ['Arrivée', fmtDate(r.start) + ' à partir de ' + (inf.checkin || '16:00')],
    ['Départ', fmtDate(r.end) + ' avant ' + (inf.checkout || '11:00') + (parti ? ' · parti à ' + parti : '')],
    ['Durée', nb + ' nuits'],
    ['Voyageurs', r.guests],
    ['Prix moyen par nuit', (nb ? Math.round(mnt / nb) : 0) + ' €']
  ];

  /* Coordonnées : ce que la plateforme a transmis, et surtout ce que le
     voyageur a laissé lui-même en ouvrant son livret (D-48). */
  var coord = [
    ['Téléphone', r.tel || (r.tel4 ? '•• •• •• ' + r.tel4 : ''), r.tel ? 'voyageur' : r.tel4 ? 'plateforme' : ''],
    ['E-mail', r.mail, 'voyageur'],
    ['Arrivée annoncée', r.arriveePrevue, 'voyageur']
  ].filter(function (l) { return l[1]; });

  var manque = !r.tel && !r.mail && !r.arriveePrevue;

  return ownerShell('calendrier',
    '<button type="button" class="btn-back" style="min-height:38px;font-size:13px;color:var(--muted)"' +
      act('nav', { path: '#/admin/calendrier' }) + '>← Retour au calendrier</button>' +

    '<div class="page-head" style="margin-top:10px">' +
      '<div>' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<span class="badge" style="background:' + pl.bg + ';color:' + pl.fg + '">' + esc(r.plat) + '</span>' +
          '<span class="badge" style="background:' + src.bg + ';color:' + src.fg + '">' + esc(src.court) + '</span>' +
          (r.statut === 'annule' ? '<span class="badge badge--terra">Annulée</span>' : '') +
        '</div>' +
        '<h1 class="page-title" style="margin-top:8px">' + esc(r.guest) + '</h1>' +
        '<p class="page-sub"><span class="dot" style="background:' + p.color + '"></span> ' + esc(p.name) + ' · ' + esc(p.city) + '</p>' +
      '</div>' +
      '<div class="kpis">' +
        '<div class="kpi"><div class="v num">' + mnt + ' €</div><div class="l">' +
          (montantEstime(r) ? 'estimé au prix par nuit' : 'montant du séjour') + '</div></div>' +
        '<div class="kpi"><div class="v num">' + nb + '</div><div class="l">nuits</div></div>' +
      '</div>' +
    '</div>' +

    '<div class="cols" style="margin-top:22px">' +
      '<div class="card" style="flex:1.2;min-width:min(100%,320px);padding:22px">' +
        '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 6px">Le séjour</h2>' +
        '<div class="list">' + lignes.map(function (l) {
          return '<div class="kv" style="padding:12px 0"><span>' + esc(l[0]) + '</span>' +
            '<span class="num" style="color:var(--ink-soft);font-weight:600">' + esc(l[1]) + '</span></div>';
        }).join('') + '</div>' +

        '<div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(36,30,26,.08)">' +
          '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 6px">Coordonnées du voyageur</h2>' +
          (manque
            ? '<p class="sec-note" style="margin:0">' +
                (r.tel4
                  ? 'La plateforme a transmis les 4 derniers chiffres du téléphone (•• •• •• ' + esc(r.tel4) + '), ' +
                    'ce qui suffit à identifier ce voyageur sur le lien d\'accueil. '
                  : 'Cette plateforme ne transmet aucun numéro. ') +
                'Le reste arrivera quand il ouvrira son livret et laissera ses coordonnées.</p>'
            : '<div class="list">' + coord.map(function (l) {
                return '<div class="kv" style="padding:12px 0"><span>' + esc(l[0]) +
                  (l[2] ? ' <span class="src-tag">' + esc(l[2]) + '</span>' : '') + '</span>' +
                  '<span class="num" style="color:var(--ink-soft);font-weight:600">' + esc(l[1]) + '</span></div>';
              }).join('') + '</div>') +
        '</div>' +

        '<div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(36,30,26,.08)">' +
          '<label class="lab" for="rm-' + esc(r.id) + '">Montant du séjour (€)</label>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">' +
            '<input class="inp num" id="rm-' + esc(r.id) + '" type="number" min="0" style="flex:1;min-width:140px"' +
              ' placeholder="' + (parseInt(inf.prixNuit, 10) || 0) + ' € × ' + nb + ' nuits" value="' +
              (montantEstime(r) ? '' : esc(r.montant)) + '" data-fid="rm-' + esc(r.id) + '" data-in="resa-montant" data-rid="' + esc(r.id) + '">' +
            (montantEstime(r) ? '' : '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
              act('resa-montant-auto', { rid: r.id }) + '>Revenir au calcul</button>') +
          '</div>' +
          '<p class="sec-note" style="margin-top:6px">Laissé vide, le montant est calculé au prix par nuit du logement. ' +
            'Avec Beds24, c’est le montant réel de la plateforme qui s’inscrira ici.</p>' +
        '</div>' +
      '</div>' +

      '<div style="flex:1;min-width:min(100%,300px);display:flex;flex-direction:column;gap:14px">' +
        '<div class="card" style="padding:22px">' +
          '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 10px">Ménage du départ</h2>' +
          (lie
            ? '<button type="button" class="resa-lien"' + act('nav', { path: '#/admin/missions/' + lie.id }) + '>' +
                '<span class="grow"><span class="resa-lien-t">' + esc(service(lie.type).label) + '</span>' +
                '<span class="resa-lien-s num">' + esc(lie.dateLabel) + ' · ' + esc(lie.windowLabel) + ' · ' + lie.price + ' €</span></span>' +
                '<span class="badge ' + STATUS[lie.status].cls + '">' + esc(lie.taker ? STATUS[lie.status].label + ' · ' + lie.taker : STATUS[lie.status].label) + '</span>' +
                '</button>'
            : '<p class="sec-note">Aucune mission rattachée à ce départ.</p>') +
        '</div>' +

        '<div class="card" style="padding:22px">' +
          '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 10px">Messages</h2>' +
          '<button type="button" class="resa-lien"' + act('nav', { path: '#/admin/messages/' + r.id }) + '>' +
            '<span class="grow"><span class="resa-lien-t">' + (msgs.length ? msgs.length + ' message(s)' : 'Aucun message') + '</span>' +
            '<span class="resa-lien-s">Conversation avec ' + esc(r.guest) + '</span></span>' +
            '<span class="resa-go">→</span></button>' +
        '</div>' +

        /* CE QUE CE VOYAGEUR-LÀ A ÉCRIT (session 19)

           Seul l'avis « séjour » s'affichait ici, et seulement s'il existait.
           Or il y a deux notes par séjour — la propreté trouvée à l'arrivée,
           qui vise la prestataire, et le séjour lui-même, qui vise le
           logement — et c'est justement en ouvrant une réservation qu'on veut
           les relire. On montre les deux, et on dit franchement quand il n'y
           en a pas : un cadre absent laisse croire à un écran cassé. */
        '<div class="card" style="padding:22px">' +
          '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 10px">Ce que ' + esc(r.guest) + ' a laissé</h2>' +
          (avisMen || avisSej
            ? [[avisMen, 'Propreté à l’arrivée', avisMen && avisMen.agent ? ' · ' + agent(avisMen.agent).name : ''],
               [avisSej, 'Le séjour', '']]
                .filter(function (x) { return x[0]; })
                .map(function (x) {
                  return '<div class="avis" style="margin-bottom:10px">' +
                    '<div class="avis-top">' + starsRead(x[0].stars) +
                      '<span class="avis-meta num">' + esc(x[1] + x[2] + ' · ' + x[0].dateLabel) + '</span></div>' +
                    (x[0].texte
                      ? '<p class="avis-txt">« ' + esc(x[0].texte) + ' »</p>'
                      : '<p class="avis-txt avis-txt--none">Des étoiles, sans commentaire.</p>') +
                    '</div>';
                }).join('')
            : '<p class="sec-note" style="margin:0">Aucun commentaire pour l’instant. ' +
              (r.end < TODAY
                ? 'Ce séjour est terminé : il n’en viendra probablement plus.'
                : 'La propreté se note à l’arrivée, le séjour au départ — depuis le livret ' +
                  'd’accueil, sur le téléphone du voyageur.') + '</p>') +
        '</div>' +

        '<div class="card" style="padding:22px">' +
          '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 6px">Lien personnel de ' + esc(r.guest) + '</h2>' +
          '<p class="sec-note" style="margin:0 0 10px">Ce lien n’appartient qu’à ce séjour : ' +
            'le voyageur qui l’ouvre est reconnu sans rien taper. Le code d’accès et le Wi-Fi ' +
            'ne s’affichent que pendant ses dates.</p>' +
          '<input class="inp num" style="font-size:12.5px" readonly value="' + esc(lienSejour(r.id)) +
            '" data-fid="lien-sejour-' + esc(r.id) + '">' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
            '<button type="button" class="btn btn--xs" style="background:var(--terra);color:#fff"' +
              act('copier-lien', { url: lienSejour(r.id) }) + '>Copier le lien</button>' +
            '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
              act('copier-message-sejour', { rid: r.id }) + '>Copier le message tout prêt</button>' +
          '</div>' +
          /* Le bouton qui manquait (session 18) : il n'existait aucun moyen de
             VOIR la page de ce voyageur depuis l'application. Il fallait
             copier le lien et le recoller dans la barre d'adresse — ce que le
             propriétaire a fait, en concluant à juste titre que l'aperçu ne
             marchait pas. Le premier bouton ouvre la page du voyageur, le
             second le livret du logement tel qu'il est écrit. */
          '<div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(36,30,26,.08);display:flex;flex-direction:column;gap:8px">' +
            '<button type="button" class="btn btn--sm" style="background:var(--ink);color:#fff;width:100%"' +
              act('nav', { path: '#/sejour/' + r.id }) + '>👁 Voir la page ' + esc(de(r.guest)) + '</button>' +
            '<button type="button" class="btn btn--sm" style="background:var(--cream);color:var(--ink-soft);width:100%"' +
              act('nav', { path: '#/livret/' + pid }) + '>Voir le livret de ce logement</button>' +
          '</div>' +
          (state.migMsg ? '<p class="sec-note" style="margin-top:10px">' + esc(state.migMsg) + '</p>' : '') +
        '</div>' +

        '<button type="button" class="btn-danger-xs" style="align-self:flex-start"' +
          act('resa-remove', { rid: r.id }) + '>Supprimer cette réservation</button>' +
      '</div>' +
    '</div>');
}

/* --------------------------------------------------------------------------
   Messages des voyageurs
   La structure est en place : une conversation par séjour, classée par
   voyageur. Le contenu arrivera de Beds24 — iCal ne transporte aucun message.
   -------------------------------------------------------------------------- */

function messagesDe(rid) {
  return state.messages.filter(function (m) { return m.resa === rid; })
    .sort(function (a, b) { return a.at < b.at ? -1 : 1; });
}

/** Séjours retenus par le filtre de la boîte de réception. */
function conversations() {
  return allResas().filter(function (x) {
    if (state.msgFilter === 'avenir') return x.r.start > TODAY;
    if (state.msgFilter === 'encours') return x.r.end >= TODAY;
    return true;
  });
}

function viewOwnerMsgs() {
  var list = conversations();
  var filtres = [['encours', 'En cours et à venir'], ['avenir', 'Arrivées à venir'], ['tous', 'Tous les séjours']];

  return ownerShell('messages',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Messages</h1>' +
      '<p class="page-sub">Une conversation par séjour, tous logements et toutes plateformes réunis.</p></div>' +
      '<div class="seg">' + filtres.map(function (f) {
        return '<button type="button" aria-pressed="' + (state.msgFilter === f[0]) + '"' +
          act('msg-filter', { f: f[0] }) + '>' + f[1] + '</button>';
      }).join('') + '</div>' +
    '</div>' +

    '<div class="alert alert--blue" style="margin-top:20px">' +
      '<div style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:' + C.bleu + '"></span>' +
        '<span class="kind">En attente de Beds24</span></div>' +
      '<div class="title" style="color:var(--ink)">Les messages arriveront ici une fois Beds24 connecté</div>' +
      '<div class="det">Airbnb et Booking.com n’envoient rien dans un lien iCal : seules leurs interfaces, ou un service ' +
        'comme Beds24, donnent accès aux conversations. Le classement par voyageur est prêt, il ne manque que la source.</div>' +
    '</div>' +

    '<div class="card" style="margin-top:18px;padding:0;overflow:hidden">' + (list.length
      ? list.map(function (x) {
        var p = prop(x.pid), r = x.r, pl = PLATS[r.plat] || PLATS['Direct'];
        var n = messagesDe(r.id).length;
        var quand = r.start > TODAY ? 'arrive le ' + fmtDate(r.start)
          : r.end < TODAY ? 'parti le ' + fmtDate(r.end) : 'sur place jusqu’au ' + fmtDate(r.end);
        return '<button type="button" class="conv"' + act('nav', { path: '#/admin/messages/' + r.id }) + '>' +
          '<span class="conv-av" style="background:' + p.tint + ';color:' + p.color + '">' +
            esc(String(r.guest).slice(0, 1).toUpperCase()) + '</span>' +
          '<span class="grow">' +
            '<span class="conv-top"><span class="conv-n">' + esc(r.guest) + '</span>' +
              '<span class="badge" style="background:' + pl.bg + ';color:' + pl.fg + '">' + esc(r.plat) + '</span></span>' +
            '<span class="conv-s num">' + esc(p.short) + ' · ' + esc(quand) + '</span>' +
          '</span>' +
          '<span class="conv-r">' + (n ? '<span class="badge badge--green num">' + n + '</span>' : '<span class="conv-vide">aucun message</span>') + '</span>' +
          '</button>';
      }).join('')
      : '<p class="empty">Aucun séjour dans ce filtre.</p>') + '</div>');
}

function viewOwnerMsg() {
  var f = resaById(route.id);
  if (!f) return viewOwnerMsgs();
  var pid = f.pid, r = f.r, p = prop(pid), pl = PLATS[r.plat] || PLATS['Direct'];
  var fil = messagesDe(r.id);

  return ownerShell('messages',
    '<button type="button" class="btn-back" style="min-height:38px;font-size:13px;color:var(--muted)"' +
      act('nav', { path: '#/admin/messages' }) + '>← Toutes les conversations</button>' +

    '<div class="page-head" style="margin-top:10px">' +
      '<div><h1 class="page-title">' + esc(r.guest) + '</h1>' +
      '<p class="page-sub"><span class="dot" style="background:' + p.color + '"></span> ' + esc(p.name) +
        ' · ' + fmtDate(r.start) + ' → ' + fmtDate(r.end) + ' · ' + r.guests + ' voyageurs</p></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<span class="badge" style="background:' + pl.bg + ';color:' + pl.fg + '">' + esc(r.plat) + '</span>' +
        '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
          act('nav', { path: '#/admin/reservations/' + r.id }) + '>Voir la réservation</button>' +
      '</div>' +
    '</div>' +

    '<div class="card" style="margin-top:20px;padding:22px">' + (fil.length
      ? '<div class="stack" style="gap:10px">' + fil.map(function (m) {
        return '<div class="msg msg--' + (m.sens === 'recu' ? 'in' : 'out') + '">' +
          '<div class="msg-t">' + esc(m.texte) + '</div>' +
          '<div class="msg-m num">' + esc(m.at) + '</div></div>';
      }).join('') + '</div>'
      : '<p class="empty" style="padding:30px 20px">Aucun message pour ce séjour.<br>' +
        'Les échanges Airbnb et Booking.com apparaîtront ici dès que Beds24 sera connecté.</p>') +
    '</div>' +

    '<p class="sec-note" style="margin-top:14px">En attendant, répondez depuis l’application de la plateforme. ' +
      'Rien n’est perdu : la conversation sera reprise ici lors de la première synchronisation.</p>');
}

/* --------------------------------------------------------------------------
   Messages programmés
   Le propriétaire écrit ses messages types et dit quand ils partent. L'envoi
   lui-même viendra de Beds24 : un site sans serveur ne peut rien envoyer.
   -------------------------------------------------------------------------- */

var DECLENCHEURS = [
  { key: 'reservation', label: 'Dès la réservation', offset: false, aide: 'Part aussitôt qu’une réservation arrive.' },
  { key: 'avant_arrivee', label: 'Avant l’arrivée', offset: true, defaut: 3, aide: 'Le nombre de jours choisi avant la date d’arrivée.' },
  { key: 'jour_arrivee', label: 'Le jour de l’arrivée', offset: false, aide: 'Le matin du jour d’arrivée.' },
  { key: 'jour_depart', label: 'Le jour du départ', offset: false, aide: 'Le matin du départ, pour rappeler les consignes.' },
  { key: 'apres_depart', label: 'Après le départ', offset: true, defaut: 1, aide: 'Le nombre de jours choisi après le départ.' }
];

var VARIABLES = [
  ['{voyageur}', 'nom du voyageur'], ['{logement}', 'nom du logement'],
  ['{arrivee}', 'date d’arrivée'], ['{depart}', 'date de départ'],
  ['{heure_arrivee}', 'heure d’arrivée'], ['{heure_depart}', 'heure de départ'],
  ['{nuits}', 'nombre de nuits'], ['{voyageurs}', 'nombre de voyageurs'],
  ['{code}', 'code d’accès'], ['{wifi}', 'Wi-Fi'], ['{livret}', 'lien du livret d’accueil'],
  ['{lien}', 'lien personnel de CE voyageur (il n’a rien à taper)'],
  ['{bienvenue}', 'lien d’accueil unique (le voyageur s’identifie)']
];

/* Trois messages types, proposés en un clic. Ils remplissent le formulaire :
   rien n'est créé sans que le propriétaire ait relu et enregistré. */
var MODELES_AUTO = [
  {
    nom: 'Bienvenue et confirmation', quand: 'reservation', decalage: 0, heure: '10:00',
    texte: 'Bonjour {voyageur},\n\nMerci pour votre réservation au {logement} du {arrivee} au {depart} ({nuits} nuits).\n\n' +
      'L’arrivée se fait à partir de {heure_arrivee} et le départ avant {heure_depart}.\n\n' +
      'Vous trouverez toutes les informations pratiques dans votre livret d’accueil : {lien}\n\nÀ bientôt !'
  },
  {
    nom: 'La veille de l’arrivée', quand: 'avant_arrivee', decalage: 1, heure: '17:00',
    texte: 'Bonjour {voyageur},\n\nNous vous attendons demain au {logement} à partir de {heure_arrivee}.\n\n' +
      'Accès : {code}\nWi-Fi : {wifi}\n\nTout est détaillé ici : {lien}\n\nBon voyage !'
  },
  {
    nom: 'Merci après le départ', quand: 'apres_depart', decalage: 1, heure: '11:00',
    texte: 'Bonjour {voyageur},\n\nMerci d’avoir séjourné au {logement}. Nous espérons que tout s’est bien passé.\n\n' +
      'Si le cœur vous en dit, un petit commentaire aide beaucoup les prochains voyageurs.\n\nAu plaisir de vous accueillir à nouveau !'
  }
];

function declencheur(key) {
  return DECLENCHEURS.find(function (d) { return d.key === key; }) || DECLENCHEURS[0];
}

/** Remplace les variables par les vraies informations du séjour. */
function remplirVars(txt, pid, r) {
  var inf = state.info[pid] || {}, p = prop(pid);
  var vals = {
    '{voyageur}': r.guest, '{logement}': p.name,
    '{arrivee}': fmtDate(r.start), '{depart}': fmtDate(r.end),
    '{heure_arrivee}': inf.checkin || '16:00', '{heure_depart}': inf.checkout || '11:00',
    '{nuits}': nights(r.start, r.end), '{voyageurs}': r.guests,
    '{code}': inf.code || '—', '{wifi}': inf.wifi || '—',
    '{livret}': appUrl() + '#/livret/' + pid,
    // Le lien PERSONNEL de ce voyageur-là : il est reconnu sans rien taper
    // (session 16, D-80). C'est celui à préférer dans un message programmé.
    '{lien}': lienSejour(r.id),
    // Le lien unique, identique pour tous les logements (D-46) : c'est celui
    // qu'on colle dans les messages types des plateformes.
    '{bienvenue}': appUrl() + '#/bienvenue'
  };
  return Object.keys(vals).reduce(function (t, k) { return t.split(k).join(vals[k]); }, String(txt || ''));
}

/** Date d'envoi d'une règle pour un séjour. null = dépend de la date de
    réservation, que nous n'avons pas tant que la plateforme ne la donne pas. */
function dateEnvoi(regle, r) {
  var d = parseInt(regle.decalage, 10) || 0;
  if (regle.quand === 'avant_arrivee') return jourPlus(r.start, -d);
  if (regle.quand === 'jour_arrivee') return r.start;
  if (regle.quand === 'jour_depart') return r.end;
  if (regle.quand === 'apres_depart') return jourPlus(r.end, d);
  return null;
}

/** Les envois prévus dans les 60 jours, tous logements confondus. */
function prochainsEnvois() {
  var out = [];
  state.autoMsgs.forEach(function (rg) {
    if (!rg.actif) return;
    allResas().forEach(function (x) {
      if (rg.props && rg.props.length && rg.props.indexOf(x.pid) < 0) return;
      var d = dateEnvoi(rg, x.r);
      if (!d || d < TODAY || d > jourPlus(TODAY, 60)) return;
      out.push({ date: d, regle: rg, pid: x.pid, r: x.r });
    });
  });
  return out.sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.regle.heure < b.regle.heure ? -1 : 1);
  });
}

function formAuto() {
  var a = state.am, dc = declencheur(a.quand);
  return '<div class="card pop" style="margin-top:18px;padding:22px">' +
    '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 16px">' +
      (a.id ? 'Modifier le message' : 'Nouveau message programmé') + '</h2>' +

    '<div class="cols" style="gap:14px">' +
      '<div style="flex:2;min-width:min(100%,220px)"><label class="lab" for="am-nom">Nom (pour vous)</label>' +
        '<input class="inp" id="am-nom" type="text" placeholder="Ex. La veille de l’arrivée" value="' + esc(a.nom) + '" data-fid="am-nom" data-in="am-nom"></div>' +
      '<div style="flex:1.6;min-width:min(100%,200px)"><label class="lab" for="am-quand">Quand l’envoyer</label>' +
        '<select class="inp" id="am-quand" data-fid="am-quand" data-ch="am-quand">' + DECLENCHEURS.map(function (d) {
          return '<option value="' + d.key + '"' + (a.quand === d.key ? ' selected' : '') + '>' + esc(d.label) + '</option>';
        }).join('') + '</select></div>' +
      (dc.offset ? '<div style="flex:1;min-width:min(100%,130px)"><label class="lab" for="am-dec">Nombre de jours</label>' +
        '<input class="inp num" id="am-dec" type="number" min="0" max="30" value="' + esc(a.decalage) + '" data-fid="am-dec" data-in="am-dec"></div>' : '') +
      '<div style="flex:1;min-width:min(100%,130px)"><label class="lab" for="am-heure">Heure</label>' +
        '<input class="inp num" id="am-heure" type="time" value="' + esc(a.heure) + '" data-fid="am-heure" data-ch="am-heure"></div>' +
    '</div>' +
    '<p class="sec-note" style="margin-top:6px">' + esc(dc.aide) + '</p>' +

    '<div style="margin-top:14px"><span class="lab">Logements concernés</span>' +
      '<div class="chiprow" style="margin-top:6px">' +
        '<button type="button" class="perm-chip" aria-pressed="' + (!a.props.length) + '"' +
          act('auto-prop', { pid: 'tous' }) + '><span class="dot" style="background:' +
          (!a.props.length ? C.ink : 'rgba(36,30,26,.2)') + '"></span>Tous</button>' +
        state.props.map(function (p) {
          var on = a.props.indexOf(p.id) >= 0;
          return '<button type="button" class="perm-chip" aria-pressed="' + on + '" style="--accent:' + p.color + '"' +
            act('auto-prop', { pid: p.id }) + '><span class="dot" style="background:' +
            (on ? p.color : 'rgba(36,30,26,.2)') + '"></span>' + esc(p.short) + '</button>';
        }).join('') +
      '</div></div>' +

    '<div style="margin-top:14px"><label class="lab" for="am-texte">Message</label>' +
      '<textarea class="inp" id="am-texte" style="min-height:170px" data-fid="am-texte" data-in="am-texte">' + esc(a.texte) + '</textarea></div>' +
    '<div class="chiprow" style="margin-top:8px">' +
      '<span class="sec-note">À écrire tel quel, remplacé à l’envoi :</span>' +
      VARIABLES.map(function (v) {
        return '<span class="varchip" title="' + esc(v[1]) + '">' + esc(v[0]) + '</span>';
      }).join('') + '</div>' +

    '<div style="display:flex;gap:10px;align-items:center;margin-top:18px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn--primary btn--sm"' + act('auto-save') + '>' +
        (a.id ? 'Enregistrer les modifications' : 'Créer le message') + '</button>' +
      '<button type="button" class="btn btn--sm" style="background:transparent;color:var(--muted)"' + act('auto-cancel') + '>Annuler</button>' +
      (a.id ? '' : '<span class="sec-note">Ou partez d’un modèle : ' + MODELES_AUTO.map(function (m, i) {
        return '<button type="button" class="lienbtn"' + act('auto-modele', { mi: i }) + '>' + esc(m.nom) + '</button>';
      }).join(' · ') + '</span>') +
    '</div></div>';
}

function viewOwnerAuto() {
  var envois = prochainsEnvois();

  var regles = state.autoMsgs.map(function (rg) {
    var dc = declencheur(rg.quand);
    var quand = dc.offset ? rg.decalage + ' jour(s) ' + (rg.quand === 'apres_depart' ? 'après le départ' : 'avant l’arrivée') : dc.label;
    var cibles = !rg.props.length ? 'Tous les logements'
      : rg.props.map(function (pid) { return prop(pid).short; }).join(' · ');
    return '<article class="card" style="padding:20px 22px">' +
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<div class="grow" style="min-width:200px">' +
          '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">' +
            '<span style="font:700 17px Figtree,sans-serif">' + esc(rg.nom) + '</span>' +
            '<span class="badge badge--soft">' + esc(quand) + ' · ' + esc(rg.heure) + '</span>' +
            (rg.actif ? '' : '<span class="badge badge--amber">En pause</span>') +
          '</div>' +
          '<div class="sec-note" style="margin-top:4px">' + esc(cibles) + '</div>' +
        '</div>' +
        '<button type="button" class="switch-row" style="width:auto;flex:none" aria-pressed="' + !!rg.actif + '"' +
          act('auto-toggle', { rid: rg.id }) + '><span class="switch"><span class="knob"></span></span>' +
          '<span class="switch-t">' + (rg.actif ? 'Actif' : 'En pause') + '</span></button>' +
        '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
          act('auto-edit', { rid: rg.id }) + '>Modifier</button>' +
        '<button type="button" class="btn-danger-xs"' + act('auto-remove', { rid: rg.id }) + '>Supprimer</button>' +
      '</div>' +
      '<p class="auto-texte">' + esc(rg.texte) + '</p>' +
      '</article>';
  }).join('');

  return ownerShell('auto',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Messages programmés</h1>' +
      '<p class="page-sub">' + state.autoMsgs.length + ' message(s) type · ' + envois.length +
        ' envoi(s) prévus dans les 60 jours</p></div>' +
      '<button type="button" class="btn btn--xs" style="' + (state.am ? 'background:var(--cream);color:var(--ink-soft)' : 'background:var(--terra);color:#fff') +
        ';min-height:42px;font-size:13px"' + act(state.am ? 'auto-cancel' : 'auto-new') + '>' +
        (state.am ? 'Fermer' : '+ Nouveau message') + '</button>' +
    '</div>' +

    (state.am ? formAuto() : '') +

    '<div class="alert alert--blue" style="margin-top:20px">' +
      '<div style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:' + C.bleu + '"></span>' +
        '<span class="kind">Envoi automatique</span></div>' +
      '<div class="title" style="color:var(--ink)">Les messages partiront depuis Beds24</div>' +
      '<div class="det">Ce que vous écrivez ici est prêt à être repris tel quel. Un site sans serveur ne peut envoyer ' +
        'ni message ni e-mail : c’est la connexion Beds24 qui déclenchera les envois, aux dates listées ci-dessous.</div>' +
    '</div>' +

    '<h2 class="sec-title" style="margin-top:24px">Mes messages types</h2>' +
    '<div class="stack" style="gap:14px">' + (regles ||
      '<p class="empty">Aucun message programmé. Créez le premier avec « + Nouveau message », ' +
      'ou partez d’un des trois modèles proposés.</p>') + '</div>' +

    '<h2 class="sec-title" style="margin-top:26px">Prochains envois</h2>' +
    '<div class="card" style="padding:0;overflow:hidden">' +
      '<div class="table-scroll">' +
        '<div class="thead" style="min-width:700px"><span style="width:120px">Date</span><span style="width:70px">Heure</span>' +
          '<span style="flex:1.2">Voyageur</span><span style="flex:1">Logement</span><span style="flex:1.2">Message</span></div>' +
        (envois.length ? envois.slice(0, 40).map(function (e) {
          var p = prop(e.pid);
          return '<div class="trow" style="min-width:700px">' +
            '<span class="num" style="width:120px;font-weight:600">' + esc(jourLabel(e.date)) + '</span>' +
            '<span class="num" style="width:70px">' + esc(e.regle.heure) + '</span>' +
            '<span style="flex:1.2;min-width:0">' + esc(e.r.guest) + '</span>' +
            '<span style="flex:1;display:flex;align-items:center;gap:8px;min-width:0">' +
              '<span class="dot" style="background:' + p.color + '"></span>' + esc(p.short) + '</span>' +
            '<span style="flex:1.2;color:var(--muted3);min-width:0">' + esc(e.regle.nom) + '</span>' +
            '</div>';
        }).join('') : '<p class="empty">Aucun envoi prévu. Les messages « dès la réservation » ne figurent pas ici : ' +
          'ils partent au moment où la réservation arrive.</p>') +
      '</div>' +
    '</div>' +

    (envois.length ? '<div class="card" style="margin-top:16px;padding:22px">' +
      '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 10px">Aperçu du prochain envoi</h2>' +
      '<p class="sec-note" style="margin-bottom:10px">' + esc(envois[0].regle.nom) + ' · ' + esc(jourLabel(envois[0].date)) +
        ' à ' + esc(envois[0].regle.heure) + ' · ' + esc(envois[0].r.guest) + '</p>' +
      '<pre class="apercu">' + esc(remplirVars(envois[0].regle.texte, envois[0].pid, envois[0].r)) + '</pre>' +
      '</div>' : ''));
}

/* --------------------------------------------------------------------------
   Statistiques : occupation, revenus, dépenses de ménage
   -------------------------------------------------------------------------- */

/** Mois qui ont quelque chose à montrer : des nuits ou des missions payées. */
function moisDispo() {
  var vus = {};
  allResas().forEach(function (x) {
    for (var j = x.r.start; j < x.r.end; j = jourPlus(j, 1)) vus[moisDe(j)] = true;
  });
  ledger().forEach(function (l) { vus[l.month] = true; });
  vus[CURRENT_MONTH] = true;
  return Object.keys(vus).sort().reverse();
}

/** Une ligne par logement pour le mois demandé. */
function statsMois(mois) {
  var jours = nbJoursMois(mois);
  return state.props.map(function (p) {
    var nuits = 0, sejours = 0, revenus = 0, estimes = 0;
    resasOf(p.id).forEach(function (r) {
      var n = nuitsDansMois(r, mois);
      if (!n) return;
      nuits += n; sejours++;
      var total = nights(r.start, r.end) || 1;
      revenus += Math.round(montantResa(p.id, r) * n / total);   // au prorata des nuits du mois
      if (montantEstime(r)) estimes++;
    });
    var depenses = ledger().filter(function (l) { return l.month === mois && l.prop === p.id; })
      .reduce(function (n, l) { return n + l.price; }, 0);
    return {
      p: p, nuits: nuits, jours: jours, taux: Math.round(nuits / jours * 100),
      sejours: sejours, revenus: revenus, depenses: depenses, net: revenus - depenses,
      estimes: estimes, adr: nuits ? Math.round(revenus / nuits) : 0
    };
  });
}

function viewOwnerStats() {
  var mois = state.statMonth;
  var lignes = statsMois(mois);
  var tot = lignes.reduce(function (a, l) {
    return { nuits: a.nuits + l.nuits, jours: a.jours + l.jours, revenus: a.revenus + l.revenus,
      depenses: a.depenses + l.depenses, sejours: a.sejours + l.sejours, estimes: a.estimes + l.estimes };
  }, { nuits: 0, jours: 0, revenus: 0, depenses: 0, sejours: 0, estimes: 0 });
  var tauxMoyen = tot.jours ? Math.round(tot.nuits / tot.jours * 100) : 0;
  var net = tot.revenus - tot.depenses;

  // Six mois pour situer le mois affiché.
  var suite = [];
  for (var i = 5; i >= 0; i--) suite.push(moisPlus(mois, -i));
  var series = suite.map(function (m) {
    var l = statsMois(m);
    return {
      mois: m,
      revenus: l.reduce(function (n, x) { return n + x.revenus; }, 0),
      depenses: l.reduce(function (n, x) { return n + x.depenses; }, 0)
    };
  });
  // L'échelle tient compte des deux barres : un mois sans revenu peut avoir
  // des dépenses de ménage, et elles doivent rester visibles.
  var maxi = Math.max.apply(null, series.map(function (s) { return s.revenus; })
    .concat(series.map(function (s) { return s.depenses; })).concat([1]));

  return ownerShell('stats',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Statistiques</h1>' +
      '<p class="page-sub">Occupation, revenus et coût du ménage, logement par logement.</p></div>' +
      '<div style="min-width:200px">' +
        '<label class="lab" for="st-mois">Mois</label>' +
        '<select class="inp" id="st-mois" data-fid="st-mois" data-ch="stat-month">' + moisDispo().map(function (m) {
          return '<option value="' + m + '"' + (m === mois ? ' selected' : '') + '>' + esc(moisLabel(m)) + '</option>';
        }).join('') + '</select>' +
      '</div>' +
    '</div>' +

    '<div class="cols" style="margin-top:22px;gap:12px">' +
      '<div class="kpi" style="min-width:190px"><div class="v num">' + tauxMoyen + ' %</div>' +
        '<div class="l">taux d’occupation · ' + tot.nuits + ' nuits sur ' + tot.jours + '</div></div>' +
      '<div class="kpi" style="min-width:190px"><div class="v num" style="color:' + C.vert + '">' + tot.revenus + ' €</div>' +
        '<div class="l">revenus des séjours</div></div>' +
      '<div class="kpi" style="min-width:190px"><div class="v num" style="color:' + C.terracotta + '">' + tot.depenses + ' €</div>' +
        '<div class="l">dépenses de ménage</div></div>' +
      '<div class="kpi" style="min-width:190px"><div class="v num">' + net + ' €</div>' +
        '<div class="l">net après ménage · ' + tot.sejours + ' séjours</div></div>' +
    '</div>' +

    (tot.estimes ? '<p class="sec-note" style="margin-top:12px">⚠︎ ' + tot.estimes + ' séjour(s) sans montant réel : ' +
      'le revenu est calculé au prix par nuit du logement. Corrigez-le sur la fiche de la réservation, ' +
      'ou attendez la connexion Beds24 qui apportera les montants exacts.</p>' : '') +

    '<h2 class="sec-title" style="margin-top:26px">Par logement</h2>' +
    '<div class="card" style="padding:0;overflow:hidden">' +
      '<div class="table-scroll">' +
        '<div class="thead" style="min-width:860px"><span style="flex:1.4">Logement</span>' +
          '<span style="width:150px">Occupation</span><span style="width:90px;text-align:right">Nuits</span>' +
          '<span style="width:90px;text-align:right">Séjours</span><span style="width:100px;text-align:right">Revenus</span>' +
          '<span style="width:100px;text-align:right">Prix / nuit</span><span style="width:100px;text-align:right">Ménage</span>' +
          '<span style="width:100px;text-align:right">Net</span></div>' +
        lignes.map(function (l) {
          return '<div class="trow" style="min-width:860px">' +
            '<span style="flex:1.4;display:flex;align-items:center;gap:9px;min-width:0">' +
              '<span class="dot" style="background:' + l.p.color + '"></span>' + esc(l.p.name) + '</span>' +
            '<span style="width:150px;display:flex;align-items:center;gap:9px">' +
              '<span class="jauge"><span style="width:' + l.taux + '%;background:' + l.p.color + '"></span></span>' +
              '<span class="num" style="font-weight:700;width:44px;text-align:right">' + l.taux + ' %</span></span>' +
            '<span class="num" style="width:90px;text-align:right">' + l.nuits + '</span>' +
            '<span class="num" style="width:90px;text-align:right">' + l.sejours + '</span>' +
            '<span class="num" style="width:100px;text-align:right;font-weight:600">' + l.revenus + ' €</span>' +
            '<span class="num" style="width:100px;text-align:right;color:var(--muted3)">' + l.adr + ' €</span>' +
            '<span class="num" style="width:100px;text-align:right;color:var(--terra-d)">' + (l.depenses ? '− ' + l.depenses + ' €' : '—') + '</span>' +
            '<span class="num" style="width:100px;text-align:right;font-weight:700">' + l.net + ' €</span>' +
            '</div>';
        }).join('') +
      '</div>' +
    '</div>' +

    '<h2 class="sec-title" style="margin-top:26px">Six derniers mois</h2>' +
    '<div class="card" style="padding:22px">' +
      '<div class="hist">' + series.map(function (s) {
        var h = Math.round(s.revenus / maxi * 100);
        var hd = Math.round(s.depenses / maxi * 100);
        return '<div class="hist-col' + (s.mois === mois ? ' hist-col--on' : '') + '">' +
          '<div class="hist-v num">' + s.revenus + ' €</div>' +
          '<div class="hist-bars">' +
            '<span class="hist-bar" style="height:' + h + '%"></span>' +
            '<span class="hist-bar hist-bar--dep" style="height:' + hd + '%"></span>' +
          '</div>' +
          '<div class="hist-l num">' + esc(MOIS[parseInt(s.mois.slice(5, 7), 10) - 1]) + '</div>' +
          '</div>';
      }).join('') + '</div>' +
      '<div class="chiprow" style="margin-top:14px;gap:16px">' +
        '<span style="display:flex;align-items:center;gap:7px;font:600 12px Figtree,sans-serif;color:var(--muted3)">' +
          '<span style="width:14px;height:8px;border-radius:9px;background:' + C.vert + '"></span>Revenus</span>' +
        '<span style="display:flex;align-items:center;gap:7px;font:600 12px Figtree,sans-serif;color:var(--muted3)">' +
          '<span style="width:14px;height:8px;border-radius:9px;background:' + C.terracotta + '"></span>Ménage</span>' +
      '</div>' +
    '</div>' +

    '<p class="sec-note" style="margin-top:14px">Les revenus sont répartis nuit par nuit : un séjour à cheval sur deux mois ' +
      'compte dans les deux. Les dépenses de ménage viennent des missions terminées du mois.</p>');
}

/* Le rapprochement « fiche ↔ compte » (§19.8).
   Une fiche est ce que le propriétaire a créé dans l'application ; un compte
   est de quoi se connecter. Les deux existent séparément, et cette ligne fait
   le lien. Elle n'apparaît que si le cahier partagé répond. */
function comptesLibres() {
  var pris = {};
  (state.agents || []).forEach(function (a) { if (a.uid) pris[a.uid] = true; });
  return (state.comptes || []).filter(function (c) {
    return c.role === 'provider' && !pris[c.uid];
  });
}

/** L'invitation encore en attente pour cette fiche, s'il y en a une. */
function invitationDe(a) {
  var mail = (a.email || '').trim().toLowerCase();
  return (state.invits || []).filter(function (i) {
    return !i.accepted_at && (i.legacy_id === a.id || (mail && i.email === mail));
  })[0] || null;
}

/** L'adresse complète du lien d'invitation, telle qu'on l'envoie. */
function lienInvitation(token) {
  return location.origin + location.pathname + '#/invitation/' + token;
}

function ligneCompte(a) {
  if (typeof DB === 'undefined' || !DB.estDispo()) return '';
  var p = DB.profil();
  if (!p || p.role !== 'owner') return '';

  // 1. Elle a déjà un compte, et il est relié à cette fiche : rien à faire.
  if (a.uid) {
    var c = (state.comptes || []).filter(function (x) { return x.uid === a.uid; })[0] || {};
    var ouverts = (c.props || []).length;
    var coches = (a.props || []).length;
    // Ce qui est coché ici et ce que son téléphone voit ne sont pas la même
    // chose : entre les deux, il y a une écriture dans le cahier, qui peut
    // n'avoir pas encore eu lieu. On le montre plutôt que de le supposer.
    var ecart = ouverts !== coches;

    /* COMBIEN DE MISSIONS L'ATTENDENT VRAIMENT (session 19)

       « Elle voit 3 logements » ne suffisait pas : le propriétaire pouvait
       avoir tout coché correctement et n'avoir créé aucune mission — ou les
       avoir créées sans qu'elles partent. On compte donc ce que le cahier lui
       montrera : les missions à prendre, sur les logements que SON COMPTE
       ouvre (et non ceux cochés ici), et de son métier. C'est exactement le
       calcul que fait son téléphone. */
    var attendent = state.missions.filter(function (m) {
      return m.status === 'dispo' &&
        (c.props || []).indexOf(m.prop) >= 0 &&
        (!Array.isArray(c.services) || c.services.indexOf(m.type) >= 0);
    }).length;

    return '<div class="invite-row" style="flex-direction:column;align-items:stretch;gap:8px">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
        '<span class="invite-state">' +
          '<span class="invite-ok">✓ Compte relié</span>' +
          '<span class="invite-mail num">' + esc(c.email || '—') + '</span>' +
        '</span>' +
        '<span class="sec-note" style="flex:1;min-width:200px">' +
          (ecart
            ? '⚠️ Son téléphone n\'ouvre que <strong>' + ouverts + '</strong> logement(s) sur les <strong>' +
              coches + '</strong> cochés ici. Appuie sur « Renvoyer ses droits ».'
            : 'Elle voit ' + ouverts + ' logement(s) sur son téléphone — exactement ce qui est coché ci-dessus.') +
          '<br>' + (attendent
            ? '<strong>' + attendent + ' mission(s) à prendre</strong> l’attendent sur son téléphone.'
            : 'Aucune mission à prendre ne l’attend : soit tout est déjà pris, soit aucun ' +
              'séjour ne se termine sur ces logements.') +
        '</span>' +
        '<button type="button" class="btn btn--xs" style="background:' + (ecart ? 'var(--terra)' : 'var(--ink)') + ';color:#fff"' +
          act('renvoyer-droits', { ag: a.id }) + '>Renvoyer ses droits</button>' +
        '<button type="button" class="btn-danger-xs"' +
          act('delier-compte', { ag: a.id }) + '>Détacher le compte</button>' +
      '</div>' +
      '</div>';
  }

  // 2. Une invitation vient d'être créée, ou attend encore : on montre le lien.
  var lien = (state.invitLien && state.invitLien[a.id]) || null;
  var inv = invitationDe(a);
  if (lien || inv) {
    var url = lien || lienInvitation(inv.token);
    return '<div class="invite-row" style="flex-direction:column;align-items:stretch;gap:8px">' +
      '<span class="invite-state"><span class="invite-todo">Invitation envoyée — en attente</span>' +
        '<span class="invite-mail num">' + esc(a.email || (inv && inv.email) || '') + '</span></span>' +
      '<p class="sec-note" style="margin:0">Envoie-lui ce lien par SMS, par WhatsApp ou par mail. ' +
        'Il lui fera choisir son mot de passe. Valable 14 jours, et une seule fois.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<input class="inp num" style="flex:1;min-width:min(100%,260px);font-size:12.5px" readonly' +
          ' value="' + esc(url) + '" data-fid="lien-' + a.id + '">' +
        '<button type="button" class="btn btn--xs" style="background:var(--ink);color:#fff"' +
          act('copier-lien', { ag: a.id, url: url }) + '>Copier le lien</button>' +
        // Le message tout prêt, lien compris : le propriétaire n'a rien à rédiger.
        '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
          act('copier-message', { ag: a.id, url: url }) + '>Copier le message tout prêt</button>' +
        '<button type="button" class="btn-danger-xs"' +
          act('annuler-invit', { ag: a.id, tk: (inv && inv.token) || '' }) + '>Annuler</button>' +
      '</div>' +
      '</div>';
  }

  // 3. Rien encore : on invite. Sans adresse e-mail sur la fiche, impossible —
  // c'est elle qui prouve que le lien arrive bien à la bonne personne.
  var choix = state.lienCompte && state.lienCompte[a.id];
  var libres = comptesLibres();
  return '<div class="invite-row" style="flex-direction:column;align-items:stretch;gap:8px">' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
      '<span class="invite-state"><span class="invite-todo">Pas encore de compte</span></span>' +
      (a.email
        ? '<span class="sec-note" style="flex:1;min-width:200px">Un lien sera fabriqué pour ' +
            esc(a.email) + '. C\'est toi qui le lui envoies.</span>' +
          '<button type="button" class="btn btn--xs" style="background:var(--terra);color:#fff"' +
            act('inviter', { ag: a.id }) + '>Inviter cette personne</button>'
        : '<span class="sec-note" style="flex:1;min-width:200px">Renseigne d\'abord son adresse e-mail ' +
            'ci-dessus : sans elle, aucun lien d\'invitation n\'est possible.</span>') +
    '</div>' +
    // Reste utile pour un compte créé autrement (le tien, par exemple).
    (libres.length
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<span class="sec-note" style="flex:none">Ou relier un compte qui existe déjà :</span>' +
          '<select class="inp" style="flex:1;min-width:180px;max-width:320px"' +
            ' data-fid="choix-' + a.id + '" data-ch="choix-compte" data-ag="' + a.id + '">' +
            '<option value="">Choisir…</option>' +
            libres.map(function (c) {
              return '<option value="' + esc(c.uid) + '"' + (choix === c.uid ? ' selected' : '') + '>' +
                esc(c.email || c.nom || c.uid) + '</option>';
            }).join('') +
          '</select>' +
          '<button type="button" class="btn btn--xs" style="background:var(--ink);color:#fff"' +
            (choix ? '' : ' disabled') + act('lier-compte', { ag: a.id }) + '>Relier</button>' +
        '</div>'
      : '') +
    '</div>';
}

/* Le retour du cahier partagé — invitation créée, lien copié, droits
   renvoyés, erreur. Il n'était affiché que sur le tableau de bord : les
   boutons de cette page semblaient donc ne rien faire. */
function messageCahier() {
  if (!state.migMsg) return '';
  var bon = /^✅/.test(state.migMsg);
  return '<p class="page-sub" role="status" style="margin:14px 0 0;color:' +
    (bon ? 'var(--vert)' : 'var(--terra)') + '">' + esc(state.migMsg) + '</p>';
}

function viewOwnerAgents() {
  // Les mois glissent avec le calendrier : un mois enregistré l'an dernier
  // peut être sorti de la liste. On retombe alors sur le mois en cours.
  var monthDef = MONTHS.find(function (m) { return m.key === state.ownerMonth; }) || MONTHS[0];
  if (state.ownerMonth !== monthDef.key) state.ownerMonth = monthDef.key;

  /* LA FICHE A ÉTÉ ALLÉGÉE (session 19)

     Elle empilait, en permanence et pour chaque personne : deux rangées de
     cases à cocher, le bloc du compte relié, une rangée de pastilles d'avis,
     puis l'historique. Cinq blocs, dont quatre ne servent qu'une fois par
     trimestre. Le propriétaire a raison : c'est chargé.

     Ce qui reste visible en permanence est ce qu'on regarde tous les jours :
     qui c'est, **sa note moyenne**, ce qu'on lui doit. Tout le reste — les
     logements confiés, les prestations, le compte, la suppression — passe
     derrière un bouton « Réglages ». Rien n'est retiré, tout est rangé. */
  var cards = state.agents.map(function (a) {
    var rows = monthRows(a.id, state.ownerMonth);
    var open = state.openAgent === a.id;
    var reglages = state.openReglages === a.id;
    var paye = isPaid(a.id, state.ownerMonth);
    var rt = agentRating(a.id);

    // La remise des clés ne prend pas de mission : ni montant, ni paie, ni note.
    // À sa place, on montre ce qui la concerne : ses prochaines remises de clés.
    var cles = a.kind === 'cles';
    var venir = cles ? keyEvents(a.id).filter(function (e) { return e.date >= TODAY; }).length : 0;

    /* LA MOYENNE, EN GRAND (demandée en session 19). Elle se lisait en petit
       gris, noyée dans « Depuis mars · 4,7/5 (3 avis) · 2 mission(s) ce
       mois » — autant dire nulle part. Elle a maintenant sa colonne, à
       côté de ce qu'on doit à la personne. */
    var blocNote = cles ? '' :
      '<button type="button" class="ag-chiffre"' + act('toggle-agent', { ag: a.id }) + '>' +
        (rt
          ? '<span class="serif num ag-chiffre-v" style="color:var(--amber-t)">' + fmtNote(rt.avg) + '</span>' +
            '<span class="ag-chiffre-l">sur 5 · ' + rt.n + ' avis</span>'
          : '<span class="serif num ag-chiffre-v" style="color:var(--muted2)">—</span>' +
            '<span class="ag-chiffre-l">pas encore noté</span>') +
      '</button>';

    return '<article class="card" style="padding:0;overflow:hidden">' +
      '<div style="display:flex;align-items:center;gap:16px;padding:20px 22px;flex-wrap:wrap">' +
        '<div class="avatar" style="width:52px;height:52px;font-size:17px;background:' + a.avatarBg + ';color:' + a.avatarFg + '">' + a.init + '</div>' +
        '<div style="flex:1;min-width:180px">' +
          '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">' +
            '<span style="font:700 18px Figtree,sans-serif">' + esc(a.name) + '</span>' +
            '<span class="badge" style="background:' + a.roleBg + ';color:' + a.roleFg + ';font-weight:600">' +
              (cles ? '🔑 ' : '') + esc(a.role) + '</span>' +
          '</div>' +
          '<div class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:3px">Depuis ' + esc(a.since) +
            (cles
              ? ' · ' + (a.props || []).length + ' logement(s) confié(s)'
              : ' · ' + (a.props || []).length + ' logement(s) · ' + rows.length + ' mission(s) ce mois') + '</div>' +
        '</div>' +
        (cles
          ? '<div style="text-align:right;flex:none">' +
              '<div class="serif num" style="font-size:28px;line-height:1">' + venir + '</div>' +
              '<div style="font:600 11.5px Figtree,sans-serif;color:var(--muted);margin-top:3px">arrivées et départs à venir</div>' +
            '</div>'
          : blocNote +
            '<div style="text-align:right;flex:none">' +
              '<div class="serif num" style="font-size:28px;line-height:1">' + rows.reduce(function (n, r) { return n + r.price; }, 0) + ' €</div>' +
              '<div style="font:600 11.5px Figtree,sans-serif;color:' + (paye ? 'var(--green-t)' : 'var(--muted)') + ';margin-top:3px">' +
                (paye ? 'payé' : 'à verser') + '</div>' +
            '</div>' +
            '<button type="button" class="btn btn--xs" style="' + (paye ? 'background:var(--green-bg);color:var(--green-t)' : 'background:var(--amber-bg);color:var(--amber-t)') + '"' +
              act('toggle-payout', { ag: a.id }) + '>' + (paye ? '✓ Payé' : 'Marquer payé') + '</button>') +
      '</div>' +

      /* Une seule rangée de boutons, toujours la même, à hauteur d'œil. */
      '<div class="ag-barre">' +
        (cles ? '' : '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
          act('toggle-agent', { ag: a.id }) + '>' + (open ? 'Masquer le détail' : 'Missions et avis') + '</button>') +
        '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
          act('toggle-reglages', { ag: a.id }) + '>' +
          (reglages ? 'Fermer les réglages' : '⚙ Réglages et accès') + '</button>' +
        (reglages ? '' : '<span class="sec-note" style="margin-left:auto">' +
          (cles ? 'Calendriers confiés' : 'Logements, prestations et compte') + ' — repliés</span>') +
      '</div>' +

      /* --- Réglages : tout ce qui ne se touche qu'à l'embauche ------------ */
      (!reglages ? '' :

      /* Biens confiés : missions à prendre, ou calendrier à consulter. */
      '<div class="perm-row">' +
        '<span class="perm-label">' + (cles ? 'Voit le calendrier de :' : 'Peut prendre les missions de :') + '</span>' +
        (state.props.length ? state.props.map(function (p) {
          var on = (a.props || []).indexOf(p.id) >= 0;
          return '<button type="button" class="perm-chip" aria-pressed="' + on + '" style="--accent:' + p.color + '"' +
            act('toggle-perm', { ag: a.id, pid: p.id }) + '>' +
            '<span class="dot" style="background:' + (on ? p.color : 'rgba(36,30,26,.2)') + '"></span>' + esc(p.short) + '</button>';
        }).join('') : '<span class="sec-note">Aucun bien enregistré.</span>') +
        '<button type="button" class="btn-danger-xs" style="margin-left:auto"' +
          act('remove-agent', { ag: a.id }) + '>Supprimer</button>' +
      '</div>' +

      /* Prestations de son métier : ce qui n'est pas coché n'apparaît jamais
         sur son téléphone, ni dans le pool ni dans le compteur (D-53).
         Une remise des clés ne prend aucune mission : la ligne n'a pas lieu d'être. */
      (cles ? '' :
      '<div class="perm-row">' +
        '<span class="perm-label">Prestations qu\'il ou elle fait :</span>' +
        (state.services.length ? state.services.map(function (s) {
          var on = allowedServices(a.id).indexOf(s.key) >= 0;
          return '<button type="button" class="perm-chip" aria-pressed="' + on + '" style="--accent:' + C.vert + '"' +
            act('toggle-service-perm', { ag: a.id, sv: s.key }) + '>' +
            '<span class="checkbox-sq' + (on ? ' checkbox-sq--on' : '') + '" style="--accent:' + C.vert + '"></span>' +
            esc(s.label) + '</button>';
        }).join('') : '<span class="sec-note">Aucune prestation enregistrée.</span>') +
      '</div>') +

      /* Il n'y a plus qu'UN SEUL bloc d'invitation (session 15).
         Celui de la session 8 vivait ici : deux boutons « ✉ Inviter par mail »
         et « Copier le message », dont le texte disait de choisir son nom dans
         une liste et annonçait qu'aucun mot de passe n'était demandé. Ce
         parcours n'existe plus depuis la session 14 (D-65) : le message envoyait
         donc le prestataire dans le mur. Tout passe par `ligneCompte()`. */
      ligneCompte(a)) +

      (open && !cles ? '<div class="table-scroll" style="padding:0 22px 8px">' +
        '<div class="thead" style="background:transparent;padding:10px 0;border-top:1px solid rgba(36,30,26,.07);min-width:640px">' +
          '<span style="width:90px">Date</span><span style="flex:1.4">Bien</span><span style="flex:1">Type</span>' +
          '<span style="width:110px">Statut</span><span style="width:70px;text-align:right">Montant</span></div>' +
        (rows.length ? rows.map(function (r) {
          var p = prop(r.prop);
          return '<div class="trow" style="padding:12px 0;min-width:640px">' +
            '<span class="num" style="width:90px;font-weight:600">' + esc(r.dateLabel) + '</span>' +
            '<span style="flex:1.4;display:flex;align-items:center;gap:9px;min-width:0">' +
              '<span class="dot" style="width:7px;height:7px;background:' + p.color + '"></span>' + esc(p.name) + '</span>' +
            '<span style="flex:1;color:var(--muted3)">' + esc(service(r.type).label) + '</span>' +
            '<span style="width:110px"><span class="badge ' + (paye ? 'badge--green' : 'badge--amber') + '">' +
              (paye ? 'Payée' : 'À payer') + '</span></span>' +
            '<span class="num" style="width:70px;text-align:right;font-weight:600">' + r.price + ' €</span>' +
            '</div>';
        }).join('') : '<p class="empty" style="padding:20px 0">Aucune mission sur ce mois.</p>') +
        '</div>' +
        (rt ? '<div style="padding:6px 22px 20px">' +
          '<h3 class="sec-title" style="margin:0 0 10px">Commentaires des voyageurs</h3>' +
          '<div class="stack" style="gap:10px">' + rt.list.slice().reverse().map(function (v) {
            return '<div class="avis">' +
              '<div class="avis-top">' + starsRead(v.stars) +
                '<span class="avis-meta num">' + esc(prop(v.pid).name + ' · ' + v.dateLabel) + '</span></div>' +
              (v.texte ? '<p class="avis-txt">« ' + esc(v.texte) + ' »</p>' : '<p class="avis-txt avis-txt--none">Sans commentaire.</p>') +
              '</div>';
          }).join('') + '</div></div>' : '') : '') +
      '</article>';
  }).join('');

  var reste = state.agents.filter(function (a) { return !isPaid(a.id, state.ownerMonth); })
    .reduce(function (n, a) { return n + monthTotal(a.id, state.ownerMonth); }, 0);

  var form = !state.showNewAgent ? '' :
    '<div class="card pop" style="margin-top:18px;padding:22px">' +
      '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 16px">Nouveau prestataire</h2>' +
      /* Le métier décide de ce que la personne verra sur son téléphone. */
      '<div style="margin-bottom:16px">' +
        '<span class="lab">Type de prestataire</span>' +
        '<div class="seg" style="margin-top:6px;max-width:420px">' + AGENT_KINDS.map(function (k) {
          return '<button type="button" aria-pressed="' + (state.na.kind === k.key) + '"' +
            act('na-kind', { k: k.key }) + '>' + esc(k.label) + '</button>';
        }).join('') + '</div>' +
        '<p class="sec-note" style="margin-top:6px">' +
          esc((AGENT_KINDS.find(function (k) { return k.key === state.na.kind; }) || AGENT_KINDS[0]).hint) + '</p>' +
      '</div>' +
      '<div class="cols" style="gap:14px">' +
        '<div style="flex:2;min-width:200px"><label class="lab" for="na-name">Nom et prénom</label>' +
          '<input class="inp" id="na-name" type="text" placeholder="Ex. Claire Dubois" value="' + esc(state.na.name) + '" data-fid="na-name" data-in="na-name"></div>' +
        '<div style="flex:1.4;min-width:170px"><label class="lab" for="na-role">Rôle</label>' +
          '<input class="inp" id="na-role" type="text" placeholder="Ex. Ménage" value="' + esc(state.na.role) + '" data-fid="na-role" data-in="na-role"></div>' +
        '<div style="flex:2;min-width:200px"><label class="lab" for="na-email">E-mail</label>' +
          '<input class="inp" id="na-email" type="email" placeholder="claire.dubois@mail.fr" value="' + esc(state.na.email) + '" data-fid="na-email" data-in="na-email"></div>' +
      '</div>' +
      '<div style="margin-top:14px"><span class="lab">Couleur</span>' +
        '<div class="chiprow" style="margin-top:6px">' + PALETTE.map(function (c) {
          return '<button type="button" class="swatch" aria-pressed="' + (state.na.color === c.color) + '" aria-label="Couleur"' +
            ' style="background:' + c.color + '"' + act('na-color', { c: c.color }) + '></button>';
        }).join('') + '</div></div>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:18px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn--primary btn--sm"' + act('create-agent') + '>Ajouter le prestataire</button>' +
        '<button type="button" class="btn btn--sm" style="background:transparent;color:var(--muted)"' + act('toggle-new-agent') + '>Annuler</button>' +
        '<span class="sec-note">' + (state.na.kind === 'cles'
          ? 'Cochez ensuite les logements dont il remet les clés : il en verra le calendrier, '
          : 'Cochez ensuite ses biens autorisés, ') +
          'puis envoyez-lui son invitation avec le bouton « ✉ Inviter par mail » de sa fiche.</span>' +
      '</div>' +
    '</div>';

  return ownerShell('agents',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Prestataires</h1>' +
      '<p class="page-sub">Missions réalisées, biens autorisés et rémunération, mois par mois.</p></div>' +
      '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">' +
        '<div style="min-width:190px">' +
          '<label class="lab" for="om-month">Mois</label>' +
          '<select class="inp" id="om-month" data-fid="om-month" data-ch="owner-month">' + MONTHS.map(function (m) {
            return '<option value="' + esc(m.key) + '"' + (state.ownerMonth === m.key ? ' selected' : '') + '>' + esc(m.label) + '</option>';
          }).join('') + '</select>' +
        '</div>' +
        '<button type="button" class="btn btn--xs" style="' + (state.showNewAgent ? 'background:var(--cream);color:var(--ink-soft)' : 'background:var(--terra);color:#fff') +
          ';min-height:42px;font-size:13px"' + act('toggle-new-agent') + '>' +
          (state.showNewAgent ? 'Fermer' : '+ Ajouter un prestataire') + '</button>' +
      '</div>' +
    '</div>' + messageCahier() + form +

    '<div class="cols" style="margin-top:22px;gap:12px">' +
      '<div class="kpi" style="min-width:200px"><div class="v num">' +
        state.agents.reduce(function (n, a) { return n + monthTotal(a.id, state.ownerMonth); }, 0) + ' €</div>' +
        '<div class="l">total ' + esc(monthDef.label.toLowerCase()) + '</div></div>' +
      '<div class="kpi" style="min-width:200px"><div class="v num">' +
        state.agents.reduce(function (n, a) { return n + monthRows(a.id, state.ownerMonth).length; }, 0) + '</div>' +
        '<div class="l">missions réalisées</div></div>' +
      '<div class="kpi" style="min-width:200px"><div class="v num" style="color:' + (reste ? C.ambre : C.vert) + '">' + reste + ' €</div>' +
        '<div class="l">' + (reste ? 'reste à verser' : 'mois soldé') + '</div></div>' +
      '<div class="kpi" style="flex:1.4;min-width:220px"><div style="font:700 15px/1.25 Figtree,sans-serif;margin-top:4px">' +
        esc(monthDef.label) + '</div>' +
        '<div class="l">' + esc(monthDef.payNote) + '</div></div>' +
    '</div>' +

    '<div class="stack" style="gap:14px;margin-top:22px">' +
      (cards || '<p class="empty">Aucun prestataire. Ajoutez le premier ci-dessus.</p>') + '</div>');
}

/* --- Commentaires des voyageurs ------------------------------------------ */

/* Tous les avis au même endroit : la propreté (qui vise un prestataire) et le
   séjour (qui vise un logement). Filtrables par type et par bien. */
function viewOwnerAvis() {
  var f = state.avisFilter;

  var liste = state.avis.slice().reverse().filter(function (v) {
    if (f.kind !== 'tous' && v.kind !== f.kind) return false;
    if (f.prop !== 'tous' && v.pid !== f.prop) return false;
    if (f.stars !== 'toutes' && v.stars !== parseInt(f.stars, 10)) return false;
    return true;
  });

  var moyenne = function (rows) {
    if (!rows.length) return null;
    return Math.round(rows.reduce(function (n, v) { return n + v.stars; }, 0) / rows.length * 10) / 10;
  };
  var mMenage = moyenne(avisOf('menage'));
  var mSejour = moyenne(avisOf('sejour'));
  var basses = state.avis.filter(function (v) { return v.stars <= 3; }).length;

  /* Le script 08 n'est pas collé : les avis ne quittent pas cet ordinateur.
     C'est exactement ce qui faisait dire « la prestataire ne voit pas ses
     notes » — on l'écrit là où il les regarde. */
  var horsCahier = typeof DB !== 'undefined' && DB.estDispo() && DB.avisIndisponibles()
    ? '<div class="alerte-envoi" style="margin-top:18px;margin-bottom:0">' +
      '<strong>Ces avis ne sortent pas de cet ordinateur.</strong> Il manque le script ' +
      '<em>08-avis.sql</em> dans Supabase : tant qu\'il n\'est pas collé, tes prestataires lisent ' +
      '« pas encore de note » sur leur téléphone, même quand un voyageur vient de les noter. ' +
      'La marche à suivre est au point 2 de la liste du document d\'état.</div>'
    : '';

  var kpis = horsCahier + '<div class="cols" style="margin-top:22px;gap:12px">' +
    '<div class="kpi" style="min-width:190px"><div class="v num">' + state.avis.length + '</div>' +
      '<div class="l">avis reçus</div></div>' +
    '<div class="kpi" style="min-width:190px"><div class="v num" style="color:' + C.ambre + '">' +
      (mMenage !== null ? fmtNote(mMenage) : '—') + '</div><div class="l">moyenne ménage</div></div>' +
    '<div class="kpi" style="min-width:190px"><div class="v num" style="color:' + C.ambre + '">' +
      (mSejour !== null ? fmtNote(mSejour) : '—') + '</div><div class="l">moyenne séjour</div></div>' +
    '<div class="kpi" style="min-width:190px"><div class="v num" style="color:' + (basses ? C.terracotta : C.vert) + '">' +
      basses + '</div><div class="l">' + (basses ? 'avis à 3 étoiles ou moins' : 'aucun avis négatif') + '</div></div>' +
    '</div>';

  var filtres = '<div class="card" style="margin-top:20px;padding:18px 20px">' +
    '<div class="cols" style="gap:14px;align-items:flex-end">' +
      '<div style="flex:1;min-width:170px"><label class="lab" for="af-kind">Type de commentaire</label>' +
        '<select class="inp" id="af-kind" data-fid="af-kind" data-ch="avis-filter" data-f="kind">' +
        [['tous', 'Tous les commentaires'], ['menage', 'Ménage seulement'], ['sejour', 'Séjour seulement']]
          .map(function (o) {
            return '<option value="' + o[0] + '"' + (f.kind === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select></div>' +
      '<div style="flex:1;min-width:170px"><label class="lab" for="af-prop">Logement</label>' +
        '<select class="inp" id="af-prop" data-fid="af-prop" data-ch="avis-filter" data-f="prop">' +
        '<option value="tous"' + (f.prop === 'tous' ? ' selected' : '') + '>Tous les logements</option>' +
        state.props.map(function (p) {
          return '<option value="' + esc(p.id) + '"' + (f.prop === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
        }).join('') + '</select></div>' +
      '<div style="flex:1;min-width:150px"><label class="lab" for="af-stars">Note</label>' +
        '<select class="inp" id="af-stars" data-fid="af-stars" data-ch="avis-filter" data-f="stars">' +
        ['toutes', '5', '4', '3', '2', '1'].map(function (o) {
          return '<option value="' + o + '"' + (f.stars === o ? ' selected' : '') + '>' +
            (o === 'toutes' ? 'Toutes les notes' : o + ' étoile' + (o === '1' ? '' : 's')) + '</option>';
        }).join('') + '</select></div>' +
    '</div></div>';

  var cartes = liste.length
    ? '<div class="grid-cards" style="margin-top:20px">' + liste.map(function (v) {
        var p = prop(v.pid);
        var menage = v.kind === 'menage';
        return '<article class="card avis-card' + (v.stars <= 3 ? ' avis-card--low' : '') + '">' +
          '<div class="avis-top">' + starsRead(v.stars) +
            '<span class="badge ' + (menage ? 'badge--blue' : 'badge--green') + '">' +
              (menage ? 'Ménage' : 'Séjour') + '</span></div>' +
          (v.texte
            ? '<p class="avis-txt" style="font-size:14.5px">« ' + esc(v.texte) + ' »</p>'
            : '<p class="avis-txt avis-txt--none">Sans commentaire.</p>') +
          '<div class="avis-foot">' +
            '<span class="dot" style="background:' + p.color + '"></span>' +
            '<span class="grow">' + esc(p.name) + '</span>' +
            '<span class="num">' + esc(v.dateLabel) + '</span>' +
          '</div>' +
          '<div class="avis-foot avis-foot--who">' +
            '<span class="grow">' + esc(v.guest || 'Voyageur') + '</span>' +
            (menage
              ? (v.agent
                  ? '<button type="button" class="avis-link"' + act('nav', { path: '#/admin/prestataires' }) + '>' +
                    esc(agent(v.agent).name) + ' →</button>'
                  : '<span class="sec-note">prestataire inconnu</span>')
              : '<button type="button" class="avis-link"' + act('open-bien', { id: v.pid }) + '>Voir le bien →</button>') +
          '</div>' +
          '</article>';
      }).join('') + '</div>'
    : '<p class="empty" style="margin-top:24px">' +
      (state.avis.length
        ? 'Aucun commentaire ne correspond à ces filtres.'
        : 'Aucun commentaire pour le moment. Les voyageurs notent la propreté à leur arrivée et ' +
          'leur séjour à la fin, depuis le livret d\'accueil.') + '</p>';

  return ownerShell('avis',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Commentaires</h1>' +
      '<p class="page-sub">Tout ce que les voyageurs ont écrit : la propreté à leur arrivée, le séjour à leur départ.</p></div>' +
    '</div>' + kpis + filtres + cartes);
}

/* --- Stocks -------------------------------------------------------------- */

function viewOwnerStocks() {
  var content;

  if (state.stockTab === 'matrice') {
    var visible = state.stockGroup === 'Tous' ? groups() : [state.stockGroup];
    content =
      '<div class="chiprow" style="margin-top:20px">' +
        ['Tous'].concat(groups()).map(function (g) {
          return '<button type="button" class="chip" aria-pressed="' + (state.stockGroup === g) + '"' +
            act('stock-group', { g: g }) + '>' + esc(g) + '</button>';
        }).join('') +
        '<span style="width:1px;height:24px;background:rgba(36,30,26,.12);margin:0 4px"></span>' +
        '<button type="button" class="chip" style="' + (state.stockScope === 'low' ? 'background:var(--terra-bg2);color:var(--terra-d)' : '') + '"' +
          act('toggle-scope') + '>' + (state.stockScope === 'all' ? 'Tout afficher' : 'Sous le seuil seulement') + '</button>' +
      '</div>' +
      '<div class="stack-l" style="margin-top:16px">' + visible.map(function (gn) {
        var rows = arts().filter(function (a) { return a.group === gn; })
          .filter(function (a) {
            return state.stockScope === 'all' || state.props.some(function (p) { return (state.stock[p.id][a.key] || 0) <= state.seuils[a.key]; });
          });
        return '<div class="table"><div class="table-scroll">' +
          '<div class="thead thead--stock" style="align-items:center">' +
            '<span style="flex:1.6;font-size:13px;text-transform:none;letter-spacing:0;color:var(--ink)">' + esc(gn) + '</span>' +
            '<span style="width:118px;text-align:center">Seuil</span>' +
            state.props.map(function (p) { return '<span style="flex:1;text-align:center">' + esc(p.short) + '</span>'; }).join('') +
            '<span style="width:46px"></span>' +
          '</div>' +
          (rows.length ? rows.map(function (a) {
            return '<div class="trow trow--stock" style="padding:10px 20px">' +
              '<span style="flex:1.6;min-width:0">' +
                '<span style="font:500 13.5px Figtree,sans-serif">' + esc(a.label) + '</span>' +
                '<span class="num" style="font:500 11.5px Figtree,sans-serif;color:var(--muted2);display:block;margin-top:1px">' + esc(a.unit) + ' · dotation ' + a.par + '</span>' +
              '</span>' +
              '<span style="width:118px;display:flex;justify-content:center">' +
                '<span class="stepper stepper--sm">' +
                  '<button type="button" aria-label="Baisser le seuil de ' + esc(a.label) + '"' + act('seuil', { k: a.key, d: -1 }) + '>−</button>' +
                  '<span class="val num">' + (state.seuils[a.key] || 0) + '</span>' +
                  '<button type="button" aria-label="Monter le seuil de ' + esc(a.label) + '"' + act('seuil', { k: a.key, d: 1 }) + '>+</button>' +
                '</span></span>' +
              state.props.map(function (p) {
                var v = (state.stock[p.id] || {})[a.key] || 0;
                var cls = v === 0 ? 'cell-q--zero' : v <= (state.seuils[a.key] || 0) ? 'cell-q--low' : 'cell-q--ok';
                return '<span style="flex:1;text-align:center"><span class="cell-q num ' + cls + '">' + v + '</span></span>';
              }).join('') +
              '<span style="width:46px;text-align:right">' +
                '<button type="button" class="x-btn" aria-label="Supprimer l\'article ' + esc(a.label) + '"' +
                  act('remove-article', { k: a.key }) + '>×</button></span>' +
              '</div>';
          }).join('') : '<p class="empty">Rien sous le seuil dans cette catégorie.</p>') +
          '</div></div>';
      }).join('') + '</div>' + formNewArticle();
  } else {
    /* Biens retenus pour les courses. Tant que rien n'a été décoché, ils y sont tous. */
    var choisis = coursesPropIds();
    var blocks = state.props.filter(function (p) { return choisis.indexOf(p.id) >= 0; }).map(function (p) {
      var items = lowsFor(p.id).map(function (a) {
        return { key: a.key, label: a.label, group: a.group, unit: a.unit,
          need: Math.max(1, a.par - ((state.stock[p.id] || {})[a.key] || 0)) };
      });
      return { p: p, items: items, units: items.reduce(function (n, i) { return n + i.need; }, 0) };
    });
    var totalItems = blocks.reduce(function (n, b) { return n + b.items.length; }, 0);
    var totalUnits = blocks.reduce(function (n, b) { return n + b.units; }, 0);

    /* Liste unique : un seul passage en magasin pour tous les logements. */
    var fusion = {};
    blocks.forEach(function (b) {
      b.items.forEach(function (i) {
        var f = fusion[i.key] || (fusion[i.key] = { label: i.label, unit: i.unit, group: i.group, need: 0, biens: [] });
        f.need += i.need;
        f.biens.push(b.p.short + ' ' + i.need);
      });
    });
    var fusionGroups = groups().map(function (g) {
      return [g, Object.keys(fusion).filter(function (k) { return fusion[k].group === g; }).map(function (k) { return fusion[k]; })];
    }).filter(function (g) { return g[1].length; });

    var bascule = '<div class="seg" style="margin-top:20px">' +
      [['bien', 'Une liste par bien'], ['global', 'Une seule liste de courses']].map(function (t) {
        return '<button type="button" aria-pressed="' + (state.coursesScope === t[0]) + '"' +
          act('courses-scope', { s: t[0] }) + '>' + t[1] + '</button>';
      }).join('') + '</div>';

    /* Choix des logements à mettre dans les courses : on ne rachète pas
       forcément pour tous les biens le même jour. */
    var tous = choisis.length === state.props.length;
    var picker = '<div class="card" style="margin-top:16px;padding:16px 20px">' +
      '<div class="perm-row" style="border:0;padding:0">' +
        '<span class="perm-label">Logements dans la liste :</span>' +
        (state.props.length ? state.props.map(function (p) {
          var on = choisis.indexOf(p.id) >= 0;
          return '<button type="button" class="perm-chip" aria-pressed="' + on + '" style="--accent:' + p.color + '"' +
            act('courses-prop', { pid: p.id }) + '>' +
            '<span class="checkbox-sq' + (on ? ' checkbox-sq--on' : '') + '" style="--accent:' + p.color + '"></span>' +
            esc(p.short) + '</button>';
        }).join('') : '<span class="sec-note">Aucun bien enregistré.</span>') +
        '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft);margin-left:auto"' +
          act('courses-all', { v: tous ? '0' : '1' }) + '>' + (tous ? 'Tout décocher' : 'Tout cocher') + '</button>' +
      '</div></div>';

    var listes = !blocks.length
      ? '<p class="empty" style="margin-top:20px">Cochez au moins un logement pour obtenir une liste de courses.</p>'
      : state.coursesScope === 'bien'
      ? '<div class="grid-cards" style="margin-top:20px">' + blocks.map(function (b) {
          return '<div class="card">' +
            '<div style="display:flex;align-items:center;gap:10px">' +
              '<span class="dot" style="background:' + b.p.color + '"></span>' +
              '<span style="font:700 16px Figtree,sans-serif;flex:1">' + esc(b.p.name) + '</span>' +
              '<span class="badge badge--soft num">' + b.items.length + ' réf.</span></div>' +
            '<div style="margin-top:10px">' + (b.items.length ? b.items.map(function (i) {
              return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(36,30,26,.06)">' +
                '<span class="checkbox-sq"></span>' +
                '<span class="grow" style="font:500 13.5px Figtree,sans-serif">' + esc(i.label) + '</span>' +
                '<span class="num" style="font:700 13px Figtree,sans-serif;flex:none">+' + i.need + ' ' + esc(i.unit) + '</span></div>';
            }).join('') : '<p class="empty" style="padding:18px 0">Rien à racheter.</p>') + '</div>' +
            '</div>';
        }).join('') + '</div>'
      : '<div class="grid-cards" style="margin-top:20px">' + (fusionGroups.length ? fusionGroups.map(function (g) {
          return '<div class="card">' +
            '<div style="display:flex;align-items:center;gap:10px">' +
              '<span style="font:700 16px Figtree,sans-serif;flex:1">' + esc(g[0]) + '</span>' +
              '<span class="badge badge--soft num">' + g[1].length + ' réf.</span></div>' +
            '<div style="margin-top:10px">' + g[1].map(function (i) {
              return '<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid rgba(36,30,26,.06)">' +
                '<span class="checkbox-sq" style="margin-top:3px"></span>' +
                '<span class="grow"><span style="font:500 13.5px Figtree,sans-serif">' + esc(i.label) + '</span>' +
                  '<span class="num" style="display:block;font:500 11.5px Figtree,sans-serif;color:var(--muted2);margin-top:2px">' +
                    esc(i.biens.join(' · ')) + '</span></span>' +
                '<span class="num" style="font:700 13.5px Figtree,sans-serif;flex:none">' + i.need + ' ' + esc(i.unit) + '</span></div>';
            }).join('') + '</div>' +
            '</div>';
        }).join('') : '<p class="empty">Rien à racheter : tous les stocks sont au-dessus de leur seuil.</p>') + '</div>';

    content =
      '<div class="cols" style="margin-top:20px;gap:12px">' +
        '<div class="kpi" style="min-width:190px"><div class="v num">' + Object.keys(fusion).length + '</div><div class="l">références différentes</div></div>' +
        '<div class="kpi" style="min-width:190px"><div class="v num">' + totalUnits + '</div><div class="l">unités au total</div></div>' +
        '<div class="kpi" style="min-width:190px"><div class="v num">' + totalItems + '</div><div class="l">lignes, biens confondus</div></div>' +
        '<div class="kpi" style="flex:2;min-width:260px"><div style="font:700 14px Figtree,sans-serif">' +
        choisis.length + ' logement(s) sur ' + state.props.length + '</div>' +
        '<div class="l">Chaque article sous son seuil est complété jusqu\'à sa dotation d\'origine.</div></div>' +
      '</div>' + picker + bascule + listes;
  }

  return ownerShell('stocks',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Stocks</h1>' +
      '<p class="page-sub">Dernier relevé du prestataire. Ajuste le seuil de chaque article pour piloter la liste de courses.</p></div>' +
      '<div class="seg">' + [['matrice', 'Par bien'], ['courses', 'Liste de courses']].map(function (t) {
        return '<button type="button" aria-pressed="' + (state.stockTab === t[0]) + '"' + act('stock-tab', { t: t[0] }) + '>' + t[1] + '</button>';
      }).join('') + '</div>' +
    '</div>' + content);
}

/* Ajout d'un article de stock : il apparaît aussitôt dans tous les biens,
   dans le relevé du prestataire et dans la liste de courses. */
function formNewArticle() {
  var a = state.nar;
  var cats = groups();
  if (cats.indexOf(a.group) < 0) cats = cats.concat([a.group]);

  if (!state.showNewArticle) {
    return '<button type="button" class="btn btn--dark btn--sm" style="margin-top:16px"' +
      act('toggle-new-article') + '>+ Ajouter un article</button>';
  }
  return '<div class="card pop" style="margin-top:16px;padding:22px">' +
    '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 4px">Nouvel article</h2>' +
    '<p class="sec-note" style="margin:0 0 14px">Il sera ajouté à tous les biens, à zéro, jusqu\'au prochain relevé.</p>' +
    '<div class="cols" style="gap:14px">' +
      '<div style="flex:2;min-width:200px"><label class="lab" for="nar-label">Nom</label>' +
        '<input class="inp" id="nar-label" type="text" placeholder="Ex. Capsules de thé" value="' + esc(a.label) + '" data-fid="nar-label" data-in="nar-label"></div>' +
      '<div style="flex:1;min-width:140px"><label class="lab" for="nar-unit">Unité</label>' +
        '<input class="inp" id="nar-unit" type="text" placeholder="Ex. boîtes" value="' + esc(a.unit) + '" data-fid="nar-unit" data-in="nar-unit"></div>' +
      '<div style="flex:1;min-width:130px"><label class="lab" for="nar-par">Dotation</label>' +
        '<input class="inp num" id="nar-par" type="number" min="1" value="' + esc(a.par) + '" data-fid="nar-par" data-in="nar-par"></div>' +
      '<div style="flex:1;min-width:130px"><label class="lab" for="nar-seuil">Seuil d\'alerte</label>' +
        '<input class="inp num" id="nar-seuil" type="number" min="0" value="' + esc(a.seuil) + '" data-fid="nar-seuil" data-in="nar-seuil"></div>' +
      '<div style="flex:1.4;min-width:170px"><label class="lab" for="nar-group">Catégorie</label>' +
        '<input class="inp" id="nar-group" type="text" list="cats" value="' + esc(a.group) + '" data-fid="nar-group" data-in="nar-group">' +
        '<datalist id="cats">' + cats.map(function (g) { return '<option value="' + esc(g) + '"></option>'; }).join('') + '</datalist></div>' +
    '</div>' +
    '<div style="display:flex;gap:10px;align-items:center;margin-top:18px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn--primary btn--sm"' + act('create-article') + '>Ajouter l\'article</button>' +
      '<button type="button" class="btn btn--sm" style="background:transparent;color:var(--muted)"' + act('toggle-new-article') + '>Annuler</button>' +
      '<span class="sec-note">Une catégorie inconnue est créée automatiquement.</span>' +
    '</div>' +
  '</div>';
}

/* --- Biens (liste) ------------------------------------------------------- */

function viewOwnerBiens() {
  var cards = state.props.map(function (p) {
    var next = state.missions.filter(function (m) { return m.prop === p.id && m.status !== 'termine'; })[0];
    var rs = rooms(p.id);
    var premier = state.services[0];
    var tags = [
      premier ? premier.label.split(' ')[0] + ' ' + ((state.tariffs[p.id] || {})[premier.key] || 0) + ' €' : 'Aucune prestation',
      rs.length + ' pièces',
      rs.reduce(function (n, r) { return n + r.steps.length; }, 0) + ' étapes',
      resasOf(p.id).length + ' résas'
    ];
    return '<button type="button" class="bien-card" style="--accent:' + p.color + '"' +
      act('open-bien', { id: p.id }) + '>' +
      '<div style="display:flex;gap:14px;align-items:center">' +
        '<div class="bien-thumb stripe">PHOTO<br>BIEN</div>' +
        '<div style="min-width:0"><div style="font:700 18px/1.2 Figtree,sans-serif">' + esc(p.name) + '</div>' +
        '<div style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:3px">' +
          esc([(state.info[p.id] || {}).capacity, (state.info[p.id] || {}).surface, p.city].filter(Boolean).join(' · ')) + '</div></div>' +
      '</div>' +
      '<div class="chiprow" style="margin-top:14px;gap:8px">' + tags.map(function (t) {
        return '<span class="badge badge--soft num">' + esc(t) + '</span>';
      }).join('') + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid rgba(36,30,26,.07)">' +
        '<span class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted)">' +
          (next ? 'Prochaine mission · ' + esc(next.dateLabel) : 'Aucune mission à venir') + '</span>' +
        '<span style="font:700 12.5px Figtree,sans-serif;color:var(--terra)">Personnaliser →</span>' +
      '</div></button>';
  }).join('');

  var form = !state.showNewBien ? '' :
    '<div class="card pop" style="margin-top:18px;padding:22px">' +
      '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 16px">Nouveau bien</h2>' +
      '<div class="cols" style="gap:14px">' +
        '<div style="flex:2;min-width:200px"><label class="lab" for="nb-name">Nom du logement</label>' +
          '<input class="inp" id="nb-name" type="text" placeholder="Ex. Maison des Pins" value="' + esc(state.nb.name) + '" data-fid="nb-name" data-in="nb-name"></div>' +
        '<div style="flex:1.4;min-width:170px"><label class="lab" for="nb-city">Ville</label>' +
          '<input class="inp" id="nb-city" type="text" placeholder="Ex. Bordeaux" value="' + esc(state.nb.city) + '" data-fid="nb-city" data-in="nb-city"></div>' +
        '<div style="flex:2;min-width:200px"><label class="lab" for="nb-address">Adresse</label>' +
          '<input class="inp" id="nb-address" type="text" placeholder="Ex. 3 rue des Pins" value="' + esc(state.nb.address) + '" data-fid="nb-address" data-in="nb-address"></div>' +
      '</div>' +
      '<div style="margin-top:14px"><span class="lab">Couleur d\'identité</span>' +
        '<div class="chiprow" style="margin-top:6px">' + PALETTE.map(function (c) {
          return '<button type="button" class="swatch" aria-pressed="' + (state.nb.color === c.color) + '" aria-label="Couleur"' +
            ' style="background:' + c.color + '"' + act('nb-color', { c: c.color }) + '></button>';
        }).join('') + '</div></div>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:18px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn--primary btn--sm"' + act('create-bien') + '>Créer le bien</button>' +
        '<button type="button" class="btn btn--sm" style="background:transparent;color:var(--muted)"' + act('toggle-new-bien') + '>Annuler</button>' +
        '<span class="sec-note">Stocks, tarifs et checklist de départ créés automatiquement.</span>' +
      '</div>' +
    '</div>';

  return ownerShell('biens',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Biens</h1>' +
      '<p class="page-sub">Checklist, tarifs, réservations, livret d\'accueil et connexions — pour chaque logement.</p></div>' +
      '<button type="button" class="btn btn--xs" style="' + (state.showNewBien ? 'background:var(--cream);color:var(--ink-soft)' : 'background:var(--terra);color:#fff') +
        ';min-height:42px;font-size:13px"' + act('toggle-new-bien') + '>' +
        (state.showNewBien ? 'Fermer' : '+ Ajouter un bien') + '</button>' +
    '</div>' + messageCahier() + form +
    '<div class="grid-cards" style="margin-top:22px">' +
      (cards || '<p class="empty">Aucun bien. Ajoutez le premier ci-dessus.</p>') + '</div>' +
    carteLienUnique() +
    carteConnexions());
}

/* LE LIEN QUE L'ON COLLE UNE FOIS POUR TOUTES (mis en avant en session 19)

   Il existait déjà — `#/bienvenue`, D-90 — mais nulle part sur l'écran du
   propriétaire : on ne pouvait le trouver que dans la liste des raccourcis
   des messages programmés, écrit `{bienvenue}`. Il ne servait donc à
   personne, alors que c'est **le** lien à mettre dans les messages
   automatiques d'Airbnb et de Booking.

   Ce qu'il fait, en une phrase : le voyageur l'ouvre, donne son nom et sa
   date d'arrivée, et tombe sur le livret de SON logement. Son téléphone s'en
   souvient ensuite : les fois suivantes, le livret s'ouvre directement.

   Sa limite est écrite noir sur blanc, elle n'est pas cachée : qui connaît
   le nom d'un voyageur et sa date d'arrivée peut ouvrir son livret. Le lien
   personnel, lui, n'a pas ce défaut — c'est pourquoi on le recommande dès
   qu'on écrit à quelqu'un en particulier. */
function texteBienvenue() {
  return 'Bonjour,\n\n' +
    'Voici votre livret d’accueil :\n' +
    appUrl() + '#/bienvenue\n\n' +
    'Indiquez votre nom et votre date d’arrivée : vous retrouverez l’adresse, ' +
    'les horaires, le code d’accès et le Wi-Fi pendant votre séjour, ainsi que ' +
    'nos conseils sur place.\n\n' +
    'À très bientôt !';
}

function carteLienUnique() {
  var lien = appUrl() + '#/bienvenue';
  return '<div class="card" style="margin-top:22px;padding:22px;border-left:4px solid var(--terra)">' +
    '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 4px">Le lien à donner à tous les voyageurs</h2>' +
    '<p class="sec-note" style="margin:0 0 12px">Un seul lien, valable pour <strong>tous</strong> les ' +
      'logements et tous les séjours : c’est celui à coller dans les messages automatiques d’Airbnb ' +
      'et de Booking, une fois pour toutes. Le voyageur donne son nom et sa date d’arrivée, et il ' +
      'tombe sur le livret de son logement. Son téléphone s’en souvient : les fois suivantes, ' +
      'le livret s’ouvre tout seul.</p>' +
    '<input class="inp num" style="font-size:12.5px" readonly value="' + esc(lien) + '" data-fid="lien-bienvenue">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
      '<button type="button" class="btn btn--xs" style="background:var(--terra);color:#fff"' +
        act('copier-lien', { url: lien }) + '>Copier le lien</button>' +
      '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
        act('copier-message-bienvenue') + '>Copier le message tout prêt</button>' +
      '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
        act('nav', { path: '#/bienvenue' }) + '>👁 Voir ce que le voyageur voit</button>' +
    '</div>' +
    '<p class="sec-note" style="margin-top:12px">À savoir, pour choisir en connaissance de cause : ' +
      'ce lien identifie par le <strong>nom + la date d’arrivée</strong>. Quelqu’un qui connaîtrait ' +
      'les deux pourrait ouvrir le livret de ce voyageur. Quand vous écrivez à une personne en ' +
      'particulier, préférez le <strong>lien personnel</strong> de sa réservation — il n’a pas ce ' +
      'défaut, et le voyageur n’a rien à taper.</p>' +
    '</div>';
}

/* --- Connexions aux plateformes ------------------------------------------
   Panneau d'état, honnête sur ce qui marche et ce qui attend le serveur.
   Aucune clé secrète n'est demandée ici : elle n'a rien à faire dans une page
   publique, ni même dans ce navigateur (voir D-42). */

function carteConnexions() {
  var parSource = { manuel: 0, ical: 0, beds24: 0 };
  allResas().forEach(function (x) { parSource[x.r.source] = (parSource[x.r.source] || 0) + 1; });

  return '<h2 class="sec-title" style="margin-top:30px">Connexions aux plateformes</h2>' +
    '<div class="cols" style="gap:14px">' +

      '<div class="card" style="flex:1.3;min-width:min(100%,340px);padding:22px">' +
        '<h3 style="font:700 16px Figtree,sans-serif;margin:0 0 4px">D’où viennent vos réservations</h3>' +
        '<p class="sec-note" style="margin-bottom:14px">Toutes les réservations suivent le même format, quelle que soit ' +
          'leur origine : c’est ce qui permettra de brancher Beds24 sans rien changer aux écrans.</p>' +
        '<div class="list">' + Object.keys(SOURCES).map(function (k) {
          var s = SOURCES[k];
          return '<div class="kv" style="padding:12px 0">' +
            '<span style="display:flex;align-items:center;gap:9px"><span class="dot" style="background:' + s.color + '"></span>' +
              esc(s.label) + '</span>' +
            '<span class="num" style="font-weight:700">' + (parSource[k] || 0) + ' séjour(s)</span></div>';
        }).join('') + '</div>' +
        '<div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(36,30,26,.08)">' +
          '<label class="lab" for="b24-compte">Identifiant de compte Beds24 (facultatif)</label>' +
          '<input class="inp" id="b24-compte" type="text" placeholder="Ex. maisonwarme" value="' + esc(state.beds24.compte) +
            '" data-fid="b24-compte" data-in="beds24-compte">' +
          '<p class="sec-note" style="margin-top:6px">Le numéro de compte, pas la clé secrète. ' +
            '<strong>Ne collez jamais votre clé d’API ici</strong> : cette page est publique, elle serait lisible par tous. ' +
            'La clé vivra sur le serveur, à la phase suivante.</p>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="flex:1;min-width:min(100%,320px);padding:22px">' +
        '<h3 style="font:700 16px Figtree,sans-serif;margin:0 0 12px">Ce qu’il manque pour synchroniser</h3>' +
        '<div class="stack" style="gap:12px">' + CONNECTEURS.map(function (c) {
          return '<div class="conn">' +
            '<div class="conn-top">' +
              '<span class="conn-n">' + esc(c.label) + '</span>' +
              '<span class="badge badge--amber">Serveur requis</span></div>' +
            '<div class="conn-x">' + esc(c.besoin) + '</div>' +
            '<div class="conn-x conn-x--ok">✓ Apportera : ' + esc(c.apporte) + '</div>' +
            '</div>';
        }).join('') + '</div>' +
        '<p class="sec-note" style="margin-top:14px">En attendant, saisissez les séjours à la main dans l’onglet ' +
          '« Réservations » d’un logement : ils alimentent déjà le calendrier, les missions et les statistiques.</p>' +
      '</div>' +
    '</div>';
}

/* --- Fiche bien ---------------------------------------------------------- */

function viewOwnerBien() {
  var b = prop(route.id);
  if (b.gone) { location.replace('#/admin/biens'); return ''; }
  var pid = b.id;
  var tabs = [['infos', 'Infos & tarifs'], ['checklist', 'Checklist ménage'],
    ['calendrier', 'Réservations'], ['livret', 'Livret d’accueil'], ['ical', 'Synchronisation']];
  var panel = '';

  if (state.bienTab === 'infos') panel = bienInfos(pid, b);
  else if (state.bienTab === 'checklist') panel = bienChecklist(pid, b);
  else if (state.bienTab === 'calendrier') panel = bienCalendar(pid);
  else if (state.bienTab === 'livret') panel = bienLivret(pid, b);
  else panel = bienIcal(pid);

  return ownerShell('biens',
    '<button type="button" class="btn-back" style="min-height:38px;font-size:13px;color:var(--muted)"' +
      act('nav', { path: '#/admin/biens' }) + '>← Tous les biens</button>' +
    '<div class="page-head" style="margin-top:6px">' +
      '<div><h1 class="page-title">' + esc(b.name) + '</h1>' +
      '<p class="page-sub">' + esc(b.address + ' · ' + b.city) + '</p></div>' +
      '<div class="seg">' + tabs.map(function (t) {
        return '<button type="button" aria-pressed="' + (state.bienTab === t[0]) + '"' + act('bien-tab', { t: t[0] }) + '>' + t[1] + '</button>';
      }).join('') + '</div>' +
    '</div>' + messageCahier() + panel);
}

function bienInfos(pid, b) {
  var inf = state.info[pid] || {};

  var champs = '<div class="card" style="flex:1.2;min-width:min(100%,340px);padding:22px">' +
    '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 4px">Informations du logement</h2>' +
    '<p class="sec-note" style="margin:0 0 14px">Transmises au prestataire dans sa mission, et reprises dans le livret d\'accueil du voyageur.</p>' +
    '<div class="cols" style="gap:14px">' + INFO_FIELDS.map(function (f) {
      var id = 'bf-' + pid + '-' + f.k;
      var heure = f.k === 'checkin' || f.k === 'checkout';
      return '<div style="flex:1;min-width:min(100%,180px)">' +
        '<label class="lab" for="' + id + '">' + f.label + '</label>' +
        '<input class="inp' + (heure ? ' num' : '') + '" id="' + id + '" type="' + (heure ? 'time' : 'text') + '" value="' + esc(inf[f.k] || '') + '"' +
          ' data-fid="' + id + '" data-' + (heure ? 'ch' : 'in') + '="bien-field" data-pid="' + pid + '" data-k="' + f.k + '">' +
        '</div>';
    }).join('') + '</div>' +
    /* Arrivée anticipée : si le ménage finit avant l'heure, le livret du
       voyageur suivant lui annonce que le logement est déjà prêt. */
    '<button type="button" class="switch-row" aria-pressed="' + (inf.early !== false) + '"' +
      act('toggle-early', { pid: pid }) + '>' +
      '<span class="switch"><span class="knob"></span></span>' +
      '<span class="grow"><span class="switch-t">Autoriser l\'arrivée anticipée</span>' +
      '<span class="switch-s">Quand le ménage est terminé avant ' + esc(inf.checkin || '16:00') + ', le voyageur suivant ' +
        'voit « Le logement est prêt ! » dans son livret, avec l\'heure réelle. Jamais avant ' + EARLY_FLOOR + ', ' +
        'et seulement si le ménage a été fait le jour de son arrivée.</span></span>' +
      '</button>' +
    '<div style="margin-top:14px"><label class="lab" for="bn-' + pid + '">Consignes libres pour le prestataire</label>' +
      '<textarea class="inp" id="bn-' + pid + '" data-fid="bn-' + pid + '" data-in="bien-notes" data-pid="' + pid + '">' + esc(state.notes[pid] || '') + '</textarea></div>' +
  '</div>';

  var presta = '<div class="card" style="flex:1;min-width:min(100%,320px);padding:22px">' +
    '<h2 style="font:700 16px Figtree,sans-serif;margin:0">Prestations et tarifs</h2>' +
    '<p class="sec-note" style="margin-top:4px">Le <strong>nom</strong> est commun à tous les biens. ' +
      'La <strong>durée</strong> et le <strong>tarif</strong> sont propres à ce logement : ' +
      'un studio et une villa ne demandent pas le même temps.</p>' +
    '<div style="margin-top:14px">' + (state.services.length ? state.services.map(function (s, si) {
      var nid = 'sv-n-' + s.key, did = 'sv-d-' + pid + '-' + s.key;
      return '<div class="svc-row">' +
        '<div class="svc-fields">' +
          '<div style="flex:2;min-width:150px">' +
            '<label class="lab" for="' + nid + '">Nom (commun)</label>' +
            '<input class="inp" id="' + nid + '" type="text" value="' + esc(s.label) + '" data-fid="' + nid + '" data-in="svc-label" data-k="' + esc(s.key) + '">' +
          '</div>' +
          '<div style="flex:1;min-width:110px">' +
            '<label class="lab" for="' + did + '">Durée ici</label>' +
            '<input class="inp num" id="' + did + '" type="text" placeholder="≈ 2 h" value="' + esc((state.durations[pid] || {})[s.key] || '') + '" data-fid="' + did + '" data-in="svc-duration" data-pid="' + pid + '" data-k="' + esc(s.key) + '">' +
          '</div>' +
        '</div>' +
        '<div class="svc-actions">' +
          '<span class="lab" style="margin:0">Tarif ici</span>' +
          '<div class="stepper">' +
            '<button type="button" aria-label="Baisser le tarif"' + act('tariff', { pid: pid, t: s.key, d: -5 }) + '>−</button>' +
            '<span class="val num" style="min-width:56px">' + (state.tariffs[pid] && state.tariffs[pid][s.key] || 0) + ' €</span>' +
            '<button type="button" aria-label="Monter le tarif"' + act('tariff', { pid: pid, t: s.key, d: 5 }) + '>+</button>' +
          '</div>' +
          '<button type="button" class="btn-danger-xs"' + act('remove-service', { k: s.key, i: si }) + '>Supprimer</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<p class="empty">Aucune prestation. Ajoutez la première ci-dessous.</p>') + '</div>' +
    '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">' +
      '<input class="inp" style="flex:1;min-width:180px" type="text" placeholder="Ex. Nettoyage des vitres" value="' + esc(state.newService) + '" data-fid="new-service" data-in="new-service">' +
      '<button type="button" class="btn btn--dark btn--sm"' + act('add-service') + '>Ajouter</button>' +
    '</div>' +
  '</div>';

  var danger = '<div class="card danger-zone">' +
    '<div class="grow"><div style="font:700 15px Figtree,sans-serif;color:var(--terra-dd)">Supprimer ce bien</div>' +
    '<div class="sec-note" style="color:var(--terra-d)">Le logement, sa checklist, ses stocks, ses réservations, son livret ' +
      'et ses missions non terminées seront effacés. Les missions déjà payées restent dans l\'historique.</div></div>' +
    '<button type="button" class="btn btn--quiet btn--sm" style="flex:none"' + act('remove-bien', { pid: pid }) + '>Supprimer le bien</button>' +
  '</div>';

  return '<div class="cols" style="margin-top:22px">' + champs + presta + '</div>' + danger;
}

function bienChecklist(pid, b) {
  var rs = rooms(pid);
  var totalSteps = rs.reduce(function (n, r) { return n + r.steps.length; }, 0);
  var withPhoto = rs.reduce(function (n, r) { return n + r.steps.filter(function (s) { return s.photo; }).length; }, 0);

  return '<div class="cols" style="margin-top:22px">' +
    '<div style="flex:2;min-width:min(100%,380px);display:flex;flex-direction:column;gap:14px">' +
      (rs.length ? rs.map(function (r, ri) {
        var dkey = pid + ':' + ri;
        return '<div class="card" style="padding:18px 20px">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
            '<span class="dot" style="background:' + b.color + '"></span>' +
            '<span style="font:700 16px Figtree,sans-serif;flex:1;min-width:0">' + esc(r.name) + '</span>' +
            '<span class="num" style="font:600 11.5px Figtree,sans-serif;color:var(--muted)">' + r.steps.length + ' étape(s)</span>' +
            '<button type="button" style="font:600 12px Figtree,sans-serif;color:var(--terra-d);padding:6px 8px;min-height:38px"' +
              act('remove-room', { pid: pid, ri: ri }) + '>Supprimer la pièce</button>' +
          '</div>' +
          '<div style="margin-top:10px">' + r.steps.map(function (s, si) {
            return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(36,30,26,.06)">' +
              '<span class="grow" style="font:500 14px Figtree,sans-serif">' + esc(s.label) + '</span>' +
              '<button type="button" class="badge ' + (s.photo ? 'badge--terra' : '') + '" style="' +
                (s.photo ? '' : 'background:var(--cream);color:var(--muted)') + ';font-weight:600;min-height:38px"' +
                act('toggle-photo', { pid: pid, ri: ri, si: si }) + '>' + (s.photo ? 'Photo requise' : 'Sans photo') + '</button>' +
              '<button type="button" aria-label="Supprimer l\'étape" style="width:32px;height:32px;border-radius:999px;background:var(--cream);color:var(--muted);display:flex;align-items:center;justify-content:center;font:700 14px Figtree,sans-serif;flex:none"' +
                act('remove-step', { pid: pid, ri: ri, si: si }) + '>×</button>' +
              '</div>';
          }).join('') + '</div>' +
          '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">' +
            '<input class="inp" style="flex:1;min-width:200px" type="text" placeholder="Ajouter une étape…" value="' + esc(state.stepDrafts[dkey] || '') + '" data-fid="sd-' + esc(dkey) + '" data-in="step-draft" data-key="' + esc(dkey) + '">' +
            '<button type="button" class="btn btn--dark btn--sm"' + act('add-step', { pid: pid, ri: ri }) + '>Ajouter</button>' +
          '</div></div>';
      }).join('') : '<p class="empty">Aucune pièce. Ajoute la première à droite.</p>') +
    '</div>' +
    '<div class="card" style="flex:1;min-width:min(100%,280px);padding:20px">' +
      '<h2 style="font:700 16px Figtree,sans-serif;margin:0">Ajouter une pièce</h2>' +
      '<p class="sec-note" style="margin-top:4px">La checklist du prestataire suit exactement cet ordre.</p>' +
      '<input class="inp" style="margin-top:14px" type="text" placeholder="Ex. Buanderie" value="' + esc(state.newRoom) + '" data-fid="new-room" data-in="new-room">' +
      '<button type="button" class="btn btn--primary btn--sm" style="margin-top:12px;width:100%"' + act('add-room', { pid: pid }) + '>Ajouter la pièce</button>' +
      '<p class="sec-note" style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(36,30,26,.08)">' +
        rs.length + ' pièces · ' + totalSteps + ' étapes, dont ' + withPhoto + ' avec photo obligatoire.</p>' +
    '</div></div>';
}

/* Les trois mois proposés dans les calendriers : celui en cours et les deux
   suivants. La démonstration n'en connaissait que deux, figés à 2026. */
function moisCalendrier() {
  var out = [], auj = new Date();
  for (var i = 0; i < 3; i++) {
    var m = new Date(auj.getFullYear(), auj.getMonth() + i, 1);
    out.push([isoDate(m).slice(0, 7), moisTitre(m.getMonth() + 1)]);
  }
  return out;
}

/** « Juillet », à partir du numéro du mois. */
function moisTitre(n) {
  var m = MOIS_LONGS[n - 1] || '';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function bienCalendar(pid) {
  var cm = state.calMonth;
  var cy = parseInt(cm.split('-')[0], 10), cmo = parseInt(cm.split('-')[1], 10);
  var first = new Date(Date.UTC(cy, cmo - 1, 1));
  var daysIn = new Date(Date.UTC(cy, cmo, 0)).getUTCDate();
  var lead = (first.getUTCDay() + 6) % 7;
  var resas = resasOf(pid) || [];

  var cells = '';
  for (var i = 0; i < lead; i++) cells += '<div class="cal-cell empty"></div>';
  for (var d = 1; d <= daysIn; d++) {
    var iso = cy + '-' + String(cmo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var r = resas.find(function (x) { return iso >= x.start && iso <= x.end; });
    var isToday = iso === TODAY;
    var cls = 'cal-cell' + (isToday ? ' today' : r ? ' busy' : '');
    var bar = r
      ? '<span class="cal-bar" style="background:' + platCouleurs(r.plat).color +
        ';margin-left:' + (r.start === iso ? '45%' : '0') + ';margin-right:' + (r.end === iso ? '45%' : '0') + '"></span>'
      : '';
    cells += '<div class="' + cls + '"><span class="d num">' + d + '</span>' + bar + '</div>';
  }

  return '<div class="cols" style="margin-top:22px">' +
    '<div class="card" style="flex:1.4;min-width:min(100%,380px);padding:20px 22px">' +
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<h2 style="font:700 18px Figtree,sans-serif;flex:1;margin:0">' + moisTitre(cmo) + ' ' + cy + '</h2>' +
        '<div class="seg">' + moisCalendrier().map(function (m) {
          return '<button type="button" aria-pressed="' + (cm === m[0]) + '"' + act('cal-month', { m: m[0] }) + '>' + m[1] + '</button>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="cal">' +
        ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(function (x) { return '<div class="cal-dow">' + x + '</div>'; }).join('') +
        cells +
      '</div>' +
      '<div class="chiprow" style="margin-top:16px;gap:16px">' + Object.keys(PLATS).map(function (k) {
        return '<span style="display:flex;align-items:center;gap:7px;font:500 12px Figtree,sans-serif;color:var(--muted3)">' +
          '<span style="width:14px;height:6px;border-radius:9px;background:' + PLATS[k].color + '"></span>' + k + '</span>';
      }).join('') + '</div>' +
    '</div>' +
    '<div class="card" style="flex:1;min-width:min(100%,300px);padding:20px 22px">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<h2 style="font:700 16px Figtree,sans-serif;margin:0;flex:1">Réservations</h2>' +
        '<button type="button" class="btn btn--xs" style="' + (state.showNewResa ? 'background:var(--cream);color:var(--ink-soft)' : 'background:var(--terra);color:#fff') + '"' +
          act('toggle-new-resa') + '>' + (state.showNewResa ? 'Fermer' : '+ Ajouter') + '</button>' +
      '</div>' +
      (state.showNewResa ? formNewResa(pid) : '') +
      '<div style="margin-top:10px">' + (resas.length ? resas.map(function (r, ri) {
        var pl = PLATS[r.plat] || PLATS['Direct'];
        return '<div style="padding:12px 0;border-top:1px solid rgba(36,30,26,.07)">' +
          '<div style="display:flex;align-items:center;gap:9px">' +
            '<span style="font:600 14.5px Figtree,sans-serif;flex:1;min-width:0">' + esc(r.guest) + '</span>' +
            '<span class="badge" style="background:' + pl.bg + ';color:' + pl.fg + '">' + esc(r.plat) + '</span>' +
            '<button type="button" aria-label="Supprimer la réservation de ' + esc(r.guest) + '" class="x-btn"' +
              act('remove-resa', { pid: pid, ri: ri }) + '>×</button></div>' +
          '<div class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:3px">' +
            fmtDate(r.start) + ' → ' + fmtDate(r.end) + ' · ' + nights(r.start, r.end) + ' nuits · ' + r.guests + ' voyageurs' +
            (departAt(pid, r) ? ' · départ signalé ' + departAt(pid, r) : '') + '</div>' +
          (avisDone(pid, r, 'sejour') ? '<div style="margin-top:6px">' + starsRead(avisDone(pid, r, 'sejour').stars) + '</div>' : '') +
          '</div>';
      }).join('') : '<p class="empty">Aucune réservation sur ce bien.</p>') + '</div>' +
    '</div></div>' + avisSejour(pid);
}

/* Ce que les voyageurs ont dit de leur séjour dans ce logement. */
function avisSejour(pid) {
  var list = avisOf('sejour', function (v) { return v.pid === pid; }).slice().reverse();
  var moy = list.length
    ? Math.round(list.reduce(function (n, v) { return n + v.stars; }, 0) / list.length * 10) / 10 : null;

  return '<div class="card" style="margin-top:16px;padding:22px">' +
    '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
      '<div class="grow"><h2 style="font:700 16px Figtree,sans-serif;margin:0">Avis sur le séjour</h2>' +
      '<p class="sec-note" style="margin-top:4px">Laissés par les voyageurs à la fin de leur séjour, depuis le livret d\'accueil.</p></div>' +
      (moy !== null ? '<div style="text-align:right;flex:none">' +
        '<div class="serif num" style="font-size:30px;line-height:1;color:var(--amber-t)">' + fmtNote(moy) + '</div>' +
        '<div>' + starsRead(Math.round(moy)) + '</div></div>' : '') +
    '</div>' +
    (list.length ? '<div class="stack" style="gap:10px;margin-top:16px">' + list.map(function (v) {
      return '<div class="avis">' +
        '<div class="avis-top">' + starsRead(v.stars) +
          '<span class="avis-meta num">' + esc((v.guest || 'Voyageur') + ' · ' + v.dateLabel) + '</span></div>' +
        (v.texte ? '<p class="avis-txt">« ' + esc(v.texte) + ' »</p>' : '<p class="avis-txt avis-txt--none">Sans commentaire.</p>') +
        '</div>';
    }).join('') + '</div>' : '<p class="empty" style="padding:20px 0">Aucun avis pour le moment.</p>') +
    '</div>';
}

/* Formulaire de réservation manuelle. À l'enregistrement, une mission de ménage
   est créée automatiquement le jour du départ (même règle que l'iCal — D-06). */
/* `pid` null : le formulaire choisit lui-même son logement. C'est le cas
   quand on crée une réservation depuis le calendrier (session 16), où l'on
   voit les quatre logements côte à côte. */
function formNewResa(pid) {
  var r = state.nr;
  var premier = state.services[0];
  var bien = pid || r.pid || (state.props[0] ? state.props[0].id : '');
  return '<div class="pop" style="margin-top:14px;padding:16px;background:var(--sand);border-radius:16px">' +
    '<div class="cols" style="gap:12px">' +
      (pid ? '' :
        '<div style="flex:1;min-width:min(100%,180px)"><label class="lab" for="nr-pid">Logement</label>' +
          '<select class="inp" id="nr-pid" data-fid="nr-pid" data-ch="nr-pid">' +
            (r.pid ? '' : '<option value="">— à choisir —</option>') +
            state.props.map(function (p) {
              return '<option value="' + esc(p.id) + '"' + (r.pid === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
            }).join('') + '</select></div>') +
      '<div style="flex:1;min-width:min(100%,150px)"><label class="lab" for="nr-plat">Plateforme</label>' +
        '<select class="inp" id="nr-plat" data-fid="nr-plat" data-ch="nr-plat">' + Object.keys(PLATS).map(function (k) {
          return '<option value="' + esc(k) + '"' + (r.plat === k ? ' selected' : '') + '>' + esc(k) + '</option>';
        }).join('') + '</select></div>' +
      '<div style="flex:2;min-width:min(100%,180px)"><label class="lab" for="nr-guest">Nom du voyageur</label>' +
        '<input class="inp" id="nr-guest" type="text" placeholder="Ex. Emma Dufour" value="' + esc(r.guest) + '" data-fid="nr-guest" data-in="nr-guest"></div>' +
      '<div style="flex:1;min-width:min(100%,120px)"><label class="lab" for="nr-guests">Voyageurs</label>' +
        '<input class="inp num" id="nr-guests" type="number" min="1" value="' + esc(r.guests) + '" data-fid="nr-guests" data-in="nr-guests"></div>' +
      '<div style="flex:1;min-width:min(100%,150px)"><label class="lab" for="nr-start">Arrivée</label>' +
        '<input class="inp num" id="nr-start" type="date" value="' + esc(r.start) + '" data-fid="nr-start" data-ch="nr-start"></div>' +
      '<div style="flex:1;min-width:min(100%,150px)"><label class="lab" for="nr-end">Départ</label>' +
        '<input class="inp num" id="nr-end" type="date" value="' + esc(r.end) + '" data-fid="nr-end" data-ch="nr-end"></div>' +
      '<div style="flex:1;min-width:min(100%,150px)"><label class="lab" for="nr-montant">Montant (€)</label>' +
        '<input class="inp num" id="nr-montant" type="number" min="0" placeholder="' +
          (parseInt((state.info[bien] || {}).prixNuit, 10) || 0) + ' € / nuit" value="' + esc(r.montant) +
          '" data-fid="nr-montant" data-in="nr-montant"></div>' +
    '</div>' +
    '<div style="display:flex;gap:10px;align-items:center;margin-top:14px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn--primary btn--sm"' + act('create-resa', { pid: pid || '' }) + '>Enregistrer la réservation</button>' +
      '<span class="sec-note">Une mission « ' + esc(premier ? premier.label : 'ménage') + ' » sera créée automatiquement le jour du départ.</span>' +
    '</div>' +
  '</div>';
}

/* --- Livret d'accueil : édition ------------------------------------------ */

function bienLivret(pid, b) {
  var lv = state.livret[pid] || (state.livret[pid] = lvVide());
  var inf = state.info[pid] || {};
  var sec = LIVRET_SECTIONS.find(function (s) { return s.k === state.livretSection; }) || LIVRET_SECTIONS[0];
  var blocs = lv[sec.k] || [];
  var dkey = pid + ':' + sec.k;
  var dr = state.livretDrafts[dkey] || { titre: '', texte: '', media: '' };

  // Langue en cours d'écriture. En anglais, on ne saisit que les traductions :
  // on ajoute et on organise les blocs en français, puis on les traduit (D-57).
  var en = state.lvEdLang === 'en';
  var suf = en ? 'En' : '';

  var entete = '<div class="card" style="padding:20px 22px">' +
    '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<div class="grow"><h2 style="font:700 16px Figtree,sans-serif;margin:0">Le livret vu par le voyageur</h2>' +
      '<p class="sec-note" style="margin-top:4px">Le code d\'accès, le Wi-Fi et les heures d\'arrivée et de départ ' +
        'sont repris automatiquement de l\'onglet « Infos & tarifs ».</p></div>' +
      '<button type="button" class="btn btn--dark btn--sm" style="flex:none"' +
        act('nav', { path: '#/livret/' + pid }) + '>Ouvrir l\'aperçu</button>' +
    '</div>' +
    '<div class="livret-recap">' +
      [['Arrivée', inf.checkin || '—'], ['Départ', inf.checkout || '—'],
       ['Code d\'accès', inf.code || '—'], ['Wi-Fi', inf.wifi || '—']].map(function (r) {
        return '<div><div class="k">' + r[0] + '</div><div class="v num">' + esc(r[1]) + '</div></div>';
      }).join('') +
    '</div>' +

    /* Choix de la langue que l'on écrit. Tout ce qui est fixe (boutons, titres,
       messages) est déjà traduit : seuls vos propres textes sont ici. */
    '<div class="seg seg--lang" style="margin-top:16px">' + LANGS.map(function (l) {
      return '<button type="button" aria-pressed="' + (state.lvEdLang === l.k) + '"' +
        act('lv-ed-lang', { l: l.k }) + '>' + l.label + '</button>';
    }).join('') + '</div>' +
    (en ? '<p class="sec-note" style="margin-top:8px">Vous écrivez la <strong>version anglaise</strong>. ' +
      'Tout ce que vous laissez vide restera affiché en français — jamais vide. ' +
      'Les boutons et les titres de l\'application sont déjà traduits.</p>' : '') +

    '<div style="margin-top:14px"><label class="lab" for="lv-mot-' + pid + '">' +
      (en ? 'Mot d\'accueil — version anglaise' : 'Mot d\'accueil') + '</label>' +
      (en && lv.mot ? '<p class="lv-src">' + esc(lv.mot) + '</p>' : '') +
      '<textarea class="inp" id="lv-mot-' + pid + '"' +
        (en ? ' placeholder="Welcome! Everything you need for your stay is here."' : '') +
        ' data-fid="lv-mot-' + pid + '" data-in="livret-mot" data-pid="' + pid + '" data-f="mot' + suf + '">' +
        esc(lv['mot' + suf] || '') + '</textarea></div>' +
  '</div>';

  var onglets = '<div class="seg" style="margin-top:18px">' + LIVRET_SECTIONS.map(function (s) {
    var n = (lv[s.k] || []).length;
    return '<button type="button" aria-pressed="' + (state.livretSection === s.k) + '"' +
      act('livret-section', { s: s.k }) + '>' + s.label + (n ? ' · ' + n : '') + '</button>';
  }).join('') + '</div>';

  /* Chaque bloc porte une case à cocher : elle sert à choisir précisément ce
     qui sera recopié vers d'autres logements. */
  var choisis = blocsChoisis(blocs);

  var liste = '<div class="stack" style="margin-top:14px">' + (blocs.length ? blocs.map(function (x, xi) {
    var on = choisis.indexOf(xi) >= 0;
    return '<div class="card livret-bloc' + (on ? ' livret-bloc--on' : '') + '" style="padding:16px 18px">' +
      '<div style="display:flex;align-items:flex-start;gap:12px">' +
        '<button type="button" class="livret-pick" aria-pressed="' + on + '"' +
          ' aria-label="Sélectionner « ' + esc(x.titre) + ' » pour la copie"' +
          act('livret-bloc', { pid: pid, s: sec.k, i: xi }) + '>' +
          '<span class="checkbox-sq' + (on ? ' checkbox-sq--on' : '') + '" style="--accent:' + b.color + '"></span>' +
        '</button>' +
        '<div class="grow">' +
          (en
            /* En anglais, le bloc devient un champ de traduction : le texte
               français reste affiché au-dessus, comme référence. */
            ? '<p class="lv-src">' + esc(x.titre) + '</p>' +
              '<input class="inp" type="text" placeholder="Titre en anglais" value="' + esc(x.titreEn || '') + '"' +
                ' data-fid="lvt-' + xi + '" data-in="livret-trad" data-pid="' + pid + '" data-s="' + esc(sec.k) +
                '" data-i="' + xi + '" data-f="titreEn">' +
              (x.texte ? '<p class="lv-src" style="margin-top:10px">' + esc(x.texte) + '</p>' : '') +
              '<textarea class="inp" placeholder="Explication en anglais"' +
                ' data-fid="lvx-' + xi + '" data-in="livret-trad" data-pid="' + pid + '" data-s="' + esc(sec.k) +
                '" data-i="' + xi + '" data-f="texteEn">' + esc(x.texteEn || '') + '</textarea>'
            : '<div style="font:700 15px Figtree,sans-serif">' + esc(x.titre) + '</div>' +
              '<div style="font:500 13.5px/1.55 Figtree,sans-serif;color:var(--muted3);margin-top:5px;white-space:pre-wrap">' + esc(x.texte) + '</div>') +
          (x.adresse ? '<div class="livret-adresse">📍 ' + esc(x.adresse) + '</div>' : '') +
          (x.media ? '<div class="livret-media-url num">' + esc(x.media) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:4px;flex:none">' +
          '<button type="button" aria-label="Monter" class="x-btn"' + act('livret-move', { pid: pid, s: sec.k, i: xi, d: -1 }) + '>↑</button>' +
          '<button type="button" aria-label="Descendre" class="x-btn"' + act('livret-move', { pid: pid, s: sec.k, i: xi, d: 1 }) + '>↓</button>' +
          '<button type="button" aria-label="Supprimer" class="x-btn"' + act('livret-remove', { pid: pid, s: sec.k, i: xi }) + '>×</button>' +
        '</div>' +
      '</div></div>';
  }).join('') : '<p class="empty">Rien dans cette rubrique pour le moment.</p>') + '</div>';

  var ajout = '<div class="card" style="margin-top:14px;padding:18px 20px">' +
    '<h3 style="font:700 15px Figtree,sans-serif;margin:0">Ajouter dans « ' + sec.label + ' »</h3>' +
    '<p class="sec-note" style="margin-top:3px">' + sec.hint + '</p>' +
    '<div style="margin-top:12px"><label class="lab" for="lvd-t">Titre</label>' +
      '<input class="inp" id="lvd-t" type="text" placeholder="Ex. Comment allumer la télévision" value="' + esc(dr.titre) + '" data-fid="lvd-t" data-in="livret-draft" data-key="' + esc(dkey) + '" data-f="titre"></div>' +
    '<div style="margin-top:12px"><label class="lab" for="lvd-x">Explication</label>' +
      '<textarea class="inp" id="lvd-x" placeholder="Écrivez comme si vous parliez au voyageur." data-fid="lvd-x" data-in="livret-draft" data-key="' + esc(dkey) + '" data-f="texte">' + esc(dr.texte) + '</textarea></div>' +
    '<div style="margin-top:12px"><label class="lab" for="lvd-a">Adresse (facultatif)</label>' +
      '<input class="inp" id="lvd-a" type="text" placeholder="Ex. 12 quai du Port, 13002 Marseille" value="' + esc(dr.adresse || '') + '" data-fid="lvd-a" data-in="livret-draft" data-key="' + esc(dkey) + '" data-f="adresse">' +
      '<p class="sec-note" style="margin-top:5px">Le voyageur pourra l\'ouvrir directement dans son application de plans.</p></div>' +
    '<div style="margin-top:12px"><label class="lab" for="lvd-m">Photo ou vidéo (adresse internet, facultatif)</label>' +
      '<input class="inp" id="lvd-m" type="url" placeholder="https://… (lien YouTube, Google Photos, image…)" value="' + esc(dr.media) + '" data-fid="lvd-m" data-in="livret-draft" data-key="' + esc(dkey) + '" data-f="media"></div>' +
    '<button type="button" class="btn btn--primary btn--sm" style="margin-top:14px"' +
      act('livret-add', { pid: pid, s: sec.k }) + '>Ajouter au livret</button>' +
  '</div>';

  // En mode traduction, on ne propose ni l'ajout ni la copie : on traduit
  // ce qui existe, on ne réorganise pas le livret.
  return '<div style="margin-top:22px">' + entete + onglets + liste +
    (en ? '' : livretCopie(pid, sec, blocs) + ajout) + '</div>';
}

/** Indices des blocs cochés pour la copie. `null` = tous, ce qui évite de
    cocher quatre cases quand on veut simplement tout recopier. */
function blocsChoisis(blocs) {
  if (!Array.isArray(state.livretBlocs)) return blocs.map(function (x, i) { return i; });
  return state.livretBlocs.filter(function (i) { return i < blocs.length; });
}

/* Recopier tout ou partie d'une rubrique vers d'autres logements. Les activités
   et les restaurants d'un quartier valent souvent pour plusieurs biens — mais
   pas toujours tous : on choisit les blocs, puis les logements. */
function livretCopie(pid, sec, blocs) {
  var autres = state.props.filter(function (p) { return p.id !== pid; });
  if (!autres.length) return '';

  var cibles = state.livretCopie || [];
  var choisis = blocsChoisis(blocs);
  var tous = choisis.length === blocs.length;

  if (!blocs.length) {
    return '<div class="card" style="margin-top:14px;padding:18px 20px">' +
      '<h3 style="font:700 15px Figtree,sans-serif;margin:0">Copier vers d\'autres logements</h3>' +
      '<p class="sec-note" style="margin-top:3px">Cette rubrique est vide : ajoutez d\'abord un bloc ci-dessous.</p>' +
      '</div>';
  }

  return '<div class="card" style="margin-top:14px;padding:18px 20px">' +
    '<h3 style="font:700 15px Figtree,sans-serif;margin:0">Copier « ' + esc(sec.label) + ' » vers d\'autres logements</h3>' +
    '<p class="sec-note" style="margin-top:3px">Cochez ci-dessus ce que vous voulez copier, puis les logements ' +
      'qui doivent le recevoir.</p>' +

    '<div class="perm-row" style="border:0;padding:12px 0 0;background:transparent">' +
      '<span class="perm-label">À copier :</span>' +
      '<span class="copie-count' + (choisis.length ? '' : ' copie-count--vide') + '">' +
        choisis.length + ' sur ' + blocs.length + '</span>' +
      '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
        act('livret-blocs-tous', { v: tous ? '0' : '1' }) + '>' +
        (tous ? 'Tout décocher' : 'Tout cocher') + '</button>' +
    '</div>' +

    '<div class="perm-row" style="border:0;padding:12px 0 0;background:transparent">' +
      '<span class="perm-label">Copier vers :</span>' +
      autres.map(function (p) {
        var on = cibles.indexOf(p.id) >= 0;
        return '<button type="button" class="perm-chip" aria-pressed="' + on + '" style="--accent:' + p.color + '"' +
          act('livret-cible', { pid: p.id }) + '>' +
          '<span class="checkbox-sq' + (on ? ' checkbox-sq--on' : '') + '" style="--accent:' + p.color + '"></span>' +
          esc(p.short) + '</button>';
      }).join('') +
    '</div>' +

    '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;align-items:center">' +
      '<button type="button" class="btn btn--dark btn--sm"' +
        act('livret-copie', { pid: pid, s: sec.k, mode: 'ajout' }) + '>Ajouter à la suite</button>' +
      '<button type="button" class="btn btn--sm" style="background:var(--terra-bg);color:var(--terra-dd)"' +
        act('livret-copie', { pid: pid, s: sec.k, mode: 'remplace' }) + '>Remplacer</button>' +
      '<span class="sec-note">« Ajouter » conserve ce qui existe déjà. « Remplacer » efface la rubrique ' +
        'des logements cochés avant d\'y copier votre sélection.</span>' +
    '</div>' +
    '</div>';
}

/* --------------------------------------------------------------------------
   Porte d'entrée du livret : `#/bienvenue`

   Le lien unique collé dans les messages types de toutes les plateformes.
   Trois étapes : on cherche le séjour, on se déclare si on ne l'a pas trouvé,
   puis on laisse ses coordonnées — cette dernière étape restant facultative
   (D-48 : proposée, jamais imposée).
   -------------------------------------------------------------------------- */

function bvCoque(contenu, sousTitre) {
  return '<div class="livret bienvenue">' +
    '<header class="lv-head bv-head">' +
      langSwitch() +
      '<div class="lv-logo">MAISON WARME</div>' +
      '<h1 class="lv-title">' + esc(t('bvBienvenue')) + '</h1>' +
      '<p class="lv-city">' + esc(sousTitre) + '</p>' +
    '</header>' + contenu +
    '<footer class="lv-foot">' + esc(t('bonSejour')) + '</footer>' +
    '</div>';
}

/** Étape 1 : date d'arrivée + 4 derniers chiffres du téléphone. */
function bvRecherche() {
  var b = state.bienvenue;

  return bvCoque(
    '<section class="lv-section">' +
      '<div class="bv-card">' +
        '<h2 class="bv-h">' + esc(t('bvTitre')) + '</h2>' +
        '<p class="bv-p">' + esc(t('bvP')) + '</p>' +

        '<label class="lab" for="bv-date">' + esc(t('bvDate')) + '</label>' +
        '<input class="inp" id="bv-date" type="date" value="' + esc(b.date) + '" ' +
          'data-fid="bv-date" data-ch="bv-date">' +

        /* LE NOM, ET NON PLUS LES 4 CHIFFRES DU TÉLÉPHONE (session 18, D-90).
           Ces 4 chiffres, presque aucune plateforme ne les transmet : personne
           ne pouvait donc se retrouver, et le propriétaire a constaté à juste
           titre qu'« on ne lui demande aucune info ». Le nom, lui, figure
           toujours sur la réservation. */
        '<label class="lab" style="margin-top:14px" for="bv-nom">' + esc(t('bvNomTitre')) + '</label>' +
        '<input class="inp" id="bv-nom" type="text" autocomplete="name" ' +
          'placeholder="' + esc(t('bvNomPh')) + '" value="' + esc(b.nom) + '" data-fid="bv-nom" data-in="bv-nom">' +

        (b.erreur ? '<p class="bv-err">' + esc(b.erreur) + '</p>' : '') +

        '<button type="button" class="btn btn--primary bv-go"' +
          (b.enCours ? ' disabled' : '') + act('bv-chercher') + '>' +
          esc(b.enCours ? t('bvCherche') : t('bvContinuer')) + '</button>' +

        '<button type="button" class="bv-lien"' + act('bv-voieb') + '>' +
          esc(t('bvSaisPas')) + '</button>' +
      '</div>' +
    '</section>', t('bvSous'));
}

/** Étape 1 bis : plusieurs séjours correspondent — cas rare, on fait choisir. */
function bvChoix() {
  var b = state.bienvenue;
  return bvCoque(
    '<section class="lv-section">' +
      '<div class="bv-card">' +
        '<h2 class="bv-h">' + esc(t('bvChoixT')) + '</h2>' +
        '<p class="bv-p">' + esc(t('bvChoixP')) + '</p>' +
        '<div class="stack" style="margin-top:14px">' + b.choix.map(function (x) {
          var p = prop(x.pid);
          return '<button type="button" class="bv-pick" style="--accent:' + p.color + '"' +
            act('bv-prendre', { rid: x.rid }) + '>' +
            '<span class="bv-pick-dot"></span>' +
            '<span class="grow"><span class="bv-pick-n">' + esc(p.name) + '</span>' +
            '<span class="bv-pick-s">' + esc(p.city) + ' · ' + esc(t('bvArriveeLe')) +
              esc(fmtDate(x.start)) + '</span></span>' +
            '<span class="bv-pick-go">→</span></button>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>', t('bvChoixSous'));
}

/** Étape 2 (voie B) : la plateforme n'a transmis aucun numéro — le voyageur
    se déclare, et le propriétaire confirmera (D-47). */
function bvVoieB() {
  var b = state.bienvenue;
  var biens = state.props.filter(function (p) { return !p.gone; });

  return bvCoque(
    '<section class="lv-section">' +
      '<div class="bv-card">' +
        '<h2 class="bv-h">' + esc(t('bvBTitre')) + '</h2>' +
        '<p class="bv-p">' + esc(t('bvBP')) + '</p>' +

        '<label class="lab" for="bv-pid">' + esc(t('bvLogement')) + '</label>' +
        '<select class="inp" id="bv-pid" data-fid="bv-pid" data-ch="bv-pid">' +
          '<option value="">' + esc(t('bvChoisir')) + '</option>' +
          biens.map(function (p) {
            return '<option value="' + esc(p.id) + '"' + (b.pid === p.id ? ' selected' : '') + '>' +
              esc(p.name) + ' · ' + esc(p.city) + '</option>';
          }).join('') +
        '</select>' +

        '<label class="lab" style="margin-top:14px" for="bv-date2">' + esc(t('bvDate')) + '</label>' +
        '<input class="inp" id="bv-date2" type="date" value="' + esc(b.date) + '" ' +
          'data-fid="bv-date2" data-ch="bv-date">' +

        '<label class="lab" style="margin-top:14px" for="bv-nom">' + esc(t('bvNom')) + '</label>' +
        '<input class="inp" id="bv-nom" type="text" placeholder="' + esc(t('bvNomPh')) + '" value="' +
          esc(b.nom) + '" data-fid="bv-nom" data-in="bv-nom">' +

        (b.erreur ? '<p class="bv-err">' + esc(b.erreur) + '</p>' : '') +

        '<button type="button" class="btn btn--primary bv-go"' + act('bv-declarer') + '>' +
          esc(t('bvAcceder')) + '</button>' +

        '<p class="bv-note">' + esc(t('bvBNote')) + '</p>' +

        '<button type="button" class="bv-lien"' + act('bv-retour') + '>' + esc(t('bvJaiMes')) + '</button>' +
      '</div>' +
    '</section>', t('bvBSous'));
}

/** Étape 3 : les coordonnées. Facultative — « Plus tard » ouvre le livret. */
function bvFormulaire() {
  var f = sejourDuPass();
  if (!f) return bvRecherche();
  var p = prop(f.pid), r = f.r, g = state.gform;
  var inf = state.info[f.pid] || {};

  return bvCoque(
    '<section class="lv-section">' +
      '<div class="bv-card">' +
        '<div class="bv-trouve">' + esc(t('bvTrouve')) + '</div>' +
        '<h2 class="bv-h">' + esc(p.name) + '</h2>' +
        '<p class="bv-p">' + esc(t('bvArrivee')) + '<strong>' + esc(fmtDate(r.start)) + '</strong> · ' +
          esc(t('bvDepart')) + '<strong>' + esc(fmtDate(r.end)) + '</strong> · ' +
          esc(String(nights(r.start, r.end))) + esc(t('bvNuits')) +
          (nights(r.start, r.end) > 1 ? 's' : '') + '.</p>' +

        '<p class="bv-p" style="margin-top:14px">' + esc(t('bvInfosP')) + '</p>' +

        '<label class="lab" for="gf-nom">' + esc(t('bvNom')) + '</label>' +
        '<input class="inp" id="gf-nom" type="text" value="' + esc(g.nom) + '" ' +
          'data-fid="gf-nom" data-in="gf" data-k="nom">' +

        '<label class="lab" style="margin-top:12px" for="gf-tel">' + esc(t('bvTelC')) + '</label>' +
        '<input class="inp" id="gf-tel" type="tel" placeholder="06 12 34 56 78" value="' + esc(g.tel) + '" ' +
          'data-fid="gf-tel" data-in="gf" data-k="tel">' +

        '<label class="lab" style="margin-top:12px" for="gf-mail">' + esc(t('bvMail')) + '</label>' +
        '<input class="inp" id="gf-mail" type="email" placeholder="vous@exemple.fr" value="' + esc(g.mail) + '" ' +
          'data-fid="gf-mail" data-in="gf" data-k="mail">' +

        '<div class="cols" style="gap:12px;margin-top:12px">' +
          '<div style="flex:1;min-width:min(100%,140px)">' +
            '<label class="lab" for="gf-nb">' + esc(t('bvCombien')) + '</label>' +
            '<input class="inp num" id="gf-nb" type="number" min="1" max="20" value="' + esc(g.guests) + '" ' +
              'data-fid="gf-nb" data-in="gf" data-k="guests">' +
          '</div>' +
          '<div style="flex:1;min-width:min(100%,140px)">' +
            '<label class="lab" for="gf-h">' + esc(t('bvHeure')) + '</label>' +
            '<input class="inp num" id="gf-h" type="time" value="' + esc(g.arrivee) + '" ' +
              'data-fid="gf-h" data-ch="gf-heure">' +
          '</div>' +
        '</div>' +

        '<p class="bv-note">' + esc(t('bvHeureNote')) + esc(inf.checkin || '16:00') +
          esc(t('bvHeureNote2')) + '</p>' +

        /* Accord explicite et décoché par défaut : sans lui, le propriétaire
           n'a pas le droit de démarcher ce voyageur plus tard (D-56). */
        '<button type="button" class="bv-optin" aria-pressed="' + !!g.optin + '"' +
          act('gf-optin') + '>' +
          '<span class="checkbox-sq' + (g.optin ? ' checkbox-sq--on' : '') +
            '" style="--accent:' + C.vert + '"></span>' +
          '<span class="grow">' + esc(t('bvOptin')) +
            '<span class="bv-optin-s">' + esc(t('bvOptinS')) + '</span></span>' +
        '</button>' +

        '<button type="button" class="btn btn--primary bv-go"' + act('gf-envoyer') + '>' +
          esc(t('bvEnregistrer')) + '</button>' +
        '<button type="button" class="bv-lien"' + act('gf-plus-tard') + '>' +
          esc(t('bvPlusTard')) + '</button>' +
      '</div>' +
    '</section>', t('bvSousTrouve'));
}

/* LE LIEN PERSONNEL (session 16 — D-80)

   Le voyageur ouvre `#/sejour/<identifiant>` : on sait déjà qui il est, quel
   logement, quelles dates. On lui pose son souvenir dans le navigateur —
   exactement comme le faisait `ouvrirSejour()` après vérification des quatre
   chiffres — puis on l'emmène au formulaire, qui n'a plus qu'à être complété.

   Le propriétaire, lui, ne doit pas se voir attribuer un séjour de voyageur
   en cliquant sur le lien depuis son écran : il file directement au livret,
   en aperçu.

   Quand l'identifiant ne correspond à rien — lien tronqué dans un SMS,
   séjour supprimé depuis — on le DIT et on renvoie sur le lien unique, plutôt
   que d'afficher une page vide (règle D-74). */
function viewSejour() {
  var f = resaById(route.id);

  /* SÉJOUR INCONNU SUR CET APPAREIL — c'est le cas NORMAL du voyageur (lot 3,
     session 18). Son téléphone ne contient rien de ce projet : on demande le
     séjour au cahier partagé, et on l'installe. Avant la session 18, on lui
     répondait « ce lien n'est plus valable », ce qui était faux. */
  if (!f && state.auth !== 'owner') {
    var net = state.sejourNet;
    if (!net || net.rid !== route.id) {
      state.sejourNet = { rid: route.id, etat: 'chargement' };
      setTimeout(function () { chargerSejourEnLigne(route.id); }, 0);
      net = state.sejourNet;
    }
    if (net.etat === 'chargement') {
      return bvCoque('<section class="lv-section"><div class="bv-card">' +
        '<h2 class="bv-h">' + esc(t('bvCherche')) + '</h2>' +
        '<p class="bv-p">Nous ouvrons votre livret d’accueil.</p>' +
        '</div></section>', t('bvSous'));
    }
    if (net.etat === 'erreur') {
      return bvCoque('<section class="lv-section"><div class="bv-card">' +
        '<h2 class="bv-h">Impossible d’ouvrir votre livret</h2>' +
        '<p class="bv-p">' + esc(net.msg || '') + '</p>' +
        '<button type="button" class="btn btn--primary bv-go"' +
          act('sejour-reessayer') + '>Réessayer</button>' +
        '</div></section>', t('bvSous'));
    }
    // 'ok' sans réservation lisible ne devrait pas arriver ; 'absent' si.
  }

  if (!f) {
    return bvCoque(
      '<section class="lv-section"><div class="bv-card">' +
        '<h2 class="bv-h">Ce lien n’est plus valable</h2>' +
        '<p class="bv-p">Le séjour auquel il renvoie n’existe plus, ou le lien a été coupé ' +
          'en chemin. Vous pouvez retrouver votre livret avec votre nom et la date de votre ' +
          'arrivée.</p>' +
        '<button type="button" class="btn btn--primary bv-go"' +
          act('nav', { path: '#/bienvenue' }) + '>Retrouver mon livret</button>' +
      '</div></section>', 'Lien introuvable');
  }

  /* Le propriétaire clique le lien qu'il vient de copier : il doit voir
     **exactement** ce que ce voyageur-là verra, dates comprises — et non la
     somme de tout ce que le logement contient (session 17, D-85). */
  if (state.auth === 'owner') {
    state.apercuSejour = f.r.id;
    location.replace('#/livret/' + f.pid);
    return '';
  }
  state.apercuSejour = null;

  /* Le formulaire n'est proposé qu'une fois : au premier passage. Ensuite le
     lien mène droit au livret — un voyageur qui rouvre son lien tous les
     jours n'a pas à repasser par un questionnaire. */
  var g = state.guestPass;
  var dejaVu = g && g.resa === f.r.id;
  if (dejaVu && state.bienvenue.etape !== 'form') { location.replace('#/livret/' + f.pid); return ''; }

  if (!dejaVu) { poserSejour(f); save(); }
  return bvFormulaire();
}

function viewBienvenue() {
  var b = state.bienvenue;
  if (b.etape === 'voieb') return bvVoieB();
  if (b.etape === 'choix' && b.choix && b.choix.length) return bvChoix();
  if (b.etape === 'form') return bvFormulaire();

  // Déjà identifié lors d'une visite précédente : on ne redemande rien.
  var f = sejourDuPass();
  if (f) { location.replace('#/livret/' + f.pid); return ''; }

  return bvRecherche();
}

/* --- Livret d'accueil : page du voyageur --------------------------------- */

/** Bandeau de retour, visible seulement quand le propriétaire regarde l'aperçu. */
function lvBack(path, label) {
  if (state.auth !== 'owner') return '';

  // Aperçu d'un lien personnel : on dit de qui, et ce que ses dates changent
  // (session 17, D-85). Sans cela, le propriétaire croit que le voyageur voit
  // le code d'accès alors qu'il ne le verra qu'à partir de son arrivée.
  var f = state.apercuSejour ? resaById(state.apercuSejour) : null;
  var note = f
    ? 'Aperçu du lien ' + de(f.r.guest) + ' — ' + fmtDate(f.r.start) + ' → ' + fmtDate(f.r.end) + '. ' +
      (dansLesDates(f.r)
        ? 'Séjour en cours : le code d’accès et le Wi-Fi sont visibles.'
        : 'Hors des dates du séjour : le code d’accès et le Wi-Fi restent cachés.')
    : 'Aperçu général — vous voyez tout. Pour savoir ce qu’un voyageur voit vraiment, ouvrez son lien personnel depuis sa réservation.';

  return '<div class="lv-back"><button type="button"' + act('nav', { path: path }) + '>← ' + label + '</button>' +
    '<span>' + esc(note) + '</span></div>';
}

function lvVide() {
  return { mot: '', arrivee: [], questions: [], activites: [], restos: [], depart: [] };
}

/* Accueil du livret : les grandes rubriques, à toucher pour ouvrir le détail. */
function viewLivret() {
  var b = prop(route.id);
  if (b.gone) { location.replace(state.auth === 'owner' ? '#/admin/biens' : '#/login'); return ''; }
  var pid = b.id;
  var lv = state.livret[pid] || lvVide();
  var inf = state.info[pid] || {};

  // L'heure d'arrivée affichée est la vraie : elle avance si le ménage est déjà fait.
  var rd = readyInfo(pid);
  var heureArrivee = rd ? rd.at : (inf.checkin || '');

  // Le code d'accès et le Wi-Fi ne s'affichent qu'en accès complet : il ne faut
  // pas qu'un lien retrouvé ou transféré donne la clé du logement (D-47).
  var ouvert = peutVoirSensible(pid);
  var cles = [[t('checkin'), heureArrivee], [t('checkout'), inf.checkout]]
    .concat(ouvert ? [[t('code'), inf.code], [t('wifi'), inf.wifi]] : [])
    .filter(function (r) { return r[1]; });

  var tuiles = LIVRET_SECTIONS.filter(function (s) { return (lv[s.k] || []).length; }).map(function (s) {
    var n = lv[s.k].length;
    return '<button type="button" class="lv-tile"' + act('nav', { path: '#/livret/' + pid + '/' + s.k }) + '>' +
      '<span class="lv-tile-ico" aria-hidden="true">' + s.icon + '</span>' +
      '<span class="lv-tile-txt"><span class="lv-tile-h">' + esc(secLabel(s)) + '</span>' +
        '<span class="lv-tile-s">' + esc(secHint(s)) + '</span></span>' +
      '<span class="lv-tile-n num">' + n + '</span>' +
      '<span class="lv-tile-go" aria-hidden="true">→</span>' +
      '</button>';
  }).join('');

  var mot = tx(lv, 'mot');

  return '<div class="livret">' + lvBack('#/admin/biens/' + pid, 'Revenir à la fiche du bien') +
    '<header class="lv-head" style="background:' + b.tint + '">' +
      langSwitch() +
      '<div class="lv-logo">MAISON WARME</div>' +
      '<h1 class="lv-title">' + esc(b.name) + '</h1>' +
      '<p class="lv-city">' + esc([b.address, b.city].filter(Boolean).join(', ')) + '</p>' +
      (mot ? '<p class="lv-mot">' + esc(mot) + '</p>' : '') +
    '</header>' +
    (cles.length ? '<div class="lv-keys">' + cles.map(function (r) {
      return '<div class="lv-key"><div class="k">' + r[0] + '</div><div class="v num">' + esc(r[1]) + '</div></div>';
    }).join('') + '</div>' : '') +
    livretAcces(pid) +
    livretVoyageur(pid, inf) +
    (tuiles
      ? '<div class="lv-tiles">' + tuiles + '</div>'
      : '<p class="empty" style="padding:30px 24px">' + esc(t('livretVide')) + '</p>') +
    '<footer class="lv-foot">' + esc(t('bonSejour')) + '</footer>' +
    '</div>';
}

/* Détail d'une rubrique du livret. */
function viewLivretSection() {
  var b = prop(route.id);
  if (b.gone) { location.replace(state.auth === 'owner' ? '#/admin/biens' : '#/login'); return ''; }
  var pid = b.id;
  var lv = state.livret[pid] || lvVide();
  var s = LIVRET_SECTIONS.find(function (x) { return x.k === route.sec; });
  var blocs = lv[s.k] || [];

  return '<div class="livret">' + lvBack('#/admin/biens/' + pid, 'Revenir à la fiche du bien') +
    '<header class="lv-head lv-head--sec" style="background:' + b.tint + '">' +
      langSwitch() +
      '<button type="button" class="lv-return"' + act('nav', { path: '#/livret/' + pid }) + '>' +
        esc(t('retourLivret')) + '</button>' +
      '<div class="lv-sec-ico" aria-hidden="true">' + s.icon + '</div>' +
      '<h1 class="lv-title">' + esc(secLabel(s)) + '</h1>' +
      '<p class="lv-city">' + esc(b.name) + '</p>' +
    '</header>' +
    '<section class="lv-section">' + (blocs.length ? blocs.map(function (x) {
      var titre = tx(x, 'titre'), texte = tx(x, 'texte');
      return '<article class="lv-bloc">' +
        '<h3 class="lv-h3">' + esc(titre) + '</h3>' +
        (texte ? '<p class="lv-p">' + esc(texte) + '</p>' : '') +
        (x.adresse ? '<a class="lv-adresse" href="' + esc(planUrl(x.adresse)) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="lv-adresse-ico" aria-hidden="true">📍</span>' +
          '<span class="grow">' + esc(x.adresse) + '</span>' +
          '<span class="lv-adresse-go">' + esc(t('yAller')) + '</span></a>' : '') +
        (x.media ? '<a class="lv-media" href="' + esc(x.media) + '" target="_blank" rel="noopener noreferrer">' +
          esc(t('voirMedia')) + '</a>' : '') +
        '</article>';
    }).join('') : '<p class="empty">' + esc(t('rubriqueVide')) + '</p>') + '</section>' +
    (s.k === 'depart' ? livretDepart(pid) : '') +
    '<div class="lv-section"><button type="button" class="btn btn--quiet"' +
      act('nav', { path: '#/livret/' + pid }) + '>' + esc(t('revenirLivret')) + '</button></div>' +
    '<footer class="lv-foot">' + esc(t('bonSejour')) + '</footer>' +
    '</div>';
}

/* --------------------------------------------------------------------------
   Ce que le voyageur peut faire depuis son livret : signaler son départ,
   noter le ménage à son arrivée, noter son séjour à la fin.
   -------------------------------------------------------------------------- */

/** Cinq étoiles à toucher. `key` = 'pid:kind', identifiant du brouillon. */
function starsPick(key, n) {
  var out = '';
  for (var i = 1; i <= 5; i++) {
    out += '<button type="button" class="star-btn' + (i <= n ? ' star-btn--on' : '') + '"' +
      ' aria-label="' + i + ' étoile' + (i > 1 ? 's' : '') + '" aria-pressed="' + (i <= n) + '"' +
      act('avis-star', { key: key, n: String(i) }) + '>★</button>';
  }
  return '<div class="star-pick">' + out + '</div>';
}

/** Formulaire de notation : étoiles + commentaire libre. */
function avisForm(pid, kind, titre, sous, placeholder) {
  var key = pid + ':' + kind;
  var dr = state.avisDrafts[key] || { stars: 0, texte: '' };
  return '<div class="lv-card lv-card--rate">' +
    '<h2 class="lv-card-h">' + esc(titre) + '</h2>' +
    '<p class="lv-card-p">' + esc(sous) + '</p>' +
    starsPick(key, dr.stars) +
    '<textarea class="inp" id="av-' + esc(key) + '" placeholder="' + esc(placeholder) + '"' +
      ' data-fid="av-' + esc(key) + '" data-in="avis-texte" data-key="' + esc(key) + '">' + esc(dr.texte) + '</textarea>' +
    '<button type="button" class="btn btn--primary" style="margin-top:12px"' +
      act('avis-send', { pid: pid, kind: kind }) + '>' + esc(t('noteEnvoyer')) + '</button>' +
    '</div>';
}

/** Merci affiché une fois la note envoyée. */
function avisMerci(v, titre) {
  return '<div class="lv-card lv-card--done">' +
    '<h2 class="lv-card-h">' + esc(titre) + '</h2>' +
    starsRead(v.stars) +
    (v.texte ? '<p class="lv-card-p">« ' + esc(v.texte) + ' »</p>' : '') +
    '<p class="lv-card-p" style="margin-top:8px">' + esc(t('noteMerci')) + '</p>' +
    '</div>';
}

/** Le bloc « départ » : rappel et bouton, réutilisé sur la rubrique du même nom. */
function livretDepart(pid) {
  var cur = visiteurLeaving(pid);
  if (!cur) return '';
  var parti = departAt(pid, cur);
  var inf = state.info[pid] || {};

  if (parti) {
    return '<div class="lv-section"><div class="lv-card lv-card--done">' +
      '<h2 class="lv-card-h">' + esc(t('departOk')) + '</h2>' +
      '<p class="lv-card-p">' + esc(t('departOkP1')) + esc(parti) + esc(t('departOkP2')) + '</p>' +
      '</div></div>';
  }
  return '<div class="lv-section"><div class="lv-card lv-card--go">' +
    '<h2 class="lv-card-h">' + esc(t('departTitre')) + '</h2>' +
    '<p class="lv-card-p">' + esc(t('departP')) + esc(inf.checkout || '11:00') + '.</p>' +
    '<button type="button" class="btn btn--primary" style="margin-top:14px"' +
      act('livret-depart', { pid: pid }) + '>' + esc(t('departBtn')) + '</button>' +
    '</div></div>';
}

/* Ce qui remplace le code d'accès et le Wi-Fi quand le visiteur n'a pas
   prouvé qui il est, et le rappel discret quand il a répondu « plus tard ».
   Trois cas, dans cet ordre : pas identifié du tout · identifié mais en
   attente de confirmation · identifié et déjà confirmé. */
function livretAcces(pid) {
  if (state.auth === 'owner') return '';
  var niveau = niveauAcces(pid);

  if (niveau === null) {
    return '<div class="lv-section"><div class="lv-card lv-card--lock">' +
      '<h2 class="lv-card-h">' + esc(t('lockTitre')) + '</h2>' +
      '<p class="lv-card-p">' + esc(t('lockInconnu')) + '</p>' +
      '<button type="button" class="btn btn--primary" style="margin-top:14px"' +
        act('nav', { path: '#/bienvenue' }) + '>' + esc(t('lockBouton')) + '</button>' +
      '</div></div>';
  }

  if (niveau === 'partiel') {
    return '<div class="lv-section"><div class="lv-card lv-card--lock">' +
      '<h2 class="lv-card-h">' + esc(t('lockAttente')) + '</h2>' +
      '<p class="lv-card-p">' + esc(t('lockAttenteP')) + '</p>' +
      '</div></div>';
  }

  var f = sejourDuPass();
  if (!f || f.pid !== pid) return '';

  // Reconnu, mais le séjour n'a pas commencé : le code d'accès n'a pas à
  // circuler des semaines à l'avance (D-51).
  var horsDates = niveau === 'horsdates';
  var bloc = '';
  if (horsDates) {
    bloc = '<div class="lv-section"><div class="lv-card lv-card--lock">' +
      '<h2 class="lv-card-h">' + esc(t('lockTitre')) + '</h2>' +
      // Seul cas possible : le séjour n'a pas encore commencé. Un séjour
      // terminé fait oublier le souvenir (sejourDuPass), donc on n'arrive
      // jamais ici après un départ.
      '<p class="lv-card-p">' + t('lockAvant') + esc(fmtDate(f.r.start)) + esc(t('lockAvant2')) +
      '</p></div></div>';
  }

  // Le formulaire a été remis à plus tard : on relance, sans insister (D-48).
  // Utile surtout avant l'arrivée, quand l'information sert encore à préparer.
  if (!f.r.tel && !f.r.mail && !f.r.arriveePrevue) {
    bloc += '<div class="lv-section"><button type="button" class="lv-relance"' +
      act('gf-ouvrir') + '>' +
      '<span class="grow">' + esc(t('relance')) + '</span>' +
      '<span class="lv-relance-go">→</span></button></div>';
  }
  return bloc;
}

/** Tout ce qui s'adresse personnellement au voyageur, sur l'accueil du livret. */
function livretVoyageur(pid, inf) {
  var out = '';

  // 1. Le ménage est fini avant l'heure : le logement est prêt en avance.
  //    Cela ne concerne que celui qui arrive aujourd'hui, pas les autres.
  var rd = visiteurArriving(pid) ? readyInfo(pid) : null;
  if (rd) {
    out += '<div class="lv-section"><div class="lv-card lv-card--ready">' +
      '<div class="lv-ready-badge">' + esc(t('pretBadge')) + '</div>' +
      '<p class="lv-card-p">' + esc(t('pretP1')) + esc(rd.fin) + esc(t('pretP2')) +
      esc(inf.checkin || '16:00') + esc(t('pretP3')) + '<strong>' + esc(rd.at) + '</strong>.' +
      (rd.plancher ? esc(t('pretPlancher')) + EARLY_FLOOR + '.' : '') + '</p>' +
      '</div></div>';
  }

  // 2. Départ du jour : bouton avant, accusé de réception après.
  out += livretDepart(pid);

  // 3. Note de la propreté, par celui qui occupe le logement.
  var cur = visiteurCurrent(pid);
  if (cur) {
    var aMenage = avisDone(pid, cur, 'menage');
    out += '<div class="lv-section">' + (aMenage
      ? avisMerci(aMenage, t('noteMenageM'))
      : avisForm(pid, 'menage', t('noteMenageT'), t('noteMenageS'), t('noteMenageP'))) + '</div>';
  }

  // 4. Note du séjour, par celui qui s'en va.
  var part = visiteurLeaving(pid);
  if (part) {
    var aSejour = avisDone(pid, part, 'sejour');
    out += '<div class="lv-section">' + (aSejour
      ? avisMerci(aSejour, t('noteSejourM'))
      : avisForm(pid, 'sejour', t('noteSejourT'), t('noteSejourS'), t('noteSejourP'))) + '</div>';
  }

  return out;
}

function bienIcal(pid) {
  // Seulement les liens réellement collés par le propriétaire. La démonstration
  // affichait deux flux « Synchronisé » qui n'existaient pas : trompeur, retiré
  // en session 14. Aucun lien n'est encore relevé — il y faut le serveur (D-42).
  var feeds = (state.extraFeeds[pid] || []).map(function (u) {
    return { cls: 'feed--new', dot: C.bleu, fg: 'var(--blue-t)', source: 'Lien collé', url: u, status: 'En attente du serveur' };
  });

  return '<div class="card" style="margin-top:22px;padding:22px">' +
    '<h2 style="font:700 16px Figtree,sans-serif;margin:0">Liens iCal de ce bien</h2>' +

    /* Honnêteté sur ce que ce panneau fait, et surtout sur ce qu'il ne fait
       pas. Le bouton s'appelait « Connecter » : il ne connectait rien, il
       rangeait une adresse dans un coin. D'où « les liens iCal ne marchent
       pas » — c'était exact, et ce n'était pas une panne (session 15). */
    '<div style="margin-top:12px;background:var(--terra-bg2);border-radius:16px;padding:14px 16px">' +
      '<div style="font:700 13px Figtree,sans-serif;color:var(--terra-dd)">⚠️ Ces liens ne sont pas encore relevés</div>' +
      '<p class="sec-note" style="margin:6px 0 0;color:var(--terra-dd)">Une page web n’a pas le droit ' +
        'd’aller lire un calendrier hébergé chez Airbnb ou Booking.com : c’est une règle de sécurité ' +
        'des navigateurs, et elle ne se contourne pas. Il faut pour cela un ordinateur qui travaille ' +
        'de son côté — le serveur. Tant qu’il n’existe pas, un lien collé ici est <strong>mis de côté ' +
        'et rien de plus</strong> : aucune réservation ne rentrera toute seule, aucune mission de ' +
        'ménage ne se créera. En attendant, les séjours se saisissent dans l’onglet ' +
        '« Réservations ».</p>' +
    '</div>' +

    '<div class="stack" style="margin-top:16px">' + (feeds.length ? feeds.map(function (f, i) {
      return '<div class="feed ' + f.cls + '">' +
        '<span class="dot" style="background:' + f.dot + '"></span>' +
        '<div style="flex:1;min-width:200px"><div style="font:600 13.5px Figtree,sans-serif">' + esc(f.source) + '</div>' +
        '<div class="url">' + esc(f.url) + '</div></div>' +
        '<span style="font:600 12px Figtree,sans-serif;color:' + f.fg + ';flex:none">' + f.status + '</span>' +
        '<button type="button" class="btn btn--xs" style="background:transparent;color:var(--muted);flex:none"' +
          act('del-feed', { pid: pid, i: i }) + '>Retirer</button></div>';
    }).join('') : '<p class="empty">Aucun lien iCal enregistré pour ce logement.</p>') + '</div>' +
    '<div style="margin-top:18px;display:flex;gap:12px;flex-wrap:wrap">' +
      '<input class="inp" style="flex:1;min-width:260px" type="text" placeholder="Coller un lien iCal, pour plus tard…" value="' + esc(state.newFeed) + '" data-fid="new-feed" data-in="new-feed">' +
      '<button type="button" class="btn btn--dark btn--sm"' + act('add-feed', { pid: pid }) + '>Mettre ce lien de côté</button>' +
    '</div>' +
    '<p class="sec-note" style="margin-top:10px">Ces liens restent dans ce navigateur : ils ne partent ' +
      'pas encore dans le cahier partagé.</p>' +
    '</div>' +

    /* Préparation de Beds24 : seulement l'identifiant du logement chez eux.
       La clé secrète n'entre jamais dans cette page (voir D-42). */
    '<div class="card" style="margin-top:16px;padding:22px">' +
      '<h2 style="font:700 16px Figtree,sans-serif;margin:0">Beds24</h2>' +
      '<p class="sec-note" style="margin-top:4px">Beds24 se connecte lui-même à Airbnb, Booking.com et aux autres, ' +
        'et rend une réservation complète : voyageur, montant, statut, messages. ' +
        'Il reste à brancher côté serveur — en attendant, notez ici l’identifiant de ce logement chez eux.</p>' +
      '<div class="cols" style="gap:14px;margin-top:14px">' +
        '<div style="flex:1;min-width:min(100%,220px)">' +
          '<label class="lab" for="b24-' + pid + '">Identifiant du logement (roomId)</label>' +
          '<input class="inp num" id="b24-' + pid + '" type="text" placeholder="Ex. 123456" value="' +
            esc((state.info[pid] || {}).beds24 || '') + '" data-fid="b24-' + pid + '" data-in="bien-field" data-pid="' + pid + '" data-k="beds24">' +
        '</div>' +
        '<div style="flex:1;min-width:min(100%,220px)">' +
          '<span class="lab">État</span>' +
          '<div class="conn" style="margin-top:6px"><div class="conn-top">' +
            '<span class="conn-n">' + ((state.info[pid] || {}).beds24 ? 'Identifiant noté' : 'À renseigner') + '</span>' +
            '<span class="badge badge--amber">Serveur requis</span></div>' +
            '<div class="conn-x">La synchronisation réelle démarrera à la phase serveur, sans ressaisie.</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

/* ==========================================================================
   Écran de connexion
   ========================================================================== */

/* Une seule porte : une adresse e-mail et un mot de passe, vérifiés par le
   cahier partagé. La connexion de démonstration — qui laissait entrer sans
   mot de passe et en choisissant son rôle dans une liste — a été retirée en
   session 14 (D-63) : c'était une porte grande ouverte sur de vraies données. */
function viewLogin() {
  var dispo = typeof DB !== 'undefined' && DB.estDispo();

  return '<div class="login"><div class="login-card">' +
    '<div class="login-logo">MAISON WARME</div>' +
    '<p class="login-sub">Gestion du ménage et des stocks de vos locations courte durée.</p>' +
    (dispo ? '' :
      '<p class="login-err" role="alert">Impossible de joindre le cahier partagé. ' +
        'Vérifie ta connexion internet, puis recharge la page.</p>') +
    '<div class="login-field"><label class="lab" for="lg-mail">E-mail</label>' +
      '<input class="inp" id="lg-mail" type="email" autocomplete="username" inputmode="email" value="' + esc(state.loginEmail) + '" data-fid="lg-mail" data-in="login-email"></div>' +
    '<div class="login-field"><label class="lab" for="lg-pwd">Mot de passe</label>' +
      '<input class="inp" id="lg-pwd" type="password" autocomplete="current-password" value="' + esc(state.loginPwd) + '" data-fid="lg-pwd" data-in="login-pwd"></div>' +
    (state.loginErreur
      ? '<p class="login-err" role="alert">' + esc(state.loginErreur) + '</p>'
      : '') +
    '<button type="button" class="btn btn--primary" style="margin-top:22px"' +
      (state.loginEnCours || !dispo ? ' disabled' : '') + act('login') + '>' +
      (state.loginEnCours ? 'Connexion…' : 'Se connecter') + '</button>' +
    '<p class="login-hint">Pas encore de compte ? Il n\'y a pas d\'inscription libre : ' +
      'le propriétaire envoie un lien d\'invitation à ton adresse e-mail, et c\'est ce lien ' +
      'qui te fait choisir ton mot de passe.</p>' +
    '</div></div>';
}

/* ==========================================================================
   Le lien d'invitation — l'écran où un prestataire choisit son mot de passe
   ==========================================================================
   Trois moments, dans le même écran : on lit l'invitation (à qui est-elle ?),
   la personne choisit un mot de passe, puis son compte reçoit exactement les
   droits que le propriétaire avait cochés sur sa fiche. */

function viewInvitation() {
  var inv = state.inv;

  // Premier passage : on va demander au cahier à qui ce lien est destiné.
  if (inv.token !== route.id) {
    state.inv = {
      token: route.id, email: '', nom: '', etat: 'chargement',
      pwd: '', pwd2: '', erreur: '', enCours: false
    };
    setTimeout(chargerInvitation, 0);
    inv = state.inv;
  }

  var corps;

  if (inv.etat === 'chargement') {
    corps = '<p class="login-sub">Un instant…</p>';

  } else if (inv.etat === 'erreur') {
    corps = '<p class="login-err" role="alert">' + esc(inv.erreur) + '</p>';

  } else if (inv.etat === 'acceptee') {
    corps = '<p class="login-sub">Ce lien a déjà servi : ton compte existe.</p>' +
      '<button type="button" class="btn btn--primary" style="margin-top:18px"' +
      act('nav', { path: '#/login' }) + '>Aller à la connexion</button>';

  } else if (inv.etat === 'expiree') {
    corps = '<p class="login-err" role="alert">Ce lien a expiré (les invitations durent 14 jours). ' +
      'Demande au propriétaire de t\'en envoyer un nouveau.</p>';

  } else if (inv.etat === 'fini') {
    corps = '<p class="login-sub">C\'est fait : ton compte est prêt.</p>' +
      '<button type="button" class="btn btn--primary" style="margin-top:18px"' +
      act('inv-entrer') + '>Entrer dans l\'application</button>';

  } else {
    corps =
      '<p class="login-sub">' + (inv.nom ? esc(inv.nom) + ', b' : 'B') + 'ienvenue. ' +
        'Choisis ton mot de passe : il te servira à chaque fois.</p>' +
      '<div class="login-field"><label class="lab" for="iv-mail">Ton adresse e-mail</label>' +
        '<input class="inp" id="iv-mail" type="email" value="' + esc(inv.email) + '" disabled></div>' +
      '<div class="login-field"><label class="lab" for="iv-pwd">Mot de passe (6 caractères minimum)</label>' +
        '<input class="inp" id="iv-pwd" type="password" autocomplete="new-password" value="' + esc(inv.pwd) + '" data-fid="iv-pwd" data-in="inv-pwd"></div>' +
      '<div class="login-field"><label class="lab" for="iv-pwd2">Le même, pour vérifier</label>' +
        '<input class="inp" id="iv-pwd2" type="password" autocomplete="new-password" value="' + esc(inv.pwd2) + '" data-fid="iv-pwd2" data-in="inv-pwd2"></div>' +
      (inv.erreur ? '<p class="login-err" role="alert">' + esc(inv.erreur) + '</p>' : '') +
      '<button type="button" class="btn btn--primary" style="margin-top:22px"' +
        (inv.enCours ? ' disabled' : '') + act('inv-creer') + '>' +
        (inv.enCours ? 'Création…' : 'Créer mon compte') + '</button>';
  }

  return '<div class="login"><div class="login-card">' +
    '<div class="login-logo">MAISON WARME</div>' + corps + '</div></div>';
}

function chargerInvitation() {
  if (typeof DB === 'undefined' || !DB.estDispo()) {
    state.inv.etat = 'erreur';
    state.inv.erreur = 'Pas de connexion internet : impossible de vérifier ce lien.';
    render();
    return;
  }
  DB.lireInvitation(state.inv.token)
    .then(function (l) {
      state.inv.email = l.email || '';
      state.inv.nom = (l.full_name || '').split(' ')[0] || '';
      state.inv.etat = l.etat;                 // 'valide' | 'acceptee' | 'expiree'
      render();
    })
    .catch(function (e) {
      state.inv.etat = 'erreur';
      state.inv.erreur = DB.messageClair(e);
      render();
    });
}

/* --- L'écran d'un prestataire dont l'accès n'est pas encore ouvert -------- */

function viewPrestaAttente() {
  var p = typeof DB !== 'undefined' && DB.estDispo() ? DB.profil() : null;

  /* Ce que l'application voit vraiment. Sans ces quatre lignes, le
     propriétaire qui a bel et bien coché un logement et le prestataire qui
     ne voit rien n'ont aucun moyen de savoir lequel des deux a raison —
     c'est exactement ce qui s'est produit en session 14. */
  var lignes = [
    ['Compte connecté', (p && p.email) || '—'],
    ['Reconnu comme', p ? (p.role === 'owner' ? 'propriétaire' : 'prestataire') : '—'],
    ['Relié à la fiche', (p && p.legacy_id) ? p.legacy_id : '⚠️ aucune fiche'],
    ['Logements ouverts', p ? ((p.props || []).length + ' logement(s)') : '—']
  ];

  var body =
    '<div class="card" style="padding:26px;text-align:center">' +
      '<div style="font-size:32px;line-height:1">⏳</div>' +
      '<h2 style="font:700 17px Figtree,sans-serif;margin:12px 0 8px">Ton compte est bien créé</h2>' +
      '<p class="page-sub" style="margin:0">Il reste au propriétaire à te confier des logements. ' +
        'Tant que ce n\'est pas fait, il n\'y a rien à afficher ici — et c\'est normal.</p>' +
      '<p class="sec-note" style="margin-top:14px">S\'il t\'en a déjà confié un, demande-lui ' +
        'd\'ouvrir sa rubrique « Prestataires » et de <strong>recharger sa page</strong> : ' +
        'c\'est ce geste qui transmet tes droits. Puis appuie sur « Vérifier à nouveau ».</p>' +
      '<button type="button" class="btn btn--primary btn--sm" style="margin-top:18px"' +
        act('revenir-verifier') + '>Vérifier à nouveau</button>' +
    '</div>' +

    '<article class="card card--flush" style="border-radius:22px;margin-top:14px"><div class="list">' +
      '<div style="font:700 13px Figtree,sans-serif;padding:14px 0 4px">Ce que l\'application voit</div>' +
      lignes.map(function (r) {
        return '<div class="kv" style="padding:12px 0;font-size:14px;min-height:44px;align-items:center">' +
          '<span>' + esc(r[0]) + '</span>' +
          '<span class="num" style="color:var(--muted2);font-size:13px">' + esc(r[1]) + '</span></div>';
      }).join('') +
    '</div></article>' +

    '<button type="button" class="btn btn--sm" style="margin-top:14px;background:var(--fill);color:var(--ink-soft);width:100%"' +
      act('logout') + '>Se déconnecter</button>';

  return prestaShell(prestaHeader('Bonjour', 'Accès en attente'), body, '', { noTabs: true });
}

/* ==========================================================================
   7. Actions
   ========================================================================== */

function take(id) {
  var m = mission(id);
  if (!m || m.status !== 'dispo') return;

  // Avec un vrai compte, c'est la BASE qui attribue la mission : si deux
  // personnes appuient à la même seconde, une seule l'obtient (D-60).
  // On n'écrit donc rien localement avant d'avoir sa réponse.
  if (typeof DB !== 'undefined' && DB.estPrestataireRelie()) {
    state.priseEnCours = id;
    state.mMsg = '';
    render();

    /* Filet de sécurité (session 14, après incident) : le bouton passe à
       « Un instant… » et **perd son action** le temps de la réponse. Si celle-ci
       n'arrive jamais — réseau coupé, cahier muet —, le bouton reste mort et
       la mission devient impossible à prendre. On rend donc la main au bout de
       douze secondes, avec une explication. */
    var minuteur = setTimeout(function () {
      if (state.priseEnCours !== id) return;
      state.priseEnCours = null;
      state.mMsg = 'Le cahier partagé n\'a pas répondu. Vérifie ta connexion, puis réessaie.';
      save();
      render();
    }, 12000);

    DB.prendreMission(id)
      .then(function () {
        clearTimeout(minuteur);
        state.priseEnCours = null;
        m.status = 'prise';
        m.taker = state.me;
        save();
        go('#/app/missions/' + id);
      })
      .catch(function (e) {
        clearTimeout(minuteur);
        state.priseEnCours = null;
        state.mMsg = DB.messageClair(e);
        save();                       // sinon « Un instant… » revient au rechargement
        DB.charger().then(render, render);
      });
    return;
  }

  m.status = 'prise';
  m.taker = state.me;
  save();
  go('#/app/missions/' + id);
}

function start(id) {
  var m = mission(id);
  if (!m) return;
  if (m.date > TODAY) return;
  m.status = 'encours';
  if (!state.draft || state.draft.id !== id) {
    state.draft = { id: id, prop: m.prop, qty: Object.assign({}, state.stock[m.prop]) };
  }
  save();
  if (typeof DB !== 'undefined' && DB.estDispo()) DB.majMission(m);
  go('#/app/missions/' + id + '/checklist');
}

/* --------------------------------------------------------------------------
   Les photos de la checklist — de VRAIES photos depuis la session 15.

   Jusqu'ici, appuyer sur « Photo » ne faisait que cocher l'étape : rien
   n'était pris, rien n'était gardé. C'était le propre de la maquette, et le
   prestataire ne pouvait donc pas fournir la photo pourtant obligatoire.
   Désormais l'appui ouvre l'appareil photo du téléphone.

   Deux précautions, parce qu'une photo de téléphone pèse plusieurs mégaoctets
   et que la mémoire du navigateur est petite (environ 5 Mo en tout) :
     - l'image est **réduite** à 900 pixels de côté et recompressée (≈ 60 Ko) ;
     - si la mémoire est pleine, on le dit au lieu de perdre la photo en
       silence.
   -------------------------------------------------------------------------- */

/** Retrouve la définition d'une étape (pour savoir si elle exige une photo). */
function etapeDe(pid, sid) {
  var trouve = null;
  rooms(pid).forEach(function (r) {
    r.steps.forEach(function (s) { if (s.id === sid) trouve = s; });
  });
  return trouve;
}

/** Réduit une image choisie ou prise par l'appareil photo.
    Rend deux formes de la même image : `url` pour l'afficher tout de suite et
    la garder sur l'appareil, `fichier` pour la déposer dans le casier. */
function reduirePhoto(fichier, quand) {
  var lecteur = new FileReader();
  lecteur.onerror = function () { quand(null, 'La photo n\'a pas pu être lue.'); };
  lecteur.onload = function () {
    var img = new Image();
    img.onerror = function () { quand(null, 'Ce fichier n\'est pas une image.'); };
    img.onload = function () {
      var max = 900;
      var ech = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * ech);
      c.height = Math.round(img.height * ech);
      try {
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var url = c.toDataURL('image/jpeg', 0.55);
        // `toBlob` est asynchrone et peut manquer sur un très vieux navigateur :
        // on rend la photo dans tous les cas, quitte à ne pas pouvoir l'envoyer.
        if (!c.toBlob) { quand({ url: url, image: null }, null); return; }
        c.toBlob(function (b) { quand({ url: url, image: b }, null); }, 'image/jpeg', 0.55);
      } catch (e) {
        quand(null, 'La photo n\'a pas pu être enregistrée sur cet appareil.');
      }
    };
    img.src = lecteur.result;
  };
  lecteur.readAsDataURL(fichier);
}

/* ENVOI DE LA PHOTO DANS LE CASIER PARTAGÉ (lot 2).
   Règle de conception : **l'envoi ne doit jamais gêner le travail en cours.**
   La photo est d'abord enregistrée sur l'appareil — la checklist avance
   aussitôt, même sans réseau — puis déposée dans le casier en arrière-plan.
   Si le dépôt échoue, l'étape reste validée ; seule une pastille indique que
   la photo n'est pas encore partie, et elle repartira à la fin de la mission. */
function envoiPhoto(mid, sid, image) {
  if (!image || typeof DB === 'undefined' || !DB.estDispo() || !DB.profil()) return;
  var cle = mid + ':' + sid;
  state.photosEnvoi[cle] = 'encours';
  DB.envoyerPhoto(mid, sid, image)
    .then(function () {
      state.photosEnvoi[cle] = 'ok';
      save(); render();
    })
    .catch(function (e) {
      state.photosEnvoi[cle] = 'erreur';
      state.mMsg = 'La photo est bien enregistrée sur ton téléphone, mais elle n\'a pas pu être ' +
        'envoyée : ' + DB.messageClair(e) + ' Elle repartira à la fin de la mission.';
      save(); render();
    });
}

/* Deuxième chance, au moment de terminer : tout ce qui n'est pas parti repart.
   C'est le filet pour une mission faite dans un logement sans réseau. */
function renvoyerPhotosManquantes(mid) {
  if (typeof DB === 'undefined' || !DB.estDispo() || !DB.profil()) return Promise.resolve(0);
  var ph = state.photos[mid] || {};
  var aRenvoyer = Object.keys(ph).filter(function (sid) {
    return typeof ph[sid] === 'string' && ph[sid].indexOf('data:') === 0 &&
      state.photosEnvoi[mid + ':' + sid] !== 'ok';
  });
  if (!aRenvoyer.length) return Promise.resolve(0);

  return aRenvoyer.reduce(function (chaine, sid) {
    return chaine.then(function (n) {
      return dataUrlEnImage(ph[sid])
        .then(function (img) { return DB.envoyerPhoto(mid, sid, img); })
        .then(function () { state.photosEnvoi[mid + ':' + sid] = 'ok'; return n + 1; })
        .catch(function () { return n; });
    });
  }, Promise.resolve(0));
}

/** Reconstruit un fichier image à partir de la photo gardée sur l'appareil. */
function dataUrlEnImage(url) {
  return fetch(url).then(function (r) { return r.blob(); });
}

/** Ouvre l'appareil photo (ou la galerie) et enregistre le cliché sur l'étape. */
/* OUVRE L'APPAREIL PHOTO, OU LA GALERIE (session 16)

   Deux changements par rapport à la session 15 :

   1. `capture="environment"` est retiré. Sur un iPhone, cet attribut
      **impose** l'appareil photo : impossible de reprendre une photo déjà
      prise, impossible de finir une mission depuis un ordinateur, et rien ne
      se passe du tout quand le navigateur refuse la caméra. Sans lui, le
      téléphone propose les deux — « Prendre une photo » ou « Photothèque » —
      ce qui est plus permissif, jamais moins.
   2. Le champ n'est retiré du document qu'après lecture du fichier, et un
      `change` sans fichier (l'utilisateur a annulé) efface le message
      d'attente au lieu de le laisser tourner indéfiniment.

   Rend `{ url, image }` : `url` s'affiche et s'enregistre sur l'appareil,
   `image` se dépose dans le casier partagé. */
function choisirPhoto(quand) {
  var champ = document.createElement('input');
  champ.type = 'file';
  champ.accept = 'image/*';
  champ.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(champ);

  var fini = false;
  var nettoyer = function () {
    if (champ.parentNode) champ.parentNode.removeChild(champ);
  };

  champ.addEventListener('change', function () {
    if (fini) return;
    fini = true;
    var f = champ.files && champ.files[0];
    nettoyer();
    if (!f) { state.mMsg = ''; render(); return; }
    state.mMsg = 'Enregistrement de la photo…';
    render();
    reduirePhoto(f, quand);
  });

  // Annulation : aucun `change` n'est envoyé par certains navigateurs.
  champ.addEventListener('cancel', function () {
    if (fini) return;
    fini = true;
    nettoyer();
    state.mMsg = '';
    render();
  });

  champ.click();
}

/* La mémoire du navigateur est petite (environ 5 Mo) et les photos la
   remplissent. Plutôt que de perdre la photo qu'on vient de prendre, on fait
   d'abord de la place : les photos des missions **déjà validées** par le
   propriétaire ne servent plus à rien sur le téléphone du prestataire.
   Rend le nombre de missions libérées. */
function libererPlace(missionEnCours) {
  var n = 0;
  Object.keys(state.photos).forEach(function (mid) {
    if (mid === missionEnCours) return;
    var m = state.missions.find(function (x) { return x.id === mid; });
    // Mission disparue, ou terminée et validée : ses photos ont fait leur travail.
    if (m && !(m.status === 'termine' && m.review === 'valide')) return;
    delete state.photos[mid];
    Object.keys(state.photosEnvoi).forEach(function (k) {
      if (k.indexOf(mid + ':') === 0) delete state.photosEnvoi[k];
    });
    n++;
  });
  return n;
}

function prendrePhoto(mid, sid) {
  choisirPhoto(function (res, err) {
    if (err) { state.mMsg = err; render(); return; }
    var ph = state.photos[mid] || {};
    ph[sid] = res.url;
    state.photos[mid] = ph;
    flash = mid + sid;

    var ecrit = save();
    // Mémoire pleine : on fait de la place et on retente, une fois.
    if (!ecrit && libererPlace(mid)) ecrit = save();

    if (ecrit) {
      state.mMsg = '';
      envoiPhoto(mid, sid, res.image);      // dépôt dans le casier, en arrière-plan
    } else {
      delete ph[sid];
      state.mMsg = 'La mémoire de ce téléphone est pleine : la photo n\'a pas pu être gardée. ' +
        'Supprime une photo déjà prise sur cette mission, puis réessaie.';
    }
    render();
    setTimeout(function () { flash = null; }, 700);
  });
}

function shoot(mid, sid) {
  var m = mission(mid);
  if (!m) return;
  var ph = state.photos[mid] || {};
  var etape = etapeDe(m.prop, sid);

  // Une étape sans photo obligatoire reste une simple case à cocher.
  if (!etape || !etape.photo) {
    ph[sid] = !ph[sid];
    state.photos[mid] = ph;
    flash = ph[sid] ? mid + sid : null;
    save();
    render();
    if (flash) setTimeout(function () { flash = null; }, 700);
    return;
  }

  prendrePhoto(mid, sid);
}

/** Retire la photo d'une étape : l'étape redevient à faire. */
function retirerPhoto(mid, sid) {
  var ph = state.photos[mid] || {};
  delete ph[sid];
  state.photos[mid] = ph;
  delete state.photosEnvoi[mid + ':' + sid];
  state.mMsg = '';
  save();
  render();
  // Le casier suit : une photo retirée ici ne doit pas rester chez le propriétaire.
  if (typeof DB !== 'undefined' && DB.estDispo() && DB.profil()) DB.supprimerPhoto(mid, sid);
}

function bump(key, delta) {
  if (!state.draft) return;
  var q = state.draft.qty;
  q[key] = Math.max(0, (q[key] || 0) + delta);
  save();
}

function finish(id) {
  var d = state.draft, m = mission(id);
  if (!d || !m || d.id !== id) return;
  var lowKeys = arts().filter(function (a) { return (d.qty[a.key] || 0) <= state.seuils[a.key]; })
    .map(function (a) { return a.key; });
  var photos = photoCount(m);
  var ph = state.photos[id] || {};

  /* La date de la mission, et pas celle du jour. Deux lignes de la maquette
     étaient restées figées au « 30 juil. », et le mois de paie était pris sur
     l'horloge : un ménage fait le 30 juillet apparaissait donc en août, avec
     une étiquette qui disait juillet. Corrigé en session 15. */
  var quand = fmtDate(m.date);
  var moisDePaie = moisDe(m.date);

  // Compte rendu figé : la checklist du bien peut être modifiée ensuite,
  // la revue du propriétaire doit rester le reflet de ce qui a été fait.
  state.reports[id] = {
    agent: state.me,
    dateLabel: quand,
    price: m.price,
    photos: photos,
    rooms: rooms(m.prop).map(function (r) {
      return {
        name: r.name,
        // `id` est nouveau (session 15) : sans lui, le propriétaire ne peut pas
        // retrouver la photo de l'étape dans le casier partagé. Les comptes
        // rendus antérieurs n'en ont pas — leur revue reste telle qu'avant.
        steps: r.steps.map(function (s) { return { id: s.id, label: s.label, photo: s.photo, done: !!ph[s.id] }; })
      };
    }),
    qty: Object.assign({}, d.qty),
    lows: lowKeys,
    /* L'HEURE DE FIN VOYAGE AVEC LE COMPTE RENDU (session 19, audit du
       stockage). Elle n'était écrite que dans `state.ready`, c'est-à-dire
       **sur ce téléphone-ci**. Ni le propriétaire ni le voyageur ne l'ont
       donc jamais vue — et c'est elle qui décide de l'arrivée anticipée.
       Le compte rendu part déjà dans le cahier : elle n'avait qu'à y monter. */
    fini: nowHM()
  };
  // Les signalements faits pendant la mission voyagent avec son compte rendu
  // (session 16) : les écraser ici les ferait disparaître chez le propriétaire.
  verserProblemes(id);

  state.stock[d.prop] = Object.assign({}, d.qty);
  m.status = 'termine';
  m.review = null;
  m.redo = '';

  // Logement prêt : si c'est avant l'heure d'arrivée prévue et que le bien
  // l'autorise, le voyageur suivant le verra dans son livret d'accueil.
  state.ready[m.prop] = { date: m.date, at: state.reports[id].fini, mid: id, agent: state.me };
  if (!m.taker) m.taker = state.me;
  state.done.push({ mid: id, agent: state.me, month: moisDePaie, prop: m.prop, type: m.type, dateLabel: quand, price: m.price });
  state.lastDone = { price: m.price, photos: photos, low: lowKeys.length };
  state.draft = null;
  save();

  /* Deuxième chance pour les photos (lot 2) : celles qui n'ont pas pu partir
     — logement sans réseau, coupure — repartent maintenant. On n'attend pas
     la réponse pour afficher l'écran de fin : le prestataire a terminé, il n'a
     pas à patienter devant un sablier. Le compte rendu, lui, part ensuite,
     avec le nombre de photos réellement déposées. */
  renvoyerPhotosManquantes(id).then(function (n) {
    if (n) { save(); render(); }
    if (typeof DB !== 'undefined' && DB.estDispo()) DB.majMission(m);
  });

  /* LE RELEVÉ DE STOCK, LUI AUSSI (session 19, audit du stockage). Il partait
     déjà **dans le compte rendu**, et le propriétaire le lisait dans la revue
     de la mission — mais l'inventaire courant, celui de la rubrique Stocks,
     n'était mis à jour que sur l'appareil où la mission avait été terminée.
     Les deux écrans divergeaient sans que rien ne le signale.
     `pousser()` étant réservé au propriétaire, c'est ici, sur le téléphone de
     la personne qui a compté, que l'inventaire doit partir. */
  if (typeof DB !== 'undefined' && DB.estDispo()) DB.enregistrerStock(d.prop, d.qty);

  go('#/app/missions/' + id + '/fin');
}

function editRooms(pid, fn) {
  var list = rooms(pid).map(function (r) { return { name: r.name, steps: r.steps.slice() }; });
  state.checklists[pid] = fn(list);
  save();
}

var actions = {
  /* Navigation ---------------------------------------------------------- */
  nav: function (el) { go(el.dataset.path); },
  'back-list': function () { go(state.auth === 'presta' ? '#/app/missions' : '#/admin'); },
  'open-mission': function (el) { go('#/app/missions/' + el.dataset.id); },
  'open-bien': function (el) {
    state.bienTab = 'infos';
    state.livretBlocs = null;
    state.livretCopie = [];
    save();
    go('#/admin/biens/' + el.dataset.id);
  },

  /* Connexion ------------------------------------------------------------ */
  login: function () {
    // Il n'y a plus de repli : sans cahier partagé, sans adresse ou sans mot
    // de passe, on n'entre pas. C'est tout l'objet de la session 14 (D-63).
    if (typeof DB === 'undefined' || !DB.estDispo()) {
      state.loginErreur = 'Pas de connexion au cahier partagé : impossible de vérifier ton mot de passe.';
      render(); return;
    }
    if (!state.loginEmail.trim() || !state.loginPwd) {
      state.loginErreur = 'Il faut ton adresse e-mail et ton mot de passe.';
      render(); return;
    }
    state.loginErreur = '';
    state.loginEnCours = true;
    render();
    DB.connexion(state.loginEmail.trim(), state.loginPwd)
      .then(function (p) {
        state.loginEnCours = false;
        if (!p) throw new Error('Compte introuvable.');
        return DB.charger().then(function () { return p; });
      })
      .then(function (p) {
        entrerAvecProfil(p);
      })
      .catch(function (e) {
        state.loginEnCours = false;
        state.loginErreur = DB.messageClair(e);
        render();
      });
  },

  /* Le prestataire invité choisit son mot de passe : création du compte, puis
     réclamation des droits inscrits dans l'invitation. Les deux gestes sont
     enchaînés — si le second échoue, le compte existe mais ne voit rien, et
     l'écran d'attente le dira plutôt que de laisser croire à une panne. */
  'inv-creer': function () {
    var inv = state.inv;
    if (inv.pwd.length < 6) { inv.erreur = 'Le mot de passe doit faire au moins 6 caractères.'; render(); return; }
    if (inv.pwd !== inv.pwd2) { inv.erreur = 'Les deux mots de passe ne sont pas identiques.'; render(); return; }
    inv.erreur = '';
    inv.enCours = true;
    render();
    DB.inscription(inv.email, inv.pwd)
      .then(function () { return DB.accepterInvitation(inv.token); })
      .then(function () { return DB.charger(); })
      .then(function () {
        state.inv.enCours = false;
        state.inv.etat = 'fini';
        state.inv.pwd = '';
        state.inv.pwd2 = '';
        render();
      })
      .catch(function (e) {
        state.inv.enCours = false;
        state.inv.erreur = DB.messageClair(e);
        render();
      });
  },
  /* « Vérifier à nouveau », depuis l'écran d'attente : on relit la fiche du
     compte et le cahier, puis on redessine. Si le propriétaire vient d'ouvrir
     un logement, l'écran bascule sur les missions tout seul. */
  'revenir-verifier': function () {
    state.mMsg = 'Vérification…';
    render();
    DB.relireProfil()
      .then(function (p) {
        if (!p) throw new Error('La session a expiré : reconnecte-toi.');
        state.me = DB.identifiantDeCompte(p);
        return DB.charger();
      })
      .then(function () {
        state.mMsg = accesOuvert() ? '' : 'Toujours aucun logement confié pour le moment.';
        save();
        location.replace(homePath());
        render();
      })
      .catch(function (e) {
        state.mMsg = DB.messageClair(e);
        render();
      });
  },

  /* « ⟳ » — le même geste, mais depuis n'importe quel écran du prestataire
     (session 19). Il relit les droits AVANT les données : c'est le compte qui
     décide de ce que le cahier laisse voir, et c'est justement lui qui a
     changé quand le propriétaire coche un logement. On dit toujours ce qu'on
     a trouvé, même quand c'est « rien de neuf » : un bouton qui ne répond
     rien passe pour un bouton en panne. */
  'presta-actualiser': function () {
    if (state.majEnCours) return;
    state.majEnCours = true;
    var avant = dispoForMe().length;
    var avantOuverts = allowedProps(state.me).length;
    render();
    DB.rafraichir()
      .then(function () {
        state.majEnCours = false;
        var apres = dispoForMe().length;
        var apresOuverts = allowedProps(state.me).length;
        state.mMsg = apresOuverts > avantOuverts
          ? '✅ ' + (apresOuverts - avantOuverts) + ' nouveau(x) logement(s) t\'ont été confiés.'
          : apres > avant
            ? '✅ ' + (apres - avant) + ' nouvelle(s) mission(s).'
            : apresOuverts
              ? 'À jour : ' + apres + ' mission(s) à prendre sur ' + apresOuverts + ' logement(s).'
              : 'Aucun logement ne t\'est encore confié.';
        save();
        location.replace(homePath());
        render();
      })
      .catch(function (e) {
        state.majEnCours = false;
        state.mMsg = DB.messageClair(e);
        render();
      });
  },
  'inv-entrer': function () {
    var p = DB.profil();
    state.loginEmail = state.inv.email;
    state.inv = { token: '', email: '', nom: '', etat: '', pwd: '', pwd2: '', erreur: '', enCours: false };
    if (p) entrerAvecProfil(p);
    else go('#/login');
  },
  logout: function () {
    state.auth = null;
    state.me = null;
    state.draft = null;
    state.loginPwd = '';
    state.loginErreur = '';
    if (typeof DB !== 'undefined' && DB.estDispo()) { DB.taire(); DB.deconnexion(); }
    save();
    location.replace('#/login');
    render();
  },

  /* Inviter un prestataire (§19.8, D-63). Le lien apparaît aussitôt à l'écran :
     c'est le propriétaire qui l'envoie, par le moyen qu'il veut. Aucun e-mail
     n'est expédié par l'application — elle n'a pas de serveur pour cela. */
  /* Recopier dans le compte les logements et prestations cochés sur la fiche.
     Se fait normalement tout seul à chaque enregistrement ; ce bouton existe
     parce qu'un échec silencieux ressemble, pour le propriétaire, à « j'ai
     confié un bien et il ne voit toujours rien ». */
  /* Confier d'un geste les logements que personne n'a (session 20, D-109).
     Deux moitiés, et il faut les deux : cocher le logement sur la FICHE, puis
     recopier la liste dans le COMPTE — c'est le compte que la base regarde
     (règle 10 du §6). Faire la première sans la seconde, c'est exactement
     l'écart que « Renvoyer ses droits » sert à rattraper. */
  'confier-a-tous': function () {
    var orphelins = biensNonConfies().map(function (p) { return p.id; });
    if (!orphelins.length) return;
    var menagers = state.agents.filter(function (a) { return a.kind !== 'cles'; });
    if (!menagers.length) return;

    menagers.forEach(function (a) {
      if (!Array.isArray(a.props)) a.props = [];
      orphelins.forEach(function (pid) {
        if (a.props.indexOf(pid) < 0) a.props.push(pid);
      });
    });
    save();

    // Sans cahier partagé (usage hors ligne), la fiche suffit : on le dit.
    if (typeof DB === 'undefined' || !DB.estDispo() || !DB.profil()) {
      state.migMsg = '✅ Logement(s) confié(s) sur la fiche. Ils partiront dans le cahier ' +
        'partagé à la prochaine connexion.';
      render();
      return;
    }

    state.migMsg = 'Ouverture des droits…';
    render();
    DB.majComptesLies()
      .then(function (ok) {
        if (!ok) throw new Error(DB.erreur() || 'L\'envoi a échoué.');
        return DB.charger();
      })
      .then(function () {
        state.migMsg = '✅ C\'est fait. Sur son téléphone, il lui suffit d\'appuyer sur ' +
          '« Vérifier à nouveau », ou de recharger la page : les missions de ce logement ' +
          'apparaîtront.';
        save();
        render();
      })
      .catch(function (e) {
        state.migMsg = '⚠️ ' + DB.messageClair(e);
        render();
      });
  },

  'renvoyer-droits': function () {
    state.migMsg = 'Envoi en cours…';
    render();
    DB.majComptesLies()
      .then(function (ok) {
        if (!ok) throw new Error(DB.erreur() || 'L\'envoi a échoué.');
        return DB.charger();
      })
      .then(function () {
        state.migMsg = '✅ Droits renvoyés. Sur son téléphone, il lui suffit d\'appuyer sur ' +
          '« Vérifier à nouveau », ou de recharger la page.';
        save();
        render();
      })
      .catch(function (e) {
        state.migMsg = '⚠️ ' + DB.messageClair(e);
        render();
      });
  },
  inviter: function (el) {
    var a = agent(el.dataset.ag);
    state.migMsg = '';
    DB.creerInvitation(a)
      .then(function (token) {
        if (!state.invitLien) state.invitLien = {};
        state.invitLien[a.id] = lienInvitation(token);
        save();
        return relireInvitations();
      })
      .catch(function (e) {
        state.migMsg = '⚠️ ' + DB.messageClair(e);
        render();
      });
  },
  'copier-lien': function (el) {
    var url = el.dataset.url;
    var dit = function (m) { state.migMsg = m; render(); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(function () { dit('✅ Lien copié. Colle-le dans un SMS ou un mail.'); })
        .catch(function () { dit('Le lien est affiché ci-dessus : sélectionne-le et copie-le à la main.'); });
    } else {
      dit('Le lien est affiché ci-dessus : sélectionne-le et copie-le à la main.');
    }
  },
  /* Le message tout prêt à envoyer au voyageur avec son lien personnel
     (session 16). Même repli que « Copier le lien ». */
  'copier-message-sejour': function (el) {
    var f = resaById(el.dataset.rid);
    if (!f) return;
    var texte = texteSejour(f.pid, f.r);
    var dit = function (m) { state.migMsg = m; render(); };
    var replier = function () {
      dit('Le presse-papiers a été refusé : le message s\'affiche, copie-le à la main.');
      prompt('Sélectionne ce message et copie-le :', texte);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texte).then(function () {
        dit('✅ Message copié, lien personnel compris. Colle-le dans un SMS, un WhatsApp ou un mail.');
      }, replier);
    } else {
      replier();
    }
  },

  /* Le message tout prêt du lien unique, celui qu'on colle dans les messages
     automatiques des plateformes (session 19). */
  'copier-message-bienvenue': function () {
    copier(texteBienvenue(),
      '✅ Message copié. Colle-le dans le message automatique d\'Airbnb ou de Booking.');
  },

  /* Le message d'accompagnement, lien compris. Même repli que « Copier le
     lien » : si le navigateur refuse le presse-papiers, on montre le texte
     plutôt que de laisser le bouton sans effet (leçon de la session 8). */
  'copier-message': function (el) {
    var a = agent(el.dataset.ag);
    var texte = inviteTexte(a, el.dataset.url);
    var dit = function (m) { state.migMsg = m; render(); };
    var replier = function () {
      dit('Le presse-papiers a été refusé : le message s\'affiche, copie-le à la main.');
      prompt('Sélectionne ce message et copie-le :', texte);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texte).then(function () {
        dit('✅ Message copié, lien compris. Colle-le dans un SMS, un WhatsApp ou un mail.');
      }, replier);
    } else {
      replier();
    }
  },
  'annuler-invit': function (el) {
    var id = el.dataset.ag, tk = el.dataset.tk;
    if (!confirm('Annuler cette invitation ? Le lien déjà envoyé cessera de fonctionner.')) return;
    if (state.invitLien) delete state.invitLien[id];
    save();
    if (!tk) { render(); return; }
    DB.annulerInvitation(tk)
      .then(relireInvitations)
      .catch(function (e) { state.migMsg = '⚠️ ' + DB.messageClair(e); render(); });
  },

  /* Relier une fiche de prestataire à un compte Supabase (§19.8).
     C'est ce geste qui ouvre réellement ses logements : la base ne regarde
     que le compte, jamais la fiche. */
  'lier-compte': function (el) {
    var id = el.dataset.ag;
    var uid = state.lienCompte && state.lienCompte[id];
    var a = agent(id);
    if (!uid || !a) return;
    state.migMsg = '';
    DB.lierCompte(uid, a)
      .then(function () { return DB.charger(); })
      .then(function () {
        if (state.lienCompte) delete state.lienCompte[id];
        save(); render();
      })
      .catch(function (e) {
        state.migMsg = '⚠️ ' + DB.messageClair(e);
        render();
      });
  },

  'delier-compte': function (el) {
    var a = agent(el.dataset.ag);
    if (!a || !a.uid) return;
    if (!confirm('Détacher le compte de ' + a.name + ' ?\n\n' +
      'Cette personne ne pourra plus se connecter à MAISON WARME. ' +
      'Sa fiche, ses missions et son historique de paie sont conservés. ' +
      'Le compte lui-même n\'est pas supprimé : tu pourras le relier à nouveau.')) return;
    DB.delierCompte(a.uid)
      .then(function () { return DB.charger(); })
      .then(function () { save(); render(); })
      .catch(function (e) {
        state.migMsg = '⚠️ ' + DB.messageClair(e);
        render();
      });
  },

  /* Reconstruit les missions de ménage manquantes à partir des réservations.
     Une mission de départ se déduit entièrement du séjour : logement, date,
     créneau, tarif, turnover. On ne recrée que les départs à venir — faire
     réapparaître en « disponible » des ménages déjà faits n'aurait aucun sens
     (l'historique de paie, lui, n'est pas touché). */
  'refaire-missions': function () {
    var cree = 0;
    state.props.forEach(function (p) {
      resasOf(p.id).forEach(function (r) {
        if (r.statut === 'annule' || r.end < TODAY) return;
        if (missionDuDepart(p.id, r)) return;
        if (creerMissionDepart(p.id, r)) cree++;
      });
    });
    state.migMsg = cree
      ? '✅ ' + cree + ' mission(s) de ménage recréée(s) à partir de tes réservations.'
      : 'Rien à recréer : chaque départ à venir a déjà sa mission.';
    save();
    render();
  },

  /* Le déménagement : envoie une première fois dans le grand cahier tout ce
     que contient ce navigateur. Réservé au propriétaire (§19.6). */
  demenager: function () {
    if (typeof DB === 'undefined' || !DB.estDispo()) {
      state.migMsg = 'Le grand cahier ne répond pas : vérifie la connexion internet.';
      render(); return;
    }
    state.migEnCours = true;
    state.migMsg = '';
    render();
    DB.demenager()
      .then(function (b) {
        state.migEnCours = false;
        state.migMsg = '✅ Déménagement terminé : ' + b.biens + ' logement(s), ' +
          b.resas + ' réservation(s) et ' + b.missions + ' mission(s) sont dans le cahier partagé.';
        render();
      })
      .catch(function (e) {
        state.migEnCours = false;
        state.migMsg = '⚠️ ' + DB.messageClair(e);
        render();
      });
  },
  /* Repartir de zéro : jeter les logements de démonstration. Deux gestes en
     un — vider le cahier partagé, puis vider ce navigateur. L'ordre compte :
     si on vidait d'abord le navigateur, la lecture suivante du cahier
     rapporterait aussitôt tout ce qu'on vient d'effacer. */
  'vider-tout': function () {
    if (!confirm('Effacer TOUS les logements, réservations et missions ?\n\n' +
      'C\'est ce qu\'il faut faire une fois, pour jeter les logements de démonstration. ' +
      'Cela efface aussi le cahier partagé, pour tout le monde. Rien ne pourra être récupéré.')) return;
    if (!confirm('Dernière vérification : tu es sur le point de tout effacer et de repartir d\'une page blanche. On y va ?')) return;

    state.migMsg = '';
    var suite = (typeof DB !== 'undefined' && DB.estDispo() && DB.profil())
      ? DB.viderDonnees()
      : Promise.resolve(0);

    suite
      .then(function () {
        viderTout();
        state.migMsg = '✅ Tout est effacé. Crée maintenant ton premier logement dans « Biens & connexions ».';
        location.replace('#/admin/biens');
        render();
      })
      .catch(function (e) {
        state.migMsg = '⚠️ ' + DB.messageClair(e) + ' — rien n\'a été effacé.';
        render();
      });
  },

  /* Prestataire ---------------------------------------------------------- */
  'fermer-msg': function () { state.mMsg = ''; render(); },

  /* Le bandeau rouge du propriétaire : renvoyer tout, et DIRE ce qui se passe.
     C'est le seul endroit d'où l'on peut relancer une écriture refusée. */
  'reessayer-envoi': function () {
    state.migMsg = 'Nouvel essai en cours…';
    render();
    DB.pousserMaintenant().then(function (bilan) {
      state.migMsg = bilan && bilan.ok
        ? '✅ C\'est parti dans le cahier partagé : ' + bilan.biens + ' logement(s), ' +
          bilan.resas + ' séjour(s), ' + bilan.missions + ' mission(s).'
        : '⚠️ Refusé à nouveau : ' + ((bilan && bilan.erreur) || DB.erreur() || 'raison inconnue');
      render();
    });
  },
  take: function (el) { take(el.dataset.id); },
  start: function (el) { start(el.dataset.id); },
  resume: function (el) { start(el.dataset.id); },
  shoot: function (el) { shoot(el.dataset.mid, el.dataset.sid); },
  unshoot: function (el) { retirerPhoto(el.dataset.mid, el.dataset.sid); },
  bump: function (el) { bump(el.dataset.k, parseInt(el.dataset.d, 10)); render(); },
  finish: function (el) { finish(el.dataset.id); },
  'm-stock-group': function (el) { state.mStockGroup = el.dataset.g; save(); render(); },
  'toggle-gain': function (el) {
    state.openGainMonth = state.openGainMonth === el.dataset.m ? null : el.dataset.m;
    save(); render();
  },
  'problem-kind': function (el) { state.problemKind = el.dataset.k; save(); render(); },

  /* Une VRAIE photo, comme celles de la checklist (session 16) : l'appui
     ouvre l'appareil photo au lieu d'allumer un mot. */
  'problem-photo': function () {
    choisirPhoto(function (res, err) {
      if (err) { state.mMsg = err; render(); return; }
      var avant = state.problemPhoto;
      state.problemPhoto = res.url;
      if (save()) { state.mMsg = ''; }
      else {
        state.problemPhoto = avant;
        state.mMsg = 'La mémoire de ce téléphone est pleine : la photo n\'a pas pu être gardée. ' +
          'Envoie ton commentaire sans photo, ou termine une mission déjà faite.';
      }
      render();
    });
  },
  'problem-photo-off': function () { state.problemPhoto = ''; state.mMsg = ''; save(); render(); },

  'send-problem': function (el) {
    var m = mission(el.dataset.id);
    if (!m) return;
    state.problems.push({
      id: 'pb_' + Date.now().toString(36) + jeton(4),
      kind: state.problemKind,
      texte: (state.problemTexte || '').trim(),
      photo: state.problemPhoto || '',
      agent: state.me,
      mission: m.id,
      prop: m.prop,
      date: m.date,
      at: nowHM(),
      statut: 'ouvert'
    });
    state.problemKind = null;
    state.problemTexte = '';
    state.problemPhoto = '';
    state.mMsg = '';
    if (!save()) {
      state.mMsg = 'La mémoire de ce téléphone est pleine : le signalement n\'a pas pu être ' +
        'enregistré. Retire la photo et réessaie.';
      render();
      return;
    }
    /* Le signalement voyage avec le compte rendu de la mission : c'est lui
       que le propriétaire relit. On pousse donc la mission dans la foulée. */
    verserProblemes(m.id);
    save();
    if (typeof DB !== 'undefined' && DB.estDispo() && DB.profil()) DB.majMission(m);
    go('#/app/missions/' + m.id + '/checklist');
  },

  /* Une photo en grand, par-dessus l'écran (session 16). Ce n'est pas une
     donnée : elle n'est pas enregistrée, et `load()` la referme. */
  'photo-plein': function (el) { state.photoPlein = el.dataset.p; render(); },
  'photo-fermer': function () { state.photoPlein = null; render(); },

  /* Propriétaire --------------------------------------------------------- */
  'mission-filter': function (el) { state.missionFilter = el.dataset.f; save(); render(); },
  /* « Marquer comme traité » — le bouton du propriétaire (corrigé en
     session 19). Il ne cherchait que dans `state.problems`, c'est-à-dire dans
     la liste du prestataire qui a saisi le signalement : sur l'écran du
     propriétaire, il ne trouvait donc **jamais rien** et ne faisait
     strictement rien. Et quand bien même : la marque serait restée sur son
     ordinateur. On modifie maintenant la copie qui vit dans le compte rendu
     de la mission — celle qui voyage — et on renvoie la mission. */
  'probleme-statut': function (el) {
    var id = el.dataset.id;
    var mid = null;

    /* ON RASSEMBLE AVANT DE MODIFIER. Sur le téléphone du prestataire, la
       fiche de `state.problems` et celle du compte rendu sont **le même
       objet** (`verserProblemes()` recopie les références) : deux boucles
       successives inverseraient le statut deux fois, et le bouton
       n'aurait l'air de ne rien faire. On dédoublonne par identité. */
    var cibles = [];
    var ajouter = function (p) { if (p && p.id === id && cibles.indexOf(p) < 0) cibles.push(p); };

    (state.problems || []).forEach(ajouter);
    Object.keys(state.reports || {}).forEach(function (k) {
      ((state.reports[k] || {}).problemes || []).forEach(function (p) {
        if (p && p.id === id) mid = k;
        ajouter(p);
      });
    });

    if (!cibles.length) return;
    var nouveau = cibles[0].statut === 'traite' ? 'ouvert' : 'traite';
    cibles.forEach(function (p) { p.statut = nouveau; });

    save(); render();

    var m = mid ? mission(mid) : null;
    if (m && typeof DB !== 'undefined' && DB.estDispo() && DB.profil()) DB.majMission(m);
  },

  /* SUPPRIMER UNE MISSION (session 16).
     Elle manquait tout simplement : une mission créée par erreur, ou dont le
     séjour est annulé, ne pouvait plus être retirée. On prévient de ce qu'on
     emporte avec elle — le compte rendu, les photos, la ligne de paie — et
     on le dit au cahier partagé, sans quoi elle reviendrait à la première
     relecture. */
  'remove-mission': function (el) {
    var m = mission(el.dataset.id);
    if (!m) return;
    var d = decorate(m);
    var paye = state.done.some(function (x) { return x.mid === m.id; });

    var avertir = 'Supprimer la mission « ' + service(m.type).label + ' » du ' + d.dateLabel +
      ' à ' + prop(m.prop).name + ' ?\n\n';
    if (m.status === 'prise' || m.status === 'encours') {
      avertir += '⚠️ ' + agent(m.taker).name + ' l\'a prise : elle disparaîtra de son téléphone.\n\n';
    }
    if (m.status === 'termine') {
      avertir += '⚠️ Elle est terminée : son compte rendu, ses photos' +
        (paye ? ' et sa ligne de rémunération' : '') + ' seront effacés.\n\n';
    }
    avertir += 'Cette suppression est définitive.';
    if (!confirm(avertir)) return;

    state.missions = state.missions.filter(function (x) { return x.id !== m.id; });
    delete state.reports[m.id];
    delete state.photos[m.id];
    Object.keys(state.photosEnvoi).forEach(function (k) {
      if (k.indexOf(m.id + ':') === 0) delete state.photosEnvoi[k];
    });
    // La ligne de paie suit la mission : la garder ferait payer un travail
    // dont il ne reste aucune trace.
    state.done = state.done.filter(function (x) { return x.mid !== m.id; });
    state.problems = state.problems.filter(function (p) { return p.mission !== m.id; });
    if (state.draft && state.draft.id === m.id) state.draft = null;
    if (state.ready[m.prop] && state.ready[m.prop].mid === m.id) delete state.ready[m.prop];
    save();

    if (typeof DB !== 'undefined' && DB.estDispo() && DB.profil()) {
      DB.supprimerMission(m.id).then(function (ok) {
        if (!ok) {
          state.migMsg = '⚠️ La mission est retirée de cet ordinateur, mais le cahier partagé l\'a ' +
            'refusée : ' + (DB.erreur() || 'raison inconnue') + '. Elle risque de revenir.';
          render();
        }
      });
    }
    go('#/admin/missions');
  },
  'toggle-new': function () { state.showNew = !state.showNew; save(); render(); },
  'create-mission': function () {
    var nm = state.nm;
    if (!state.props.length) { alert('Créez d\'abord un bien.'); return; }
    if (!nm.date) { alert('Choisis une date pour la mission.'); return; }
    state.missions.push({
      id: 'x' + Date.now(), prop: nm.prop, type: nm.type, date: nm.date,
      dateLabel: nm.date === TODAY ? 'Aujourd’hui' : fmtDate(nm.date),
      windowLabel: nm.window, price: nm.price, status: 'dispo',
      urgent: 'Mission créée à la main', note: (nm.note || '').trim()
    });
    state.missions.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    state.nm.note = '';
    state.showNew = false;
    save(); render();
  },
  'validate-mission': function (el) {
    var m = mission(el.dataset.id);
    if (!m) return;
    m.review = 'valide';
    save(); render();
  },
  'ask-redo': function (el) {
    var m = mission(el.dataset.id);
    if (!m) return;
    if (!confirm('Demander une reprise de cette mission ?\n\nElle repart dans les missions disponibles, ' +
      'les photos déjà envoyées sont effacées et le montant est retiré des gains du prestataire ' +
      'tant que la mission n\'est pas refaite.')) return;

    m.status = 'dispo';
    m.taker = null;
    m.review = null;
    m.redo = 'Reprise demandée par le propriétaire';
    delete state.photos[m.id];
    // La mission n'est plus terminée : elle sort du registre de paie.
    state.done = state.done.filter(function (r) { return r.mid !== m.id; });
    save();
    go('#/admin/missions');
  },
  'owner-month': function (el) { state.ownerMonth = el.dataset.m; save(); render(); },
  'toggle-agent': function (el) {
    state.openAgent = state.openAgent === el.dataset.ag ? null : el.dataset.ag;
    save(); render();
  },
  /* Les réglages d'un prestataire — logements, prestations, compte relié —
     ne se touchent qu'à l'embauche : ils sont repliés (session 19). */
  'toggle-reglages': function (el) {
    state.openReglages = state.openReglages === el.dataset.ag ? null : el.dataset.ag;
    save(); render();
  },
  'stock-tab': function (el) { state.stockTab = el.dataset.t; save(); render(); },
  'stock-group': function (el) { state.stockGroup = el.dataset.g; save(); render(); },
  'toggle-scope': function () { state.stockScope = state.stockScope === 'low' ? 'all' : 'low'; save(); render(); },
  seuil: function (el) {
    var k = el.dataset.k, d = parseInt(el.dataset.d, 10);
    state.seuils[k] = Math.max(0, state.seuils[k] + d);
    save(); render();
  },
  tariff: function (el) {
    var pid = el.dataset.pid, t = el.dataset.t, d = parseInt(el.dataset.d, 10);
    state.tariffs[pid][t] = Math.max(0, state.tariffs[pid][t] + d);
    save(); render();
  },
  'bien-tab': function (el) { state.bienTab = el.dataset.t; save(); render(); },
  'cal-month': function (el) { state.calMonth = el.dataset.m; save(); render(); },
  'add-room': function (el) {
    var n = (state.newRoom || '').trim();
    if (!n) return;
    editRooms(el.dataset.pid, function (rs) { return rs.concat([{ name: n, steps: [] }]); });
    state.newRoom = '';
    save(); render();
  },
  'remove-room': function (el) {
    var ri = parseInt(el.dataset.ri, 10);
    editRooms(el.dataset.pid, function (rs) { return rs.filter(function (x, i) { return i !== ri; }); });
    render();
  },
  'add-step': function (el) {
    var pid = el.dataset.pid, ri = parseInt(el.dataset.ri, 10);
    var key = pid + ':' + ri;
    var txt = (state.stepDrafts[key] || '').trim();
    if (!txt) return;
    editRooms(pid, function (rs) {
      rs[ri] = { name: rs[ri].name, steps: rs[ri].steps.concat([{ id: 'n' + Date.now(), label: txt, photo: true }]) };
      return rs;
    });
    state.stepDrafts[key] = '';
    save(); render();
  },
  'remove-step': function (el) {
    var ri = parseInt(el.dataset.ri, 10), si = parseInt(el.dataset.si, 10);
    editRooms(el.dataset.pid, function (rs) {
      rs[ri] = { name: rs[ri].name, steps: rs[ri].steps.filter(function (x, i) { return i !== si; }) };
      return rs;
    });
    render();
  },
  'toggle-photo': function (el) {
    var ri = parseInt(el.dataset.ri, 10), si = parseInt(el.dataset.si, 10);
    editRooms(el.dataset.pid, function (rs) {
      var steps = rs[ri].steps.slice();
      steps[si] = Object.assign({}, steps[si], { photo: !steps[si].photo });
      rs[ri] = { name: rs[ri].name, steps: steps };
      return rs;
    });
    render();
  },
  'add-feed': function (el) {
    var u = (state.newFeed || '').trim();
    if (!u) return;
    var pid = el.dataset.pid;
    state.extraFeeds[pid] = (state.extraFeeds[pid] || []).concat([u]);
    state.newFeed = '';
    save(); render();
  },
  'del-feed': function (el) {
    var pid = el.dataset.pid, i = parseInt(el.dataset.i, 10);
    state.extraFeeds[pid] = (state.extraFeeds[pid] || []).filter(function (_, k) { return k !== i; });
    save(); render();
  },

  /* Biens : création et suppression ------------------------------------- */
  'toggle-new-bien': function () { state.showNewBien = !state.showNewBien; save(); render(); },
  'nb-color': function (el) { state.nb.color = el.dataset.c; save(); render(); },
  'create-bien': function () {
    var nb = state.nb, nom = (nb.name || '').trim();
    if (!nom) { alert('Donnez un nom au logement.'); return; }
    var pal = PALETTE.find(function (c) { return c.color === nb.color; }) || PALETTE[0];
    var pid = slug(nom, 'b');

    state.props.push({
      id: pid, name: nom, short: shortName(nom), city: (nb.city || '').trim(),
      address: (nb.address || '').trim(), color: pal.color, tint: pal.tint
    });
    // Un bien neuf part avec des stocks à zéro, les tarifs de la première prestation,
    // une checklist vide et un livret vierge : tout se règle depuis sa fiche.
    state.stock[pid] = {};
    state.articles.forEach(function (a) { state.stock[pid][a.key] = 0; });
    state.tariffs[pid] = {};
    state.durations[pid] = {};
    state.services.forEach(function (s) {
      state.tariffs[pid][s.key] = 0;
      state.durations[pid][s.key] = s.duration || '';
    });
    state.checklists[pid] = checklistModele();
    state.info[pid] = { capacity: '', surface: '', code: '', wifi: '', parking: '', linge: '', checkin: '16:00', checkout: '11:00', early: true };
    state.notes[pid] = '';
    state.resas[pid] = [];
    state.livret[pid] = livretModele((nb.city || '').trim());

    state.nb = { name: '', city: '', address: '', color: C.terracotta };
    state.showNewBien = false;
    state.bienTab = 'infos';
    save();

    /* Un logement neuf part TOUT DE SUITE dans le cahier partagé, et on dit ce
       qui s'est passé. Auparavant l'envoi était différé de huit dixièmes de
       seconde : si le cahier se relisait entre-temps, le logement à peine créé
       était effacé de l'écran — « j'ai voulu ajouter un bien, ça n'a pas
       marché ». Et si le cahier refusait l'écriture, personne ne l'apprenait.
       Deux causes, un seul remède : écrire maintenant, et le dire. */
    if (typeof DB !== 'undefined' && DB.estDispo() && DB.profil()) {
      state.migMsg = 'Enregistrement de « ' + nom + ' » dans le cahier partagé…';
      DB.pousserMaintenant().then(function (bilan) {
        state.migMsg = bilan && bilan.ok
          ? '✅ « ' + nom + ' » est enregistré dans le cahier partagé.'
          : 'Le logement est bien créé sur cet ordinateur, mais le cahier partagé l\'a refusé : ' +
            (DB.erreur() || 'raison inconnue') + '. Il repartira à la prochaine modification.';
        render();
      });
    }
    go('#/admin/biens/' + pid);
  },
  'remove-bien': function (el) {
    var pid = el.dataset.pid, p = prop(pid);
    if (!confirm('Supprimer « ' + p.name + ' » ?\n\nSa checklist, ses stocks, ses réservations, son livret ' +
      'et ses missions non terminées seront effacés. Les missions déjà payées restent dans l\'historique.')) return;

    state.props = state.props.filter(function (x) { return x.id !== pid; });
    state.missions = state.missions.filter(function (m) { return m.prop !== pid || m.status === 'termine'; });
    state.agents.forEach(function (a) {
      a.props = (a.props || []).filter(function (x) { return x !== pid; });
    });
    [state.stock, state.tariffs, state.durations, state.checklists, state.info, state.notes,
     state.resas, state.livret, state.extraFeeds, state.ready].forEach(function (o) { delete o[pid]; });
    // Départs signalés et avis de ce logement : ils n'ont plus d'objet.
    Object.keys(state.departs).forEach(function (k) {
      if (k.indexOf(pid + ':') === 0) delete state.departs[k];
    });
    state.avis = state.avis.filter(function (v) { return v.pid !== pid; });
    if (Array.isArray(state.coursesProps)) {
      state.coursesProps = state.coursesProps.filter(function (x) { return x !== pid; });
    }
    if (state.nm.prop === pid) state.nm.prop = state.props.length ? state.props[0].id : '';
    if (state.nr.pid === pid) state.nr.pid = '';
    save();

    /* Le cahier partagé aussi (session 16) : sans cela le logement revenait à
       la première relecture, avec ses séjours et ses missions (que la base
       efface d'elle-même, `on delete cascade`). */
    if (typeof DB !== 'undefined' && DB.estDispo() && DB.profil()) {
      DB.supprimerBien(pid).then(function (ok) {
        if (!ok) {
          state.migMsg = '⚠️ Le logement est retiré de cet ordinateur, mais le cahier partagé l\'a ' +
            'refusé : ' + (DB.erreur() || 'raison inconnue') + '. Il risque de revenir.';
          render();
        }
      });
    }
    go('#/admin/biens');
  },

  /* Prestations communes -------------------------------------------------- */
  'add-service': function () {
    var nom = (state.newService || '').trim();
    if (!nom) return;
    var key = slug(nom, 's');
    state.services.push({ key: key, label: nom, duration: '' });
    state.props.forEach(function (p) {
      state.tariffs[p.id] = state.tariffs[p.id] || {};
      state.tariffs[p.id][key] = 0;
      state.durations[p.id] = state.durations[p.id] || {};
      state.durations[p.id][key] = '';
    });
    state.newService = '';
    save(); render();
  },
  'remove-service': function (el) {
    var k = el.dataset.k, s = service(k);
    if (state.services.length <= 1) { alert('Gardez au moins une prestation.'); return; }
    if (!confirm('Supprimer la prestation « ' + s.label + ' » ?\n\nElle disparaît de tous les biens. ' +
      'Les missions existantes gardent leur libellé.')) return;
    state.services = state.services.filter(function (x) { return x.key !== k; });
    if (state.nm.type === k) state.nm.type = state.services[0].key;
    save(); render();
  },

  /* Réservations manuelles ------------------------------------------------ */
  'toggle-new-resa': function () {
    state.showNewResa = !state.showNewResa;
    // Ouvert depuis le calendrier, le formulaire part du premier logement
    // affiché et du premier jour montré : on corrige plutôt qu'on ne saisit.
    if (state.showNewResa && !state.nr.pid) {
      var vus = planPropIds();
      state.nr.pid = vus[0] || (state.props[0] ? state.props[0].id : '');
    }
    if (state.showNewResa && !state.nr.start) state.nr.start = TODAY;
    save(); render();
  },
  /* Calendrier, réservations, messages, statistiques ---------------------- */
  'plan-move': function (el) {
    state.planStart = jourPlus(state.planStart, parseInt(el.dataset.j, 10) || 0);
    save(); render();
  },
  'plan-today': function () { state.planStart = jourPlus(TODAY, -3); save(); render(); },
  'plan-prop': function (el) {
    var pid = el.dataset.pid;
    var l = Array.isArray(state.planProps) ? state.planProps.slice() : state.props.map(function (p) { return p.id; });
    l = l.indexOf(pid) >= 0 ? l.filter(function (x) { return x !== pid; }) : l.concat([pid]);
    // Tout décocher revient à tout afficher : un planning vide n'apprend rien.
    state.planProps = l.length ? l : null;
    save(); render();
  },
  'open-resa': function (el) { go('#/admin/reservations/' + el.dataset.rid); },
  'resa-montant-auto': function (el) {
    var f = resaById(el.dataset.rid);
    if (f) { f.r.montant = null; save(); render(); }
  },
  'resa-remove': function (el) {
    var f = resaById(el.dataset.rid);
    if (!f) return;
    if (!confirm('Supprimer la réservation de ' + f.r.guest + ' ?\n\nLa mission créée à son départ, ' +
      'si elle n\'a pas encore été prise, sera retirée elle aussi.')) return;
    retirerResa(f.pid, f.r);
    save();
    go('#/admin/calendrier');
  },
  'msg-filter': function (el) { state.msgFilter = el.dataset.f; save(); render(); },

  /* Messages programmés --------------------------------------------------- */
  'auto-new': function () {
    state.am = { id: '', nom: '', quand: 'avant_arrivee', decalage: 3, heure: '10:00', props: [], texte: '', actif: true };
    save(); render();
  },
  'auto-cancel': function () { state.am = null; save(); render(); },
  'auto-modele': function (el) {
    var m = MODELES_AUTO[parseInt(el.dataset.mi, 10)];
    if (!m) return;
    state.am = { id: '', nom: m.nom, quand: m.quand, decalage: m.decalage, heure: m.heure, props: [], texte: m.texte, actif: true };
    save(); render();
  },
  'auto-prop': function (el) {
    if (!state.am) return;
    var pid = el.dataset.pid;
    if (pid === 'tous') { state.am.props = []; save(); render(); return; }
    var l = state.am.props;
    state.am.props = l.indexOf(pid) >= 0 ? l.filter(function (x) { return x !== pid; }) : l.concat([pid]);
    save(); render();
  },
  'auto-save': function () {
    var a = state.am;
    if (!a) return;
    if (!(a.nom || '').trim()) { alert('Donnez un nom à ce message, pour le retrouver.'); return; }
    if (!(a.texte || '').trim()) { alert('Écrivez le message à envoyer.'); return; }
    var regle = {
      id: a.id || slug(a.nom, 'am'), nom: a.nom.trim(), quand: a.quand,
      decalage: Math.max(0, parseInt(a.decalage, 10) || 0), heure: a.heure || '10:00',
      props: a.props.slice(), texte: a.texte, actif: a.actif !== false
    };
    var i = state.autoMsgs.findIndex(function (x) { return x.id === regle.id; });
    if (i >= 0) state.autoMsgs[i] = regle; else state.autoMsgs.push(regle);
    state.am = null;
    save(); render();
  },
  'auto-edit': function (el) {
    var rg = state.autoMsgs.find(function (x) { return x.id === el.dataset.rid; });
    if (!rg) return;
    state.am = clone(rg);
    save(); render();
  },
  'auto-toggle': function (el) {
    var rg = state.autoMsgs.find(function (x) { return x.id === el.dataset.rid; });
    if (rg) { rg.actif = !rg.actif; save(); render(); }
  },
  'auto-remove': function (el) {
    var rg = state.autoMsgs.find(function (x) { return x.id === el.dataset.rid; });
    if (!rg || !confirm('Supprimer le message « ' + rg.nom + ' » ?')) return;
    state.autoMsgs = state.autoMsgs.filter(function (x) { return x.id !== rg.id; });
    if (state.am && state.am.id === rg.id) state.am = null;
    save(); render();
  },

  'create-resa': function (el) { createResa(el.dataset.pid); },
  'remove-resa': function (el) {
    var pid = el.dataset.pid, ri = parseInt(el.dataset.ri, 10);
    var r = resasOf(pid)[ri];
    if (!r) return;
    if (!confirm('Supprimer la réservation de ' + r.guest + ' ?\n\nLa mission créée à son départ, ' +
      'si elle n\'a pas encore été prise, sera retirée elle aussi.')) return;
    retirerResa(pid, r);
    save(); render();
  },

  /* Livret d'accueil ------------------------------------------------------ */
  /* La sélection de blocs repose sur leur rang : dès que la liste bouge —
     changement de rubrique, ajout, suppression, déplacement — on repart de
     « tout coché » plutôt que de garder des rangs devenus faux. */
  'lv-ed-lang': function (el) { state.lvEdLang = el.dataset.l === 'en' ? 'en' : 'fr'; save(); render(); },
  'livret-section': function (el) {
    state.livretSection = el.dataset.s;
    state.livretBlocs = null;
    save(); render();
  },
  'livret-add': function (el) {
    var pid = el.dataset.pid, s = el.dataset.s, key = pid + ':' + s;
    var d = state.livretDrafts[key] || {};
    var titre = (d.titre || '').trim();
    if (!titre) { alert('Donnez un titre à ce bloc.'); return; }
    var lv = state.livret[pid] || (state.livret[pid] = lvVide());
    lv[s] = (lv[s] || []).concat([{
      titre: titre,
      texte: (d.texte || '').trim(),
      adresse: (d.adresse || '').trim(),
      media: (d.media || '').trim()
    }]);
    state.livretDrafts[key] = { titre: '', texte: '', adresse: '', media: '' };
    state.livretBlocs = null;
    save(); render();
  },
  'livret-remove': function (el) {
    var pid = el.dataset.pid, s = el.dataset.s, i = parseInt(el.dataset.i, 10);
    var lv = state.livret[pid];
    if (!lv || !lv[s]) return;
    lv[s] = lv[s].filter(function (x, xi) { return xi !== i; });
    state.livretBlocs = null;
    save(); render();
  },
  'livret-move': function (el) {
    var pid = el.dataset.pid, s = el.dataset.s;
    var i = parseInt(el.dataset.i, 10), d = parseInt(el.dataset.d, 10);
    var lv = state.livret[pid];
    if (!lv || !lv[s]) return;
    var list = lv[s].slice(), j = i + d;
    if (j < 0 || j >= list.length) return;
    var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    lv[s] = list;
    state.livretBlocs = null;
    save(); render();
  },

  /* Recopie d'une rubrique de livret vers d'autres logements --------------- */

  /* Coche ou décoche un bloc pour la copie. Tant que rien n'a été touché,
     `livretBlocs` vaut null et tout est considéré comme coché. */
  'livret-bloc': function (el) {
    var lv = state.livret[el.dataset.pid] || lvVide();
    var total = (lv[el.dataset.s] || []).length;
    var i = parseInt(el.dataset.i, 10);
    var list = Array.isArray(state.livretBlocs)
      ? state.livretBlocs.slice()
      : lv[el.dataset.s].map(function (x, xi) { return xi; });
    var j = list.indexOf(i);
    if (j >= 0) list.splice(j, 1); else list.push(i);
    state.livretBlocs = list.filter(function (x) { return x < total; }).sort(function (a, b) { return a - b; });
    save(); render();
  },
  'livret-blocs-tous': function (el) {
    if (el.dataset.v === '1') state.livretBlocs = null;   // null = tous
    else state.livretBlocs = [];
    save(); render();
  },

  'livret-cible': function (el) {
    var pid = el.dataset.pid;
    var list = (state.livretCopie || []).slice();
    var i = list.indexOf(pid);
    if (i >= 0) list.splice(i, 1); else list.push(pid);
    state.livretCopie = list;
    save(); render();
  },
  'livret-copie': function (el) {
    var pid = el.dataset.pid, s = el.dataset.s, mode = el.dataset.mode;
    var cibles = (state.livretCopie || []).filter(function (x) { return x !== pid && !prop(x).gone; });
    if (!cibles.length) { alert('Cochez d\'abord les logements vers lesquels copier.'); return; }

    var tous = (state.livret[pid] || lvVide())[s] || [];
    if (!tous.length) return;

    // Seuls les blocs cochés partent : on ne copie pas forcément tout.
    var indices = blocsChoisis(tous);
    if (!indices.length) { alert('Cochez d\'abord ce que vous voulez copier.'); return; }
    var source = indices.map(function (i) { return tous[i]; });

    var sec = LIVRET_SECTIONS.find(function (x) { return x.k === s; });
    var noms = cibles.map(function (x) { return prop(x).name; }).join(', ');
    var quoi = source.length + ' bloc(s) sur ' + tous.length +
      ' :\n· ' + source.map(function (x) { return x.titre; }).join('\n· ');
    var question = mode === 'remplace'
      ? 'Remplacer la rubrique « ' + sec.label + ' » de ' + noms + ' ?\n\n' +
        'Ce qui s\'y trouve aujourd\'hui sera effacé, puis vous y copiez ' + quoi
      : 'Copier vers ' + noms + ' ?\n\n' + quoi + '\n\nIls s\'ajouteront à la suite de ce qui existe déjà.';
    if (!confirm(question)) return;

    cibles.forEach(function (cid) {
      var lv = state.livret[cid] || (state.livret[cid] = lvVide());
      var copie = clone(source);
      lv[s] = mode === 'remplace' ? copie : (lv[s] || []).concat(copie);
    });

    state.livretCopie = [];
    state.livretBlocs = null;
    save(); render();
    alert('Copié vers ' + cibles.length + ' logement(s).');
  },

  /* Porte d'entrée du livret (session 11) ---------------------------------- */

  /* Étape 1 : on cherche le séjour à partir de la date et des 4 chiffres. */
  /* RETROUVER SON SÉJOUR PAR SON NOM ET SA DATE (session 18, D-90).
     On demande d'abord au cahier partagé — c'est lui qui a les vraies
     réservations, quel que soit l'appareil. On retombe sur ce que contient le
     navigateur si le réseau manque, ou si le script 07 n'est pas encore collé. */
  'bv-chercher': function () {
    var b = state.bienvenue;
    if (!b.date) { b.erreur = t('bvErrDate'); save(); render(); return; }
    if ((b.nom || '').trim().length < 3) { b.erreur = t('bvErrNomCourt'); save(); render(); return; }
    b.erreur = '';

    var localement = function () {
      // Repli : les séjours déjà présents sur cet appareil. Le nom d'abord,
      // les 4 chiffres ensuite pour ne pas perdre l'ancien parcours.
      var n = nomSimple(b.nom);
      var parNom = allResas().filter(function (x) {
        var r = x.r;
        if (r.statut === 'annule' || r.end < TODAY) return false;
        if (nomSimple(r.guest).indexOf(n) < 0) return false;
        return r.start === b.date || (r.start <= b.date && b.date < r.end);
      });
      return parNom.length ? parNom : trouverSejour(b.date, b.tel4);
    };

    var suite = function (trouves) {
      b.enCours = false;
      if (!trouves.length) { b.erreur = t('bvErrRien'); save(); render(); return; }
      if (trouves.length > 1) {
        b.choix = trouves.map(function (x) { return { rid: x.r.id, pid: x.pid, start: x.r.start }; });
        b.etape = 'choix'; b.erreur = '';
        save(); render(); return;
      }
      ouvrirSejour(trouves[0]);
    };

    if (typeof DB === 'undefined' || !DB.estDispo()) { suite(localement()); return; }

    b.enCours = true;
    render();
    DB.chercherSejour(b.nom, b.date)
      .then(function (lignes) {
        if (!lignes.length) { suite(localement()); return; }
        // Un seul séjour : on l'installe et on ouvre. Plusieurs : on fait choisir.
        var faits = lignes.map(function (l) {
          return { pid: l.property_id, r: { id: l.reservation_id, start: l.start_date } };
        });
        if (faits.length > 1) {
          b.enCours = false;
          b.choix = faits.map(function (x) { return { rid: x.r.id, pid: x.pid, start: x.r.start }; });
          b.etape = 'choix'; b.erreur = '';
          // Le nom du logement n'est pas encore dans `state` : on le pose pour l'écran de choix.
          lignes.forEach(function (l) {
            if (!state.props.some(function (p) { return p.id === l.property_id; })) {
              state.props.push({ id: l.property_id, name: l.property_name, short: l.property_name,
                city: '', address: '', color: C.terracotta, tint: '#F6E9E1' });
            }
          });
          save(); render(); return;
        }
        b.enCours = false;
        b.etape = 'recherche';
        save();
        go('#/sejour/' + faits[0].r.id);
      })
      .catch(function () { suite(localement()); });
  },

  /* Plusieurs séjours correspondaient : celui-ci est le bon. Quand il ne vit
     pas encore sur cet appareil — cas normal du voyageur — on passe par son
     lien personnel, qui sait aller le chercher (session 18). */
  'bv-prendre': function (el) {
    var f = resaById(el.dataset.rid);
    state.bienvenue.etape = 'recherche';
    state.bienvenue.choix = null;
    save();
    if (f) ouvrirSejour(f); else go('#/sejour/' + el.dataset.rid);
  },

  /* Le cahier partagé n'a pas répondu : on retente, sans changer de page. */
  'sejour-reessayer': function () {
    state.sejourNet = null;
    render();
  },

  /* Bascule Français / English du livret et de la porte d'entrée (D-57).
     Le choix est mémorisé sur l'appareil du visiteur. */
  'lv-lang': function (el) { state.lvLang = el.dataset.l === 'en' ? 'en' : 'fr'; save(); render(); },

  'bv-voieb': function () {
    state.bienvenue.etape = 'voieb';
    state.bienvenue.erreur = '';
    save(); render();
  },
  'bv-retour': function () {
    state.bienvenue.etape = 'recherche';
    state.bienvenue.erreur = '';
    save(); render();
  },

  /* Voie B : le voyageur se déclare. Accès partiel immédiat, le propriétaire
     confirmera pour débloquer le code d'accès et le Wi-Fi (D-47). */
  'bv-declarer': function () {
    var b = state.bienvenue;
    if (!b.pid) { b.erreur = t('bvErrLog'); save(); render(); return; }
    if (!b.date) { b.erreur = t('bvErrDate'); save(); render(); return; }
    if (!b.nom.trim()) { b.erreur = t('bvErrNom'); save(); render(); return; }

    var d = demanderAcces(b.pid, b.date, b.nom);
    prefillGform(d.resa ? resaById(d.resa) : null, b.nom);
    b.etape = d.resa ? 'form' : 'recherche';
    b.erreur = '';
    save();
    if (d.resa) render(); else go('#/livret/' + b.pid);
  },

  /* Formulaire de coordonnées : enregistrer, ou remettre à plus tard. */
  'gf-envoyer': function () {
    var f = sejourDuPass();
    if (!f) return;
    var g = state.gform, r = f.r;

    if (g.nom.trim()) r.guest = g.nom.trim();
    if (g.tel.trim()) { r.tel = g.tel.trim(); if (!r.tel4) r.tel4 = quatreChiffres(g.tel); }
    if (g.mail.trim()) r.mail = g.mail.trim();
    var n = parseInt(g.guests, 10);
    if (n > 0) r.guests = n;
    if (g.arrivee) r.arriveePrevue = g.arrivee;
    r.demarchable = !!g.optin;      // l'accord du voyageur, tel qu'il l'a donné

    // Ce que le voyageur vient de dire doit descendre sur la mission de ménage
    // du jour de son départ, que le prestataire lit sur son téléphone.
    majMissionsDepuisResa(f.pid, r);

    state.bienvenue.etape = 'recherche';
    save();

    /* LE RETOUR VERS LE CAHIER PARTAGÉ (lot 3, session 18, D-89).
       C'est ce qui manquait complètement : le voyageur saisissait ses
       coordonnées, elles restaient sur son téléphone, et le propriétaire
       constatait à juste titre qu'« aucune info ne remonte ». La fonction
       `enregistrer_voyageur` met aussi à jour les missions concernées : c'est
       ainsi que la prestataire apprend qui arrive derrière, et à quelle heure.
       On n'attend pas la réponse : le voyageur a fini, il va au livret. */
    if (typeof DB !== 'undefined' && DB.estDispo()) {
      DB.enregistrerVoyageur(r.id, {
        nom: g.nom, tel: g.tel, mail: g.mail,
        guests: g.guests, arrivee: g.arrivee, optin: !!g.optin
      }).catch(function () { /* le livret s'ouvre quand même : rien n'est perdu localement */ });
    }

    go('#/livret/' + f.pid);
  },
  'gf-optin': function () { state.gform.optin = !state.gform.optin; save(); render(); },
  'gf-plus-tard': function () {
    var f = sejourDuPass();
    state.bienvenue.etape = 'recherche';
    save();
    go(f ? '#/livret/' + f.pid : '#/bienvenue');
  },
  /* Le bandeau de rappel, pour celui qui avait dit « plus tard ». */
  'gf-ouvrir': function () {
    var f = sejourDuPass();
    if (!f) return;
    prefillGform(f, '');
    state.bienvenue.etape = 'form';
    save();
    go('#/bienvenue');
  },

  /* Répertoire des voyageurs (session 12) ---------------------------------- */

  'rep-filtre': function (el) { state.repFiltre = el.dataset.f; save(); render(); },

  /* Copie les adresses de ceux qui ont donné leur accord, prêtes à coller
     dans le champ « Cci » d'un message groupé. */
  'rep-mails': function () {
    var mails = mailsDemarchables();
    if (!mails.length) {
      alert('Aucun voyageur n\'a encore autorisé le démarchage.\n\n' +
        'L\'accord se recueille dans le formulaire du livret d\'accueil : ' +
        'la case « Je souhaite recevoir vos offres et nouveautés ».');
      return;
    }
    copier(mails.join(', '),
      mails.length + ' adresse(s) copiée(s).\n\nCollez-les dans le champ « Cci » ' +
      'de votre messagerie, pour que les voyageurs ne voient pas les adresses des autres.');
  },

  /* Export CSV, fabriqué et téléchargé par le navigateur : aucun serveur. */
  'rep-export': function () {
    var lignes = [['Nom', 'E-mail', 'Téléphone', 'Séjours', 'Nuits', 'Total €',
      'Dernier séjour', 'Logements', 'Démarchage autorisé', 'Note moyenne donnée']];

    repertoire().forEach(function (f) {
      lignes.push([
        f.nom, f.mail, f.tel, f.sejours.length, f.nuits, f.total,
        f.dernier.r.start, f.props.map(function (pid) { return prop(pid).short; }).join(' / '),
        f.demarchable ? 'oui' : 'non', f.note === null ? '' : fmtNote(f.note)
      ]);
    });

    // Point-virgule : c'est ce qu'attend Excel en configuration française.
    var csv = lignes.map(function (l) {
      return l.map(function (c) { return '"' + String(c).split('"').join('""') + '"'; }).join(';');
    }).join('\r\n');

    telecharger('repertoire-voyageurs-' + TODAY + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
  },

  /* Le propriétaire reconnaît — ou non — un voyageur qui s'est déclaré. */
  'acces-valider': function (el) {
    validerAcces(el.dataset.did);
    save(); render();
  },
  'acces-refuser': function (el) {
    var d = state.acces.find(function (x) { return x.id === el.dataset.did; });
    if (!d) return;
    if (!confirm('Refuser cette demande ? Le voyageur gardera le livret sans le code d\'accès ni le Wi-Fi.')) return;
    d.statut = 'refuse';
    save(); render();
  },

  /* Ce que le voyageur fait depuis son livret ------------------------------ */

  /* « J'ai quitté le logement » : la mission du jour passe en logement libre. */
  'livret-depart': function (el) {
    var pid = el.dataset.pid;
    var r = visiteurLeaving(pid);   // le séjour du visiteur, pas celui qu'on devine
    if (!r) return;
    state.departs[resaKey(pid, r)] = nowHM();
    save(); render();
    /* Et surtout : le dire au cahier partagé (lot 3, session 18). Sans cela
       l'information restait sur le téléphone du voyageur, et la prestataire
       ne savait jamais que le logement était libre plus tôt. */
    if (typeof DB !== 'undefined' && DB.estDispo()) DB.signalerDepart(r.id, nowHM());
  },

  /* Choix du nombre d'étoiles, avant l'envoi. */
  'avis-star': function (el) {
    var key = el.dataset.key;
    var d = state.avisDrafts[key] || (state.avisDrafts[key] = { stars: 0, texte: '' });
    d.stars = parseInt(el.dataset.n, 10) || 0;
    save(); render();
  },

  /* Envoi de la note. Une note de ménage est rattachée à la mission qui a
     préparé le logement, donc au prestataire qui l'a faite.

     ET SURTOUT : ON LE DIT AU CAHIER PARTAGÉ (session 19). Jusqu'ici la note
     s'arrêtait là, dans le navigateur du voyageur. La prestataire ouvrait
     « Mes notes » et lisait « pas encore de note » alors qu'on venait de la
     noter cinq étoiles. Quatrième occurrence de la règle 14 — après les
     photos, le code de la porte et le registre de paie.

     C'est la BASE qui retrouve la personne notée (script 08), pas nous : sur
     le téléphone du voyageur, les missions du logement ne sont pas lisibles,
     donc `cleanerFor()` n'y rend jamais rien. Le calcul local sert seulement
     à afficher tout de suite quelque chose de juste chez le propriétaire. */
  'avis-send': function (el) {
    var pid = el.dataset.pid, kind = el.dataset.kind, key = pid + ':' + kind;
    var d = state.avisDrafts[key] || { stars: 0, texte: '' };
    if (!d.stars) { alert(t('noteEtoiles')); return; }
    var r = stayForAvis(pid, kind);
    if (!r) return;
    if (avisDone(pid, r, kind)) return;

    var m = kind === 'menage' ? cleanerFor(pid, r) : null;
    var texte = (d.texte || '').trim();
    state.avis.push({
      id: 'av' + Date.now(),
      pid: pid, resa: resaKey(pid, r), kind: kind,
      stars: d.stars, texte: texte,
      guest: r.guest,
      agent: m ? (m.taker || null) : null,
      mid: m ? m.id : null,
      dateLabel: fmtDate(TODAY)
    });
    delete state.avisDrafts[key];
    save(); render();

    if (typeof DB !== 'undefined' && DB.estDispo() && r.id) {
      DB.deposerAvis(r.id, kind, d.stars, texte).catch(function () {
        /* Une note perdue n'est pas une raison d'affoler un voyageur qui
           vient de faire un geste gentil : elle reste affichée chez lui, et
           repartira au prochain envoi du propriétaire. */
      });
    }
  },

  /* Prestataires ---------------------------------------------------------- */
  'toggle-new-agent': function () { state.showNewAgent = !state.showNewAgent; save(); render(); },
  'na-color': function (el) { state.na.color = el.dataset.c; save(); render(); },
  /* Le rôle affiché suit le métier choisi ; il reste modifiable à la main juste après. */
  'na-kind': function (el) {
    state.na.kind = el.dataset.k;
    state.na.role = state.na.kind === 'cles' ? 'Remise des clés' : 'Ménage';
    save(); render();
  },
  'create-agent': function () {
    var na = state.na, nom = (na.name || '').trim();
    if (!nom) { alert('Donnez un nom au prestataire.'); return; }
    if (state.agents.some(function (a) { return a.name.toLowerCase() === nom.toLowerCase(); })) {
      alert('Un prestataire porte déjà ce nom.'); return;
    }
    var pal = PALETTE.find(function (c) { return c.color === na.color; }) || PALETTE[0];
    var mots = nom.split(/\s+/);
    var init = (mots[0][0] + (mots[1] ? mots[1][0] : '')).toUpperCase();

    var kind = na.kind === 'cles' ? 'cles' : 'menage';
    state.agents.push({
      id: slug(nom, 'a'), name: nom, init: init, kind: kind,
      role: (na.role || (kind === 'cles' ? 'Remise des clés' : 'Ménage')).trim(),
      since: MONTHS[0].label.toLowerCase(), note: '—', email: (na.email || '').trim(),
      iban: kind === 'cles' ? '—' : 'IBAN à renseigner',
      avatarBg: pal.tint, avatarFg: pal.fg, roleBg: pal.tint, roleFg: pal.fg,
      props: state.props.map(function (p) { return p.id; }),
      services: state.services.map(function (s) { return s.key; })
    });
    state.na = { name: '', kind: 'menage', role: 'Ménage', email: '', color: C.terracotta };
    state.showNewAgent = false;
    save(); render();
  },
  'remove-agent': function (el) {
    var id = el.dataset.ag, a = agent(id);
    var enCours = state.missions.filter(function (m) {
      return m.taker === id && m.status !== 'termine';
    });
    if (enCours.length && !confirm(enCours.length + ' mission(s) en cours lui sont attribuées. ' +
      'Elles repartiront dans les missions disponibles.\n\nSupprimer ' + a.name + ' ?')) return;
    if (!enCours.length && !confirm('Supprimer ' + a.name + ' ?\n\nSes missions déjà réalisées restent dans l\'historique des paiements.')) return;

    enCours.forEach(function (m) { m.status = 'dispo'; m.taker = null; });
    state.agents = state.agents.filter(function (x) { return x.id !== id; });
    if (state.me === id) state.me = null;
    if (state.openAgent === id) state.openAgent = null;
    if (state.openReglages === id) state.openReglages = null;
    save(); render();

    /* Une suppression doit être DITE au cahier partagé (règle 12, D-81) :
       `pousser()` ne sait qu'ajouter et modifier. Depuis que les fiches y
       vivent (session 19), une fiche effacée ici reviendrait à la première
       relecture. Un refus se voit, il n'est pas avalé (règle 4). */
    if (typeof DB !== 'undefined' && DB.estDispo() && DB.profil()) {
      DB.supprimerFiche(id).then(function (ok) {
        if (ok) return;
        state.migMsg = '⚠️ ' + a.name + ' a bien été retiré de cet écran, mais le cahier ' +
          'partagé a refusé la suppression : ' + (DB.erreur() || 'raison inconnue') +
          '. La fiche risque de revenir.';
        render();
      });
    }
  },
  'toggle-perm': function (el) {
    var a = state.agents.find(function (x) { return x.id === el.dataset.ag; });
    if (!a) return;
    var pid = el.dataset.pid;
    a.props = a.props || [];
    a.props = a.props.indexOf(pid) >= 0
      ? a.props.filter(function (x) { return x !== pid; })
      : a.props.concat([pid]);
    save(); render();
  },
  /* Prestations que ce prestataire fait réellement (D-53). */
  'toggle-service-perm': function (el) {
    var a = state.agents.find(function (x) { return x.id === el.dataset.ag; });
    if (!a) return;
    var key = el.dataset.sv;
    a.services = allowedServices(a.id);          // matérialise la liste « tout » au premier clic
    a.services = a.services.indexOf(key) >= 0
      ? a.services.filter(function (x) { return x !== key; })
      : a.services.concat([key]);
    save(); render();
  },
  /* Les deux actions « Inviter par mail » et « Copier le message » de la
     session 8 ont été RETIRÉES en session 15 : leur message expliquait de
     choisir « Prestataire » puis son nom dans une liste, sans mot de passe —
     un parcours supprimé en session 14 (D-65). Le propriétaire aurait envoyé
     des instructions impossibles à suivre. Le seul chemin est désormais le
     lien d'invitation de `ligneCompte()` (D-67). */

  'toggle-payout': function (el) {
    var k = el.dataset.ag + ':' + state.ownerMonth;
    state.payouts[k] = !isPaid(el.dataset.ag, state.ownerMonth);
    save(); render();
  },

  /* Articles de stock ------------------------------------------------------ */
  'toggle-new-article': function () { state.showNewArticle = !state.showNewArticle; save(); render(); },
  'create-article': function () {
    var n = state.nar, nom = (n.label || '').trim();
    if (!nom) { alert('Donnez un nom à l\'article.'); return; }
    var key = slug(nom, 'a');
    var par = Math.max(1, parseInt(n.par, 10) || 1);
    state.articles.push({
      key: key, label: nom, unit: (n.unit || 'unités').trim(),
      par: par, group: (n.group || 'Divers').trim()
    });
    state.seuils[key] = Math.max(0, parseInt(n.seuil, 10) || 0);
    state.props.forEach(function (p) {
      state.stock[p.id] = state.stock[p.id] || {};
      state.stock[p.id][key] = 0;
    });
    if (state.draft) state.draft.qty[key] = 0;
    state.nar = { label: '', unit: 'unités', par: 4, seuil: 2, group: (n.group || 'Salle de bain').trim() };
    state.showNewArticle = false;
    save(); render();
  },
  'remove-article': function (el) {
    var k = el.dataset.k;
    var a = state.articles.find(function (x) { return x.key === k; });
    if (!a) return;
    if (!confirm('Supprimer « ' + a.label + ' » ?\n\nIl disparaît du relevé de tous les biens et de la liste de courses.')) return;
    state.articles = state.articles.filter(function (x) { return x.key !== k; });
    delete state.seuils[k];
    state.props.forEach(function (p) { if (state.stock[p.id]) delete state.stock[p.id][k]; });
    if (state.draft) delete state.draft.qty[k];
    save(); render();

    /* La liste des articles et les seuils repartent en bloc dans les réglages :
       leur suppression se propage toute seule. Les quantités, elles, sont une
       ligne par bien et par article dans le cahier — il faut les effacer
       explicitement, sinon elles reviennent (règle 12, D-81). */
    if (typeof DB !== 'undefined' && DB.estDispo() && DB.profil()) DB.supprimerStock(k);
  },

  'courses-scope': function (el) { state.coursesScope = el.dataset.s; save(); render(); },

  /* Choix des logements retenus dans la liste de courses. */
  'courses-prop': function (el) {
    var pid = el.dataset.pid;
    var list = coursesPropIds();
    var i = list.indexOf(pid);
    if (i >= 0) list.splice(i, 1); else list.push(pid);
    state.coursesProps = list;
    save(); render();
  },
  'courses-all': function (el) {
    state.coursesProps = el.dataset.v === '1' ? state.props.map(function (p) { return p.id; }) : [];
    save(); render();
  },

  /* Arrivée anticipée autorisée, logement par logement. */
  'toggle-early': function (el) {
    var inf = state.info[el.dataset.pid];
    if (!inf) return;
    inf.early = inf.early === false;
    save(); render();
  }
};

/* Enregistre une réservation saisie à la main et crée, comme le ferait l'iCal,
   la mission de ménage du jour du départ (D-06). Le nom et le nombre de
   voyageurs sont recopiés sur la mission : le prestataire les voit. */
/* `pid` vaut null quand la saisie vient du calendrier, où aucun logement
   n'est encore choisi (session 16) : c'est alors le formulaire qui le porte.
   Le séjour créé est ouvert aussitôt, pour que le lien personnel du voyageur
   soit sous la main sans avoir à le chercher. */
function createResa(pid) {
  var r = state.nr;
  var bien = pid || r.pid;
  if (!bien) { alert('Choisissez le logement.'); return; }
  if (!prop(bien) || prop(bien).gone) { alert('Ce logement n\'existe plus.'); return; }

  var nom = (r.guest || '').trim();
  if (!nom) { alert('Indiquez le nom du voyageur.'); return; }
  if (!r.start || !r.end) { alert('Indiquez les dates d\'arrivée et de départ.'); return; }
  if (r.end <= r.start) { alert('Le départ doit être après l\'arrivée.'); return; }

  /* Un séjour qui en chevauche un autre est presque toujours une erreur de
     saisie : on le dit, mais on laisse passer si c'est voulu (une chambre
     louée deux fois, un séjour annulé qu'on remplace). */
  var chevauche = resasOf(bien).filter(function (x) {
    return x.statut !== 'annule' && x.start < r.end && r.start < x.end;
  });
  if (chevauche.length && !confirm('Attention : ' + chevauche[0].guest + ' occupe déjà ce logement du ' +
    fmtDate(chevauche[0].start) + ' au ' + fmtDate(chevauche[0].end) + '.\n\nEnregistrer quand même ?')) return;

  // Même chemin que les futures synchronisations : on normalise, puis on ajoute.
  var resa = ajouterResa(bien, normaliserResa(r, 'manuel', bien));

  state.nr = { plat: r.plat, guest: '', guests: 2, start: '', end: '', montant: '', pid: bien };
  state.showNewResa = false;
  save();
  go('#/admin/reservations/' + resa.id);
}

/* Saisies silencieuses : mettent l'état à jour sans redessiner l'écran,
   pour ne pas faire perdre le curseur pendant la frappe. */
var inputs = {
  /* Porte d'entrée du livret. Saisie silencieuse (pas de redessin) pour ne pas
     perdre le curseur : le contrôle se fait au clic sur « Continuer ». */
  'bv-tel': function (el) {
    el.value = el.value.replace(/\D/g, '').slice(0, 4);   // 4 chiffres, rien d'autre
    state.bienvenue.tel4 = el.value;
  },
  'bv-nom': function (el) { state.bienvenue.nom = el.value; },
  'gf': function (el) { state.gform[el.dataset.k] = el.value; },

  'login-email': function (el) { state.loginEmail = el.value; },
  'login-pwd': function (el) { state.loginPwd = el.value; },
  'inv-pwd': function (el) { state.inv.pwd = el.value; },
  'inv-pwd2': function (el) { state.inv.pwd2 = el.value; },
  'nm-window': function (el) { state.nm.window = el.value; },
  'nm-price': function (el) { state.nm.price = parseInt(el.value || '0', 10) || 0; },
  'nm-note': function (el) { state.nm.note = el.value; },
  'bien-field': function (el) { setBienField(el); },
  'bien-notes': function (el) { state.notes[el.dataset.pid] = el.value; save(); },
  'step-draft': function (el) { state.stepDrafts[el.dataset.key] = el.value; },
  'new-room': function (el) { state.newRoom = el.value; },
  'new-feed': function (el) { state.newFeed = el.value; },
  'nr-montant': function (el) { state.nr.montant = el.value; },
  // Le commentaire du signalement (session 16). Saisie silencieuse : un
  // redessin à chaque touche ferait sauter le curseur.
  'problem-texte': function (el) { state.problemTexte = el.value; },

  /* Montant réel d'un séjour : vide = calculé au prix par nuit du logement. */
  'resa-montant': function (el) {
    var f = resaById(el.dataset.rid);
    if (!f) return;
    f.r.montant = el.value === '' ? null : Math.max(0, parseInt(el.value, 10) || 0);
    save();
  },

  /* Message programmé en cours d'écriture. */
  'am-nom': function (el) { if (state.am) { state.am.nom = el.value; save(); } },
  'am-texte': function (el) { if (state.am) { state.am.texte = el.value; save(); } },
  'am-dec': function (el) { if (state.am) { state.am.decalage = el.value; save(); } },
  'beds24-compte': function (el) { state.beds24.compte = el.value; save(); },

  /* Note libre du propriétaire sur une mission, vue par le prestataire. */
  'mission-note': function (el) {
    var m = mission(el.dataset.id);
    if (m) { m.note = el.value; save(); }
  },

  /* Prestations : le nom est commun à tous les biens, la durée non. */
  'svc-label': function (el) {
    var s = state.services.find(function (x) { return x.key === el.dataset.k; });
    if (s) { s.label = el.value; save(); }
  },
  'svc-duration': function (el) {
    var pid = el.dataset.pid;
    var du = state.durations[pid] || (state.durations[pid] = {});
    du[el.dataset.k] = el.value;
    save();
  },
  'new-service': function (el) { state.newService = el.value; },

  /* Formulaires de création. */
  'nb-name': function (el) { state.nb.name = el.value; },
  'nb-city': function (el) { state.nb.city = el.value; },
  'nb-address': function (el) { state.nb.address = el.value; },
  'na-name': function (el) { state.na.name = el.value; },
  'na-role': function (el) { state.na.role = el.value; },
  'na-email': function (el) { state.na.email = el.value; },
  'nar-label': function (el) { state.nar.label = el.value; },
  'nar-unit': function (el) { state.nar.unit = el.value; },
  'nar-par': function (el) { state.nar.par = el.value; },
  'nar-seuil': function (el) { state.nar.seuil = el.value; },
  'nar-group': function (el) { state.nar.group = el.value; },
  'nr-guest': function (el) { state.nr.guest = el.value; },
  'nr-guests': function (el) { state.nr.guests = el.value; },

  /* Livret d'accueil. */
  'livret-mot': function (el) {
    var lv = state.livret[el.dataset.pid];
    if (lv) { lv[el.dataset.f || 'mot'] = el.value; save(); }
  },
  /* Traduction anglaise d'un bloc, saisie sans redessin pour ne pas perdre
     le curseur (même règle que tous les champs texte). */
  'livret-trad': function (el) {
    var lv = state.livret[el.dataset.pid];
    if (!lv) return;
    var bloc = (lv[el.dataset.s] || [])[parseInt(el.dataset.i, 10)];
    if (bloc) { bloc[el.dataset.f] = el.value; save(); }
  },
  'livret-draft': function (el) {
    var k = el.dataset.key;
    var d = state.livretDrafts[k] || (state.livretDrafts[k] = { titre: '', texte: '', adresse: '', media: '' });
    d[el.dataset.f] = el.value;
  },

  /* Commentaire que le voyageur écrit avec sa note. */
  'avis-texte': function (el) {
    var k = el.dataset.key;
    var d = state.avisDrafts[k] || (state.avisDrafts[k] = { stars: 0, texte: '' });
    d.texte = el.value;
  }
};

function setBienField(el) {
  var inf = state.info[el.dataset.pid] || (state.info[el.dataset.pid] = {});
  inf[el.dataset.k] = el.value;
  save();
}

/* Changements qui demandent un redessin (listes déroulantes, dates). */
var changes = {
  /* Choix du compte à relier à une fiche de prestataire (§19.8). */
  'choix-compte': function (el) {
    if (!state.lienCompte) state.lienCompte = {};
    state.lienCompte[el.dataset.ag] = el.value;
    render();
  },

  /* Porte d'entrée du livret : la date sert aux deux écrans (D-46). */
  'bv-date': function (el) { state.bienvenue.date = el.value; state.bienvenue.erreur = ''; save(); },
  'bv-pid': function (el) { state.bienvenue.pid = el.value; state.bienvenue.erreur = ''; save(); },
  'gf-heure': function (el) { state.gform.arrivee = el.value; save(); },

  'nm-prop': function (el) {
    state.nm.prop = el.value;
    state.nm.price = (state.tariffs[el.value] || {})[state.nm.type] || 0;
    save(); render();
  },
  'nm-type': function (el) {
    state.nm.type = el.value;
    state.nm.price = (state.tariffs[state.nm.prop] || {})[el.value] || 0;
    save(); render();
  },
  'nm-date': function (el) { state.nm.date = el.value; save(); },

  // Les champs d'heure et de date redessinent l'écran : le livret les reprend.
  'bien-field': function (el) { setBienField(el); render(); },
  'nr-pid': function (el) { state.nr.pid = el.value; save(); render(); },
  'nr-plat': function (el) { state.nr.plat = el.value; save(); },
  'nr-start': function (el) { state.nr.start = el.value; save(); },
  'nr-end': function (el) { state.nr.end = el.value; save(); },
  'owner-month': function (el) { state.ownerMonth = el.value; save(); render(); },
  'avis-filter': function (el) { state.avisFilter[el.dataset.f] = el.value; save(); render(); },
  'stat-month': function (el) { state.statMonth = el.value; save(); render(); },
  'am-quand': function (el) {
    if (!state.am) return;
    state.am.quand = el.value;
    var dc = declencheur(el.value);
    if (dc.offset && !parseInt(state.am.decalage, 10)) state.am.decalage = dc.defaut;
    save(); render();
  },
  'am-heure': function (el) { if (state.am) { state.am.heure = el.value; save(); render(); } }
};

/* ==========================================================================
   8. Rendu et démarrage
   ========================================================================== */

var VIEWS = {
  'login': viewLogin,
  'invitation': viewInvitation,
  'p-attente': viewPrestaAttente,
  'bienvenue': viewBienvenue,
  'sejour': viewSejour,
  'livret': viewLivret,
  'livret-sec': viewLivretSection,
  'p-missions': viewPrestaMissions,
  'p-cles': viewPrestaCles,
  'p-mes': viewPrestaMes,
  'p-notes': viewPrestaNotes,
  'p-gains': viewPrestaGains,
  'p-profil': viewPrestaProfil,
  'p-detail': viewPrestaDetail,
  'p-checklist': viewPrestaChecklist,
  'p-stock': viewPrestaStock,
  'p-fin': viewPrestaFin,
  'p-incident': viewPrestaIncident,
  'o-dash': viewOwnerDash,
  'o-cal': viewOwnerCal,
  'o-resa': viewOwnerResa,
  'o-msgs': viewOwnerMsgs,
  'o-msg': viewOwnerMsg,
  'o-auto': viewOwnerAuto,
  'o-stats': viewOwnerStats,
  'o-missions': viewOwnerMissions,
  'o-mission': viewOwnerMission,
  'o-agents': viewOwnerAgents,
  'o-avis': viewOwnerAvis,
  'o-repertoire': viewOwnerRepertoire,
  'o-stocks': viewOwnerStocks,
  'o-biens': viewOwnerBiens,
  'o-bien': viewOwnerBien
};

var lastKey = null;

function render() {
  var r = guard();
  if (!r) return;               // une redirection est en cours, le hashchange rappellera render()
  route = r;

  // Mémorise le champ actif pour le rendre à nouveau après le redessin.
  var ae = document.activeElement;
  var fid = ae && ae.dataset ? ae.dataset.fid : null;
  var selStart = null, selEnd = null;
  if (fid && typeof ae.selectionStart === 'number') { selStart = ae.selectionStart; selEnd = ae.selectionEnd; }

  // Mémorise la position de lecture, pour ne pas renvoyer en haut de liste
  // à chaque photo validée ou chaque quantité modifiée.
  var key = route.name + ':' + (route.id || '') + ':' + (route.sec || '');
  var same = key === lastKey;
  var pane = document.querySelector('.presta-body');
  var paneTop = pane ? pane.scrollTop : 0;
  var winY = window.scrollY;
  lastKey = key;

  var view = VIEWS[route.name] || viewLogin;
  document.getElementById('app').innerHTML = view();

  if (same) {
    var pane2 = document.querySelector('.presta-body');
    if (pane2 && paneTop) pane2.scrollTop = paneTop;
    if (winY) window.scrollTo(0, winY);
  } else {
    window.scrollTo(0, 0);
  }

  if (fid) {
    var again = document.querySelector('[data-fid="' + fid.replace(/"/g, '\\"') + '"]');
    if (again) {
      again.focus();
      if (selStart !== null && typeof again.setSelectionRange === 'function') {
        try { again.setSelectionRange(selStart, selEnd); } catch (e) { /* champs date/number */ }
      }
    }
  }

  document.title = state.auth === 'presta' ? 'MAISON WARME — prestataire'
    : state.auth === 'owner' ? 'MAISON WARME — propriétaire'
      : 'MAISON WARME';
}

document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-a]');
  if (!el) return;
  var fn = actions[el.dataset.a];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

document.addEventListener('input', function (e) {
  var el = e.target.closest('[data-in]');
  if (!el) return;
  var fn = inputs[el.dataset.in];
  if (fn) fn(el);
});

document.addEventListener('change', function (e) {
  var el = e.target.closest('[data-ch]');
  if (!el) return;
  var fn = changes[el.dataset.ch];
  if (fn) fn(el);
});

// Entrée = se connecter, sur l'écran de connexion.
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' || state.auth) return;
  var el = e.target.closest('[data-in]');
  if (!el) return;
  if (el.dataset.in === 'login-email' || el.dataset.in === 'login-pwd') actions.login();
  if (el.dataset.in === 'inv-pwd' || el.dataset.in === 'inv-pwd2') actions['inv-creer']();
});

window.addEventListener('hashchange', render);

// Sauvegarde de sécurité : la frappe en cours n'est pas perdue en quittant la page.
window.addEventListener('beforeunload', save);

load();

/* Le cahier partagé s'ouvre AVANT le premier dessin. Dans l'autre ordre,
   l'écran de connexion s'affichait une fraction de seconde en annonçant une
   panne de réseau qui n'existait pas, bouton grisé à l'appui. */
var cahierPret = typeof DB !== 'undefined' && DB.demarrer();

if (!location.hash) location.replace(homePath());
render();

/* Le grand cahier partagé. On ouvre la connexion, puis on regarde si une
   session est déjà ouverte sur cet appareil : le prestataire qui rouvre
   l'application le matin ne doit pas retaper son mot de passe.

   Et si personne n'est connecté, on REFERME l'application (session 14, D-63).
   Sans cela, l'écran restait ouvert au rechargement pour quiconque s'assoit
   devant l'ordinateur : le souvenir de la dernière connexion était gardé dans
   le navigateur et faisait office de laissez-passer. On ne referme que si
   l'appareil n'a vraiment aucune session — pas si le réseau est simplement
   coupé, sinon on empêcherait de travailler dans un logement sans wifi. */
if (cahierPret) {
  DB.relireProfil()
    .then(function (p) {
      if (!p) return DB.sessionLocale().then(fermerSiPersonne);
      return DB.charger().then(function () {
        state.auth = p.role === 'owner' ? 'owner' : 'presta';
        if (state.auth === 'presta') {
          state.me = DB.identifiantDeCompte(p);
          state.openAgent = state.me;
        }
        DB.ecouter(surChangementDistant);
        // On ne renvoie pas l'utilisateur à l'accueil : il peut avoir ouvert
        // un lien précis (un livret, une mission).
        if (location.hash === '#/login' || !location.hash) location.replace(homePath());
        render();
        if (state.auth === 'owner') relireInvitations();
      });
    })
    .catch(function () { /* hors ligne : on garde ce qui est dans le navigateur */ });
}

/* Aucune session sur cet appareil : on repasse par l'écran de connexion.
   Les données restent dans le navigateur — elles y étaient déjà — mais plus
   aucun écran ne s'ouvre sans mot de passe. */
function fermerSiPersonne(sessionOuverte) {
  if (sessionOuverte || !state.auth) return;
  state.auth = null;
  state.me = null;
  save();
  location.replace('#/login');
  render();
}
