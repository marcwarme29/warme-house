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
  /* Le résultat de la dernière écriture vers le cahier partagé, pour que
     l'écran du propriétaire puisse le DIRE (session 19). */
  var dernierEnvoi = null;

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
    /* « LOAD FAILED » — LE MESSAGE DE SAFARI (session 24, D-134)

       Chaque navigateur a son mot pour « la requête n'est jamais partie » :
       Chrome et Firefox disent « Failed to fetch », **Safari dit « Load
       failed »**, et le Safari de l'iPhone aussi. Seul le premier était
       reconnu ici : sur le Mac et l'iPhone de Marc, l'écran de connexion
       affichait donc « Load failed » en anglais, sans la moindre indication.
       C'est la règle 5 prise à l'envers — on n'invente pas de valeur, mais on
       ne recopie pas non plus un message que personne ne peut comprendre.

       Et la cause la plus fréquente, de loin, est unique : **Supabase met en
       pause les projets gratuits laissés une semaine sans usage**, et retire
       alors leur adresse. L'application frappe à une porte qui n'existe plus.
       Rien n'est perdu — le projet se réveille d'un bouton — mais il faut le
       dire, sinon le symptôme ressemble à une panne de mot de passe. */
    if (/Failed to fetch|Load failed|NetworkError|network ?error|ERR_NAME|ERR_INTERNET/i.test(m)) {
      return 'Le serveur ne répond pas. Deux raisons possibles, dans cet ordre : ' +
        '① le projet Supabase est en pause (c\'est automatique après une semaine sans usage) — ' +
        'ouvre supabase.com, connecte-toi, et appuie sur « Restore project » : rien n\'est perdu ; ' +
        '② ta connexion internet est coupée.';
    }
    if (/row-level security/i.test(m)) return 'Ce compte n\'a pas le droit d\'écrire ici.';
    if (/JWT|token/i.test(m)) return 'La session a expiré : reconnecte-toi.';
    /* « Cette fonction n'existe pas » veut toujours dire : un script n'a pas
       été collé. On nomme LEQUEL — il y en a plusieurs depuis le lot 3, et un
       message qui désigne le mauvais fait perdre du temps (session 18). */
    if (/schema cache|Could not find the (function|table)/i.test(m)) {
      /* `chercher_sejour_dates` doit être testé AVANT `chercher_sejour`, qui
         est contenu dedans : sinon le message nomme le script 07 alors que
         c'est le 10 qui manque, et on cherche au mauvais endroit (D-139). */
      var script = /chercher_sejour_dates/i.test(m)
        ? '« 10-recherche-par-dates.sql »'
        : /sejour_par_lien|chercher_sejour|enregistrer_voyageur|signaler_depart|nom_simple/i.test(m)
        ? '« 07-livret-voyageur.sql »'
        : /deposer_avis|\bavis\b/i.test(m) ? '« 08-avis.sql »'
          : /demander_acces|menage_fini|prestataires|stocks|reglages|acces/i.test(m) ? '« 09-lot4.sql »'
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
      /* « LE CAHIER NE M'A RIEN ENVOYÉ » ≠ « IL N'Y A RIEN » (session 26, D-147)

         Signalé : *« sur la plateforme du prestataire, le prestataire ne voit
         pas le code Wi-Fi et le code d'entrée si la prestation était à une date
         antérieure. »* La session 20 avait conclu que la date n'y était pour
         rien (D-115) — c'est vrai, et ce n'était pas la bonne question.

         La règle `secrets_presta` (script 06) n'ouvre `property_secrets` qu'à
         qui tient une mission **`prise` ou `encours`** sur ce logement. Dès que
         la mission passe à **`termine`**, la lecture se referme — et cette
         ligne **recopiait alors une chaîne vide par-dessus le code déjà lu**.
         Le code s'affichait pendant la mission, puis disparaissait de son
         téléphone, y compris hors ligne. Même chose si le lien fiche/compte
         casse (D-142) : plus de mission à son nom, donc plus de secrets.

         C'est la règle 3 (le cahier ne vide jamais le navigateur) et la
         règle 5 (« la table est vide » et « je n'ai pas le droit de la lire »
         sont deux réponses différentes) au même endroit.

         On distingue donc les deux cas : **aucune ligne** pour ce logement — on
         garde ce qu'on avait, la personne l'a lu légitimement ; **une ligne
         avec un code vide** — le propriétaire l'a effacé, on suit. */
      var s = parId[l.id];
      var ancien = state.info[l.id] || {};
      var secrets = s
        ? { code: s.code || '', wifi: s.wifi || '' }
        : { code: ancien.code || '', wifi: ancien.wifi || '' };
      state.info[l.id] = Object.assign({}, l.info || {}, secrets);
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
     quelque chose à y mettre.

     ⚠️ CE QUI ÉTAIT FAUX, ET QUI A TOUT BLOQUÉ (session 20, D-113)

     « Un upsert n'écrit que les colonnes fournies : ce qui est omis reste tel
     quel. » C'est vrai d'une ligne SEULE. Ce n'est **pas** vrai d'un envoi
     groupé, et `pousser()` envoie toutes les réservations d'un coup.

     PostgREST fabrique **une seule** instruction pour tout le lot, dont les
     colonnes sont l'**union** des clés de tous les objets. Une ligne à qui
     manque une clé que d'autres ont ne reçoit donc pas la valeur par défaut,
     ni son ancienne valeur : elle reçoit **NULL**.

     Conséquences, tant qu'aucun voyageur ne s'était identifié : aucune, tous
     les objets avaient les mêmes clés. Mais dès qu'UN voyageur remplissait
     son livret, sa ligne portait `guest_ok`, et toutes les autres partaient
     avec `guest_ok = null` — colonne `not null`. **Le lot entier était
     refusé.** Or l'étape des réservations n'est pas facultative : la chaîne
     s'arrêtait là, et **les missions ne partaient jamais**. Sur le téléphone
     de la prestataire : rien.

     Et le remède d'origine se retournait contre lui-même : `tel`, `mail`,
     `arrivee_prevue`, `guests` et `depart_at` acceptent NULL, eux. Ils
     auraient été **effacés** sur toutes les autres réservations — exactement
     l'effacement que D-91 voulait empêcher.

     LE REMÈDE : deux passes, et un jeu de clés FIXE dans chacune.
     `resaVersBase()` ne rend plus que les colonnes du **propriétaire**,
     toujours les mêmes, pour toutes les lignes — aucune union possible.
     `resaVoyageur()` rend, ligne par ligne, les seules colonnes du voyageur
     qu'on a vraiment, envoyées par des `update` ciblés. La garantie de D-91
     est conservée à la lettre : on n'envoie jamais une colonne du voyageur
     dont on n'a pas la valeur. */
  function resaVersBase(r, pid) {
    return {
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
  }

  /* Les colonnes qui appartiennent au voyageur, pour CETTE réservation.
     Rend `null` quand il n'y a rien à dire — et il n'y a alors rien à
     envoyer, ce qui est le comportement voulu. */
  function resaVoyageur(r, pid) {
    var maj = {};
    if (r.guests) maj.guests = r.guests;
    if (r.tel4) maj.tel4 = r.tel4;
    if (r.tel) maj.tel = r.tel;
    if (r.mail) maj.mail = r.mail;
    if (r.arriveePrevue) maj.arrivee_prevue = r.arriveePrevue;
    if (r.guestOk) maj.guest_ok = true;
    if (r.demarchable) maj.demarchable = true;
    var parti = departSignale(pid, r);
    if (parti) maj.depart_at = parti;
    return Object.keys(maj).length ? { id: r.id, maj: maj } : null;
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

  /* LE PROPRIÉTAIRE N'EFFACE PLUS LE TRAVAIL DU PRESTATAIRE (session 25, D-142)

     C'était la règle 16 (D-91) jamais appliquée aux missions, et elle coûtait
     très cher. Cet envoi partait avec TOUTES les missions de l'ordinateur du
     propriétaire, à chaque enregistrement, et il portait trois colonnes que
     seul le PRESTATAIRE remplit : `provider_id` (à qui la mission appartient),
     `taker_legacy` (son nom) et `report` (son compte rendu).

     Quand le propriétaire ne savait pas nommer le preneur — sa fiche pas encore
     reliée au compte, ou simplement une copie d'écran en retard de quelques
     secondes sur ce que la prestataire venait de faire —, il envoyait
     `provider_id: null`. Le cahier obéissait. Et comme les règles de lecture
     de Supabase disent « un prestataire ne voit que les missions dont
     `provider_id` est le sien », la mission **disparaissait purement et
     simplement de son téléphone** ; côté propriétaire elle restait « terminée »
     mais sans nom, donc invisible au registre de paie — « 0 mission ».

     Trois symptômes, une seule cause. On retire donc ces trois colonnes d'ici :
     elles partent maintenant par une mise à jour ciblée, ligne par ligne, qui
     n'écrit que ce qu'on sait vraiment (voir `missionPreneur`). Ce qui n'est
     pas fourni reste intact — c'est tout l'objet de la règle 16.

     SESSION 28 — `status` SORT D'ICI AUSSI (D-154). Il y était resté au nom
     d'un raisonnement juste mais incomplet : « c'est le propriétaire qui crée
     et qui annule, une annulation doit pouvoir partir » (D-119). C'était vrai
     de l'annulation, et faux de tout le reste. Ce que le propriétaire renvoyait
     ainsi, à **chaque enregistrement** — un filtre cliqué suffit —, c'était
     l'avancement écrit par la prestataire : `prise`, `encours`, `termine`.
     Un écran en retard de quelques heures — un second ordinateur, un onglet
     resté ouvert, un téléphone rouvert — repoussait donc son ancienne copie
     par-dessus la vérité, et **une mission terminée redevenait « en cours »**.
     Signalé pour de vrai le 22 août : le ménage de Doriane du 21 était validé,
     puis n'était plus que « en cours », checklist et photos hors de vue.
     Le §7 disait « assumé, à revoir si le cas se présente ». Il s'est présenté.

     La colonne part maintenant par une **mise à jour ciblée** (`majStatut`),
     à chaque endroit où le propriétaire a vraiment le droit de décider du
     statut : annuler, demander une reprise, attribuer, retirer. Et à
     l'insertion, la colonne prend sa valeur par défaut — `dispo` (script 01) —
     ce qui est exactement l'état d'une mission qui naît.

     ⚠️ ELLE EST RETIRÉE DE **TOUTES** LES LIGNES, JAMAIS DE CERTAINES. Dans un
     envoi groupé, une clé absente d'une seule ligne y vaut NULL et non « on
     n'y touche pas » : ce serait retomber dans D-113 par la porte d'à côté
     (règle 21). */
  function missionVersBase(m) {
    return {
      id: m.id,
      property_id: m.prop,
      reservation_id: idDuSejour(m.fromResa),
      type: m.type || 'menage',
      date: m.date,
      window_label: m.windowLabel || '',
      price: m.price || 0,
      guest: (m.res && m.res.guest) || '',
      guests: (m.res && m.res.guests) || null,
      urgent: m.urgent || '',
      note: m.note || '',
      turnover: !!m.turnover,
      next_guest: m.next || null,
      review: m.review || null,
      redo: m.redo || ''
    };
  }

  /* Les colonnes du PRENEUR, envoyées seulement quand on les connaît.

     Une par ligne, jamais en lot : dans un envoi groupé, une clé absente d'une
     ligne vaut NULL et non « on n'y touche pas » (règle 21, D-113). C'est
     précisément le piège qu'on cherche à éviter ici, il serait absurde d'y
     retomber par la porte d'à côté. Même forme que `majVoyageurs`.

     Rien à envoyer quand personne n'a pris la mission : le cahier garde ce
     qu'il a, et une mission neuve naît sans preneur, ce qui est correct. */
  function missionPreneur(m) {
    if (!m || !m.id || !m.taker) return null;
    var maj = { taker_legacy: m.taker };
    var uid = uuidDuPrestataire(m.taker);
    if (uid) maj.provider_id = uid;
    var rapport = state.reports && state.reports[m.id];
    if (rapport) maj.report = rapport;
    return { id: m.id, maj: maj };
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

  /* --- les avis des voyageurs (script 08, session 19) ---------------------

     Quatrième donnée qui ne voyageait pas — après les photos, le code de la
     porte et le registre de paie. Le voyageur note la propreté trouvée en
     arrivant, cette note reste sur l'appareil où elle a été saisie, et la
     prestataire lit « pas encore de note » alors qu'elle en a. Règle 14.

     L'IDENTIFIANT EST CALCULÉ, PAS TIRÉ AU HASARD. `av_<séjour>_<type>` :
     le voyageur qui dépose depuis son téléphone et le propriétaire qui envoie
     son historique fabriquent alors **la même ligne**, et l'un ne crée pas le
     doublon de l'autre. C'est aussi ce qui rend l'index unique du script 08
     inoffensif. Sans séjour identifié — un avis d'avant la session 16 —, on
     garde l'identifiant local. */
  function idAvis(v, rid) {
    return rid ? 'av_' + rid + '_' + v.kind : v.id;
  }

  /* MÊME DÉFAUT QUE LES MISSIONS, UNE TABLE PLUS LOIN (session 25, D-142).
     `deposer_avis()` (script 08) désigne elle-même, côté serveur, la personne
     qui a fait le ménage noté. Renvoyer ici `provider_id: null` parce que
     l'ordinateur du propriétaire n'a pas su la nommer effaçait ce travail —
     et `avis_presta` filtrant sur `provider_id`, **la note disparaissait de
     l'écran du prestataire**. C'est exactement le symptôme « elle ne voit pas
     ses commentaires » de la session 20, dont on n'avait vu qu'une cause
     (D-110). Même remède : ces deux colonnes sortent de l'envoi groupé. */
  function avisVersBase(v) {
    var rid = idDuSejour(v.resa);
    return {
      id: idAvis(v, rid),
      property_id: v.pid,
      reservation_id: rid,
      mission_id: v.mid || null,
      kind: v.kind === 'sejour' ? 'sejour' : 'menage',
      stars: v.stars,
      texte: v.texte || '',
      guest: v.guest || '',
      date_label: v.dateLabel || ''
    };
  }

  /** Qui a fait le ménage noté — envoyé seulement quand on le sait. */
  function avisPresta(v) {
    if (!v || !v.agent) return null;
    var maj = { taker_legacy: v.agent };
    var uid = uuidDuPrestataire(v.agent);
    if (uid) maj.provider_id = uid;
    return { id: idAvis(v, idDuSejour(v.resa)), maj: maj };
  }

  function avisDepuisBase(lignes) {
    var connus = {};
    lignes.forEach(function (l) { connus[l.id] = true; });
    // Même règle de fusion que partout ailleurs : un avis déposé il y a deux
    // secondes ne doit pas disparaître avant d'être parti.
    var enAttente = (state.avis || []).filter(function (v) {
      return !connus[idAvis(v, idDuSejour(v.resa))];
    });

    state.avis = lignes.map(function (l) {
      return {
        id: l.id,
        pid: l.property_id,
        resa: cleDuSejour(l.reservation_id),
        mid: l.mission_id || null,
        kind: l.kind,
        stars: Number(l.stars) || 0,
        texte: l.texte || '',
        guest: l.guest || '',
        // Le prénom d'abord, comme pour les missions : c'est lui que
        // `agentRating()` compare à l'identifiant de la fiche.
        agent: l.taker_legacy || prenomDuCompte(l.provider_id) || null,
        dateLabel: l.date_label || ''
      };
    }).concat(enAttente);
  }

  /* Le voyageur dépose sa note sans avoir de compte : porte étroite du
     script 08. Il ne fournit que son jeton de séjour ; c'est la base qui
     retrouve elle-même le logement et la personne qui a fait le ménage. */
  function deposerAvis(jeton, kind, stars, texte) {
    if (!dispo) return Promise.resolve(false);
    return client.rpc('deposer_avis', {
      jeton: jeton, p_kind: kind, p_stars: stars, p_texte: texte || ''
    }).then(function (r) {
      if (r.error) throw new Error(messageClair(r.error));
      return r.data === true;
    });
  }

  /* --- LOT 4 : ce qui restait dans le navigateur (script 09, session 19) ---

     Quatre familles de données découvertes par l'audit de stockage. Elles
     avaient toutes le même symptôme : ça marche, tant qu'on reste sur le même
     appareil. Sur un ordinateur neuf, le propriétaire retrouvait les
     prestataires, les articles et les prestations de la DÉMONSTRATION.

     Toutes suivent la règle de fusion de D-75 : la lecture met à jour, elle
     ne remplace pas. Ce qui n'est pas encore parti dans le cahier reste, et
     partira au prochain envoi. */

  /* --- les fiches des prestataires --- */

  function prestataireVersBase(a, moi) {
    return {
      id: a.id,
      owner_id: moi,
      name: a.name || '',
      init: a.init || '',
      kind: a.kind === 'cles' ? 'cles' : 'menage',
      role: a.role || '',
      since: a.since || '',
      email: a.email || '',
      iban: a.iban || '',
      note: a.note || '',
      avatar_bg: a.avatarBg || '',
      avatar_fg: a.avatarFg || '',
      role_bg: a.roleBg || '',
      role_fg: a.roleFg || '',
      props: a.props || [],
      services: a.services || null
    };
  }

  function prestatairesDepuisBase(lignes) {
    if (!lignes.length) return;                  // rien écrit encore : on garde le local
    var parId = {};
    (state.agents || []).forEach(function (a) { parId[a.id] = a; });

    lignes.forEach(function (l) {
      var a = parId[l.id];
      if (!a) {
        a = { id: l.id };
        if (!Array.isArray(state.agents)) state.agents = [];
        state.agents.push(a);
        parId[l.id] = a;
      }
      a.name = l.name || a.name || '';
      a.init = l.init || a.init || '?';
      a.kind = l.kind || a.kind || 'menage';
      a.role = l.role || a.role || '';
      a.since = l.since || a.since || '';
      a.email = l.email || a.email || '';
      a.iban = l.iban || a.iban || '';
      a.note = l.note || a.note || '—';
      a.avatarBg = l.avatar_bg || a.avatarBg || '#EFEAE2';
      a.avatarFg = l.avatar_fg || a.avatarFg || '#8A7D72';
      a.roleBg = l.role_bg || a.roleBg || '#EFEAE2';
      a.roleFg = l.role_fg || a.roleFg || '#8A7D72';

      /* LES DROITS NE SE RELISENT PAS ICI. Sur l'appareil du propriétaire
         c'est la fiche qui fait foi (règle 10) et il vient peut-être de
         cocher une case ; sur celui du prestataire, c'est son COMPTE, et
         `comptesDepuisBase()` s'en charge juste après. Les recopier depuis
         cette table écraserait l'un ou l'autre. On ne les prend que pour une
         fiche qu'on découvre — un ordinateur neuf. */
      if (!Array.isArray(a.props)) a.props = l.props || [];
      if (a.services === undefined) a.services = l.services || null;
    });
  }

  /* --- les stocks --- */

  function stocksVersBase() {
    var out = [];
    Object.keys(state.stock || {}).forEach(function (pid) {
      if (!bienExiste(pid)) return;
      Object.keys(state.stock[pid] || {}).forEach(function (k) {
        out.push({ property_id: pid, article: k, qty: state.stock[pid][k] || 0 });
      });
    });
    return out;
  }

  function stocksDepuisBase(lignes) {
    if (!lignes.length) return;                  // rien écrit encore : on garde le local
    lignes.forEach(function (l) {
      if (!state.stock) state.stock = {};
      if (!state.stock[l.property_id]) state.stock[l.property_id] = {};
      state.stock[l.property_id][l.article] = Number(l.qty) || 0;
    });
  }

  /* Le relevé du prestataire. `pousser()` est réservé au propriétaire : c'est
     donc `finish()` qui appelle ceci, sur le téléphone de la personne qui a
     compté. Sans quoi l'inventaire n'était mis à jour que chez elle. */
  function enregistrerStock(pid, qty) {
    if (!dispo || !profil || !pid || !qty) return Promise.resolve(false);
    var lignes = Object.keys(qty).map(function (k) {
      return { property_id: pid, article: k, qty: qty[k] || 0 };
    });
    if (!lignes.length) return Promise.resolve(false);
    return client.from('stocks').upsert(lignes).then(function (r) {
      if (r && r.error) {
        if (tableAbsente(r.error)) tablesAbsentes.stocks = true;
        derniereErreur = messageClair(r.error) + ' (en enregistrant le relevé de stock)';
        return false;
      }
      return true;
    }, function () { return false; });
  }

  /* --- les réglages partagés --- */

  /* Ce qui vit dans `reglages`, et sous quelle clé. Une seule liste, pour que
     l'aller et le retour ne puissent pas diverger. */
  var CLES_REGLAGES = ['services', 'articles', 'seuils', 'payouts', 'autoMsgs', 'beds24', 'extraFeeds',
    /* Session 23 (D-126) : les articles qu'un logement n'a pas. Doit voyager,
       sinon le prestataire continue de se les voir demander au relevé —
       septième occurrence de la règle 14 évitée d'avance. */
    'horsStock',
    // Session 23 (D-129) : la vignette de chaque logement, en clair dans le jsonb.
    'photosBien',
    /* Session 26 (D-146) : les séjours iCal que le propriétaire a supprimés à
       la main. Sans cette liste, la relève les recrée à l'heure suivante — et
       elle doit voyager, sinon le doublon supprimé sur l'ordinateur revient
       depuis le téléphone (règle 14). */
    'icalOublies',
    /* Session 27 (D-150) : les réglages de l'envoi d'e-mails — est-ce
       branché, l'adresse qui envoie, faut-il prévenir tout seul.
       ⚠️ AUCUNE CLÉ SECRÈTE ICI : la clé du service d'envoi vit chez Vercel,
       dans une variable d'environnement, et ne descend jamais dans un
       navigateur (règle 2, même esprit que D-60). */
    'mailReglages',
    /* Session 27 (D-151) : les missions déjà annoncées, `{ missionId: { at,
       a: [adresses] } }`. Doit voyager, sinon rouvrir l'application sur un
       autre appareil renverrait une seconde fois le même e-mail à tout le
       monde — septième occurrence de la règle 14 évitée d'avance. */
    'mailsEnvoyes'];

  /* Deux clés ne doivent JAMAIS être remplacées par une liste vide : sans
     prestation ni article, l'application n'a plus rien à afficher et
     `state.services[0]` devient `undefined` — l'écran de création de mission
     tombe. Un vide côté cahier veut dire « pas encore écrit », pas « effacé ».
     Même famille de garde-fou que la règle de fusion de D-75. */
  var REGLAGES_NON_VIDES = { services: true, articles: true };

  /* « Vide » au sens du cahier : une liste sans élément, un objet sans clé,
     un texte sans caractère. Pas `0` ni `false`, qui sont des valeurs. */
  function reglageVide(v) {
    if (Array.isArray(v)) return !v.length;
    if (v && typeof v === 'object') return !Object.keys(v).length;
    return v === '' || v === null || v === undefined;
  }

  function reglagesVersBase(moi) {
    return CLES_REGLAGES.map(function (cle) {
      return { owner_id: moi, cle: cle, valeur: state[cle] === undefined ? null : state[cle] };
    }).filter(function (l) { return l.valeur !== null; });
  }

  /* LE CAHIER NE VIDE JAMAIS LE NAVIGATEUR — Y COMPRIS ICI (session 23, D-124)

     Cette fonction **remplaçait** chaque réglage par la valeur du cahier, sans
     autre protection que les deux clés de `REGLAGES_NON_VIDES`. Or `extraFeeds`
     — les liens iCal — n'en faisait pas partie, et voici ce qui se passait :

       1. le cahier contient `extraFeeds = {}` (écrit avant que Marc ait un lien) ;
       2. Marc colle son lien : `state.extraFeeds` vaut `{ p1: ['https://…'] }`,
          et l'écriture partira dans 800 ms (`pousser()` regroupe les frappes) ;
       3. **dans cette fenêtre**, n'importe quelle relecture — le temps réel, un
          retour au premier plan, le bouton ⟳ — rapporte l'ancien `{}` et
          **écrase le lien tout juste collé** ;
       4. l'écriture suivante renvoie le vide au cahier. Le lien est perdu des
          deux côtés, définitivement, et **rien ne le dit**.

     C'est la règle 3 (D-63, D-75) au mot près, appliquée partout sauf ici. Deux
     réponses, et il faut les deux : on **vide la file d'écriture avant de
     lire** (voir `viderFileEcriture()`), et une valeur vide venue du cahier ne
     remplace **jamais** une valeur locale qui, elle, contient quelque chose. */
  function reglagesDepuisBase(lignes) {
    lignes.forEach(function (l) {
      if (CLES_REGLAGES.indexOf(l.cle) < 0) return;
      var v = l.valeur;
      if (v === null || v === undefined) return;
      if (REGLAGES_NON_VIDES[l.cle] && (!Array.isArray(v) || !v.length)) return;
      if (reglageVide(v) && !reglageVide(state[l.cle])) return;
      state[l.cle] = v;
    });
  }

  /* --- les demandes d'accès du voyageur --- */

  function accesVersBase(d) {
    return {
      id: d.id,
      property_id: d.pid,
      reservation_id: d.resa || null,
      nom: d.nom || '',
      jour: d.date || null,
      at: d.at || '',
      statut: d.statut || 'attente'
    };
  }

  function accesDepuisBase(lignes) {
    var connus = {};
    lignes.forEach(function (l) { connus[l.id] = true; });
    var enAttente = (state.acces || []).filter(function (d) { return !connus[d.id]; });

    state.acces = lignes.map(function (l) {
      return {
        id: l.id, pid: l.property_id, resa: l.reservation_id || '',
        nom: l.nom || 'Voyageur', date: l.jour || '', at: l.at || '',
        statut: l.statut || 'attente'
      };
    }).concat(enAttente);
  }

  /* Un article supprimé laisse une ligne de stock par logement. `pousser()`
     ne sait qu'ajouter et modifier : sans ce `delete`, l'article réapparaît
     dans le relevé à la première relecture (règle 12, D-81). */
  function supprimerStock(article) {
    if (!dispo || !profil) return Promise.resolve(false);
    return client.from('stocks').delete().eq('article', article).then(function (r) {
      if (r && r.error) { derniereErreur = messageClair(r.error); return false; }
      return true;
    }, function () { return false; });
  }

  /* Le voyageur dépose sa demande sans avoir de compte (porte étroite du
     script 09). Il ne peut ni relire, ni valider : c'est le propriétaire qui
     confirme, depuis son écran. */
  function demanderAcces(pid, jour, nom) {
    if (!dispo) return Promise.resolve(null);
    return client.rpc('demander_acces', { bien: pid, jour: jour, p_nom: nom || '' })
      .then(function (r) { return r.error ? null : r.data; }, function () { return null; });
  }

  /* L'heure de fin du ménage qui a préparé CE séjour, pour l'arrivée
     anticipée. Le voyageur n'a pas le droit de lire les missions : ce guichet
     ne lui rend qu'une date et une heure. */
  function menageFini(jeton) {
    if (!dispo || !jeton) return Promise.resolve(null);
    return client.rpc('menage_fini', { jeton: jeton }).then(function (r) {
      if (r.error) return null;
      var l = Array.isArray(r.data) ? r.data[0] : r.data;
      return l && l.a ? { date: l.le, at: l.a } : null;
    }, function () { return null; });
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

  /* SOUS QUEL NOM AFFICHER LE PRENEUR D'UNE MISSION ?

     REPLI SUR LE COMPTE (session 25, D-142). On ne cherchait que dans les
     FICHES, et on rendait `null` dès qu'aucune fiche ne portait cet
     identifiant de compte. Résultat, sur l'ordinateur du propriétaire dont la
     fiche n'était pas (ou plus) reliée au compte : la mission revenait du
     cahier « terminée » et **sans personne**, donc absente du registre de
     paie — « 0 mission effectuée », alors que le ménage avait bien été fait.

     Le compte, lui, est toujours là : `state.comptes` vient d'être relu, et
     `lireTout()` le lit AVANT les missions, exprès. On y retombe donc, avec
     exactement la règle d'`identifiantDeCompte()` — la même règle partout,
     sinon les deux moitiés de l'application ne parlent plus de la même
     personne. Mieux vaut un nom repêché qu'un travail invisible (règle 5). */
  function prenomDuCompte(uid) {
    if (!uid) return null;
    var a = (state.agents || []).filter(function (x) { return x.uid === uid; })[0];
    if (a) return a.id;
    var c = (state.comptes || []).filter(function (x) { return x.uid === uid; })[0];
    return c ? (c.legacy_id || c.nom || c.email || null) : null;
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
    var maj = {
      status: ETATS_MISSION.indexOf(m.status) >= 0 ? m.status : 'dispo',
      report: (state.reports && state.reports[m.id]) || null,
      done_at: m.status === 'termine' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
    /* LE NOM VOYAGE AVEC LA MISSION (session 25, D-142). `prendre_mission`
       n'inscrit que `provider_id`, un identifiant technique : pour le
       traduire en « Sofia », l'ordinateur du propriétaire devait retrouver
       lui-même le compte, et il n'y arrivait pas toujours. Le prestataire
       écrit donc son nom dans la ligne, une fois pour toutes — cette colonne
       est faite pour ça (`taker_legacy`, script 02). */
    if (m.taker) maj.taker_legacy = m.taker;
    return client.from('missions').update(maj).eq('id', m.id).then(function (r) {
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
  /* DEUX DÉFAUTS CORRIGÉS ICI EN SESSION 28 (D-155)

     Symptôme signalé le 22 août : *« le bouton supprimer un prestataire ne
     marche pas, le prestataire disparaît puis réapparaît. »*

     ① **ON NE SUPPRIME PLUS PAR-DESSUS UNE ÉCRITURE EN ATTENTE.** `pousser()`
     attend 800 ms avant d'écrire. Une suppression partait, elle, tout de
     suite : si un envoi contenant encore la ligne était en route, il arrivait
     **après** la suppression et **recréait la ligne**. C'est le corollaire de
     la règle 3 — déjà appliqué aux lectures en D-124 (`viderFileEcriture`) et
     jamais aux suppressions. Et le cas était fréquent plutôt que rare : le
     bouton « Supprimer » vit dans le panneau « ⚙ Réglages et accès », dont
     l'ouverture déclenche justement un enregistrement.

     ② **UNE SUPPRESSION QUI N'EFFACE RIEN NE DOIT PAS PASSER POUR UNE
     RÉUSSITE.** Supabase ne rend **aucune erreur** quand la ligne existe mais
     que les règles de sécurité interdisent de la voir : la suppression porte
     alors sur zéro ligne et répond « c'est fait ». C'est la règle 22 dans sa
     forme la plus traître — *« rien » est la forme que prend « tu n'as pas le
     droit »* — et elle rendait ce bouton silencieusement inopérant. On demande
     donc à Supabase de **rendre ce qu'il a effacé**, et zéro ligne est un
     échec qui se dit (règle 4). */
  function supprimerLigne(table, id) {
    if (!dispo || !profil || !id) return Promise.resolve(true);
    return viderFileEcriture().then(function () {
      return client.from(table).delete().eq('id', id).select('id');
    }).then(function (r) {
      if (r && r.error) { derniereErreur = messageClair(r.error); return false; }
      if (r && Array.isArray(r.data) && r.data.length === 0) {
        derniereErreur = 'le cahier partagé n\u2019a rien trouvé à effacer sous cet identifiant. ' +
          'Soit la ligne n\u2019y était jamais arrivée, soit les règles de sécurité ne la ' +
          'laissent pas voir depuis ce compte.';
        return false;
      }
      return true;
    }).catch(function (e) {
      derniereErreur = messageClair(e);
      return false;
    });
  }

  function supprimerMission(id) { return supprimerLigne('missions', id); }

  /* LE COMPTE RENDU, DIT LIGNE PAR LIGNE (session 29, D-157).

     ⚠️ CETTE COLONNE APPARTIENT AU PRESTATAIRE (règle 16, règle 25) : c'est
     `finish()` qui l'écrit, sur son téléphone, et le propriétaire n'a rien à y
     mettre. Une seule exception, et elle est étroite : quand le propriétaire
     **clôt lui-même** une mission que personne n'a faite dans l'application —
     le ménage qu'il a fait de ses mains, celui que la prestataire a oublié de
     clore —, il faut bien que la trace de ce geste voyage, sinon la mission
     s'affiche « terminée sans détail » sur ses autres appareils, ce qui est
     faux (règle 5).

     L'appelant ne s'en sert donc QUE lorsqu'aucun compte rendu n'existe. Et si
     la prestataire termine sa mission plus tard, son `majMission()` remplace
     cette trace par le vrai compte rendu : c'est le bon sens de lecture, et
     ça se répare tout seul. */
  function majCompteRendu(id, rapport) {
    if (!dispo || !profil || !id) return Promise.resolve(true);
    return client.from('missions')
      .update({ report: rapport || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(function (r) {
        if (r && r.error) { derniereErreur = messageClair(r.error); return false; }
        return true;
      })
      .catch(function (e) { derniereErreur = messageClair(e); return false; });
  }

  /* LE STATUT D'UNE MISSION, DIT LIGNE PAR LIGNE (session 28, D-154).
     Le remède de la règle 16 : sortir la colonne de l'envoi groupé et la
     confier à une mise à jour ciblée, qui n'écrit que ce qu'on veut vraiment
     écrire, sur la seule ligne concernée. Appelée aux quatre endroits où le
     propriétaire décide légitimement d'un statut : annuler une mission,
     demander une reprise, attribuer à quelqu'un, retirer de quelqu'un. */
  function majStatut(id, statut) {
    if (!dispo || !profil || !id) return Promise.resolve(true);
    if (ETATS_MISSION.indexOf(statut) < 0) return Promise.resolve(true);
    return client.from('missions')
      .update({ status: statut, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(function (r) {
        if (r && r.error) { derniereErreur = messageClair(r.error); return false; }
        return true;
      })
      .catch(function (e) { derniereErreur = messageClair(e); return false; });
  }

  /* DÉTACHER UNE MISSION DE SON PRENEUR (session 25, D-142).
     Depuis que le propriétaire n'écrase plus les colonnes du prestataire, un
     retrait doit être DIT au cahier — sinon il revient à la première
     relecture. C'est la règle 12, appliquée à des colonnes plutôt qu'à une
     ligne : ce qu'on efface, il faut l'effacer là-bas aussi. */
  function detacherMission(id) {
    if (!dispo || !profil || !id) return Promise.resolve(true);
    return client.from('missions')
      .update({ provider_id: null, taker_legacy: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(function (r) {
        if (r && r.error) { derniereErreur = messageClair(r.error); return false; }
        return true;
      })
      .catch(function (e) { derniereErreur = messageClair(e); return false; });
  }
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

  /* RETROUVER SON SÉJOUR PAR SES DATES (session 24, D-139)

     `chercher_sejour` exige un nom d'au moins 3 caractères. Or depuis l'iCal
     tous les séjours s'appellent « Voyageur » : plus personne ne pouvait
     entrer. On cherche donc par arrivée + départ, avec le logement quand le
     lien le désigne (D-132).

     Script `supabase/10-recherche-par-dates.sql`. Tant qu'il n'est pas collé,
     l'appel échoue avec « Could not find the function » — `messageClair()` le
     traduit en nommant le fichier, et l'appelant se rabat sur la recherche par
     nom (règle 19 : une table ou une fonction facultative ne casse rien, et
     son absence se DIT). */
  function chercherSejourDates(jour, fin, bien) {
    if (!dispo) return Promise.resolve([]);
    return client.rpc('chercher_sejour_dates', {
      jour: jour, fin: fin || null, p_bien: bien || null
    }).then(function (r) {
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
     pourtant confié un bien, et il ne voit toujours rien ».

     UNE ÉCRITURE QUI NE TOUCHE AUCUNE LIGNE N'EST PAS UNE RÉUSSITE
     (session 19). `update(...).eq('id', uid)` ne rend AUCUNE erreur quand
     l'identifiant ne désigne rien — compte détaché entre-temps, fiche qui
     garde le souvenir d'un ancien compte. On annonçait alors « ✅ Droits
     renvoyés » sans que rien n'ait bougé, et le prestataire continuait de ne
     rien voir. On redemande donc la ligne écrite (`select`) et on vérifie
     qu'elle existe. Même famille de faute que la règle 4 du §6. */
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
        }).eq('id', a.uid).select('id').then(function (r) {
          if (r && r.error) {
            derniereErreur = messageClair(r.error) + ' (en ouvrant les droits de ' + (a.name || a.id) + ')';
            return false;
          }
          if (!r || !r.data || !r.data.length) {
            derniereErreur = 'Le compte de ' + (a.name || a.id) + ' n\'a pas été retrouvé dans le ' +
              'cahier partagé : ses droits n\'ont donc pas bougé. Détache le compte de sa fiche, ' +
              'puis relie-le à nouveau.';
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

  /* UNE TABLE QUI N'EXISTE PAS ENCORE NE DOIT RIEN CASSER (session 19).

     `avis` n'apparaît qu'avec le script 08, et les quatre tables du lot 4
     qu'avec le script 09. Tant qu'ils ne sont pas collés, les demander rend
     une erreur — et si cette erreur remontait avec les autres, l'application
     entière cesserait de lire le cahier : plus de logements, plus de missions,
     plus rien. **Une table facultative absente casserait donc tout le reste.**
     Pour celles-là on préfère revenir les mains vides, et `null` (« la table
     n'existe pas ») n'est surtout pas confondu avec `[]` (« il n'y a rien
     dedans ») : la règle D-74 s'applique aussi aux tables.

     Les scripts manquants se disent ailleurs, calmement, par `manquantes()`. */
  var tablesAbsentes = {};

  /* « La table n'existe pas » et « tu n'as pas le droit » sont deux réponses
     très différentes, et les confondre ferait dire au propriétaire de coller
     un script déjà collé. Seul le premier cas compte ici : PostgREST rend
     `PGRST205` (table inconnue du cache de schéma) ou le code Postgres
     `42P01`, avec un message parlant de « schema cache ». */
  function tableAbsente(err) {
    if (!err) return false;
    var code = err.code || '';
    var m = err.message || '';
    return code === 'PGRST205' || code === '42P01' ||
      /schema cache|Could not find the table|does not exist/i.test(m);
  }

  function lireFacultative(table) {
    return client.from(table).select('*').then(function (r) {
      if (r.error && tableAbsente(r.error)) tablesAbsentes[table] = true;
      else if (!r.error) tablesAbsentes[table] = false;
      return r.error ? null : (r.data || []);
    }, function () { return null; });
  }

  /* Les scripts qui manquent, nommés — pour que l'écran puisse le dire au
     lieu d'afficher un vide qui ressemble à une panne. */
  function manquantes() {
    var out = [];
    if (tablesAbsentes.avis) out.push('08-avis.sql');
    if (tablesAbsentes.prestataires || tablesAbsentes.stocks ||
        tablesAbsentes.reglages || tablesAbsentes.acces) out.push('09-lot4.sql');
    return out;
  }

  /* ON NE LIT JAMAIS PAR-DESSUS UNE ÉCRITURE QUI N'EST PAS ENCORE PARTIE
     (session 23, D-124). `pousser()` attend 800 ms avant d'écrire, pour ne pas
     parler à la base à chaque touche. Pendant ces 800 ms, une relecture
     rapportait l'**ancienne** valeur et effaçait la nouvelle avant qu'elle
     n'ait bougé. On solde donc la file d'abord. */
  function viderFileEcriture() {
    if (!enAttente) return Promise.resolve();
    clearTimeout(enAttente);
    enAttente = null;
    return pousserMaintenant().then(function () { return null; }, function () { return null; });
  }

  function charger() {
    if (!dispo || !profil) return Promise.resolve(false);
    return viderFileEcriture().then(lireTout);
  }

  function lireTout() {
    return Promise.all([
      client.from('properties').select('*').order('id'),
      client.from('property_secrets').select('*'),
      client.from('reservations').select('*').order('start_date'),
      client.from('missions').select('*').order('date'),
      client.from('profiles').select('*'),
      lireFacultative('avis'),
      lireFacultative('prestataires'),
      lireFacultative('stocks'),
      lireFacultative('reglages'),
      lireFacultative('acces')
    ]).then(function (r) {
      var erreur = r.slice(0, 5).filter(function (x) { return x.error; })[0];
      if (erreur) throw erreur.error;

      /* AVANT LES COMPTES : les FICHES (lot 4, session 19).
         `comptesDepuisBase()` rapproche chaque compte de sa fiche par
         `legacy_id` — encore faut-il que les fiches soient là. Sur un
         ordinateur neuf, elles n'existaient nulle part : le propriétaire
         retrouvait les prestataires de la démonstration. */
      if (r[6]) prestatairesDepuisBase(r[6]);

      /* Les réglages partagés : prestations, articles, seuils, et le reste.
         Avant `upgrade()`, qui complète les stocks et les tarifs à partir de
         la liste des articles et des prestations — s'il les complétait
         d'après la liste de démonstration, il figerait celle-ci. */
      if (r[8]) reglagesDepuisBase(r[8]);

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

      /* Les avis suivent la même règle de sûreté — à une nuance près, qui
         compte : `null` veut dire « la table n'existe pas encore », et non
         « il n'y a aucun avis ». On ne touche alors à rien. */
      var avis = r[5];
      if (avis && (avis.length || !(state.avis || []).length)) avisDepuisBase(avis);

      // Les stocks et les demandes d'accès ont besoin des logements : ils
      // viennent donc après `biensDepuisBase()`.
      if (r[7]) stocksDepuisBase(r[7]);
      if (r[9] && (r[9].length || !(state.acces || []).length)) accesDepuisBase(r[9]);

      if (typeof upgrade === 'function') upgrade();
      premiereLectureFaite = true;

      /* Ce que le cahier n'avait pas, on le lui rend — mais SEULEMENT si on
         est le propriétaire (précisé en session 19). Sur le téléphone d'un
         prestataire, cet envoi partait aussi et se faisait refuser ligne à
         ligne par les règles de lecture : du bruit, et de fausses conclusions
         sur les scripts manquants. Un prestataire n'écrit que ses missions et
         ses relevés, par des chemins qui lui sont propres. */
      if (profil.role === 'owner' &&
          ((!resas.length && localResas) || (!missions.length && (state.missions || []).length))) {
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
  /* POURQUOI RIEN NE PART — DIT, AU LIEU D'ÊTRE DEVINÉ (session 23, D-122)

     `pousser()` abandonnait en silence dans trois cas. Aucun n'était visible
     de nulle part, et tous les trois donnent **exactement le même symptôme** :
     « je fais des modifications, je me reconnecte, il n'y a plus rien ». Le
     travail reste dans le navigateur, la copie de secours le rend au
     rechargement — et le jour où on ouvre l'application ailleurs, ou après un
     vidage du navigateur, tout a disparu.

     · le compte connecté n'a pas `role = 'owner'` dans `profiles` ;
     · la **première lecture** du cahier n'a jamais abouti — garde-fou voulu
       (« on n'écrit jamais avant d'avoir lu »), mais qui, silencieux, gèle
       toutes les écritures de la session ;
     · la connexion n'est pas disponible du tout.

     On rend donc la raison, et l'écran du propriétaire l'affiche en rouge.
     C'est la règle 4, appliquée à l'endroit où elle manquait le plus. */
  function etatEcriture() {
    if (!dispo) {
      return { ok: false, code: 'hors-ligne',
        raison: 'La connexion au cahier partagé n’est pas disponible' + (derniereErreur ? ' : ' + derniereErreur : '.'),
        geste: 'Vérifie ta connexion internet, puis recharge la page.' };
    }
    if (!profil) {
      return { ok: false, code: 'pas-de-compte',
        raison: 'Aucun compte n’est reconnu par le cahier partagé.',
        geste: 'Déconnecte-toi et reconnecte-toi.' };
    }
    if (profil.role !== 'owner') {
      return { ok: false, code: 'role',
        raison: 'Le compte connecté n’est pas un compte propriétaire (son rôle est « ' +
          (profil.role || 'vide') + '  »). Seul un compte propriétaire a le droit d’écrire les ' +
          'logements, les séjours et les réglages.',
        geste: 'Recopie-nous cette phrase : le rôle du compte est à corriger dans Supabase.' };
    }
    if (!premiereLectureFaite) {
      return { ok: false, code: 'lecture',
        raison: 'La première lecture du cahier partagé n’a pas abouti. Par sécurité, rien n’est ' +
          'écrit avant d’avoir lu — sinon une relecture ratée effacerait tout.' +
          (derniereErreur ? ' Raison donnée : « ' + derniereErreur + ' ».' : ''),
        geste: 'Recharge la page. Si le bandeau revient, recopie-nous la raison affichée.' };
    }
    return { ok: true };
  }

  function pousser() {
    var etat = etatEcriture();
    if (!etat.ok) return;
    clearTimeout(enAttente);
    enAttente = setTimeout(function () {
      enAttente = null;
      pousserMaintenant();
    }, 800);
  }

  /* La seconde passe des réservations (D-113) : une mise à jour par ligne,
     avec ses seules colonnes. Groupées, elles se contamineraient à nouveau —
     c'est tout le défaut qu'on corrige. Elles sont peu nombreuses : seules
     les réservations dont un voyageur a rempli le livret en portent.
     On rend le même objet `{ error }` qu'un upsert, pour que la chaîne
     d'étapes n'ait pas à savoir laquelle des deux formes elle appelle. */
  function majUneParUne(table) {
    return function (lignes) {
      return lignes.reduce(function (chaine, v) {
        return chaine.then(function (bilan) {
          if (bilan && bilan.error) return bilan;             // on s'arrête au premier refus
          return client.from(table).update(v.maj).eq('id', v.id)
            .then(function (r) { return (r && r.error) ? r : bilan; });
        });
      }, Promise.resolve({}));
    };
  }

  var majVoyageurs = majUneParUne('reservations');

  /* Le nom du preneur et son compte rendu (session 25, D-142). Même forme, et
     pour exactement la même raison : n'écrire que les colonnes qu'on connaît. */
  var majPreneurs = majUneParUne('missions');

  /* LE FILET : DEUX FOIS LA MÊME LIGNE DANS UN LOT (session 20, D-116)

     PostgreSQL refuse d'écrire deux fois la même ligne dans une seule
     instruction : « ON CONFLICT DO UPDATE command cannot affect row a second
     time ». Il ne refuse pas la ligne fautive — il refuse **tout le lot**.
     Et comme l'étape des missions n'est pas facultative, plus rien ne part.
     C'est la même forme d'échec que D-113, par une autre porte.

     Ce n'est PAS le correctif du défaut trouvé aujourd'hui : celui-là est
     dans `slugMission()` et dans la réparation d'`upgrade()`. C'est un filet,
     posé une fois pour **toutes** les tables, parce que la question « et si
     deux lignes portaient la même clé ? » se reposera à chaque nouvelle
     table, et que la réponse ne doit plus jamais être « tout s'arrête ».

     On garde la **dernière** occurrence : c'est ce que ferait la base si elle
     acceptait, chaque écriture remplaçant la précédente. */
  function sansDoublons(lignes, cle) {
    var parCle = {}, ordre = [];
    lignes.forEach(function (l) {
      // Séparateur impossible dans une valeur : sans lui, ('ab','c') et
      // ('a','bc') donneraient la même clé, et on effacerait une vraie ligne.
      var k = cle.map(function (c) { return String(l[c]); }).join('\u0000');
      if (!(k in parCle)) ordre.push(k);
      parCle[k] = l;
    });
    return ordre.map(function (k) { return parCle[k]; });
  }

  function pousserMaintenant() {
    if (!dispo || !profil) return Promise.resolve();
    var moi = profil.id;
    var biens = (state.props || []).map(function (p) { return bienVersBase(p, moi); });
    var secrets = (state.props || []).map(secretsVersBase);
    var resas = [], voyageurs = [];
    Object.keys(state.resas || {}).forEach(function (pid) {
      (state.resas[pid] || []).forEach(function (r) {
        resas.push(resaVersBase(r, pid));
        var v = resaVoyageur(r, pid);
        if (v) voyageurs.push(v);
      });
    });
    var missionsVivantes = (state.missions || [])
      .filter(function (m) { return m.id && m.date && bienExiste(m.prop); });
    var missions = missionsVivantes.map(missionVersBase);
    var preneurs = missionsVivantes.map(missionPreneur).filter(Boolean);
    var avisVivants = (state.avis || [])
      .filter(function (v) { return v.id && v.stars && bienExiste(v.pid); });
    var avis = avisVivants.map(avisVersBase);
    var avisAgents = avisVivants.map(avisPresta).filter(Boolean);
    var fiches = (state.agents || [])
      .filter(function (a) { return a.id && !a.gone; })
      .map(function (a) { return prestataireVersBase(a, moi); });
    var stocks = stocksVersBase();
    var reglages = reglagesVersBase(moi);
    var acces = (state.acces || [])
      .filter(function (d) { return d.id && bienExiste(d.pid); })
      .map(accesVersBase);

    // Chaque étape est vérifiée : Supabase ne « rejette » pas une écriture
    // refusée, il rend un objet { error }. Sans ce contrôle, une erreur sur
    // les biens passerait inaperçue et on croirait le déménagement réussi.
    // L'ordre compte : les réservations et les missions renvoient aux biens.
    //
    // `facultative` : une étape dont l'échec ne doit pas emporter le reste.
    // Les avis en sont une tant que le script 08 n'est pas collé — il serait
    // absurde qu'une table absente empêche les missions de partir. C'est
    // exactement la faute évitée : un seul refus faisait tomber tout un lot.
    var etapes = [
      { nom: 'les logements', table: 'properties', lignes: biens, cle: ['id'] },
      { nom: 'les codes d\'accès', table: 'property_secrets', lignes: secrets, cle: ['property_id'] },
      { nom: 'les réservations', table: 'reservations', lignes: resas, cle: ['id'] },
      { nom: 'les missions', table: 'missions', lignes: missions, cle: ['id'] },
      /* QUI A PRIS QUOI (session 25, D-142). Après les missions — la ligne doit
         exister avant qu'on lui pose un preneur — et une par une, pour n'écrire
         que ce qu'on sait. Facultative : si elle échoue, les missions sont déjà
         parties, et son refus est dit au lieu d'être avalé (règle 4). */
      { nom: 'qui a pris les missions', table: 'missions', lignes: preneurs,
        cle: ['id'], envoi: majPreneurs, facultative: true },
      /* La seconde passe des réservations (D-113). Placée APRÈS les missions :
         chaque ligne y est mise à jour séparément, avec ses seules colonnes,
         et si l'une échoue on veut que les missions soient déjà parties. */
      { nom: 'les coordonnées des voyageurs', table: 'reservations',
        lignes: voyageurs, envoi: majVoyageurs },
      { nom: 'les avis des voyageurs', table: 'avis', lignes: avis, facultative: true, cle: ['id'] },
      { nom: 'qui a fait le ménage noté', table: 'avis', lignes: avisAgents,
        cle: ['id'], envoi: majUneParUne('avis'), facultative: true },
      // Le lot 4 (script 09). Facultatives pour la même raison que les avis :
      // tant que le script n'est pas collé, rien d'autre ne doit en souffrir.
      { nom: 'les fiches des prestataires', table: 'prestataires', lignes: fiches, facultative: true, cle: ['id'] },
      { nom: 'les stocks', table: 'stocks', lignes: stocks, facultative: true, cle: ['property_id', 'article'] },
      { nom: 'les réglages', table: 'reglages', lignes: reglages, facultative: true, cle: ['owner_id', 'cle'] },
      { nom: 'les demandes d\'accès', table: 'acces', lignes: acces, facultative: true, cle: ['id'] }
    ];

    /* UNE ÉTAPE FACULTATIVE QUI ÉCHOUE DOIT PARLER (session 23, D-123)

       `facultative` voulait dire « son échec n'emporte pas le reste » — ce qui
       est juste, et c'est ce qui empêche une table absente de bloquer les
       missions (D-97). Mais l'échec était **avalé en entier** : seul le cas
       « la table n'existe pas » était retenu, et **toute autre raison ne
       laissait aucune trace nulle part**. Or `reglages` est facultative, et
       c'est elle qui porte les **liens iCal**, les articles, les seuils, les
       versements. Un refus de sa part donnait donc : le lien s'affiche, il est
       dans le navigateur, il n'est jamais parti, et **rien ne le dit**.

       Sixième fois que le même silence coûte une session (D-95, D-102, D-113).
       On garde le « ça n'emporte pas le reste », on supprime le « en
       silence » : chaque refus est collecté et affiché, en nommant l'étape. */
    var soucis = [];

    return etapes.reduce(function (chaine, e) {
      return chaine.then(function () {
        var lignes = e.cle ? sansDoublons(e.lignes, e.cle) : e.lignes;
        if (!lignes.length) return null;
        var envoi = e.envoi ? e.envoi(lignes) : client.from(e.table).upsert(lignes);
        return envoi.then(function (r) {
          if (r && r.error) {
            if (e.facultative) {
              if (tableAbsente(r.error)) tablesAbsentes[e.table] = true;
              else soucis.push({ nom: e.nom, table: e.table, message: messageClair(r.error) });
              return null;
            }
            var err = new Error(messageClair(r.error) + ' (en écrivant ' + e.nom + ')');
            err.detail = r.error;
            throw err;
          }
          return r;
        });
      });
    }, Promise.resolve()).then(function () {
      return { ok: true, biens: biens.length, resas: resas.length, missions: missions.length,
        soucis: soucis };
    }).catch(function (e) {
      return { ok: false, erreur: e.message || messageClair(e), soucis: soucis };
    }).then(function (bilan) {
      derniereErreur = bilan.ok ? null : bilan.erreur;
      /* CE QUI S'EST RÉELLEMENT PASSÉ À LA DERNIÈRE ÉCRITURE (session 19).
         Jusqu'ici, personne ne le lisait : `pousser()` part sans qu'on
         l'attende, et l'échec ne s'affichait NULLE PART. Un refus du cahier
         — une seule ligne mal formée suffit à faire tomber tout un lot — se
         traduisait par « j'ai créé mes séjours, la prestataire ne voit rien »,
         sans le moindre indice. On retient donc le résultat, l'écran du
         propriétaire l'affiche (règle 4 du §6). */
      dernierEnvoi = {
        ok: bilan.ok, erreur: bilan.erreur || null,
        quand: Date.now(),
        missions: bilan.missions || 0, resas: bilan.resas || 0, biens: bilan.biens || 0,
        // Les refus des étapes facultatives : le lot est parti, mais pas tout
        // (session 23). Sans cette liste, ils n'existaient pour personne.
        soucis: bilan.soucis || []
      };
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

  /* CE QU'IL FAUT ÉCOUTER, ET POURQUOI (corrigé en session 19)

     Le canal n'écoutait que `missions` et `reservations`. Or le temps réel
     n'apporte QUE les lignes que le compte a déjà le droit de voir. Quand le
     propriétaire confie un nouveau logement à une prestataire, les missions de
     ce logement lui étaient invisibles **avant** l'attribution : aucune ne
     changeait à ses yeux, donc aucun événement n'arrivait, donc son téléphone
     ne relisait jamais rien. Sur son écran : « aucune mission », alors que
     tout était coché de l'autre côté. Deuxième variante de la règle 14.

     On ajoute donc `profiles` — la table qui porte justement les droits — et
     `properties`, pour qu'un logement tout neuf apparaisse sans recharger. */
  function ecouter(quandCaChange) {
    if (!dispo || !profil) return;
    surveillerRetour(quandCaChange);
    if (canal) return;
    canal = client.channel('maison-warme')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, quandCaChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, quandCaChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, quandCaChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, quandCaChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avis' }, quandCaChange)
      // Le lot 4 : un relevé de stock, une fiche ou un réglage modifié depuis
      // un autre appareil doit se voir sans rien faire (session 19).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stocks' }, quandCaChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestataires' }, quandCaChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reglages' }, quandCaChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'acces' }, quandCaChange)
      .subscribe();
  }

  /* LE FILET DE SÉCURITÉ (session 19)

     Le temps réel ne suffit pas et ne suffira jamais : un téléphone posé sur
     une table coupe ses connexions, un réseau de chantier laisse tomber le
     canal sans prévenir. On relit donc aussi le cahier **chaque fois que
     l'application revient au premier plan** — c'est le geste naturel de
     quelqu'un qui reprend son téléphone en main, et c'est le moment exact où
     il s'attend à voir du neuf.

     `relireProfil()` d'abord : les droits vivent dans le profil, et c'est
     précisément ce qui a changé quand le propriétaire coche un logement. */
  function rafraichir() {
    if (!dispo) return Promise.resolve(false);
    return relireProfil()
      .then(function (p) { return p ? charger() : false; })
      .catch(function () { return false; });
  }

  var surveille = false;

  function surveillerRetour(quandCaChange) {
    if (typeof document === 'undefined' || surveille) return;
    surveille = true;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      rafraichir().then(function (ok) { if (ok && quandCaChange) quandCaChange(); });
    });
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

  /* ----------------------------------------------------------------------
     7. LE FACTEUR — prévenir les prestataires par e-mail (session 27, D-150)

     Le courrier ne part pas d'ici : un navigateur n'a pas le droit d'envoyer
     un e-mail, et la clé qu'il faudrait pour cela n'a rien à faire dans une
     page web. On se contente donc de **frapper à la porte de `/api/mail`**,
     le petit programme qui tourne chez Vercel, en lui tendant le jeton de la
     session en cours — c'est lui qui vérifie que le demandeur est bien le
     propriétaire, et lui seul qui connaît la clé.

     ⚠️ CETTE FONCTION NE PASSE PAS PAR `pousser()`. Envoyer un e-mail n'est
     pas une écriture dans le cahier partagé : rien ne s'y range, rien n'est
     regroupé, rien n'est réessayé. On veut la réponse tout de suite, et on
     veut pouvoir la DIRE (règle 4) — y compris « la clé n'est pas encore
     posée », qui est le cas de figure normal tant que Marc n'a pas fait
     l'étape du §34.
     ---------------------------------------------------------------------- */

  function jetonDeSession() {
    if (!dispo) return Promise.resolve('');
    return client.auth.getSession()
      .then(function (r) { return (r && r.data && r.data.session && r.data.session.access_token) || ''; })
      .catch(function () { return ''; });
  }

  /* `envois` : [{ email, nom, sujet, texte, html }].
     `expediteur` : { nom, email, repondreA }.
     Rend `{ fournisseur, expediteur, envoyes: [...], echecs: [{ email, nom,
     raison }] }`, ou lève une erreur dont le message est **déjà en français
     et déjà compréhensible** — c'est `/api/mail` qui le rédige, pour que la
     traduction des refus du service d'envoi vive au même endroit. */
  function envoyerMail(expediteur, envois) {
    if (!dispo) return Promise.reject(new Error(derniereErreur || 'Connexion indisponible.'));
    if (!profil) return Promise.reject(new Error('Il faut être connecté pour envoyer des e-mails.'));
    if (profil.role !== 'owner') {
      return Promise.reject(new Error('Seul le compte du propriétaire peut prévenir les prestataires.'));
    }
    if (!Array.isArray(envois) || !envois.length) {
      return Promise.reject(new Error('Il n’y a personne à prévenir.'));
    }

    return jetonDeSession().then(function (jeton) {
      if (!jeton) throw new Error('Ta connexion a expiré. Recharge la page et reconnecte-toi.');
      return fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton: jeton, expediteur: expediteur || {}, envois: envois })
      });
    }).then(function (r) {
      return r.text().then(function (corps) {
        var j = null;
        try { j = JSON.parse(corps); } catch (e) { j = null; }
        if (!r.ok) {
          /* UNE PAGE D'ERREUR N'EST PAS UNE RÉPONSE. Si `/api/mail` n'existe
             pas encore en ligne — publication pas faite —, Vercel rend du
             HTML avec un code 404, et `j` est nul. On le dit franchement au
             lieu d'afficher « undefined » (règle 5). */
          var e2 = new Error(
            (j && j.erreur) ||
            (r.status === 404
              ? 'Le facteur n’est pas encore en ligne : la publication (git push) n’a pas été faite ' +
                'depuis l’ajout de cette fonctionnalité.'
              : 'L’envoi a échoué (code ' + r.status + ').')
          );
          e2.code = (j && j.code) || '';
          e2.statut = r.status;
          throw e2;
        }
        if (!j) throw new Error('La réponse du facteur est illisible.');
        return j;
      });
    });
  }

  /* ---------------------------------------------------------------------- */

  return {
    demarrer: demarrer,
    estDispo: function () { return dispo; },
    profil: function () { return profil; },
    erreur: function () { return derniereErreur; },
    /* Le bilan de la dernière écriture : l'écran du propriétaire s'en sert
       pour dire « ce que tu vois n'est pas encore parti » (session 19). */
    dernierEnvoi: function () { return dernierEnvoi; },
    /* Pourquoi une écriture ne part même pas (session 23, D-122). Trois cas,
       tous silencieux jusqu'ici, tous donnant le même symptôme : « je modifie,
       je me reconnecte, il n'y a plus rien ». */
    etatEcriture: etatEcriture,
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
    /* Exposée pour la même raison qu'`appliquerComptes` : c'est un point où une
       erreur fait **disparaître du travail** — les liens iCal y sont passés
       (D-124) — et il faut pouvoir l'éprouver sans compte Supabase. */
    appliquerReglages: reglagesDepuisBase,
    identifiantDeCompte: identifiantDeCompte,
    majComptesLies: majComptesLies,
    prendreMission: prendreMission,
    majMission: majMission,
    detacherMission: detacherMission,
    supprimerMission: supprimerMission,
    majStatut: majStatut,
    majCompteRendu: majCompteRendu,
    supprimerResa: supprimerResa,
    supprimerBien: supprimerBien,
    estPrestataireRelie: estPrestataireRelie,
    envoyerPhoto: envoyerPhoto,
    supprimerPhoto: supprimerPhoto,
    urlsPhotos: urlsPhotos,
    // Le livret du voyageur (lot 3) — appelable sans compte.
    sejourParLien: sejourParLien,
    chercherSejour: chercherSejour,
    chercherSejourDates: chercherSejourDates,
    enregistrerVoyageur: enregistrerVoyageur,
    signalerDepart: signalerDepart,
    pousser: pousser,
    pousserMaintenant: pousserMaintenant,
    /* Relire le cahier de bout en bout, droits compris. C'est ce que fait le
       bouton « Actualiser » du prestataire, et ce que l'application fait
       toute seule quand elle revient au premier plan (session 19). */
    rafraichir: rafraichir,
    // Les avis (script 08, session 19).
    deposerAvis: deposerAvis,
    /* Vrai tant que le script 08 n'a pas été collé : l'écran le DIT plutôt
       que d'afficher « pas encore de note » et de laisser croire à un oubli
       des voyageurs (règle 5 du §6). */
    avisIndisponibles: function () { return !!tablesAbsentes.avis; },
    /* Les scripts SQL qui manquent, nommés. Un écran vide doit pouvoir dire
       pourquoi il est vide (session 19). */
    scriptsManquants: manquantes,
    // Le lot 4 (script 09, session 19).
    enregistrerStock: enregistrerStock,
    supprimerStock: supprimerStock,
    demanderAcces: demanderAcces,
    menageFini: menageFini,
    supprimerFiche: function (id) { return supprimerLigne('prestataires', id); },
    ecouter: ecouter,
    taire: taire,
    demenager: demenager,
    envoyerMail: envoyerMail
  };

})();
