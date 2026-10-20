/**
 * Thème d4r — l'accueil (lot R2, 2026-10-17). Vanilla, aucune dépendance,
 * chargé `defer` sur l'accueil seulement.
 *
 * Huit affaires, indépendantes, chacune dans sa fonction :
 *   1. LES VIDÉOS — dans `videos.js` depuis le lot R3 (le même régime sert les
 *      listes) ; ce fichier n'en lit que l'intention et la fonction d'application.
 *   2. LE SPLASH — cadre et logo sur noir, le temps minimal des tokens, puis
 *      l'ouverture du bandeau ; une fois par session, jamais sous « Réduire
 *      les animations ».
 *   3. « À PROPOS » — la dérive des cartes, en repli seulement : le navigateur
 *      qui connaît `animation-timeline: view()` la fait en CSS.
 *   4. LES CARROUSELS — la carte courante au centre, flèches, glisser,
 *      clavier ; les cartes hors centre sont sorties de la tabulation.
 *   5. « NOS SERVICES » — la vidéo remplace la photo quand les cartes sont au
 *      niveau de l'écran.
 *   6. « COMMENT ÇA MARCHE » — la ligne se trace au défilement, les étapes s'allument (lot F2).
 *   7. LA FAQ — ouvrir une question ferme les autres (`<details>` natifs).
 *   8. LES APPARITIONS — `[data-reveal]` et `[data-reveal-stagger]`.
 *
 * Les nombres viennent des tokens (`assets/css/d4r/tokens.css`), lus une fois.
 */
