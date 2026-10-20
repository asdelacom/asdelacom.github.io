/**
 * Menu principal au téléphone. Vanilla, aucune dépendance, aucune compilation.
 *
 * Amélioration progressive, dans cet ordre :
 *  - sans JavaScript, `data-js` n'est jamais posé sur <html>, la CSS ne replie
 *    pas la navigation et les six liens restent visibles et cliquables ; le
 *    bouton reste `hidden`, parce qu'un bouton sans effet est pire qu'aucun ;
 *  - avec JavaScript, la navigation se replie et le bouton la commande.
 *
 * Un repli entièrement en CSS (case à cocher + label) aurait ouvert et fermé
 * sans JavaScript, mais ne sait ni porter `aria-expanded`, ni fermer sur Échap,
 * tous deux demandés. Le compromis retenu garde les liens accessibles dans les
 * deux cas, et l'état correctement annoncé dans celui qui a du JavaScript.
 */
/**
 * Les boutons qui déplient — lot B (2026-09-30). **Un seul usage depuis le
 * 2026-10-03** : la liste des gammes de `/voitures` au-dessous de 1024 px
 * (`render_liste_voitures()`, includes/components.php). Le menu « Voitures »,
 * qui dépliait gammes et marques, est retiré à cette date avec son panneau.
 *
 * Un bouton `[data-deplie]` commande l'élément que nomme son `aria-controls` :
 * il bascule `aria-expanded` sur lui, `is-open` sur la cible. **Le bouton naît
 * `hidden` et n'est révélé qu'ici** — sans script, il serait sans effet, et
 * c'est la règle du bouton de menu (voir plus bas). La CSS se charge de ce que
 * « fermé » veut dire pour chaque cible.
 */(function () {
  'use strict';

  var D4R = (window.D4R = window.D4R || {});

  function cible(bouton) {
    return document.getElementById(bouton.getAttribute('aria-controls'));
  }

  /* LOT E (2026-10-02) — UN MENU SE DÉPLIE ET SE REPLIE, IL NE BASCULE PLUS.
     ─────────────────────────────────────────────────────────────────────
     Relevé du client final : « les transitions de menu sont trop brusques ».
     Tous les menus du site passaient de `display: none` à leur taille en une
     image, dans les deux sens.

     `deplier()` remplace le `classList.toggle('is-open')` des deux moitiés de
     ce fichier. L'état reste porté par la classe `is-open` et par
     `aria-expanded`, comme avant ; ce qui s'ajoute est le trajet : hauteur,
     rembourrage vertical et opacité vont de zéro à leur valeur, ou l'inverse,
     en `--dur-base`. La transition est portée par la classe `.se-deplie`
     (`site.css`), posée le temps du mouvement.

     **À la fermeture, `is-open` n'est retirée qu'à la fin du trajet** — c'est
     elle qui garde le menu affiché pendant qu'il se replie. `aria-expanded`,
     lui, change tout de suite : c'est lui qui dit l'état, et tout le reste du
     site le lit là.

     **Trois cas sans mouvement, et le menu fonctionne dans les trois** :
       - « Réduire les animations » ;
       - `sansMouvement` demandé par l'appelant (un filtre posé sur place
         referme le menu pendant que la page change : rien à voir) ;
       - **la classe ne change pas l'affichage.** Au-dessus de 640 px la
         navigation est toujours visible, au-dessus de 1024 la liste des gammes
         aussi : y poser ou retirer `is-open` ne montre ni ne cache rien, et
         les replier à zéro ferait disparaître 240 ms un menu qui doit rester
         là. Le test se fait sur le style calculé, pas sur la largeur de
         fenêtre — une règle de plus dans la feuille n'aura pas à être
         recopiée ici.

     **Une minuterie, pas `transitionend`** : l'événement ne vient pas si la
     transition est interrompue, ou dans un onglet caché, et le menu resterait
     coincé à hauteur nulle. */
  var reduit = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function nettoyer(c) {
    window.clearTimeout(c.d4rFin);
    c.classList.remove('se-deplie');
    c.style.transition = '';
    c.style.height = '';
    c.style.paddingTop = '';
    c.style.paddingBottom = '';
    c.style.opacity = '';
  }

  function aZero(c) {
    c.style.height = '0px';
    c.style.paddingTop = '0px';
    c.style.paddingBottom = '0px';
    c.style.opacity = '0';
  }

  function cache(c) {
    return window.getComputedStyle(c).display === 'none';
  }

  function deplier(c, ouvrir, sansMouvement) {
    var etaitOuvert = c.classList.contains('is-open');
    nettoyer(c);

    if (ouvrir) {
      var etaitCache = cache(c);
      c.classList.add('is-open');
      if (sansMouvement || reduit.matches || etaitOuvert || !etaitCache) {
        return;
      }
      var hauteur = c.offsetHeight;
      /* L'ÉTAT DE DÉPART SE POSE SANS TRANSITION, et ce n'est pas un détail.
         Trouvé au relevé du lot : la lecture de `offsetHeight` ci-dessus a
         calculé le menu à son opacité pleine ; poser ensuite la classe et le
         zéro ensemble lançait une transition de 1 vers 0, que la ligne
         suivante renversait aussitôt — l'opacité restait à 1 du début à la
         fin, et seule la hauteur bougeait. */
      c.style.transition = 'none';
      c.classList.add('se-deplie');
      aZero(c);
      void c.offsetHeight; // l'état de départ doit être calculé avant de partir
      c.style.transition = '';
      c.style.height = hauteur + 'px';
      c.style.paddingTop = '';
      c.style.paddingBottom = '';
      c.style.opacity = '1';
      c.d4rFin = window.setTimeout(function () { nettoyer(c); }, duree(c));
      return;
    }

    if (!etaitOuvert) {
      return;
    }
    /* La classe cache-t-elle vraiment quelque chose ? On la retire le temps de
       lire, dans la même tâche : rien n'est peint entre les deux lignes. */
    c.classList.remove('is-open');
    if (sansMouvement || reduit.matches || !cache(c)) {
      return;
    }
    c.classList.add('is-open');
    c.style.height = c.offsetHeight + 'px';
    c.classList.add('se-deplie');
    void c.offsetHeight;
    aZero(c);
    c.d4rFin = window.setTimeout(function () {
      c.classList.remove('is-open');
      nettoyer(c);
    }, duree(c));
  }

  /* La durée est lue sur l'élément, pas connue d'ici : elle vient de
     `--dur-base`. Trente millisecondes de marge pour que le dernier rendu de
     la transition ait eu lieu. */
  function duree(c) {
    var d = parseFloat(window.getComputedStyle(c).transitionDuration) || 0;
    return d * 1000 + 30;
  }

  D4R.deplier = deplier;

  function basculer(bouton, ouvrir) {
    var c = cible(bouton);
    if (!c) {
      return;
    }
    bouton.setAttribute('aria-expanded', ouvrir ? 'true' : 'false');
    deplier(c, ouvrir);
    /* Refermer un niveau referme aussi ceux qu'il contient : rouvrir « Voitures »
       ne doit pas retrouver trois gammes dépliées d'une visite précédente. */
    if (!ouvrir) {
      Array.prototype.forEach.call(c.querySelectorAll('[data-deplie][aria-expanded="true"]'), function (b) {
        basculer(b, false);
      });
    }
  }

  /* REJOUABLE depuis le lot « sur place » (2026-10-01) : `surplace.js` remplace
     le contenu de la page, et le bouton de la liste des gammes qui arrive avec
     n'a jamais été vu par ce script. Un bouton déjà branché est sauté — sans
     ce garde, un second passage lui donnerait deux écouteurs, et un clic
     l'ouvrirait puis le refermerait aussitôt. */
  function brancherDeplie() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-deplie]'), function (bouton) {
      if (bouton.d4rDeplie) {
        return;
      }
      bouton.d4rDeplie = true;
      bouton.hidden = false;
      bouton.addEventListener('click', function () {
        basculer(bouton, bouton.getAttribute('aria-expanded') !== 'true');
      });
    });
  }
  brancherDeplie();
  D4R.brancherDeplie = brancherDeplie;

  /* Le panneau « Voitures » du menu — `[data-deroulant]`, son Échap, son clic
     au dehors, sa perte de focus et `D4R.fermerDeroulants` — est RETIRÉ le
     2026-10-03 avec le panneau lui-même : le menu ne détaille plus les
     voitures. `deplier()` et `[data-deplie]` restent : ils servent la liste des
     gammes de `/voitures`. */})();

