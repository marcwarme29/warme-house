/* ==========================================================================
   MAISON WARME — la couche « grand cahier partagé »

   Ce fichier est le seul endroit qui parle à Supabase. Le reste de
   l'application (app.js) ne change pas de forme : il continue de travailler
   sur l'objet `state`, et ce sont `save()` et `load()` qui, désormais,
   passent aussi par ici.

   Ce qui est partagé au LOT 1 (D-58) : les biens, leurs secrets, les
   réservations, les missions et les comptes. Tout le reste — stocks, avis,
   livrets en cours d'écriture, versements — continue d'aller dans la mémoire
   du navigateur, exactement comme avant, jusqu'à son lot.

   Organisation : 1. connexion · 2. traduction état ↔ base · 3. lecture ·
   4. écriture · 5. temps réel · 6. déménagement.
   ========================================================================== */

var DB = (function () {

  /* ----------------------------------------------------------------------
     1. CONNEXION
     ---------------------------------------------------------------------- */

  var client = null;
  var profil = null;          // la fiche du compte connecté (table profiles)
  var dispo = false;          // la bibliothèque et la configuration sont-elles là ?
  var derniereErreur = null;

  function demarrer() {
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      derniereErreur = 'La bibliothèque Supabase n\'a pas pu être chargée (connexion internet ?).';
      return false;
    }
    if (typeof SUPABASE_URL !== 'string' || !SUPABASE_URL || SUPABASE_URL.indexOf('http') !== 0) {
      derniereErreur = 'L\'adresse du projet Supabase est absente de config.js.';
      return false;
    }
    client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    dispo = true;
    return true;
  }

  /* Récupère la fiche du compte connecté. Rend null si personne n'est connecté. */
  function relireProfil() {
    if (!dispo) return Promise.resolve(null);
    return client.auth.getUser().then(function (r) {
      var u = r && r.data && r.data.user;
      if (!u) { profil = null; return null; }
      return client.from('profiles').select('*').eq('id', u.id).maybeSingle()
        .then(function (p) {
          profil = p.data || { id: u.id, email: u.email, role: 'provider', kind: 'menage', props: [] };
          return profil;
        });
    }).catch(function (e) {
      derniereErreur = messageClair(e);
      profil = null;
      return null;
    });
  }

  function connexion(email, motDePasse) {
    if (!dispo) return Promise.reject(new Error(derniereErreur || 'Connexion indisponible.'));
    return client.auth.signInWithPassword({ email: email, password: motDePasse })
      .then(function (r) {
        if (r.error) throw r.error;
        return relireProfil();
      });
  }

  function deconnexion() {
    profil = null;
    if (!dispo) return Promise.resolve();
    return client.auth.signOut().catch(function () { });
  }

  /* Traduit les messages techniques de Supabase en français compréhensible. */
  function messageClair(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/Invalid login credentials/i.test(m)) return 'Adresse e-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Ce compte n\'a pas encore été confirmé par e-mail.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Pas de connexion internet, ou le projet Supabase ne répond pas.';
    if (/row-level security/i.test(m)) return 'Ce compte n\'a pas le droit d\'écrire ici.';
    if (/JWT|token/i.test(m)) return 'La session a expiré : reconnecte-toi.';
    return m;
  }

  /* ----------------------------------------------------------------------
     2. TRADUCTION ÉTAT ↔ BASE
     Le seul endroit où l'on sait que `state.info[pid].code` s'appelle
     `property_secrets.code` dans la base.
     ---------------------------------------------------------------------- */

  /* --- les biens --- */

  function bienVersBase(p, moi) {
    var info = Object.assign({}, (state.info && state.info[p.id]) || {});
    delete info.code;                       // les secrets partent ailleurs (D-60)
    delete info.wifi;
    return {
      id: p.id,
      owner_id: moi,
      name: p.name || '',
      short: p.short || '',
      city: p.city || '',
      address: p.address || '',
      color: p.color || '',
      tint: p.tint || '',
      notes: (state.notes && state.notes[p.id]) || '',
      info: info,
      tarifs: (state.tariffs && state.tariffs[p.id]) || {},
      durations: (state.durations && state.durations[p.id]) || {},
      checklist: (state.checklists && state.checklists[p.id]) || [],
      livret: (state.livret && state.livret[p.id]) || {}
    };
  }

  function secretsVersBase(p) {
    var info = (state.info && state.info[p.id]) || {};
    return { property_id: p.id, code: info.code || '', wifi: info.wifi || '' };
  }

  function biensDepuisBase(lignes, secrets) {
    var parId = {};
    (secrets || []).forEach(function (s) { parId[s.property_id] = s; });

    state.props = lignes.map(function (l) {
      return { id: l.id, name: l.name, short: l.short, city: l.city, address: l.address, color: l.color, tint: l.tint };
    });
    lignes.forEach(function (l) {
      var s = parId[l.id] || {};
      state.info[l.id] = Object.assign({}, l.info || {}, { code: s.code || '', wifi: s.wifi || '' });
      state.notes[l.id] = l.notes || '';
      state.tariffs[l.id] = l.tarifs || {};
      state.durations[l.id] = l.durations || {};
      state.checklists[l.id] = l.checklist || [];
      state.livret[l.id] = l.livret || {};
    });
  }

  /* --- les réservations --- */

  function resaVersBase(r, pid) {
    return {
      id: r.id,
      property_id: pid,
      uid: r.uid || null,
      source: r.source || 'manuel',
      plat: r.plat || '',
      guest: r.guest || '',
      guests: r.guests || null,
      start_date: r.start,
      end_date: r.end,
      montant: (r.montant === null || r.montant === undefined) ? null : r.montant,
      statut: r.statut || 'confirme',
      tel4: r.tel4 || null,
      tel: r.tel || null,
      mail: r.mail || null,
      arrivee_prevue: r.arriveePrevue || null,
      guest_ok: !!r.guestOk,
      demarchable: !!r.demarchable,
      depart_at: departSignale(pid, r)
    };
  }

  /* `state.departs` est indexé « pid:début:fin » : on le porte sur la ligne. */
  function departSignale(pid, r) {
    var cle = pid + ':' + r.start + ':' + r.end;
    return (state.departs && state.departs[cle]) || null;
  }

  function resasDepuisBase(lignes) {
    var parBien = {};
    (state.props || []).forEach(function (p) { parBien[p.id] = []; });
    lignes.forEach(function (l) {
      var r = {
        id: l.id, uid: l.uid || '', source: l.source, plat: l.plat, guest: l.guest,
        guests: l.guests, start: l.start_date, end: l.end_date,
        montant: (l.montant === null || l.montant === undefined) ? null : Number(l.montant),
        statut: l.statut, tel4: l.tel4 || '', tel: l.tel || '', mail: l.mail || '',
        arriveePrevue: l.arrivee_prevue || '', guestOk: !!l.guest_ok, demarchable: !!l.demarchable
      };
      if (!parBien[l.property_id]) parBien[l.property_id] = [];
      parBien[l.property_id].push(r);
      if (l.depart_at) state.departs[l.property_id + ':' + l.start_date + ':' + l.end_date] = l.depart_at;
    });
    state.resas = parBien;
  }

  /* --- les missions --- */

  function missionVersBase(m) {
    return {
      id: m.id,
      property_id: m.prop,
      reservation_id: m.fromResa || null,
      type: m.type || 'menage',
      date: m.date,
      window_label: m.windowLabel || '',
      price: m.price || 0,
      status: m.status || 'dispo',
      provider_id: uuidDuPrestataire(m.taker),
      taker_legacy: m.taker || null,
      guest: (m.res && m.res.guest) || '',
      guests: (m.res && m.res.guests) || null,
      urgent: m.urgent || '',
      note: m.note || '',
      turnover: !!m.turnover,
      next_guest: m.next || null,
      report: (state.reports && state.reports[m.id]) || null,
      review: m.review || null,
      redo: m.redo || ''
    };
  }

  /* Tant que les prestataires n'ont pas de compte, on ne peut pas remplir
     provider_id : le prénom reste dans taker_legacy (voir 02-ajustements.sql). */
  function uuidDuPrestataire(prenom) {
    if (!prenom) return null;
    var a = (state.agents || []).filter(function (x) { return x.id === prenom; })[0];
    return (a && a.uid) || null;
  }

  function missionsDepuisBase(lignes) {
    state.missions = lignes.map(function (l) {
      var m = {
        id: l.id, prop: l.property_id, type: l.type, date: l.date,
        dateLabel: typeof fmtDate === 'function' ? fmtDate(l.date) : l.date,
        windowLabel: l.window_label || '', price: Number(l.price) || 0,
        status: l.status, urgent: l.urgent || '', note: l.note || '',
        turnover: !!l.turnover, fromResa: l.reservation_id || null,
        review: l.review || null, redo: l.redo || ''
      };
      var taker = l.taker_legacy || prenomDuCompte(l.provider_id);
      if (taker) m.taker = taker;
      if (l.guest) m.res = { guest: l.guest, guests: l.guests || 1, plat: '', nights: 0 };
      if (l.next_guest) m.next = l.next_guest;
      if (l.report) state.reports[l.id] = l.report;
      return m;
    });
  }

  function prenomDuCompte(uid) {
    if (!uid) return null;
    var a = (state.agents || []).filter(function (x) { return x.uid === uid; })[0];
    return a ? a.id : null;
  }

  /* --- les comptes --- */

  function comptesDepuisBase(lignes) {
    var prestataires = lignes.filter(function (l) { return l.role === 'provider'; });
    if (!prestataires.length) return;        // aucun compte créé : on garde la démonstration
    state.agents = prestataires.map(function (l) {
      var ancien = (state.agents || []).filter(function (a) { return a.id === l.legacy_id; })[0] || {};
      return Object.assign({}, ancien, {
        id: l.legacy_id || l.id,
        uid: l.id,
        name: l.full_name || l.email,
        kind: l.kind || 'menage',
        role: l.job_label || ancien.role || '',
        email: l.email || '',
        iban: l.iban || '',
        since: l.since || '',
        props: l.props || [],
        services: l.services || undefined
      });
    });
  }

  /* ----------------------------------------------------------------------
     3. LECTURE — remplir `state` depuis la base
     ---------------------------------------------------------------------- */

  function charger() {
    if (!dispo || !profil) return Promise.resolve(false);
    return Promise.all([
      client.from('properties').select('*').order('id'),
      client.from('property_secrets').select('*'),
      client.from('reservations').select('*').order('start_date'),
      client.from('missions').select('*').order('date'),
      client.from('profiles').select('*')
    ]).then(function (r) {
      var erreur = r.filter(function (x) { return x.error; })[0];
      if (erreur) throw erreur.error;

      // Aucun bien dans la base : le déménagement n'a pas encore eu lieu.
      // On laisse `state` tel quel plutôt que de vider les écrans.
      if (!r[0].data || !r[0].data.length) return false;

      comptesDepuisBase(r[4].data || []);
      biensDepuisBase(r[0].data, r[1].data || []);
      resasDepuisBase(r[2].data || []);
      missionsDepuisBase(r[3].data || []);
      if (typeof upgrade === 'function') upgrade();
      return true;
    });
  }

  /* ----------------------------------------------------------------------
     4. ÉCRITURE — pousser une collection vers la base
     `save()` d'app.js continue d'écrire dans le navigateur (mémoire de
     secours) et appelle en plus `DB.pousser()`, sans attendre la réponse :
     l'interface ne doit jamais figer parce que le réseau est lent.
     ---------------------------------------------------------------------- */

  var enAttente = null;

  /* Regroupe les écritures rapprochées : on ne parle à la base qu'une fois
     la frappe terminée, pas à chaque touche. Rien n'attend le résultat. */
  function pousser() {
    if (!dispo || !profil || profil.role !== 'owner') return;
    clearTimeout(enAttente);
    enAttente = setTimeout(function () {
      enAttente = null;
      pousserMaintenant();
    }, 800);
  }

  function pousserMaintenant() {
    if (!dispo || !profil) return Promise.resolve();
    var moi = profil.id;
    var biens = (state.props || []).map(function (p) { return bienVersBase(p, moi); });
    var secrets = (state.props || []).map(secretsVersBase);
    var resas = [];
    Object.keys(state.resas || {}).forEach(function (pid) {
      (state.resas[pid] || []).forEach(function (r) { resas.push(resaVersBase(r, pid)); });
    });
    var missions = (state.missions || []).map(missionVersBase);

    return client.from('properties').upsert(biens)
      .then(function () { return client.from('property_secrets').upsert(secrets); })
      .then(function () { return resas.length ? client.from('reservations').upsert(resas) : null; })
      .then(function () { return missions.length ? client.from('missions').upsert(missions) : null; })
      .then(function (r) {
        if (r && r.error) throw r.error;
        return true;
      })
      .catch(function (e) {
        derniereErreur = messageClair(e);
        return false;
      });
  }

  /* ----------------------------------------------------------------------
     5. TEMPS RÉEL — l'écran se met à jour quand quelqu'un d'autre écrit
     ---------------------------------------------------------------------- */

  var canal = null;

  function ecouter(quandCaChange) {
    if (!dispo || !profil || canal) return;
    canal = client.channel('maison-warme')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, quandCaChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, quandCaChange)
      .subscribe();
  }

  function taire() {
    if (canal) { client.removeChannel(canal); canal = null; }
  }

  /* ----------------------------------------------------------------------
     6. DÉMÉNAGEMENT — envoyer une première fois tout ce qui est dans le
     navigateur. C'est `pousserMaintenant()` sans attente ni filtre : la base
     étant vide, tout est créé ; relancé, tout est mis à jour.
     ---------------------------------------------------------------------- */

  function demenager() {
    if (!dispo) return Promise.reject(new Error(derniereErreur || 'Connexion indisponible.'));
    if (!profil) return Promise.reject(new Error('Il faut être connecté.'));
    if (profil.role !== 'owner') return Promise.reject(new Error('Seul le propriétaire peut faire le déménagement.'));
    return pousserMaintenant().then(function (ok) {
      if (!ok) throw new Error(derniereErreur || 'Le déménagement a échoué.');
      return true;
    });
  }

  /* ---------------------------------------------------------------------- */

  return {
    demarrer: demarrer,
    estDispo: function () { return dispo; },
    profil: function () { return profil; },
    erreur: function () { return derniereErreur; },
    messageClair: messageClair,
    relireProfil: relireProfil,
    connexion: connexion,
    deconnexion: deconnexion,
    charger: charger,
    pousser: pousser,
    pousserMaintenant: pousserMaintenant,
    ecouter: ecouter,
    taire: taire,
    demenager: demenager
  };

})();
