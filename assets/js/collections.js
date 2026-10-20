/**
 * Panier, favoris et message WhatsApp (SPEC.md §5.2 et §5.4, lot 8). Vanilla,
 * aucune dépendance, aucune compilation.
 *
 * Un seul fichier pour trois emplois — le bouton de favori sur la fiche, la
 * page /panier, la page /favoris — chaque partie gardée par la présence de son
 * ancre dans le document. Trois fichiers auraient recopié trois fois la lecture
 * du stockage et la mise en forme des prix.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TOTAL N'EST PAS UN MONTANT DE TRANSACTION.
 *
 * Aucun paiement ne passe en ligne : la réservation se termine sur WhatsApp et
 * le prix est confirmé par un conseiller (SPEC.md §5.4). Le total affiché ici,
 * et celui du message, sont indicatifs — le message le dit en toutes lettres.
 * Une session future ne doit ni les traiter comme une somme due, ni bâtir
 * dessus un encaissement sans les recalculer côté serveur.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PANIER NE FAIT PAS CONFIANCE À CE QU'IL A STOCKÉ.
 *
 * Une ligne fige un prix, un nom et une adresse au moment de l'ajout, et le
 * catalogue continue de bouger : un tarif change depuis l'admin, une fiche est
 * désactivée, une fiche est supprimée. Chaque ligne est donc rapprochée de
 * l'index du catalogue vivant (voir catalogueIndex() en PHP) avant d'être
 * affichée, et son montant recalculé sur les prix du jour. Rien n'est supprimé
 * d'office : une ligne périmée est marquée, sort du total, et le visiteur
 * décide de la retirer. Un panier qui rétrécit tout seul est pire qu'un panier
 * qui explique.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Toute donnée est posée par `textContent`, jamais par `innerHTML` :
 * l'échappement est structurel, pas une précaution à ne pas oublier.
 */
