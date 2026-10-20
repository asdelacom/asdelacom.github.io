/**
 * Thème d4r — les vidéos, sur toutes les pages qui en portent (lot R3,
 * 2026-10-17 ; sorti de `accueil.js` du lot R2 pour servir aussi les listes).
 * Vanilla, aucune dépendance, chargé `defer` avant `accueil.js`.
 *
 * LE RÉGIME DE PO-221, POUR TOUTE VIDÉO `video[data-video-src]` :
 *   - l'adresse n'est posée que si rien ne s'y oppose — ni « Réduire les
 *     animations », ni une connexion signalée lente — et quand la vidéo
 *     approche de l'écran ; pause hors de l'écran et onglet caché ;
 *   - une vidéo marquée `data-video-bandeau` part dès le document construit
 *     (c'est le premier visuel de la page) ; les autres après `load` ;
 *   - AU TÉLÉPHONE (sous 768 px — D1, décision du client du 2026-10-17), les
 *     vidéos secondaires ne partent pas d'elles-mêmes : leur image d'attente
 *     reste, et le bouton de pause les lance toutes à la demande. Le bandeau,
 *     lui, se lit sur tous les écrans (décision du 2026-10-10) ;
 *   - UN bouton, `[data-video-bouton]`, arrête et relance toutes les vidéos de
 *     la page (WCAG 2.2.2) ; son libellé dit l'action à venir ;
 *   - une page dont le contenu est remplacé sans rechargement (les filtres de
 *     `surplace.js`) est rebalayée : les vidéos nouvelles entrent au régime.
 *
 * Publié sous `window.D4R.videos` pour `accueil.js` (splash) :
 *   voulue(), appliquer(video), toutes(), balayer().
 */
(function () {
  'use strict';

  var D4R = (window.D4R = window.D4R || {});
  var reduit = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
  var c = navigator.connection;
  var lente = !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
  var voulue = !reduit && !lente;
  /* D1 : sous 768 px, les secondaires attendent un geste ; `demandees` passe à
     vrai au premier clic sur « Lire les vidéos ». */
  var telephone = window.matchMedia ? window.matchMedia('(max-width: 767px)').matches : false;
  var demandees = false;
  var pagePrete = document.readyState === 'complete';
  var videos = [];
  var guetteur = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entrees) {
        entrees.forEach(function (e) { e.target.__proche = e.isIntersecting; appliquer(e.target); });
      }, { rootMargin: '200px 0px' })
    : null;

  function bouton() { return document.querySelector('[data-video-bouton]'); }

  function montrerBouton() {
    var b = bouton();
    if (!b) { return; }
    b.hidden = false;
    b.classList.toggle('est-arretee', !voulue);
    var libelle = b.querySelector('[data-video-libelle]');
    if (libelle) { libelle.textContent = voulue ? 'Mettre les vidéos en pause' : 'Lire les vidéos'; }
  }

  function appliquer(v) {
    var bandeau = v.hasAttribute('data-video-bandeau');
    var admise = bandeau || !telephone || demandees;
    if (voulue && admise && v.__proche && (pagePrete || bandeau) && !document.hidden) {
      if (!v.__chargee) {
        v.__chargee = true;
        v.src = v.getAttribute('data-video-src');
      }
      var p = v.play();
      if (p && p.catch) {
        p.catch(function (e) {
          /* Un Android en économie de données refuse la lecture automatique :
             l'intention retombe, le triangle s'affiche, l'image reste. */
          if (e && e.name === 'NotAllowedError' && bandeau) { voulue = false; montrerBouton(); toutes(); }
        });
      }
    } else if (v.__chargee && !v.paused) {
      v.pause();
    }
  }

  function toutes() { videos.forEach(appliquer); }

  function balayer() {
    Array.prototype.forEach.call(document.querySelectorAll('video[data-video-src]'), function (v) {
      if (v.__cable) { return; }
      v.__cable = true;
      v.__proche = !guetteur;
      v.muted = true;
      v.addEventListener('playing', function () {
        var cadre = v.closest('[data-video]');
        if (cadre) { cadre.classList.add('est-lue'); }
      });
      v.addEventListener('error', function () {
        var cadre = v.closest('[data-video]');
        if (cadre) { cadre.classList.remove('est-lue'); }
      });
      videos.push(v);
      if (guetteur) { guetteur.observe(v); } else { appliquer(v); }
    });
    videos = videos.filter(function (v) { return document.contains(v); });
    var b = bouton();
    if (b && !b.__cable) {
      b.__cable = true;
      b.addEventListener('click', function () {
        /* Au téléphone, le premier clic sur « Lire les vidéos » lance aussi
           les secondaires ; « Mettre en pause » arrête tout, le clic suivant
           relance tout. */
        if (!voulue) { demandees = true; }
        voulue = !voulue; montrerBouton(); toutes();
      });
    }
    montrerBouton();
  }

  document.addEventListener('visibilitychange', toutes);
  if (!pagePrete) { window.addEventListener('load', function () { pagePrete = true; toutes(); }); }

  /* Les filtres sans rechargement remplacent le contenu de `main` : rebalayer. */
  var main = document.querySelector('main[data-surplace]');
  if (main && 'MutationObserver' in window) {
    new MutationObserver(function () { balayer(); }).observe(main, { childList: true, subtree: true });
  }

  balayer();
  D4R.videos = {
    voulue: function () { return voulue; },
    appliquer: appliquer,
    toutes: toutes,
    balayer: balayer
  };
})();
