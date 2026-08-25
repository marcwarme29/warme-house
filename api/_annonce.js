/* =============================================================================
   MAISON WARME — la composition des lettres d'annonce, pour le ROBOT
   =============================================================================

   POURQUOI CE FICHIER EXISTE, ET POURQUOI IL RESSEMBLE À `app.js`

   Le nom commence par `_` : c'est ce qui dit à Vercel « ce n'est pas une
   adresse, ne pas en faire une route » (même règle que pour tout dossier ou
   fichier `_...` sous `api/`). Ce module n'est appelé que par
   `api/cron-annonce.js`, jamais par un navigateur.

   Ce qu'il contient est une COPIE, volontairement, des fonctions suivantes de
   `app.js` : `jourEtDateLongue`, `ligneMissionTexte`, `ligneMissionHtml`,
   `lettreAnnonce`, `repartirParPrestataire`. Pourquoi une copie plutôt qu'un
   partage : `app.js` est un script de navigateur (pas de `require`, pas de
   module), pensé pour tourner SANS étape de construction — même contrainte que
   partout dans ce projet. Le dupliquer ici, dans un fichier qui, lui, tourne
   dans Node chez Vercel, est le choix le plus simple qui ne casse rien.

   ⚠️ CETTE COPIE DOIT SUIVRE `app.js`. Si un jour le texte d'une annonce
   change dans l'application (la lettre envoyée quand Marc ouvre MAISON WARME
   et clique sur « Annoncer »), il faut reporter le même changement ici — sinon
   le robot enverra une lettre différente de celle que Marc a vue et approuvée.
   C'est le prix, assumé, de ne pas avoir de système de construction (règle du
   projet : aucune dépendance, aucune étape de build).
   ========================================================================== */

function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

var MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function fmtDate(iso) {
  var p = String(iso).split('-');
  return parseInt(p[2], 10) + ' ' + ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août',
    'sept.', 'oct.', 'nov.', 'déc.'][parseInt(p[1], 10) - 1];
}

/* Même fonction que `jourEtDateLongue()` dans app.js (session 27, D-152) :
   dans un e-mail lu peut-être le lendemain, « demain » ne suffit pas — on
   écrit toujours le jour et la date complète, et on ajoute
   « aujourd'hui »/« demain » devant plutôt qu'à la place. */
function jourEtDateLongue(iso, todayIso) {
  var d = new Date(Date.parse(iso + 'T00:00:00Z'));
  var jour = JOURS[d.getUTCDay()];
  var complet = jour + ' ' + parseInt(iso.slice(8, 10), 10) + ' ' + MOIS_LONG[parseInt(iso.slice(5, 7), 10) - 1];
  if (iso === todayIso) return 'aujourd’hui, ' + complet;
  var demain = new Date(Date.parse(todayIso + 'T00:00:00Z') + 86400000);
  if (d.getTime() === demain.getTime()) return 'demain, ' + complet;
  return complet;
}

/* `m` attendu ici : { date, prop: { name }, service: { label }, price,
   windowLabel, turnover, nextAt, note }. */
function ligneMissionTexte(m, todayIso) {
  var l = ['• ' + m.service.label + ' — ' + m.prop.name];
  l.push('  ' + jourEtDateLongue(m.date, todayIso) + ' · ' +
    (m.windowLabel || '11:00 → 16:00') + (m.price ? ' · ' + m.price + ' €' : ''));
  if (m.turnover) {
    l.push('  Départ ET arrivée le même jour' + (m.nextAt ? ' — le voyageur suivant arrive à ' + m.nextAt : '') + '.');
  }
  if (m.note) l.push('  Note : ' + m.note);
  return l.join('\n');
}

function ligneMissionHtml(m, todayIso) {
  var sous = [esc(jourEtDateLongue(m.date, todayIso)), esc(m.windowLabel || '11:00 → 16:00')];
  if (m.price) sous.push('<strong>' + esc(m.price + ' €') + '</strong>');

  return '<tr><td style="padding:14px 16px;border:1px solid #E8DFD3;border-radius:10px;' +
    'background:#FFFDF9">' +
    '<div style="font:700 15px Helvetica,Arial,sans-serif;color:#2E2A26">' +
      esc(m.service.label + ' — ' + m.prop.name) + '</div>' +
    '<div style="font:400 14px Helvetica,Arial,sans-serif;color:#6B615A;margin-top:5px">' +
      sous.join(' &nbsp;·&nbsp; ') + '</div>' +
    (m.turnover
      ? '<div style="font:600 13px Helvetica,Arial,sans-serif;color:#B5651D;margin-top:6px">' +
        'Départ et arrivée le même jour' + (m.nextAt ? ' — le voyageur suivant arrive à ' + esc(m.nextAt) : '') +
        '</div>'
      : '') +
    (m.note ? '<div style="font:400 13px Helvetica,Arial,sans-serif;color:#6B615A;margin-top:6px">Note : ' +
      esc(m.note) + '</div>' : '') +
    '</td></tr>';
}

