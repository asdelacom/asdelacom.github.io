/**
 * Thème d4r — l'en-tête : fond, retrait au défilement, menu du téléphone.
 * Vanilla, aucune dépendance, chargé `defer` sur toutes les pages par
 * `render_head()` quand le thème est actif.
 *
 * Trois affaires, indépendantes :
 *   1. le FOND : sur une page à bandeau (`html[data-bandeau]`), l'en-tête est
 *      transparent en haut et devient blanc (`is-fixe`) passé le seuil
 *      `--entete-seuil-fond` ; ailleurs il est blanc d'office (CSS) ;
 *   2. le RETRAIT : passé `--entete-seuil-cache`, l'en-tête se retire quand on
 *      descend (`is-cache`) et revient dès qu'on remonte — jamais menu ouvert ;
 *   3. le MENU du téléphone : ouverture au bouton, tiroirs (gammes, marques,
 *      univers, catégories), retour, Échap, focus posé et rendu, page bloquée
 *      sous le menu (`html.menu-ouvert`, la règle existe dans site.css).
 *
 * Les deux seuils sont lus dans les tokens, pas écrits ici (même détour que
 * `--entete-seuil` dans le pied de page du thème charte, PO-12).
 *
 * Sans ce script : le bouton de menu reste `hidden`, la navigation s'affiche
 * dépliée (CSS `html:not([data-js])`), l'en-tête ne bouge pas.
 */