(function () {
  'use strict';

  var bouton = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav-principal');
  if (!bouton || !nav) {
    return;
  }

  bouton.hidden = false;

  function estOuvert() {
    return bouton.getAttribute('aria-expanded') === 'true';
  }

  /* LE FOCUS SUIT LE MENU, ET C'EST CE QUI REND SA PLACE DANS LE DOCUMENT
     TENABLE — lot PO-151 du 2026-09-12.
     ───────────────────────────────────────────────────────────────────────
     Le bouton est le DERNIER élément de la bande depuis ce lot, pour qu'il
     se peigne au bord droit sans que la CSS mente sur l'ordre du document
     (voir `render_header()`). La navigation est donc AVANT lui : sans ces
     quelques lignes, l'ouvrir laisserait le focus sur le bouton et le
     premier lien du menu serait **7 pas en arrière** — mesuré. Porter le
     focus sur le premier lien à l'ouverture est le geste habituel d'un menu
     à bascule, et ici il n'est pas facultatif.

     À la fermeture, le focus revient au bouton **s'il est encore là pour le
     recevoir** : `offsetParent` est nul quand un élément est masqué, et le
     bouton l'est au-dessus de 640 px. Sans ce garde, repasser en écran large
     avec le menu ouvert enverrait le focus sur un bouton invisible ; la
     navigation, elle, redevient visible à cette taille et le lien focalisé y
     reste parfaitement atteignable. */
  /* LE MENU RECOUVRE LA PAGE — lot du 2026-10-03.
     ─────────────────────────────────────────────────────────────────────
     Il ne la pousse plus : posé par-dessus, il en cache tout ce qui est sous
     la bande — le panneau sur la hauteur de ses lignes, le voile sur le reste
     depuis le 2026-10-04. Deux conséquences, et aucune n'est facultative.

     **Le clavier ne doit pas passer dessous.** Après le dernier lien, le focus
     va à Panier, Favoris et au logo — dans la bande, visibles. Sans plus, la
     tabulation suivante entrerait dans la page cachée sous le panneau : un
     focus invisible. Tout ce qui n'est pas l'en-tête est donc rendu `inert`
     le temps de l'ouverture — hors de la tabulation, du clic et de l'arbre
     d'accessibilité. *L'ordre de la bande, lui, ne change pas* : bouton, six
     liens, Panier, Favoris, logo — celui que l'en-tête inversé a mesuré, sans
     aucun `order`.

     **La page ne défile pas dessous** : `menu-ouvert` sur `<html>`.

     *Au téléphone seulement* : le bouton n'est visible que là
     (`offsetParent`). À l'ordinateur la navigation est dans la bande, rien
     n'est recouvert. Fermer — bouton, Échap, passage en écran large, filtre
     posé sur place — lève les deux. */
  function recouvrir(oui) {
    document.documentElement.classList.toggle('menu-ouvert', oui);
    var entete = nav.closest('header');
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el === entete || el.tagName === 'SCRIPT') { return; }
      if (oui) {
        if (!el.inert) { el.inert = true; el.d4rInerte = true; }
      } else if (el.d4rInerte) {
        el.inert = false;
        el.d4rInerte = false;
      }
    });
  }

  function basculer(ouvrir) {
    var focusDansLeMenu = nav.contains(document.activeElement);
    bouton.setAttribute('aria-expanded', ouvrir ? 'true' : 'false');
    /* Le panneau s'anime en CSS (`site.css`, `[data-js] .site-header__nav`) :
       la classe suffit. `deplier()` — la hauteur animée du lot E — ne sert
       plus ici, il poussait la page. */
    nav.classList.toggle('is-open', ouvrir);
    recouvrir(ouvrir && bouton.offsetParent !== null);
    if (ouvrir) {
      var premierLien = nav.querySelector('a[href]');
      if (premierLien) {
        /* `preventScroll` — trouvé au relevé du 2026-10-03 : le lien est dans la
           bande collante, et le navigateur faisait défiler la page de 366 px
           pour « l'amener à l'écran » quand le menu s'ouvrait en milieu de page.
           Il est déjà à l'écran : rien à faire défiler. */
        premierLien.focus({ preventScroll: true });
      }
    } else if (focusDansLeMenu && bouton.offsetParent !== null) {
      bouton.focus({ preventScroll: true });
    }
  }

  bouton.addEventListener('click', function () {
    basculer(!estOuvert());
  });

  /* LE VOILE — 2026-10-04, demandes ② et ③ du client. Le panneau ne couvre
     plus que la hauteur de ses six lignes ; dessous, la page reste visible,
     assombrie, et **un toucher sur elle ferme le menu** — le « dehors » qui
     manquait au panneau plein écran.
     ─────────────────────────────────────────────────────────────────────
     Créé ici et non dans `render_header()` : sans script, il n'y a ni menu
     replié ni voile à montrer. Posé **dans l'en-tête, juste avant la
     navigation** : l'en-tête n'est pas rendu `inert` par `recouvrir()`, le
     voile reçoit donc le toucher ; et la navigation, venue après lui dans le
     document, se peint par-dessus sans `z-index`. La page en dessous reste
     `inert` et verrouillée, comme avant : le toucher n'y arrive jamais, il
     s'arrête au voile.
     Le focus revient au bouton s'il était dans le menu — c'est `basculer()`,
     comme pour la croix. `aria-hidden` : une surface, pas un contrôle ; Échap
     et le bouton ferment pour le clavier et le lecteur d'écran. */
  var voile = document.createElement('div');
  voile.className = 'menu-voile';
  voile.setAttribute('aria-hidden', 'true');
  nav.parentNode.insertBefore(voile, nav);
  /* Sans cette ligne, le focus est PERDU — trouvé au relevé : appuyer sur un
     élément qui ne prend pas le focus le retire du lien du menu avant le
     `click`, `basculer()` ne le voit plus dans la navigation et ne le rend pas
     au bouton ; il tombait sur `<body>`. Empêcher l'action par défaut de
     l'appui laisse le focus où il est jusqu'à la fermeture. */
  voile.addEventListener('mousedown', function (e) {
    e.preventDefault();
  });
  voile.addEventListener('click', function () {
    if (estOuvert()) {
      basculer(false);
    }
  });

  /* Lot « sur place » (2026-10-01) : referme le panneau « Voitures » et, au
     téléphone, le menu entier. Le focus n'est pas rendu au bouton comme le fait
     `basculer(false)` — `surplace.js` le porte au titre de la page juste après,
     et deux déplacements de focus coup sur coup feraient parler deux fois un
     lecteur d'écran. */
  (window.D4R = window.D4R || {}).fermerMenu = function () {
    if (estOuvert()) {
      bouton.setAttribute('aria-expanded', 'false');
      nav.classList.remove('is-open');
      recouvrir(false);
    }
  };

  // Échap ferme et rend le focus au bouton : sans ce retour, le focus resterait
  // dans une navigation devenue invisible.
  document.addEventListener('keydown', function (e) {
    // Un Échap déjà pris ailleurs (une fenêtre ouverte) ne ferme pas le menu.
    if (e.key === 'Escape' && !e.defaultPrevented && estOuvert()) {
      basculer(false);
      bouton.focus({ preventScroll: true });
    }
  });

  // Repasser en écran large avec le menu ouvert laisserait `aria-expanded` à
  // true sur un bouton masqué, et un état annoncé faux aux lecteurs d'écran.
  var large = window.matchMedia('(min-width: 641px)');
  var surChangement = function (e) {
    if (e.matches) {
      basculer(false);
    }
  };
  if (large.addEventListener) {
    large.addEventListener('change', surChangement);
  } else {
    large.addListener(surChangement);
  }
})();
