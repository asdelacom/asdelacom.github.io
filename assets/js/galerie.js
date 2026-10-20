/**
 * Galerie photo de la fiche (PO-23). Vanilla, aucune dépendance.
 *
 * La piste de photos est servie par PHP et **elle défile sans ce fichier** :
 * c'est un conteneur `overflow-x: auto` avec `scroll-snap`, qui se balaie au
 * doigt et se parcourt à la tabulation. Ce fichier ajoute trois choses, et
 * aucune n'est indispensable à la lecture de la page :
 *
 *  1. **les deux flèches**, câblées par `defileur.js` — le même composant que
 *     les bandes de l'accueil, lu et non recopié ;
 *  2. **le réveil des photos voisines** au fil du balayage, pour qu'une photo
 *     ne soit jamais attendue sous le doigt ;
 *  3. **la visionneuse**, ouverte au clic sur une photo.
 *
 * **La coquille de modale n'est pas réécrite ici** : c'est celle du lot 7,
 * déplacée dans modale.js, qui porte déjà Échap, le clic sur le fond, le
 * défilement bloqué, le piège de focus et le retour du focus à l'élément
 * d'origine. PO-23 disait « ne pas en écrire une seconde ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE POIDS, ET CE QUE LE LOT L4 Y CHANGE.
 *
 * Avant : la page chargeait les **trois** cadres de la mosaïque, les autres
 * photos vivant dans une section masquée en `display: none`, donc jamais
 * demandée. Maintenant : la piste porte toutes les photos, **une seule est
 * dans le champ**, et les suivantes portent `loading="lazy"` — une vue rognée
 * par son conteneur n'est pas demandée. *La page charge donc UNE image au
 * lieu de trois, mesuré.*
 *
 * Le réveil ci-dessous est la contrepartie : arriver sur une photo vide serait
 * payer le poids par de l'attente. Il ne réveille qu'une voisine de chaque
 * côté — jamais la liste entière — exactement comme `precharger()` le fait
 * dans la visionneuse.
 * ─────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  var galerie = document.querySelector('[data-galerie]');
  var piste = galerie ? galerie.querySelector('[data-defileur-piste]') : null;

  if (!piste || !window.D4R) {
    return;
  }

  var el = window.D4R.el;
  var SVG_NS = window.D4R.SVG_NS;

  /* Les flèches, câblées par le composant partagé. Il sort de lui-même quand
     la fiche n'a qu'une photo : PHP n'écrit alors aucune commande. */
  if (window.D4R.defileur) {
    window.D4R.defileur(galerie);
  }

  /**
   * La liste des photos, lue dans le document et non transportée une seconde
   * fois en JSON : les URL y sont déjà, les recopier dans un îlot les ferait
   * exister deux fois dans la page — plus d'octets, et deux sources à tenir
   * d'accord (PO-12).
   *
   * **La piste fait foi, et elle est désormais la seule source.** Elle porte
   * les N photos depuis le lot L4 ; la section de repli `#galerie-complete`,
   * qui les portait avant elle, n'a plus d'objet et n'est plus rendue.
   *
   * Chaque entrée porte trois choses : l'URL, le `srcset` et le texte de
   * remplacement. Les trois sont lus sur les `<img>` du document, jamais sur
   * l'attribut `href` du lien — c'est ce qui permet à la visionneuse de
   * reprendre le texte saisi dans l'admin (PO-24) et de demander une vignette
   * de 400 px là où elle affiche 84 px de large, au lieu du fichier pleine
   * taille (PO-56).
   *
   * `getAttribute('src')` et non `img.src` : l'attribut existe sur une image
   * `lazy` que le navigateur n'a pas encore demandée, et c'est le cas de
   * toutes les vues sauf la première.
   */
  var vues = piste.querySelectorAll('a.gallery__frame img');

  function photos() {
    return Array.prototype.map.call(vues, function (img) {
      return {
        src: img.getAttribute('src'),
        srcset: img.getAttribute('srcset') || '',
        alt: img.getAttribute('alt') || ''
      };
    }).filter(function (p) { return p.src; });
  }

  /**
   * Pose une photo sur un `<img>`, `srcset` et `sizes` d'abord.
   *
   * L'ordre compte : `src` posé en premier fait partir la requête avant que le
   * navigateur ne sache quelle taille il lui faut, et il télécharge alors le
   * fichier pleine taille pour rien.
   */
  function poser(img, photo, sizes, alt) {
    if (photo.srcset) {
      img.setAttribute('sizes', sizes);
      img.setAttribute('srcset', photo.srcset);
    } else {
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
    }
    img.src = photo.src;
    img.alt = alt;
  }

  var liste = photos();
  if (!liste.length) {
    return;
  }

  /* ─────────────────────────────────────── le réveil des vues voisines ──── */

  /**
   * Fait demander une vue restée `lazy`.
   *
   * **Passer `loading` à `eager` suffit, et c'est le seul geste** : le
   * navigateur relit l'attribut et lance la requête. Rien n'est recopié, aucun
   * `Image()` fantôme n'est créé — l'élément qui affichera la photo est celui
   * qui la demande, donc il n'y a jamais deux téléchargements pour une vue.
   *
   * Idempotent : une vue déjà réveillée n'est pas retouchée.
   */
  function reveiller(i) {
    if (i < 0 || i >= vues.length) { return; }
    if (vues[i].getAttribute('loading') === 'lazy') {
      vues[i].setAttribute('loading', 'eager');
    }
  }

  /**
   * L'index de la vue en place, déduit de la position de la piste.
   *
   * **La garde sur `clientWidth` n'est pas de la prudence de principe** : un
   * conteneur non peint rend 0, et la division donnerait `Infinity`. C'est la
   * même garde que `deborde()` dans `defileur.js`, et le même défaut de poste.
   */
  function vueEnPlace() {
    if (piste.clientWidth <= 0) { return 0; }
    /* **Lot L5b (PO-196) : on divise par l'écart entre deux vues, plus par la
       largeur de la piste.** Depuis l'amorce, une vue est plus étroite que la
       piste de 32 px, et la division par `clientWidth` aurait marqué le point
       précédent dès la troisième photo. Le pas vient de `defileur.js`, chargé
       avant ce fichier (`defer` garde l'ordre) : une seule mesure pour les
       flèches et pour les points.

       **Au bout de la piste, c'est la dernière vue**, quelle que soit la
       division : elle s'y cale à droite, et son `scrollLeft` est plus court
       d'une amorce que son rang ne le dirait. */
    var u = window.D4R && window.D4R.pasUnitaire ? window.D4R.pasUnitaire(piste) : piste.clientWidth;
    if (u <= 0) { return 0; }
    var max = piste.scrollWidth - piste.clientWidth;
    if (max > 0 && piste.scrollLeft >= max - 2) {
      return piste.children.length - 1;
    }
    return Math.round(piste.scrollLeft / u);
  }

  function reveillerAutour() {
    var i = vueEnPlace();
    reveiller(i);
    reveiller(i + 1);
    reveiller(i - 1);
  }

  /* ──────────────────────────────────────── les points de position ──────── */

  /**
   * L4 bis — **le seul signal qui dise au doigt qu'il y a quelque chose à faire
   * glisser.** Demande du client du 2026-09-22 : il a cru qu'il fallait cliquer,
   * à cause des flèches, qui disparaissent au même moment sous 640 px.
   *
   * **C'est le script qui les montre, et ce n'est pas la garde de principe
   * habituelle.** Ailleurs, un contrôle rendu `hidden` par PHP est simplement
   * inutile sans JavaScript. Ici il serait **faux** : le premier point resterait
   * marqué pendant que le visiteur balaie. *Une flèche absente manque ; un
   * indicateur figé ment.*
   *
   * La CSS ne les montre que sous 640 px — le script retire `hidden`, elle
   * décide du reste. Rien ne change sur ordinateur.
   */
  var points = galerie.querySelector('[data-galerie-points]');
  var pastilles = points ? points.querySelectorAll('.gallery__point') : [];
  var pointCourant = 0;

  function marquerPoint() {
    if (!pastilles.length) { return; }
    var i = vueEnPlace();
    if (i === pointCourant || i < 0 || i >= pastilles.length) { return; }
    pastilles[pointCourant].classList.remove('is-courant');
    pastilles[i].classList.add('is-courant');
    pointCourant = i;
  }

  if (points) {
    points.hidden = false;
  }

  function surDefilement() {
    reveillerAutour();
    marquerPoint();
  }

  piste.addEventListener('scroll', surDefilement);
  surDefilement();

  var nom = document.querySelector('.fiche__title');
  var titre = nom ? nom.textContent.trim() : 'Photos';

  /* ------------------------------------------------------------ visionneuse */

  function fleche(direction) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true');
    var trace = document.createElementNS(SVG_NS, 'path');
    // Un chevron, tracé comme la croix de fermeture de la coquille : une forme
    // neutre, pas un pictogramme. Le sprite est une liste fermée et aucune
    // icône ne doit lui être ajoutée (CLAUDE.md).
    trace.setAttribute('d', direction < 0 ? 'M8 1 L3 6 L8 11' : 'M4 1 L9 6 L4 11');
    trace.setAttribute('stroke', 'currentColor');
    trace.setAttribute('fill', 'none');
    svg.appendChild(trace);
    return svg;
  }

  function ouvrir(depart) {
    var index = depart;
    var cadre = el('div', 'galerie-vue');

    // Seule touche d'or de l'écran ouvert. Valide sur onyx (7,93:1), où l'or
    // est une couleur de texte autorisée — contrairement au fond clair.
    // **En tête et non en pied depuis le lot cartes** : c'est le premier
    // renseignement que le visiteur cherche en ouvrant une photo — combien y
    // en a-t-il, et où suis-je — et il le trouvait sous l'image, donc après
    // l'avoir regardée.
    var compteur = el('p', 'galerie-vue__compteur');
    compteur.setAttribute('aria-live', 'polite');

    var scene = el('div', 'galerie-vue__scene');
    var img = el('img', 'galerie-vue__img');
    // `alt` reprend le texte saisi dans l'admin (PO-24, fermé au lot 9-B).
    // C'est ici qu'il compte le plus : la photo occupe l'écran, elle EST le
    // contenu, et un alt vide la déclarerait décorative.
    img.alt = '';
    scene.appendChild(img);

    /* Largeur d'affichage de la grande image. **C'est la HAUTEUR de la fenêtre
       qui la décide, pas sa largeur**, et s'y tromper coûte cher : le panneau
       fait au moins 800 px de large, mais la photo y est plafonnée par
       `--galerie-photo-h` (`min(64vh, 100vh - 342px)`) et affichée en
       `contain`. Une photo en 3:2 fait donc au plus 96vh de large — 567 px
       mesurés dans une fenêtre de 720 px de haut, où un `sizes` en pixels fixes
       annonçait 1 320 et faisait télécharger le maître de 389 Ko à la place du
       dérivé de 114.

       L'expression reprend `--galerie-photo-h` multipliée par 3/2 :
       64vh × 1,5 = 96vh, et (100vh − 342px) × 1,5 = 150vh − 513px. **C'est une
       duplication du token, et elle est assumée** — `sizes` est lu par le
       navigateur avant que la mise en page existe, il ne peut donc pas la
       mesurer. Le commentaire de `--galerie-photo-h` renvoie ici en retour :
       les deux se modifient ensemble ou pas du tout.

       Généreux pour un portrait, qui sera plus étroit : dans ce sens l'erreur
       ne coûte que des octets, dans l'autre elle coûte de la netteté. Si un
       navigateur ne sait pas lire `min()` dans `sizes`, l'attribut entier est
       ignoré et vaut 100vw : il téléchargera trop, jamais trop peu. */
    var SIZES_GRANDE = '(max-width: 767px) 100vw, min(96vh, 150vh - 513px)';
    // Une vignette de bande fait 84 px de large, 66 sur les fenêtres étroites.
    var SIZES_VIGNETTE = '84px';

    cadre.appendChild(compteur);
    cadre.appendChild(scene);

    /**
     * Fermeture au clic en dehors de l'image.
     *
     * La coquille ferme déjà au clic sur le fond, mais la variante photo étire
     * sa boîte sur tout l'écran : il n'y a plus un pixel de fond à atteindre, et
     * le geste ne marchait donc que sur les autres modales. Le vide autour de la
     * photo reprend ce rôle.
     *
     * Bornée au cadre et à la scène, jamais à tout ce qui n'est pas l'image : le
     * compteur, les flèches et les vignettes sont eux aussi « en dehors de
     * l'image », et fermer sous le doigt qui vise une vignette serait le
     * contraire de ce qui est demandé. La croix reste, elle n'a pas bougé.
     *
     * `mousedown` comme la coquille : un clic commencé sur l'image et relâché à
     * côté ne ferme pas.
     */
    cadre.addEventListener('mousedown', function (e) {
      if (e.target === cadre || e.target === scene) {
        window.D4R.fermerModale(true);
      }
    });

    /**
     * Les deux flèches encadrent la GRANDE PHOTO, à mi-hauteur, et non plus la
     * bande de vignettes. En pied, elles étaient ambiguës : rien ne disait si
     * elles changeaient de photo ou faisaient défiler les vignettes. Posées de
     * part et d'autre de l'image, elles ne peuvent plus désigner qu'elle.
     *
     * Elles vivent donc dans la scène, en position absolue — voir la CSS, qui
     * explique pourquoi le panneau leur réserve malgré tout leur largeur.
     */
    var barre = el('div', 'galerie-vue__barre');
    var precedent = el('button', 'galerie-vue__nav galerie-vue__nav--prec');
    precedent.type = 'button';
    precedent.setAttribute('aria-label', 'Voir la photo précédente');
    precedent.appendChild(fleche(-1));
    var suivant = el('button', 'galerie-vue__nav galerie-vue__nav--suiv');
    suivant.type = 'button';
    suivant.setAttribute('aria-label', 'Voir la photo suivante');
    suivant.appendChild(fleche(1));

    /**
     * Bande de vignettes. **Rien en dessous de deux photos** : une vignette
     * unique serait un contrôle mort, même règle que les flèches désactivées
     * juste au-dessus et que l'écran 1 du parcours sauté sur une formule unique.
     *
     * La vignette courante est marquée par un filet ivoire et par l'opacité
     * pleine, les autres étant à demi éteintes : une forme et une luminance, pas
     * une couleur seule. Un filet d'or aurait fait une seconde touche sur un
     * écran qui n'en porte qu'une, le compteur.
     */
    var vignettes = [];
    var bande = null;
    if (liste.length > 1) {
      bande = el('div', 'galerie-vue__bande');
      liste.forEach(function (photo, i) {
        var bouton = el('button', 'galerie-vue__vignette');
        bouton.type = 'button';
        bouton.setAttribute('aria-label', 'Voir la photo ' + (i + 1));
        var vue = el('img', 'galerie-vue__vignette-img');
        // alt vide, volontairement : le bouton qui la porte a déjà son
        // aria-label, et le texte de remplacement de la photo est annoncé sur
        // la grande image. Le répéter ferait lire deux fois la même chose.
        poser(vue, photo, SIZES_VIGNETTE, '');
        vue.loading = 'lazy';
        vue.decoding = 'async';
        bouton.appendChild(vue);
        bouton.addEventListener('click', function () { allerA(i); });
        bande.appendChild(bouton);
        vignettes.push(bouton);
      });
    }

    /**
     * **Rien de tout cela sur une fiche à photo unique.** Les deux flèches
     * seraient mortes et le pied se réduirait à un filet surmontant du vide —
     * c'est ce qui serait arrivé en déplaçant les flèches hors du pied sans y
     * penser. Même règle que la bande, que les flèches désactivées et que
     * l'écran 1 du parcours sauté sur une formule unique : un contrôle à une
     * seule issue ne se rend pas.
     */
    if (bande) {
      scene.appendChild(precedent);
      scene.appendChild(suivant);
      barre.appendChild(bande);
    }

    /** Précharge une voisine, et rien d'autre : c'est tout le dispositif de
     *  poids sur la GRANDE image. Huit photos ne sont jamais demandées ensemble
     *  en pleine taille.
     *
     *  `srcset` et `sizes` sont posés ici aussi, sans quoi le préchargement
     *  demanderait un autre fichier que celui que l'affichage retiendra : deux
     *  téléchargements pour une seule photo, l'inverse du but. */
    function precharger(i) {
      if (i < 0 || i >= liste.length) { return; }
      poser(new Image(), liste[i], SIZES_GRANDE, '');
    }

    // `centrerVignette()` a disparu au lot bande, et ce n'est pas un oubli : la
    // bande ne défile plus — elle rétrécit ses vignettes puis passe à la ligne —
    // donc il n'y a plus rien à ramener dans le champ. La fonction aurait
    // survécu en ne faisant rien, et un `scrollIntoView` sans conteneur
    // défilant remonte chercher un ancêtre qui l'est.

    function peindre() {
      poser(img, liste[index], SIZES_GRANDE, liste[index].alt);
      compteur.textContent = (index + 1) + ' / ' + liste.length;
      vignettes.forEach(function (b, i) {
        if (i === index) {
          b.classList.add('is-courante');
          b.setAttribute('aria-current', 'true');
        } else {
          b.classList.remove('is-courante');
          b.removeAttribute('aria-current');
        }
      });
      precharger(index + 1);
      precharger(index - 1);
    }

    function allerA(i) {
      if (i === index || i < 0 || i >= liste.length) { return; }
      index = i;
      peindre();
    }

    function aller(pas) {
      if (liste.length < 2) { return; }
      // Circulaire : depuis la dernière, « suivante » revient à la première.
      index = (index + pas + liste.length) % liste.length;
      peindre();
    }

    precedent.addEventListener('click', function () { aller(-1); });
    suivant.addEventListener('click', function () { aller(1); });

    /**
     * LE GLISSEMENT AU DOIGT DANS LA VISIONNEUSE.
     *
     * Demandé par le client au lot L4 : « glisser sur téléphone ». La piste de
     * la fiche se balaie nativement, parce qu'elle est un conteneur de
     * défilement ; la visionneuse, elle, n'affiche qu'une image et n'en est
     * pas un — le geste devait donc être écrit.
     *
     * **Deux gardes, et chacune répare un faux positif de ce geste** :
     *
     *  - le déplacement horizontal doit dépasser `SEUIL_GLISSEMENT`. Sans lui,
     *    un simple appui — dont le doigt bouge toujours de deux ou trois
     *    pixels — changerait de photo au lieu de ne rien faire ;
     *  - il doit être **plus grand que le déplacement vertical**. Sans cette
     *    comparaison, un geste de défilement vertical fait en diagonale
     *    changerait de photo.
     *
     * `passive: true` sur les deux écouteurs : ce code n'appelle jamais
     * `preventDefault()`, et le déclarer évite que le navigateur retarde le
     * défilement en attendant de savoir.
     *
     * **NON ÉPROUVÉ SUR CE POSTE** : le pointeur de l'outil de vérification
     * n'émet pas d'événements tactiles. Le code est lu, pas mesuré — c'est
     * écrit tel quel dans le rapport du lot, et c'est au téléphone du client
     * de le confirmer.
     */
    var SEUIL_GLISSEMENT = 44; /* la cible tactile du projet, --touch-min : en
                                  dessous, ce n'est plus un glissement mais la
                                  dérive d'un appui. */
    var depart = null;

    scene.addEventListener('touchstart', function (e) {
      depart = e.touches.length === 1
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : null;
    }, { passive: true });

    scene.addEventListener('touchend', function (e) {
      if (!depart || !e.changedTouches.length) { depart = null; return; }
      var dx = e.changedTouches[0].clientX - depart.x;
      var dy = e.changedTouches[0].clientY - depart.y;
      depart = null;
      if (Math.abs(dx) < SEUIL_GLISSEMENT || Math.abs(dx) <= Math.abs(dy)) { return; }
      // Le sens naturel : on tire la photo vers la gauche pour voir la
      // suivante, comme la piste de la fiche.
      aller(dx < 0 ? 1 : -1);
    }, { passive: true });

    peindre();

    window.D4R.ouvrirModale({
      titre: titre,
      classe: 'modale--photo',
      corps: cadre,
      // `null` sur une photo unique : la coquille ne rend alors aucun pied, là
      // où un pied vide n'aurait montré qu'un filet au-dessus du néant.
      pied: bande ? barre : null,
      // Les flèches sont rendues par la coquille, qui écoute en capture sur le
      // document : un second écouteur ici les verrait après elle, ou pas du
      // tout. Rendre `true` dit à la coquille que la touche est consommée.
      surTouche: function (e) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); aller(-1); return true; }
        if (e.key === 'ArrowRight') { e.preventDefault(); aller(1); return true; }
        return false;
      }
    });
  }

  /* ---------------------------------------------------------------- amorçage */

  Array.prototype.forEach.call(
    piste.querySelectorAll('a.gallery__frame'),
    function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var i = parseInt(a.getAttribute('data-galerie-index'), 10);
        ouvrir(isNaN(i) ? 0 : i);
      });
    }
  );
})();
