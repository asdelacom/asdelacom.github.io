/**
 * Les filtres sans rechargement — `/voitures` et `/activites` (lot du
 * 2026-10-01). Vanilla, aucune dépendance, aucune compilation.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LE PRINCIPE, VALIDÉ PAR LE CLIENT : LES VRAIES PAGES RESTENT.
 *
 * Chaque gamme, chaque marque, chaque univers et chaque catégorie est une page
 * complète, rendue par le serveur, avec son adresse, son titre et sa
 * description — c'est ce que Google lit, et rien n'y change. Ce script ne fait
 * qu'une chose **pour le visiteur** : au clic sur un filtre, il va chercher
 * cette même page en arrière-plan et en pose le contenu à la place de l'ancien,
 * au lieu de laisser le navigateur recharger.
 *
 * **Il n'existe donc pas de second rendu.** Aucun point d'entrée JSON, aucun
 * gabarit recopié en JavaScript : le HTML posé est celui que le serveur aurait
 * servi au chargement. Deux rendus d'une même liste finiraient par diverger —
 * c'est PO-12.
 *
 * **SANS JAVASCRIPT, OU SI QUOI QUE CE SOIT ÉCHOUE, LE LIEN FAIT SON MÉTIER.**
 * Réseau coupé, réponse autre que 200, page reçue qui n'est pas une liste de la
 * même section, navigateur sans `fetch` ni `history.pushState` : dans tous ces
 * cas le script s'efface et le navigateur charge l'adresse normalement. Un
 * filtre ne peut pas « ne rien faire ».
 * ───────────────────────────────────────────────────────────────────────────
 *
 * CE QUI EST REMPLACÉ : tout le contenu de `<main data-surplace>` — bandeau,
 * filtres, cartes. CE QUI NE BOUGE PAS : l'en-tête, le pied de page, les
 * scripts. Le `<head>` suit : titre, description, canonique, balises de
 * partage, `robots` — un lien copié après un filtre doit décrire la page
 * affichée, pas la précédente.
 *
 * LES CINQ POINTS TENUS, dans l'ordre où le code les traite (`poser()`) :
 *  1. les cœurs « favori » des nouvelles cartes sont rebranchés
 *     (`D4R.brancherFavoris`, collections.js) ;
 *  2. le focus va au titre, et le nombre de résultats est annoncé dans une
 *     région `aria-live` — sans quoi un lecteur d'écran n'entendrait rien ;
 *  3. si le haut des filtres est passé au-dessus de la fenêtre, la page y
 *     revient — c'est le cas au téléphone après un long défilement ;
 *  4. un clic venu du menu referme le menu (`D4R.fermerMenu`, menu.js) ;
 *  5. le fondu est porté par la CSS, en `--dur-fast` puis `--dur-base` : avec
 *     « Réduire les animations », `tokens.css` met ces durées à zéro et il n'y
 *     a plus de fondu du tout. Le script lit la durée, il ne la décide pas.
 *
 * S'y ajoutent deux relances que le remplacement rend nécessaires : le bouton
 * qui déplie la liste des gammes (`D4R.brancherDeplie`) et la coupe des
 * pastilles d'activités (`D4R.reglerPastilles`, PO-211).
 */
