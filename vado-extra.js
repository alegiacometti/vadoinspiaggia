/* ===========================================================================
   Vado in spiaggia — quello che sta intorno alla spiaggia.

   Due riquadri che non parlano della spiaggia ma di quel che le gira attorno:
   le notizie del comune, e i quattro collegamenti per mangiare, dormire,
   prendere l'ombrellone e trovare qualcosa da fare.

   Regola unica e severa: NIENTE si disegna al buio. Se per quel comune non ci
   sono notizie, il riquadro non esiste — un riquadro vuoto con scritto
   «nessuna notizia» e' peggio di nessun riquadro, perche' occupa spazio per
   dire che non ha niente da dire.

   Sui quattro collegamenti: sono LINK, non riquadri da incorporare. I widget
   di Booking e GetYourGuide caricherebbero codice loro, e cadrebbero sotto il
   consenso ai cookie come Google Maps: chi rifiuta non vedrebbe niente. Un
   collegamento normale non installa nulla finche' non lo premi, e funziona
   per tutti.
   =========================================================================== */
window.VADOEXTRA = (function () {
  "use strict";

  const esc = t => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const giorno = d => {
    if (!d) return "";
    const x = new Date(d);
    return isNaN(x) ? "" : x.toLocaleDateString("it-IT",
      { day: "numeric", month: "long", year: "numeric" });
  };

  /* Le affiliazioni sono attive? Lo dice una impostazione, non il codice.
     Finche' e' spenta i quattro riquadri restano collegamenti utili, senza
     l'etichetta «annuncio» e senza la riga sulle provvigioni: scriverla prima
     di essersi iscritti ai programmi sarebbe una bugia. */
  let AFF = null;
  async function affiliazioniAttive() {
    if (AFF !== null) return AFF;
    try {
      const i = await VADO.impostazioni();
      AFF = /^(s|y|1|true)/i.test((i && i.aff_attive || "").trim());
    } catch (_) { AFF = false; }
    return AFF;
  }

  /* ------------------------------------------------------------- le notizie */
  async function notizie(b, dove) {
    if (!dove) return;
    dove.innerHTML = "";
    const comune = (b.notizie_com || b.com || "").trim();
    if (!comune) return;
    let righe = [];
    try { righe = await VADO.notizieComune(comune, 4); } catch (_) { return; }
    if (!righe || !righe.length) return;          /* niente da dire: niente riquadro */
    dove.innerHTML =
      '<div class="notiz">' +
        '<h3>Si dice in giro <em>' + esc(comune) + '</em></h3><ol>' +
        righe.map(n =>
          '<li><a href="' + esc(n.url) + '" target="_blank" rel="noopener nofollow">' +
            esc(n.titolo) +
            '<span class="fonte">' + esc(n.fonte) +
              (n.pubblicata ? ' · ' + esc(giorno(n.pubblicata)) : '') + '</span>' +
          '</a></li>').join("") +
        '</ol></div>';
  }

  /* ------------------------------------------------------------ qui intorno
     Ogni riquadro usa il collegamento scritto sulla spiaggia, se c'e'. Se non
     c'e', ripiega su una ricerca per comune — ma solo dove so che l'indirizzo
     esiste davvero: Booking e GetYourGuide accettano una ricerca libera,
     TheFork e Spiagge.it vogliono un identificativo di citta' che non si puo'
     inventare, e li' si manda alla loro pagina di ricerca. Un riquadro che
     porta a una pagina che non esiste e' peggio di un riquadro in meno. */
  const ICONE = {
    mangiare: '<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-1.5 1.5-2 3.5-2 5.5V13h4V8.5c0-2-.5-4-2-5.5zM17 13v8"/>',
    dormire:  '<path d="M3 18V7M3 12h13a4 4 0 0 1 4 4v2M21 18v-2"/><circle cx="7" cy="10" r="1.6"/>',
    ombrello: '<path d="M12 12v9M3.5 12a8.5 8.5 0 0 1 17 0zM12 3.5V12"/>',
    fare:     '<rect x="3" y="4" width="18" height="15" rx="2"/><path d="M4 19l5.5-9 3.5 5.5 2.5-3.5L20 19z"/><circle cx="17" cy="6.5" r="2.2"/>'
  };

  function riquadro(icona, titolo, testo, url, chi, ann) {
    return '<div class="spon">' +
      '<div class="spon-alto">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONE[icona] + '</svg>' +
        '<h4>' + esc(titolo) + '</h4>' +
        (ann ? '<span class="ann">Annuncio</span>' : '') +
      '</div>' +
      '<p>' + testo + '</p>' +
      '<a class="vai" href="' + esc(url) + '" target="_blank" rel="noopener' +
        (ann ? ' sponsored nofollow' : '') + '">' + esc(chi.azione) + '</a>' +
      '<span class="chi">' + esc(chi.nome) + '</span></div>';
  }

  async function quiIntorno(b, dove) {
    if (!dove) return;
    dove.innerHTML = "";
    const com = (b.com || "").split(" · ")[0].trim();
    if (!com) return;
    const q = encodeURIComponent(com);
    const ann = await affiliazioniAttive();

    const scatole = [
      { c: b.aff_ristorante, icona: "mangiare", titolo: "Dove mangiare",
        testo: "I ristoranti di <b>" + esc(com) + "</b> che prendono la prenotazione online.",
        url: b.aff_ristorante || "https://www.thefork.it/",
        chi: { nome: "TheFork", azione: "Vedi i ristoranti" } },
      { c: true, icona: "dormire", titolo: "Dove dormire",
        testo: "Alberghi e case a <b>" + esc(com) + "</b>, con le date che scegli tu.",
        url: b.aff_albergo || ("https://www.booking.com/searchresults.it.html?ss=" + q),
        chi: { nome: "Booking.com", azione: "Cerca un alloggio" } },
      { c: b.aff_ombrellone, icona: "ombrello", titolo: "Prenota l’ombrellone",
        testo: "Gli stabilimenti che lasciano scegliere la fila e il giorno prima di partire.",
        url: b.aff_ombrellone || "https://www.spiagge.it/stabilimenti-balneari/",
        chi: { nome: "Spiagge.it", azione: "Scegli il posto" } },
      { c: true, icona: "fare", titolo: "Cosa fare",
        testo: "Gite, corsi e uscite in barca prenotabili intorno a <b>" + esc(com) + "</b>.",
        url: b.aff_attivita || ("https://www.getyourguide.it/s/?q=" + q),
        chi: { nome: "GetYourGuide", azione: "Guarda cosa c’è" } }
    ];

    dove.innerHTML =
      '<div class="sponsor-testa"><p>Qui intorno</p>' +
        (ann ? '<small>Collegamenti a pagamento</small>' : '') + '</div>' +
      '<div class="sponsor">' +
        scatole.map(s => riquadro(s.icona, s.titolo, s.testo, s.url, s.chi, ann)).join("") +
      '</div>' +
      (ann ? '<p class="trasparenza">I quattro riquadri qui sopra sono collegamenti ' +
        'pubblicitari: se prenoti passando di qui, Vado in spiaggia riceve una provvigione ' +
        'dal servizio, e tu paghi esattamente lo stesso prezzo. Non scegliamo i locali in ' +
        'base a chi paga di più, e nessuno di questi partner decide che cosa scriviamo ' +
        'nella scheda.</p>' : '');
  }

  /* Una chiamata sola dalla scheda: i due riquadri partono insieme e nessuno
     dei due fa aspettare l'altro. */
  function disegna(b, slotNotizie, slotIntorno) {
    notizie(b, slotNotizie).catch(() => {});
    quiIntorno(b, slotIntorno).catch(() => {});
  }

  return { disegna: disegna, notizie: notizie, quiIntorno: quiIntorno };
})();
