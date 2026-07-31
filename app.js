/* ==========================================================================
   WARME House — application de gestion locative
   Port du prototype « WARME House.dc.html » en page web autonome.
   Aucune dépendance, aucune étape de construction : 3 fichiers statiques.

   Sommaire
     1. Données de démonstration
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
   1. Données de démonstration
   ========================================================================== */

var C = { terracotta: '#C75B39', vert: '#2F8F6B', ambre: '#D99A2B', bleu: '#3E7FA8', ink: '#241E1A' };
var TODAY = '2026-07-30';
var TODAY_LABEL = 'jeudi 30 juillet 2026';
var CURRENT_MONTH = '2026-07';
var MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

var PROPS = [
  { id: 'p1', name: 'Le Nid du Vieux Port', short: 'Vieux Port', city: 'Marseille 2e', address: '12 rue Fortia', color: C.terracotta, tint: '#F7E7DF' },
  { id: 'p2', name: 'Studio Canal Saint-Martin', short: 'Canal St-M.', city: 'Paris 10e', address: '8 rue de la Grange', color: C.bleu, tint: '#E4EDF4' },
  { id: 'p3', name: 'Villa Les Oliviers', short: 'Les Oliviers', city: 'Aix-en-Provence', address: '34 chemin des Cigales', color: C.vert, tint: '#E3F0E9' },
  { id: 'p4', name: 'Loft Bellecour', short: 'Bellecour', city: 'Lyon 2e', address: '5 place Antonin', color: C.ambre, tint: '#F7EEDC' }
];

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

var RESAS = {
  p1: [
    { plat: 'Airbnb', guest: 'Emma Dufour', guests: 4, start: '2026-07-26', end: '2026-07-30' },
    { plat: 'Airbnb', guest: 'Marc Lenoir', guests: 2, start: '2026-07-30', end: '2026-08-03' },
    { plat: 'Booking.com', guest: 'Sophie Aubert', guests: 3, start: '2026-08-06', end: '2026-08-10' }
  ],
  p2: [
    { plat: 'Booking.com', guest: 'Liam Carter', guests: 2, start: '2026-07-27', end: '2026-07-30' },
    { plat: 'Airbnb', guest: 'Chloé Mercier', guests: 2, start: '2026-07-31', end: '2026-08-04' },
    { plat: 'Direct', guest: 'Paul Nguyen', guests: 1, start: '2026-08-08', end: '2026-08-12' }
  ],
  p3: [
    { plat: 'Airbnb', guest: 'Famille Rossi', guests: 6, start: '2026-07-25', end: '2026-07-31' },
    { plat: 'Booking.com', guest: 'Jonas Weber', guests: 5, start: '2026-08-01', end: '2026-08-08' }
  ],
  p4: [
    { plat: 'Airbnb', guest: 'Inès Baptiste', guests: 3, start: '2026-07-27', end: '2026-07-31' },
    { plat: 'Airbnb', guest: 'Tom Kessler', guests: 2, start: '2026-08-02', end: '2026-08-06' }
  ]
};

/* `props` = biens sur lesquels le prestataire a le droit de se positionner. */
var AGENTS = [
  { id: 'Sofia', name: 'Sofia Lemaire', init: 'SL', role: 'Référente ménage', since: 'mars 2025', note: '4,9', email: 'sofia.lemaire@mail.fr', iban: 'IBAN ··· 4417', avatarBg: '#F7E7DF', avatarFg: '#B04A26', roleBg: '#F7E7DF', roleFg: '#B04A26', props: ['p1', 'p2', 'p3', 'p4'] },
  { id: 'Amandine', name: 'Amandine Roux', init: 'AR', role: 'Ménage', since: 'janv. 2026', note: '4,8', email: 'amandine.roux@mail.fr', iban: 'IBAN ··· 8102', avatarBg: '#E4EDF4', avatarFg: '#2F6C93', roleBg: '#E4EDF4', roleFg: '#2F6C93', props: ['p3', 'p4'] },
  { id: 'Karim', name: 'Karim Belaïd', init: 'KB', role: 'Maintenance & extérieur', since: 'sept. 2025', note: '5,0', email: 'karim.belaid@mail.fr', iban: 'IBAN ··· 2390', avatarBg: '#E3F0E9', avatarFg: '#227052', roleBg: '#E3F0E9', roleFg: '#227052', props: ['p1', 'p2', 'p3', 'p4'] }
];

/* Palette d'identité proposée à la création d'un bien ou d'un prestataire. */
var PALETTE = [
  { color: C.terracotta, tint: '#F7E7DF', fg: '#B04A26' },
  { color: C.bleu, tint: '#E4EDF4', fg: '#2F6C93' },
  { color: C.vert, tint: '#E3F0E9', fg: '#227052' },
  { color: C.ambre, tint: '#F7EEDC', fg: '#996B12' },
  { color: '#8A6A4F', tint: '#EFE7DA', fg: '#6B5138' },
  { color: '#7A6BA8', tint: '#EAE6F4', fg: '#5B4E85' }
];

var MONTHS = [
  { key: '2026-07', label: 'Juillet 2026', paid: false, payNote: 'Versement prévu le 5 août' },
  { key: '2026-06', label: 'Juin 2026', paid: true, payNote: 'Payé le 5 juillet 2026' },
  { key: '2026-05', label: 'Mai 2026', paid: true, payNote: 'Payé le 5 juin 2026' }
];

var HISTORY = [
  { agent: 'Sofia', month: '2026-07', prop: 'p2', type: 'menage', dateLabel: '28 juil.', price: 55 },
  { agent: 'Sofia', month: '2026-07', prop: 'p1', type: 'menage', dateLabel: '26 juil.', price: 65 },
  { agent: 'Sofia', month: '2026-07', prop: 'p4', type: 'menage', dateLabel: '22 juil.', price: 60 },
  { agent: 'Sofia', month: '2026-07', prop: 'p3', type: 'menage_jardin', dateLabel: '19 juil.', price: 90 },
  { agent: 'Sofia', month: '2026-06', prop: 'p1', type: 'menage', dateLabel: '27 juin', price: 65 },
  { agent: 'Sofia', month: '2026-06', prop: 'p2', type: 'menage', dateLabel: '21 juin', price: 55 },
  { agent: 'Sofia', month: '2026-06', prop: 'p2', type: 'menage', dateLabel: '14 juin', price: 55 },
  { agent: 'Sofia', month: '2026-06', prop: 'p4', type: 'menage', dateLabel: '6 juin', price: 60 },
  { agent: 'Sofia', month: '2026-05', prop: 'p1', type: 'menage', dateLabel: '30 mai', price: 65 },
  { agent: 'Sofia', month: '2026-05', prop: 'p3', type: 'menage_jardin', dateLabel: '23 mai', price: 90 },
  { agent: 'Sofia', month: '2026-05', prop: 'p1', type: 'stock', dateLabel: '12 mai', price: 25 },
  { agent: 'Amandine', month: '2026-07', prop: 'p3', type: 'menage', dateLabel: '29 juil.', price: 78 },
  { agent: 'Amandine', month: '2026-07', prop: 'p4', type: 'menage', dateLabel: '24 juil.', price: 60 },
  { agent: 'Amandine', month: '2026-07', prop: 'p3', type: 'menage', dateLabel: '17 juil.', price: 78 },
  { agent: 'Amandine', month: '2026-06', prop: 'p3', type: 'menage', dateLabel: '25 juin', price: 78 },
  { agent: 'Amandine', month: '2026-06', prop: 'p4', type: 'menage', dateLabel: '11 juin', price: 60 },
  { agent: 'Amandine', month: '2026-05', prop: 'p4', type: 'menage', dateLabel: '28 mai', price: 60 },
  { agent: 'Karim', month: '2026-07', prop: 'p1', type: 'maintenance', dateLabel: '23 juil.', price: 45 },
  { agent: 'Karim', month: '2026-07', prop: 'p3', type: 'menage_jardin', dateLabel: '15 juil.', price: 90 },
  { agent: 'Karim', month: '2026-06', prop: 'p2', type: 'maintenance', dateLabel: '18 juin', price: 45 },
  { agent: 'Karim', month: '2026-06', prop: 'p3', type: 'menage_jardin', dateLabel: '9 juin', price: 90 },
  { agent: 'Karim', month: '2026-05', prop: 'p1', type: 'maintenance', dateLabel: '20 mai', price: 45 }
];

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

var RAW_CHECK = {
  p1: [
    ['Séjour & entrée', [['Aspirer et laver le sol', 1], ['Dépoussiérer surfaces et vitres', 1]]],
    ['Cuisine', [['Frigo vidé et nettoyé', 1], ['Plaques, évier, plan de travail', 1]]],
    ['Salle de bain', [['Douche et WC désinfectés', 1], ['Serviettes propres pliées', 1]]],
    ['Chambre', [['Lit refait, draps propres', 1]]],
    ['Avant de partir', [['Poubelles sorties', 1], ['Vue d’ensemble du logement', 1]]]
  ],
  p2: [
    ['Pièce principale', [['Aspirer, laver le sol', 1], ['Canapé-lit remis en place', 1]]],
    ['Kitchenette', [['Frigo et micro-ondes nettoyés', 1], ['Évier et plan dégraissés', 1]]],
    ['Salle de bain', [['Douche et WC désinfectés', 1], ['Serviettes propres pliées', 1]]],
    ['Avant de partir', [['Poubelles sorties', 1], ['Vue d’ensemble', 1]]]
  ],
  p3: [
    ['Séjour', [['Sols et surfaces', 1]]],
    ['Cuisine', [['Frigo, four, évier', 1]]],
    ['Salles de bain (2)', [['Douches et WC', 1]]],
    ['Chambres (3)', [['Lits refaits', 1]]],
    ['Extérieur', [['Terrasse balayée, coussins rangés', 1], ['Piscine : écumage de surface', 1], ['Arrosage des plantes', 0]]]
  ],
  p4: [
    ['Mezzanine & séjour', [['Sols et escalier', 1]]],
    ['Cuisine', [['Frigo et plaques', 1]]],
    ['Salle de bain', [['Douche et WC', 1]]],
    ['Avant de partir', [['Poubelles + vue d’ensemble', 1]]]
  ]
};

