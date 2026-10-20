/**
 * Accueil — le carrousel du bandeau, et le câblage des bandes de cartes.
 * Lot L3 (2026-09-21). Vanilla, aucune dépendance, aucune compilation.
 *
 * **Le défileur lui-même n'est plus ici depuis le lot L4** : il vit dans
 * `defileur.js`, que la galerie de fiche lit aussi. Ce fichier ne garde que le
 * carrousel du bandeau, qui lui est propre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AMÉLIORATION PROGRESSIVE, ET CE N'EST PAS UNE FORMULE.
 *
 * Sans ce fichier, la page reste entière et utilisable :
 *  - le bandeau montre sa première photo, et la bande se balaie au doigt —
 *    c'est un conteneur `overflow-x: auto`, pas une mécanique de script ;
 *  - les bandes de cartes se balaient de même ;
 *  - **aucune flèche, aucune pastille n'est visible** : elles sont rendues
 *    `hidden` par PHP et c'est ce fichier qui les montre. Un contrôle qui
 *    n'agirait sur rien est pire que pas de contrôle — même règle que le
 *    bouton de favori et que le bouton de menu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFILEMENT RÉDUIT EST RESPECTÉ, ET DE DEUX FAÇONS DISTINCTES.
 *
 * `prefers-reduced-motion: reduce` demande *moins de mouvement*, pas *moins de
 * fonctions*. Les deux conséquences ici :
 *
 *  1. **le défilement automatique du bandeau ne démarre pas du tout.** Un
 *     mouvement que le visiteur n'a pas déclenché est exactement ce que ce
 *     réglage refuse ;
 *  2. **les sauts commandés sont instantanés** (`behavior: 'auto'`), flèches et
 *     pastilles comprises. Le geste marche toujours, il ne glisse plus.
 *
 * La préférence est **relue à chaque changement**, pas une fois au chargement :
 * elle se change en cours de visite, sur tous les systèmes récents.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   LA VIDÉO DU BANDEAU — PO-221 (2026-10-04)
   ═══════════════════════════════════════════════════════════════════════════
   Décisions du client : lecture automatique, en boucle, sans son ; une image
   d'attente pendant le chargement ; **rien sur une connexion lente** ; un
   bouton pause obligatoire.

   **Un bloc à part, qui ne dépend pas de `defileur.js`** : le reste de ce
   fichier sort sec si le défileur manque, et la vidéo n'a aucune raison de
   tomber avec lui.

   **L'INTENTION, PAS L'ÉTAT.** `voulue` dit si la vidéo DOIT jouer — vrai au
   départ, sauf animations réduites ou connexion lente ; le bouton la bascule.
   Les trois arrêts automatiques (hors de l'écran, onglet caché, page pas encore
   chargée) mettent en pause **sans toucher à l'intention** : revenue à l'écran,
   la vidéo reprend si le visiteur ne l'a pas arrêtée, et reste arrêtée s'il
   l'a fait. Le bouton montre l'intention : deux barres quand elle est voulue,
   un triangle sinon.

   **CE QUI EST TÉLÉCHARGÉ, ET QUAND.** Rien avant la fin du chargement de la
   page (`load`) : l'image d'attente et le reste passent d'abord. Rien du tout
   si la vidéo n'est pas voulue — l'adresse n'est posée sur `<video>` qu'au
   premier besoin. *Connexion lente* : `navigator.connection` — économie de
   données, ou réseau 2G. **Safari n'expose pas cette information** : sur un
   iPhone en réseau lent, la vidéo est chargée ; c'est ce que borne le plafond
   de poids de l'admin.

   **LA MÊME VIDÉO SUR TOUS LES ÉCRANS, TÉLÉPHONE COMPRIS — DÉCISION DU CLIENT
   DU 2026-10-10, PRISE EN CONNAISSANCE DE CAUSE.** Chaque visiteur au
   téléphone télécharge les **18,1 Mo** de la vidéo en ligne (18 938 643
   octets, 53 s à 2,84 Mb/s) à sa première visite — environ 1,8 % d'une eSIM
   de 1 Go, souvent en itinérance. Le client l'assume. *Ne pas « réparer »* :
   un seuil de largeur (« seulement à partir de 1 024 px », 2026-10-09) puis un
   second fichier léger pour le téléphone (2026-10-10) ont été codés, puis
   retirés à sa demande — il veut un seul champ, un seul fichier, servi à tous
   (SUIVI.md, 2026-10-10). Les gardes ci-dessus restent : rien avant `load`,
   rien sous « Réduire les animations » ni sur connexion signalée lente, pause
   hors de l'écran, bouton pause, image d'attente.

   **LE REFUS DU NAVIGATEUR N'EST PAS UNE PANNE.** iOS en économie d'énergie,
   certains Android en économie de données refusent la lecture automatique
   (`NotAllowedError`) : l'intention retombe, le triangle s'affiche, l'image
   reste. Un toucher sur le bouton est un geste du visiteur, que ces modes
   laissent passer. Un `AbortError` (une pause arrivée pendant le démarrage)
   n'en est pas un, et ne change rien. */
