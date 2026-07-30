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

var TYPE_ORDER = ['menage', 'menage_jardin', 'stock', 'maintenance'];
var TYPES = {
  menage: { label: 'Ménage après séjour', duration: '≈ 2 h' },
  menage_jardin: { label: 'Ménage + extérieur', duration: '≈ 3 h' },
  stock: { label: 'Réapprovisionnement', duration: '≈ 45 min' },
  maintenance: { label: 'Petite réparation', duration: '≈ 1 h' }
};

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

var AGENTS = [
  { id: 'Sofia', name: 'Sofia Lemaire', init: 'SL', role: 'Référente ménage', since: 'mars 2025', note: '4,9', email: 'sofia.lemaire@mail.fr', iban: 'IBAN ··· 4417', avatarBg: '#F7E7DF', avatarFg: '#B04A26', roleBg: '#F7E7DF', roleFg: '#B04A26' },
  { id: 'Amandine', name: 'Amandine Roux', init: 'AR', role: 'Ménage', since: 'janv. 2026', note: '4,8', email: 'amandine.roux@mail.fr', iban: 'IBAN ··· 8102', avatarBg: '#E4EDF4', avatarFg: '#2F6C93', roleBg: '#E4EDF4', roleFg: '#2F6C93' },
  { id: 'Karim', name: 'Karim Belaïd', init: 'KB', role: 'Maintenance & extérieur', since: 'sept. 2025', note: '5,0', email: 'karim.belaid@mail.fr', iban: 'IBAN ··· 2390', avatarBg: '#E3F0E9', avatarFg: '#227052', roleBg: '#E3F0E9', roleFg: '#227052' }
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

var FLAT = ARTICLES.reduce(function (acc, g) {
  return acc.concat(g[1].map(function (a) {
    return { key: a[0], label: a[1], unit: a[2], par: a[3], seuil: a[4], group: g[0] };
  }));
}, []);
var GROUPS = ARTICLES.map(function (g) { return g[0]; });

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
  p1: { capacity: '4 voyageurs', surface: '46 m²', code: 'Boîte à clés — 4821', wifi: 'NidVieuxPort / soleil2024', parking: 'Parking Estienne, place 34', linge: '2 parures, 6 serviettes' },
  p2: { capacity: '2 voyageurs', surface: '28 m²', code: 'Digicode 12B45 · clé sous tapis', wifi: 'CanalStM / paris1900', parking: 'Aucun', linge: '1 parure, 4 serviettes' },
  p3: { capacity: '6 voyageurs', surface: '140 m²', code: 'Portail 7788 · clé maison', wifi: 'Oliviers / cigales2025', parking: '2 places dans l’allée', linge: '3 parures, 12 serviettes' },
  p4: { capacity: '3 voyageurs', surface: '62 m²', code: 'Boîte à clés — 9021', wifi: 'LoftBellecour / rhone77', parking: 'Parking Bellecour', linge: '2 parures, 6 serviettes' }
};

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
  var s = {};
  PROPS.forEach(function (p, pi) {
    s[p.id] = {};
    FLAT.forEach(function (a, ai) {
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
  FLAT.forEach(function (a) { s[a.key] = a.seuil; });
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
    nm: { prop: 'p1', type: 'menage', date: '2026-08-05', window: '11:00 → 15:00', price: 65 },
    stepDrafts: {},
    newRoom: '',
    newFeed: '',
    problemKind: null,
    problemPhoto: false
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
    if (!raw) return;
    var saved = JSON.parse(raw);
    var base = initialState();
    Object.keys(base).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(saved, k) && saved[k] !== undefined) base[k] = saved[k];
    });
    state = base;
  } catch (e) {
    state = initialState();
  }
}

