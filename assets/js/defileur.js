/**
 * Le défileur — une piste qui déborde, deux flèches qui la font avancer d'un
 * écran. Vanilla, aucune dépendance, aucune compilation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * **CE FICHIER NE CONTIENT PAS UN COMPOSANT NEUF : IL CONTIENT CELUI DU LOT L3,
 * DÉPLACÉ.** Il vivait dans `accueil.js`, qui n'est chargé que sur la page
 * d'accueil — or la galerie de fiche du lot L4 demande exactement le même
 * geste : une piste qui se balaie au doigt, deux flèches qui la font avancer
 * d'une vue, et rien du tout quand il n'y a pas de quoi déborder.
 *
 * Le recopier dans `galerie.js` aurait été la **troisième** copie du patron —
 * les deux premières sont `.filters` sous 640 px (2026-09-04) et
 * `.defileur__piste` (L3) — et la passation du 2026-09-22 disait « les
 * recopier, pas les redécouvrir ». *On ne recopie plus : les deux pages lisent
 * le même fichier.* Même arbitrage que la coquille de modale de PO-23, et que
 * la source unique des familles de PO-155.
 *
 * **Corps déplacé à l'identique**, sans une addition : `defileur()`,
 * `comportement()` et `surChangementDeMedia()` sont ceux de L3, au caractère
 * près. Seule leur adresse change — elles sont publiées par `window.D4R`,
 * comme la coquille de modale, au lieu d'être privées d'une IIFE.
 *
 * **Ce n'est plus vrai du pas des flèches depuis le lot L5b (2026-09-27)** :
 * `pasUnitaire()` et `vuesParEcran()` remplacent `clientWidth`, pour
 * l'amorce de la galerie (PO-196). Les deux pages ont été rejouées.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * LE DÉFILEMENT RÉDUIT EST RESPECTÉ : `prefers-reduced-motion: reduce` rend
 * les sauts commandés instantanés (`behavior: 'auto'`), flèches comprises. Le
 * geste marche toujours, il ne glisse plus. La préférence est **relue à chaque
 * saut**, pas une fois au chargement : elle se change en cours de visite.
 *
 * SANS CE FICHIER, RIEN N'EST MORT : les pistes sont des conteneurs
 * `overflow-x: auto`, elles se balaient au doigt sans une ligne de script. Les
 * flèches sont rendues `hidden` par PHP et c'est ce fichier qui les montre —
 * un contrôle qui n'agirait sur rien est pire que pas de contrôle.
 */