/** La lettre destinée à UNE personne, pour LES missions qui la concernent.
    `agent` : { name, email }. `appUrl` : l'adresse de MAISON WARME. */
function lettreAnnonce(agent, missions, todayIso, appUrl) {
  var une = missions.length === 1;
  var lien = appUrl + (une ? '#/app/missions/' + missions[0].id : '#/app/missions');
  var prenom = (agent.name || '').split(/\s+/)[0] || '';

  var sujet = une
    ? 'Mission disponible — ' + missions[0].prop.name + ', ' + fmtDate(missions[0].date)
    : missions.length + ' missions disponibles — MAISON WARME';

  var texte = [
    'Bonjour' + (prenom ? ' ' + prenom : '') + ',',
    '',
    une ? 'Une mission est disponible dans MAISON WARME :' : missions.length + ' missions sont disponibles dans MAISON WARME :',
    '',
    missions.map(function (m) { return ligneMissionTexte(m, todayIso); }).join('\n\n'),
    '',
    une ? 'Pour la prendre, ouvre MAISON WARME :' : 'Pour les prendre, ouvre MAISON WARME :',
    lien,
    '',
    'La première personne qui prend une mission l’obtient : elle disparaît alors',
    'de la liste des autres.',
    '',
    'Tu peux répondre directement à ce message.',
    '',
    '— MAISON WARME'
  ].join('\n');

  var html =
    '<div style="background:#F7F1E7;padding:24px 12px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" ' +
      'style="max-width:560px;margin:0 auto;background:#FFFDF9;border-radius:14px;' +
      'border:1px solid #E8DFD3">' +
    '<tr><td style="padding:24px 22px 6px">' +
      '<div style="font:700 13px Helvetica,Arial,sans-serif;letter-spacing:.09em;color:#B5651D">MAISON WARME</div>' +
      '<h1 style="font:700 21px Helvetica,Arial,sans-serif;color:#2E2A26;margin:12px 0 0">' +
        (une ? 'Une mission est disponible' : missions.length + ' missions sont disponibles') +
      '</h1>' +
      '<p style="font:400 15px/1.5 Helvetica,Arial,sans-serif;color:#4A423C;margin:10px 0 0">' +
        'Bonjour' + (prenom ? ' ' + esc(prenom) : '') + ',</p>' +
    '</td></tr>' +
    '<tr><td style="padding:14px 22px 0">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0 10px">' +
        missions.map(function (m) { return ligneMissionHtml(m, todayIso); }).join('') +
      '</table>' +
    '</td></tr>' +
    '<tr><td style="padding:16px 22px 4px">' +
      '<a href="' + esc(lien) + '" style="display:inline-block;background:#B5651D;color:#FFFFFF;' +
        'font:700 15px Helvetica,Arial,sans-serif;text-decoration:none;padding:13px 22px;border-radius:10px">' +
        (une ? 'Voir cette mission' : 'Voir les missions') + '</a>' +
    '</td></tr>' +
    '<tr><td style="padding:14px 22px 24px">' +
      '<p style="font:400 13px/1.55 Helvetica,Arial,sans-serif;color:#6B615A;margin:0">' +
        'La première personne qui prend une mission l’obtient : elle disparaît alors de la liste ' +
        'des autres. Tu peux répondre directement à ce message.</p>' +
    '</td></tr>' +
    '</table></div>';

  return { email: agent.email.trim().toLowerCase(), nom: agent.name || '', sujet: sujet, texte: texte, html: html };
}

/** Répartit des missions en un lot par prestataire concerné — même règle que
    `repartirParPrestataire()` dans app.js : chaque prestataire ne reçoit
    qu'une lettre, avec toutes SES missions dedans. */
function repartirParPrestataire(missions) {
  var par = {};
  missions.forEach(function (m) {
    (m.destinataires || []).forEach(function (a) {
      if (!par[a.id]) par[a.id] = { a: a, missions: [] };
      par[a.id].missions.push(m);
    });
  });
  return Object.keys(par).map(function (k) { return par[k]; });
}

module.exports = { lettreAnnonce: lettreAnnonce, repartirParPrestataire: repartirParPrestataire, fmtDate: fmtDate };
