/* Segnalare un errore in una scheda.
   ==================================

   Un pulsante nella scheda della spiaggia, una finestrella, e la segnalazione
   finisce in una tabella che legge solo l'amministratore.

   Chi segnala deve essere entrato. Non e' un capriccio: la chiave del
   database sta in chiaro dentro queste pagine, e una porta aperta a chiunque
   e' una porta aperta anche a chi la riempie di spazzatura. L'account e'
   gratuito, e serve anche a poter rispondere a chi ha scritto.

   La regola vera sta nel database — RLS su "segnalazioni": chi non e' entrato
   viene rifiutato la' , non qui. Questo file rende soltanto la cosa
   comprensibile prima di provarci.                                          */
(function () {
  "use strict";

  const GENERI = [
    ["posizione", "Il segno è nel posto sbagliato"],
    ["dati",      "Nome, comune o dati sbagliati"],
    ["servizi",   "I servizi non corrispondono"],
    ["immagine",  "L’immagine non è questa spiaggia"],
    ["altro",     "Altro"]
  ];

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  let velo = null, campoSid = null, campoNome = null, campoReg = null;

  function costruisci() {
    if (velo) return velo;
    velo = document.createElement("dialog");
    velo.className = "velo segnala-velo";
    velo.innerHTML =
      '<form class="foglio segnala-foglio" method="dialog">' +
        '<div class="foglio-testa"><div>' +
          '<h3>Segnala un errore</h3>' +
          '<div class="sotto" data-sg-dove></div></div>' +
          '<button type="button" class="chiudi" aria-label="Chiudi">✕</button></div>' +
        '<div class="segnala-corpo">' +
          '<p class="segnala-nota" data-sg-nota></p>' +
          '<div data-sg-modulo>' +
            '<label class="segnala-campo"><span>Che cosa non va</span>' +
              '<select data-sg-genere>' +
                GENERI.map(g => '<option value="' + g[0] + '">' + g[1] + '</option>').join("") +
              '</select></label>' +
            '<label class="segnala-campo"><span>Raccontami</span>' +
              '<textarea data-sg-testo rows="4" maxlength="1200" ' +
                'placeholder="Per esempio: il segno è dall’altra parte del porto, la spiaggia vera è più a nord."></textarea></label>' +
            '<p class="segnala-esito" data-sg-esito hidden></p>' +
          '</div>' +
        '</div>' +
        '<div class="azioni">' +
          '<button type="button" class="primaria" data-sg-manda>Manda la segnalazione</button>' +
          '<button type="button" data-sg-chiudi data-sg-annulla>Annulla</button>' +
        '</div>' +
      '</form>';
    document.body.appendChild(velo);

    /* Come nella finestra dell'account: si chiude cliccando fuori, ma solo se
       anche la pressione era fuori — altrimenti chi seleziona il testo del
       messaggio e trascina oltre il bordo se la vede sparire a meta' frase. */
    let giuSulVelo = false;
    velo.addEventListener("pointerdown", e => { giuSulVelo = (e.target === velo); });
    velo.addEventListener("click", e => {
      if (e.target === velo && giuSulVelo) velo.close();
      giuSulVelo = false;
    });
    velo.querySelector(".chiudi").addEventListener("click", () => velo.close());
    velo.querySelector("[data-sg-chiudi]").addEventListener("click", () => velo.close());
    velo.querySelector("[data-sg-manda]").addEventListener("click", function () {
      /* Lo stesso pulsante fa due mestieri in due momenti diversi: prima
         manda, dopo chiude. Cosi' dopo l'invio non resta niente su cui
         cliccare per sbaglio, e niente si chiude da solo mentre si legge. */
      if (this.dataset.fatto === "1") { velo.close(); return; }
      manda();
    });
    return velo;
  }

  function dillo(testo, bene) {
    const e = velo.querySelector("[data-sg-esito]");
    e.hidden = false;
    e.className = "segnala-esito " + (bene ? "bene" : "male");
    e.textContent = testo;
  }

  function apri(sid, nome, regione) {
    costruisci();
    campoSid = sid; campoNome = nome; campoReg = regione;
    velo.querySelector("[data-sg-dove]").textContent = nome || sid;
    /* VADO nasce come "const" dentro vado-dati.js: e' una variabile globale
       ma NON una proprieta' di window, quindi window.VADO e' undefined anche
       quando VADO c'e' eccome. Va chiesto con typeof. */
    const dentro = (typeof VADO !== "undefined") && !!VADO.chiSono();
    const modulo = velo.querySelector("[data-sg-modulo]");
    const manda  = velo.querySelector("[data-sg-manda]");
    modulo.hidden = !dentro;
    manda.hidden  = !dentro;
    velo.querySelector("[data-sg-nota]").textContent = "";
    velo.querySelector("[data-sg-nota]").innerHTML = dentro
      ? "Scrivi che cosa hai visto di diverso. Guardo io, e correggo alla fonte: " +
        "la correzione arriva a tutti, non solo a te."
      : "Per segnalare serve un account — è gratuito, e serve perché possa " +
        "risponderti. " +
        '<button type="button" class="segnala-entra" data-sg-entra>Entra o iscriviti</button>';
    const b = velo.querySelector("[data-sg-entra]");
    if (b) b.addEventListener("click", () => {
      velo.close();
      if (typeof window.apriConto === "function") window.apriConto("accedi");
    });
    const t = velo.querySelector("[data-sg-testo]");
    if (t) t.value = "";
    const e = velo.querySelector("[data-sg-esito]");
    if (e) e.hidden = true;
    /* La finestra si riusa: se l'ultima volta era rimasta sul ringraziamento,
       va rimessa com'era prima, o alla seconda segnalazione si trova davanti
       un pulsante che dice "Chiudi" e nessun modulo. */
    manda.textContent = "Manda la segnalazione";
    manda.disabled = false;
    manda.dataset.fatto = "";
    velo.querySelector("[data-sg-annulla]").hidden = !dentro;
    velo.showModal();
    if (dentro && t) t.focus();
  }

  async function manda() {
    const bottone = velo.querySelector("[data-sg-manda]");
    const testo = (velo.querySelector("[data-sg-testo]").value || "").trim();
    if (testo.length < 5) {
      dillo("Scrivi almeno una frase: senza, non saprei da dove cominciare.", false);
      velo.querySelector("[data-sg-testo]").focus();
      return;
    }
    const io = (typeof VADO !== "undefined") && VADO.chiSono();
    if (!io) { dillo("La sessione è scaduta: rientra e riprova.", false); return; }

    bottone.disabled = true;
    const era = bottone.textContent;
    bottone.textContent = "Un momento…";
    try {
      await VADO.chiedi("segnalazioni", {
        metodo: "POST",
        corpo: {
          sid: campoSid,
          regione: campoReg || null,
          spiaggia: campoNome || null,
          utente: io.id,
          genere: velo.querySelector("[data-sg-genere]").value,
          testo: testo
        },
        intestazioni: { "Prefer": "return=minimal" }
      });
      /* Niente timer che la chiude da solo: la finestra resta finche' non la
         chiude chi l'ha aperta. Un timer e una X che fanno la stessa cosa nello
         stesso momento sono due modi di litigare per la stessa finestra. */
      velo.querySelector("[data-sg-modulo]").hidden = true;
      velo.querySelector("[data-sg-nota]").textContent = "Segnalazione inviata, grazie!";
      velo.querySelector("[data-sg-annulla]").hidden = true;
      bottone.disabled = false;
      bottone.textContent = "Chiudi";
      bottone.dataset.fatto = "1";
      bottone.focus();
      return;
    } catch (err) {
      dillo("Non è partita: " + String(err.message || err).slice(0, 200), false);
    }
    bottone.disabled = false;
    bottone.textContent = era;
  }

  /* Un ascoltatore solo per tutta la pagina: le schede si ridisegnano di
     continuo, e agganciare il pulsante a ogni ridisegno vuol dire dimenticarsene
     una volta su tre. */
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-segnala]");
    if (!b) return;
    e.preventDefault();
    apri(b.dataset.segnala, b.dataset.sgNome || "", b.dataset.sgReg || "");
  });

  window.VADOSEGNALA = { apri: apri };
})();
