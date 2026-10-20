/**
 * Parcours de réservation (SPEC.md §5.3, lot 7). Vanilla, aucune dépendance,
 * aucune compilation, un seul fichier, chargé sur les fiches seulement.
 *
 * Quatre écrans :
 *   1. choix de la formule, en modale, groupée par famille ;
 *   2. configuration, en panneau, dans le flux de la page ;
 *   3. proposition des extras de la fiche, en modale ;
 *   4. confirmation, en modale.
 *
 * Les données viennent d'un îlot JSON écrit par PHP (voir
 * includes/helpers.php, renderParcoursData) : aucun appel réseau.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TOTAL N'EST PAS UN MONTANT DE TRANSACTION.
 *
 * Il est calculé ici, côté navigateur, pour l'affichage seul. Rien de
 * sensible n'en dépend : il n'y a aucun paiement en ligne sur ce site, la
 * réservation se termine sur WhatsApp et le prix réel est confirmé par un
 * conseiller (SPEC.md §5.4). Une session future ne doit ni le traiter comme
 * une somme due, ni bâtir dessus un encaissement sans le recalculer côté
 * serveur.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Construction du DOM en JavaScript plutôt qu'en gabarit masqué : sans
 * script, ces quatre écrans n'existent pas du tout, et servir leur balisage
 * à tous les visiteurs n'apporterait rien. Toute donnée est posée par
 * `textContent`, jamais par `innerHTML` — l'échappement est structurel, pas
 * une précaution à ne pas oublier.
 */