(function () {
  'use strict';

  var media = document.querySelector('[data-video]');
  var video = media ? media.querySelector('video[data-video-src]') : null;
  var bouton = document.querySelector('[data-video-bouton]');
  if (!video || !bouton) {
    return;
  }
  var libelle = bouton.querySelector('[data-video-libelle]');

  var reduit = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var c = navigator.connection;
  var lente = !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));

  var voulue = !reduit.matches && !lente;
  var chargee = false;
  var aLEcran = true;
  var pagePrete = document.readyState === 'complete';

  /* Ceinture et bretelles : un navigateur qui ignorerait l'attribut `muted`
     du HTML refuserait la lecture automatique. */
  video.muted = true;

  function montrer() {
    bouton.classList.toggle('est-arretee', !voulue);
    if (libelle) {
      libelle.textContent = voulue ? 'Mettre la vidéo en pause' : 'Lire la vidéo';
    }
  }

  function appliquer() {
    if (voulue && aLEcran && pagePrete && !document.hidden) {
      if (!chargee) {
        chargee = true;
        video.src = video.getAttribute('data-video-src');
      }
      var p = video.play();
      if (p && p.catch) {
        p.catch(function (e) {
          if (e && e.name === 'NotAllowedError') {
            voulue = false;
            montrer();
          }
        });
      }
    } else if (chargee && !video.paused) {
      video.pause();
    }
    montrer();
  }

  /* Elle paraît au premier `playing` — pas avant : l'iPhone peindrait un cadre
     noir par-dessus l'image d'attente. Et elle reste visible ensuite, arrêtée
     sur son image courante, comme une photo. */
  video.addEventListener('playing', function () {
    media.classList.add('est-lue');
  });

  /* Un fichier illisible : l'image reste, le bouton part — il n'aurait plus
     rien à commander. */
  video.addEventListener('error', function () {
    voulue = false;
    media.classList.remove('est-lue');
    bouton.hidden = true;
  });

  bouton.addEventListener('click', function () {
    voulue = !voulue;
    appliquer();
  });

  if (window.IntersectionObserver) {
    new window.IntersectionObserver(function (entrees) {
      aLEcran = entrees[entrees.length - 1].isIntersecting;
      appliquer();
    }).observe(media);
  }

  document.addEventListener('visibilitychange', appliquer);

  /* « Réduire les animations » demandé en cours de visite : la vidéo s'arrête.
     L'inverse ne la relance pas — c'est au visiteur de le vouloir. */
  var surReduit = function () {
    if (reduit.matches && voulue) {
      voulue = false;
      appliquer();
    }
  };
  if (reduit.addEventListener) {
    reduit.addEventListener('change', surReduit);
  } else if (reduit.addListener) {
    reduit.addListener(surReduit);
  }

  if (!pagePrete) {
    window.addEventListener('load', function () {
      pagePrete = true;
      appliquer();
    });
  }

  /* Le bouton paraît maintenant que le script le commande. */
  bouton.hidden = false;
  appliquer();
})();