(function () {
  'use strict';

  var CLE_PANIER = 'd4r.panier.v1';
  var CLE_FAVORIS = 'd4r.favoris.v1';

  /* ------------------------------------------------------------- stockage */

  /**
   * Lecture d'un sac versionné. Rend toujours un tableau : une version inconnue,
   * un contenu abîmé ou un stockage refusé (navigation privée sur Safari, quota
   * dépassé) donnent une liste vide plutôt qu'une exception qui casserait la
   * page. La version n'est pas une décoration — elle écarte les données d'un
   * format futur qu'on ne saurait pas lire.
   */
  function lire(cle) {
    try {
      var brut = window.localStorage.getItem(cle);
      var sac = brut ? JSON.parse(brut) : null;
      if (sac && sac.v === 1 && Array.isArray(sac.items)) { return sac.items; }
    } catch (e) { /* rien : liste vide */ }
    return [];
  }

  /** @return true si l'écriture a tenu. L'appelant en tient compte plutôt que
   *  de laisser croire à un enregistrement qui n'a pas eu lieu. */
  function ecrire(cle, items) {
    try {
      window.localStorage.setItem(cle, JSON.stringify({ v: 1, items: items }));
      if (window.d4rMajCompteurs) { window.d4rMajCompteurs(); }
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------ mise en forme
   * Ces trois fonctions existent aussi dans parcours.js, qui est chargé sur la
   * fiche à côté de ce fichier. La duplication est connue et inscrite en point
   * ouvert : elle n'a pas été résolue dans ce lot pour ne pas rouvrir du code
   * du lot 7 déjà vérifié en fin de parcours. `formatPrix` reprend par ailleurs
   * `formatPrice()` de PHP, duplication déjà documentée et assumée. */

  /** Séparateur de milliers par espace, aucune décimale, suffixe AED. Écrit à
   *  la main plutôt que par toLocaleString(), qui pose une espace insécable
   *  étroite (U+202F) là où PHP pose une espace ordinaire — les deux mises en
   *  forme se côtoient sur la même page. */
  function formatPrix(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' AED';
  }

  function dateLisible(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) { return String(iso || ''); }
    var mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
      'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    var jour = parseInt(p[2], 10);
    // Le premier du mois s'écrit « 1er » en français, les autres en cardinal.
    return jour + (jour === 1 ? 'er' : '') + ' ' + mois[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  /** « 15:30 » devient « 15h30 », « 15:00 » devient « 15h ». Les créneaux sont
   *  stockés au format d'horloge, qui est celui d'un champ de saisie, pas celui
   *  d'une phrase française. Un « 15h00 » serait correct mais personne ne
   *  l'écrit ainsi. */
  function heureLisible(hhmm) {
    var p = String(hhmm || '').split(':');
    if (p.length !== 2) { return String(hhmm || ''); }
    return parseInt(p[0], 10) + 'h' + (p[1] === '00' ? '' : p[1]);
  }

  /** Lot D. La période d'une location de voiture : « du 3 octobre 2026 à 10h
   *  au 5 octobre 2026 ». Jumelle de `periodeLisible()` dans `parcours.js` —
   *  le panier et le message WhatsApp doivent dire la même phrase que le
   *  panneau et la confirmation. `null` quand la ligne ne porte pas de fin :
   *  toute ligne qui n'est pas une voiture, et toute voiture mise au panier
   *  avant ce lot, qui garde son ancienne écriture. */
  function periodeLisible(l, majuscule) {
    if (l.group !== 'car' || !l.date || !l.dateEnd) { return null; }
    return (majuscule ? 'Du ' : 'du ') + dateLisible(l.date)
      + (l.time ? ' à ' + heureLisible(l.time) : '')
      + ' au ' + dateLisible(l.dateEnd);
  }

  /* --------------------------------------------------------------- outils */

  function el(tag, classe, texte) {
    var n = document.createElement(tag);
    if (classe) { n.className = classe; }
    if (texte !== undefined && texte !== null) { n.textContent = texte; }
    return n;
  }

  /** Configuration écrite par PHP (index du catalogue, numéro, libellés de prix
   *  nul). Absente sur la fiche, où seul le bouton de favori nous intéresse. */
  function configuration() {
    var ilot = document.getElementById('collections-data');
    if (!ilot) { return null; }
    try {
      var c = JSON.parse(ilot.textContent);
      return (c && c.catalogue) ? c : null;
    } catch (e) {
      return null;
    }
  }

  /* ------------------------------------------------- favori, sur la fiche */

  function estFavori(slug) {
    return lire(CLE_FAVORIS).some(function (f) { return f.slug === slug; });
  }

  /**
   * Boutons de favori. L'état se lit sur quatre signaux concordants : le
   * remplissage du cœur (contour au repos, aplat rosé activé), la classe
   * `is-actif`, le libellé — qui dit l'action à venir, pas l'état, comme le
   * veut la charte —, et `aria-pressed` pour ceux qui n'ont pas l'image.
   * Ni étoile, ni badge coloré, ni or.
   *
   * **Pluriel depuis le lot accueil (PO-36).** Le bouton n'est plus seul sur la
   * fiche : chaque carte de grille en porte un, donc jusqu'à une douzaine par
   * page, et **une même fiche peut en avoir deux à l'écran** — sa propre carte
   * dans « Vous aimerez aussi » et celle d'une grille. Toute bascule repeint
   * donc **tous** les boutons, pas seulement celui qu'on vient de cliquer :
   * deux cœurs de la même fiche qui se contrediraient seraient pires que pas de
   * cœur du tout.
   *
   * Le libellé vit dans `[data-favori-libelle]` et non sur le bouton :
   * `textContent` sur le bouton effacerait le `<svg>` de l'icône.
   */
  function brancherFavori() {
    var boutons = [].slice.call(document.querySelectorAll('[data-favori]'));
    if (!boutons.length) { return; }

    function peindreUn(bouton) {
      var slug = bouton.getAttribute('data-favori');
      var actif = estFavori(slug);
      var libelle = bouton.querySelector('[data-favori-libelle]');
      if (libelle) {
        libelle.textContent = actif ? 'Retirer des favoris' : 'Ajouter aux favoris';
      }
      // L'icône bascule par sa référence : un seul sprite, deux symboles, aucun
      // second fichier à charger. `href` et non `xlink:href`, déprécié.
      var use = bouton.querySelector('use');
      if (use) { use.setAttribute('href', actif ? '#d4r-coeur-rose' : '#d4r-coeur'); }
      bouton.setAttribute('aria-pressed', actif ? 'true' : 'false');
      bouton.classList.toggle('is-actif', actif);
    }

    function peindreTous() { boutons.forEach(peindreUn); }

    boutons.forEach(function (bouton) {
      var slug = bouton.getAttribute('data-favori');
      if (!slug) { return; }
      /* Déjà branché par un passage précédent : voir `D4R.brancherFavoris`, en
         fin de fichier. Deux écouteurs sur un même cœur l'ajouteraient puis le
         retireraient au même clic. */
      if (bouton.d4rFavori) { return; }
      bouton.d4rFavori = true;

      bouton.addEventListener('click', function (e) {
        /* La carte est un `<a>` et le bouton est son **frère**, pas son enfant
           (voir render_product_card) : un clic ici ne peut donc pas atteindre
           le lien. Ces deux lignes ne réparent pas la structure, elles la
           protègent — le jour où quelqu'un remettrait le bouton à l'intérieur
           du lien, le clic n'ouvrirait toujours pas la fiche. */
        e.preventDefault();
        e.stopPropagation();

        var items = lire(CLE_FAVORIS);
        if (estFavori(slug)) {
          items = items.filter(function (f) { return f.slug !== slug; });
        } else {
          items.push({
            slug: slug,
            group: bouton.getAttribute('data-favori-groupe') || '',
            // Étiquette de dernier recours, utilisée **seulement** si la fiche a
            // disparu du catalogue : sans elle, /favoris dirait qu'une fiche n'est
            // plus disponible sans pouvoir dire laquelle. L'index l'emporte
            // toujours quand il répond — ce n'est pas une seconde source.
            name: bouton.getAttribute('data-favori-nom') || '',
            addedAt: new Date().toISOString()
          });
        }
        if (!ecrire(CLE_FAVORIS, items)) {
          // Échec du stockage dit franchement plutôt qu'un bouton qui change
          // d'état sans que rien ne soit enregistré. Le message remplace le
          // libellé, jamais le bouton entier : l'icône reste en place.
          var libelle = bouton.querySelector('[data-favori-libelle]');
          if (libelle) { libelle.textContent = 'Favoris indisponibles sur ce navigateur'; }
          bouton.disabled = true;
          return;
        }
        peindreTous();
      });

      bouton.hidden = false;
    });

    peindreTous();
  }

  /* --------------------------------------------- rapprochement au catalogue */

  /**
   * Confronte une ligne de panier au catalogue vivant.
   *
   * Trois états, et un quatrième cas qui n'en est pas un :
   *
   * - `ok` — tout est retrouvé, le montant est recalculé sur les prix du jour.
   *   Si ce montant diffère de celui figé à l'ajout, `ancien` le porte et la
   *   ligne le dit : un tarif qui a changé ne passe pas en silence.
   * - `indisponible` — le slug n'est plus dans l'index. **Fiche désactivée et
   *   fiche supprimée sont indiscernables ici**, l'index ne portant que les
   *   fiches actives : dans les deux cas la prestation n'est plus proposée,
   *   c'est tout ce qu'il y a à en dire. Aucun lien n'est rendu — c'est ce qui
   *   garantit qu'une ligne ne pointe jamais vers une 404.
   * - `a-revoir` — la fiche existe, mais la formule, la durée ou l'extra
   *   retenus n'y sont plus (renommés, retirés). Le lien vers la fiche est
   *   conservé : elle est vivante, le visiteur peut refaire son choix.
   *
   * Les deux derniers états sortent du total et du message : on n'envoie pas à
   * la conciergerie un montant qui contient une prestation impossible.
   */
  function resoudre(ligne, catalogue) {
    var fiche = catalogue[ligne.slug];
    if (!fiche) {
      return { etat: 'indisponible', nom: ligne.name || '', href: null, groupe: ligne.group || '' };
    }

    var base = { nom: fiche.n, href: fiche.h, groupe: fiche.g };
    var formule = fiche.f ? fiche.f[ligne.formula && ligne.formula.name] : null;
    if (!formule) {
      base.etat = 'a-revoir';
      base.motif = 'Cette formule n\'est plus disponible sur cette prestation.';
      return base;
    }

    // `duration` vaut null sur une fiche non migrée et `undefined` sur une ligne
    // écrite avant le lot des durées tarifées : on teste la valeur, pas la
    // présence de la clé (SUIVI.md, note pour le lot 8).
    var supplement = 0;
    if (ligne.duration && ligne.duration.label) {
      if (formule.d && Object.prototype.hasOwnProperty.call(formule.d, ligne.duration.label)) {
        supplement = formule.d[ligne.duration.label];
      } else {
        base.etat = 'a-revoir';
        base.motif = 'Cette durée n\'est plus proposée pour cette formule.';
        return base;
      }
    }

    // La durée est un supplément, jamais un facteur : elle s'ajoute au prix de
    // la formule, puis la quantité multiplie l'ensemble. La quantité reste le
    // seul multiplicateur (SPEC.md §5.3).
    //
    // **`p` peut valoir null** depuis la correction de PO-13 : la prestation est
    // alors sur demande, et son total ne se calcule pas. Le tester est
    // obligatoire — `null + 160` vaut 160 en JavaScript et `null * 3` vaut 0 :
    // la ligne aurait affiché un montant inventé, ou zéro, c'est-à-dire gratuit.
    var qty = Math.max(1, parseInt(ligne.qty, 10) || 1);
    var total = formule.p === null ? null : (formule.p + supplement) * qty;

    var extras = [];
    var lignesExtras = Array.isArray(ligne.extras) ? ligne.extras : [];
    for (var i = 0; i < lignesExtras.length; i++) {
      var x = lignesExtras[i];
      if (!fiche.x || !Object.prototype.hasOwnProperty.call(fiche.x, x.name)) {
        base.etat = 'a-revoir';
        base.motif = 'Un extra choisi n\'est plus proposé sur cette prestation.';
        return base;
      }
      /* PO-231 (2026-10-10) — LA DURÉE D'UN EXTRA, comme celle d'une formule :
         un supplément retrouvé dans l'index (`xd`), ou la ligne « à revoir »
         si la durée n'y est plus. **Une ligne sans durée sur un extra qui en
         a désormais** est aussi « à revoir » : l'ancien prix ne dit plus
         laquelle elle valait. Le nom affiché recompose la chaîne d'avant le
         regroupement — « Can-Am R 2024 — 1h » —, si bien que le panier et le
         message WhatsApp gardent exactement le libellé d'avant. */
      var dureesX = fiche.xd && Object.prototype.hasOwnProperty.call(fiche.xd, x.name) ? fiche.xd[x.name] : null;
      var supX = 0;
      var nomX = x.name;
      if (x.duration && x.duration.label) {
        if (!dureesX || !Object.prototype.hasOwnProperty.call(dureesX, x.duration.label)) {
          base.etat = 'a-revoir';
          base.motif = 'Cette durée n\'est plus proposée pour un extra choisi.';
          return base;
        }
        supX = dureesX[x.duration.label];
        nomX = x.name + ' — ' + x.duration.label;
      } else if (dureesX) {
        base.etat = 'a-revoir';
        base.motif = 'Un extra choisi se réserve désormais avec une durée.';
        return base;
      }
      var qx = Math.max(1, parseInt(x.qty, 10) || 1);
      extras.push({ name: nomX, qty: qx });
      // Un extra sans prix rend toute la ligne indéterminée : additionner la
      // formule et taire l'extra donnerait un montant qui paraît complet.
      if (fiche.x[x.name] === null) {
        total = null;
      } else if (total !== null) {
        total += (fiche.x[x.name] + supX) * qx;
      }
    }

    base.etat = 'ok';
    base.total = total;
    base.extras = extras;
    // Comparaison au montant figé à l'ajout. `undefined` sur une ligne d'un
    // format antérieur : on ne signale alors rien plutôt que d'inventer un
    // changement de prix.
    base.ancien = (typeof ligne.total === 'number' && ligne.total !== total) ? ligne.total : null;
    return base;
  }

  /** Libellé d'un montant, trois cas depuis la correction de PO-13 : un
   *  montant, une gratuité voulue (« Réservation gratuite » chez un restaurant,
   *  « Gratuit » ailleurs) ou une absence de prix (« Prix sur demande »). Les
   *  libellés sont décidés par priceNoticeFor() en PHP et transportés par la
   *  configuration ; la règle n'est pas réécrite ici (PO-12). */
  function libelleMontant(total, groupe, zero, demande) {
    if (total === null) {
      return (demande && (demande[groupe] || demande['*'])) || '';
    }
    if (total > 0) { return formatPrix(total); }
    return (zero && (zero[groupe] || zero['*'])) || '';
  }

  /* ------------------------------------------------------ message WhatsApp */

  /**
   * Le message tel qu'il arrive sur le téléphone.
   *
   * Trois règles tiennent ce texte :
   *
   * - **une ligne vide entre deux prestations**, sinon les blocs se confondent
   *   sur un écran étroit ;
   * - **aucune ligne vide à l'intérieur d'un bloc** : une valeur absente
   *   (`time` à "", `duration` nul, `note` à "", `extras` vide) ne produit pas
   *   de ligne du tout, jamais une étiquette suivie de rien. C'est pourquoi les
   *   lignes sont accumulées puis jointes, et non concaténées ;
   * - **pas de numérotation sur une prestation unique** : un « 1. » seul
   *   annonce une liste qui n'existe pas.
   *
   * **Le pied du message ne tait plus les prestations sans prix.** Il
   * additionnait les totaux et sautait les lignes sur demande, qui valaient 0 :
   * un panier mêlant un jet-ski à 350 AED et un yacht sur demande annonçait
   * « Total indicatif : 350 AED » — un chiffre qui a l'air complet et ne l'est
   * pas, envoyé au dernier geste du site, à quelqu'un qui va le prendre pour un
   * devis. Trois pieds possibles maintenant, selon ce que le panier contient.
   */
  function messagePanier(resolus, zero, demande) {
    var blocs = [];
    var numerote = resolus.length > 1;

    resolus.forEach(function (r, i) {
      var l = r.ligne;
      var lignes = [];
      lignes.push((numerote ? (i + 1) + '. ' : '') + r.nom);

      var formule = l.formula.name;
      if (l.duration && l.duration.label) { formule += ' — ' + l.duration.label; }
      lignes.push(formule);

      // Le compteur EST le champ personnes quand l'unité comptée est la
      // personne : la quantité porte alors déjà l'information, et la répéter
      // donnerait « 4 personnes · 4 personnes ».
      var compte = l.qty + ' ' + (l.qty > 1 ? pluriel(l.qtyLabel || 'unité') : (l.qtyLabel || 'unité'));

      /* PO-156, CÔTÉ LECTURE — et c'est ce qui rend le défaut CORRIGIBLE.
         ───────────────────────────────────────────────────────────────────
         Depuis le lot 4, `parcours.js` n'écrit plus ni effectif ni heure dans
         la ligne d'un pack. Cela suffit pour toute ligne écrite à partir de
         maintenant — mais **pas pour celles déjà enregistrées** dans le
         navigateur d'un visiteur, qui portent encore `people: 2` et une heure,
         et que rien ne peut aller réécrire : ces données vivent chez lui.

         La garde est donc ici aussi, à la lecture, sur `l.group` — que la
         ligne porte depuis toujours. Un pack ne dit jamais d'effectif ni
         d'heure dans le message, quel que soit l'âge de la ligne.

         **Les activités ne sont pas touchées** : leur effectif et leur heure
         sont saisis, voulus, et le conseiller en a besoin. */
      var ligneDePack = l.group === 'pack';
      /* Lot D — **une voiture ne dit plus d'effectif non plus**, et pour la
         même raison de lecture : les lignes déjà dans le navigateur d'un
         visiteur portent `people: 2`, que personne n'a saisi. */
      var ligneDeVoiture = l.group === 'car';
      var gens = (!ligneDePack && !ligneDeVoiture && l.people) ? (l.people + (l.people > 1 ? ' personnes' : ' personne')) : '';
      lignes.push((gens && gens !== compte) ? compte + ' · ' + gens : compte);

      var periode = periodeLisible(l, true);
      if (periode) {
        lignes.push(periode);
      } else if (l.date) {
        var quand = (!ligneDePack && l.time) ? ' à ' + heureLisible(l.time) : '';
        lignes.push('Le ' + dateLisible(l.date) + quand);
      }
      r.extras.forEach(function (x) {
        lignes.push('Extra : ' + x.name + (x.qty > 1 ? ' × ' + x.qty : ''));
      });
      if (l.note) { lignes.push('Note : ' + l.note); }
      lignes.push(libelleMontant(r.total, r.groupe, zero, demande));

      blocs.push(lignes.join('\n'));
    });

    // Deux compteurs, et non une somme : ce qui est chiffré, et combien de
    // lignes ne le sont pas. La seconde information manquait entièrement.
    var somme = 0;
    var surDemande = 0;
    resolus.forEach(function (r) {
      if (r.total === null) { surDemande++; } else { somme += r.total; }
    });

    var texte = 'Bonjour, je souhaite réserver.\n\n' + blocs.join('\n\n');
    if (somme > 0 && surDemande > 0) {
      // Le montant est vrai, mais partiel : il faut le dire dans la ligne
      // elle-même, pas ailleurs — c'est la seule ligne que le destinataire lit
      // comme un chiffre.
      texte += '\n\nTotal indicatif : ' + formatPrix(somme)
        + ', hors prestations sur demande, à confirmer avec vous.';
    } else if (somme > 0) {
      // Indicatif, et dit comme tel : ce n'est pas un devis, et rien ne se
      // règle en ligne.
      texte += '\n\nTotal indicatif : ' + formatPrix(somme) + ', à confirmer avec vous.';
    } else if (surDemande > 0) {
      // Aucun montant à annoncer, mais quelque chose à dire : sans cette
      // ligne, le message s'arrêtait sur la dernière prestation, sans pied.
      texte += '\n\nPrestations sur demande, à confirmer avec vous.';
    }
    // Reste le panier entièrement gratuit (trois réservations de table) : pas
    // de ligne de total, comme avant ce lot. Il n'y a rien à confirmer.
    return texte;
  }

  /** Pluriel minimal, même règle que qtyLabelPlural() en PHP : ces libellés
   *  sont des noms communs courts saisis par le client, pas du texte
   *  éditorial. */
  function pluriel(mot) {
    mot = String(mot || '');
    var fin = mot.slice(-1);
    return (mot === '' || fin === 's' || fin === 'x') ? mot : mot + 's';
  }

  /**
   * Lien wa.me complet.
   *
   * `encodeURIComponent` est l'équivalent de rawurlencode() côté navigateur :
   * il produit `%0A` pour le saut de ligne, que WhatsApp restitue en retour à
   * la ligne, et encode accents, point médian et « × » en UTF-8 pour cent. Un
   * saut de ligne brut dans un `href` couperait l'attribut et le lien mènerait
   * à une conversation vide, sans qu'aucune erreur ne le signale.
   */
  function lienWhatsapp(numero, texte) {
    return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(texte);
  }

  /* ------------------------------------------------- le corps d'une ligne
   *
   * LOT C (2026-10-01) — LA LIGNE PORTE UNE PHOTO, ET N'EST PLUS UN BLOC.
   * Retour du client final : les deux pages étaient « ternes, trop jaunes,
   * faites de gros blocs, sans photos ». Une ligne était un pavé sable à coins
   * ronds ; elle devient une rangée sur le fond de page, séparée de la suivante
   * par un filet : la vignette, le texte, puis le prix et « Retirer ». Le sable
   * ne reste que derrière une vignette sans photo.
   *
   * La vignette et le texte forment ensemble **le lien** vers la fiche, quand
   * elle existe. C'est le geste principal de `/panier` et de `/favoris` : on
   * met de côté pour y revenir.
   *
   * **Ce lien ne contient jamais de bouton.** « Retirer », et le prix, vivent
   * dans `.ligne__cote`, qui est son **frère** — même structure que la pastille
   * de favori sur les cartes de grille (PO-36) : un `<a>` n'admet aucun contenu
   * interactif, et la seule garantie qu'un clic sur « Retirer » n'ouvre pas la
   * fiche est que le bouton ne soit pas dans le lien. Pas un
   * `stopPropagation()`, qui ne serait qu'un correctif sur une structure fausse.
   *
   * Sans fiche, un `<div>` : une ligne périmée ne doit jamais mener à une 404.
   */
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function glyphe(cadre, id) {
    if (!id) { return; }
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icone ligne__glyphe');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    cadre.appendChild(svg);
  }

  /** La vignette d'une fiche du catalogue (`i`), ou le glyphe de sa catégorie
   *  (`ic`) dans un cadre sable quand elle n'a pas de photo — c'est le cas des
   *  115 voitures aujourd'hui. `alt` vide : la photo redouble le nom écrit juste
   *  à côté, dans le même lien, comme sur une carte. Une photo qui ne charge
   *  pas cède la place au glyphe plutôt qu'à l'icône d'image cassée. */
  function vignette(fiche) {
    var cadre = el('span', 'ligne__vignette');
    var id = fiche ? fiche.ic : '';
    if (fiche && fiche.i) {
      var img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = function () {
        if (img.parentNode) { img.parentNode.removeChild(img); }
        glyphe(cadre, id);
      };
      img.src = fiche.i;
      cadre.appendChild(img);
    } else {
      glyphe(cadre, id);
    }
    return cadre;
  }

  /** @return {{racine: Element, texte: Element}} le lien (ou le bloc) qui porte
   *  la vignette et le texte, et le conteneur où écrire les lignes de texte. */
  function corpsLigne(fiche, href) {
    var racine = href ? el('a', 'ligne__principal ligne__lien') : el('div', 'ligne__principal');
    if (href) { racine.href = href; }
    racine.appendChild(vignette(fiche));
    var texte = el('span', 'ligne__texte');
    racine.appendChild(texte);
    return { racine: racine, texte: texte };
  }

  /* ------------------------------------------------------- rendu du panier */

  function blocVide(cible, texte) {
    var d = el('div', 'collection__vide');
    d.appendChild(el('p', 'collection__vide-texte', texte));
    var lien = el('a', 'btn btn--sobre', 'Voir les activités');
    lien.href = '/activites';
    d.appendChild(lien);
    cible.appendChild(d);
  }

  /**
   * @param {Element} cible
   * @param {Object}  config
   * @param {boolean} dansPanneau  true quand la cible est le panneau ouvert
   *        depuis l'en-tête : le pied y reçoit un lien vers la page `/panier`.
   */
  function rendrePanier(cible, config, dansPanneau) {
    var items = lire(CLE_PANIER);
    cible.textContent = '';

    if (!items.length) {
      blocVide(cible, 'Votre panier est vide.');
      return;
    }

    var resolus = [];
    var liste = el('div', 'collection__liste');

    items.forEach(function (l, index) {
      var r = resoudre(l, config.catalogue);
      r.ligne = l;
      if (r.etat === 'ok') { resolus.push(r); }

      var art = el('article', 'ligne' + (r.etat === 'ok' ? '' : ' ligne--perimee'));

      // Aucun lien quand la fiche a disparu : une ligne de panier ne doit
      // jamais mener à une 404.
      var corps = corpsLigne(config.catalogue[l.slug] || null, r.href);
      var texte = corps.texte;
      texte.appendChild(el('span', 'ligne__nom', r.nom));

      var formule = (l.formula && l.formula.name) || '';
      if (l.duration && l.duration.label) { formule += ' — ' + l.duration.label; }
      if (formule) { texte.appendChild(el('span', 'ligne__detail', formule)); }

      /* Le compte et la date sur UNE ligne, séparés par un point médian : deux
         lignes de plus par article faisaient une colonne de texte, et c'est une
         part du « gros bloc » que le client reprochait. */
      var compte = l.qty + ' ' + (l.qty > 1 ? pluriel(l.qtyLabel || 'unité') : (l.qtyLabel || 'unité'));
      /* Lot D — pas d'effectif sur une voiture : le panier affichait
         « 2 personnes », la valeur de départ d'un champ que le parcours d'une
         location ne montre plus. La garde est à la lecture, pour les lignes
         déjà enregistrées chez le visiteur. */
      var gens = (l.group !== 'car' && l.people) ? (l.people + (l.people > 1 ? ' personnes' : ' personne')) : '';
      var faits = [(gens && gens !== compte) ? compte + ' · ' + gens : compte];
      var periode = periodeLisible(l, false);
      if (periode) {
        faits.push(periode);
      } else if (l.date) {
        faits.push('le ' + dateLisible(l.date) + (l.time ? ' à ' + heureLisible(l.time) : ''));
      }
      texte.appendChild(el('span', 'ligne__detail', faits.join(' · ')));

      (r.extras || []).forEach(function (x) {
        texte.appendChild(el('span', 'ligne__detail',
          'Extra : ' + x.name + (x.qty > 1 ? ' × ' + x.qty : '')));
      });
      if (l.note) { texte.appendChild(el('span', 'ligne__detail', 'Note : ' + l.note)); }

      if (r.etat === 'indisponible') {
        texte.appendChild(el('span', 'ligne__alerte', 'Cette prestation n\'est plus proposée.'));
      } else if (r.etat === 'a-revoir') {
        texte.appendChild(el('span', 'ligne__alerte', r.motif));
      } else if (r.ancien !== null) {
        texte.appendChild(el('span', 'ligne__alerte',
          'Le tarif a changé depuis votre ajout — ' + formatPrix(r.ancien) + ' auparavant.'));
      }
      art.appendChild(corps.racine);

      var cote = el('div', 'ligne__cote');
      if (r.etat === 'ok') {
        cote.appendChild(el('p', 'ligne__prix',
          libelleMontant(r.total, r.groupe, config.zero, config.demande)));
      }
      var retirer = el('button', 'lien-bouton ligne__retirer', 'Retirer');
      retirer.type = 'button';
      retirer.setAttribute('aria-label', 'Retirer ' + r.nom + ' du panier');
      retirer.addEventListener('click', function () {
        var restant = lire(CLE_PANIER).filter(function (x, i) { return i !== index; });
        ecrire(CLE_PANIER, restant);
        rendrePanier(cible, config, dansPanneau);
        // Le focus suit : sans ça il retomberait sur <body> après la
        // disparition du bouton qui le portait.
        var suivant = cible.querySelector('.ligne__retirer');
        (suivant || cible).focus();
      });
      cote.appendChild(retirer);
      art.appendChild(cote);

      liste.appendChild(art);
    });

    cible.appendChild(liste);

    /* -- total : ne compte que ce qui est réservable, et dit ce qu'il ne compte
          pas. `a + r.total` avalait un `null` pour 0 — la page affichait donc,
          juste au-dessus du bouton d'envoi, le même total partiel que le
          message, et sans le mot qui l'accompagne désormais. Corriger l'un sans
          l'autre aurait fait dire deux choses différentes à deux éléments
          distants de quelques pixels. */
    var somme = 0;
    var surDemande = 0;
    resolus.forEach(function (r) {
      if (r.total === null) { surDemande++; } else { somme += r.total; }
    });

    var pied = el('div', 'collection__pied');
    if (somme > 0) {
      var ligneTotal = el('div', 'collection__total-ligne');
      ligneTotal.appendChild(el('p', 'eyebrow', 'Total indicatif'));
      ligneTotal.appendChild(el('p', 'collection__total', formatPrix(somme)));
      pied.appendChild(ligneTotal);
      if (surDemande > 0) {
        pied.appendChild(el('p', 'collection__note', 'Hors prestations sur demande.'));
      }
    } else if (surDemande > 0) {
      pied.appendChild(el('p', 'collection__note', 'Prestations sur demande.'));
    }

    if (!resolus.length) {
      pied.appendChild(el('p', 'collection__note',
        'Aucune des prestations de votre panier n\'est réservable en l\'état. '
        + 'Retirez-les ou modifiez votre choix pour continuer.'));
    } else if (config.wa) {
      var bouton = el('a', 'btn btn--gold collection__envoyer', 'Envoyer ma demande sur WhatsApp');
      bouton.href = lienWhatsapp(config.wa, messagePanier(resolus, config.zero, config.demande));
      bouton.rel = 'noopener';
      pied.appendChild(bouton);
      pied.appendChild(el('p', 'collection__note',
        'Aucun paiement en ligne. Un conseiller confirme la disponibilité et le prix.'));
    } else {
      // Numéro absent du réglage : aucun bouton plutôt qu'un lien cassé.
      pied.appendChild(el('p', 'collection__note',
        'Le numéro de contact n\'est pas encore renseigné.'));
    }
    if (dansPanneau) {
      /* La page existe toujours, et le panneau y mène : c'est elle qu'on met en
         favori du navigateur ou qu'on rouvre plus tard. */
      var page = el('a', 'collection__vers-page', 'Ouvrir la page du panier');
      page.href = '/panier';
      pied.appendChild(page);
    }
    cible.appendChild(pied);
  }

  /* ------------------------------------------------------ rendu des favoris */

  function rendreFavoris(cible, config) {
    var items = lire(CLE_FAVORIS);
    cible.textContent = '';

    if (!items.length) {
      blocVide(cible, 'Vous n\'avez pas encore de favori.');
      return;
    }

    var liste = el('div', 'collection__liste');
    items.forEach(function (f, index) {
      // Le nom et l'adresse viennent du catalogue vivant : une fiche renommée
      // s'affiche à jour sans que rien n'ait à être nettoyé. Le nom stocké ne
      // sert que si la fiche a disparu.
      var fiche = config.catalogue[f.slug];
      var art = el('article', 'ligne' + (fiche ? '' : ' ligne--perimee'));

      var corps = corpsLigne(fiche || null, fiche ? fiche.h : null);
      if (fiche) {
        corps.texte.appendChild(el('span', 'ligne__nom', fiche.n));
        // La catégorie sous le nom : un favori réduit à son seul nom ne disait
        // pas ce qu'il est (« Luna » est un yacht).
        if (fiche.c) { corps.texte.appendChild(el('span', 'ligne__detail', fiche.c)); }
      } else {
        corps.texte.appendChild(el('span', 'ligne__nom', f.name || 'Prestation retirée'));
        corps.texte.appendChild(el('span', 'ligne__alerte', 'Cette prestation n\'est plus proposée.'));
      }
      art.appendChild(corps.racine);

      var cote = el('div', 'ligne__cote');
      /* Le prix d'appel, écrit par PHP comme sur la carte (`a`, voir
         `catalogueIndex()`) : un favori sans prix ne donnait aucune raison d'y
         revenir. */
      if (fiche && fiche.a) { cote.appendChild(el('p', 'ligne__prix', fiche.a)); }
      var retirer = el('button', 'lien-bouton ligne__retirer', 'Retirer');
      retirer.type = 'button';
      retirer.setAttribute('aria-label', 'Retirer ' + (fiche ? fiche.n : (f.name || 'cette prestation')) + ' des favoris');
      retirer.addEventListener('click', function () {
        var restant = lire(CLE_FAVORIS).filter(function (x, i) { return i !== index; });
        ecrire(CLE_FAVORIS, restant);
        rendreFavoris(cible, config);
        brancherFavori();   // les cœurs de la page, s'il y en a, suivent le retrait
        var suivant = cible.querySelector('.ligne__retirer');
        (suivant || cible).focus();
      });
      cote.appendChild(retirer);
      art.appendChild(cote);

      liste.appendChild(art);
    });
    cible.appendChild(liste);
  }

  /* -------------------------------------------- le panneau du panier (lot C)
   *
   * Demande du client final : le clic sur « Panier », dans l'en-tête, n'ouvre
   * plus une page — il fait remonter un panneau depuis le bas, presque plein
   * écran, facile à refermer.
   *
   * **C'EST UNE MODALE, ET C'EST VOULU.** Le panneau passe par `ouvrirModale()`
   * (modale.js) et en reçoit les cinq comportements que SPEC.md §5.3 dit non
   * négociables : Échap, clic sur le fond, défilement de la page bloqué, focus
   * retenu dans le panneau, focus rendu au lien « Panier » à la fermeture. La
   * seule différence est de mise en page — `modale--panneau`, dans site.css.
   *
   * **L'INDEX DU CATALOGUE N'EST PAS SUR CHAQUE PAGE**, et il ne doit pas l'être :
   * il pèse autant qu'une page entière. Le panneau va le chercher à la demande,
   * **dans la page `/panier` elle-même**, dont il lit l'îlot `collections-data`.
   * Pas de point d'entrée JSON à part : une seule source, celle que la page
   * emploie — même procédé que `surplace.js`. Il est gardé pour la durée de la
   * page : rouvrir le panneau ne redemande rien.
   *
   * **LA PAGE `/panier` EXISTE TOUJOURS, ET ELLE EST LE REPLI.** Sans
   * JavaScript, avec Ctrl+clic, si `modale.js` manque, si la récupération
   * échoue ou tarde plus de `DELAI_GARDE` : le navigateur ouvre la page.
   */
  var DELAI_GARDE = 4000;
  var configPage = configuration();
  var configDistante = null;

  function chargerConfig() {
    if (configPage) { return Promise.resolve(configPage); }
    if (configDistante) { return Promise.resolve(configDistante); }
    return new Promise(function (resoudreP, rejeter) {
      var garde = window.setTimeout(function () { rejeter(new Error('délai')); }, DELAI_GARDE);
      fetch('/panier', { credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) { throw new Error('HTTP ' + r.status); }
          return r.text();
        })
        .then(function (html) {
          window.clearTimeout(garde);
          var ilot = new DOMParser().parseFromString(html, 'text/html').getElementById('collections-data');
          var c = ilot ? JSON.parse(ilot.textContent) : null;
          if (!c || !c.catalogue) { throw new Error('îlot absent'); }
          configDistante = c;
          resoudreP(c);
        })
        .catch(function (e) { window.clearTimeout(garde); rejeter(e); });
    });
  }

  /** @return {boolean} true si le panneau s'ouvre ; false si l'appelant doit
   *  laisser le navigateur aller à `/panier`. */
  function ouvrirPanier() {
    var D4R = window.D4R || {};
    if (!D4R.ouvrirModale || (!configPage && (!window.fetch || !window.DOMParser))) {
      return false;
    }
    var corps = el('div', 'collection__corps');
    corps.setAttribute('tabindex', '-1');
    var attente = el('p', 'collection__note', 'Chargement du panier…');
    attente.setAttribute('role', 'status');
    corps.appendChild(attente);

    var ouvert = true;
    D4R.ouvrirModale({
      titre: 'Panier',
      corps: corps,
      classe: 'modale--panneau',
      surFermeture: function () { ouvert = false; }
    });
    chargerConfig().then(function (c) {
      if (ouvert) { rendrePanier(corps, c, true); }
    }).catch(function () {
      /* Le repli : la page, qui sait dire elle-même ce qui ne va pas. */
      if (ouvert) { window.location.href = '/panier'; }
    });
    return true;
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    var lien = e.target.closest ? e.target.closest('[data-panier-ouvrir]') : null;
    /* Sur la page du panier, le lien reste un lien : ouvrir par-dessus elle un
       panneau qui montre la même chose n'aurait aucun sens. */
    if (!lien || document.querySelector('[data-panier]')) {
      return;
    }
    if (ouvrirPanier()) {
      e.preventDefault();
    }
  });

  /* ------------------------------------------------------------- amorçage */

  brancherFavori();
  /* REJOUABLE — lot « sur place » (2026-10-01). `surplace.js` remplace les
     cartes de `/voitures` et de `/activites` sans recharger la page : leurs
     cœurs arrivent `hidden` et sans écouteur, comme au chargement. Il rappelle
     donc cette fonction, qui ne branche que ce qui ne l'est pas encore et
     repeint tous les cœurs présents. */
  (window.D4R = window.D4R || {}).brancherFavoris = brancherFavori;
  /* Lot C : la fenêtre de confirmation du parcours ouvre le panneau par là. */
  window.D4R.ouvrirPanier = ouvrirPanier;

  if (!configPage) { return; }

  var panier = document.querySelector('[data-panier]');
  var favoris = document.querySelector('[data-favoris]');
  // tabindex sur le conteneur : c'est lui qui reçoit le focus quand la
  // dernière ligne disparaît.
  [panier, favoris].forEach(function (n) { if (n) { n.setAttribute('tabindex', '-1'); } });

  if (panier) { rendrePanier(panier, configPage, false); }
  if (favoris) { rendreFavoris(favoris, configPage); }
})();
