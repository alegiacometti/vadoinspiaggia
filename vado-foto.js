/* ===========================================================================
   Vado in spiaggia — le immagini di una spiaggia.

   Fino a ieri una fotografia si poteva mandare solo allegandola a un parere.
   Ma chi ha una bella foto non sempre ha qualcosa da dire, e chi ha qualcosa
   da dire non sempre ha una foto: erano due cose diverse legate insieme per
   comodita' nostra, non di chi guarda.

   Adesso la scheda ha una sezione sua, che mette insieme le due strade:
   le immagini caricate da sole e quelle approvate dentro i pareri.

   La regola non cambia, ed e' l'unica che conta: NIENTE si vede prima che un
   amministratore l'abbia guardata. Il file parte verso «attesa/», dove lo
   legge solo lui; passa in «ok/» quando lo approva. Chi l'ha mandata vede la
   propria anche mentre aspetta — la sua, non quella degli altri.
   =========================================================================== */
window.VADOFOTO = (function () {
  "use strict";

  const esc = t => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const giorno = d => d ? new Date(d).toLocaleDateString("it-IT",
    { day: "numeric", month: "long", year: "numeric" }) : "";

  let veloF = null, sidCorrente = null, nomeCorrente = "", fileScelto = null;
  let SCATTI = [];        /* quel che la lente sfoglia: percorso, didascalia, indirizzo firmato */

  /* ------------------------------------------------------------- la finestra
     Si costruisce una volta sola e resta: aprirla e chiuderla non deve
     ricostruire niente, e il <dialog> del browser sa gia' fare il velo, la
     scorciatoia con Esc e il fuoco che non esce. */
  function finestra() {
    if (veloF) return veloF;
    veloF = document.createElement("dialog");
    veloF.className = "velo-conto imm-velo";
    veloF.innerHTML =
      '<form method="dialog" class="foglio-conto">' +
        '<button class="chiudi" value="x" aria-label="Chiudi">✕</button>' +
        '<p class="conto-nota" data-imm-dove></p>' +
        '<button type="button" class="rec-foto-scegli" data-imm-scegli>Scegli una foto</button>' +
        '<input type="file" accept="image/jpeg,image/png,image/webp" hidden data-imm-file>' +
        '<div class="imm-anteprima" data-imm-anteprima hidden><img alt="La foto che stai per mandare"></div>' +
        '<label class="conto-campo"><span>Due parole, se vuoi</span>' +
          '<input type="text" maxlength="140" data-imm-did ' +
            'placeholder="il pontile all’alba, la caletta a nord…"></label>' +
        '<label class="conto-spunta"><input type="checkbox" data-imm-ok>' +
          '<span>La fotografia è mia, non ci sono persone riconoscibili che non ' +
          'me l’abbiano permesso, e autorizzo <b>Vado in spiaggia</b> a pubblicarla ' +
          'in questa scheda. Posso chiederne la rimozione quando voglio — c’è ' +
          'scritto come nell’<a href="privacy.html" target="_blank" rel="noopener">informativa privacy</a>.</span>' +
        '</label>' +
        '<p class="conto-esito" data-imm-esito hidden></p>' +
        '<button type="button" class="conto-vai" data-imm-vai disabled>Manda la foto</button>' +
        '<p class="rec-foto-nota">Pesa al massimo 5 MB, in JPEG, PNG o WebP. ' +
          'Non compare subito: la guardo io prima che si veda.</p>' +
      '</form>';
    document.body.appendChild(veloF);

    const file = veloF.querySelector("[data-imm-file]");
    const vai  = veloF.querySelector("[data-imm-vai]");
    const ok   = veloF.querySelector("[data-imm-ok]");
    const ante = veloF.querySelector("[data-imm-anteprima]");

    const controlla = () => { vai.disabled = !(fileScelto && ok.checked); };

    veloF.querySelector("[data-imm-scegli]").onclick = () => file.click();
    file.onchange = () => {
      fileScelto = file.files && file.files[0];
      if (!fileScelto) { ante.hidden = true; return controlla(); }
      /* l'anteprima e' locale: il file non e' ancora partito per nessuno */
      ante.querySelector("img").src = URL.createObjectURL(fileScelto);
      ante.hidden = false;
      veloF.querySelector("[data-imm-scegli]").textContent = "Scegline un’altra";
      controlla();
    };
    ok.onchange = controlla;
    vai.onclick = () => manda(vai);
    return veloF;
  }

  function apri(sid, nome) {
    sidCorrente = sid; nomeCorrente = nome || "";
    const v = finestra();
    fileScelto = null;
    v.querySelector("[data-imm-file]").value = "";
    v.querySelector("[data-imm-did]").value = "";
    v.querySelector("[data-imm-ok]").checked = false;
    v.querySelector("[data-imm-anteprima]").hidden = true;
    v.querySelector("[data-imm-scegli]").textContent = "Scegli una foto";
    v.querySelector("[data-imm-vai]").disabled = true;
    v.querySelector("[data-imm-esito]").hidden = true;
    v.querySelector("[data-imm-dove]").innerHTML =
      "Una foto di <b>" + esc(nomeCorrente) + "</b>";
    v.showModal();
  }

  async function manda(bottone) {
    const v = finestra();
    const esito = v.querySelector("[data-imm-esito]");
    const did = v.querySelector("[data-imm-did]").value;
    const era = bottone.textContent;
    bottone.disabled = true; bottone.textContent = "La mando…";
    try {
      await VADO.mandaFoto(sidCorrente, fileScelto, did,
        (typeof window !== "undefined" && window.PRIVACY_VERSIONE) || null);
    } catch (e) {
      esito.textContent = inItaliano(e);
      esito.className = "conto-esito brutta"; esito.hidden = false;
      bottone.disabled = false; bottone.textContent = era;
      return;
    }
    v.close();
    /* si ridisegna la sezione: la sua foto deve comparire subito, con scritto
       che sta aspettando. Mandarla e non vedere niente sembra un guasto. */
    const dove = document.getElementById("slotImmagini");
    if (dove) disegna(sidCorrente, nomeCorrente, dove);
  }

  function inItaliano(e) {
    const t = (e && e.message || "").toLowerCase();
    if (t.includes("troppo pesante")) return "L’immagine supera i 5 MB. Rimpiccioliscila e riprova.";
    if (t.includes("formato")) return "Accetto solo JPEG, PNG o WebP.";
    if (t.includes("entrati")) return "Per mandare una foto serve un account.";
    if (t.includes("failed to fetch")) return "Non riesco a raggiungere il servizio. Controlla la connessione.";
    return "Non ha funzionato: " + (e && e.message || "errore sconosciuto");
  }

  /* --------------------------------------------------------------- disegna
     Tre sorgenti in un elenco solo: le immagini caricate da sole, quelle
     approvate dentro i pareri, e — solo per chi l'ha mandata — la propria in
     attesa.

     Poi non si disegna piu' una striscia in fondo alla scheda: si SALE nella
     finestra in cima, dove fino a un attimo prima c'era la vista aerea. La
     scheda e' gia' in piedi e non cambia forma; cambia che cosa si vede dentro
     la finestra, e sotto compare la fila dei provini per scegliere.

     «dove» adesso e' l'intera scheda, non un riquadro: qui dentro servono due
     pezzi che stanno in punti diversi — la finestra e lo spazio dei provini. */
  async function disegna(sid, nome, dove) {
    if (!dove) return;
    const fin  = dove.querySelector(".finestra");
    const slot = dove.querySelector("#slotProvini");
    if (!fin || !slot) return;
    let libere = [], mie = [], daPareri = [];
    try {
      const r = await Promise.all([
        VADO.fotoSpiaggia(sid).catch(() => []),
        VADO.mieFoto(sid).catch(() => []),
        VADO.recensioniSpiaggia(sid).catch(() => [])
      ]);
      libere = r[0] || []; mie = r[1] || [];
      daPareri = (r[2] || []).filter(x => x.foto);
    } catch (_) { /* la scheda non muore per una sezione */ }

    const viste = new Set(libere.map(f => f.percorso));
    const attesa = mie.filter(f => !f.ok);
    const scatti = libere.map(f => ({ percorso: f.percorso, did: f.didascalia,
                                      quando: f.creata, stato: "",
                                      archivio: !!f.archivio, autore: f.autore,
                                      fonte: f.fonte, pagina: f.pagina }))
      .concat(daPareri.filter(r => !viste.has(r.foto))
        .map(r => ({ percorso: r.foto, did: r.commento ? "" : "", quando: r.creata,
                     stato: "", firma: r.firma })))
      .concat(attesa.map(f => ({ percorso: f.percorso, did: f.didascalia,
                                 quando: f.creata, stato: "attesa" })));

    /* VADO e' dichiarato «const» in vado-dati.js: e' una variabile globale ma
       NON una proprieta' di window, quindi window.VADO e' undefined anche
       quando VADO c'e' eccome. Chiedendolo cosi' «entrato» era sempre falso, e
       su una spiaggia senza foto la sezione non si disegnava affatto: nessun
       invito, nessun modo di mandare la prima. E' la quarta volta che questo
       tranello morde — si controlla con typeof, mai con window. */
    const entrato = typeof VADO !== "undefined" && !!VADO.chiSono();

    /* ---------------------------------------------------- nessuna fotografia
       La finestra resta sulla vista aerea e lo dice: e' meglio una riga che
       spiega perche' si sta guardando un'immagine dal satellite, che lasciar
       credere che quella SIA la spiaggia vista da chi c'e' stato. */
    if (!scatti.length) {
      slot.className = "fin-senza";
      slot.innerHTML =
        '<p>Di questa spiaggia non c’è ancora nessuna fotografia: qui sopra c’è ' +
        'la vista dall’alto.</p>' +
        (entrato
          ? '<button type="button" class="fin-manda" data-imm-apri>Mandane una</button>'
          : '<span class="fin-fuori">Le foto le mandano le persone iscritte</span>');
      legaInvito(slot, sid, nome);
      return;
    }

    SCATTI = scatti;
    const foto    = fin.querySelector("[data-fin-foto]");
    const credito = fin.querySelector("[data-fin-credito]");
    const tela    = fin.querySelector(".tela");
    /* Il collegamento porta alle fotografie su Google. Quando qui non c'e'
       niente si chiama «Foto e recensioni», che e' l'unica cosa che offre;
       quando invece una fotografia nostra c'e' gia', diventa «ALTRE foto e
       recensioni» — cosi' dice che manda da un'altra parte invece di sembrare
       il tasto per aprire quelle che si stanno guardando. */
    const versoGoogle = fin.querySelector(".fin-apri");
    if (versoGoogle) versoGoogle.textContent = "Altre foto e recensioni ↗";
    /* la scritta della vista aerea la mette la pagina della regione, con la
       fonte delle tessere: si tiene da parte per rimetterla tale e quale */
    const creditoAereo = credito ? credito.textContent : "";

    /* I provini: prima le fotografie, poi la vista aerea. L'ordine dice quale
       conta di piu', ed e' il contrario di come stava la scheda finora. */
    slot.className = "provini";
    slot.innerHTML =
      scatti.map((f, i) =>
        '<button type="button" class="prov-t' + (f.stato === "attesa" ? " attesa" : "") +
          '" data-fin-i="' + i + '" aria-label="' +
          esc(f.did || ("Fotografia " + (i + 1) + " di " + nome)) + '">' +
          '<img data-imm-vedi="' + esc(f.percorso) + '" data-imm-i="' + i +
          '" alt="" loading="lazy" decoding="async"></button>').join("") +
      '<button type="button" class="prov-t prov-aerea" data-fin-aerea ' +
        'aria-label="Torna alla vista aerea"><span class="prov-tela"></span>' +
        '<i>aerea</i></button>' +
      (entrato
        ? '<button type="button" class="prov-t prov-piu" data-imm-apri ' +
          'aria-label="Manda una tua fotografia" title="Manda una tua fotografia">+</button>'
        : '');

    /* La vista aerea dentro il provino e' la stessa tela della finestra,
       copiata: le tessere sono posizionate in percentuale, quindi si
       rimpiccioliscono da sole senza che serva una seconda immagine. */
    const dentro = slot.querySelector(".prov-tela");
    if (tela && dentro) dentro.innerHTML = tela.innerHTML;

    legaInvito(slot, sid, nome);

    const firma = f =>
      (f.stato === "attesa" ? "in attesa che la guardi io"
        : f.archivio ? "archivio" + (f.autore ? " · " + f.autore : "")
        : f.firma ? "foto di " + f.firma
        : "foto di chi c’è stato") + (f.did ? " · " + f.did : "");

    const accendi = i => {
      const f = SCATTI[i];
      if (!f || !f.url) return;
      foto.src = f.url;
      foto.alt = f.did || ("Fotografia di " + nome);
      foto.hidden = false;
      fin.classList.add("con-foto");
      fin.dataset.finI = i;
      if (credito) credito.textContent = firma(f);
      slot.querySelectorAll(".prov-t").forEach(t =>
        t.classList.toggle("on", t.dataset.finI === String(i)));
    };
    const aerea = () => {
      foto.hidden = true;
      fin.classList.remove("con-foto");
      delete fin.dataset.finI;
      if (credito) credito.textContent = creditoAereo;
      slot.querySelectorAll(".prov-t").forEach(t => t.classList.remove("on"));
      const a = slot.querySelector("[data-fin-aerea]");
      if (a) a.classList.add("on");
    };

    slot.querySelectorAll("[data-fin-i]").forEach(t =>
      t.onclick = () => accendi(+t.dataset.finI));
    slot.querySelectorAll("[data-fin-aerea]").forEach(t => t.onclick = aerea);

    /* Premendo la finestra si apre la lente, ma solo se dentro c'e' una
       fotografia: sulla vista aerea non ci sarebbe niente da ingrandire. */
    fin.addEventListener("click", e => {
      if (!fin.classList.contains("con-foto")) return;
      if (e.target.closest(".fin-mosse, .fin-apri, a, button")) return;
      lente(+(fin.dataset.finI || 0));
    });

    /* Il deposito e' chiuso: ogni immagine si chiede con un indirizzo firmato
       che scade da solo. Arrivano una per una; la prima che risponde sale
       anche nella finestra, cosi' non si aspetta che siano scese tutte. */
    let primaMessa = false;
    slot.querySelectorAll("img[data-imm-vedi]").forEach(async img => {
      const i = +img.dataset.immI;
      try {
        const u = await VADO.firmaFoto(img.dataset.immVedi, 3600);
        if (!u) throw new Error("niente indirizzo");
        img.src = u; SCATTI[i].url = u;
        if (!primaMessa) { primaMessa = true; accendi(i); }
      } catch (_) {
        const t = img.closest(".prov-t"); if (t) t.remove();
      }
    });
  }

  /* Qui c'era «legaStriscia», che faceva scorrere di lato la vecchia striscia
     delle anteprime e accendeva le due frecce. Con la finestra unica non c'e'
     piu' una striscia da scorrere: i provini stanno tutti in riga e, se sono
     tanti, e' la riga stessa a scorrere. Tolta invece di lasciarla morta. */

  /* ---------------------------------------------------------------- la lente
     A schermo intero, con le frecce, la tastiera e lo scorrimento del dito.
     L'indirizzo firmato e' gia' stato chiesto per l'anteprima: qui si riusa
     quello, che e' lo stesso file — una richiesta in meno e nessuna attesa. */
  let veloL = null, iLente = 0;

  function costruisciLente(){
    if (veloL) return veloL;
    veloL = document.createElement("dialog");
    veloL.className = "imm-lente";
    veloL.innerHTML =
      '<button type="button" class="imm-chiudi" data-l-chiudi aria-label="Chiudi">✕</button>' +
      '<button type="button" class="imm-lfrec sx" data-l-vai="-1" aria-label="Precedente">‹</button>' +
      '<img alt="">' +
      '<button type="button" class="imm-lfrec dx" data-l-vai="1" aria-label="Successiva">›</button>' +
      '<p class="imm-lsotto"><span data-l-did></span><span data-l-conta></span></p>';
    document.body.appendChild(veloL);
    veloL.querySelector("[data-l-chiudi]").onclick = () => veloL.close();
    veloL.querySelectorAll("[data-l-vai]").forEach(b =>
      b.onclick = e => { e.stopPropagation(); muovi(+b.dataset.lVai); });
    /* fuori dall'immagine si chiude, come ci si aspetta da una lente */
    veloL.addEventListener("click", e => { if (e.target === veloL) veloL.close(); });
    veloL.addEventListener("keydown", e => {
      if (e.key === "ArrowRight") { e.preventDefault(); muovi(1); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); muovi(-1); }
    });
    let x0 = null;
    veloL.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    veloL.addEventListener("touchend", e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 45) muovi(dx < 0 ? 1 : -1);
    }, { passive: true });
    return veloL;
  }

  function muovi(passo){
    if (!SCATTI.length) return;
    iLente = (iLente + passo + SCATTI.length) % SCATTI.length;
    mostraLente();
  }

  function mostraLente(){
    const v = costruisciLente(), f = SCATTI[iLente];
    if (!f) return;
    const img = v.querySelector("img");
    img.src = f.url || "";
    img.alt = f.did || "Foto della spiaggia";
    const sotto = v.querySelector("[data-l-did]");
    if (f.stato === "attesa") sotto.textContent = "La tua, in attesa che la guardi io";
    else if (f.archivio) {
      /* la licenza Pexels non obbliga a citare: lo facciamo per scelta, ed e'
         anche il modo piu' onesto di dire al visitatore che questa foto non
         l'ha scattata qualcuno che c'era */
      const chi = esc(f.autore || "autore non indicato"),
            dove = f.fonte ? esc(f.fonte) : "archivio";
      sotto.innerHTML = (f.did ? esc(f.did) + " · " : "") +
        'foto d’archivio di ' + chi + ' · ' +
        (f.pagina ? '<a href="' + esc(f.pagina) + '" target="_blank" rel="noopener noreferrer">' +
                    dove + '</a>' : dove);
    }
    else sotto.textContent = f.did || "";
    v.querySelector("[data-l-conta]").textContent =
      SCATTI.length > 1 ? (iLente + 1) + " di " + SCATTI.length : "";
    v.querySelectorAll(".imm-lfrec").forEach(b => b.hidden = SCATTI.length < 2);
  }

  function lente(i){
    const v = costruisciLente();
    iLente = i; mostraLente();
    if (!v.open) v.showModal();
  }


  function legaInvito(dove, sid, nome) {
    dove.querySelectorAll("[data-imm-apri]").forEach(b =>
      b.onclick = () => apri(sid, nome));
  }

  return { disegna: disegna, apri: apri, lente: lente };
})();
