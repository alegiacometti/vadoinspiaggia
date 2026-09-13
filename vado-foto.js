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
     Tre sorgenti in una griglia sola: le immagini caricate da sole, quelle
     approvate dentro i pareri, e — solo per chi l'ha mandata — la propria in
     attesa. Se non c'e' niente da mostrare la sezione non si disegna: resta
     l'invito a mandarne una, che e' l'unico modo perche' la prima arrivi. */
  async function disegna(sid, nome, dove) {
    if (!dove) return;
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
                                      quando: f.creata, stato: "" }))
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
    if (!scatti.length) {
      dove.innerHTML = entrato
        ? '<p class="imm-invito">Hai una foto di questa spiaggia? ' +
          '<button type="button" class="imm-manda" data-imm-apri>Mandala</button></p>'
        : "";
      legaInvito(dove, sid, nome);
      return;
    }

    dove.innerHTML =
      '<p class="titoletto">Le immagini <em>di chi c’è stato</em></p>' +
      '<div class="imm-griglia">' + scatti.map((f, i) =>
        '<figure class="imm-scatto' + (f.stato === "attesa" ? " attesa" : "") + '">' +
          '<img data-imm-vedi="' + esc(f.percorso) + '" alt="' +
            esc(f.did || ("Foto di " + nome)) + '" loading="lazy" decoding="async">' +
          (f.stato === "attesa"
            ? '<figcaption class="imm-attesa">La tua, in attesa che la guardi io</figcaption>'
            : (f.did ? '<figcaption>' + esc(f.did) + '</figcaption>' : "")) +
        '</figure>').join("") +
      '</div>' +
      (entrato
        ? '<p class="imm-invito">Ne hai una anche tu? ' +
          '<button type="button" class="imm-manda" data-imm-apri>Mandala</button></p>'
        : '<p class="imm-invito imm-fuori">Le foto le mandano le persone iscritte.</p>');

    legaInvito(dove, sid, nome);

    /* Il deposito e' chiuso: ogni immagine si chiede con un indirizzo firmato
       che scade da sola. Arrivano una per una, dopo la griglia: la sezione
       compare subito con i riquadri vuoti e si riempie mentre si guarda. */
    dove.querySelectorAll("img[data-imm-vedi]").forEach(async img => {
      try {
        const u = await VADO.firmaFoto(img.dataset.immVedi, 3600);
        if (u) img.src = u; else togli(img);
      } catch (_) { togli(img); }
    });
  }

  const togli = img => { const f = img.closest(".imm-scatto"); if (f) f.remove(); };

  function legaInvito(dove, sid, nome) {
    dove.querySelectorAll("[data-imm-apri]").forEach(b =>
      b.onclick = () => apri(sid, nome));
  }

  return { disegna: disegna, apri: apri };
})();