var BIEN_INFO = {
  p1: { capacity: '4 voyageurs', surface: '46 m²', code: 'Boîte à clés — 4821', wifi: 'NidVieuxPort / soleil2024', parking: 'Parking Estienne, place 34', linge: '2 parures, 6 serviettes', checkin: '16:00', checkout: '11:00' },
  p2: { capacity: '2 voyageurs', surface: '28 m²', code: 'Digicode 12B45 · clé sous tapis', wifi: 'CanalStM / paris1900', parking: 'Aucun', linge: '1 parure, 4 serviettes', checkin: '15:00', checkout: '11:00' },
  p3: { capacity: '6 voyageurs', surface: '140 m²', code: 'Portail 7788 · clé maison', wifi: 'Oliviers / cigales2025', parking: '2 places dans l’allée', linge: '3 parures, 12 serviettes', checkin: '16:00', checkout: '10:00' },
  p4: { capacity: '3 voyageurs', surface: '62 m²', code: 'Boîte à clés — 9021', wifi: 'LoftBellecour / rhone77', parking: 'Parking Bellecour', linge: '2 parures, 6 serviettes', checkin: '17:00', checkout: '11:00' }
};

/* Champs de la fiche bien : clé technique, libellé, et présence dans le livret. */
var INFO_FIELDS = [
  { k: 'capacity', label: 'Capacité' },
  { k: 'surface', label: 'Surface' },
  { k: 'code', label: 'Accès / clés' },
  { k: 'wifi', label: 'Wi-Fi' },
  { k: 'parking', label: 'Stationnement' },
  { k: 'linge', label: 'Linge fourni' },
  { k: 'checkin', label: 'Heure d’arrivée' },
  { k: 'checkout', label: 'Heure de départ' }
];

/* Livret d'accueil : 5 rubriques, chacune une liste de blocs
   { titre, texte, media } — media = adresse internet d'une photo ou d'une vidéo.
   Le voyageur voit d'abord ces rubriques en grandes tuiles, puis ouvre celle
   qui l'intéresse : `icon` et `hint` sont ce qu'il lit sur la tuile. */
var LIVRET_SECTIONS = [
  { k: 'arrivee', label: 'Arrivée autonome', icon: '🔑', hint: 'Comment entrer dans le logement, étape par étape.' },
  { k: 'questions', label: 'Questions fréquentes', icon: '💡', hint: 'La télé, le chauffage, la machine à laver, les poubelles…' },
  { k: 'activites', label: 'Activités autour', icon: '🗺️', hint: 'À voir, à faire, à quelle distance.' },
  { k: 'restos', label: 'Où manger', icon: '🍽️', hint: 'Vos adresses préférées du quartier.' },
  { k: 'depart', label: 'Instructions de départ', icon: '👋', hint: 'Poubelles, clés, fenêtres : ce qu\'il reste à faire avant de partir.' }
];

function baseLivret() {
  var out = {};
  [['p1', 'Marseille'], ['p2', 'Paris'], ['p3', 'Aix-en-Provence'], ['p4', 'Lyon']].forEach(function (x) {
    out[x[0]] = {
      mot: 'Bienvenue ! Vous trouverez ici tout ce qu’il faut pour votre séjour à ' + x[1] + '. Bon séjour !',
      arrivee: [{ titre: 'Entrer dans le logement', texte: 'Le code d’accès est indiqué en haut de ce livret. Composez-le, puis poussez la porte.', media: '' }],
      questions: [], activites: [], restos: [],
      depart: [
        { titre: 'Avant de fermer la porte', texte: 'Sortez les poubelles, laissez la vaisselle propre et rangée, fermez les fenêtres.', media: '' },
        { titre: 'Les clés', texte: 'Remettez les clés là où vous les avez trouvées à votre arrivée.', media: '' }
      ]
    };
  });
  return out;
}

var BIEN_NOTES = {
  p1: 'Voisin du dessous sensible au bruit après 22 h. Aspirateur dans le placard de l’entrée.',
  p2: 'Poubelles à sortir dans la cour, container vert. Le canapé-lit doit être refermé.',
  p3: 'Vérifier le niveau de la piscine et prévenir en cas de fuite. Volets fermés côté sud en été.',
  p4: 'Escalier de la mezzanine à passer à la microfibre, pas d’eau sur le bois.'
};

var TARIFFS = {
  p1: { menage: 65, menage_jardin: 80, stock: 25, maintenance: 45 },
  p2: { menage: 55, menage_jardin: 70, stock: 20, maintenance: 45 },
  p3: { menage: 78, menage_jardin: 90, stock: 30, maintenance: 55 },
  p4: { menage: 60, menage_jardin: 75, stock: 25, maintenance: 45 }
};

var MISSIONS = [
  { id: 'm1', prop: 'p1', type: 'menage', date: '2026-07-30', dateLabel: 'Aujourd’hui', windowLabel: '11:00 → 15:30', price: 65, status: 'dispo', urgent: 'Turnover · arrivée 16:00', turnover: true, res: { plat: 'Airbnb', guest: 'Emma Dufour', guests: 4, nights: 4 }, next: { guest: 'Marc Lenoir', guests: 2, at: '16:00' } },
  { id: 'm2', prop: 'p2', type: 'menage', date: '2026-07-30', dateLabel: 'Aujourd’hui', windowLabel: '10:00 → 18:00', price: 55, status: 'prise', taker: 'Sofia', urgent: '', res: { plat: 'Booking.com', guest: 'Liam Carter', guests: 2, nights: 3 }, next: { guest: 'Chloé Mercier', guests: 2, at: 'demain 15:00' } },
  { id: 'm3', prop: 'p3', type: 'menage_jardin', date: '2026-07-31', dateLabel: 'Demain', windowLabel: '11:00 → 16:00', price: 90, status: 'dispo', urgent: '', res: { plat: 'Airbnb', guest: 'Famille Rossi', guests: 6, nights: 6 }, next: { guest: 'Jonas Weber', guests: 5, at: '1 août 16:00' } },
  { id: 'm4', prop: 'p4', type: 'menage', date: '2026-07-31', dateLabel: 'Demain', windowLabel: '10:00 → 15:00', price: 60, status: 'dispo', urgent: '', res: { plat: 'Airbnb', guest: 'Inès Baptiste', guests: 3, nights: 4 }, next: { guest: 'Tom Kessler', guests: 2, at: '2 août 17:00' } },
  { id: 'm5', prop: 'p1', type: 'stock', date: '2026-08-01', dateLabel: 'Sam. 1 août', windowLabel: '09:00 → 12:00', price: 25, status: 'dispo', urgent: '' },
  { id: 'm6', prop: 'p2', type: 'maintenance', date: '2026-08-01', dateLabel: 'Sam. 1 août', windowLabel: '14:00 → 17:00', price: 45, status: 'dispo', urgent: 'Mitigeur qui fuit' },
  { id: 'm7', prop: 'p4', type: 'menage', date: '2026-08-02', dateLabel: 'Dim. 2 août', windowLabel: '10:00 → 16:00', price: 60, status: 'dispo', urgent: '', res: { plat: 'Airbnb', guest: 'Tom Kessler', guests: 2, nights: 4 } }
];

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

function baseStock() {
  var s = {}, list = baseArticles();
  PROPS.forEach(function (p, pi) {
    s[p.id] = {};
    list.forEach(function (a, ai) {
      var mix = (pi * 7 + ai * 3) % 11;
      var q = a.par;
      if (mix < 2) q = Math.max(0, Math.round(a.par * 0.15));
      else if (mix < 4) q = Math.round(a.par * 0.45);
      else if (mix < 7) q = Math.round(a.par * 0.8);
      s[p.id][a.key] = q;
    });
  });
  s.p1.pq = 3; s.p1.cafe = 8; s.p2.vaisselle = 0; s.p2.serviettes = 4; s.p4.pastilles = 6;
  return s;
}

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
    me: 'Sofia',                      // prestataire connecté
    loginRole: 'owner',
    loginEmail: 'julien@warmehouse.fr',
    loginPwd: 'demo1234',
    loginPresta: 'Sofia',

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

    missions: clone(MISSIONS),
    photos: {},                       // { missionId: { stepId: true } }
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
    problems: [],
    lastDone: null,
    extraFeeds: {},

    // Préférences d'affichage
    missionFilter: 'all',
    stockScope: 'all',
    stockGroup: 'Tous',
    stockTab: 'matrice',
    mStockGroup: 'Tous',
    ownerMonth: '2026-07',
    openAgent: 'Sofia',
    openGainMonth: '2026-06',
    bienTab: 'infos',
    calMonth: '2026-07',
    showNew: false,
    nm: { prop: 'p1', type: 'menage', date: '2026-08-05', window: '11:00 → 15:00', price: 65, note: '' },
    stepDrafts: {},
    newRoom: '',
    newFeed: '',
    problemKind: null,
    problemPhoto: false,

    // Formulaires de création ajoutés en session 7
    showNewBien: false,
    nb: { name: '', city: '', address: '', color: C.terracotta },
    showNewAgent: false,
    na: { name: '', role: 'Ménage', email: '', color: C.terracotta },
    showNewArticle: false,
    nar: { label: '', unit: 'unités', par: 4, seuil: 2, group: 'Salle de bain' },
    showNewResa: false,
    nr: { plat: 'Airbnb', guest: '', guests: 2, start: '', end: '' },
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
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    /* Navigation privée ou quota plein : l'application reste utilisable sans sauvegarde. */
  }
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
          (f.k === 'checkin' ? '16:00' : f.k === 'checkout' ? '11:00' : '');
      }
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
  });

  state.missions.forEach(function (m) { if (m.note === undefined) m.note = ''; });
  if (state.nm.note === undefined) state.nm.note = '';

  // Les biens supprimés ne doivent pas rester cochés dans la liste de courses.
  if (Array.isArray(state.coursesProps)) {
    state.coursesProps = state.coursesProps.filter(function (pid) { return !prop(pid).gone; });
  }
}

