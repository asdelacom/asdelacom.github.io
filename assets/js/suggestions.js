/**
 * Suggestions instantanées sous le champ de recherche (SPEC.md §3 bis).
 * Vanilla, sans dépendance ni compilation, comme tout le JavaScript du site.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER N'EST PAS : un remplacement de la recherche.
 *
 * Le formulaire GET de `/recherche` reste la voie de repli et **fonctionne
 * seul**. Ce script est un enrichissement posé par-dessus : sans lui, sans
 * JavaScript, ou si l'îlot de données manque, le champ et son bouton
 * « Chercher » se comportent exactement comme avant. Rien ici n'est un passage
 * obligé.
 *
 * ARCHITECTURE : l'index est envoyé une fois avec la page, jamais interrogé.
 * Aucune requête réseau, donc aucune temporisation, aucune annulation de
 * requête en vol, aucun ordre d'arrivée à gérer — les trois défauts classiques
 * de ce composant n'existent pas ici. Le chiffrage est en SUIVI.md (PO-87).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COUPLAGE À CONNAÎTRE AVANT DE TOUCHER À `classer()`
 *
 * Le classement à cinq rangs ci-dessous est **le même que celui de
 * `searchProducts()`** (includes/products.php). Les deux doivent changer
 * ensemble, sans quoi la liste des suggestions et la page de résultats se
 * contrediraient — le visiteur verrait une fiche proposée en tête disparaître
 * de la page qu'il vient d'ouvrir.
 *
 * Cette duplication est **la contrepartie assumée de l'architecture** : le
 * serveur ne connaît pas la saisie, il ne peut donc pas classer à sa place.
 * Ce qui a été évité, en revanche, c'est la duplication des *données* : la
 * normalisation des entrées est faite par `searchNormalize()` côté PHP, et la
 * carte de translittération voyage avec l'index. Seul l'algorithme est écrit
 * deux fois, et il tient en cinq lignes de chaque côté.
 */
