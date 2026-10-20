/**
 * Coquille de modale, partagée. Vanilla, aucune dépendance.
 *
 * **Ce fichier ne contient pas une nouvelle modale : il contient celle du
 * lot 7, déplacée.** Elle vivait dans `parcours.js`, privée de son IIFE, et
 * cette IIFE *sort avant de la définir* quand la fiche n'a ni formule ni
 * panneau — or une fiche sans formule a quand même des photos. La galerie du
 * lot photo ne pouvait donc pas l'atteindre, et PO-23 dit « ne pas en écrire
 * une seconde ». Elle est ici, elle est unique, et les deux écrans la lisent.
 *
 * Comportement non négociable (SPEC.md §5.3), repris du composant Modal de
 * l'export :
 *  - fermeture par Échap et par clic sur le fond ;
 *  - défilement de la page bloqué ;
 *  - focus placé dans la modale à l'ouverture ;
 *  - focus piégé tant qu'elle est ouverte ;
 *  - focus rendu à l'élément d'origine à la fermeture.
 *
 * Une seule modale est ouverte à la fois : passer d'un écran au suivant ferme
 * la précédente avant d'ouvrir la suivante.
 *
 * **Une seule chose a été ajoutée au corps déplacé**, `opts.classe`, sans
 * effet quand elle est absente : la galerie a besoin d'un fond onyx là où le
 * parcours veut une boîte ivoire. Tout le reste est identique au caractère
 * près, y compris les deux pièges de `focusables()` documentés plus bas, qui
 * ont été trouvés au clavier et non à la lecture.
 */
(function () {
  'use strict';

  var D4R = (window.D4R = window.D4R || {});
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, classe, texte) {
    var n = document.createElement(tag);
    if (classe) { n.className = classe; }
    if (texte !== undefined && texte !== null) { n.textContent = texte; }
    return n;
  }

  var modaleActive = null;

  function ouvrirModale(opts) {
    fermerModale(false);

    var origine = document.activeElement;
    var fond = el('div', 'modale' + (opts.classe ? ' ' + opts.classe : ''));
    var boite = el('div', 'modale__boite');
    boite.setAttribute('role', 'dialog');
    boite.setAttribute('aria-modal', 'true');
    boite.tabIndex = -1;

    var idTitre = 'modale-titre-' + Math.random().toString(36).slice(2, 8);
    var tete = el('div', 'modale__tete');
    var titre = el('h2', 'modale__titre', opts.titre);
    titre.id = idTitre;
    boite.setAttribute('aria-labelledby', idTitre);

    var fermeture = el('button', 'modale__fermer');
    fermeture.type = 'button';
    fermeture.setAttribute('aria-label', 'Fermer');
    var croix = document.createElementNS(SVG_NS, 'svg');
    croix.setAttribute('viewBox', '0 0 12 12');
    croix.setAttribute('aria-hidden', 'true');
    var trace = document.createElementNS(SVG_NS, 'path');
    trace.setAttribute('d', 'M1 1 L11 11 M11 1 L1 11');
    trace.setAttribute('stroke', 'currentColor');
    trace.setAttribute('fill', 'none');
    croix.appendChild(trace);
    fermeture.appendChild(croix);

    tete.appendChild(titre);
    tete.appendChild(fermeture);
    boite.appendChild(tete);

    var corps = el('div', 'modale__corps');
    corps.appendChild(opts.corps);
    boite.appendChild(corps);

    if (opts.pied) {
      var pied = el('div', 'modale__pied');
      pied.appendChild(opts.pied);
      boite.appendChild(pied);
    }

    fond.appendChild(boite);

    /**
     * Éléments réellement atteignables au clavier dans la modale.
     *
     * Deux pièges, tous deux constatés au clavier et non à la lecture :
     *
     * - `a[href]` et non `[href]`. Le sélecteur large capturait les
     *   `<use href="#d4r-quad">` des icônes du sprite, qui sont des éléments
     *   SVG et non des liens. Le « dernier élément focalisable » devenait
     *   alors un `<use>`, jamais le bouton : la boucle de tabulation ne se
     *   déclenchait pas et le focus s'échappait dans la page derrière.
     *
     * - `getClientRects()` et non `offsetParent`. Sur un élément SVG,
     *   `offsetParent` vaut `undefined` et non `null` — le test
     *   `!== null` était donc vrai pour eux, ce qui les gardait dans la
     *   liste. `getClientRects()` répond sur tous les éléments et dit ce
     *   qu'on veut vraiment savoir : l'élément occupe-t-il une boîte à
     *   l'écran.
     */
    function focusables() {
      return Array.prototype.filter.call(
        boite.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        function (n) { return !n.disabled && n.getClientRects().length > 0; }
      );
    }

    function surTouche(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        fermerModale(true);
        if (opts.surFermeture) { opts.surFermeture(); }
        return;
      }
      // Touches propres à l'écran ouvert (les flèches de la galerie). Rendues
      // ici parce que le gestionnaire de la modale est posé en capture sur le
      // document : un second écouteur ailleurs verrait les touches après lui,
      // ou pas du tout.
      if (opts.surTouche && opts.surTouche(e)) { return; }
      if (e.key !== 'Tab') { return; }
      var liste = focusables();
      if (!liste.length) {
        // Aucun élément focalisable : le focus reste sur la boîte, il ne part
        // pas dans la page derrière.
        e.preventDefault();
        boite.focus();
        return;
      }
      var premier = liste[0];
      var dernier = liste[liste.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      } else if (!boite.contains(document.activeElement)) {
        // Filet de sécurité : si le focus a été perdu hors de la modale
        // (élément retiré du DOM, clic sur le fond), il y revient.
        e.preventDefault();
        premier.focus();
      }
    }

    // `mousedown` et non `click` : un clic commencé dans la boîte et relâché
    // sur le fond (sélection de texte tirée trop loin) ne doit pas fermer.
    fond.addEventListener('mousedown', function (e) {
      if (e.target === fond) {
        fermerModale(true);
        if (opts.surFermeture) { opts.surFermeture(); }
      }
    });
    fermeture.addEventListener('click', function () {
      fermerModale(true);
      if (opts.surFermeture) { opts.surFermeture(); }
    });
    document.addEventListener('keydown', surTouche, true);

    var defilementInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(fond);

    modaleActive = {
      fond: fond,
      origine: origine,
      surTouche: surTouche,
      defilementInitial: defilementInitial
    };

    var liste = focusables();
    (liste.length ? liste[0] : boite).focus();
  }

  /**
   * @param rendreFocus true à la fermeture demandée par l'utilisateur (Échap,
   *        fond, croix) ; false quand un autre écran prend la suite et
   *        placera lui-même le focus — sans quoi le focus reviendrait sur le
   *        bouton d'origine avant de repartir, ce qui se voit et s'entend.
   */
  function fermerModale(rendreFocus) {
    if (!modaleActive) { return; }
    var m = modaleActive;
    modaleActive = null;
    document.removeEventListener('keydown', m.surTouche, true);
    document.body.style.overflow = m.defilementInitial;
    m.fond.remove();
    if (rendreFocus && m.origine && m.origine.focus) {
      m.origine.focus();
    }
  }

  D4R.el = el;
  D4R.SVG_NS = SVG_NS;
  D4R.ouvrirModale = ouvrirModale;
  D4R.fermerModale = fermerModale;
})();