(function () {
  'use strict';

  var main = document.querySelector('main[data-surplace]');
  if (!main || !window.fetch || !window.history || !history.pushState || !window.DOMParser) {
    return;
  }

  var D4R = (window.D4R = window.D4R || {});
  var section = main.getAttribute('data-surplace');
  var racine = main.getAttribute('data-surplace-racine') || '';

  /* Les liens de filtre, dans la page. `main[data-surplace]` n'existe que sur
     une page de liste : le fil du bandeau y mène toujours à une autre liste de
     la même section, jamais à une fiche. Les cartes, elles, ne sont pas ici. */
  var LIENS_PAGE = '.filters a, .type-filters a, .liste-filtres a, .bandeau__fil a';
  /* Ce que le `<head>` porte de propre à une page (includes/seo.php). */
  var TETE = 'meta[name="description"], meta[name="robots"], link[rel="canonical"], meta[property^="og:"]';

  /* Au-delà, le navigateur reprend la main — voir `aller()`. */
  var DELAI_GARDE = 4000;

  var enCours = null;   // l'AbortController de la demande en vol
  var affichee = location.pathname + location.search;

  /* La région d'annonce vit HORS de `<main>` : dedans, elle serait remplacée
     avec le reste, et un lecteur d'écran n'annonce que ce qui change dans une
     région qu'il connaît déjà. */
  var annonce = document.createElement('p');
  annonce.className = 'sr-only';
  annonce.setAttribute('role', 'status');
  annonce.setAttribute('aria-live', 'polite');
  document.body.appendChild(annonce);

  function resultats(racineDom) {
    return racineDom.querySelector('[data-surplace-resultats]');
  }

  /* La durée du fondu de sortie, lue sur l'élément : 0 avec « Réduire les
     animations ». On n'attend JAMAIS `transitionend` — à 0 ms il ne vient pas,
     et la page resterait transparente. */
  function dureeSortie(el) {
    var d = parseFloat(getComputedStyle(el).transitionDuration) || 0;
    return /ms/.test(getComputedStyle(el).transitionDuration) ? d : d * 1000;
  }

  function memeSection(url) {
    return url.origin === location.origin
      && racine !== ''
      && (url.pathname === racine || url.pathname.indexOf(racine + '/') === 0);
  }

  function poser(doc, adresse, venuDuMenu) {
    var neuf = doc.querySelector('main[data-surplace="' + section + '"]');
    if (!neuf) {
      return false;
    }

    /* Le `<head>`. */
    document.title = doc.title;
    Array.prototype.forEach.call(document.head.querySelectorAll(TETE), function (el) {
      el.parentNode.removeChild(el);
    });
    Array.prototype.forEach.call(doc.head.querySelectorAll(TETE), function (el) {
      document.head.appendChild(document.importNode(el, true));
    });

    /* Le contenu. Les cartes arrivent transparentes, sans transition, puis la
       classe tombe au rendu suivant : c'est le fondu d'entrée. */
    var zone = resultats(neuf);
    if (zone) {
      zone.classList.add('is-entrant');
    }
    main.innerHTML = neuf.innerHTML;
    affichee = adresse;

    /* 1. Les branchements que le chargement faisait, et que les nouveaux
          éléments n'ont pas reçus. Chacun est gardé : un fichier absent ou
          périmé ne doit pas empêcher la page de s'afficher. */
    if (D4R.brancherFavoris) { D4R.brancherFavoris(); }
    if (D4R.brancherDeplie) { D4R.brancherDeplie(); }
    if (D4R.reglerPastilles) { D4R.reglerPastilles(); }

    /* 4. Le menu, s'il a servi. */
    if (venuDuMenu && D4R.fermerMenu) { D4R.fermerMenu(); }

    /* 2. Le focus au titre — sans faire défiler : c'est le point 3 qui décide
          du défilement, pas le focus. Puis l'annonce. */
    var titre = main.querySelector('h1');
    if (titre) {
      titre.setAttribute('tabindex', '-1');
      titre.focus({ preventScroll: true });
    }
    var n = main.querySelectorAll('[data-surplace-resultats] .card').length;
    var noms = (main.getAttribute('data-surplace-nom') || 'résultat|résultats').split('|');
    annonce.textContent = (titre ? titre.textContent.trim() + ' — ' : '')
      + (n === 0 ? 'aucun ' + noms[0] : n + ' ' + (n > 1 ? noms[1] || noms[0] : noms[0]));

    /* 3. Le haut des filtres est-il passé au-dessus de la fenêtre ? Si oui on y
          revient ; s'il est visible, on ne touche à rien — faire sauter la
          page sous le doigt à chaque pastille serait pire que de recharger.
          `--entete-hauteur` est la bande collante du téléphone (layout.php) ;
          absente à l'ordinateur, elle vaut 0. */
    var haut = main.querySelector('.liste-filtres, .filters') || resultats(main);
    if (haut) {
      var entete = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--entete-hauteur')) || 0;
      var y = haut.getBoundingClientRect().top;
      if (y < entete) {
        window.scrollTo(0, Math.max(0, window.pageYOffset + y - entete - 16));
      }
    }

    /* 3 bis. PO-215 — LES CARTES POSÉES SUR PLACE REÇOIVENT L'APPARITION AU
          DÉFILEMENT. Le script du pied de page ne passe qu'au chargement : les
          cartes arrivées par un filtre restaient hors de son observateur, et
          la même liste s'animait ou non selon qu'on y était venu par une
          adresse ou par une pastille. `D4R.reveler` refait son tri sur le
          contenu neuf — après le point 3, pour mesurer la page là où elle est
          réellement : ce qui est à l'écran n'est pas touché, ce qui est sous
          le bord est mis en attente. Sous garde : sans la fonction (script
          absent, animations réduites, interrupteur à 0), rien ne se cache. */
    if (D4R.reveler) { D4R.reveler(main); }

    /* 5. Le fondu d'entrée : deux rendus plus tard, pour que l'état transparent
          ait été peint une fois.

          **LA MINUTERIE N'EST PAS UNE CEINTURE EN PLUS DES BRETELLES.**
          `requestAnimationFrame` ne s'exécute pas dans un onglet caché : s'il
          portait seul la levée, un changement survenu en arrière-plan (Retour
          pressé puis onglet quitté) laisserait les cartes TRANSPARENTES — une
          page vide, sans erreur. Trouvé en vérifiant ce lot, dans un volet
          caché. La minuterie lève la classe dans tous les cas ; lever deux
          fois est sans effet. */
    var posee = resultats(main);
    if (posee) {
      var lever = function () { posee.classList.remove('is-entrant'); };
      if (window.requestAnimationFrame) {
        requestAnimationFrame(function () { requestAnimationFrame(lever); });
      }
      window.setTimeout(lever, 80);
    }
    return true;
  }

  /**
   * @param {string}  adresse     chemin + requête de la page voulue
   * @param {boolean} historique  true : le clic crée une entrée ; false :
   *                              Retour/Suivant, l'entrée existe déjà
   * @param {boolean} venuDuMenu
   */
  function aller(adresse, historique, venuDuMenu) {
    if (enCours) { enCours.abort(); }
    /* Sans `AbortController`, un objet de même forme : il sert aussi de jeton —
       c'est en le comparant à `enCours` qu'une réponse sait si elle est encore
       attendue. */
    var controle = window.AbortController ? new AbortController() : { abort: function () {}, signal: undefined };
    enCours = controle;

    var zone = resultats(main);
    var attente = 0;
    if (zone) {
      zone.classList.add('is-sortant');
      attente = dureeSortie(zone);
    }
    main.setAttribute('aria-busy', 'true');
    var depart = Date.now();

    var repli = function () {
      /* Le navigateur reprend la main : un chargement classique. */
      window.clearTimeout(garde);
      if (historique) { location.href = adresse; } else { location.reload(); }
    };

    /* LE DÉLAI DE GARDE. Pendant la récupération, la zone des cartes est vide
       et rien ne dit qu'un chargement est en cours — là où un chargement
       classique montre l'indicateur du navigateur. Sur un réseau lent, ce vide
       durerait autant que la réponse. Passé `DELAI_GARDE`, on abandonne et on
       laisse le navigateur charger la page : il sait, lui, montrer qu'il
       travaille. */
    var horsDelai = false;
    var garde = window.setTimeout(function () {
      if (enCours !== controle) { return; }
      horsDelai = true;
      controle.abort();
      repli();
    }, DELAI_GARDE);

    fetch(adresse, { credentials: 'same-origin', signal: controle.signal })
      .then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var reste = Math.max(0, attente - (Date.now() - depart));
        window.setTimeout(function () {
          if (enCours !== controle || horsDelai) { return; }   // un clic plus récent, ou le délai de garde
          window.clearTimeout(garde);
          enCours = null;
          main.removeAttribute('aria-busy');
          if (!poser(doc, adresse, venuDuMenu)) {
            repli();
            return;
          }
          if (historique) {
            history.pushState({ surplace: section }, '', adresse);
          }
        }, reste);
      })
      .catch(function (e) {
        /* Annulée : par un clic plus récent, ou par le délai de garde, qui a
           déjà rendu la main. Dans les deux cas il n'y a plus rien à faire ici. */
        if ((e && e.name === 'AbortError') || horsDelai) {
          window.clearTimeout(garde);
          return;
        }
        repli();
      });
  }

  document.addEventListener('click', function (e) {
    /* Tout ce qui n'est pas un clic simple reste au navigateur : nouvel onglet,
       nouvelle fenêtre, téléchargement, bouton du milieu. */
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    var lien = e.target.closest ? e.target.closest('a[href]') : null;
    if (!lien || lien.target === '_blank' || lien.hasAttribute('download')) {
      return;
    }
    var dansPage = main.contains(lien) && lien.matches(LIENS_PAGE);
    var dansMenu = !dansPage && !!lien.closest('.site-header__nav');
    if (!dansPage && !dansMenu) {
      return;
    }
    var url = new URL(lien.href, location.href);
    if (!memeSection(url)) {
      return;
    }
    e.preventDefault();
    var adresse = url.pathname + url.search;
    if (adresse === affichee) {
      /* Déjà là : rien à charger, mais un menu ouvert doit se refermer. */
      if (dansMenu && D4R.fermerMenu) { D4R.fermerMenu(); }
      return;
    }
    aller(adresse, true, dansMenu);
  });

  /* Retour et Suivant. `popstate` se déclenche aussi pour une simple ancre
     (`#…`) : on ne recharge que si le chemin affiché n'est plus celui de la
     barre d'adresse. */
  window.addEventListener('popstate', function () {
    var adresse = location.pathname + location.search;
    if (adresse === affichee) {
      return;
    }
    if (!memeSection(new URL(location.href))) {
      location.reload();
      return;
    }
    aller(adresse, false, false);
  });
})();