(function () {
  'use strict';

  var racine = document.documentElement;
  var styles = getComputedStyle(racine);
  var reduit = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

  function ms(token, defaut) {
    var v = parseFloat(styles.getPropertyValue(token));
    if (isNaN(v)) { return defaut; }
    return /s\s*$/.test(styles.getPropertyValue(token)) && !/ms\s*$/.test(styles.getPropertyValue(token)) ? v * 1000 : v;
  }
  function px(token, defaut) {
    var v = parseFloat(styles.getPropertyValue(token));
    return isNaN(v) ? defaut : v;
  }

  /* ── 1. Les vidéos : dans `videos.js` (lot R3), chargé avant ce fichier ── */
  var V = window.D4R && window.D4R.videos;
  if (!V) { return; }
  var voulue = V.voulue();
  var appliquerVideo = V.appliquer;
  var appliquerToutes = V.toutes;

  /* ── 2. Le splash et l'ouverture du bandeau ──────────────────────────── */
  (function () {
    var splash = document.querySelector('[data-splash]');
    var scene = document.querySelector('[data-bandeau-scene]');
    var video = document.querySelector('video[data-video-bandeau]');
    function ouvrir() {
      if (scene) { scene.classList.remove('is-intro', 'is-opening', 'is-expanding'); scene.classList.add('is-open'); }
      racine.classList.remove('splash-actif');
    }
    var deja = false;
    try { deja = sessionStorage.getItem('d4r.splash') === '1'; } catch (e) {}
    if (!splash || !scene || !video || reduit || deja || !voulue) {
      if (splash) { splash.remove(); }
      ouvrir();
      appliquerToutes();
      return;
    }
    try { sessionStorage.setItem('d4r.splash', '1'); } catch (e) {}
    /* PO-256 : le cadre (WebP) n'est demandé qu'ici, quand le splash joue. */
    var cadre = splash.querySelector('[data-src]');
    if (cadre) { cadre.src = cadre.getAttribute('data-src'); }
    splash.hidden = false;
    racine.classList.add('splash-actif');
    var minimum = new Promise(function (r) { setTimeout(r, ms('--splash-minimum', 600)); });
    var pret = new Promise(function (r) {
      var fini = false;
      var finir = function () { if (!fini) { fini = true; r(); } };
      video.addEventListener('loadeddata', finir, { once: true });
      video.addEventListener('playing', finir, { once: true });
      setTimeout(finir, ms('--splash-attente-video', 900));
    });
    video.__proche = true;
    appliquerVideo(video);
    Promise.all([minimum, pret]).then(function () {
      splash.classList.add('is-done');
      scene.classList.add('is-opening');
      var dureeOuverture = ms('--dur-ouverture', 750);
      setTimeout(function () {
        splash.classList.add('is-expanding');
        scene.classList.add('is-expanding');
        setTimeout(function () { splash.remove(); ouvrir(); }, dureeOuverture + 80);
      }, ms('--dur-splash', 280));
    });
  })();

  /* ── 3. « À propos » : les volets (lot F4) ───────────────────────────── */
  /* L'ouverture au survol et au focus est du CSS (`:hover`, `:focus-within`) :
     sans ce script, elle marche. Il fait deux choses de plus : il GARDE OUVERT
     le dernier volet survolé ou touché quand la souris s'en va (la classe
     `is-ouvert` suit le pointeur), et, au doigt sur un écran large (tablette),
     le PREMIER toucher d'un volet fermé l'ouvre au lieu de suivre le lien — le
     second le suit. Sous 900 px, tous sont ouverts : rien à faire ici. */
  (function () {
    var groupe = document.querySelector('[data-apropos-volets]');
    if (!groupe) { return; }
    var volets = Array.prototype.slice.call(groupe.querySelectorAll('[data-apropos-volet]'));
    var tapSurFerme = false;
    function ouvrir(v) {
      volets.forEach(function (x) { x.classList.toggle('is-ouvert', x === v); });
    }
    volets.forEach(function (v) {
      v.addEventListener('mouseenter', function () { ouvrir(v); });
      v.addEventListener('focusin', function () { ouvrir(v); });
      v.addEventListener('pointerdown', function (ev) {
        tapSurFerme = ev.pointerType === 'touch' && window.innerWidth > 900 && !v.classList.contains('is-ouvert');
      });
      v.addEventListener('click', function (ev) {
        if (tapSurFerme) { ev.preventDefault(); tapSurFerme = false; ouvrir(v); }
      });
    });
  })();

  /* ── 4. Les carrousels ───────────────────────────────────────────────── */
  function carrousel(fenetre) {
    var scene = fenetre.querySelector('[data-carrou-scene]');
    var cartes = Array.prototype.slice.call(fenetre.querySelectorAll('[data-carrou-carte]'));
    var n = cartes.length;
    if (!scene || n === 0) { return; }
    var prec = fenetre.querySelector('[data-carrou-sens="-1"]');
    var suiv = fenetre.querySelector('[data-carrou-sens="1"]');
    var actif = Math.min(1, n - 1);
    var seuil = px('--carrou-seuil-glisser', 60);
    var grand = window.matchMedia('(min-width: 810px)');
    fenetre.classList.add('est-cable');

    function decalage(i) {
      var brut = i - actif;
      var demi = Math.floor(n / 2);
      if (brut > demi) { brut -= n; }
      if (brut < -demi) { brut += n; }
      return brut;
    }
    function peindre() {
      var x = px(grand.matches ? '--carrou-decalage-large' : '--carrou-decalage', grand.matches ? 323 : 238);
      var voisine = parseFloat(styles.getPropertyValue('--carrou-echelle-voisine')) || .6375;
      var loin = parseFloat(styles.getPropertyValue('--carrou-echelle-loin')) || .525;
      cartes.forEach(function (carte, i) {
        var d = decalage(i);
        var role = d === 0 ? 'centre' : (Math.abs(d) === 1 ? 'voisine' : (Math.abs(d) === 2 ? 'loin' : 'cache'));
        var tx = d === 0 ? 0 : (d < 0 ? -x : x);
        var s = role === 'centre' ? 1 : (role === 'voisine' ? voisine : loin);
        carte.classList.remove('is-centre', 'is-voisine', 'is-loin', 'is-cache');
        carte.classList.add('is-' + role);
        carte.style.transform = 'translate(-50%, -50%) translateX(' + tx + 'px) scale(' + s + ')';
        carte.style.zIndex = role === 'centre' ? '10' : (role === 'voisine' ? '9' : (role === 'loin' ? '8' : '1'));
        /* Hors du centre, la carte ne se tabule pas et ne se lit pas : c'est
           une image réduite, pas une entrée de la liste. */
        var lien = carte.querySelector('a');
        if (lien) { lien.tabIndex = role === 'centre' ? 0 : -1; }
        carte.setAttribute('aria-hidden', role === 'centre' ? 'false' : 'true');
      });
    }
    function aller(delta) { actif = ((actif + delta) % n + n) % n; peindre(); }
    if (prec) { prec.hidden = false; prec.addEventListener('click', function () { aller(-1); }); }
    if (suiv) { suiv.hidden = false; suiv.addEventListener('click', function () { aller(1); }); }

    var glisse = false, departX = 0, dx = 0, aGlisse = false;
    cartes.forEach(function (carte, i) {
      carte.addEventListener('click', function (e) {
        if (aGlisse) { e.preventDefault(); return; }
        if (i === actif) { return; }     /* le lien du centre fait son travail */
        e.preventDefault();
        actif = i;
        peindre();
      });
    });
    scene.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) { return; }
      glisse = true; aGlisse = false; departX = e.clientX; dx = 0;
      scene.classList.add('is-glisse');
    });
    window.addEventListener('pointermove', function (e) {
      if (!glisse) { return; }
      dx = e.clientX - departX;
      if (Math.abs(dx) > 8) { aGlisse = true; }
    });
    function lacher() {
      if (!glisse) { return; }
      glisse = false;
      scene.classList.remove('is-glisse');
      if (dx > seuil) { aller(-1); } else if (dx < -seuil) { aller(1); }
      dx = 0;
      setTimeout(function () { aGlisse = false; }, 40);
    }
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', lacher);
    fenetre.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); aller(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); aller(1); }
    });
    if (grand.addEventListener) { grand.addEventListener('change', peindre); } else if (grand.addListener) { grand.addListener(peindre); }
    peindre();
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-carrou]'), carrousel);

  /* ── 5. « Nos services » : la vidéo au niveau de l'écran ─────────────── */
  (function () {
    var section = document.querySelector('[data-services]');
    if (!section || reduit) { return; }
    var grille = section.querySelector('.services__grille') || section;
    function regler() {
      var r = grille.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      var auNiveau = r.top < vh * 0.62 && r.bottom > vh * 0.28;
      var descend = r.top < vh * 0.12;
      section.classList.toggle('is-video', auNiveau && !descend);
    }
    var attente = false;
    window.addEventListener('scroll', function () {
      if (attente) { return; }
      attente = true;
      requestAnimationFrame(function () { attente = false; regler(); });
    }, { passive: true });
    window.addEventListener('resize', regler, { passive: true });
    regler();
  })();

  /* ── 6. « Comment ça marche » : la ligne se trace, les étapes s'allument ──
     Lot F2 (2026-10-20). La hauteur de la ligne pleine suit le défilement : la
     pointe est à 42 % de l'écran. Une étape dont le picto est au-dessus de la
     pointe est « passée » (allumée) ; la dernière passée est « courante ». Sous
     « Réduire les animations », tout est allumé d'emblée, rien ne bouge. */
  (function () {
    var section = document.querySelector('[data-etapes]');
    if (!section) { return; }
    var piste = section.querySelector('[data-etapes-piste]');
    var ligne = section.querySelector('[data-etapes-ligne]');
    var items = Array.prototype.slice.call(section.querySelectorAll('[data-etapes-item]'));
    if (!piste || !ligne) { return; }
    if (reduit) {
      ligne.style.height = '100%';
      items.forEach(function (it, i) { it.classList.add('is-passee'); if (i === items.length - 1) { it.classList.add('is-courant'); } });
      section.classList.add('is-sans-mouvement');
      return;
    }
    function poser() {
      var r = piste.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      var pointe = Math.max(0, Math.min(piste.clientHeight, vh * 0.42 - r.top));
      ligne.style.height = pointe + 'px';
      var y = r.top + pointe, courant = -1;
      items.forEach(function (it, i) {
        var picto = it.querySelector('.etapes__picto') || it;
        var pr = picto.getBoundingClientRect();
        var passee = pr.top + pr.height * 0.5 <= y;
        it.classList.toggle('is-passee', passee);
        if (passee) { courant = i; }
      });
      items.forEach(function (it, i) { it.classList.toggle('is-courant', i === courant); });
    }
    var attente = false;
    window.addEventListener('scroll', function () {
      if (attente) { return; }
      attente = true;
      requestAnimationFrame(function () { attente = false; poser(); });
    }, { passive: true });
    window.addEventListener('resize', poser, { passive: true });
    poser();
  })();

  /* ── 7. La FAQ : une question ouverte à la fois ──────────────────────── */
  (function () {
    var faq = document.querySelector('[data-faq]');
    if (!faq) { return; }
    var details = Array.prototype.slice.call(faq.querySelectorAll('details'));
    details.forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) { return; }
        details.forEach(function (autre) { if (autre !== d && autre.open) { autre.open = false; } });
      });
    });
  })();

  /* ── 8. Les apparitions ──────────────────────────────────────────────── */
  (function () {
    var cibles = Array.prototype.slice.call(document.querySelectorAll('[data-reveal], [data-reveal-stagger]'));
    if (!cibles.length) { return; }
    if (reduit || !('IntersectionObserver' in window)) {
      cibles.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (!e.isIntersecting) { return; }
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    cibles.forEach(function (el) { io.observe(el); });
  })();
})();