function resetDemo() {
  var auth = state.auth, me = state.me;
  state = initialState();
  upgrade();
  state.auth = auth;
  state.me = me;
  state.loginPresta = me;
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

/* Biens sur lesquels un prestataire a le droit de se positionner. */
function allowedProps(agentId) {
  var a = state.agents.find(function (x) { return x.id === agentId; });
  return a && a.props ? a.props : [];
}
function mayTake(agentId, pid) { return allowedProps(agentId).indexOf(pid) >= 0; }

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

/** Le séjour concerné par une note : la propreté est notée par celui qui
    occupe le logement, le séjour par celui qui s'en va. */
function stayForAvis(pid, kind) {
  return kind === 'menage' ? stayCurrent(pid) : stayLeaving(pid);
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

/** Lien vers un plan. Ce format est compris par Google Maps, et l'iPhone le
    propose dans Plans : c'est le plus sûr sans dépendre d'un service précis. */
function planUrl(adresse) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(adresse);
}

/** Texte de l'invitation. Il dit la vérité : aujourd'hui il n'y a pas de mot
    de passe à créer, le prestataire choisit son nom dans une liste. */
function inviteTexte(a) {
  var prenom = String(a.name || '').split(/\s+/)[0] || '';
  return 'Bonjour ' + prenom + ',\n\n' +
    'Tu peux désormais suivre tes missions depuis ton téléphone avec WARME House : ' +
    'les ménages à prendre, la checklist de chaque logement, le relevé des stocks et tes gains du mois.\n\n' +
    'Voici ton lien :\n' + appUrl() + '\n\n' +
    'Pour te connecter :\n' +
    '1. Ouvre le lien sur ton téléphone\n' +
    '2. Choisis « Prestataire »\n' +
    '3. Sélectionne ton nom dans la liste : ' + a.name + '\n' +
    '4. Appuie sur « Se connecter »\n\n' +
    'Aucun mot de passe ne t\'est demandé pour le moment.\n\n' +
    'Astuce : depuis ton navigateur, choisis « Ajouter à l\'écran d\'accueil ». ' +
    'L\'application s\'ouvrira ensuite comme une vraie application.\n\n' +
    'À bientôt,\nWARME House';
}

/** Le lien mailto complet, prêt à ouvrir. */
function inviteMailto(a) {
  return 'mailto:' + encodeURIComponent(a.email || '') +
    '?subject=' + encodeURIComponent('Ton accès à WARME House') +
    '&body=' + encodeURIComponent(inviteTexte(a));
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

function ledger() { return state.done.concat(HISTORY); }
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

var OWNER_NAV = [
  { key: 'dash', path: '#/admin', label: 'Tableau de bord', color: C.terracotta },
  { key: 'missions', path: '#/admin/missions', label: 'Missions', color: C.bleu },
  { key: 'agents', path: '#/admin/prestataires', label: 'Prestataires', color: '#8A6A4F' },
  { key: 'avis', path: '#/admin/commentaires', label: 'Commentaires', color: '#7A6BA8' },
  { key: 'stocks', path: '#/admin/stocks', label: 'Stocks', color: C.ambre },
  { key: 'biens', path: '#/admin/biens', label: 'Biens & iCal', color: C.vert }
];

function parseRoute() {
  var h = location.hash.replace(/^#/, '');
  var seg = h.split('/').filter(Boolean);          // ex. ['app','missions','m1','checklist']

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
    if (seg[1] === 'mes-missions') return { name: 'p-mes', id: null };
    if (seg[1] === 'notes') return { name: 'p-notes', id: null };
    if (seg[1] === 'gains') return { name: 'p-gains', id: null };
    if (seg[1] === 'profil') return { name: 'p-profil', id: null };
    return { name: 'p-missions', id: null };
  }

  if (seg[0] === 'admin') {
    if (seg[1] === 'missions') return { name: seg[2] ? 'o-mission' : 'o-missions', id: seg[2] || null };
    if (seg[1] === 'prestataires') return { name: 'o-agents', id: null };
    if (seg[1] === 'commentaires') return { name: 'o-avis', id: null };
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

  // Le livret s'ouvre sans connexion : c'est une page pour le voyageur.
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
  if (state.auth === 'presta' && (isOwner || r.name === 'login')) { location.replace('#/app/missions'); return null; }
  if (state.auth === 'owner' && (isPresta || r.name === 'login')) { location.replace('#/admin'); return null; }

  // Une mission ouverte doit exister.
  if (r.id && isPresta && !mission(r.id)) { location.replace('#/app/missions'); return null; }

  // La fiche mission du propriétaire suppose que la mission existe.
  if (r.name === 'o-mission' && !mission(r.id)) { location.replace('#/admin/missions'); return null; }

  // Un prestataire ne voit que les biens qui lui sont autorisés.
  if (r.id && isPresta) {
    var pm = mission(r.id);
    if (pm && !mayTake(state.me, pm.prop)) { location.replace('#/app/missions'); return null; }
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
    hasRes: !!m.res, guestsLabel: m.res ? m.res.guests + ' voyageurs' : '',
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
  return '<div class="presta">' + head +
    '<div class="presta-body' + (opts.flush ? ' presta-body--flush' : '') + '">' + body + '</div>' +
    (foot || '') +
    (opts.noTabs ? '' : tabBar()) +
    '</div>';
}

function tabBar() {
  var dispoCount = dispoForMe().length;
  return '<nav class="tabbar">' + PRESTA_TABS.map(function (t) {
    var on = routeTab() === t.key;
    var badge = t.key === 'missions' && dispoCount > 0
      ? '<div class="tab-badge num">' + dispoCount + ' new</div>' : '';
    return '<button type="button"' + (on ? ' aria-current="page"' : '') + act('nav', { path: t.path }) + '>' +
      '<div class="tab-dot"></div><div class="tab-label">' + t.label + '</div>' + badge + '</button>';
  }).join('') + '</nav>';
}

function routeTab() {
  if (route.name === 'p-mes') return 'mes-missions';
  if (route.name === 'p-notes') return 'notes';
  if (route.name === 'p-gains') return 'gains';
  if (route.name === 'p-profil') return 'profil';
  return 'missions';
}

function prestaHeader(kicker, title) {
  var me = agent(state.me);
  return '<header class="presta-head">' +
    '<div><div class="presta-kicker">' + esc(kicker) + '</div>' +
    '<h1 class="presta-title">' + esc(title) + '</h1></div>' +
    '<div class="avatar" style="background:' + me.avatarBg + ';color:' + me.avatarFg + '">' + me.init + '</div>' +
    '</header>';
}

/* --- Liste des missions disponibles ------------------------------------- */

/* Missions ouvertes que le prestataire connecté a le droit de prendre. */
function dispoForMe() {
  return state.missions.filter(function (m) {
    return m.status === 'dispo' && mayTake(state.me, m.prop);
  });
}

function viewPrestaMissions() {
  var list = dispoForMe().map(decorate);
  var caches = state.missions.filter(function (m) {
    return m.status === 'dispo' && !mayTake(state.me, m.prop);
  }).length;

  var body = '<div class="stack">' + (list.length
    ? list.map(missionCard).join('')
    : '<p class="empty">Aucune mission disponible pour le moment.</p>') +
    '<p class="center sec-note" style="padding-top:8px">Une mission apparaît dès qu\'un check-out est détecté sur l\'iCal.' +
      (caches ? '<br>' + caches + ' mission(s) concernent des logements qui ne te sont pas attribués.' : '') + '</p>' +
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
  var pl = m.res ? PLATS[m.res.plat] : PLATS['Airbnb'];

  var btn;
  if (m.status === 'dispo') {
    btn = { label: 'Prendre cette mission', cls: 'btn--primary', action: 'take',
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

  var guest = m.res ? '<div class="card">' +
    '<h2 style="font:700 14px Figtree,sans-serif;margin:0 0 10px">Séjour qui se termine</h2>' +
    '<div style="display:flex;align-items:center;gap:11px">' +
      '<div class="avatar" style="width:38px;height:38px;font-size:13px;background:' + pl.bg + ';color:' + pl.fg + '">' +
        esc(m.res.guest.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2)) + '</div>' +
      '<div class="grow"><div style="font:600 15px Figtree,sans-serif">' + esc(m.res.guest) + '</div>' +
      '<div class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:1px">' + m.res.guests + ' voyageurs · ' + m.res.nights + ' nuits</div></div>' +
      '<span class="badge" style="background:' + pl.bg + ';color:' + pl.fg + '">' + esc(m.res.plat) + '</span>' +
    '</div>' +
    (m.next ? '<div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(36,30,26,.08)">' +
      '<div style="font:600 11.5px Figtree,sans-serif;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">Prochaine arrivée</div>' +
      '<div class="num" style="font:600 14px Figtree,sans-serif;margin-top:5px">' + esc(m.next.guest + ' · ' + m.next.guests + ' voyageurs · arrivée ' + m.next.at) + '</div>' +
      '</div>' : '') +
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
      '<div class="access-card">' +
        '<div class="access-item"><div class="k">Entrée / clés</div><div class="v num">' + esc(inf.code || '—') + '</div></div>' +
        '<div class="access-item"><div class="k">Wi-Fi</div><div class="v num">' + esc(inf.wifi || '—') + '</div></div>' +
      '</div>' +
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
        var ok = !!ph[s.id];
        var hint = ok ? (s.photo ? 'Photo enregistrée · toucher pour refaire' : 'Validé')
          : (s.photo ? 'Photo obligatoire' : 'À cocher');
        var right = ok && s.photo
          ? '<button type="button" class="step-thumb stripe"' + act('shoot', { mid: m.id, sid: s.id }) + '>PHOTO</button>'
          : '<button type="button" class="step-act" style="' +
              (ok ? 'background:var(--fill);color:var(--muted)' : s.photo ? 'background:var(--ink);color:#fff' : 'background:var(--green);color:#fff') +
              '"' + act('shoot', { mid: m.id, sid: s.id }) + '>' +
              (s.photo ? 'Photo' : ok ? 'Annuler' : 'Fait') + '</button>';
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

function viewPrestaIncident() {
  var m = mission(route.id);
  var kinds = [
    ['casse', 'Quelque chose est cassé', C.terracotta],
    ['degat', 'Dégât ou tache importante', '#B04A26'],
    ['manque', 'Il manque du matériel', C.ambre],
    ['acces', 'Problème d’accès au logement', C.bleu]
  ];

  var body =
    '<button type="button" class="btn-back"' + act('nav', { path: '#/app/missions/' + m.id + '/checklist' }) + '>← Retour</button>' +
    '<h1 style="font:700 24px/1.2 Figtree,sans-serif;margin:4px 0 0">Signaler un problème</h1>' +
    '<p class="sec-note" style="margin:5px 0 0">Le propriétaire est prévenu tout de suite.</p>' +
    '<div class="stack" style="gap:10px;margin-top:18px">' + kinds.map(function (k) {
      var on = state.problemKind === k[0];
      return '<button type="button" style="background:' + (on ? '#FFF7F0' : '#fff') +
        ';border:1.5px solid ' + (on ? C.terracotta : 'rgba(36,30,26,.1)') +
        ';border-radius:18px;min-height:54px;padding:14px 16px;display:flex;align-items:center;gap:12px;width:100%"' +
        act('problem-kind', { k: k[0] }) + '>' +
        '<span class="dot" style="width:10px;height:10px;background:' + k[2] + '"></span>' +
        '<span style="font:600 15px Figtree,sans-serif">' + esc(k[1]) + '</span></button>';
    }).join('') + '</div>' +
    '<div class="card" style="margin-top:18px;border-radius:18px;padding:15px">' +
      '<div style="font:600 12px Figtree,sans-serif;color:var(--muted)">Photo du problème</div>' +
      '<button type="button" class="stripe" style="margin-top:10px;height:100px;width:100%;border-radius:14px;display:flex;align-items:center;justify-content:center;font:600 10px ui-monospace,Menlo,monospace;color:var(--muted)"' +
        act('problem-photo') + '>' + (state.problemPhoto ? 'PHOTO AJOUTÉE' : 'TOUCHER POUR PHOTOGRAPHIER') + '</button>' +
    '</div>' +
    '<button type="button" class="btn ' + (state.problemKind ? 'btn--primary' : 'btn--muted') + '" style="margin-top:20px"' +
      (state.problemKind ? act('send-problem', { id: m.id }) : '') + '>' +
      (state.problemKind ? 'Envoyer au propriétaire' : 'Choisis un type de problème') + '</button>';

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
        '<p class="sec-note" style="margin-top:6px">Après chaque séjour, le voyageur note la propreté ' +
          'depuis son livret d\'accueil. Ses étoiles et son commentaire arrivent ici.</p>') +
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

function viewPrestaProfil() {
  var me = agent(state.me);
  var r = agentRating(state.me);
  var autorises = (me.props || []).length;

  var rows = [
    ['Biens autorisés', autorises + ' sur ' + state.props.length],
    ['Note des voyageurs', r ? fmtNote(r.avg) + ' / 5' : 'Pas encore de note'],
    ['Coordonnées bancaires', me.iban],
    ['Notifications', 'Nouvelles missions']
  ];

  var body = '<div class="stack" style="gap:14px">' +
    '<article class="card" style="border-radius:22px;display:flex;align-items:center;gap:14px">' +
      '<div class="avatar" style="width:56px;height:56px;font-size:19px;background:' + me.avatarBg + ';color:' + me.avatarFg + '">' + me.init + '</div>' +
      '<div class="grow"><div style="font:700 20px Figtree,sans-serif">' + esc(me.name) + '</div>' +
      '<div style="font:500 13px Figtree,sans-serif;color:var(--muted)">' + esc(me.role) + ' · depuis ' + esc(me.since) + '</div></div>' +
      (r ? '<button type="button" style="text-align:right;flex:none"' + act('nav', { path: '#/app/notes' }) + '>' +
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
    '<button type="button" class="btn btn--sm" style="background:var(--fill);color:var(--ink-soft);width:100%"' + act('reset') + '>Réinitialiser la démonstration</button>' +
    '<p class="sec-note center">Version de démonstration · les données sont enregistrées dans ce navigateur uniquement.</p>' +
    '</div>';

  return prestaShell(prestaHeader('Mon compte', 'Profil'), body);
}

/* ==========================================================================
   6. Vues propriétaire
   ========================================================================== */

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
      '<div><div class="rail-logo">WARME House</div>' +
      '<div class="rail-sub num">' + state.props.length + ' bien' + (state.props.length > 1 ? 's' : '') +
        ' · ' + state.agents.length + ' prestataire' + (state.agents.length > 1 ? 's' : '') +
        ' · ' + TODAY_LABEL + '</div></div>' +
      '<nav class="rail-nav">' + nav + '</nav>' +
      '<div class="rail-foot">' +
        '<div class="rail-sync">Calendriers synchronisés il y a 12 min · Airbnb · Booking.com' +
          '<br><br>Démonstration : les données sont enregistrées dans ce navigateur.</div>' +
        '<div class="rail-actions">' +
          '<button type="button"' + act('reset') + '>Réinitialiser</button>' +
          '<button type="button"' + act('logout') + '>Se déconnecter</button>' +
        '</div>' +
      '</div>' +
    '</aside>' +
    '<main class="owner-main">' + content + '</main>' +
    '</div>';
}

/* --- Tableau de bord ----------------------------------------------------- */

function viewOwnerDash() {
  var openCount = state.missions.filter(function (m) { return m.status === 'dispo'; }).length;
  var lowByProp = state.props.map(function (p) { return { p: p, lows: lowsFor(p.id) }; });
  var totalLow = lowByProp.reduce(function (n, x) { return n + x.lows.length; }, 0);
  var m1 = mission('m1');

  var kpis = [
    { v: String(state.missions.filter(function (m) { return m.status !== 'termine'; }).length), l: 'missions à venir', c: C.ink },
    { v: String(openCount), l: 'non prises', c: C.terracotta },
    { v: String(totalLow), l: 'articles sous seuil', c: C.ambre },
    { v: state.agents.reduce(function (n, a) { return n + monthTotal(a.id, CURRENT_MONTH); }, 0) + ' €', l: 'à payer en juillet', c: C.vert }
  ];

  var alerts = [
    { cls: 'alert--terra', dot: C.terracotta, kind: 'Turnover serré',
      title: 'Le Nid du Vieux Port · aujourd’hui',
      det: 'Emma Dufour part à 11:00, Marc Lenoir arrive à 16:00. ' +
        (!m1 || m1.status === 'dispo' ? 'Mission encore non prise.'
          : m1.status === 'termine' ? 'Ménage terminé par ' + m1.taker + '.'
            : m1.status === 'encours' ? 'Ménage en cours par ' + m1.taker + '.'
              : 'Acceptée par ' + m1.taker + '.') },
    { cls: 'alert--amber', dot: C.ambre, kind: 'Stock bas',
      title: totalLow + ' articles sous leur seuil',
      det: lowByProp.filter(function (x) { return x.lows.length; })
        .map(function (x) { return x.p.short + ' (' + x.lows.length + ')'; }).join(' · ') || 'Rien à signaler' },
    { cls: 'alert--blue', dot: C.bleu, kind: 'Signalement',
      title: state.problems.length ? state.problems.length + ' problème(s) signalé(s)' : 'Mitigeur qui fuit · Canal Saint-Martin',
      det: state.problems.length ? 'Envoyé pendant une mission, photo jointe.' : 'Mission de réparation créée pour le 1er août, 45 €.' }
  ];

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

  var upcoming = state.missions.filter(function (m) { return m.status !== 'termine'; }).map(decorate);

  return ownerShell('dash',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Bonjour Julien</h1>' +
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

    '<div class="cols" style="margin-top:26px;gap:20px">' +
      '<section style="flex:1.7;min-width:min(100%,520px)">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">' +
          '<h2 class="sec-title" style="margin:0">Missions des 7 prochains jours</h2>' +
          '<button type="button" style="font:600 12.5px Figtree,sans-serif;color:var(--terra)"' + act('nav', { path: '#/admin/missions' }) + '>Tout voir</button>' +
        '</div>' +
        '<div class="card card--flush" style="padding:6px 18px"><div class="list">' +
        (upcoming.length ? upcoming.map(function (m) {
          return '<div class="list-row">' +
            '<div class="day-badge num"><div class="d">' + m.day + '</div><div class="m">' + m.month + '</div></div>' +
            '<div class="bar" style="background:' + m.color + '"></div>' +
            '<div class="grow"><div style="font:600 14.5px Figtree,sans-serif">' + esc(m.propName) + '</div>' +
            '<div class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:2px">' + esc(m.typeLabel) + ' · ' + esc(m.windowLabel) + '</div></div>' +
            (m.urgent ? '<span class="badge badge--terra" style="font-size:11px;padding:4px 9px">' + esc(m.urgentLabel) + '</span>' : '') +
            '<span class="badge ' + m.statusCls + '">' + esc(m.statusLabel) + '</span>' +
            '<span class="num" style="font:600 13px Figtree,sans-serif;color:var(--ink-soft);width:48px;text-align:right;flex:none">' + esc(m.priceLabel) + '</span>' +
            '</div>';
        }).join('') : '<p class="empty">Aucune mission à venir.</p>') +
        '</div></div>' +
      '</section>' +
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

/* --- Revue d'une mission terminée ---------------------------------------- */

function viewOwnerMission() {
  var m = mission(route.id), d = decorate(m);
  var rep = state.reports[m.id];
  var ag = m.taker ? agent(m.taker) : null;
  var fini = m.status === 'termine';
  var valide = m.review === 'valide';

  // Comptes lus dans le compte rendu figé, et non dans la checklist actuelle
  // du bien, qui a pu être modifiée depuis.
  var repDone = 0, repTotal = 0;
  if (rep) rep.rooms.forEach(function (r) {
    repTotal += r.steps.length;
    repDone += r.steps.filter(function (s) { return s.done; }).length;
  });

  /* Colonne de gauche : la checklist telle qu'elle a été exécutée. */
  var checklist = !fini
    ? '<div class="card"><p class="empty">La checklist s\'affichera ici une fois la mission terminée.</p></div>'
    : !rep
    ? '<div class="card"><p class="empty">Le détail de cette mission n\'a pas été conservé : ' +
        'elle a été terminée avant la mise en place de la revue.</p></div>'
    : rep.rooms.map(function (r) {
        var dn = r.steps.filter(function (s) { return s.done; }).length;
        return '<div class="card" style="padding:18px 20px">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
            '<span class="dot" style="background:' + d.color + '"></span>' +
            '<span style="font:700 16px Figtree,sans-serif;flex:1;min-width:0">' + esc(r.name) + '</span>' +
            '<span class="badge num ' + (dn === r.steps.length ? 'badge--green' : 'badge--amber') + '">' +
              dn + '/' + r.steps.length + '</span>' +
          '</div>' +
          '<div class="revue-grid">' + r.steps.map(function (s) {
            var thumb = s.photo && s.done
              ? '<span class="revue-thumb stripe">PHOTO</span>'
              : '<span class="revue-thumb revue-thumb--none">' + (s.done ? '✓' : '—') + '</span>';
            return '<div class="revue-step">' + thumb +
              '<div class="grow">' +
                '<div style="font:600 13.5px/1.3 Figtree,sans-serif">' + esc(s.label) + '</div>' +
                '<div style="font:500 11.5px Figtree,sans-serif;color:var(--muted2);margin-top:3px">' +
                  (s.done ? (s.photo ? 'Photo envoyée' : 'Validé sans photo') : 'Non validé') + '</div>' +
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
      [['Étapes validées', rep ? repDone + ' / ' + repTotal : '—'],
       ['Photos envoyées', rep ? String(rep.photos) : '—'],
       ['Articles sous le seuil', rep ? String(rep.lows.length) : '—'],
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
  var releve = !rep ? '' :
    '<h2 class="sec-title" style="margin:30px 0 12px">Relevé de stock envoyé</h2>' +
    '<div class="grid-cards">' + grouped().map(function (g) {
      return '<div class="card">' +
        '<div style="font:700 15px Figtree,sans-serif">' + esc(g[0]) + '</div>' +
        '<div class="list" style="margin-top:8px">' + g[1].map(function (a) {
          var qty = rep.qty[a.key] || 0, low = rep.lows.indexOf(a.key) >= 0;
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
        noteCard + suivi + recap + decision +
      '</section>' +
    '</div>' + releve);
}

/* --- Prestataires -------------------------------------------------------- */

function viewOwnerAgents() {
  var monthDef = MONTHS.find(function (m) { return m.key === state.ownerMonth; });

  var cards = state.agents.map(function (a) {
    var rows = monthRows(a.id, state.ownerMonth);
    var open = state.openAgent === a.id;
    var paye = isPaid(a.id, state.ownerMonth);
    var rt = agentRating(a.id);
    var noteLabel = rt ? fmtNote(rt.avg) + '/5 (' + rt.n + ' avis)' : 'pas encore noté';
    return '<article class="card" style="padding:0;overflow:hidden">' +
      '<div style="display:flex;align-items:center;gap:16px;padding:20px 22px;flex-wrap:wrap">' +
        '<div class="avatar" style="width:52px;height:52px;font-size:17px;background:' + a.avatarBg + ';color:' + a.avatarFg + '">' + a.init + '</div>' +
        '<div style="flex:1;min-width:180px">' +
          '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">' +
            '<span style="font:700 18px Figtree,sans-serif">' + esc(a.name) + '</span>' +
            '<span class="badge" style="background:' + a.roleBg + ';color:' + a.roleFg + ';font-weight:600">' + esc(a.role) + '</span>' +
          '</div>' +
          '<div class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:3px">Depuis ' + esc(a.since) + ' · ' + esc(noteLabel) + ' · ' + rows.length + ' mission(s) ce mois</div>' +
        '</div>' +
        '<div style="text-align:right;flex:none">' +
          '<div class="serif num" style="font-size:28px;line-height:1">' + rows.reduce(function (n, r) { return n + r.price; }, 0) + ' €</div>' +
          '<div style="font:600 11.5px Figtree,sans-serif;color:' + (paye ? 'var(--green-t)' : 'var(--muted)') + ';margin-top:3px">' +
            (paye ? 'payé' : 'à verser') + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn--xs" style="' + (paye ? 'background:var(--green-bg);color:var(--green-t)' : 'background:var(--amber-bg);color:var(--amber-t)') + '"' +
          act('toggle-payout', { ag: a.id }) + '>' + (paye ? '✓ Payé' : 'Marquer payé') + '</button>' +
        '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
          act('toggle-agent', { ag: a.id }) + '>' + (open ? 'Masquer' : 'Historique') + '</button>' +
      '</div>' +

      /* Biens sur lesquels ce prestataire a le droit de se positionner. */
      '<div class="perm-row">' +
        '<span class="perm-label">Peut prendre les missions de :</span>' +
        (state.props.length ? state.props.map(function (p) {
          var on = (a.props || []).indexOf(p.id) >= 0;
          return '<button type="button" class="perm-chip" aria-pressed="' + on + '" style="--accent:' + p.color + '"' +
            act('toggle-perm', { ag: a.id, pid: p.id }) + '>' +
            '<span class="dot" style="background:' + (on ? p.color : 'rgba(36,30,26,.2)') + '"></span>' + esc(p.short) + '</button>';
        }).join('') : '<span class="sec-note">Aucun bien enregistré.</span>') +
        '<button type="button" class="btn-danger-xs" style="margin-left:auto"' +
          act('remove-agent', { ag: a.id }) + '>Supprimer</button>' +
      '</div>' +

      /* Invitation : le message est préparé ici, l'envoi se fait depuis la
         messagerie du propriétaire (voir inviteMailto). */
      '<div class="invite-row">' +
        '<span class="invite-state">' +
          (a.invited
            ? '<span class="invite-ok">✓ Invitation envoyée le ' + esc(a.invited) + '</span>'
            : '<span class="invite-todo">Pas encore invité</span>') +
          (a.email ? '<span class="invite-mail num">' + esc(a.email) + '</span>'
                   : '<span class="invite-mail invite-mail--none">aucune adresse e-mail</span>') +
        '</span>' +
        '<button type="button" class="btn btn--xs" style="background:var(--ink);color:#fff"' +
          act('invite-agent', { ag: a.id }) + '>✉ ' + (a.invited ? 'Renvoyer l\'invitation' : 'Inviter par mail') + '</button>' +
        '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
          act('invite-copy', { ag: a.id }) + '>Copier le message</button>' +
      '</div>' +
      /* Ce que les voyageurs ont pensé de ses ménages. */
      (rt ? '<div class="avis-row">' +
        '<span class="perm-label">Avis des voyageurs :</span>' +
        rt.list.slice().reverse().slice(0, 4).map(function (v) {
          return '<span class="avis-chip" title="' + esc(v.texte || 'Sans commentaire') + '">' +
            starsRead(v.stars) + '<span class="num">' + esc(prop(v.pid).short) + '</span></span>';
        }).join('') +
        (rt.n > 4 ? '<span class="sec-note">+ ' + (rt.n - 4) + ' autres</span>' : '') +
        '</div>' : '') +
      (open ? '<div class="table-scroll" style="padding:0 22px 8px">' +
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
        '<span class="sec-note">Cochez ensuite ses biens autorisés, puis envoyez-lui son invitation ' +
          'avec le bouton « ✉ Inviter par mail » de sa fiche.</span>' +
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
    '</div>' + form +

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

  var kpis = '<div class="cols" style="margin-top:22px;gap:12px">' +
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
      '<p class="page-sub">Checklist, tarifs, réservations, livret d\'accueil et liens iCal — pour chaque logement.</p></div>' +
      '<button type="button" class="btn btn--xs" style="' + (state.showNewBien ? 'background:var(--cream);color:var(--ink-soft)' : 'background:var(--terra);color:#fff') +
        ';min-height:42px;font-size:13px"' + act('toggle-new-bien') + '>' +
        (state.showNewBien ? 'Fermer' : '+ Ajouter un bien') + '</button>' +
    '</div>' + form +
    '<div class="grid-cards" style="margin-top:22px">' +
      (cards || '<p class="empty">Aucun bien. Ajoutez le premier ci-dessus.</p>') + '</div>');
}

/* --- Fiche bien ---------------------------------------------------------- */

function viewOwnerBien() {
  var b = prop(route.id);
  if (b.gone) { location.replace('#/admin/biens'); return ''; }
  var pid = b.id;
  var tabs = [['infos', 'Infos & tarifs'], ['checklist', 'Checklist ménage'],
    ['calendrier', 'Réservations'], ['livret', 'Livret d’accueil'], ['ical', 'Liens iCal']];
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
    '</div>' + panel);
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
      ? '<span class="cal-bar" style="background:' + PLATS[r.plat].color +
        ';margin-left:' + (r.start === iso ? '45%' : '0') + ';margin-right:' + (r.end === iso ? '45%' : '0') + '"></span>'
      : '';
    cells += '<div class="' + cls + '"><span class="d num">' + d + '</span>' + bar + '</div>';
  }

  return '<div class="cols" style="margin-top:22px">' +
    '<div class="card" style="flex:1.4;min-width:min(100%,380px);padding:20px 22px">' +
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<h2 style="font:700 18px Figtree,sans-serif;flex:1;margin:0">' + (cmo === 7 ? 'Juillet' : 'Août') + ' ' + cy + '</h2>' +
        '<div class="seg">' + [['2026-07', 'Juillet'], ['2026-08', 'Août']].map(function (m) {
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
function formNewResa(pid) {
  var r = state.nr;
  var premier = state.services[0];
  return '<div class="pop" style="margin-top:14px;padding:16px;background:var(--sand);border-radius:16px">' +
    '<div class="cols" style="gap:12px">' +
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
    '</div>' +
    '<div style="display:flex;gap:10px;align-items:center;margin-top:14px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn--primary btn--sm"' + act('create-resa', { pid: pid }) + '>Enregistrer la réservation</button>' +
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
    '<div style="margin-top:14px"><label class="lab" for="lv-mot-' + pid + '">Mot d\'accueil</label>' +
      '<textarea class="inp" id="lv-mot-' + pid + '" data-fid="lv-mot-' + pid + '" data-in="livret-mot" data-pid="' + pid + '">' + esc(lv.mot || '') + '</textarea></div>' +
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
          '<div style="font:700 15px Figtree,sans-serif">' + esc(x.titre) + '</div>' +
          '<div style="font:500 13.5px/1.55 Figtree,sans-serif;color:var(--muted3);margin-top:5px;white-space:pre-wrap">' + esc(x.texte) + '</div>' +
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

  return '<div style="margin-top:22px">' + entete + onglets + liste +
    livretCopie(pid, sec, blocs) + ajout + '</div>';
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

/* --- Livret d'accueil : page du voyageur --------------------------------- */

/** Bandeau de retour, visible seulement quand le propriétaire regarde l'aperçu. */
function lvBack(path, label) {
  if (state.auth !== 'owner') return '';
  return '<div class="lv-back"><button type="button"' + act('nav', { path: path }) + '>← ' + label + '</button>' +
    '<span>Aperçu — c\'est ce que verra le voyageur.</span></div>';
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

  var cles = [['Arrivée à partir de', heureArrivee], ['Départ avant', inf.checkout],
    ['Code d\'accès', inf.code], ['Wi-Fi', inf.wifi]].filter(function (r) { return r[1]; });

  var tuiles = LIVRET_SECTIONS.filter(function (s) { return (lv[s.k] || []).length; }).map(function (s) {
    var n = lv[s.k].length;
    return '<button type="button" class="lv-tile"' + act('nav', { path: '#/livret/' + pid + '/' + s.k }) + '>' +
      '<span class="lv-tile-ico" aria-hidden="true">' + s.icon + '</span>' +
      '<span class="lv-tile-txt"><span class="lv-tile-h">' + esc(s.label) + '</span>' +
        '<span class="lv-tile-s">' + esc(s.hint) + '</span></span>' +
      '<span class="lv-tile-n num">' + n + '</span>' +
      '<span class="lv-tile-go" aria-hidden="true">→</span>' +
      '</button>';
  }).join('');

  return '<div class="livret">' + lvBack('#/admin/biens/' + pid, 'Revenir à la fiche du bien') +
    '<header class="lv-head" style="background:' + b.tint + '">' +
      '<div class="lv-logo">WARME House</div>' +
      '<h1 class="lv-title">' + esc(b.name) + '</h1>' +
      '<p class="lv-city">' + esc([b.address, b.city].filter(Boolean).join(', ')) + '</p>' +
      (lv.mot ? '<p class="lv-mot">' + esc(lv.mot) + '</p>' : '') +
    '</header>' +
    (cles.length ? '<div class="lv-keys">' + cles.map(function (r) {
      return '<div class="lv-key"><div class="k">' + r[0] + '</div><div class="v num">' + esc(r[1]) + '</div></div>';
    }).join('') + '</div>' : '') +
    livretVoyageur(pid, inf) +
    (tuiles
      ? '<div class="lv-tiles">' + tuiles + '</div>'
      : '<p class="empty" style="padding:30px 24px">Le livret de ce logement n\'est pas encore rempli.</p>') +
    '<footer class="lv-foot">Bon séjour ! — WARME House</footer>' +
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
      '<button type="button" class="lv-return"' + act('nav', { path: '#/livret/' + pid }) + '>← Le livret</button>' +
      '<div class="lv-sec-ico" aria-hidden="true">' + s.icon + '</div>' +
      '<h1 class="lv-title">' + esc(s.label) + '</h1>' +
      '<p class="lv-city">' + esc(b.name) + '</p>' +
    '</header>' +
    '<section class="lv-section">' + (blocs.length ? blocs.map(function (x) {
      return '<article class="lv-bloc">' +
        '<h3 class="lv-h3">' + esc(x.titre) + '</h3>' +
        (x.texte ? '<p class="lv-p">' + esc(x.texte) + '</p>' : '') +
        (x.adresse ? '<a class="lv-adresse" href="' + esc(planUrl(x.adresse)) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="lv-adresse-ico" aria-hidden="true">📍</span>' +
          '<span class="grow">' + esc(x.adresse) + '</span>' +
          '<span class="lv-adresse-go">Y aller →</span></a>' : '') +
        (x.media ? '<a class="lv-media" href="' + esc(x.media) + '" target="_blank" rel="noopener noreferrer">' +
          'Voir la photo ou la vidéo →</a>' : '') +
        '</article>';
    }).join('') : '<p class="empty">Cette rubrique est vide.</p>') + '</section>' +
    (s.k === 'depart' ? livretDepart(pid) : '') +
    '<div class="lv-section"><button type="button" class="btn btn--quiet"' +
      act('nav', { path: '#/livret/' + pid }) + '>← Revenir au livret</button></div>' +
    '<footer class="lv-foot">Bon séjour ! — WARME House</footer>' +
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
      act('avis-send', { pid: pid, kind: kind }) + '>Envoyer ma note</button>' +
    '</div>';
}

/** Merci affiché une fois la note envoyée. */
function avisMerci(v, titre) {
  return '<div class="lv-card lv-card--done">' +
    '<h2 class="lv-card-h">' + esc(titre) + '</h2>' +
    starsRead(v.stars) +
    (v.texte ? '<p class="lv-card-p">« ' + esc(v.texte) + ' »</p>' : '') +
    '<p class="lv-card-p" style="margin-top:8px">Merci, c\'est bien enregistré.</p>' +
    '</div>';
}

/** Le bloc « départ » : rappel et bouton, réutilisé sur la rubrique du même nom. */
function livretDepart(pid) {
  var cur = stayLeaving(pid);
  if (!cur) return '';
  var parti = departAt(pid, cur);
  var inf = state.info[pid] || {};

  if (parti) {
    return '<div class="lv-section"><div class="lv-card lv-card--done">' +
      '<h2 class="lv-card-h">✓ Votre départ est signalé</h2>' +
      '<p class="lv-card-p">Enregistré à ' + esc(parti) + '. Le ménage a été prévenu que le logement est libre. ' +
      'Merci et à bientôt !</p></div></div>';
  }
  return '<div class="lv-section"><div class="lv-card lv-card--go">' +
    '<h2 class="lv-card-h">Vous quittez le logement ?</h2>' +
    '<p class="lv-card-p">Prévenez-nous en un geste : la personne qui fait le ménage saura que le logement ' +
      'est libre et pourra commencer plus tôt. Départ prévu avant ' + esc(inf.checkout || '11:00') + '.</p>' +
    '<button type="button" class="btn btn--primary" style="margin-top:14px"' +
      act('livret-depart', { pid: pid }) + '>J\'ai quitté le logement</button>' +
    '</div></div>';
}

/** Tout ce qui s'adresse personnellement au voyageur, sur l'accueil du livret. */
function livretVoyageur(pid, inf) {
  var out = '';

  // 1. Le ménage est fini avant l'heure : le logement est prêt en avance.
  var rd = readyInfo(pid);
  if (rd) {
    out += '<div class="lv-section"><div class="lv-card lv-card--ready">' +
      '<div class="lv-ready-badge">✨ Le logement est prêt !</div>' +
      '<p class="lv-card-p">Le ménage s\'est terminé à ' + esc(rd.fin) + '. Vous n\'avez pas besoin d\'attendre ' +
      esc(inf.checkin || '16:00') + ' : vous pouvez arriver dès <strong>' + esc(rd.at) + '</strong>.' +
      (rd.plancher ? ' Nous ne proposons pas d\'arrivée avant ' + EARLY_FLOOR + '.' : '') + '</p>' +
      '</div></div>';
  }

  // 2. Départ du jour : bouton avant, accusé de réception après.
  out += livretDepart(pid);

  // 3. Note de la propreté, par celui qui occupe le logement.
  var cur = stayCurrent(pid);
  if (cur) {
    var aMenage = avisDone(pid, cur, 'menage');
    out += '<div class="lv-section">' + (aMenage
      ? avisMerci(aMenage, 'Votre note sur la propreté')
      : avisForm(pid, 'menage', 'Le logement était-il bien propre ?',
          'Notez la propreté que vous avez trouvée en arrivant. Votre note va directement à la personne qui a fait le ménage.',
          'Un mot sur la propreté (facultatif)')) + '</div>';
  }

  // 4. Note du séjour, par celui qui s'en va.
  var part = stayLeaving(pid);
  if (part) {
    var aSejour = avisDone(pid, part, 'sejour');
    out += '<div class="lv-section">' + (aSejour
      ? avisMerci(aSejour, 'Votre avis sur le séjour')
      : avisForm(pid, 'sejour', 'Comment s\'est passé votre séjour ?',
          'Votre avis nous aide à améliorer le logement pour les prochains voyageurs.',
          'Ce que vous avez aimé, ce qui pourrait être mieux (facultatif)')) + '</div>';
  }

  return out;
}

function bienIcal(pid) {
  var feeds = [
    { cls: 'feed--ok', dot: C.vert, fg: 'var(--green-t)', source: 'Airbnb', url: 'airbnb.fr/calendar/ical/' + pid + '9f2c.ics', status: 'Synchronisé' },
    pid === 'p4'
      ? { cls: 'feed--warn', dot: C.terracotta, fg: 'var(--terra-d)', source: 'Booking.com', url: 'admin.booking.com/ical/…', status: 'À reconnecter' }
      : { cls: 'feed--ok', dot: C.vert, fg: 'var(--green-t)', source: 'Booking.com', url: 'admin.booking.com/ical/' + pid + '7b1.ics', status: 'Synchronisé' }
  ].concat((state.extraFeeds[pid] || []).map(function (u) {
    return { cls: 'feed--new', dot: C.bleu, fg: 'var(--blue-t)', source: 'Lien manuel', url: u, status: 'En attente' };
  }));

  return '<div class="card" style="margin-top:22px;padding:22px">' +
    '<h2 style="font:700 16px Figtree,sans-serif;margin:0">Liens iCal de ce bien</h2>' +
    '<p class="sec-note" style="margin-top:4px">Chaque check-out détecté crée une mission de ménage planifiée le jour du départ.</p>' +
    '<div class="stack" style="margin-top:16px">' + feeds.map(function (f) {
      return '<div class="feed ' + f.cls + '">' +
        '<span class="dot" style="background:' + f.dot + '"></span>' +
        '<div style="flex:1;min-width:200px"><div style="font:600 13.5px Figtree,sans-serif">' + esc(f.source) + '</div>' +
        '<div class="url">' + esc(f.url) + '</div></div>' +
        '<span style="font:600 12px Figtree,sans-serif;color:' + f.fg + ';flex:none">' + f.status + '</span></div>';
    }).join('') + '</div>' +
    '<div style="margin-top:18px;display:flex;gap:12px;flex-wrap:wrap">' +
      '<input class="inp" style="flex:1;min-width:260px" type="text" placeholder="Coller un nouveau lien iCal…" value="' + esc(state.newFeed) + '" data-fid="new-feed" data-in="new-feed">' +
      '<button type="button" class="btn btn--dark btn--sm"' + act('add-feed', { pid: pid }) + '>Connecter</button>' +
    '</div></div>';
}

/* ==========================================================================
   Écran de connexion
   ========================================================================== */

function viewLogin() {
  var isOwner = state.loginRole === 'owner';
  return '<div class="login"><div class="login-card">' +
    '<div class="login-logo">WARME House</div>' +
    '<p class="login-sub">Gestion du ménage et des stocks de vos locations courte durée.</p>' +
    '<div class="login-seg">' +
      '<button type="button" aria-pressed="' + isOwner + '"' + act('login-role', { r: 'owner' }) + '>Propriétaire</button>' +
      '<button type="button" aria-pressed="' + !isOwner + '"' + act('login-role', { r: 'presta' }) + '>Prestataire</button>' +
    '</div>' +
    (isOwner ? '' :
      '<div class="login-field"><label class="lab" for="lg-who">Qui es-tu ?</label>' +
        '<select class="inp" id="lg-who" data-fid="lg-who" data-ch="login-presta">' + state.agents.map(function (a) {
          return '<option value="' + a.id + '"' + (state.loginPresta === a.id ? ' selected' : '') + '>' + esc(a.name + ' · ' + a.role) + '</option>';
        }).join('') + '</select></div>') +
    '<div class="login-field"><label class="lab" for="lg-mail">E-mail</label>' +
      '<input class="inp" id="lg-mail" type="email" autocomplete="username" value="' + esc(state.loginEmail) + '" data-fid="lg-mail" data-in="login-email"></div>' +
    '<div class="login-field"><label class="lab" for="lg-pwd">Mot de passe</label>' +
      '<input class="inp" id="lg-pwd" type="password" autocomplete="current-password" value="' + esc(state.loginPwd) + '" data-fid="lg-pwd" data-in="login-pwd"></div>' +
    '<button type="button" class="btn btn--primary" style="margin-top:22px"' + act('login') + '>Se connecter</button>' +
    '<p class="login-hint">' + (isOwner
      ? 'Accès propriétaire : biens, missions, stocks, prestataires.'
      : 'Accès prestataire : missions, checklists, gains.') +
      '<br>Démonstration : n\'importe quel mot de passe fonctionne.</p>' +
    '</div></div>';
}

/* ==========================================================================
   7. Actions
   ========================================================================== */

function take(id) {
  var m = mission(id);
  if (!m || m.status !== 'dispo') return;
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
  go('#/app/missions/' + id + '/checklist');
}

function shoot(mid, sid) {
  var ph = state.photos[mid] || {};
  ph[sid] = !ph[sid];
  state.photos[mid] = ph;
  flash = ph[sid] ? mid + sid : null;
  save();
  render();
  if (flash) setTimeout(function () { flash = null; }, 700);
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

  // Compte rendu figé : la checklist du bien peut être modifiée ensuite,
  // la revue du propriétaire doit rester le reflet de ce qui a été fait.
  state.reports[id] = {
    agent: state.me,
    dateLabel: '30 juil.',
    price: m.price,
    photos: photos,
    rooms: rooms(m.prop).map(function (r) {
      return {
        name: r.name,
        steps: r.steps.map(function (s) { return { label: s.label, photo: s.photo, done: !!ph[s.id] }; })
      };
    }),
    qty: Object.assign({}, d.qty),
    lows: lowKeys
  };

  state.stock[d.prop] = Object.assign({}, d.qty);
  m.status = 'termine';
  m.review = null;
  m.redo = '';

  // Logement prêt : si c'est avant l'heure d'arrivée prévue et que le bien
  // l'autorise, le voyageur suivant le verra dans son livret d'accueil.
  state.ready[m.prop] = { date: m.date, at: nowHM(), mid: id, agent: state.me };
  if (!m.taker) m.taker = state.me;
  state.done.push({ mid: id, agent: state.me, month: CURRENT_MONTH, prop: m.prop, type: m.type, dateLabel: '30 juil.', price: m.price });
  state.lastDone = { price: m.price, photos: photos, low: lowKeys.length };
  state.draft = null;
  save();
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
  'login-role': function (el) {
    state.loginRole = el.dataset.r;
    state.loginEmail = el.dataset.r === 'owner' ? 'julien@warmehouse.fr' : agent(state.loginPresta).email;
    render();
  },
  login: function () {
    state.auth = state.loginRole;
    if (state.loginRole === 'presta') {
      state.me = state.loginPresta;
      state.openAgent = state.loginPresta;
    }
    save();
    location.replace(state.auth === 'owner' ? '#/admin' : '#/app/missions');
    render();
  },
  logout: function () {
    state.auth = null;
    state.draft = null;
    save();
    location.replace('#/login');
    render();
  },
  reset: function () {
    if (!confirm('Remettre la démonstration à zéro ? Les missions prises, les photos, les stocks et les checklists modifiées reviendront à leur état d\'origine.')) return;
    resetDemo();
    location.replace(state.auth === 'owner' ? '#/admin' : '#/app/missions');
    render();
  },

  /* Prestataire ---------------------------------------------------------- */
  take: function (el) { take(el.dataset.id); },
  start: function (el) { start(el.dataset.id); },
  resume: function (el) { start(el.dataset.id); },
  shoot: function (el) { shoot(el.dataset.mid, el.dataset.sid); },
  bump: function (el) { bump(el.dataset.k, parseInt(el.dataset.d, 10)); render(); },
  finish: function (el) { finish(el.dataset.id); },
  'm-stock-group': function (el) { state.mStockGroup = el.dataset.g; save(); render(); },
  'toggle-gain': function (el) {
    state.openGainMonth = state.openGainMonth === el.dataset.m ? null : el.dataset.m;
    save(); render();
  },
  'problem-kind': function (el) { state.problemKind = el.dataset.k; save(); render(); },
  'problem-photo': function () { state.problemPhoto = !state.problemPhoto; save(); render(); },
  'send-problem': function (el) {
    state.problems.push({ kind: state.problemKind, agent: state.me, mission: el.dataset.id });
    state.problemKind = null;
    state.problemPhoto = false;
    save();
    go('#/app/missions/' + el.dataset.id + '/checklist');
  },

  /* Propriétaire --------------------------------------------------------- */
  'mission-filter': function (el) { state.missionFilter = el.dataset.f; save(); render(); },
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
    state.checklists[pid] = [];
    state.info[pid] = { capacity: '', surface: '', code: '', wifi: '', parking: '', linge: '', checkin: '16:00', checkout: '11:00', early: true };
    state.notes[pid] = '';
    state.resas[pid] = [];
    state.livret[pid] = lvVide();

    state.nb = { name: '', city: '', address: '', color: C.terracotta };
    state.showNewBien = false;
    state.bienTab = 'infos';
    save();
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
    save();
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
  'toggle-new-resa': function () { state.showNewResa = !state.showNewResa; save(); render(); },
  'create-resa': function (el) { createResa(el.dataset.pid); },
  'remove-resa': function (el) {
    var pid = el.dataset.pid, ri = parseInt(el.dataset.ri, 10);
    var list = resasOf(pid);
    var r = list[ri];
    if (!r) return;
    if (!confirm('Supprimer la réservation de ' + r.guest + ' ?\n\nLa mission créée à son départ, ' +
      'si elle n\'a pas encore été prise, sera retirée elle aussi.')) return;
    state.resas[pid] = list.filter(function (x, i) { return i !== ri; });
    state.missions = state.missions.filter(function (m) {
      return !(m.fromResa === pid + ':' + r.start + ':' + r.end && m.status === 'dispo');
    });
    save(); render();
  },

  /* Livret d'accueil ------------------------------------------------------ */
  /* La sélection de blocs repose sur leur rang : dès que la liste bouge —
     changement de rubrique, ajout, suppression, déplacement — on repart de
     « tout coché » plutôt que de garder des rangs devenus faux. */
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

  /* Ce que le voyageur fait depuis son livret ------------------------------ */

  /* « J'ai quitté le logement » : la mission du jour passe en logement libre. */
  'livret-depart': function (el) {
    var pid = el.dataset.pid;
    var r = stayLeaving(pid);
    if (!r) return;
    state.departs[resaKey(pid, r)] = nowHM();
    save(); render();
  },

  /* Choix du nombre d'étoiles, avant l'envoi. */
  'avis-star': function (el) {
    var key = el.dataset.key;
    var d = state.avisDrafts[key] || (state.avisDrafts[key] = { stars: 0, texte: '' });
    d.stars = parseInt(el.dataset.n, 10) || 0;
    save(); render();
  },

  /* Envoi de la note. Une note de ménage est rattachée à la mission qui a
     préparé le logement, donc au prestataire qui l'a faite. */
  'avis-send': function (el) {
    var pid = el.dataset.pid, kind = el.dataset.kind, key = pid + ':' + kind;
    var d = state.avisDrafts[key] || { stars: 0, texte: '' };
    if (!d.stars) { alert('Choisissez d\'abord un nombre d\'étoiles.'); return; }
    var r = stayForAvis(pid, kind);
    if (!r) return;
    if (avisDone(pid, r, kind)) return;

    var m = kind === 'menage' ? cleanerFor(pid, r) : null;
    state.avis.push({
      id: 'av' + Date.now(),
      pid: pid, resa: resaKey(pid, r), kind: kind,
      stars: d.stars, texte: (d.texte || '').trim(),
      guest: r.guest,
      agent: m ? (m.taker || null) : null,
      mid: m ? m.id : null,
      dateLabel: fmtDate(TODAY)
    });
    delete state.avisDrafts[key];
    save(); render();
  },

  /* Prestataires ---------------------------------------------------------- */
  'toggle-new-agent': function () { state.showNewAgent = !state.showNewAgent; save(); render(); },
  'na-color': function (el) { state.na.color = el.dataset.c; save(); render(); },
  'create-agent': function () {
    var na = state.na, nom = (na.name || '').trim();
    if (!nom) { alert('Donnez un nom au prestataire.'); return; }
    if (state.agents.some(function (a) { return a.name.toLowerCase() === nom.toLowerCase(); })) {
      alert('Un prestataire porte déjà ce nom.'); return;
    }
    var pal = PALETTE.find(function (c) { return c.color === na.color; }) || PALETTE[0];
    var mots = nom.split(/\s+/);
    var init = (mots[0][0] + (mots[1] ? mots[1][0] : '')).toUpperCase();

    state.agents.push({
      id: slug(nom, 'a'), name: nom, init: init, role: (na.role || 'Ménage').trim(),
      since: MONTHS[0].label.toLowerCase(), note: '—', email: (na.email || '').trim(),
      iban: 'IBAN à renseigner',
      avatarBg: pal.tint, avatarFg: pal.fg, roleBg: pal.tint, roleFg: pal.fg,
      props: state.props.map(function (p) { return p.id; })
    });
    state.na = { name: '', role: 'Ménage', email: '', color: C.terracotta };
    state.showNewAgent = false;
    save(); render();
  },
  'remove-agent': function (el) {
    var id = el.dataset.ag, a = agent(id);
    if (state.agents.length <= 1) { alert('Gardez au moins un prestataire.'); return; }
    var enCours = state.missions.filter(function (m) {
      return m.taker === id && m.status !== 'termine';
    });
    if (enCours.length && !confirm(enCours.length + ' mission(s) en cours lui sont attribuées. ' +
      'Elles repartiront dans les missions disponibles.\n\nSupprimer ' + a.name + ' ?')) return;
    if (!enCours.length && !confirm('Supprimer ' + a.name + ' ?\n\nSes missions déjà réalisées restent dans l\'historique des paiements.')) return;

    enCours.forEach(function (m) { m.status = 'dispo'; m.taker = null; });
    state.agents = state.agents.filter(function (x) { return x.id !== id; });
    if (state.me === id) state.me = state.agents[0].id;
    if (state.loginPresta === id) state.loginPresta = state.agents[0].id;
    if (state.openAgent === id) state.openAgent = null;
    save(); render();
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
  /* Ouvre le message d'invitation dans la messagerie du propriétaire.
     L'application ne peut pas l'envoyer elle-même : il n'y a pas de serveur. */
  'invite-agent': function (el) {
    var a = state.agents.find(function (x) { return x.id === el.dataset.ag; });
    if (!a) return;
    if (!a.email) {
      alert('Ce prestataire n\'a pas d\'adresse e-mail.\n\n' +
        'Supprimez-le et recréez-le avec son adresse, ou utilisez « Copier le message » ' +
        'pour le lui envoyer par SMS ou WhatsApp.');
      return;
    }
    a.invited = fmtDate(TODAY);
    save();
    location.href = inviteMailto(a);
    render();
  },

  /* Repli sans messagerie : le texte part dans le presse-papiers, pour être
     collé dans un SMS ou un WhatsApp. Si le navigateur refuse le
     presse-papiers, on affiche quand même le texte : il ne faut jamais que
     le bouton reste sans effet visible. */
  'invite-copy': function (el) {
    var a = state.agents.find(function (x) { return x.id === el.dataset.ag; });
    if (!a) return;
    var texte = inviteTexte(a);

    var marquer = function () { a.invited = fmtDate(TODAY); save(); render(); };
    var replier = function () {
      marquer();
      prompt('Sélectionnez ce message et copiez-le :', texte);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texte).then(function () {
        marquer();
        alert('Message copié.\n\nCollez-le dans un SMS, un WhatsApp ou un e-mail.');
      }, replier);
    } else {
      replier();
    }
  },

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
function createResa(pid) {
  var r = state.nr;
  var nom = (r.guest || '').trim();
  if (!nom) { alert('Indiquez le nom du voyageur.'); return; }
  if (!r.start || !r.end) { alert('Indiquez les dates d\'arrivée et de départ.'); return; }
  if (r.end <= r.start) { alert('Le départ doit être après l\'arrivée.'); return; }

  var guests = Math.max(1, parseInt(r.guests, 10) || 1);
  var resa = { plat: r.plat, guest: nom, guests: guests, start: r.start, end: r.end };
  state.resas[pid] = resasOf(pid).concat([resa]).sort(function (a, b) {
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  });

  var sv = state.services[0];
  if (sv) {
    // Séjour qui commence le jour du départ : c'est un turnover.
    var suivante = resasOf(pid).find(function (x) { return x.start === r.end && x !== resa; });
    var inf = state.info[pid] || {};
    state.missions.push({
      id: slug(nom, 'm'), prop: pid, type: sv.key, date: r.end,
      dateLabel: r.end === TODAY ? 'Aujourd’hui' : fmtDate(r.end),
      windowLabel: (inf.checkout || '11:00') + ' → ' + (inf.checkin || '16:00'),
      price: (state.tariffs[pid] || {})[sv.key] || 0,
      status: 'dispo',
      urgent: suivante ? 'Turnover · arrivée ' + (inf.checkin || '16:00') : '',
      turnover: !!suivante,
      note: '',
      fromResa: pid + ':' + r.start + ':' + r.end,
      res: { plat: r.plat, guest: nom, guests: guests, nights: nights(r.start, r.end) },
      next: suivante ? { guest: suivante.guest, guests: suivante.guests, at: inf.checkin || '16:00' } : null
    });
    state.missions.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  state.nr = { plat: r.plat, guest: '', guests: 2, start: '', end: '' };
  state.showNewResa = false;
  save(); render();
}

/* Saisies silencieuses : mettent l'état à jour sans redessiner l'écran,
   pour ne pas faire perdre le curseur pendant la frappe. */
var inputs = {
  'login-email': function (el) { state.loginEmail = el.value; },
  'login-pwd': function (el) { state.loginPwd = el.value; },
  'nm-window': function (el) { state.nm.window = el.value; },
  'nm-price': function (el) { state.nm.price = parseInt(el.value || '0', 10) || 0; },
  'nm-note': function (el) { state.nm.note = el.value; },
  'bien-field': function (el) { setBienField(el); },
  'bien-notes': function (el) { state.notes[el.dataset.pid] = el.value; save(); },
  'step-draft': function (el) { state.stepDrafts[el.dataset.key] = el.value; },
  'new-room': function (el) { state.newRoom = el.value; },
  'new-feed': function (el) { state.newFeed = el.value; },

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
    if (lv) { lv.mot = el.value; save(); }
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
  'login-presta': function (el) {
    state.loginPresta = el.value;
    state.loginEmail = agent(el.value).email;
    render();
  },
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
  'nr-plat': function (el) { state.nr.plat = el.value; save(); },
  'nr-start': function (el) { state.nr.start = el.value; save(); },
  'nr-end': function (el) { state.nr.end = el.value; save(); },
  'owner-month': function (el) { state.ownerMonth = el.value; save(); render(); },
  'avis-filter': function (el) { state.avisFilter[el.dataset.f] = el.value; save(); render(); }
};

/* ==========================================================================
   8. Rendu et démarrage
   ========================================================================== */

var VIEWS = {
  'login': viewLogin,
  'livret': viewLivret,
  'livret-sec': viewLivretSection,
  'p-missions': viewPrestaMissions,
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
  'o-missions': viewOwnerMissions,
  'o-mission': viewOwnerMission,
  'o-agents': viewOwnerAgents,
  'o-avis': viewOwnerAvis,
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

  document.title = state.auth === 'presta' ? 'WARME House — prestataire'
    : state.auth === 'owner' ? 'WARME House — propriétaire'
      : 'WARME House';
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
  if (el && (el.dataset.in === 'login-email' || el.dataset.in === 'login-pwd')) actions.login();
});

window.addEventListener('hashchange', render);

// Sauvegarde de sécurité : la frappe en cours n'est pas perdue en quittant la page.
window.addEventListener('beforeunload', save);

load();
if (!location.hash) location.replace(state.auth === 'owner' ? '#/admin' : state.auth ? '#/app/missions' : '#/login');
render();