(function () {
  'use strict';

  var entete = document.querySelector('[data-entete]');
  if (!entete) { return; }

  var racine = document.documentElement;
  var styles = getComputedStyle(racine);
  var seuilFond = parseFloat(styles.getPropertyValue('--entete-seuil-fond')) || 40;
  var seuilCache = parseFloat(styles.getPropertyValue('--entete-seuil-cache')) || 80;
  var aBandeau = racine.hasAttribute('data-bandeau');

  var bouton = entete.querySelector('[data-burger]');
  var menu = document.getElementById(bouton ? bouton.getAttribute('aria-controls') : '') || null;

  /* ── 1 et 2 : fond et retrait ─────────────────────────────────────────── */
  var dernierY = window.scrollY || 0;
  var visible = true;

  function peindre() {
    var y = window.scrollY || 0;
    var ouvert = entete.classList.contains('is-ouvert');
    if (y < seuilCache) { visible = true; }
    else if (y < dernierY) { visible = true; }
    else if (y > dernierY) { visible = false; }
    dernierY = y;
    entete.classList.toggle('is-fixe', aBandeau && y > seuilFond && !ouvert);
    entete.classList.toggle('is-cache', !visible && !ouvert && y > seuilCache);
  }

  var attente = false;
  window.addEventListener('scroll', function () {
    if (attente) { return; }
    attente = true;
    window.requestAnimationFrame(function () { attente = false; peindre(); });
  }, { passive: true });
  peindre();

  /* ── 3 : le menu du téléphone ─────────────────────────────────────────── */
  if (!bouton || !menu) { return; }
  bouton.hidden = false;

  var retour = menu.querySelector('[data-retour]');
  var panneaux = menu.querySelectorAll('[data-panneau]');
  var pile = ['racine'];
  var focusAvant = null;
  var grandEcran = window.matchMedia('(min-width: 768px)');

  function panneauActif() {
    return menu.querySelector('[data-panneau].is-actif');
  }

  function focalisables(zone) {
    return zone.querySelectorAll('a[href], button:not([hidden])');
  }

  function montrer(id, options) {
    var o = options || {};
    if (o.remplace) { pile = id === 'racine' ? ['racine'] : ['racine', id]; }
    else if (!o.retour && pile[pile.length - 1] !== id) { pile.push(id); }
    var imbrique = id !== 'racine';
    for (var i = 0; i < panneaux.length; i++) {
      var p = panneaux[i];
      var actif = p.getAttribute('data-panneau') === id;
      p.classList.toggle('is-actif', actif);
      p.hidden = !actif;
    }
    if (retour) { retour.hidden = !imbrique; }
    if (o.focus !== false) {
      var premier = focalisables(panneauActif())[0];
      if (premier) { premier.focus(); }
    }
  }

  function ouvrir(ouvert) {
    /* Lot R6 (2026-10-17) — LE FOCUS NE BOUGE QUE SI LE MENU ÉTAIT OUVERT.
       `ouvrir(false)` est aussi appelé à l'initialisation, ci-dessous, pour
       poser l'état fermé : il rendait alors le focus « au bouton », et toute
       page ouverte au téléphone commençait le focus sur le burger — la
       tabulation sautait le lien d'évitement, le logo et les icônes, et le
       lecteur d'écran démarrait au milieu de l'en-tête. Relevé par le pilote
       de contrôle (`K menu 375`), invisible à l'ordinateur où le bouton est
       `hidden` et ne prend pas le focus. */
    var etaitOuvert = entete.classList.contains('is-ouvert');
    entete.classList.toggle('is-ouvert', ouvert);
    menu.classList.toggle('is-ouvert', ouvert);
    menu.setAttribute('aria-hidden', ouvert ? 'false' : 'true');
    bouton.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    racine.classList.toggle('menu-ouvert', ouvert);
    if (ouvert) {
      focusAvant = document.activeElement;
      entete.classList.remove('is-cache');
      montrer('racine', { remplace: true });
    } else {
      montrer('racine', { remplace: true, focus: false });
      /* Le focus revient d'où il est parti ; s'il n'était nulle part (un clic
         à la souris ne focalise pas le bouton sur Safari), il va au bouton. */
      if (etaitOuvert) {
        var cible = (focusAvant && focusAvant !== document.body && typeof focusAvant.focus === 'function') ? focusAvant : bouton;
        cible.focus();
      }
      focusAvant = null;
    }
    peindre();
  }

  montrer('racine', { remplace: true, focus: false });
  ouvrir(false);

  bouton.addEventListener('click', function () {
    ouvrir(!entete.classList.contains('is-ouvert'));
  });

  menu.addEventListener('click', function (e) {
    var tiroir = e.target.closest ? e.target.closest('[data-tiroir]') : null;
    if (tiroir) {
      e.preventDefault();
      montrer(tiroir.getAttribute('data-tiroir'));
      return;
    }
    if (e.target.closest && e.target.closest('[data-retour]')) {
      e.preventDefault();
      if (pile.length > 1) { pile.pop(); }
      montrer(pile[pile.length - 1] || 'racine', { retour: true });
      return;
    }
    /* Un lien suivi referme le menu : la page change, ou l'ancre est sur la
       page même. */
    if (e.target.closest && e.target.closest('a[href]')) {
      ouvrir(false);
    }
  });

  /* Échap referme ; Tab reste dans le menu tant qu'il est ouvert. */
  document.addEventListener('keydown', function (e) {
    if (!entete.classList.contains('is-ouvert')) { return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      ouvrir(false);
      return;
    }
    if (e.key !== 'Tab') { return; }
    var liste = [bouton];
    var actif = panneauActif();
    if (retour && !retour.hidden) { liste.push(retour); }
    var f = actif ? focalisables(actif) : [];
    for (var i = 0; i < f.length; i++) { liste.push(f[i]); }
    var actions = menu.querySelector('[data-menu-actions]');
    if (actions) {
      var g = focalisables(actions);
      for (var j = 0; j < g.length; j++) { liste.push(g[j]); }
    }
    var premier = liste[0];
    var dernier = liste[liste.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  });

  /* Au passage à l'ordinateur, le menu n'a plus d'objet : il se referme. */
  function surLargeur(mq) {
    if (mq.matches && entete.classList.contains('is-ouvert')) { ouvrir(false); }
  }
  if (grandEcran.addEventListener) { grandEcran.addEventListener('change', surLargeur); }
  else if (grandEcran.addListener) { grandEcran.addListener(surLargeur); }
})();
