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

  /* Y a-t-il une session ouverte sur CET appareil ? La réponse est lue dans
     le navigateur, sans réseau : c'est ce qui permet de distinguer « personne
     n'est connecté » (il faut refermer l'application) de « le réseau est
     coupé » (on laisse la personne travailler avec ce qu'elle a).
     Sans ce contrôle, l'écran restait ouvert au rechargement pour quiconque
     s'assoit devant l'ordinateur — le trou signalé en session 14. */
  function sessionLocale() {
    if (!dispo) return Promise.resolve(false);
    return client.auth.getSession()
      .then(function (r) { return !!(r && r.data && r.data.session); })
      .catch(function () { return false; });
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

  /* Création du compte, au bout d'un lien d'invitation. Personne ne passe par
     ici sans lien : l'application n'offre aucun autre écran d'inscription.
     Si Supabase demande encore une confirmation par e-mail (réglage
     « Confirm email », voir 04-invitations.sql), aucune session n'est ouverte
     et on le dit clairement plutôt que de laisser la personne devant un écran
     qui ne fait rien. */
  /* Création du compte depuis le lien d'invitation.

     SESSION 17 — le compte peut déjà exister. C'est arrivé pour de vrai : le
     propriétaire avait créé le compte de sa prestataire à la main dans
     Supabase avant de comprendre que le lien d'invitation le faisait
     lui-même. `signUp` répondait alors « User already registered » et
     l'invitation restait bloquée pour toujours — le lien devenait inutile
     alors que tout était presque en place.
     On retombe donc sur une **connexion** avec le mot de passe saisi : si
     c'est le bon, la personne récupère ses droits par le même chemin. Si ce
     n'est pas le bon, le message le dit, et c'est la bonne réponse. */
  function inscription(email, motDePasse) {
    if (!dispo) return Promise.reject(new Error(derniereErreur || 'Connexion indisponible.'));
    return client.auth.signUp({ email: email, password: motDePasse })
      .then(function (r) {
        if (r.error) {
          if (/User already registered|already been registered/i.test(r.error.message || '')) {
            return client.auth.signInWithPassword({ email: email, password: motDePasse })
              .then(function (c) {
                if (c.error) {
                  throw new Error('Un compte existe déjà avec cette adresse. Le mot de passe que tu ' +
                    'viens de saisir n\'est pas le sien : entre celui que le propriétaire t\'a donné, ' +
                    'ou demande-lui de supprimer le compte pour repartir de ce lien.');
                }
                return relireProfil();
              });
          }
          throw r.error;
        }
        if (!r.data || !r.data.session) {
          throw new Error('Le compte est créé, mais Supabase attend une confirmation par e-mail. ' +
            'Le propriétaire doit décocher « Confirm email » dans Supabase (Authentication → Sign In / Providers → Email).');
        }
        return relireProfil();
      });
  }

  /* ---- Les invitations (§19.8) ------------------------------------------
     Le propriétaire enregistre une adresse et un métier ; la base rend un
     lien. C'est le lien qui fait foi : la personne ne peut réclamer que les
     droits inscrits dedans, et seulement depuis l'adresse visée. */

  /* Morceau secret du lien : 32 caractères tirés au hasard par le navigateur. */
  function nouveauJeton() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (n) {
      return ('0' + n.toString(16)).slice(-2);
    }).join('');
  }

  function creerInvitation(fiche) {
    if (!dispo || !profil || profil.role !== 'owner') {
      return Promise.reject(new Error('Réservé au propriétaire.'));
    }
    if (!fiche || !fiche.email) return Promise.reject(new Error('Il faut d\'abord renseigner son adresse e-mail sur sa fiche.'));
    var jeton = nouveauJeton();
    return client.from('invitations').insert({
      token: jeton,
      email: String(fiche.email).trim().toLowerCase(),
      legacy_id: fiche.id,
      full_name: fiche.name || '',
      job_label: fiche.role || '',
      kind: fiche.kind || 'menage',
      props: fiche.props || [],
      services: fiche.services || null,
      iban: fiche.iban || '',
      since: fiche.since || '',
      created_by: profil.id
    }).then(function (r) {
      if (r.error) throw new Error(messageClair(r.error));
      return jeton;
    });
  }

  /* Les invitations encore en attente, pour les afficher au propriétaire. */
  function invitations() {
    if (!dispo || !profil || profil.role !== 'owner') return Promise.resolve([]);
    return client.from('invitations').select('*').order('created_at', { ascending: false })
      .then(function (r) { return r.error ? [] : (r.data || []); });
  }

  function annulerInvitation(jeton) {
    if (!dispo || !profil || profil.role !== 'owner') {
      return Promise.reject(new Error('Réservé au propriétaire.'));
    }
    return client.from('invitations').delete().eq('token', jeton).then(function (r) {
      if (r.error) throw new Error(messageClair(r.error));
      return true;
    });
  }

  /* Côté invité : à qui ce lien est-il destiné ? Appelée sans compte. */
  function lireInvitation(jeton) {
    if (!dispo) return Promise.reject(new Error(derniereErreur || 'Connexion indisponible.'));
    return client.rpc('lire_invitation', { jeton: jeton }).then(function (r) {
      if (r.error) throw new Error(messageClair(r.error));
      var l = (r.data || [])[0];
      if (!l) throw new Error('Ce lien d\'invitation n\'existe pas. Demande au propriétaire de t\'en renvoyer un.');
      return l;
    });
  }

  /* Côté invité : le compte vient d'être créé, on réclame les droits prévus. */
  function accepterInvitation(jeton) {
    if (!dispo) return Promise.reject(new Error(derniereErreur || 'Connexion indisponible.'));
    return client.rpc('accepter_invitation', { jeton: jeton }).then(function (r) {
      if (r.error) throw new Error(messageClair(r.error));
      profil = r.data || profil;
      return profil;
    });
  }

  /* Repartir de zéro : jeter les logements de démonstration et tout ce qui
     s'y rattache. La base efface en cascade codes d'accès, réservations et
     missions. Sans retour possible — d'où la double confirmation à l'écran. */
  function viderDonnees() {
    if (!dispo || !profil || profil.role !== 'owner') {
      return Promise.reject(new Error('Réservé au propriétaire.'));
    }
    return client.rpc('vider_mes_donnees').then(function (r) {
      if (r.error) throw new Error(messageClair(r.error));
      premiereLectureFaite = true;
      return r.data;
    });
  }

  /* Traduit les messages techniques de Supabase en français compréhensible. */
  function messageClair(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/Invalid login credentials/i.test(m)) return 'Adresse e-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Ce compte n\'a pas encore été confirmé par e-mail.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Pas de connexion internet, ou le projet Supabase ne répond pas.';
    if (/row-level security/i.test(m)) return 'Ce compte n\'a pas le droit d\'écrire ici.';
    if (/JWT|token/i.test(m)) return 'La session a expiré : reconnecte-toi.';
    /* « Cette fonction n'existe pas » veut toujours dire : un script n'a pas
       été collé. On nomme LEQUEL — il y en a plusieurs depuis le lot 3, et un
       message qui désigne le mauvais fait perdre du temps (session 18). */
    if (/schema cache|Could not find the (function|table)/i.test(m)) {
      var script = /sejour_par_lien|chercher_sejour|enregistrer_voyageur|signaler_depart|nom_simple/i.test(m)
        ? '« 07-livret-voyageur.sql »'
        : /invitation/i.test(m) ? '« 04-invitations.sql »'
          : 'celui qui manque (voir le dossier supabase/)';
      return 'Le cahier partagé n\'est pas encore à jour : le propriétaire doit coller le script ' +
        script + ' dans Supabase (SQL Editor → New query → Run).';
    }
    if (/User already registered/i.test(m)) return 'Un compte existe déjà avec cette adresse e-mail : utilise « Se connecter ».';
    if (/Password should be at least/i.test(m)) return 'Le mot de passe est trop court : il faut au moins 6 caractères.';
    if (/Signups not allowed/i.test(m)) return 'Les inscriptions sont fermées dans Supabase (Authentication → Sign In / Providers → « Allow new users to sign up »).';
    // Le casier à photos (lot 2). Les deux cas se produisent si le script
    // « 05-photos.sql » n'a pas été collé, ou l'a été dans un autre projet.
    if (/Bucket not found/i.test(m)) {
      return 'Le casier à photos n\'existe pas encore : le propriétaire doit coller le script ' +
        '« 05-photos.sql » dans Supabase (SQL Editor → New query → Run).';
    }
    if (/new row violates row-level security policy|Unauthorized/i.test(m)) {
      return 'Le cahier partagé refuse cette photo : cette mission ne t\'appartient pas, ou les ' +
        'règles du casier ne sont pas encore posées (script « 05-photos.sql »).';
    }
    if (/Payload too large|exceeded the maximum/i.test(m)) return 'Cette photo est trop lourde pour être envoyée.';
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

    /* RÈGLE DE FUSION (session 15, après incident « j'ai ajouté un bien et il
       a disparu ») : la lecture du cahier ne remplace plus la liste locale,
       elle la MET À JOUR. Un logement créé il y a deux secondes n'a pas encore
       été écrit dans le cahier — l'écriture est différée de huit dixièmes de
       seconde. Remplacer la liste effaçait donc le logement tout juste saisi,
       et l'écriture suivante figeait cette disparition. On garde ce qui n'est
       pas encore parti ; il partira au prochain envoi. */
    var connus = {};
    lignes.forEach(function (l) { connus[l.id] = true; });
    var enAttente = (state.props || []).filter(function (p) { return !connus[p.id]; });

    state.props = lignes.map(function (l) {
      return { id: l.id, name: l.name, short: l.short, city: l.city, address: l.address, color: l.color, tint: l.tint };
    }).concat(enAttente);
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

  /* CE QUE LE PROPRIÉTAIRE ÉCRIT, ET CE QU'IL NE DOIT PAS ÉCRASER (session 18).

     Depuis le lot 3, six colonnes appartiennent au **voyageur** : son
     téléphone, son e-mail, son heure d'arrivée, son nombre de personnes, son
     accord de démarchage et son départ signalé. Il les écrit lui-même, depuis
     son livret, par la fonction `enregistrer_voyageur`.

     Or `pousser()` est un **upsert** : il remplace les colonnes qu'il envoie.
     Si le propriétaire renvoyait ces six-là à vide — ce qui est leur valeur
     sur son écran tant qu'il n'a pas relu le cahier — il effacerait ce que le
     voyageur vient de saisir, quelques secondes plus tôt. Même famille de
     faute que D-75.

     Règle : une colonne du voyageur n'est envoyée que si on a **vraiment**
     quelque chose à y mettre. Un upsert n'écrit que les colonnes fournies :
     ce qui est omis reste tel quel dans le cahier. */
  function resaVersBase(r, pid) {
    var ligne = {
      id: r.id,
      property_id: pid,
      uid: r.uid || null,
      source: r.source || 'manuel',
      plat: r.plat || '',
      guest: r.guest || '',
      start_date: r.start,
      end_date: r.end,
      montant: (r.montant === null || r.montant === undefined) ? null : r.montant,
      statut: r.statut || 'confirme'
    };

    // Les colonnes du voyageur : silence plutôt qu'un vide destructeur.
    if (r.guests) ligne.guests = r.guests;
    if (r.tel4) ligne.tel4 = r.tel4;
    if (r.tel) ligne.tel = r.tel;
    if (r.mail) ligne.mail = r.mail;
    if (r.arriveePrevue) ligne.arrivee_prevue = r.arriveePrevue;
    if (r.guestOk) ligne.guest_ok = true;
    if (r.demarchable) ligne.demarchable = true;
    var parti = departSignale(pid, r);
    if (parti) ligne.depart_at = parti;

    return ligne;
  }

  function compterResas() {
    return Object.keys(state.resas || {}).reduce(function (n, pid) {
      return n + (state.resas[pid] || []).length;
    }, 0);
  }

  /* `state.departs` est indexé « pid:début:fin » : on le porte sur la ligne. */
  function departSignale(pid, r) {
    var cle = pid + ':' + r.start + ':' + r.end;
    return (state.departs && state.departs[cle]) || null;
  }

  function resasDepuisBase(lignes) {
    var parBien = {};
    (state.props || []).forEach(function (p) { parBien[p.id] = []; });

    // Même règle de fusion que pour les logements : un séjour saisi à
    // l'instant, pas encore parti dans le cahier, ne doit pas disparaître.
    var connus = {};
    lignes.forEach(function (l) { connus[l.id] = true; });

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

    Object.keys(state.resas || {}).forEach(function (pid) {
      (state.resas[pid] || []).forEach(function (r) {
        if (connus[r.id]) return;                    // déjà rendu par le cahier
        if (!parBien[pid]) parBien[pid] = [];
        parBien[pid].push(r);
      });
    });

    Object.keys(parBien).forEach(function (pid) {
      parBien[pid].sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
    });
    state.resas = parBien;
  }

  /* --- les missions --- */

  /* Un bien supprimé, ou une réservation retirée alors que sa mission avait
     déjà été prise, laisseraient une mission qui pointe dans le vide — et la
     base refuserait la ligne entière. On coupe le lien plutôt que de perdre
     la mission. */
  function bienExiste(pid) {
    return (state.props || []).some(function (p) { return p.id === pid; });
  }

  function resaExiste(rid) {
    if (!rid) return false;
    return Object.keys(state.resas || {}).some(function (pid) {
      return (state.resas[pid] || []).some(function (r) { return r.id === rid; });
    });
  }

  /* DEUX FAÇONS DE DÉSIGNER LE MÊME SÉJOUR, et c'est ce qui coinçait.
     L'application repère un séjour par une clé composée — « bien:début:fin »,
     c'est `m.fromResa` — tandis que la base attend son identifiant, « r_… ».
     Les deux ne se ressemblent pas : la comparaison ne tombait donc JAMAIS
     juste, et toutes les missions partaient dans le cahier **sans lien vers
     leur séjour**. Conséquences en chaîne : le prestataire n'avait pas le
     droit de lire le séjour (les règles de lecture passent par ce lien), donc
     ni le nom du voyageur, ni le nombre de personnes, ni la plateforme.
     Repéré en session 15. Ces deux fonctions traduisent dans les deux sens. */
  function idDuSejour(cle) {
    if (!cle) return null;
    var p = String(cle).split(':');
    if (p.length !== 3) return resaExiste(cle) ? cle : null;   // déjà un identifiant
    var liste = (state.resas && state.resas[p[0]]) || [];
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].start === p[1] && liste[i].end === p[2]) return liste[i].id || null;
    }
    return null;
  }

  function cleDuSejour(rid) {
    if (!rid) return null;
    var trouve = null;
    Object.keys(state.resas || {}).forEach(function (pid) {
      (state.resas[pid] || []).forEach(function (r) {
        if (r.id === rid) trouve = pid + ':' + r.start + ':' + r.end;
      });
    });
    return trouve;
  }

  var ETATS_MISSION = ['dispo', 'prise', 'encours', 'termine', 'annulee'];

  function missionVersBase(m) {
    return {
      id: m.id,
      property_id: m.prop,
      reservation_id: idDuSejour(m.fromResa),
      type: m.type || 'menage',
      date: m.date,
      window_label: m.windowLabel || '',
      price: m.price || 0,
      status: ETATS_MISSION.indexOf(m.status) >= 0 ? m.status : 'dispo',
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
    var connues = {};
    lignes.forEach(function (l) { connues[l.id] = true; });
    // Même règle de fusion que les logements et les séjours : une mission
    // créée à l'instant ne doit pas disparaître avant d'être partie.
    var enAttente = (state.missions || []).filter(function (m) { return !connues[m.id]; });

    state.missions = lignes.map(function (l) {
      var sejour = sejourLie(l.reservation_id);
      var m = {
        id: l.id, prop: l.property_id, type: l.type, date: l.date,
        dateLabel: typeof fmtDate === 'function' ? fmtDate(l.date) : l.date,
        windowLabel: l.window_label || '', price: Number(l.price) || 0,
        status: l.status, urgent: l.urgent || '', note: l.note || '',
        turnover: !!l.turnover, fromResa: cleDuSejour(l.reservation_id),
        review: l.review || null, redo: l.redo || ''
      };
      var taker = l.taker_legacy || prenomDuCompte(l.provider_id);
      if (taker) m.taker = taker;
      /* La table des missions ne retient pas la plateforme : on la reprend au
         séjour lié quand il est lisible, et on retombe sur « Direct » sinon.
         Elle valait auparavant la chaîne vide, ce qui faisait planter l'écran
         de la mission côté prestataire (session 14).
         Le nombre de voyageurs n'est plus inventé : « 1 » par défaut faisait
         refaire un seul lit à un prestataire qui en avait quatre à faire.
         Inconnu vaut mieux que faux (session 15). */
      if (l.guest || sejour) {
        m.res = {
          guest: l.guest || (sejour && sejour.guest) || 'Voyageur',
          guests: l.guests || (sejour && sejour.guests) || null,
          nights: sejour && typeof nights === 'function' ? nights(sejour.start, sejour.end) : 0,
          plat: (sejour && sejour.plat) || platDuSejour(l.reservation_id)
        };
      }
      if (l.next_guest) m.next = l.next_guest;
      if (l.report) state.reports[l.id] = l.report;
      return m;
    }).concat(enAttente);

    state.missions.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  /* Le séjour d'une mission, s'il est lisible par le compte connecté. */
  function sejourLie(rid) {
    if (!rid) return null;
    var trouve = null;
    Object.keys(state.resas || {}).forEach(function (pid) {
      (state.resas[pid] || []).forEach(function (r) { if (r.id === rid) trouve = r; });
    });
    return trouve;
  }

  /* La plateforme d'une réservation déjà chargée. Un prestataire ne voit le
     séjour qu'une fois la mission prise (règles de lecture du script 01) :
     avant cela, « Direct » est la seule réponse honnête. */
  function platDuSejour(rid) {
    if (!rid) return 'Direct';
    var trouve = null;
    Object.keys(state.resas || {}).forEach(function (pid) {
      (state.resas[pid] || []).forEach(function (r) {
        if (r.id === rid && r.plat) trouve = r.plat;
      });
    });
    return trouve || 'Direct';
  }

  function prenomDuCompte(uid) {
    if (!uid) return null;
    var a = (state.agents || []).filter(function (x) { return x.uid === uid; })[0];
    return a ? a.id : null;
  }

  /* --- les comptes --- */

  /* Deux notions distinctes, et il ne faut surtout pas les confondre :
       - une FICHE de prestataire (`state.agents`) : ce que le propriétaire a
         créé dans l'application. Elle existe même sans compte.
       - un COMPTE (`profiles` dans la base) : de quoi se connecter.
     Le rapprochement se fait par `legacy_id`. Une fiche sans compte reste
     parfaitement utilisable — c'est l'état de tout le monde aujourd'hui. */
  /* `roleLecteur` n'est là que pour pouvoir vérifier cette fonction depuis la
     console sans être connecté : en usage normal on ne le passe pas, et c'est
     le compte courant qui décide. */
  function comptesDepuisBase(lignes, roleLecteur) {
    state.comptes = lignes.map(function (l) {
      return {
        uid: l.id, email: l.email || '', nom: l.full_name || '',
        role: l.role, kind: l.kind, legacy_id: l.legacy_id || '',
        // Les droits réellement inscrits dans le compte — c'est ce que la
        // base regarde, et donc ce que la personne verra sur son téléphone.
        props: l.props || [], services: l.services || null
      };
    });

    var vivants = {};
    lignes.forEach(function (l) { vivants[l.id] = true; });

    /* QUI FAIT FOI ? La réponse dépend de l'appareil, et c'est capital
       (corrigé en session 14, après incident) :

       - Sur l'appareil du PROPRIÉTAIRE, c'est **la fiche** : c'est lui qui
         coche les logements, et les cases qu'il vient de cocher n'ont pas
         encore forcément atteint le compte. La version précédente recopiait
         le compte sur la fiche dans tous les cas — donc un compte tout neuf,
         sans aucun logement, **effaçait à chaque lecture** les logements
         cochés, et le prestataire restait bloqué sur « accès en attente »
         quoi que fasse le propriétaire. Tout écart constaté ici est renvoyé
         vers le compte, jamais l'inverse. Même esprit que D-63.

       - Sur l'appareil du PRESTATAIRE, c'est **le compte** : sa fiche
         n'existe nulle part ailleurs (les fiches ne migrent qu'au lot 4),
         elle est fabriquée à partir du compte, et de toute façon c'est le
         compte que la base regarde pour décider de ce qui est visible. */
    var jeSuisLeProprio = (roleLecteur || (profil && profil.role)) === 'owner';
    var aRenvoyer = false;

    lignes.forEach(function (l) {
      if (l.role !== 'provider') return;

      // Le rapprochement se fait par `legacy_id` ; à défaut — un compte relié
      // avant que l'identifiant ne soit posé — par l'identifiant du compte.
      var a = (state.agents || []).filter(function (x) {
        return (l.legacy_id && x.id === l.legacy_id) || (x.uid && x.uid === l.id);
      })[0];

      if (!a) {
        // Chez le propriétaire, un compte sans fiche n'est pas une fiche à
        // inventer : c'est un compte à relier, et l'écran des prestataires
        // le propose déjà.
        if (jeSuisLeProprio) return;
        a = ficheDepuisCompte(l);
        if (!Array.isArray(state.agents)) state.agents = [];
        state.agents.push(a);
      }

      a.uid = l.id;
      a.email = l.email || a.email;
      if (l.full_name) a.name = l.full_name;

      if (jeSuisLeProprio) {
        if (!Array.isArray(a.props)) a.props = l.props || [];
        if (ecartDeDroits(a, l)) aRenvoyer = true;
      } else {
        a.kind = l.kind || a.kind;
        a.props = l.props || [];
        if (l.services) a.services = l.services;
        /* L'identifiant de la fiche doit rester exactement celui que
           `state.me` désigne. Une fiche fabriquée avant que le propriétaire
           n'ait relié le compte portait l'ancien nom : elle existait, mais
           n'était plus jamais retrouvée, et l'écran restait bloqué sur
           « accès en attente » quoi que coche le propriétaire (session 15). */
        var attendu = identifiantDeCompte(l);
        if (a.id !== attendu) {
          (state.missions || []).forEach(function (m) { if (m.taker === a.id) m.taker = attendu; });
          a.id = attendu;
        }
      }
    });

    // Un compte supprimé dans Supabase ne doit pas laisser une fiche
    // qui se croit encore reliée à quelque chose.
    (state.agents || []).forEach(function (a) {
      if (a.uid && !vivants[a.uid]) delete a.uid;
    });

    // Ce que le compte n'avait pas encore, on le lui donne — sans attendre
    // que le propriétaire modifie quoi que ce soit.
    if (aRenvoyer) setTimeout(majComptesLies, 0);
  }

  /* Les droits inscrits sur la fiche et ceux inscrits dans le compte
     disent-ils la même chose ? C'est le compte que la base regarde. */
  function ecartDeDroits(a, l) {
    return memeListe(a.props || [], l.props || []) === false ||
      memeListe(a.services || null, l.services || null) === false ||
      (a.kind || 'menage') !== (l.kind || 'menage');
  }

  function memeListe(x, y) {
    if (x === null || y === null) return x === y;
    if (!Array.isArray(x) || !Array.isArray(y)) return false;
    if (x.length !== y.length) return false;
    var tri = function (v) { return v.slice().sort().join('|'); };
    return tri(x) === tri(y);
  }

  /* Fabrique une fiche de prestataire à partir d'un compte. Sert sur
     l'appareil du prestataire, qui n'a pas la liste du propriétaire.
     Les couleurs d'avatar reprennent la palette du §4. */
  var TEINTES = [
    { bg: '#F7E7DF', fg: '#B04A26' }, { bg: '#E4EDF4', fg: '#2F6C93' },
    { bg: '#E3F0E9', fg: '#227052' }, { bg: '#F7EEDC', fg: '#9A6B15' },
    { bg: '#EAE6F4', fg: '#5B4E85' }
  ];

  /* Sous quel nom l'application désigne-t-elle ce compte ? `legacy_id` est
     l'identifiant de sa fiche ('Sofia') ; à défaut — un compte créé sans
     invitation, ou relié à la main — on retombe sur son nom puis sur son
     adresse. **La même règle doit servir partout** : `entrerAvecProfil()`
     s'en sert pour poser `state.me`, et la fiche fabriquée ci-dessous pour
     son `id`. Deux règles différentes, et la fiche ne serait jamais
     retrouvée : écran « accès en attente » sans issue. */
  function identifiantDeCompte(l) {
    return l.legacy_id || l.full_name || l.email || l.id;
  }

  function ficheDepuisCompte(l) {
    var nom = l.full_name || l.email || 'Prestataire';
    var t = TEINTES[Math.abs(hachage(l.id)) % TEINTES.length];
    return {
      id: identifiantDeCompte(l),
      uid: l.id,
      name: nom,
      init: initiales(nom),
      kind: l.kind || 'menage',
      role: l.job_label || (l.kind === 'cles' ? 'Remise des clés' : 'Prestataire'),
      since: l.since || '',
      note: '—',
      email: l.email || '',
      iban: l.iban || '',
      avatarBg: t.bg, avatarFg: t.fg, roleBg: t.bg, roleFg: t.fg,
      props: l.props || [],
      services: l.services || undefined
    };
  }

  function initiales(nom) {
    return nom.split(/[\s@.]+/).filter(Boolean).slice(0, 2)
      .map(function (x) { return x.charAt(0).toUpperCase(); }).join('') || '?';
  }

  function hachage(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0;
    return n;
  }

  /* --- ce qu'un PRESTATAIRE écrit dans le cahier ---------------------------
     Il ne pousse jamais tout l'état (il n'en a pas le droit, et il n'a pas
     les données du propriétaire) : il ne touche qu'à SA mission.
     ---------------------------------------------------------------------- */

  /* Prendre une mission passe par une fonction de la base : c'est elle qui
     tranche si deux personnes appuient en même temps (D-60). Une simple
     modification serait d'ailleurs refusée — les règles de lecture
     n'autorisent le prestataire à modifier que les missions qu'il détient
     DÉJÀ, et une mission libre n'appartient à personne. */
  function prendreMission(id) {
    if (!dispo || !profil) return Promise.reject(new Error('Connexion indisponible.'));
    return client.rpc('prendre_mission', { mission_id: id }).then(function (r) {
      if (r.error) {
        if (/déjà prise|non autoris/i.test(r.error.message || '')) {
          throw new Error('Trop tard : cette mission vient d\'être prise par quelqu\'un d\'autre.');
        }
        throw new Error(messageClair(r.error));
      }
      return r.data;
    });
  }

  /* Avancement d'une mission déjà prise : démarrage, fin, compte rendu. */
  function majMission(m) {
    if (!dispo || !profil || !m) return Promise.resolve();
    return client.from('missions').update({
      status: ETATS_MISSION.indexOf(m.status) >= 0 ? m.status : 'dispo',
      report: (state.reports && state.reports[m.id]) || null,
      done_at: m.status === 'termine' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq('id', m.id).then(function (r) {
      if (r.error) derniereErreur = messageClair(r.error);
      return !r.error;
    });
  }

  /* Le compte connecté est-il un prestataire relié ? */
  function estPrestataireRelie() {
    return !!(dispo && profil && profil.role === 'provider');
  }

  /* ---- SUPPRIMER POUR DE BON (session 16) --------------------------------
     `pousser()` ne sait qu'ajouter et modifier. Une ligne effacée dans
     l'application restait donc dans le cahier partagé, et **revenait à la
     première relecture** : missions, séjours et logements semblaient
     impossibles à supprimer. Il faut donc le dire au cahier, explicitement.

     La suppression n'est pas silencieuse : si la base refuse, on renseigne
     `derniereErreur` et on rend `false`, pour que l'écran puisse le dire
     (règle D-72 : une écriture refusée doit se voir). */
  function supprimerLigne(table, id) {
    if (!dispo || !profil || !id) return Promise.resolve(true);
    return client.from(table).delete().eq('id', id).then(function (r) {
      if (r && r.error) { derniereErreur = messageClair(r.error); return false; }
      return true;
    }).catch(function (e) {
      derniereErreur = messageClair(e);
      return false;
    });
  }

  function supprimerMission(id) { return supprimerLigne('missions', id); }
  function supprimerResa(id) { return supprimerLigne('reservations', id); }
  function supprimerBien(id) { return supprimerLigne('properties', id); }

  /* ---- LES PHOTOS DE CHECKLIST (lot 2) -----------------------------------
     Un cahier range du texte ; les images vont dans un **casier** à part
     (Supabase Storage), et le cahier ne garde que l'étiquette qui dit où les
     trouver. Rangement : <casier>/<mission>/<étape>.jpg — le premier dossier
     est l'identifiant de la mission, et c'est lui que regardent les règles
     posées par `supabase/05-photos.sql`.

     Le casier n'est PAS public : on ne peut pas en construire l'adresse. On
     demande à Supabase une adresse **signée**, valable une heure, et elle
     n'est jamais enregistrée — elle serait périmée au rechargement. */

  var CASIER_PHOTOS = 'photos-missions';

  function cheminPhoto(missionId, etapeId) {
    return missionId + '/' + etapeId + '.jpg';
  }

  /* Dépose une photo. Le prestataire ne peut écrire que dans le dossier d'une
     mission qu'il détient : c'est la base qui le vérifie, pas nous. */
  function envoyerPhoto(missionId, etapeId, image) {
    if (!dispo || !profil) return Promise.reject(new Error('Pas de connexion au cahier partagé.'));
    return client.storage.from(CASIER_PHOTOS)
      .upload(cheminPhoto(missionId, etapeId), image, {
        contentType: 'image/jpeg',
        upsert: true                      // refaire une photo remplace l'ancienne
      })
      .then(function (r) {
        if (r.error) throw new Error(messageClair(r.error));
        return cheminPhoto(missionId, etapeId);
      });
  }

  /* Retire une photo. Sans conséquence si elle n'était jamais partie. */
  function supprimerPhoto(missionId, etapeId) {
    if (!dispo || !profil) return Promise.resolve(false);
    return client.storage.from(CASIER_PHOTOS)
      .remove([cheminPhoto(missionId, etapeId)])
      .then(function (r) { return !(r && r.error); })
      .catch(function () { return false; });
  }

  /* Les adresses signées des photos d'une mission, pour la revue du
     propriétaire. Rend { etapeId: adresse } — les étapes sans photo déposée
     sont simplement absentes du résultat. */
  function urlsPhotos(missionId, etapeIds) {
    if (!dispo || !profil || !etapeIds || !etapeIds.length) return Promise.resolve({});
    var chemins = etapeIds.map(function (sid) { return cheminPhoto(missionId, sid); });
    return client.storage.from(CASIER_PHOTOS).createSignedUrls(chemins, 3600)
      .then(function (r) {
        if (r.error) throw new Error(messageClair(r.error));
        var out = {};
        (r.data || []).forEach(function (x, i) {
          if (x && x.signedUrl && !x.error) out[etapeIds[i]] = x.signedUrl;
        });
        return out;
      });
  }

  /* ---- LE LIVRET DU VOYAGEUR (lot 3) -------------------------------------

     Le voyageur n'a **pas de compte**, et n'en aura jamais. Le cahier partagé
     ne lui ouvre donc rien : c'est la règle « par défaut, personne ne voit
     rien » du script 01. Jusqu'à la session 18, le livret vivait dans le
     navigateur du propriétaire, et un voyageur qui ouvrait son lien depuis
     son propre téléphone tombait sur une page vide.

     Les quatre fonctions de `supabase/07-livret-voyageur.sql` sont des
     **portes étroites** : elles s'exécutent avec les droits de leur auteur
     mais ne font que ce qui est écrit dedans. On ne peut ni lister les
     séjours, ni lire une table ; on peut demander « le séjour dont voici le
     lien », et c'est tout. Le code d'accès et le Wi-Fi n'en sortent que
     pendant les dates du séjour (D-51).
     ---------------------------------------------------------------------- */

  /** Le séjour désigné par un lien personnel. Rend null si le lien ne
      correspond à rien — jamais une erreur : un voyageur n'a pas à lire un
      message technique parce qu'un SMS a coupé son lien. */
  function sejourParLien(jeton) {
    if (!dispo || !jeton) return Promise.resolve(null);
    return client.rpc('sejour_par_lien', { jeton: jeton }).then(function (r) {
      if (r.error) throw new Error(messageClair(r.error));
      return (r.data || [])[0] || null;
    });
  }

  /** Retrouver un séjour par le nom du voyageur et sa date d'arrivée. */
  function chercherSejour(nom, jour) {
    if (!dispo) return Promise.resolve([]);
    return client.rpc('chercher_sejour', { nom: nom || '', jour: jour }).then(function (r) {
      if (r.error) throw new Error(messageClair(r.error));
      return r.data || [];
    });
  }

  /* Le voyageur laisse ses coordonnées. La fonction met aussi à jour les
     missions concernées : c'est ainsi que la prestataire apprend qui arrive
     derrière et à quelle heure. */
  function enregistrerVoyageur(jeton, d) {
    if (!dispo || !jeton) return Promise.reject(new Error('Lien inconnu.'));
    return client.rpc('enregistrer_voyageur', {
      jeton: jeton,
      p_nom: d.nom || null,
      p_tel: d.tel || null,
      p_mail: d.mail || null,
      p_guests: d.guests ? parseInt(d.guests, 10) : null,
      p_arrivee: d.arrivee || null,
      p_optin: typeof d.optin === 'boolean' ? d.optin : null
    }).then(function (r) {
      if (r.error) throw new Error(messageClair(r.error));
      return r.data === true;
    });
  }

  /** « J'ai quitté le logement ». */
  function signalerDepart(jeton, heure) {
    if (!dispo || !jeton) return Promise.resolve(false);
    return client.rpc('signaler_depart', { jeton: jeton, heure: heure || '' }).then(function (r) {
      if (r.error) throw new Error(messageClair(r.error));
      return r.data === true;
    });
  }

  /* --- rapprochement fiche ↔ compte, depuis l'écran Prestataires --- */

  function lierCompte(uid, fiche) {
    if (!dispo || !profil || profil.role !== 'owner') {
      return Promise.reject(new Error('Réservé au propriétaire.'));
    }
    return client.from('profiles').update({
      legacy_id: fiche.id,
      full_name: fiche.name || '',
      job_label: fiche.role || '',
      kind: fiche.kind || 'menage',
      iban: fiche.iban || '',
      since: fiche.since || '',
      props: fiche.props || [],
      services: fiche.services || null
    }).eq('id', uid).then(function (r) {
      if (r.error) throw new Error(messageClair(r.error));
      return true;
    });
  }

  function delierCompte(uid) {
    if (!dispo || !profil || profil.role !== 'owner') {
      return Promise.reject(new Error('Réservé au propriétaire.'));
    }
    return client.from('profiles')
      .update({ legacy_id: null, props: [], services: null })
      .eq('id', uid).then(function (r) {
        if (r.error) throw new Error(messageClair(r.error));
        return true;
      });
  }

  /* Les droits d'un prestataire lié doivent suivre les cases cochées par le
     propriétaire : sans cette recopie, cocher — ou décocher — un logement ne
     changerait rien à ce que la base laisse voir, et donc rien à ce que le
     prestataire voit sur son téléphone.
     Les erreurs étaient avalées en silence : elles sont désormais retenues,
     car c'est exactement le genre d'échec invisible qui fait dire « j'ai
     pourtant confié un bien, et il ne voit toujours rien ». */
  function majComptesLies() {
    if (!dispo || !profil || profil.role !== 'owner') return Promise.resolve(false);
    var lies = (state.agents || []).filter(function (a) { return a.uid; });
    if (!lies.length) return Promise.resolve(true);
    return lies.reduce(function (chaine, a) {
      return chaine.then(function (ok) {
        return client.from('profiles').update({
          kind: a.kind || 'menage',
          props: a.props || [],
          services: a.services || null,
          legacy_id: a.id,
          full_name: a.name || '',
          job_label: a.role || ''
        }).eq('id', a.uid).then(function (r) {
          if (r && r.error) {
            derniereErreur = messageClair(r.error) + ' (en ouvrant les droits de ' + (a.name || a.id) + ')';
            return false;
          }
          return ok;
        });
      });
    }, Promise.resolve(true));
  }

  /* ----------------------------------------------------------------------
     3. LECTURE — remplir `state` depuis la base
     ---------------------------------------------------------------------- */

  /* Garde-fou capital : tant qu'on n'a pas LU le cahier au moins une fois,
     on ne lui écrit rien. Sans cela, ouvrir l'application sur un navigateur
     resté sur les données de démonstration écraserait les vraies données du
     cahier à la première modification — le temps que la lecture arrive.
     Seul le déménagement, qui est un geste volontaire, passe outre. */
  var premiereLectureFaite = false;

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

      // TOUJOURS EN PREMIER : c'est ce qui reconstitue la fiche du compte
      // connecté sur son propre appareil. Le faire plus bas serait un piège —
      // un prestataire à qui aucun logement n'a été coché ne voit AUCUN bien,
      // on sortirait avant, sa fiche ne serait jamais créée, et il ne pourrait
      // cliquer sur rien sans comprendre pourquoi.
      comptesDepuisBase(r[4].data || []);

      // Aucun bien lisible : soit le déménagement n'a pas eu lieu, soit ce
      // prestataire n'a encore aucun logement attribué. Dans les deux cas on
      // laisse `state` tel quel plutôt que de vider les écrans — mais on a
      // bien lu, donc l'écriture est désormais autorisée.
      if (!r[0].data || !r[0].data.length) {
        premiereLectureFaite = true;
        return false;
      }

      biensDepuisBase(r[0].data, r[1].data || []);

      // RÈGLE DE SÛRETÉ : le cahier ne vide jamais le navigateur.
      // Une collection vide côté base signifie presque toujours qu'elle n'y a
      // pas encore été écrite — un déménagement interrompu, par exemple.
      // L'écraser ferait disparaître le travail local, et la sauvegarde
      // figerait aussitôt ce vide. On garde donc ce qu'on a, et la prochaine
      // écriture renverra le contenu vers le cahier.
      // Limite assumée : supprimer la dernière réservation depuis un autre
      // appareil ne se propage pas ici. À revoir quand les suppressions
      // seront elles aussi enregistrées (lot 4).
      var resas = r[2].data || [];
      var missions = r[3].data || [];
      var localResas = compterResas();

      if (resas.length || !localResas) resasDepuisBase(resas);
      if (missions.length || !(state.missions || []).length) missionsDepuisBase(missions);

      if (typeof upgrade === 'function') upgrade();
      premiereLectureFaite = true;

      // Ce que le cahier n'avait pas, on le lui rend.
      if ((!resas.length && localResas) || (!missions.length && (state.missions || []).length)) {
        setTimeout(pousserMaintenant, 0);
      }
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
    if (!premiereLectureFaite) return;   // on n'écrit jamais avant d'avoir lu
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
    var missions = (state.missions || [])
      .filter(function (m) { return m.id && m.date && bienExiste(m.prop); })
      .map(missionVersBase);

    // Chaque étape est vérifiée : Supabase ne « rejette » pas une écriture
    // refusée, il rend un objet { error }. Sans ce contrôle, une erreur sur
    // les biens passerait inaperçue et on croirait le déménagement réussi.
    // L'ordre compte : les réservations et les missions renvoient aux biens.
    var etapes = [
      { nom: 'les logements', table: 'properties', lignes: biens },
      { nom: 'les codes d\'accès', table: 'property_secrets', lignes: secrets },
      { nom: 'les réservations', table: 'reservations', lignes: resas },
      { nom: 'les missions', table: 'missions', lignes: missions }
    ];

    return etapes.reduce(function (chaine, e) {
      return chaine.then(function () {
        if (!e.lignes.length) return null;
        return client.from(e.table).upsert(e.lignes).then(function (r) {
          if (r && r.error) {
            var err = new Error(messageClair(r.error) + ' (en écrivant ' + e.nom + ')');
            err.detail = r.error;
            throw err;
          }
          return r;
        });
      });
    }, Promise.resolve()).then(function () {
      return { ok: true, biens: biens.length, resas: resas.length, missions: missions.length };
    }).catch(function (e) {
      return { ok: false, erreur: e.message || messageClair(e) };
    }).then(function (bilan) {
      derniereErreur = bilan.ok ? null : bilan.erreur;
      /* LES DROITS PARTENT DANS TOUS LES CAS (session 15, après incident).
         Ils étaient jusqu'ici accrochés à la fin de la chaîne ci-dessus : la
         moindre écriture refusée — une mission, un séjour — et les logements
         cochés par le propriétaire n'atteignaient jamais le compte du
         prestataire. Sur son téléphone : « aucun logement confié », alors que
         tout était coché de l'autre côté. Ce sont deux sujets distincts, ils
         ne doivent plus dépendre l'un de l'autre.
         `majComptesLies()` renseigne elle-même `derniereErreur` si la base
         refuse : on ne masque donc rien en la laissant passer après. */
      return majComptesLies().then(function () { return bilan; },
        function () { return bilan; });
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
    return pousserMaintenant().then(function (bilan) {
      if (!bilan.ok) throw new Error(derniereErreur || 'Le déménagement a échoué.');
      premiereLectureFaite = true;   // geste volontaire : l'écriture est acquise
      return bilan;
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
    sessionLocale: sessionLocale,
    connexion: connexion,
    inscription: inscription,
    deconnexion: deconnexion,
    creerInvitation: creerInvitation,
    invitations: invitations,
    annulerInvitation: annulerInvitation,
    lireInvitation: lireInvitation,
    accepterInvitation: accepterInvitation,
    viderDonnees: viderDonnees,
    charger: charger,
    lierCompte: lierCompte,
    delierCompte: delierCompte,
    // Exposée : c'est elle qui reconstitue les fiches à partir des comptes,
    // et c'est le point le plus délicat de la couche (une erreur ici fait
    // disparaître des prestataires ou leur retire tous leurs droits).
    appliquerComptes: comptesDepuisBase,
    identifiantDeCompte: identifiantDeCompte,
    majComptesLies: majComptesLies,
    prendreMission: prendreMission,
    majMission: majMission,
    supprimerMission: supprimerMission,
    supprimerResa: supprimerResa,
    supprimerBien: supprimerBien,
    estPrestataireRelie: estPrestataireRelie,
    envoyerPhoto: envoyerPhoto,
    supprimerPhoto: supprimerPhoto,
    urlsPhotos: urlsPhotos,
    // Le livret du voyageur (lot 3) — appelable sans compte.
    sejourParLien: sejourParLien,
    chercherSejour: chercherSejour,
    enregistrerVoyageur: enregistrerVoyageur,
    signalerDepart: signalerDepart,
    pousser: pousser,
    pousserMaintenant: pousserMaintenant,
    ecouter: ecouter,
    taire: taire,
    demenager: demenager
  };

})();