(function () {
  'use strict';

  var D4R = (window.D4R = window.D4R || {});

  var reduit = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** Le comportement de défilement à demander, selon la préférence du moment. */
  function comportement() {
    return reduit.matches ? 'auto' : 'smooth';
  }

  /** `matchMedia` : la forme moderne, avec le repli des navigateurs anciens. */
  function surChangementDeMedia(mq, fn) {
    if (mq.addEventListener) {
      mq.addEventListener('change', fn);
    } else if (mq.addListener) {
      mq.addListener(fn);
    }
  }

  /**
   * La distance entre le début d'une vue et celui de la suivante : largeur de
   * vue plus écart. **Mesurée, jamais calculée** — la largeur d'une carte vient
   * de `--card-min` et de `flex-grow`, celle d'une photo de l'amorce ; seule la
   * mise en page les connaît.
   *
   * Lot L5b (PO-196). Avant lui, le pas des flèches était `clientWidth`, et
   * c'était exact tant qu'une photo faisait toute la piste. L'amorce de la
   * galerie a rompu cette égalité : `clientWidth` aurait avancé d'une photo
   * PLUS l'amorce, et la piste aurait dérivé de 32 px à chaque appui.
   *
   * Repli sur `clientWidth` sous deux vues : il n'y a alors pas d'écart à
   * mesurer, et rien à faire défiler non plus.
   */
  function pasUnitaire(piste) {
    var a = piste.children[0];
    var b = piste.children[1];
    if (!a || !b) {
      return piste.clientWidth;
    }
    var d = b.getBoundingClientRect().left - a.getBoundingClientRect().left;
    return d > 0 ? d : piste.clientWidth;
  }

  /**
   * Combien de vues ENTIÈRES la piste montre à la fois — au moins une. Une
   * pour la galerie, dont chaque photo laisse une amorce ; un écran de cartes
   * pour les bandes de l'accueil. Le rembourrage de la piste (4 px, 16 au
   * téléphone) n'est pas de la place pour une vue et se retire.
   */
  function vuesParEcran(piste, u) {
    var a = piste.children[0];
    if (!a || u <= 0) {
      return 1;
    }
    var cs = window.getComputedStyle(piste);
    var visible = piste.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var ecart = u - a.getBoundingClientRect().width;
    /* Un pixel de tolérance : les largeurs sont fractionnaires, et une vue qui
       tient à 0,4 px près tient. */
    return Math.max(1, Math.floor((visible + ecart + 1) / u));
  }

  /**
   * Câble une piste et ses deux flèches.
   *
   * @param racine L'élément qui porte `[data-defileur]` et contient
   *        `[data-defileur-piste]` et `[data-defileur-commandes]`.
   */
  function defileur(racine) {
    var piste = racine.querySelector('[data-defileur-piste]');
    var commandes = racine.querySelector('[data-defileur-commandes]');
    if (!piste || !commandes) {
      return;
    }

    var boutons = commandes.querySelectorAll('[data-defileur-sens]');

    /** Reste-t-il quelque chose à faire défiler ?
     *
     *  **LA GARDE SUR `clientWidth` N'EST PAS DE LA PRUDENCE DE PRINCIPE.** Un
     *  conteneur non peint — volet de prévisualisation replié, onglet au
     *  second plan, élément encore masqué — rend `clientWidth` à 0, et
     *  `scrollWidth > 0` serait alors toujours vrai : les flèches
     *  apparaîtraient sur une bande qui tient entièrement dans sa largeur.
     *  Le faux débordement est un défaut connu de ce poste, inscrit dans
     *  `CLAUDE.md`. */
    function deborde() {
      if (piste.clientWidth <= 0) {
        return false;
      }
      /* Deux pixels de tolérance : les largeurs sont fractionnaires, et un
         écart d'arrondi ne doit pas faire paraître deux flèches inutiles. */
      return piste.scrollWidth - piste.clientWidth > 2;
    }

    /** Les flèches se désactivent aux deux bouts. La bande ne boucle pas — à la
     *  différence du bandeau : elle montre un extrait d'une liste qui continue
     *  ailleurs, et le lien « Voir toutes les activités » est la suite. */
    function majEtats() {
      var max = piste.scrollWidth - piste.clientWidth;
      for (var i = 0; i < boutons.length; i++) {
        var sens = parseInt(boutons[i].getAttribute('data-defileur-sens'), 10);
        boutons[i].disabled = sens < 0 ? piste.scrollLeft <= 2 : piste.scrollLeft >= max - 2;
      }
    }

    function majVisibilite() {
      var utile = deborde();
      commandes.hidden = !utile;
      if (utile) {
        majEtats();
      }
    }

    for (var b = 0; b < boutons.length; b++) {
      boutons[b].addEventListener('click', function (e) {
        var sens = parseInt(e.currentTarget.getAttribute('data-defileur-sens'), 10);
        /* Un « écran » de cartes à la fois, et non une carte : c'est le geste
           attendu d'une flèche de bande. Le pas est mesuré sur la piste plutôt
           qu'écrit en dur — la largeur d'une carte tombe de `--card-min`, qui
           change avec la largeur de fenêtre et avec le type de carte.

           **Sur la galerie de fiche, un « écran » est UNE photo** — depuis
           L5b, une photo et son amorce (PO-196).

           **La cible part de la vue alignée la plus proche**, pas de la
           position courante : après un balayage laissé à mi-course, un pas
           ajouté à `scrollLeft` garderait le décalage. Les positions alignées
           sont des multiples exacts du pas unitaire, sur les deux pistes — le
           rembourrage de la bande d'accueil est compensé par son
           `scroll-padding`. Au-delà du bout, le navigateur borne de lui-même. */
        var u = pasUnitaire(piste);
        var n = vuesParEcran(piste, u);
        var rang = Math.round(piste.scrollLeft / u);
        piste.scrollTo({ left: (rang + sens * n) * u, behavior: comportement() });
      });
    }

    piste.addEventListener('scroll', majEtats);

    /* La bande peut cesser de déborder quand la fenêtre s'élargit — quatre
       cartes tiennent dans la colonne à 1440 px et pas à 1024. Les flèches
       suivent, dans les deux sens. */
    if (window.ResizeObserver) {
      new window.ResizeObserver(majVisibilite).observe(piste);
    } else {
      window.addEventListener('resize', majVisibilite);
    }

    majVisibilite();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LE CARROUSEL CENTRÉ — lot E (2026-10-02), étendu le 2026-10-06
     ═══════════════════════════════════════════════════════════════════════
     Demande du client final : la carte courante plus grande au milieu, ses
     voisines réduites et coupées sur les côtés, des flèches, et « chaque clic
     ramène la carte choisie au centre ».

     **IL VIVAIT DANS `accueil.js`, POUR LES SEULS PACKS.** Le 2026-10-06 le
     client l'a demandé sur toutes les bandes de cartes : la bande des
     activités de l'accueil, et le rail des extras de l'écran 3 du parcours —
     que `accueil.js` ne sert pas. D'où son adresse ici, à côté du défileur
     ordinaire, publiée par `window.D4R` comme lui. *Corps repris à
     l'identique*, sauf l'exemption du point 3, élargie du seul bouton de
     favori à tout contrôle (le compteur d'un extra).

     **La mise en page est en CSS** (`site.css`, fin de fichier) : alignement
     au centre, cales de début et de fin. Ce script ne fait que trois choses,
     et la bande se balaie au doigt sans lui :

       1. dire quelle carte est au milieu (`est-courant`) — c'est sur elle que
          la CSS lève la réduction ;
       2. faire avancer les flèches d'UNE carte, là où le défileur ordinaire
          avance d'un écran ;
       3. amener au centre la voisine sur laquelle on clique, au lieu d'ouvrir
          sa fiche. Un second clic, sur la carte devenue courante, l'ouvre.

     **Le point 3 ne vaut que pour la souris et le doigt.** Au clavier
     (`detail === 0` : Entrée sur le lien), le lien s'ouvre comme partout — le
     focus a déjà fait défiler la carte, et intercepter Entrée ferait d'un lien
     un bouton sans le dire. **Un contrôle d'une voisine reste ce qu'il est** :
     le cœur des favoris, le compteur d'un extra agissent sans déplacer la
     bande.

     **La bande ne boucle pas** : aux deux bouts, la flèche est désactivée et
     reste en place. */
  function carrouselCentre(racine) {
    var piste = racine.querySelector('[data-defileur-piste]');
    var commandes = racine.querySelector('[data-defileur-commandes]');
    if (!piste || !piste.children.length) {
      return;
    }
    var cartes = [];
    var boutons = commandes ? commandes.querySelectorAll('[data-defileur-sens]') : [];
    var courant = 0;
    /* Rang visé par une flèche ou un clic, le temps que la piste y glisse. */
    var vise = null;
    var minuterie = null;

    /* Les cartes AFFICHÉES seulement : sous 1200 px, la cinquième carte des
       packs est masquée par la CSS (PO-246). Relu à chaque mesure — le seuil
       se franchit en redimensionnant. */
    function lister() {
      cartes = Array.prototype.filter.call(piste.children, function (c) {
        return c.getClientRects().length > 0;
      });
    }

    /* Distance du centre d'une carte au centre de la piste. Mesurée sur les
       boîtes rendues : la réduction se fait autour du centre de la carte, elle
       ne le déplace pas. */
    function ecart(carte) {
      var c = carte.getBoundingClientRect();
      var p = piste.getBoundingClientRect();
      return (c.left + c.width / 2) - (p.left + p.width / 2);
    }

    /* 2026-10-15 — LE DÉFILEMENT BORNÉ (PO-246). La position où se pose chaque
       carte : **la première au bout gauche (0), la dernière au bout droit**, les
       autres au centre de la piste — c'est l'aimantation que pose la CSS.

       **La carte courante se lit sur ces positions, plus sur le centre.** La
       première, calée à gauche, n'est jamais la plus proche du centre : l'ancienne
       règle désignait la deuxième — mesuré le 2026-10-15.

       Et la raison des 25 px : seules la première et la dernière s'aimantent par
       leur BORD, et la réduction des voisines (`transform`) déplace ce bord ;
       Chrome aimante sur la boîte transformée. Réduite, la première carte se
       poserait 25 px trop loin. Les centres, eux, ne bougent pas. D'où les deux
       parades : la carte visée est désignée — donc rendue à sa taille — AVANT
       que la piste ne glisse (`allerA()`), et la règle ci-dessous suit la
       position pendant le geste, si bien qu'en approchant du bout la première
       carte redevient courante, et son bord revient à sa place, avant que
       l'aimantation ne conclue. */
    function positions() {
      var max = piste.scrollWidth - piste.clientWidth;
      var p = [];
      for (var i = 0; i < cartes.length; i++) {
        if (i === 0) {
          p.push(0);
        } else if (i === cartes.length - 1) {
          p.push(max);
        } else {
          p.push(Math.max(0, Math.min(max, piste.scrollLeft + ecart(cartes[i]))));
        }
      }
      return p;
    }

    function peindre() {
      for (var k = 0; k < cartes.length; k++) {
        cartes[k].classList.toggle('est-courant', k === courant);
      }
      for (var b = 0; b < boutons.length; b++) {
        var sens = parseInt(boutons[b].getAttribute('data-defileur-sens'), 10);
        boutons[b].disabled = sens < 0 ? courant === 0 : courant === cartes.length - 1;
      }
    }

    function marquer() {
      /* Piste non peinte (volet replié, onglet caché) : toutes les boîtes sont
         à zéro, la « plus proche » serait la première par accident. */
      if (piste.clientWidth <= 0) {
        return;
      }
      lister();
      if (!cartes.length) {
        return;
      }
      if (vise !== null) {
        /* Pendant un glissement commandé, la carte visée reste courante : la
           piste passe devant d'autres positions, qui ne doivent pas la
           réduire en chemin. Rendue au geste 150 ms après le dernier
           défilement. */
        courant = Math.min(vise, cartes.length - 1);
        peindre();
        window.clearTimeout(minuterie);
        minuterie = window.setTimeout(function () {
          vise = null;
          marquer();
        }, 150);
        return;
      }
      var p = positions();
      var meilleur = 0;
      var distance = Infinity;
      for (var i = 0; i < p.length; i++) {
        var d = Math.abs(piste.scrollLeft - p[i]);
        if (d < distance) {
          distance = d;
          meilleur = i;
        }
      }
      courant = meilleur;
      peindre();
      caler();
    }

    /* L'ARRÊT AUX DEUX BOUTS, VÉRIFIÉ QUAND LA PISTE S'IMMOBILISE. La carte qui
       devient courante reprend sa taille par une TRANSITION (`--dur-base`,
       240 ms) ; si l'aimantation conclut pendant ce temps, elle se fie au bord
       encore réduit et s'arrête court — mesuré le 2026-10-15 au téléphone : la
       dernière activité à 646 au lieu de 662, collée au bord de l'écran. Une
       fois la piste immobile et la transition finie, la position est donc
       relue ; au premier ou au dernier rang, l'écart restant est rattrapé.
       Au milieu, rien : un centre ne bouge pas avec la réduction. */
    var reglage = null;
    /* Une seule tentative par cible : si l'aimantation la refusait, rattraper
       encore relancerait le défilement, donc ce contrôle, sans fin. */
    var dejaCale = null;
    function caler() {
      window.clearTimeout(reglage);
      reglage = window.setTimeout(function () {
        if (vise !== null || piste.clientWidth <= 0 || !cartes.length) {
          return;
        }
        if (courant !== 0 && courant !== cartes.length - 1) {
          dejaCale = null;
          return;
        }
        var cible = positions()[courant];
        if (Math.abs(piste.scrollLeft - cible) <= 1) {
          dejaCale = null;
          return;
        }
        if (dejaCale === cible) {
          return;
        }
        dejaCale = cible;
        piste.scrollTo({ left: cible, behavior: comportement() });
      }, 260);
    }

    /* 2026-10-15 — EN RANGÉE À L'ORDINATEUR (PO-244). Au-dessus de 1200 px, la
       CSS pose la piste de l'accueil en grille : toutes les cartes sont
       entières, aucune n'est « au centre ». Le point 3 ci-dessus doit alors se
       taire — sinon un clic sur trois cartes sur quatre les ferait glisser au
       lieu de les ouvrir. **La règle est lue dans la page rendue**, pas
       recopiée : le seuil n'existe qu'à un endroit, `site.css`. Le rail des
       extras n'est jamais en grille, il n'est pas concerné. */
    function enRangee() {
      return window.getComputedStyle(piste).display === 'grid';
    }

    function allerA(rang) {
      lister();
      rang = Math.max(0, Math.min(cartes.length - 1, rang));
      /* La carte visée d'abord : rendue à sa taille, son bord (aux deux bouts)
         reprend sa place AVANT que l'aimantation ne calcule où s'arrêter. */
      vise = rang;
      courant = rang;
      peindre();
      var cible = positions()[rang];
      if (Math.abs(cible - piste.scrollLeft) < 1) {
        vise = null;
        return;
      }
      piste.scrollTo({ left: cible, behavior: comportement() });
    }

    for (var b = 0; b < boutons.length; b++) {
      boutons[b].addEventListener('click', function (e) {
        allerA(courant + parseInt(e.currentTarget.getAttribute('data-defileur-sens'), 10));
      });
    }

    piste.addEventListener('click', function (e) {
      if (e.detail === 0 || enRangee() || (e.target.closest && e.target.closest('button, input, select, textarea, label'))) {
        return;
      }
      var carte = e.target;
      while (carte && carte.parentNode !== piste) {
        carte = carte.parentNode;
      }
      if (!carte || carte === cartes[courant] || cartes.indexOf(carte) < 0) {
        return;
      }
      e.preventDefault();
      allerA(cartes.indexOf(carte));
    });

    piste.addEventListener('scroll', marquer);
    if (window.ResizeObserver) {
      new window.ResizeObserver(marquer).observe(piste);
    } else {
      window.addEventListener('resize', marquer);
    }

    lister();
    if (commandes) {
      commandes.hidden = cartes.length < 2;
    }
    racine.classList.add('est-cable');
    marquer();
  }

  D4R.reduit = reduit;
  D4R.comportement = comportement;
  D4R.surChangementDeMedia = surChangementDeMedia;
  D4R.defileur = defileur;
  D4R.carrouselCentre = carrouselCentre;
  D4R.pasUnitaire = pasUnitaire;
})();