(function () {
  'use strict';

  var ilot = document.getElementById('parcours-data');
  var cta = document.querySelector('[data-book]');
  var bloc = document.querySelector('[data-booking-static]');
  var panneau = document.querySelector('[data-booking-panel]');

  /**
   * Rend visible le lien WhatsApp de repli, que la CSS masque dès qu'il y a du
   * JavaScript (`[data-js] [data-booking-fallback]`).
   *
   * **À appeler sur chaque sortie prématurée**, et c'est tout l'objet de cette
   * fonction. Sans elle, une fiche sans formule — ou dont l'îlot de données
   * serait illisible — n'aurait aucun appel à l'action *avec* JavaScript : le
   * bouton reste `hidden`, et le lien serait masqué par la CSS. Le visiteur
   * verrait une fiche sans aucun moyen de réserver, sans que rien ne le
   * signale. C'est déjà le cas aujourd'hui pour une fiche sans formule ; ce lot
   * le corrige.
   */
  function montrerRepli() {
    var liste = document.querySelectorAll('[data-booking-fallback]');
    for (var i = 0; i < liste.length; i++) {
      liste[i].classList.add('is-shown');
    }
  }

  // `window.D4R` porte la coquille de modale, désormais dans modale.js et
  // chargée avant ce fichier. Son absence signifie qu'aucun des quatre écrans
  // ne peut s'ouvrir : on repasse au repli plutôt que d'échouer au premier clic
  // sur un bouton qui aurait été révélé.
  if (!ilot || !cta || !bloc || !panneau || !window.D4R) {
    montrerRepli();
    return;
  }

  var config;
  try {
    config = JSON.parse(ilot.textContent);
  } catch (e) {
    // Données illisibles : on laisse la fiche du lot 6 telle quelle, bouton
    // masqué compris. Mieux vaut aucun parcours qu'un parcours à moitié — mais
    // le lien WhatsApp revient, sans quoi il ne resterait rien.
    montrerRepli();
    return;
  }
  if (!config || !config.formulas || !config.formulas.length) {
    montrerRepli();
    return;
  }

  // Outils partagés, définis une seule fois dans modale.js. Recopier `el()` ou
  // le namespace SVG ici en ferait deux définitions de la même chose.
  var el = window.D4R.el;
  var SVG_NS = window.D4R.SVG_NS;
  var ouvrirModale = window.D4R.ouvrirModale;
  var fermerModale = window.D4R.fermerModale;

  /* LE BORNAGE DU LOT 4 — un pack n'est pas une prestation à l'heure.
     ───────────────────────────────────────────────────────────────────────
     **Le groupe arrive par `config.group`, et par rien d'autre.** Il est écrit
     en PHP par `parcoursConfig()` (`includes/helpers.php`), qui le lit dans
     `$product['group_type']` — la colonne de la base, celle-là même dont
     dépendent le routage, le fil d'ariane et l'admin. Il traverse l'îlot JSON
     `#parcours-data` et se relit ici. **Aucune autre voie n'est employée** :
     ni l'URL, ni une classe CSS, ni le libellé d'unité de la formule.

     Le libellé d'unité (`qtyLabel`) vaut « pack » aujourd'hui parce que le
     client l'a saisi ainsi, et c'est précisément pourquoi il ne peut pas
     servir de test : c'est du texte libre d'admin, il changera sans prévenir.
     `group_type` est une valeur close, contrôlée par une liste blanche à la
     saisie. */
  var estPack = config.group === 'pack';

  /* LOT D (2026-10-02) — UNE VOITURE SE LOUE DE DATE À DATE.
     ───────────────────────────────────────────────────────────────────────
     Demande du client final : le choix de deux dates, comme sur les sites de
     location, à la place du compteur plus/moins — « dix jours est inutilisable
     ainsi » — et plus de champ « nombre de personnes ».

     **Borné par `config.group`, la voie du lot 4**, et par rien d'autre : les
     activités, les packs, les événements et les restaurants ne passent par
     aucune des branches `estVoiture` de ce fichier. Leur parcours est celui
     d'avant, au caractère près.

     **Le calcul ne change pas** (SPEC.md §5.3) : la quantité reste le seul
     multiplicateur. Sur une voiture, elle n'est plus saisie mais DÉDUITE — le
     nombre de jours entre les deux dates — et `etat.qty` la porte comme avant.
     Tarif journalier unique : les tarifs dégressifs restent reportés (PO-212),
     aucun palier n'est inventé ici. */
  var estVoiture = config.group === 'car';

  var CLE_PANIER = 'd4r.panier.v1';

  /* --------------------------------------------------------- créneaux
   * Un `<input type="time">` acceptait 14h37 comme 03h00 : ni l'un ni l'autre
   * ne correspond à quoi que ce soit de réservable. Remplacé par une liste de
   * créneaux d'une demi-heure.
   *
   * **Ces bornes ne viennent pas du client, elles sont provisoires.** Elles
   * sont tirées de ce que le catalogue dit lui-même, faute de mieux : la seule
   * heure d'horloge écrite dans les 21 fiches est celle du safari (départ vers
   * 14h30-15h, retour vers 21h30) ; la balade à cheval se fait « au lever du
   * jour », ce qui à Dubaï tombe entre 5h30 et 7h selon la saison ; un
   * restaurant mentionne la soirée. D'où 5h à 23h.
   *
   * **Une fenêtre unique est forcément trop large pour chaque fiche prise
   * séparément** — c'est l'union de tous les besoins, donc elle propose 5h du
   * matin à un restaurant et 23h à une balade à cheval. C'est la limite
   * assumée de ce lot, et la raison pour laquelle ces bornes doivent devenir
   * un réglage par fiche au lot 9 (SUIVI.md, PO-33).
   *
   * Le choix reste facultatif : « Sans préférence » est la valeur par défaut,
   * et le champ libre du panneau reste ouvert pour un cas particulier. */
  var CRENEAU_DEBUT = 5 * 60;    // 05:00
  var CRENEAU_FIN = 23 * 60;     // 23:00
  var CRENEAU_PAS = 30;          // minutes

  /* LA PHOTO D'OPTION EN 3/2 À PARTIR DE 600 PX DE HAUTEUR VISIBLE — lot de la
   * carte d'option (2026-10-12), décision du client ; 2/1 en dessous (les deux
   * rapports sont des tokens, `--extra-media-ratio` et `-haut`).
   *
   * **Lu ici, et non par une requête média.** Sur iPhone, `@media
   * (min-height)` peut porter sur la fenêtre barres de Safari repliées ou
   * dépliées — SE : 667 ou 553 ; iPhone 12 : 844 ou 664 — et AUCUN seuil
   * unique ne sépare alors les deux téléphones dans les deux lectures.
   * `innerHeight` est la hauteur réellement visible, celle que les mesures
   * ont prise. Elle est lue à l'ouverture de l'écran 3 et pas suivie ensuite :
   * la page est bloquée sous la modale, les barres ne bougent plus. */
  var PHOTO_HAUTE_MIN = 600;

  /* ---------------------------------------------------------------- outils */

  /** Même mise en forme que formatPrice() en PHP : séparateur de milliers par
   *  espace, aucune décimale, suffixe AED. Écrit à la main plutôt que par
   *  toLocaleString() — celui-ci pose une espace insécable étroite (U+202F)
   *  là où PHP pose une espace ordinaire, et les deux mises en forme se
   *  côtoient sur la même page. */
  function formatPrix(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' AED';
  }

  /** Repli de vignette : l'icône de catégorie du lot 4, réutilisée telle
   *  quelle. `.icone` est en taupe hors survol de carte — aucune touche d'or
   *  n'entre donc dans les modales par ce biais. */
  function glyphe() {
    if (!config.iconId) { return null; }
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icone');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#' + config.iconId);
    svg.appendChild(use);
    return svg;
  }

  /** Filet neutre : le repli d'une catégorie sans icône, celui que la carte,
   *  la galerie et l'en-tête de fiche posent déjà par renderCategoryGlyph().
   *  Jusqu'au 2026-09-13 la vignette restait un carré vide de 72 px, sans aucun
   *  enfant — le seul endroit du site où le repli n'était pas ce filet (PO-59).
   *  Aucune règle neuve : `.rule-neutral` a la taille du logement d'icône,
   *  exactement celle que `.vignette .icone` donne au glyphe. */
  function filetNeutre() {
    var s = el('span', 'rule-neutral');
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  /** Vignette d'une formule ou d'un extra : la photo si elle existe, le repli
   *  d'icône sinon. Recompté le 2026-08-19 en même temps que celui des groupes,
   *  qui portait la même erreur : **les 71 formules et 74 extras sont sans photo**
   *  (PO-15), c'est donc le repli qui s'affiche partout. */
  function vignette(src, classe) {
    var cadre = el('span', classe + ' vignette');
    if (src) {
      var img = el('img', 'vignette__img');
      img.src = src;
      img.alt = '';
      img.addEventListener('error', function () {
        cadre.classList.add('is-empty');
        img.remove();
        if (!config.iconId) { cadre.appendChild(filetNeutre()); }
      });
      cadre.appendChild(img);
    } else {
      cadre.classList.add('is-empty');
    }
    /* L'icône est posée dans tous les cas, et la CSS la masque quand la photo
       est là (`.vignette:not(.is-empty) .icone`). Le filet n'a pas de règle
       semblable : il n'est donc posé que sur un cadre VIDE — sans photo ici, ou
       dont la photo n'a pas chargé, dans le gestionnaire d'erreur ci-dessus.
       Posé sans condition, il s'afficherait à côté de la photo, et quatre
       formules du catalogue en ont une. */
    var g = glyphe();
    if (g) {
      cadre.appendChild(g);
    } else if (!src) {
      cadre.appendChild(filetNeutre());
    }
    return cadre;
  }

  /** Date du jour au format d'un <input type="date">, dans le calendrier du
   *  visiteur. Prise côté navigateur et non côté serveur : c'est le visiteur
   *  qui choisit une date dans son propre calendrier, et une date serveur
   *  (Hostinger en UTC, Dubaï en UTC+4) rendrait « aujourd'hui »
   *  insélectionnable pendant quelques heures chaque nuit. Aucun délai de
   *  réservation n'est appliqué : il n'est écrit nulle part. */
  function aujourdhui() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var j = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (j.length < 2 ? '0' + j : j);
  }

  /** Les créneaux de la journée, en pas de CRENEAU_PAS minutes, bornes
   *  comprises. Format « HH:MM », celui que portait déjà `etat.heure` : le
   *  panier et le récapitulatif n'ont pas à changer de forme. */
  function creneaux() {
    var out = [];
    for (var m = CRENEAU_DEBUT; m <= CRENEAU_FIN; m += CRENEAU_PAS) {
      var h = Math.floor(m / 60);
      var mn = m % 60;
      out.push((h < 10 ? '0' : '') + h + ':' + (mn < 10 ? '0' : '') + mn);
    }
    return out;
  }

  /** « 15:30 » devient « 15h30 », « 15:00 » devient « 15h ». Le format
   *  d'horloge est celui d'une valeur de champ, pas celui d'une phrase
   *  française. Ajouté au lot 8 pour que le récapitulatif du panneau, la
   *  confirmation, la page de panier et le message WhatsApp écrivent tous
   *  l'heure de la même façon. */
  function heureLisible(hhmm) {
    var p = String(hhmm || '').split(':');
    if (p.length !== 2) { return String(hhmm || ''); }
    return parseInt(p[0], 10) + 'h' + (p[1] === '00' ? '' : p[1]);
  }

  function dateLisible(iso) {
    var p = iso.split('-');
    if (p.length !== 3) { return iso; }
    var mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
      'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    var jour = parseInt(p[2], 10);
    // Le premier du mois s'écrit « 1er » en français, les autres en cardinal.
    // Seul jour concerné : la règle n'a pas d'autre exception.
    return jour + (jour === 1 ? 'er' : '') + ' ' + mois[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  /** Lot D. Nombre de jours de `debut` à `fin`, deux dates au format d'un
   *  `<input type="date">`, ou `null` si l'une des deux n'en est pas une.
   *
   *  **Compté en UTC, et c'est ce qui le rend juste** : deux minuits locaux
   *  séparés par un changement d'heure sont distants de 23 ou 25 heures, et une
   *  division par 24 rendrait alors 0,96 ou 1,04 jour. `Date.UTC` n'a pas de
   *  changement d'heure. */
  function joursEntre(debut, fin) {
    var a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(debut || '');
    var b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fin || '');
    if (!a || !b) { return null; }
    return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86400000);
  }

  /** Lot D. `iso` avancée de `n` jours, au même format. */
  function ajouterJours(iso, n) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!p) { return ''; }
    return new Date(Date.UTC(+p[1], +p[2] - 1, +p[3] + n)).toISOString().slice(0, 10);
  }

  /* ----------------------------------------------------------------- état */

  var etat = {
    formule: null,
    duree: null,
    qty: 1,
    date: '',
    // Lot D : la fin de la location d'une voiture. Vide partout ailleurs.
    dateFin: '',
    heure: '',
    personnes: 2,
    note: '',
    /* Une quantité par extra, indexée comme `config.extras`. C'était un nombre
       unique jusqu'au 2026-08-30, l'écran 3 ne proposant qu'un extra. Zéro ou
       absent = non retenu. */
    extraQtys: [],
    /* PO-231 (2026-10-10) — la durée retenue pour chaque extra, indexée de
       même : l'objet `{label, price}` de `config.extras[i].durations`, ou
       `null` pour un extra sans durée. */
    extraDurees: []
  };

  /** Durée retenue par défaut : **la moins chère**, départage par l'ordre de
   *  saisie du client. Ce n'est pas simplement la première : l'écran 1 annonce
   *  un prix « à partir de » calculé sur le minimum, et le panneau doit ouvrir
   *  sur ce même montant. Prendre la première alors qu'une autre est moins
   *  chère afficherait un total supérieur au prix annoncé trois secondes plus
   *  tôt — le reproche fait à PO-31, qu'on ne va pas réintroduire ici. */
  function dureeParDefaut(f) {
    if (!f.durations || !f.durations.length) { return null; }
    return f.durations.reduce(function (a, b) { return b.price < a.price ? b : a; });
  }

  /**
   * Total de la partie « formule ».
   *
   * **La durée est un supplément, jamais un facteur** : son prix s'ajoute à
   * celui de la formule, puis la quantité multiplie l'ensemble. La quantité
   * reste le seul multiplicateur du parcours (SPEC.md §5.3).
   *
   *     total = (prix formule + prix durée) × quantité
   *
   * Sans durée — 17 fiches sur 21 — le terme vaut 0 et le calcul est celui
   * d'avant ce lot, au caractère près.
   */
  /* ─────────────────────────────────────────────────────────────────────────
     `null` VEUT DIRE « PAS DE PRIX », ET IL SE TESTE, IL NE SE CALCULE PAS.

     En JavaScript, `null + 160` vaut 160 et `null * 3` vaut 0 : une prestation
     sans tarif produirait donc un total faux — soit le seul supplément, soit
     zéro, c'est-à-dire « gratuit » — sans qu'aucune erreur ne le signale.
     Chaque fonction de cette section rend donc `null` dès qu'une de ses parts
     est absente, et l'affichage traduit ce `null` en « Prix sur demande ».
     ───────────────────────────────────────────────────────────────────────── */

  function totalFormule() {
    if (!etat.formule || etat.formule.price === null) { return null; }
    var sup = etat.duree ? etat.duree.price : 0;
    return (etat.formule.price + sup) * etat.qty;
  }

  function totalExtra() {
    var liste = config.extras || [];
    var somme = 0;
    for (var i = 0; i < liste.length; i++) {
      var q = etat.extraQtys[i] || 0;
      if (q <= 0) { continue; }
      // Un seul extra sans prix suffit à rendre le total inconnu : on ne
      // additionne pas ce qu'on ignore. Même règle que pour la formule.
      if (liste[i].price === null) { return null; }
      // PO-231 : la durée est un supplément, comme pour la formule — ajoutée
      // au prix de l'extra, puis la quantité multiplie l'ensemble.
      somme += (liste[i].price + supplementExtra(i)) * q;
    }
    return somme;
  }

  /** Supplément de la durée retenue pour l'extra `i` — 0 sans durée. */
  function supplementExtra(i) {
    var d = etat.extraDurees[i];
    return d ? d.price : 0;
  }

  /** Null dès qu'une part manque : additionner ce qui est connu et taire le
   *  reste donnerait un montant qui paraît complet et ne l'est pas. C'est le
   *  défaut que ce lot corrige aussi dans le message du panier. */
  function total() {
    var f = totalFormule();
    var x = totalExtra();
    if (f === null || x === null) { return null; }
    return f + x;
  }

  /** Nombre de personnes retenu — **une seule source**. Quand l'unité comptée
   *  est la personne, le compteur EST le champ personnes : le panneau n'en
   *  affiche alors qu'un seul, et c'est lui qui fait foi. Sans quoi les deux
   *  contrôles demanderaient la même chose et pourraient se contredire. */
  /** PO-156 — **`null` sur un pack, et c'est la correction du point.**
   *
   *  `etat.personnes` vaut 2 au départ, et cette valeur partait telle quelle
   *  dans la ligne de panier et dans le message WhatsApp d'un pack, sans que
   *  personne ne l'ait saisie. Mesuré avant correction, sur le message produit
   *  de bout en bout : « 1 pack · 2 personnes ».
   *
   *  **Un pack porte son effectif dans son libellé** — « le pack, pour 4
   *  personnes » — et le compteur compte des PACKS : quatre voyageurs prennent
   *  deux packs de deux. Il n'y a donc aucun nombre de personnes à transporter,
   *  et `null` le dit mieux que 0, qui se lirait comme « zéro personne ».
   *
   *  Les trois lieux qui lisent cette fonction sont gardés en conséquence : la
   *  ligne de panier, le détail du total, et l'écran de confirmation. */
  /** **LOT D — `null` AUSSI SUR UNE VOITURE.** Le champ « nombre de
   *  personnes » y est retiré : le panier affichait « 2 personnes » sur une
   *  location, la valeur de départ de `etat.personnes`, que personne n'avait
   *  saisie. Même défaut que PO-156, même remède. */
  function personnes() {
    if (estPack || estVoiture) { return null; }
    return (etat.formule && etat.formule.qtyIsPeople) ? etat.qty : etat.personnes;
  }

  /** Lot D. Plancher de jours d'une location : le `qty_min` de la formule
   *  (« dès 48h » vaut 2), et jamais moins d'un — la fin suit le début. */
  function joursMin() {
    return Math.max(1, (etat.formule && etat.formule.qtyMin) || 1);
  }

  /** Lot D. Les jours de la location, ou `null` tant que les deux dates ne
   *  forment pas une période réservable. */
  function joursLocation() {
    var n = joursEntre(etat.date, etat.dateFin);
    return (n !== null && n >= joursMin()) ? n : null;
  }

  /** Lot D. **Sur une voiture, la quantité se déduit des dates.** Tant que la
   *  période manque, elle vaut le plancher : le total affiché est alors le
   *  tarif de départ, et le détail le dit. */
  function majJours() {
    if (!estVoiture || !etat.formule) { return; }
    var n = joursLocation();
    etat.qty = n === null ? joursMin() : n;
  }

  /** « 3 jours ». Écrit en dur, et non lu dans `qtyLabel` : ce libellé est un
   *  texte libre d'admin, et ce que comptent deux dates est toujours des
   *  jours. */
  function joursLisibles(n) {
    return n + (n > 1 ? ' jours' : ' jour');
  }

  /** « Du 3 octobre 2026 à 10h au 5 octobre 2026 » — la même phrase au
   *  panneau, à la confirmation, au panier et dans le message WhatsApp
   *  (`collections.js` en porte la jumelle, `periodeLisible()`). */
  function periodeLisible(majuscule) {
    return (majuscule ? 'Du ' : 'du ') + dateLisible(etat.date)
      + (etat.heure ? ' à ' + heureLisible(etat.heure) : '')
      + ' au ' + dateLisible(etat.dateFin);
  }

  /** Libellé du total, trois cas depuis la correction de PO-13 : un montant,
   *  une gratuité voulue (« Réservation gratuite » chez un restaurant,
   *  « Gratuit » ailleurs), ou une absence de prix (« Prix sur demande »).
   *
   *  Les deux libellés sont décidés par priceNoticeFor() en PHP et transportés
   *  par la configuration : la règle n'est pas réécrite ici (PO-12). Un seul
   *  était transporté jusqu'à ce lot, ce qui suffisait tant que 0 et « pas de
   *  prix » se confondaient — et faisait dire « gratuit » à une prestation dont
   *  le tarif était simplement inconnu. */
  function libelleTotal() {
    var t = total();
    if (t === null) { return config.demandeLabel || ''; }
    return t > 0 ? formatPrix(t) : (config.zeroLabel || '');
  }

  /* --------------------------------------------------------------- panier */

  /**
   * Écriture du panier. Le lot 8 reprendra cette clé pour l'afficher et bâtir
   * le message WhatsApp — d'où les champs `people`, `note`, `date` et `time`,
   * qui ne servent à rien dans ce lot-ci mais sont exactement ce que ce
   * message reprend (SPEC.md §5.4).
   *
   * `total` est stocké comme **montant indicatif**, pas comme somme due : il
   * fige le prix du jour de l'ajout et ne suivra pas une modification faite
   * ensuite depuis l'admin. Acceptable parce que rien n'est encaissé et que le
   * prix se confirme sur WhatsApp — mais à recalculer si le lot 8 devait s'en
   * servir autrement que pour l'affichage.
   *
   * @return true si la sélection a pu être conservée, false sinon.
   */
  var panierMemoire = [];

  function ajouterAuPanier() {
    var ligne = {
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
      slug: config.slug,
      group: config.group,
      name: config.name,
      href: config.href,
      formula: {
        name: etat.formule.name,
        price: etat.formule.price,
        unit: etat.formule.unit
      },
      // Ajout du lot « durées tarifées ». **Champ additif, la version de clé ne
      // change pas** : une ligne écrite avant ce lot n'a pas cette clé et se
      // lit toujours — `duration` y vaut `undefined`, ce que le lot 8 doit
      // traiter comme `null`. Passer la clé en v2 aurait vidé le panier des
      // visiteurs qui en avaient un, puisque le lecteur écarte toute version
      // qu'il ne connaît pas. Le versionnement est là pour signaler une rupture,
      // et il n'y en a pas ici.
      duration: etat.duree ? { label: etat.duree.label, price: etat.duree.price } : null,
      qty: etat.qty,
      qtyLabel: estVoiture ? 'jour' : etat.formule.qtyLabel,
      date: etat.date,
      // Lot D. **Champ additif, comme `duration` ci-dessus : la clé reste en
      // v1.** `undefined` hors des voitures : `JSON.stringify` l'omet, et la
      // ligne d'une activité s'écrit exactement comme avant ce lot.
      dateEnd: estVoiture ? etat.dateFin : undefined,
      time: etat.heure,
      people: personnes(),
      note: etat.note,
      // `ajouterAuPanier()` écrivait déjà un tableau, et `collections.js` boucle
      // déjà dessus : l'aval savait faire du multiple avant l'amont.
      /* PO-231 — `duration` sur l'extra, **champ additif comme celui de la
         formule** : la clé du panier reste en v1, et un extra sans durée
         s'écrit exactement comme avant (`undefined` est omis par
         `JSON.stringify`). */
      extras: (config.extras || []).map(function (x, i) {
        var d = etat.extraDurees[i];
        return { name: x.name, price: x.price, qty: etat.extraQtys[i] || 0,
          duration: d ? { label: d.label, price: d.price } : undefined };
      }).filter(function (x) { return x.qty > 0; }),
      total: total(),
      addedAt: new Date().toISOString()
    };

    // Tout accès au stockage est protégé : localStorage lève une exception en
    // navigation privée sur Safari et au dépassement de quota. L'échec ne doit
    // ni interrompre le parcours, ni passer sous silence.
    try {
      var brut = window.localStorage.getItem(CLE_PANIER);
      var panier = brut ? JSON.parse(brut) : null;
      if (!panier || panier.v !== 1 || !Array.isArray(panier.items)) {
        panier = { v: 1, items: [] };
      }
      panier.items.push(ligne);
      window.localStorage.setItem(CLE_PANIER, JSON.stringify(panier));
      /* PO-150 — LE COMPTEUR D'EN-TÊTE EST RAPPELÉ ICI, ET C'ÉTAIT LA SEULE
         ÉCRITURE DU SITE QUI NE LE FAISAIT PAS.
         ─────────────────────────────────────────────────────────────────────
         `collections.js` fait passer toutes les siennes par une fonction
         `ecrire()` qui rappelle les compteurs avant de rendre la main : favori
         posé, favori retiré, ligne retirée du panier — les trois étaient à
         jour. Ce fichier-ci écrit `localStorage` en direct, et ne rappelait
         rien. Le visiteur ajoutait au panier, le chiffre ne bougeait pas, et
         **il croyait que son ajout n'avait pas marché** — sur le seul geste de
         vente du site.

         **Une seule ligne répare les deux symptômes**, parce que
         `d4rMajCompteurs()` écrit le chiffre ET l'`aria-label` : celui-ci
         restait lui aussi périmé, si bien qu'un lecteur d'écran annonçait un
         panier vide après un ajout réussi.

         **Placée après l'écriture et non avant** : la fonction relit
         `localStorage`, elle ne compte pas ce qu'on s'apprête à y mettre.
         **Et sous garde** : `layout.php` la publie sur `window`, mais un écran
         qui n'aurait pas d'en-tête ne doit pas faire échouer un ajout au
         panier pour autant. Même garde que dans `collections.js`.

         **Le repli en mémoire, plus bas, ne la rappelle volontairement pas** :
         la ligne n'est alors PAS dans `localStorage`, et le compteur — qui lit
         `localStorage` — doit continuer d'afficher ce qui y est vraiment. */
      if (window.d4rMajCompteurs) { window.d4rMajCompteurs(); }
      return true;
    } catch (e) {
      // Repli en mémoire : le parcours va au bout dans cet onglet, mais la
      // sélection ne survivra pas à la fermeture de la page. L'écran 4 le dit.
      panierMemoire.push(ligne);
      return false;
    }
  }

  /* ------------------------------------------------- écran 1 — formules */

  /** Groupes de formules, dans l'ordre d'apparition en base. Les formules sans
   *  groupe en forment un sans titre, qui ne porte donc aucun intertitre.
   *
   *  Recompté le 2026-08-19 : **33 formules sur 71 portent un groupe**, sur cinq
   *  fiches — jet-skis, parcs aquatiques, parcs d'attractions, buggys et quads,
   *  observatoires. Le compte précédent, « 32 sur 34 sans famille », datait du
   *  catalogue d'avant l'import du client et disait l'inverse de la réalité :
   *  le groupement n'est pas un cas marginal, il concerne près d'une formule
   *  sur deux. */
  function familles() {
    var groupes = [];
    var index = {};
    config.formulas.forEach(function (f) {
      var cle = f.family || '';
      if (!(cle in index)) {
        index[cle] = groupes.length;
        groupes.push({ label: cle, formulas: [] });
      }
      groupes[index[cle]].formulas.push(f);
    });
    return groupes;
  }

  function ligneFormule(f) {
    var b = el('button', 'choix');
    b.type = 'button';
    b.appendChild(vignette(f.image, 'choix__vignette'));

    var texte = el('div', 'choix__texte');
    texte.appendChild(el('span', 'choix__nom', f.name));
    if (f.desc) {
      texte.appendChild(el('span', 'choix__desc', f.desc));
    }

    // Prix en onyx, jamais or ni taupe (charte) — voir .choix__prix.
    //
    // `priceFloor` et non `price` : il comprend la durée la moins chère, donc
    // il est atteignable. Avec plusieurs durées le montant est un plancher, et
    // il le dit — sans quoi le panneau afficherait plus que ce que la modale
    // vient d'annoncer.
    var prix = el('span', 'choix__prix');
    var plusieursDurees = f.durations && f.durations.length > 1;
    if (plusieursDurees && f.priceFloor > 0) {
      prix.appendChild(el('span', 'choix__depuis', 'à partir de '));
    }
    // Trois cas, comme partout ailleurs depuis la correction de PO-13 : un
    // montant, une gratuité, ou pas de prix. `f.priceFloor > 0` étant faux
    // pour null comme pour 0, les deux tombaient jusqu'ici sur le même
    // libellé — et une formule sans tarif s'annonçait gratuite.
    prix.appendChild(el('span', 'choix__montant',
      f.priceFloor === null
        ? (config.demandeLabel || '')
        : (f.priceFloor > 0 ? formatPrix(f.priceFloor) : (config.zeroLabel || ''))));
    if (f.unit) {
      prix.appendChild(el('span', 'choix__unite', ' · ' + f.unit));
    }
    texte.appendChild(prix);

    if (f.qtyMin > 1) {
      texte.appendChild(el('span', 'choix__min',
        'Minimum ' + f.qtyMin + ' ' + f.qtyLabelPl));
    }

    b.appendChild(texte);
    b.addEventListener('click', function () {
      choisirFormule(f);
    });
    return b;
  }

  function ouvrirChoixFormule() {
    // Une seule formule : la modale demanderait de choisir entre une chose et
    // rien. On la retient et on passe au panneau.
    if (config.formulas.length === 1) {
      choisirFormule(config.formulas[0]);
      return;
    }

    var corps = el('div', 'choix-liste');
    familles().forEach(function (g) {
      if (g.label) {
        corps.appendChild(el('p', 'eyebrow choix-famille', g.label));
      }
      g.formulas.forEach(function (f) {
        corps.appendChild(ligneFormule(f));
      });
    });

    ouvrirModale({ titre: 'Choisissez votre formule', corps: corps });
  }

  function choisirFormule(f) {
    etat.formule = f;
    etat.qty = f.qtyMin;
    // Remis à la durée de la nouvelle formule, et non conservé : revenir en
    // arrière puis changer de formule laisserait sinon un supplément appartenant
    // à une autre formule dans le total.
    etat.duree = dureeParDefaut(f);
    // Lot D : sur une voiture, des dates déjà choisies redonnent leurs jours.
    majJours();
    fermerModale(false);
    afficherPanneau();
  }

  /* --------------------------------------------- écran 2 — configuration */

  /** Compteur : moins, valeur, plus. Un <input type="number"> laisserait
   *  saisir n'importe quoi au clavier et exigerait la même validation en
   *  sortie ; deux boutons bornés par construction ne le permettent pas. */
  function compteur(opts) {
    var bloc = el('div', 'compteur');
    var moins = el('button', 'compteur__btn', '−');
    moins.type = 'button';
    moins.setAttribute('aria-label', 'Retirer');
    var plus = el('button', 'compteur__btn', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Ajouter');
    var valeur = el('span', 'compteur__valeur');
    valeur.setAttribute('aria-live', 'polite');

    function peindre() {
      var v = opts.lire();
      valeur.textContent = v + ' ' + (v > 1 ? opts.plurielLibelle : opts.libelle);
      moins.disabled = v <= opts.min;
      plus.disabled = v >= opts.max;
    }
    moins.addEventListener('click', function () {
      opts.ecrire(Math.max(opts.min, opts.lire() - 1));
      peindre();
      if (opts.apres) { opts.apres(); }
    });
    plus.addEventListener('click', function () {
      opts.ecrire(Math.min(opts.max, opts.lire() + 1));
      peindre();
      if (opts.apres) { opts.apres(); }
    });

    bloc.appendChild(moins);
    bloc.appendChild(valeur);
    bloc.appendChild(plus);
    peindre();
    return bloc;
  }

  function champ(libelle, controle, aide) {
    var b = el('div', 'panneau__champ');
    var l = el('label', 'panneau__label', libelle);
    if (controle.id) { l.htmlFor = controle.id; }
    b.appendChild(l);
    if (aide) { b.appendChild(el('span', 'panneau__aide', aide)); }
    b.appendChild(controle);
    return b;
  }

  var majTotal = function () {};

  function afficherPanneau() {
    var f = etat.formule;
    panneau.textContent = '';

    /* -- formule retenue en tête (SPEC.md §5.3) */
    var tete = el('div', 'panneau__formule');
    var t = el('div', 'panneau__formule-texte');
    t.appendChild(el('p', 'eyebrow', 'Votre formule'));
    t.appendChild(el('p', 'panneau__formule-nom', f.name));
    if (f.unit) {
      t.appendChild(el('p', 'panneau__formule-unite', f.unit));
    }
    tete.appendChild(t);

    if (config.formulas.length > 1) {
      var changer = el('button', 'lien-bouton', 'Changer de formule');
      changer.type = 'button';
      changer.addEventListener('click', function () {
        masquerPanneau();
        cta.focus();
        ouvrirChoixFormule();
      });
      tete.appendChild(changer);
    }
    panneau.appendChild(tete);

    /* -- durée, quand la formule en déclare.
          Deux durées ou plus : un vrai choix, en groupe de boutons radio —
          c'est la sémantique exacte d'un choix unique parmi plusieurs, et
          elle apporte gratuitement la navigation aux flèches.
          Une seule durée : affichée comme information, pas comme choix. Un
          choix à une option est un contrôle mort (même règle que l'écran 1
          sauté sur une formule unique).
          Aucune durée — 17 fiches sur 21 : rien n'est rendu du tout. */
    if (f.durations && f.durations.length > 1) {
      var groupe = el('fieldset', 'duree');
      /* LOT 5 — SUR UN PACK, LA LÉGENDE DIT « Au choix ».
         ───────────────────────────────────────────────────────────────────
         Sur un pack, ce groupe ne porte pas des durées mais une alternative —
         « 1 jet ski (1 h) » ou « Barbecue à bord », au même prix. Le client a
         choisi de la faire passer par `durees.csv` plutôt que d'ajouter une
         colonne : la légende « Durée » était le seul mensonge visible de ce
         chemin, mesuré le 2026-09-11 sur Pack Family et Pack Prestige.

         **« Au choix » plutôt que « Option au choix »** : le libellé doit
         rester vrai quoi que le client saisisse ensuite. Le prix est déjà dit
         par chaque bouton, depuis la donnée — « Incluse » ou « + x AED » —
         et « option » désigne ailleurs sur ce site les suppléments payants de
         l'écran « Complétez votre réservation ».

         **Pas de libellé porté par la donnée** : ni la durée (`label`, `desc`,
         `price`) ni la formule n'ont de clé libre pour le recevoir, `family`
         étant prise par les regroupements de l'écran 1. En ajouter une
         toucherait cinq fichiers, dont le formulaire d'admin, et garderait
         cette condition comme repli pour les formules qui ne la rempliraient
         pas.

         **Borné par `estPack`, donc par `config.group`** — la même voie qu'au
         lot 4, jamais le libellé d'unité. Les 17 formules à durées des trois
         fiches d'activité gardent « Durée », vérifié une par une. */
      var legende = el('legend', 'panneau__label', estPack ? 'Au choix' : 'Durée');
      groupe.appendChild(legende);
      f.durations.forEach(function (d, i) {
        var opt = el('label', 'duree__option');
        var radio = el('input', 'duree__radio');
        radio.type = 'radio';
        radio.name = 'parcours-duree';
        radio.value = String(i);
        radio.checked = (etat.duree === d);
        radio.addEventListener('change', function () {
          etat.duree = d;
          majTotal();
        });
        opt.appendChild(radio);
        // `label` et `desc` sont deux clés depuis le lot 8. Le descriptif aide à
        // départager deux options proches — c'est ici, et ici seulement, qu'il
        // sert : le panier et le message WhatsApp ne reprennent que `label`,
        // qui est court par construction.
        var texte = el('span', 'duree__texte');
        texte.appendChild(el('span', 'duree__label', d.label));
        if (d.desc) {
          texte.appendChild(el('span', 'duree__desc', d.desc));
        }
        opt.appendChild(texte);
        // Onyx, jamais or ni taupe — c'est un prix (règle du lot 4).
        opt.appendChild(el('span', 'duree__prix',
          d.price > 0 ? '+ ' + formatPrix(d.price) : 'Incluse'));
        groupe.appendChild(opt);
      });
      panneau.appendChild(groupe);
    } else if (f.durations && f.durations.length === 1) {
      panneau.appendChild(champ('Durée',
        el('p', 'panneau__valeur', f.durations[0].label),
        f.durations[0].desc || null));
    }

    /* -- quantité : le seul multiplicateur. Quand l'unité comptée est la
          personne, ce compteur EST le champ « nombre de personnes » et le
          champ séparé n'existe pas — une information n'est saisie qu'une
          fois. */
    /* **« Nombre de packs » et non « Quantité ».** Le compteur porte déjà son
       unité à côté du chiffre (« 1 pack »), mais le libellé du champ disait
       « Quantité » — un mot de bon de commande, là où le visiteur choisit
       combien de séjours il réserve. La forme reprend celle qui existe déjà
       pour les personnes, ce qui garde les trois cas parallèles. */
    /* **LOT D — PAS DE COMPTEUR SUR UNE VOITURE.** Les jours se déduisent des
       deux dates ci-dessous ; un compteur à côté demanderait la même chose une
       seconde fois, et les deux pourraient se contredire. */
    if (!estVoiture) {
      panneau.appendChild(champ(
        estPack ? 'Nombre de packs' : (f.qtyIsPeople ? 'Nombre de personnes' : 'Quantité'),
        compteur({
          min: f.qtyMin,
          max: 20,
          libelle: f.qtyLabel,
          plurielLibelle: f.qtyLabelPl,
          lire: function () { return etat.qty; },
          ecrire: function (v) { etat.qty = v; },
          apres: function () { majTotal(); }
        }),
        f.qtyMin > 1 ? 'Minimum ' + f.qtyMin + ' ' + f.qtyLabelPl + '.' : null
      ));
    }

    /* -- date et heure */
    var date = el('input', 'panneau__saisie');
    date.type = 'date';
    date.id = 'parcours-date';
    date.min = aujourdhui();
    date.value = etat.date;

    if (estVoiture) {
      /* LOT D — DE DATE À DATE.
         ─────────────────────────────────────────────────────────────────
         Deux champs de date natifs : le calendrier est celui du téléphone ou
         du navigateur du visiteur, sans une ligne de script ni de style à
         tenir. La fin est bornée par le début — le lendemain au plus tôt, ou
         le plancher de la formule — et la validation la recontrôle : certains
         navigateurs de téléphone n'appliquent pas `min` dans leur calendrier.

         **Une fin devenue impossible est vidée, pas corrigée** : la déplacer
         d'office ferait réserver des jours que le visiteur n'a pas choisis.

         **La durée est dite sous les champs**, avec la date de fin rappelée :
         c'est le récapitulatif demandé, et il se relit au total. */
      var fin = el('input', 'panneau__saisie');
      fin.type = 'date';
      fin.id = 'parcours-date-fin';
      fin.value = etat.dateFin;

      var rappel = el('p', 'panneau__valeur');
      rappel.setAttribute('aria-live', 'polite');

      var bornerFin = function () {
        var base = (etat.date && etat.date >= aujourdhui()) ? etat.date : aujourdhui();
        fin.min = ajouterJours(base, joursMin());
      };
      /* Un refus affiché ne survit pas à la correction de sa cause : le message
         « la fin suit le début » restait à l'écran sous une période devenue
         juste, jusqu'au clic suivant. `erreur` est créé plus bas dans cette
         fonction ; il existe quand un champ change. */
      var peindreRappel = function () {
        if (erreur) { erreur.hidden = true; }
        var n = joursLocation();
        rappel.textContent = n === null
          ? 'Indiquez vos deux dates.'
          : joursLisibles(n) + ' — fin le ' + dateLisible(etat.dateFin);
      };

      date.addEventListener('change', function () {
        etat.date = date.value;
        bornerFin();
        if (etat.dateFin && joursLocation() === null) {
          etat.dateFin = '';
          fin.value = '';
        }
        majJours();
        peindreRappel();
        majTotal();
      });
      fin.addEventListener('change', function () {
        etat.dateFin = fin.value;
        majJours();
        peindreRappel();
        majTotal();
      });

      bornerFin();
      majJours();
      peindreRappel();
      panneau.appendChild(champ('Début de la location', date));
      panneau.appendChild(champ('Fin de la location', fin,
        joursMin() > 1 ? 'Minimum ' + joursLisibles(joursMin()) + '.' : null));
      panneau.appendChild(champ('Durée de la location', rappel));
    } else {
      date.addEventListener('change', function () {
        etat.date = date.value;
        majTotal();
      });
      panneau.appendChild(champ('Votre date', date));
    }

    /* **PAS D'HEURE SUR UN PACK**, décision du client du 2026-09-08.
       Un pack dure des jours — cinq ou sept sur les sept du client — et
       demander un créneau d'une demi-heure n'y a pas de sens.

       Le champ n'est pas construit du tout : `etat.heure` garde donc sa valeur
       initiale, la chaîne vide. La ligne de panier porte `time: ''`, et les
       trois affichages qui la lisent sont déjà gardés par `etat.heure ?` ou
       `l.time ?` — rien d'autre à modifier pour cela. */
    if (!estPack) {
      // Liste de créneaux plutôt qu'un `<input type="time">` : celui-ci acceptait
      // n'importe quelle valeur au clavier, et sa contrainte `step` n'est
      // appliquée qu'à la soumission d'un formulaire — or il n'y en a pas ici.
      // Un <select> est borné par construction, sans validation à écrire.
      var heure = el('select', 'panneau__saisie');
      heure.id = 'parcours-heure';
      var sansPref = el('option', null, 'Sans préférence');
      sansPref.value = '';
      heure.appendChild(sansPref);
      creneaux().forEach(function (c) {
        var o = el('option', null, c);
        o.value = c;
        heure.appendChild(o);
      });
      heure.value = etat.heure;
      heure.addEventListener('change', function () {
        etat.heure = heure.value;
        majTotal();
      });
      panneau.appendChild(champ('Heure souhaitée', heure,
        'Créneaux d\'une demi-heure. Un conseiller confirme la disponibilité.'));
    }

    /* -- nombre de personnes, seulement s'il n'est pas déjà le compteur */
    /* **Ni compteur de personnes sur un pack.** L'effectif est dans le libellé
       de la formule, il n'est pas une variable du parcours, et le laisser
       ferait croire qu'il change quelque chose. */
    /* **Ni sur une voiture — lot D.** Le tarif porte sur le véhicule, et le
       conseiller n'a rien à faire d'un effectif que le champ fixait à 2. */
    if (!f.qtyIsPeople && !estPack && !estVoiture) {
      panneau.appendChild(champ(
        'Nombre de personnes',
        compteur({
          min: 1,
          max: 30,
          libelle: 'personne',
          plurielLibelle: 'personnes',
          lire: function () { return etat.personnes; },
          ecrire: function (v) { etat.personnes = v; },
          apres: function () { majTotal(); }
        }),
        // Dit explicitement, parce que c'est la question que le visiteur se
        // pose en voyant un total qui ne bouge pas.
        'Sans effet sur le prix : le tarif porte sur ' + (f.unit || 'la prestation') + '.'
      ));
    }

    /* -- demande particulière */
    var note = el('textarea', 'panneau__saisie panneau__zone');
    note.id = 'parcours-note';
    note.rows = 3;
    note.value = etat.note;
    note.addEventListener('input', function () { etat.note = note.value; });
    panneau.appendChild(champ('Une demande particulière ?', note));

    /* -- total, recalculé en continu */
    var totalBloc = el('div', 'panneau__total');
    var detail = el('p', 'panneau__detail');
    var montant = el('p', 'panneau__montant');
    totalBloc.appendChild(el('p', 'eyebrow', 'Total'));
    totalBloc.appendChild(montant);
    totalBloc.appendChild(detail);
    panneau.appendChild(totalBloc);

    var erreur = el('p', 'panneau__erreur');
    erreur.setAttribute('role', 'alert');
    erreur.hidden = true;
    panneau.appendChild(erreur);

    var valider = el('button', 'btn btn--gold panneau__valider', 'Ajouter au panier');
    valider.type = 'button';
    valider.addEventListener('click', function () {
      var probleme = verifier();
      if (probleme) {
        erreur.textContent = probleme;
        erreur.hidden = false;
        return;
      }
      erreur.hidden = true;
      etat.extraQtys = [];
      if ((config.extras || []).length > 0) {
        ouvrirExtra();
      } else {
        // Aucun extra réservable : l'écran 3 est sauté entièrement, pas affiché
        // vide. Depuis le retrait du seuil, le cas se réduit aux fiches sans
        // aucun extra — 11 sur 31, relevées en base le 2026-09-03.
        conclure();
      }
    });
    panneau.appendChild(valider);

    majTotal = function () {
      montant.textContent = libelleTotal();
      /* Lot D — sur une voiture, le détail dit la période, fin comprise. Tant
         qu'elle manque, il dit ce que vaut le montant affiché : le tarif du
         plancher de jours, pas un total. */
      if (estVoiture) {
        var jours = joursLocation();
        // Sans tarif (« Prix sur demande »), il n'y a pas de montant à qualifier.
        detail.textContent = jours === null
          ? (total() === null ? 'Indiquez vos deux dates.' : 'Tarif pour ' + joursLisibles(joursMin()) + '. Le total suit vos dates.')
          : etat.formule.name + ' × ' + joursLisibles(jours) + ' · ' + periodeLisible(false);
        return;
      }
      var lignes = [];
      // Le détail « Formule × N » se tait sur une gratuité, où il n'y a rien à
      // multiplier — mais il s'affiche quand le prix est simplement inconnu :
      // la quantité, elle, a bien été choisie, et le conseiller en a besoin
      // pour chiffrer. `> 0` écartait les deux cas sans les distinguer.
      if (etat.formule.price !== 0) {
        lignes.push(etat.formule.name + ' × ' + etat.qty + ' '
          + (etat.qty > 1 ? etat.formule.qtyLabelPl : etat.formule.qtyLabel));
      }
      if (etat.duree) {
        lignes.push(etat.duree.label);
      }
      // `personnes()` rend `null` sur un pack (PO-156) : rien à dire ici.
      if (!etat.formule.qtyIsPeople && personnes() !== null) {
        lignes.push(personnes() + (personnes() > 1 ? ' personnes' : ' personne'));
      }
      if (etat.date) {
        lignes.push(dateLisible(etat.date) + (etat.heure ? ' à ' + heureLisible(etat.heure) : ''));
      }
      detail.textContent = lignes.join(' · ');
    };
    majTotal();

    bloc.hidden = true;
    panneau.hidden = false;
    // Le panneau prend la place du bloc statique : le focus doit le suivre,
    // sinon il reste sur un bouton devenu invisible.
    panneau.setAttribute('tabindex', '-1');
    panneau.focus();
  }

  function masquerPanneau() {
    panneau.hidden = true;
    panneau.textContent = '';
    bloc.hidden = false;
  }

  /** Une seule règle de validation, et elle est explicable : on ne réserve pas
   *  dans le passé. Aucun délai minimal de réservation n'est appliqué — il
   *  n'est écrit nulle part, et l'inventer engagerait le client sur une
   *  contrainte qu'il n'a pas posée. */
  function verifier() {
    if (!etat.date) {
      return estVoiture ? 'Indiquez la date de début de la location.' : 'Indiquez la date souhaitée.';
    }
    if (etat.date < aujourdhui()) {
      return 'Cette date est passée. Choisissez le ' + dateLisible(aujourdhui()) + ' ou une date suivante.';
    }
    /* Lot D — la fin d'une location. Elle suit le début d'au moins un jour, ou
       du plancher de la formule ; le message nomme la première date possible
       plutôt que de dire seulement ce qui ne va pas. */
    if (estVoiture) {
      if (!etat.dateFin) {
        return 'Indiquez la date de fin de la location.';
      }
      if (joursLocation() === null) {
        var premiere = dateLisible(ajouterJours(etat.date, joursMin()));
        return joursMin() > 1
          ? 'La location dure au moins ' + joursLisibles(joursMin()) + '. Choisissez une fin le ' + premiere + ' ou après.'
          : 'La fin de la location suit son début. Choisissez le ' + premiere + ' ou une date suivante.';
      }
    }
    return null;
  }

  /* ------------------------------------------------------ écran 3 — extra */

  /**
   * PO-231 (2026-10-10) — les durées d'un extra, en DEUX PASTILLES SUR UNE
   * LIGNE (« 40 min · 1h »), décision du client.
   *
   * **La sémantique de l'écran 2, pas sa mise en page** : un groupe de boutons
   * radio — choix unique, flèches du clavier offertes par le navigateur — mais
   * une ligne au lieu d'une durée par ligne. Motif mesuré : la hauteur de la
   * carte décide si le compteur reste à l'écran au téléphone (PO-223,
   * PO-228) ; deux lignes l'en auraient fait sortir. Le prix n'est pas dans
   * la pastille : il est sur la ligne de prix de la carte, qui suit le choix.
   * Un nom par carte (`extra-duree-<rang>`) : les groupes sont indépendants.
   */
  function pastillesDuree(x, i, surChoix) {
    var groupe = el('fieldset', 'extra__durees');
    groupe.appendChild(el('legend', 'sr-only', 'Durée — ' + x.name));
    x.durations.forEach(function (d, k) {
      var pastille = el('label', 'extra__pastille');
      // `sr-only` : le rond sort de l'écran, reste dans l'arbre et prend le focus.
      var radio = el('input', 'extra__pastille-radio sr-only');
      radio.type = 'radio';
      radio.name = 'extra-duree-' + i;
      radio.value = String(k);
      radio.checked = (etat.extraDurees[i] === d);
      radio.addEventListener('change', function () {
        etat.extraDurees[i] = d;
        surChoix();
      });
      pastille.appendChild(radio);
      pastille.appendChild(el('span', 'extra__pastille-texte', d.label));
      groupe.appendChild(pastille);
    });
    return groupe;
  }

  function ouvrirExtra() {
    var liste = config.extras || [];
    /* LOT M7 (2026-09-28, PO-208) — LES EXTRAS EN RAIL. Les cartes défilent de
       gauche à droite au lieu de s'empiler, comme la note du client le
       demande, **même sans photo** : le cadre vide montre au client ce qu'il
       lui reste à fournir, et `db/backfill_photos_extras.php` le remplira.

       Le rail est une bande `defileur` comme celles de l'accueil : la piste se
       balaie au doigt sans script, et `defileur.js` montre les deux flèches
       au-dessus de 640 px s'il y a de quoi défiler — une souris ne balaie pas
       une bande dans une modale. Sous 640 px, pas de flèches (règle du lot
       M3) : l'amorce de la carte suivante suffit, et sa largeur est garantie
       par construction (`--extras-par-ecran`, `site.css`).

       **2026-10-06 — LE CARROUSEL CENTRÉ, comme les packs de l'accueil**,
       demande du client : l'extra courant au milieu, ses voisins réduits et
       coupés, des flèches à toutes les largeurs, qui avancent d'UN extra.
       `extras-rail--centre` pour la mise en page, `data-defileur-centre` pour
       dire que la bande se câble par `carrouselCentre()` (`defileur.js`). Les
       deux paragraphes ci-dessus décrivent le rail d'avant : la largeur est
       désormais `--centre-extra`, et les flèches restent au téléphone. */
    var corps = el('div', 'extras-rail extras-rail--centre');
    if (window.innerHeight >= PHOTO_HAUTE_MIN) {
      corps.classList.add('extras-rail--photo-haute');
    }
    corps.setAttribute('data-defileur', '');
    corps.setAttribute('data-defileur-centre', '');
    var commandes = el('p', 'defileur__commandes');
    commandes.setAttribute('data-defileur-commandes', '');
    commandes.hidden = true;
    [[-1, 'Voir les options précédentes'], [1, 'Voir les options suivantes']].forEach(function (f) {
      var b = el('button', 'defileur__fleche defileur__fleche--' + (f[0] < 0 ? 'prec' : 'suiv'));
      b.type = 'button';
      b.setAttribute('data-defileur-sens', String(f[0]));
      b.appendChild(el('span', 'sr-only', f[1]));
      commandes.appendChild(b);
    });
    corps.appendChild(commandes);
    var piste = el('div', 'extras extras--rail');
    piste.setAttribute('data-defileur-piste', '');
    corps.appendChild(piste);

    liste.forEach(function (x, i) {
      var bloc = el('div', 'extra');
      /* LA DESCRIPTION N'EST PLUS AFFICHÉE — 2026-10-12. Elle a quitté la face
         de la carte (décision du client du 2026-10-11), puis le bouton
         « Détails » qui la montrait sur la photo a été retiré le 2026-10-12 :
         il cachait la photo, et le texte ne s'y lisait pas en entier.
         **`x.descLong` reste dans la configuration et en base** : le client
         tranche encore sur ce qu'il en garde — plusieurs descriptions portent
         une condition de prix que rien d'autre ne dit (« Tarif par voiture,
         7 places maximum »). Inventaire : `SUIVI.md`, entrée du 2026-10-12. */
      bloc.appendChild(vignette(x.image, 'extra__vignette'));

      var texte = el('div', 'extra__texte');
      texte.appendChild(el('p', 'extra__nom', x.name));
      // « Sans supplément » est une promesse commerciale : elle ne se dit que
      // d'un extra dont le prix est connu et vaut zéro. Un extra sans prix —
      // la « Décoration » de la flotte de yachts, par exemple — s'annonçait
      // gratuit jusqu'au lot des durées, faute de savoir distinguer null de 0.
      /* PO-231 (2026-10-10) — LA DURÉE DANS LA CARTE. La durée retenue par
         défaut est la moins chère, règle de l'écran 2 (`dureeParDefaut()`),
         et le prix affiché la comprend : il SUIT le choix — « + 1 500 AED »
         devient « + 1 950 AED ». */
      etat.extraDurees[i] = dureeParDefaut(x);
      /* 2026-10-12 — CE QUE COUVRE LE PRIX, SUR LA LIGNE DU PRIX : « + 100 AED
         par personne ». Écrit par le client (`x.unit`, 16 caractères au plus,
         borne mesurée : `includes/saisie.php`), au procédé de l'écran 1
         (`.choix__unite`). **Seulement après un montant** : « Prix sur
         demande par personne » ou « Sans supplément par personne » ne
         voudraient rien dire. Le montant a son propre nœud, que la durée
         repeint ; la mention ne bouge pas. */
      var prix = el('p', 'extra__prix');
      var montantPrix = el('span', 'extra__montant');
      prix.appendChild(montantPrix);
      var unite = x.unit ? el('span', 'extra__unite', ' ' + x.unit) : null;
      var peindrePrix = function () {
        var montant = x.price === null ? null : x.price + supplementExtra(i);
        montantPrix.textContent = montant === null
          ? (config.demandeLabel || '')
          : (montant > 0 ? '+ ' + formatPrix(montant) : 'Sans supplément');
        if (unite) {
          if (montant > 0) {
            prix.appendChild(unite);
          } else if (unite.parentNode) {
            unite.remove();
          }
        }
      };
      peindrePrix();
      texte.appendChild(prix);
      if (x.durations && x.durations.length > 1) {
        texte.appendChild(pastillesDuree(x, i, peindrePrix));
      } else if (x.durations && x.durations.length === 1) {
        // Une seule durée : une information, pas un choix (règle de l'écran 2).
        texte.appendChild(el('p', 'extra__duree', x.durations[0].label));
      }
      bloc.appendChild(texte);

      /* **Le compteur part de zéro, et c'est le changement de fond.** Avec un
         extra unique, la modale entière était le choix : « Ajouter » valait
         oui, « Non merci » valait non, et la quantité pouvait donc démarrer à
         1. Avec plusieurs, il faut dire lequel on prend — chaque ligne porte
         son propre compteur, et zéro veut dire « pas celui-là ».

         Un extra sans quantité maximale (`quantity_max` à 0, la « simple case à
         cocher » de SPEC.md §4.2) reçoit un compteur borné à 1 : il se comporte
         comme une case sans introduire un second type de contrôle dans le
         parcours. *Le libellé « 0 unité / 1 unité » n'est pas idéal pour un
         oui-non ; c'est signalé dans SUIVI.md plutôt que réglé en inventant un
         composant.* */
      etat.extraQtys[i] = 0;
      var combien = champ('Combien ?', compteur({
        min: 0,
        max: x.quantityMax > 0 ? x.quantityMax : 1,
        libelle: 'unité',
        plurielLibelle: 'unités',
        lire: function () { return etat.extraQtys[i] || 0; },
        ecrire: function (v) { etat.extraQtys[i] = v; }
      }));
      /* PO-228 (2026-10-11), décision du client — « Combien ? » SORT DE
         L'ÉCRAN, PAS DE L'ARBRE : `sr-only`, et un lecteur d'écran l'annonce
         toujours avant le compteur. Mesuré : +34 px pour le compteur, ce qui
         remet l'iPhone SE (375 × 553 visibles) à flot sur les cartes à
         pastilles dont le nom tient sur une ligne. Le compteur — « − 0 unité
         + » — se lit seul. Les autres compteurs du parcours gardent leur
         libellé : seul l'écran 3 manquait de hauteur. */
      combien.querySelector('.panneau__label').classList.add('sr-only');
      bloc.appendChild(combien);

      piste.appendChild(bloc);
    });

    // Deux sorties également visibles (SPEC.md §5.3) : refuser n'est pas un
    // lien discret sous un gros bouton.
    var pied = el('div', 'modale__actions');
    var refuser = el('button', 'btn btn--sobre', 'Non merci');
    refuser.type = 'button';
    refuser.addEventListener('click', function () {
      etat.extraQtys = [];
      fermerModale(false);
      conclure();
    });
    var ajouter = el('button', 'btn btn--sobre', 'Ajouter');
    ajouter.type = 'button';
    ajouter.addEventListener('click', function () {
      fermerModale(false);
      conclure();
    });
    pied.appendChild(refuser);
    pied.appendChild(ajouter);

    ouvrirModale({
      titre: 'Complétez votre réservation',
      corps: corps,
      pied: pied,
      // Fermer la modale sans choisir vaut refus : on n'ajoute pas un
      // supplément que le visiteur n'a pas accepté.
      surFermeture: function () {
        etat.extraQtys = [];
        conclure();
      }
    });

    /* Câblé APRÈS l'ouverture : `defileur()` mesure la piste pour décider des
       flèches, et une piste pas encore dans le document mesure zéro. Sans
       `defileur.js` — il n'est pas chargé sur un pack avant ce lot, et un
       échec de chargement reste possible —, la bande se balaie au doigt et les
       flèches restent `hidden` : rien de mort à l'écran. */
    if (window.D4R && window.D4R.carrouselCentre) {
      window.D4R.carrouselCentre(corps);
    }
  }

  /* ----------------------------------------------- écran 4 — confirmation */

  function conclure() {
    var conserve = ajouterAuPanier();

    var corps = el('div', 'confirme');

    /* LOT C (2026-10-01) — LA PHOTO DU PRODUIT, demande du client final : « une
       fenêtre de confirmation avec la photo ». La vignette de la fiche
       (`config.photo`, le dérivé de 400 px) et son nom ouvrent la fenêtre ;
       sans photo — les 115 voitures aujourd'hui — le cadre porte le glyphe de
       la catégorie, comme sur la carte. `alt` vide : la photo redouble le nom
       écrit à côté. Une photo qui ne charge pas cède la place au glyphe. */
    var tete = el('div', 'confirme__tete');
    var cadre = el('span', 'confirme__photo');
    var poserGlyphe = function () {
      if (!config.iconId) { return; }
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'icone confirme__glyphe');
      svg.setAttribute('aria-hidden', 'true');
      var use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', '#' + config.iconId);
      svg.appendChild(use);
      cadre.appendChild(svg);
    };
    if (config.photo) {
      var photo = document.createElement('img');
      photo.alt = '';
      photo.decoding = 'async';
      photo.onerror = function () {
        if (photo.parentNode) { photo.parentNode.removeChild(photo); }
        poserGlyphe();
      };
      photo.src = config.photo;
      cadre.appendChild(photo);
    } else {
      poserGlyphe();
    }
    tete.appendChild(cadre);
    tete.appendChild(el('p', 'confirme__nom', config.name));
    corps.appendChild(tete);

    corps.appendChild(el('p', 'confirme__ligne', etat.formule.name
      + ' × ' + (estVoiture ? joursLisibles(etat.qty) : etat.qty + ' '
      + (etat.qty > 1 ? etat.formule.qtyLabelPl : etat.formule.qtyLabel))));
    if (etat.duree) {
      corps.appendChild(el('p', 'confirme__ligne', etat.duree.label));
    }
    if (estVoiture) {
      // Lot D : la période, fin comprise.
      corps.appendChild(el('p', 'confirme__ligne', periodeLisible(true)));
    } else if (etat.date) {
      corps.appendChild(el('p', 'confirme__ligne',
        dateLisible(etat.date) + (etat.heure ? ' à ' + heureLisible(etat.heure) : '')));
    }
    // Idem : sur un pack, `personnes()` rend `null` et la ligne n'existe pas.
    if (personnes() !== null) {
      corps.appendChild(el('p', 'confirme__ligne',
        personnes() + (personnes() > 1 ? ' personnes' : ' personne')));
    }
    (config.extras || []).forEach(function (x, i) {
      var q = etat.extraQtys[i] || 0;
      if (q > 0) {
        // PO-231 : « Can-Am R 2024 — 1h » — la chaîne d'avant le regroupement.
        var d = etat.extraDurees[i];
        corps.appendChild(el('p', 'confirme__ligne', x.name + (d ? ' — ' + d.label : '') + (q > 1 ? ' × ' + q : '')));
      }
    });
    corps.appendChild(el('p', 'confirme__total', libelleTotal()));
    corps.appendChild(el('p', 'confirme__note',
      'Aucun paiement en ligne. Un conseiller confirme la disponibilité et le prix sur WhatsApp.'));

    if (!conserve) {
      // Échec du stockage dit franchement, pas d'échec silencieux. Aucune
      // couleur d'erreur hors palette : le message se compose en onyx sur
      // sable, comme le reste (charte).
      corps.appendChild(el('p', 'confirme__alerte',
        'Votre navigateur n\'autorise pas la conservation du panier. '
        + 'Cette réservation reste affichée tant que vous ne fermez pas cette page.'));
    }

    var pied = el('div', 'modale__actions');
    var continuer = el('a', 'btn btn--sobre', 'Voir d\'autres ' + (config.sectionLabel || 'offres').toLowerCase());
    continuer.href = config.sectionHref;
    var voir = el('a', 'btn btn--sobre', 'Voir le panier');
    voir.href = '/panier';
    /* Lot C : « Voir le panier » ouvre le PANNEAU, comme l'icône de l'en-tête.
       Le lien reste un lien vers `/panier` — c'est lui qui sert si le panneau
       ne peut pas s'ouvrir, ou avec Ctrl+clic. Le focus est d'abord rendu au
       bouton de réservation : c'est à lui que le panneau le rendra en se
       refermant, cette fenêtre-ci n'existant plus. */
    voir.addEventListener('click', function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !window.D4R.ouvrirPanier) {
        return;
      }
      masquerPanneau();
      cta.focus();
      if (window.D4R.ouvrirPanier()) {
        e.preventDefault();
      }
    });
    pied.appendChild(continuer);
    pied.appendChild(voir);

    ouvrirModale({
      titre: 'Réservation enregistrée',
      corps: corps,
      pied: pied,
      surFermeture: function () {
        masquerPanneau();
        cta.focus();
      }
    });
  }

  /* ------------------------------------------------------------- amorçage */

  cta.addEventListener('click', ouvrirChoixFormule);
  cta.hidden = false;
})();