(function () {
  'use strict';

  var ilot = document.querySelector('[data-suggest-data]');
  var champs = [].slice.call(document.querySelectorAll('[data-suggest]'));
  if (!ilot || !champs.length) { return; }

  var data;
  try {
    data = JSON.parse(ilot.textContent);
  } catch (e) {
    return; // index illisible : le formulaire GET reste entier
  }
  if (!data || !Array.isArray(data.fiches) || !data.fiches.length) { return; }

  var MAX = data.maximum || 6;
  var TRANSLIT = data.translit || {};
  // Respiration sous le panneau, pour qu'il ne colle pas au bord de l'écran.
  var MARGE_BAS = 16;
  // Plancher : sur un téléphone en paysage, l'espace sous le champ peut tomber
  // à quelques dizaines de pixels. En dessous de deux lignes le panneau ne
  // montre plus rien d'utile ; il vaut mieux qu'il dépasse un peu que de le
  // réduire à une fente.
  var MARGE_MIN = 160;

  /* Même algorithme que `searchNormalize()` (includes/products.php), et **la
     même carte**, reçue avec l'index plutôt que recopiée ici : elle traite des
     cas qu'aucune normalisation Unicode standard ne couvre — `æ` → `ae`,
     `œ` → `oe`, `ß` → `ss`. */
  function normaliser(texte) {
    var s = String(texte).toLowerCase();
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      out += Object.prototype.hasOwnProperty.call(TRANSLIT, c) ? TRANSLIT[c] : c;
    }
    return out.replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /* Les cinq rangs de `searchProducts()`, dans le même ordre : un nom qui
     commence par la saisie passe devant une catégorie, qui passe devant une
     mention au milieu d'une description. `null` = la fiche ne correspond pas. */
  function rang(fiche, aiguille) {
    if (fiche.kn.indexOf(aiguille) === 0) { return 0; }
    if (fiche.kc.indexOf(aiguille) === 0) { return 1; }
    if (fiche.kn.indexOf(aiguille) !== -1) { return 2; }
    if (fiche.kc.indexOf(aiguille) !== -1) { return 3; }
    if (fiche.kd.indexOf(aiguille) !== -1) { return 4; }
    return null;
  }

  function classer(aiguille) {
    var notes = [];
    for (var i = 0; i < data.fiches.length; i++) {
      var r = rang(data.fiches[i], aiguille);
      if (r !== null) { notes.push({ r: r, i: i, f: data.fiches[i] }); }
    }
    // `i` départage à rang égal : l'index arrive déjà trié par sort_order, donc
    // l'ordre que le client règle depuis l'admin. Deux frappes identiques
    // rendent toujours la même liste.
    notes.sort(function (a, b) { return a.r - b.r || a.i - b.i; });
    return notes.slice(0, MAX).map(function (x) { return x.f; });
  }

  function el(tag, classe, texte) {
    var n = document.createElement(tag);
    if (classe) { n.className = classe; }
    if (texte !== undefined && texte !== null) { n.textContent = texte; }
    return n;
  }

  /**
   * Cadre de vignette d'une suggestion. **Il n'est jamais vide.**
   *
   * Trois états, dans cet ordre : la photo si la fiche en a une ; à défaut le
   * glyphe de sa catégorie ; à défaut le filet neutre. **Le troisième cas n'est
   * pas une erreur mais le traitement prévu par la charte** pour une catégorie
   * sans icône — la liste du sprite est fermée, et en créer une est interdit.
   *
   * C'est le défaut de PO-59 qu'on évite ici : dans le parcours de réservation,
   * `glyphe()` rendait `null` et laissait un carré bordé **sans aucun enfant**,
   * qui se lit comme une image cassée. Un filet neutre se lit comme une place
   * réservée — ce qu'elle est, tant que le client n'a pas fourni ses photos
   * (PO-15 : 8 fiches sur 31, dont 7 sans glyphe de catégorie).
   *
   * L'image porte `alt=""` : le nom de la fiche est à quelques pixels, sur la
   * même ligne, et un lecteur d'écran l'annoncerait deux fois. Même règle que
   * les cartes de grille.
   */
  function vignette(f) {
    var cadre = el('span', 'suggest__vignette');

    if (f.i) {
      var img = document.createElement('img');
      img.className = 'suggest__img';
      img.src = f.i;
      img.alt = '';
      // Une photo retirée du disque ne doit pas laisser un cadre cassé : on
      // retombe alors sur le repli, comme le fait `render_product_card()`.
      img.addEventListener('error', function () {
        img.remove();
        cadre.appendChild(replinutile(f));
      });
      cadre.appendChild(img);
      return cadre;
    }

    cadre.appendChild(replinutile(f));
    return cadre;
  }

  /** Glyphe de catégorie, ou filet neutre. Jamais rien. */
  function replinutile(f) {
    if (f.g) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icone suggest__glyphe');
      svg.setAttribute('aria-hidden', 'true');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#' + f.g);
      svg.appendChild(use);
      return svg;
    }
    var filet = el('span', 'rule-neutral suggest__filet');
    filet.setAttribute('aria-hidden', 'true');
    return filet;
  }

  function brancher(champ) {
    var liste = document.getElementById(champ.getAttribute('data-suggest'));
    if (!liste) { return; }
    var form = champ.form;
    var statut = form ? form.querySelector('[role="status"]') : null;
    var resultats = [];
    var actif = -1;

    /* Le champ n'est annoncé « liste déroulante » qu'ici, une fois le script en
       place : servi tel quel dans le document, il aurait promis à un lecteur
       d'écran une liste que rien ne pouvait ouvrir. */
    champ.setAttribute('role', 'combobox');
    champ.setAttribute('aria-expanded', 'false');
    champ.setAttribute('aria-controls', liste.id);
    champ.setAttribute('aria-autocomplete', 'list');

    /* Le panneau ne dépasse jamais le bas de la fenêtre.
       ─────────────────────────────────────────────────────────────────────
       **Le plafond de la CSS ne peut pas suffire, et c'est mesuré** : six
       lignes réclament 512px, or l'espace sous le champ vaut 478px sur
       `/recherche` et 380 sur l'accueil, dans une fenêtre de 800. Une valeur
       fixe, même bornée en `vh`, ignore *où* le champ se trouve — et il ne se
       trouve pas au même endroit sur les deux pages.

       La hauteur est donc reprise à chaque ouverture depuis l'espace
       réellement disponible. Ce qui ne tient pas se rejoint aux flèches, qui
       amènent la ligne retenue dans la vue (`scrollIntoView`), ou en faisant
       défiler le panneau. **Aucune suggestion n'est perdue ; ce qui est évité,
       c'est un panneau dont le bas est hors de l'écran**, que rien ne signale.

       `--suggest-max-h` reste la borne haute : le panneau ne grandit pas
       au-delà même sur un grand écran. */
    function borner() {
      var espace = window.innerHeight - champ.getBoundingClientRect().bottom - MARGE_BAS;
      liste.style.maxHeight = Math.max(MARGE_MIN, espace) + 'px';
    }

    function fermer() {
      liste.style.maxHeight = '';
      liste.hidden = true;
      liste.textContent = '';
      champ.setAttribute('aria-expanded', 'false');
      champ.removeAttribute('aria-activedescendant');
      resultats = [];
      actif = -1;
    }

    function peindreActif() {
      var options = liste.children;
      for (var i = 0; i < options.length; i++) {
        var estActif = (i === actif);
        options[i].classList.toggle('is-actif', estActif);
        options[i].setAttribute('aria-selected', estActif ? 'true' : 'false');
      }
      if (actif >= 0 && options[actif]) {
        champ.setAttribute('aria-activedescendant', options[actif].id);
        // Le focus **ne bouge pas** : il reste dans le champ, la sélection se
        // déplace par `aria-activedescendant`. C'est ce qui permet de continuer
        // à taper pendant qu'on parcourt la liste.
        if (options[actif].scrollIntoView) {
          options[actif].scrollIntoView({ block: 'nearest' });
        }
      } else {
        champ.removeAttribute('aria-activedescendant');
      }
    }

    function ouvrir(fiches) {
      liste.textContent = '';
      fiches.forEach(function (f, i) {
        var li = el('li', 'suggest__item');
        li.id = liste.id + '-opt-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');

        li.appendChild(vignette(f));

        var texte = el('div', 'suggest__texte');
        texte.appendChild(el('span', 'suggest__nom', f.n));
        var bas = el('span', 'suggest__meta');
        if (f.c) { bas.appendChild(el('span', 'suggest__cat', f.c)); }
        if (f.p) { bas.appendChild(el('span', 'suggest__prix', f.p)); }
        if (bas.childNodes.length) { texte.appendChild(bas); }
        li.appendChild(texte);

        // `mousedown` et non `click` : le `blur` du champ part avant le `click`
        // et refermerait la liste sous le pointeur.
        li.addEventListener('mousedown', function (e) {
          e.preventDefault();
          aller(i);
        });
        liste.appendChild(li);
      });
      resultats = fiches;
      actif = -1;
      liste.hidden = false;
      champ.setAttribute('aria-expanded', 'true');
      borner();
      peindreActif();
      if (statut) {
        statut.textContent = fiches.length > 1
          ? fiches.length + ' suggestions disponibles.'
          : '1 suggestion disponible.';
      }
    }

    function aller(i) {
      if (resultats[i]) { window.location.href = resultats[i].h; }
    }

    function rafraichir() {
      var aiguille = normaliser(champ.value);
      if (aiguille === '') { fermer(); if (statut) { statut.textContent = ''; } return; }
      var trouves = classer(aiguille);
      if (!trouves.length) {
        fermer();
        // Aucune suggestion n'est **pas** une impasse : le formulaire mène à la
        // page de résultats, qui sait dire « aucun résultat » et proposer les
        // sections non vides. On n'affiche donc pas de liste vide.
        if (statut) { statut.textContent = 'Aucune suggestion.'; }
        return;
      }
      ouvrir(trouves);
    }

    champ.addEventListener('input', rafraichir);

    champ.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (liste.hidden) {
          if (e.key === 'ArrowDown') { rafraichir(); }
          e.preventDefault();
          return;
        }
        e.preventDefault();
        var n = liste.children.length;
        if (!n) { return; }
        if (e.key === 'ArrowDown') { actif = (actif + 1) % n; }
        else { actif = (actif <= 0 ? n : actif) - 1; }
        peindreActif();
        return;
      }
      if (e.key === 'Enter') {
        // Avec une suggestion retenue, Entrée l'ouvre. Sans, Entrée laisse le
        // formulaire partir vers /recherche — le comportement d'avant ce lot.
        if (!liste.hidden && actif >= 0) {
          e.preventDefault();
          aller(actif);
        }
        return;
      }
      if (e.key === 'Escape') {
        if (!liste.hidden) {
          e.preventDefault();  // ne pas vider le champ : Échap ferme la liste
          fermer();
        }
        return;
      }
      if (e.key === 'Tab') { fermer(); }
    });

    champ.addEventListener('blur', function () { fermer(); });

    // Clic hors du champ et de sa liste : on referme.
    document.addEventListener('mousedown', function (e) {
      if (e.target !== champ && !liste.contains(e.target)) { fermer(); }
    });

    // Le formulaire part : la liste n'a plus de raison d'être ouverte.
    if (form) { form.addEventListener('submit', fermer); }

    /* La rotation d'un téléphone change la hauteur disponible du tout au tout —
       812px en portrait, 375 en paysage. Sans ce rappel, un panneau ouvert
       avant la rotation garderait la hauteur de l'orientation précédente et
       sortirait de l'écran. Le défilement de la page déplace aussi le champ,
       donc l'espace sous lui. */
    window.addEventListener('resize', function () { if (!liste.hidden) { borner(); } });
    window.addEventListener('scroll', function () { if (!liste.hidden) { borner(); } }, { passive: true });
  }

  champs.forEach(brancher);
}());