function resetDemo() {
  var auth = state.auth, me = state.me;
  state = initialState();
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

function prop(id) { return PROPS.find(function (p) { return p.id === id; }); }
function agent(id) { return AGENTS.find(function (a) { return a.id === id; }); }
function mission(id) { return state.missions.find(function (m) { return m.id === id; }); }
function rooms(pid) { return state.checklists[pid] || []; }

function stepIds(pid) {
  return rooms(pid).reduce(function (a, r) {
    return a.concat(r.steps.map(function (s) { return s.id; }));
  }, []);
}

function photoCount(m) {
  var ph = state.photos[m.id] || {};
  return stepIds(m.prop).filter(function (s) { return ph[s]; }).length;
}

function ledger() { return state.done.concat(HISTORY); }
function monthRows(a, month) { return ledger().filter(function (r) { return r.agent === a && r.month === month; }); }
function monthTotal(a, month) { return monthRows(a, month).reduce(function (n, r) { return n + r.price; }, 0); }

function lowsFor(pid) {
  return FLAT.filter(function (a) { return (state.stock[pid][a.key] || 0) <= state.seuils[a.key]; });
}

/** Attributs d'une action cliquable : nom + paramètres optionnels. */
function act(name, params) {
  var out = ' data-a="' + esc(name) + '"';
  if (params) Object.keys(params).forEach(function (k) { out += ' data-' + k + '="' + esc(params[k]) + '"'; });
  return out;
}

/* ==========================================================================
   4. Routage
   ========================================================================== */

var route = { name: 'login', id: null };

var PRESTA_TABS = [
  { key: 'missions', path: '#/app/missions', label: 'Disponibles' },
  { key: 'mes-missions', path: '#/app/mes-missions', label: 'Mes missions' },
  { key: 'gains', path: '#/app/gains', label: 'Gains' },
  { key: 'profil', path: '#/app/profil', label: 'Profil' }
];

var OWNER_NAV = [
  { key: 'dash', path: '#/admin', label: 'Tableau de bord', color: C.terracotta },
  { key: 'missions', path: '#/admin/missions', label: 'Missions', color: C.bleu },
  { key: 'agents', path: '#/admin/prestataires', label: 'Prestataires', color: '#8A6A4F' },
  { key: 'stocks', path: '#/admin/stocks', label: 'Stocks', color: C.ambre },
  { key: 'biens', path: '#/admin/biens', label: 'Biens & iCal', color: C.vert }
];

function parseRoute() {
  var h = location.hash.replace(/^#/, '');
  var seg = h.split('/').filter(Boolean);          // ex. ['app','missions','m1','checklist']

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
    if (seg[1] === 'gains') return { name: 'p-gains', id: null };
    if (seg[1] === 'profil') return { name: 'p-profil', id: null };
    return { name: 'p-missions', id: null };
  }

  if (seg[0] === 'admin') {
    if (seg[1] === 'missions') return { name: 'o-missions', id: null };
    if (seg[1] === 'prestataires') return { name: 'o-agents', id: null };
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

  if (!state.auth) {
    if (r.name !== 'login') { location.replace('#/login'); return null; }
    return r;
  }
  if (state.auth === 'presta' && (isOwner || r.name === 'login')) { location.replace('#/app/missions'); return null; }
  if (state.auth === 'owner' && (isPresta || r.name === 'login')) { location.replace('#/admin'); return null; }

  // Une mission ouverte doit exister.
  if (r.id && isPresta && !mission(r.id)) { location.replace('#/app/missions'); return null; }

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
  var p = prop(m.prop), ty = TYPES[m.type], st = STATUS[m.status];
  var total = stepIds(m.prop).length, done = photoCount(m);
  var canStart = m.date <= TODAY;
  var mine = m.taker === state.me;

  var ctaLabel, ctaCls, ctaAction = '';
  if (m.status === 'termine') { ctaLabel = 'Mission terminée'; ctaCls = 'btn--muted'; }
  else if (m.status === 'encours') { ctaLabel = 'Reprendre la checklist'; ctaCls = 'btn--go'; ctaAction = 'resume'; }
  else if (canStart) { ctaLabel = 'Commencer la mission'; ctaCls = 'btn--go'; ctaAction = 'start'; }
  else { ctaLabel = 'Démarrage le ' + m.dateLabel.toLowerCase(); ctaCls = 'btn--muted'; }

  return {
    id: m.id, raw: m, mine: mine,
    propName: p.name, city: p.city, address: p.address + ', ' + p.city, color: p.color, tint: p.tint,
    typeLabel: ty.label, durationLabel: ty.duration,
    dateLabel: m.dateLabel, windowLabel: m.windowLabel,
    day: m.date.split('-')[2], month: MOIS[parseInt(m.date.split('-')[1], 10) - 1],
    priceLabel: m.price + ' €',
    urgent: !!m.urgent, urgentLabel: m.urgent,
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
  var dispoCount = state.missions.filter(function (m) { return m.status === 'dispo'; }).length;
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

function viewPrestaMissions() {
  var list = state.missions.filter(function (m) { return m.status === 'dispo'; }).map(decorate);
  var body = '<div class="stack">' + (list.length
    ? list.map(missionCard).join('')
    : '<p class="empty">Aucune mission disponible pour le moment.</p>') +
    '<p class="center sec-note" style="padding-top:8px">Une mission apparaît dès qu\'un check-out est détecté sur l\'iCal.</p>' +
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
    '<div class="mission-chips">' +
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
        '<div class="num" style="font:500 11.5px Figtree,sans-serif;color:var(--muted2);margin-top:1px">' + esc(r.dateLabel) + ' · ' + esc(TYPES[r.type].label) + '</div></div>' +
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
    btn = { label: 'Commencer la mission', cls: 'btn--go', action: 'start', note: 'À faire dans le créneau indiqué' };
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
        '<h2 style="font:700 14px Figtree,sans-serif;margin:0 0 8px">Accès & consignes</h2>' +
        [['Capacité', inf.capacity], ['Surface', inf.surface], ['Accès', inf.code],
         ['Wi-Fi', inf.wifi], ['Linge', inf.linge], ['Consigne', state.notes[m.prop]]]
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
      ['Tous'].concat(GROUPS).map(function (g) {
        return '<button type="button" class="chip chip--sm" aria-pressed="' + (state.mStockGroup === g) + '"' +
          act('m-stock-group', { g: g }) + '>' + esc(g) + '</button>';
      }).join('') +
    '</div></div>';

  var groups = state.mStockGroup === 'Tous' ? ARTICLES : ARTICLES.filter(function (g) { return g[0] === state.mStockGroup; });
  var body = '<div class="stack-l">' + groups.map(function (g) {
    return '<section>' +
      '<h2 style="font:700 14px Figtree,sans-serif;margin:0 4px 8px;color:var(--ink-soft)">' + esc(g[0]) + '</h2>' +
      '<div class="card card--flush" style="padding:4px 14px"><div class="list">' +
      g[1].map(function (a) {
        var key = a[0], qty = q[key] || 0, seuil = state.seuils[key], low = qty <= seuil;
        return '<div class="list-row" style="padding:10px 0">' +
          '<div class="grow">' +
            '<div style="font:600 14px Figtree,sans-serif;color:' + (low ? 'var(--terra-d)' : 'var(--ink)') + '">' + esc(a[1]) + '</div>' +
            '<div class="num" style="font:500 11px Figtree,sans-serif;margin-top:1px;color:' + (low ? 'var(--terra-d)' : 'var(--muted2)') + '">' +
              (low ? 'sous le seuil de ' + seuil + ' ' + a[2] : a[2] + ' · dotation ' + a[3]) + '</div>' +
          '</div>' +
          '<div class="stepper">' +
            '<button type="button" aria-label="Retirer un ' + esc(a[1]) + '"' + act('bump', { k: key, d: -1 }) + '>−</button>' +
            '<span class="val num">' + qty + '</span>' +
            '<button type="button" aria-label="Ajouter un ' + esc(a[1]) + '"' + act('bump', { k: key, d: 1 }) + '>+</button>' +
          '</div></div>';
      }).join('') +
      '</div></div></section>';
  }).join('') + '</div>';

  var lowCount = FLAT.filter(function (a) { return (q[a.key] || 0) <= state.seuils[a.key]; }).length;
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
    return '<article class="card" style="border-radius:22px;padding:6px 18px 10px">' +
      '<button type="button" class="gain-month"' + act('toggle-gain', { m: m.key }) + '>' +
        '<div class="grow"><div style="font:700 16px Figtree,sans-serif">' + esc(m.label) + '</div>' +
        '<div class="num" style="font:500 12px Figtree,sans-serif;color:var(--muted);margin-top:2px">' + rows.length + ' missions · ' + esc(m.payNote) + '</div></div>' +
        '<span class="badge ' + (m.paid ? 'badge--green' : 'badge--amber') + '" style="font-size:11.5px;padding:4px 9px">' + (m.paid ? 'Payé' : 'À venir') + '</span>' +
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

/* --- Profil -------------------------------------------------------------- */

function viewPrestaProfil() {
  var me = agent(state.me);
  var rows = [
    ['Biens autorisés', '4 sur 4'],
    ['Note propriétaire', me.note + ' / 5'],
    ['Coordonnées bancaires', me.iban],
    ['Notifications', 'Nouvelles missions']
  ];

  var body = '<div class="stack" style="gap:14px">' +
    '<article class="card" style="border-radius:22px;display:flex;align-items:center;gap:14px">' +
      '<div class="avatar" style="width:56px;height:56px;font-size:19px;background:' + me.avatarBg + ';color:' + me.avatarFg + '">' + me.init + '</div>' +
      '<div><div style="font:700 20px Figtree,sans-serif">' + esc(me.name) + '</div>' +
      '<div style="font:500 13px Figtree,sans-serif;color:var(--muted)">' + esc(me.role) + ' · depuis ' + esc(me.since) + '</div></div>' +
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
      '<div class="rail-sub num">4 biens · 3 prestataires · ' + TODAY_LABEL + '</div></div>' +
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
  var lowByProp = PROPS.map(function (p) { return { p: p, lows: lowsFor(p.id) }; });
  var totalLow = lowByProp.reduce(function (n, x) { return n + x.lows.length; }, 0);
  var m1 = mission('m1');

  var kpis = [
    { v: String(state.missions.filter(function (m) { return m.status !== 'termine'; }).length), l: 'missions à venir', c: C.ink },
    { v: String(openCount), l: 'non prises', c: C.terracotta },
    { v: String(totalLow), l: 'articles sous seuil', c: C.ambre },
    { v: AGENTS.reduce(function (n, a) { return n + monthTotal(a.id, CURRENT_MONTH); }, 0) + ' €', l: 'à payer en juillet', c: C.vert }
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
          '<select class="inp" id="nm-prop" data-fid="nm-prop" data-ch="nm-prop">' + PROPS.map(function (p) {
            return '<option value="' + p.id + '"' + (state.nm.prop === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
          }).join('') + '</select></div>' +
        '<div style="flex:1.4;min-width:180px"><label class="lab" for="nm-type">Type de prestation</label>' +
          '<select class="inp" id="nm-type" data-fid="nm-type" data-ch="nm-type">' + TYPE_ORDER.map(function (t) {
            return '<option value="' + t + '"' + (state.nm.type === t ? ' selected' : '') + '>' + esc(TYPES[t].label) + '</option>';
          }).join('') + '</select></div>' +
        '<div style="flex:1;min-width:150px"><label class="lab" for="nm-date">Date</label>' +
          '<input class="inp num" id="nm-date" type="date" value="' + esc(state.nm.date) + '" data-fid="nm-date" data-ch="nm-date"></div>' +
        '<div style="flex:1;min-width:150px"><label class="lab" for="nm-window">Créneau</label>' +
          '<input class="inp" id="nm-window" type="text" value="' + esc(state.nm.window) + '" data-fid="nm-window" data-in="nm-window"></div>' +
        '<div style="flex:.8;min-width:120px"><label class="lab" for="nm-price">Tarif (€)</label>' +
          '<input class="inp num" id="nm-price" type="number" min="0" value="' + esc(state.nm.price) + '" data-fid="nm-price" data-in="nm-price"></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:18px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn--primary btn--sm"' + act('create-mission') + '>Créer la mission</button>' +
        '<button type="button" class="btn btn--sm" style="background:transparent;color:var(--muted)"' + act('toggle-new') + '>Annuler</button>' +
        '<span class="sec-note">Tarif pré-rempli depuis la fiche du bien · publiée aussitôt au pool</span>' +
      '</div>' +
    '</div>';

  return ownerShell('missions',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Missions</h1>' +
      '<p class="page-sub">Créées automatiquement à chaque check-out, ou manuellement.</p></div>' +
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
      '<span style="flex:1">Statut</span><span style="width:70px;text-align:right">Prix</span></div>' +
      (rows.length ? rows.map(function (m) {
        return '<div class="trow">' +
          '<span class="num" style="width:96px;font-weight:600">' + esc(m.dateLabel) + '</span>' +
          '<span style="flex:1.4;display:flex;align-items:center;gap:9px;min-width:0">' +
            '<span class="dot" style="width:7px;height:7px;background:' + m.color + '"></span>' + esc(m.propName) + '</span>' +
          '<span style="flex:1;color:var(--muted3)">' + esc(m.typeLabel) + '</span>' +
          '<span class="num" style="width:120px;color:var(--muted3)">' + esc(m.windowLabel) + '</span>' +
          '<span style="flex:1"><span class="badge ' + m.statusCls + '">' + esc(m.statusLabel) + '</span></span>' +
          '<span class="num" style="width:70px;text-align:right;font-weight:600">' + esc(m.priceLabel) + '</span>' +
          '</div>';
      }).join('') : '<p class="empty">Aucune mission pour ce filtre.</p>') +
    '</div></div>');
}

/* --- Prestataires -------------------------------------------------------- */

function viewOwnerAgents() {
  var monthDef = MONTHS.find(function (m) { return m.key === state.ownerMonth; });

  var cards = AGENTS.map(function (a) {
    var rows = monthRows(a.id, state.ownerMonth);
    var open = state.openAgent === a.id;
    return '<article class="card" style="padding:0;overflow:hidden">' +
      '<div style="display:flex;align-items:center;gap:16px;padding:20px 22px;flex-wrap:wrap">' +
        '<div class="avatar" style="width:52px;height:52px;font-size:17px;background:' + a.avatarBg + ';color:' + a.avatarFg + '">' + a.init + '</div>' +
        '<div style="flex:1;min-width:180px">' +
          '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">' +
            '<span style="font:700 18px Figtree,sans-serif">' + esc(a.name) + '</span>' +
            '<span class="badge" style="background:' + a.roleBg + ';color:' + a.roleFg + ';font-weight:600">' + esc(a.role) + '</span>' +
          '</div>' +
          '<div class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:3px">Depuis ' + esc(a.since) + ' · note ' + a.note + '/5 · ' + rows.length + ' mission(s) ce mois</div>' +
        '</div>' +
        '<div style="text-align:right;flex:none">' +
          '<div class="serif num" style="font-size:28px;line-height:1">' + rows.reduce(function (n, r) { return n + r.price; }, 0) + ' €</div>' +
          '<div style="font:600 11.5px Figtree,sans-serif;color:var(--muted);margin-top:3px">' + (monthDef.paid ? 'payé' : 'à verser') + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn--xs" style="background:var(--cream);color:var(--ink-soft)"' +
          act('toggle-agent', { a: a.id }) + '>' + (open ? 'Masquer' : 'Historique') + '</button>' +
      '</div>' +
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
            '<span style="flex:1;color:var(--muted3)">' + esc(TYPES[r.type].label) + '</span>' +
            '<span style="width:110px"><span class="badge ' + (monthDef.paid ? 'badge--green' : 'badge--amber') + '">' +
              (monthDef.paid ? 'Payée' : 'À payer') + '</span></span>' +
            '<span class="num" style="width:70px;text-align:right;font-weight:600">' + r.price + ' €</span>' +
            '</div>';
        }).join('') : '<p class="empty" style="padding:20px 0">Aucune mission sur ce mois.</p>') +
        '</div>' : '') +
      '</article>';
  }).join('');

  return ownerShell('agents',
    '<div class="page-head">' +
      '<div><h1 class="page-title">Prestataires</h1>' +
      '<p class="page-sub">Missions réalisées et rémunération due, mois par mois.</p></div>' +
      '<div class="seg">' + MONTHS.map(function (m) {
        return '<button type="button" aria-pressed="' + (state.ownerMonth === m.key) + '"' +
          act('owner-month', { m: m.key }) + '>' + esc(m.label) + '</button>';
      }).join('') + '</div>' +
    '</div>' +

    '<div class="cols" style="margin-top:22px;gap:12px">' +
      '<div class="kpi" style="min-width:200px"><div class="v num">' +
        AGENTS.reduce(function (n, a) { return n + monthTotal(a.id, state.ownerMonth); }, 0) + ' €</div>' +
        '<div class="l">total ' + esc(monthDef.label.toLowerCase()) + '</div></div>' +
      '<div class="kpi" style="min-width:200px"><div class="v num">' +
        AGENTS.reduce(function (n, a) { return n + monthRows(a.id, state.ownerMonth).length; }, 0) + '</div>' +
        '<div class="l">missions réalisées</div></div>' +
      '<div class="kpi" style="min-width:200px"><div style="font:700 15px/1.25 Figtree,sans-serif;margin-top:4px">' +
        (monthDef.paid ? 'Mois soldé' : 'Paiement à venir') + '</div>' +
        '<div class="l">' + esc(monthDef.payNote) + '</div></div>' +
    '</div>' +

    '<div class="stack" style="gap:14px;margin-top:22px">' + cards + '</div>');
}

/* --- Stocks -------------------------------------------------------------- */

function viewOwnerStocks() {
  var content;

  if (state.stockTab === 'matrice') {
    var visible = state.stockGroup === 'Tous' ? GROUPS : [state.stockGroup];
    content =
      '<div class="chiprow" style="margin-top:20px">' +
        ['Tous'].concat(GROUPS).map(function (g) {
          return '<button type="button" class="chip" aria-pressed="' + (state.stockGroup === g) + '"' +
            act('stock-group', { g: g }) + '>' + esc(g) + '</button>';
        }).join('') +
        '<span style="width:1px;height:24px;background:rgba(36,30,26,.12);margin:0 4px"></span>' +
        '<button type="button" class="chip" style="' + (state.stockScope === 'low' ? 'background:var(--terra-bg2);color:var(--terra-d)' : '') + '"' +
          act('toggle-scope') + '>' + (state.stockScope === 'all' ? 'Tout afficher' : 'Sous le seuil seulement') + '</button>' +
      '</div>' +
      '<div class="stack-l" style="margin-top:16px">' + visible.map(function (gn) {
        var rows = FLAT.filter(function (a) { return a.group === gn; })
          .filter(function (a) {
            return state.stockScope === 'all' || PROPS.some(function (p) { return (state.stock[p.id][a.key] || 0) <= state.seuils[a.key]; });
          });
        return '<div class="table"><div class="table-scroll">' +
          '<div class="thead thead--stock" style="align-items:center">' +
            '<span style="flex:1.6;font-size:13px;text-transform:none;letter-spacing:0;color:var(--ink)">' + esc(gn) + '</span>' +
            '<span style="width:118px;text-align:center">Seuil</span>' +
            PROPS.map(function (p) { return '<span style="flex:1;text-align:center">' + esc(p.short) + '</span>'; }).join('') +
          '</div>' +
          (rows.length ? rows.map(function (a) {
            return '<div class="trow trow--stock" style="padding:10px 20px">' +
              '<span style="flex:1.6;min-width:0">' +
                '<span style="font:500 13.5px Figtree,sans-serif">' + esc(a.label) + '</span>' +
                '<span class="num" style="font:500 11.5px Figtree,sans-serif;color:var(--muted2);display:block;margin-top:1px">' + esc(a.unit) + ' · dotation ' + a.par + '</span>' +
              '</span>' +
              '<span style="width:118px;display:flex;justify-content:center">' +
                '<span class="stepper stepper--sm">' +
                  '<button type="button" aria-label="Baisser le seuil"' + act('seuil', { k: a.key, d: -1 }) + '>−</button>' +
                  '<span class="val num">' + state.seuils[a.key] + '</span>' +
                  '<button type="button" aria-label="Monter le seuil"' + act('seuil', { k: a.key, d: 1 }) + '>+</button>' +
                '</span></span>' +
              PROPS.map(function (p) {
                var v = state.stock[p.id][a.key] || 0;
                var cls = v === 0 ? 'cell-q--zero' : v <= state.seuils[a.key] ? 'cell-q--low' : 'cell-q--ok';
                return '<span style="flex:1;text-align:center"><span class="cell-q num ' + cls + '">' + v + '</span></span>';
              }).join('') +
              '</div>';
          }).join('') : '<p class="empty">Rien sous le seuil dans cette catégorie.</p>') +
          '</div></div>';
      }).join('') + '</div>';
  } else {
    var blocks = PROPS.map(function (p) {
      var items = lowsFor(p.id).map(function (a) {
        return { label: a.label, need: Math.max(1, a.par - (state.stock[p.id][a.key] || 0)), unit: a.unit };
      });
      return { p: p, items: items, units: items.reduce(function (n, i) { return n + i.need; }, 0) };
    });
    var totalItems = blocks.reduce(function (n, b) { return n + b.items.length; }, 0);
    var totalUnits = blocks.reduce(function (n, b) { return n + b.units; }, 0);

    content =
      '<div class="cols" style="margin-top:20px;gap:12px">' +
        '<div class="kpi" style="min-width:200px"><div class="v num">' + totalItems + '</div><div class="l">références à racheter</div></div>' +
        '<div class="kpi" style="min-width:200px"><div class="v num">' + totalUnits + '</div><div class="l">unités au total</div></div>' +
        '<div class="kpi" style="flex:2;min-width:260px"><div style="font:700 14px Figtree,sans-serif">Calculée depuis les seuils</div>' +
        '<div class="l">Chaque article sous son seuil est complété jusqu\'à sa dotation d\'origine.</div></div>' +
      '</div>' +
      '<div class="grid-cards" style="margin-top:20px">' + blocks.map(function (b) {
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
      }).join('') + '</div>';
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

/* --- Biens (liste) ------------------------------------------------------- */

function viewOwnerBiens() {
  var cards = PROPS.map(function (p) {
    var next = state.missions.filter(function (m) { return m.prop === p.id && m.status !== 'termine'; })[0];
    var rs = rooms(p.id);
    var tags = [
      'Ménage ' + state.tariffs[p.id].menage + ' €',
      rs.length + ' pièces',
      rs.reduce(function (n, r) { return n + r.steps.length; }, 0) + ' étapes',
      RESAS[p.id].length + ' résas'
    ];
    return '<button type="button" class="bien-card" style="--accent:' + p.color + '"' +
      act('open-bien', { id: p.id }) + '>' +
      '<div style="display:flex;gap:14px;align-items:center">' +
        '<div class="bien-thumb stripe">PHOTO<br>BIEN</div>' +
        '<div style="min-width:0"><div style="font:700 18px/1.2 Figtree,sans-serif">' + esc(p.name) + '</div>' +
        '<div style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:3px">' +
          esc(state.info[p.id].capacity + ' · ' + state.info[p.id].surface + ' · ' + p.city) + '</div></div>' +
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

  return ownerShell('biens',
    '<h1 class="page-title">Biens</h1>' +
    '<p class="page-sub">Checklist, tarifs, calendrier des réservations et liens iCal — pour chaque logement.</p>' +
    '<div class="grid-cards" style="margin-top:22px">' + cards + '</div>');
}

/* --- Fiche bien ---------------------------------------------------------- */

function viewOwnerBien() {
  var b = prop(route.id);
  if (!b) { location.replace('#/admin/biens'); return ''; }
  var pid = b.id;
  var tabs = [['infos', 'Infos & tarifs'], ['checklist', 'Checklist ménage'], ['calendrier', 'Calendrier'], ['ical', 'Liens iCal']];
  var panel = '';

  if (state.bienTab === 'infos') panel = bienInfos(pid, b);
  else if (state.bienTab === 'checklist') panel = bienChecklist(pid, b);
  else if (state.bienTab === 'calendrier') panel = bienCalendar(pid);
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
  var inf = state.info[pid];
  var fields = [['capacity', 'Capacité'], ['surface', 'Surface'], ['code', 'Accès / clés'],
    ['wifi', 'Wi-Fi'], ['parking', 'Stationnement'], ['linge', 'Linge fourni']];

  return '<div class="cols" style="margin-top:22px">' +
    '<div class="card" style="flex:1.2;min-width:min(100%,340px);padding:22px">' +
      '<h2 style="font:700 16px Figtree,sans-serif;margin:0 0 16px">Informations transmises au prestataire</h2>' +
      '<div class="cols" style="gap:14px">' + fields.map(function (f) {
        var id = 'bf-' + pid + '-' + f[0];
        return '<div style="flex:1;min-width:min(100%,180px)">' +
          '<label class="lab" for="' + id + '">' + f[1] + '</label>' +
          '<input class="inp" id="' + id + '" type="text" value="' + esc(inf[f[0]] || '') + '" data-fid="' + id + '" data-in="bien-field" data-pid="' + pid + '" data-k="' + f[0] + '">' +
          '</div>';
      }).join('') + '</div>' +
      '<div style="margin-top:14px"><label class="lab" for="bn-' + pid + '">Consignes libres</label>' +
        '<textarea class="inp" id="bn-' + pid + '" data-fid="bn-' + pid + '" data-in="bien-notes" data-pid="' + pid + '">' + esc(state.notes[pid] || '') + '</textarea></div>' +
    '</div>' +
    '<div class="card" style="flex:1;min-width:min(100%,300px);padding:22px">' +
      '<h2 style="font:700 16px Figtree,sans-serif;margin:0">Tarifs des prestations</h2>' +
      '<p class="sec-note" style="margin-top:4px">Ce que voit le prestataire avant d\'accepter, et le tarif pré-rempli à la création d\'une mission.</p>' +
      '<div style="margin-top:14px">' + TYPE_ORDER.map(function (t) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(36,30,26,.07)">' +
          '<div class="grow"><div style="font:600 14px Figtree,sans-serif">' + esc(TYPES[t].label) + '</div>' +
          '<div class="num" style="font:500 11.5px Figtree,sans-serif;color:var(--muted2);margin-top:1px">' + TYPES[t].duration + '</div></div>' +
          '<div class="stepper">' +
            '<button type="button" aria-label="Baisser le tarif"' + act('tariff', { pid: pid, t: t, d: -5 }) + '>−</button>' +
            '<span class="val num" style="min-width:56px">' + state.tariffs[pid][t] + ' €</span>' +
            '<button type="button" aria-label="Monter le tarif"' + act('tariff', { pid: pid, t: t, d: 5 }) + '>+</button>' +
          '</div></div>';
      }).join('') + '</div>' +
    '</div></div>';
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
  var resas = RESAS[pid] || [];

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
    '<div class="card" style="flex:1;min-width:min(100%,280px);padding:20px 22px">' +
      '<h2 style="font:700 16px Figtree,sans-serif;margin:0">Réservations</h2>' +
      '<div style="margin-top:10px">' + resas.map(function (r) {
        return '<div style="padding:12px 0;border-top:1px solid rgba(36,30,26,.07)">' +
          '<div style="display:flex;align-items:center;gap:9px">' +
            '<span style="font:600 14.5px Figtree,sans-serif;flex:1;min-width:0">' + esc(r.guest) + '</span>' +
            '<span class="badge" style="background:' + PLATS[r.plat].bg + ';color:' + PLATS[r.plat].fg + '">' + esc(r.plat) + '</span></div>' +
          '<div class="num" style="font:500 12.5px Figtree,sans-serif;color:var(--muted);margin-top:3px">' +
            fmtDate(r.start) + ' → ' + fmtDate(r.end) + ' · ' + nights(r.start, r.end) + ' nuits · ' + r.guests + ' voyageurs</div>' +
          '</div>';
      }).join('') + '</div>' +
    '</div></div>';
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
        '<select class="inp" id="lg-who" data-fid="lg-who" data-ch="login-presta">' + AGENTS.map(function (a) {
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
  var low = FLAT.filter(function (a) { return (d.qty[a.key] || 0) <= state.seuils[a.key]; }).length;
  var photos = photoCount(m);

  state.stock[d.prop] = Object.assign({}, d.qty);
  m.status = 'termine';
  if (!m.taker) m.taker = state.me;
  state.done.push({ agent: state.me, month: CURRENT_MONTH, prop: m.prop, type: m.type, dateLabel: '30 juil.', price: m.price });
  state.lastDone = { price: m.price, photos: photos, low: low };
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
  'open-bien': function (el) { state.bienTab = 'infos'; save(); go('#/admin/biens/' + el.dataset.id); },

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
    if (!nm.date) { alert('Choisis une date pour la mission.'); return; }
    state.missions.push({
      id: 'x' + Date.now(), prop: nm.prop, type: nm.type, date: nm.date,
      dateLabel: nm.date === TODAY ? 'Aujourd’hui' : fmtDate(nm.date),
      windowLabel: nm.window, price: nm.price, status: 'dispo', urgent: 'Mission créée à la main'
    });
    state.missions.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    state.showNew = false;
    save(); render();
  },
  'owner-month': function (el) { state.ownerMonth = el.dataset.m; save(); render(); },
  'toggle-agent': function (el) {
    state.openAgent = state.openAgent === el.dataset.a ? null : el.dataset.a;
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
  }
};

/* Saisies silencieuses : mettent l'état à jour sans redessiner l'écran,
   pour ne pas faire perdre le curseur pendant la frappe. */
var inputs = {
  'login-email': function (el) { state.loginEmail = el.value; },
  'login-pwd': function (el) { state.loginPwd = el.value; },
  'nm-window': function (el) { state.nm.window = el.value; },
  'nm-price': function (el) { state.nm.price = parseInt(el.value || '0', 10) || 0; },
  'bien-field': function (el) { state.info[el.dataset.pid][el.dataset.k] = el.value; save(); },
  'bien-notes': function (el) { state.notes[el.dataset.pid] = el.value; save(); },
  'step-draft': function (el) { state.stepDrafts[el.dataset.key] = el.value; },
  'new-room': function (el) { state.newRoom = el.value; },
  'new-feed': function (el) { state.newFeed = el.value; }
};

/* Changements qui demandent un redessin (listes déroulantes, dates). */
var changes = {
  'login-presta': function (el) {
    state.loginPresta = el.value;
    state.loginEmail = agent(el.value).email;
    render();
  },
  'nm-prop': function (el) {
    state.nm.prop = el.value;
    state.nm.price = state.tariffs[el.value][state.nm.type];
    save(); render();
  },
  'nm-type': function (el) {
    state.nm.type = el.value;
    state.nm.price = state.tariffs[state.nm.prop][el.value];
    save(); render();
  },
  'nm-date': function (el) { state.nm.date = el.value; save(); }
};

/* ==========================================================================
   8. Rendu et démarrage
   ========================================================================== */

var VIEWS = {
  'login': viewLogin,
  'p-missions': viewPrestaMissions,
  'p-mes': viewPrestaMes,
  'p-gains': viewPrestaGains,
  'p-profil': viewPrestaProfil,
  'p-detail': viewPrestaDetail,
  'p-checklist': viewPrestaChecklist,
  'p-stock': viewPrestaStock,
  'p-fin': viewPrestaFin,
  'p-incident': viewPrestaIncident,
  'o-dash': viewOwnerDash,
  'o-missions': viewOwnerMissions,
  'o-agents': viewOwnerAgents,
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
  var key = route.name + ':' + (route.id || '');
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