(function () {
  'use strict';

  /* LE DÉFILEUR A DÉMÉNAGÉ DANS `defileur.js` AU LOT L4, ET AVEC LUI LES DEUX
     OUTILS DE PRÉFÉRENCE DE MOUVEMENT. Motif : la galerie de fiche demande
     exactement le même geste, et ce fichier-ci n'est chargé que sur l'accueil —
     le recopier aurait fait une **troisième** copie du patron. Le corps déplacé
     est identique au caractère près ; seule son adresse change.

     **Sortie sèche si le fichier manque, et ce n'est pas une dégradation
     nouvelle** : c'est exactement l'état sans JavaScript décrit en tête —
     aucune flèche, aucune pastille, aucun défilement automatique, et des
     pistes qui se balaient au doigt parce qu'elles sont des conteneurs
     `overflow-x: auto`. Même repli que `parcours.js` quand `window.D4R`
     manque. */
  if (!window.D4R || !window.D4R.defileur) {
    return;
  }

  var reduit = window.D4R.reduit;
  var comportement = window.D4R.comportement;
  var surChangementDeMedia = window.D4R.surChangementDeMedia;

  /* ═══════════════════════════════════════════════════════════════════════
     LE CARROUSEL DU BANDEAU
     ═══════════════════════════════════════════════════════════════════════ */

  /** Toutes les 5 secondes depuis le lot M3 (2026-09-28), décision du client —
   *  7 à l'origine. Le compromis d'alors reste vrai : une photo qui change
   *  pendant qu'on lit est le défaut classique de ce composant. Ce qui le
   *  tient désormais, c'est l'arrêt dès que le visiteur agit — souris, doigt,
   *  clavier — et la remise à zéro après un geste : le décompte ne court
   *  jamais pendant qu'on regarde de près. */
  var PAS_AUTOMATIQUE = 5000;

  function carrousel(racine) {
    var piste = racine.querySelector('[data-carrousel-piste]');
    if (!piste) {
      return;
    }
    var vues = piste.children;
    var hero = racine.closest('.hero');
    var commandes = hero ? hero.querySelector('[data-carrousel-commandes]') : null;

    /* UNE SEULE PHOTO N'EST PAS UN CARROUSEL. Les commandes restent `hidden`,
       et rien ne se met en marche : ni minuterie, ni écouteur. Ce cas est
       l'état normal du site tant que le client n'a rempli qu'un emplacement. */
    if (vues.length < 2) {
      return;
    }

    /* LES PHOTOS 2 À 5 SONT RÉCLAMÉES ICI, ET IL LE FAUT.
       ───────────────────────────────────────────────────────────────────────
       PHP les rend en `loading="lazy"` : sans JavaScript elles se chargent au
       balayage, quand la bande les amène à l'écran. **Mais une bande
       horizontale ne croise le champ de vision qu'une fois déjà en train de
       défiler** : laissées ainsi, la première transition commandée par une
       flèche ou par la minuterie montrerait un cadre vide le temps du
       téléchargement.

       Les repasser en `eager` les demande maintenant — après le premier rendu,
       quand la première photo est déjà à l'écran. C'est le seul endroit où ce
       script décide d'un téléchargement, et il l'assume : mesuré le 2026-09-21
       sur les 95 photos du dossier d'envoi, un maître pèse 315 Ko en moyenne,
       et les cinq d'un coup avant le premier affichage feraient 1,6 Mo. */
    var differees = piste.querySelectorAll('img[loading="lazy"]');
    for (var d = 0; d < differees.length; d++) {
      differees[d].loading = 'eager';
    }

    if (!commandes) {
      return;
    }
    commandes.hidden = false;

    var pastilles = commandes.querySelectorAll('[data-carrousel-vue]');
    var courante = 0;
    var minuterie = null;
    /* Vrai pendant un saut commandé, le temps que le glissement s'achève. */
    var enMouvement = false;
    var finMouvement = null;

    /** La vue affichée, déduite de la position de défilement.
     *
     *  **ELLE NE SERT PAS À COMPTER LES PAS, ET C'EST UNE CORRECTION.** Trouvée
     *  à la mesure le 2026-09-21 : deux appuis rapides sur « Photo suivante »
     *  n'avançaient que **d'une vue**. Le second appui lisait `scrollLeft` *en
     *  pleine animation* — donc l'ancienne vue — et recalculait la même
     *  destination. Rien n'échouait : le bandeau avançait, simplement moins
     *  qu'on ne le lui demandait.
     *
     *  Le pas se compte donc sur `courante`, le compteur interne. Cette
     *  fonction-ci sert à **rattraper le balayage au doigt**, que le compteur
     *  ne voit pas — et seulement quand aucun saut n'est en cours.
     *
     *  `clientWidth` à 0 veut dire « pas encore peint » : on rend le compteur
     *  plutôt qu'une division par zéro. */
    function vueVisible() {
      var largeur = piste.clientWidth;
      if (largeur <= 0) {
        return courante;
      }
      return Math.round(piste.scrollLeft / largeur);
    }

    function marquer(index) {
      courante = index;
      for (var i = 0; i < pastilles.length; i++) {
        if (i === index) {
          pastilles[i].setAttribute('aria-current', 'true');
        } else {
          pastilles[i].removeAttribute('aria-current');
        }
      }
    }

    function aller(index) {
      var total = vues.length;
      /* Le bouclage est voulu : « suivante » sur la dernière revient à la
         première. Sans lui, le défilement automatique s'arrêterait au bout et
         le bandeau paraîtrait cassé. */
      index = ((index % total) + total) % total;
      /* Le compteur est posé AVANT le glissement, et c'est ce qui rend deux
         appuis rapides justes : le second part de la destination du premier,
         pas de la position où l'animation se trouve. */
      marquer(index);
      enMouvement = true;
      if (finMouvement !== null) {
        window.clearTimeout(finMouvement);
      }
      finMouvement = window.setTimeout(function () {
        enMouvement = false;
        /* Filet : si le glissement n'a pas abouti là où on croyait — fenêtre
           redimensionnée pendant, animation interrompue — le compteur se cale
           sur ce que le visiteur voit réellement. */
        marquer(vueVisible());
      }, 700);
      piste.scrollTo({ left: piste.clientWidth * index, behavior: comportement() });
    }

    /* ── Le défilement automatique ────────────────────────────────────────
       Il s'arrête dans cinq cas, et chacun a sa raison :
        - `prefers-reduced-motion` — il ne démarre alors jamais ;
        - la souris est sur le bandeau — on regarde une photo ;
        - **un doigt est posé sur le bandeau** (lot M3) — on la touche, on la
          fait glisser ;
        - le focus est dans le bandeau — on est au clavier, dans le champ de
          recherche ou sur une commande, et le sol ne doit pas bouger ;
        - l'onglet est caché — faire défiler un bandeau que personne ne voit ne
          sert qu'à consommer de la batterie.

       **LOT M3 : CES CAS SONT DES ÉTATS, PAS DES ÉVÉNEMENTS.** Avant lui,
       chaque écouteur appelait `demarrer()` ou `arreter()` sans connaître les
       autres : la sortie de la souris relançait la minuterie même le curseur
       encore dans le champ de recherche. `demarrer()` relit désormais tous les
       motifs d'arrêt, et ne repart que s'il n'en reste aucun.

       **LA SOURIS PASSE PAR `pointerenter` FILTRÉ SUR `pointerType`**, et non
       plus par `mouseenter`. Un téléphone émet, après un toucher, des
       événements de souris *émulés* : un `mouseenter` sans jamais le
       `mouseleave` qui l'aurait défait. Lu dans le code, pas observé sur
       iPhone — mais la conséquence aurait été un bandeau figé pour la visite
       au premier toucher, sans que rien ne le signale. */
    var motifs = { souris: false, doigt: false, focus: false };

    function peutTourner() {
      return !reduit.matches && !document.hidden &&
        !motifs.souris && !motifs.doigt && !motifs.focus;
    }

    function demarrer() {
      if (minuterie !== null || !peutTourner()) {
        return;
      }
      minuterie = window.setInterval(function () {
        aller(courante + 1);
      }, PAS_AUTOMATIQUE);
    }

    function arreter() {
      if (minuterie !== null) {
        window.clearInterval(minuterie);
        minuterie = null;
      }
    }

    /** LA REMISE À ZÉRO — lot M3. Après tout geste du visiteur — une flèche, un
     *  point, un glissement —, le décompte repart de zéro : la prochaine photo
     *  vient cinq secondes après le geste, jamais une seconde après. Sans elle,
     *  la minuterie continuait son cycle et pouvait avancer aussitôt, sur la
     *  photo qu'on venait de choisir. Si elle ne tournait pas, rien ne change :
     *  un geste ne remet pas en marche ce qu'un motif d'arrêt tient arrêté. */
    function relancer() {
      if (minuterie === null) {
        return;
      }
      arreter();
      demarrer();
    }

    var boutons = commandes.querySelectorAll('[data-carrousel-sens]');
    for (var b = 0; b < boutons.length; b++) {
      boutons[b].addEventListener('click', function (e) {
        var sens = parseInt(e.currentTarget.getAttribute('data-carrousel-sens'), 10);
        aller(courante + sens);
        relancer();
      });
    }

    for (var p = 0; p < pastilles.length; p++) {
      pastilles[p].addEventListener('click', function (e) {
        aller(parseInt(e.currentTarget.getAttribute('data-carrousel-vue'), 10));
        relancer();
      });
    }

    /* LE CLAVIER. Les flèches gauche et droite parcourent le bandeau **quand le
       focus est sur une commande du carrousel**, et seulement là : les capter
       plus largement volerait les flèches au champ de recherche, où elles
       déplacent le curseur, et à la liste de suggestions, qui s'en sert déjà
       pour sa sélection (SPEC.md §3 bis). */
    commandes.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        aller(courante - 1);
        relancer();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        aller(courante + 1);
        relancer();
      }
    });

    /* Le balayage au doigt met à jour les pastilles. `scrollend` n'est pas
       partout : la minuterie courte fait le même travail sans lui. */
    var attente = null;
    piste.addEventListener('scroll', function () {
      if (attente !== null) {
        window.clearTimeout(attente);
      }
      attente = window.setTimeout(function () {
        /* Un saut commandé pilote déjà le compteur : le rattraper ici le
           ferait clignoter sur les positions intermédiaires de l'animation.

           **Hors saut commandé, un défilement est un geste du visiteur** —
           doigt, pavé tactile, molette horizontale — et le décompte repart
           de zéro (lot M3). Le rappel tombe 120 ms après le DERNIER
           événement : l'élan d'un glissement compris, le décompte part de
           l'arrêt réel de la bande, pas du moment où le doigt s'est levé. */
        if (!enMouvement) {
          marquer(vueVisible());
          relancer();
        }
      }, 120);
    });

    if (hero) {
      /* La souris seule : `pointerType` écarte le doigt et le stylet, qui
         ont leur propre motif ci-dessous. */
      hero.addEventListener('pointerenter', function (e) {
        if (e.pointerType === 'mouse') {
          motifs.souris = true;
          arreter();
        }
      });
      hero.addEventListener('pointerleave', function (e) {
        if (e.pointerType === 'mouse') {
          motifs.souris = false;
          demarrer();
        }
      });

      /* LE DOIGT PASSE PAR LES ÉVÉNEMENTS TACTILES, ET NON PAR `pointerdown`.
         Dès qu'un glissement horizontal commence, le navigateur prend la main
         sur le défilement et émet `pointercancel` : le doigt serait réputé
         levé alors qu'il glisse encore. `touchend`, lui, n'arrive qu'au lever
         réel. Écouteurs passifs : ils ne retardent pas le défilement.

         Au lever, la minuterie repart **de zéro** — `demarrer()` en crée une
         neuve —, et l'élan éventuel la remet encore à zéro par l'écouteur de
         défilement ci-dessus. */
      var passif = { passive: true };
      hero.addEventListener('touchstart', function () {
        motifs.doigt = true;
        arreter();
      }, passif);
      var lever = function (e) {
        if (e.touches && e.touches.length > 0) {
          return;
        }
        motifs.doigt = false;
        demarrer();
      };
      hero.addEventListener('touchend', lever, passif);
      hero.addEventListener('touchcancel', lever, passif);

      hero.addEventListener('focusin', function () {
        motifs.focus = true;
        arreter();
      });
      hero.addEventListener('focusout', function (e) {
        if (!hero.contains(e.relatedTarget)) {
          motifs.focus = false;
          demarrer();
        }
      });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        arreter();
      } else {
        demarrer();
      }
    });

    /* La préférence se change en cours de visite : on arrête ou on repart. */
    surChangementDeMedia(reduit, function () {
      if (reduit.matches) {
        arreter();
      } else {
        demarrer();
      }
    });

    marquer(0);
    demarrer();
  }

  /* ═══════════════════════════════════════════════════════════════════════ */

  var bandeau = document.querySelector('[data-carrousel]');
  if (bandeau) {
    carrousel(bandeau);
  }

  /* LE CARROUSEL CENTRÉ — lot E (2026-10-02). Il vivait ici, pour les seuls
     packs ; depuis le 2026-10-06 il sert aussi la bande des activités et le
     rail des extras du parcours, que ce fichier ne sert pas. Il est donc dans
     `defileur.js`, publié par `window.D4R.carrouselCentre` — voir là-bas.
     Une bande qui porte `data-defileur-centre` est câblée par lui ; les autres
     par le défileur ordinaire, dont les flèches avancent d'un écran. */
  var bandes = document.querySelectorAll('[data-defileur]');
  for (var i = 0; i < bandes.length; i++) {
    if (bandes[i].hasAttribute('data-defileur-centre')) {
      window.D4R.carrouselCentre(bandes[i]);
    } else {
      window.D4R.defileur(bandes[i]);
    }
  }
})();
