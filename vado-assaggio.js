/* ===========================================================================
   Vado in spiaggia — la prima spiaggia di ogni paese è gratis.

   Non la scegliamo noi: la sceglie chi guarda. La prima che decide di aprire
   in un paese diventa sua, per sempre, con la scheda intera.

   Questo file disegna l'offerta nelle pagine pubbliche delle spiagge. La
   regola vera non e' qui: e' la chiave primaria della tabella «assaggi» —
   una riga per (persona, paese) — e il database non ne accetta una seconda.
   Quindi qui non c'e' niente da aggirare: si chiede lo stato e si disegna.

   Sta in un file condiviso e non dentro ogni pagina perche' le pagine sono
   cinquemilacinquecento: copiarlo dentro tutte vorrebbe dire spedire lo
   stesso codice cinquemila volte, e doverlo correggere in cinquemila posti.
   =========================================================================== */
(function () {
  const dove = document.getElementById("slotAssaggio");
  if (!dove || typeof VADO === "undefined") return;
  const SID   = dove.dataset.sid;
  const PAESE = dove.dataset.paese;
  const REG   = dove.dataset.regione;
  if (!SID || !PAESE || !REG) return;

  const esc = t => String(t == null ? "" : t)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  function riquadro(html, azione, etichetta){
    dove.innerHTML = '<div class="pub-assaggio">' + html +
      (etichetta ? '<button type="button" class="conto-vai">' + etichetta + '</button>' : '') + '</div>';
    const b = dove.querySelector("button");
    if (b && azione) b.onclick = azione;
  }

  VADO.alCambio(function (s) {
    if (!s) {
      riquadro('<p>Per prenderla ti basta un account: <b>una spiaggia per paese è gratis</b>, ' +
               'la scegli tu e resta tua.</p>',
               () => window.apriConto && window.apriConto("registrati"), "Accedi / Registrati");
      return;
    }
    VADO.mieiAssaggi().then(function (mie) {
      const gia = mie.filter(x => x.paese === PAESE)[0];
      if (gia) {
        /* se l'assaggio di questo paese E' proprio questa spiaggia, non si
           dice niente: la scheda si apre e basta, non serve annunciarlo */
        if (gia.sid === SID) { dove.innerHTML = ""; return; }
        dove.innerHTML = '<div class="pub-assaggio"><p>La tua spiaggia gratuita in questo paese è ' +
          'già <a href="../spiagge-' + esc(gia.regione) + '.html#' + encodeURIComponent(gia.sid) +
          '"><b>' + esc(gia.spiaggia) + '</b></a>. Una per paese: per le altre serve sbloccare ' +
          'la regione.</p></div>';
        return;
      }
      riquadro('<p><b>Prendi questa come tua spiaggia gratuita.</b> La vedrai per intera, ' +
               'per sempre, senza pagare. Una sola per paese, quindi prendila se è questa ' +
               'che ti interessa.</p>', prendi, "Sì, prendo questa");
    }).catch(function(){});
  });

  async function prendi(){
    const b = dove.querySelector("button");
    b.disabled = true; const era = b.textContent; b.textContent = "Un momento…";
    let r;
    try { r = await VADO.assaggia(SID); } catch (_) { r = { esito: "errore" }; }
    if (r.esito === "presa" || r.esito === "gia_tua") {
      location.href = "../spiagge-" + REG + ".html#" + encodeURIComponent(SID);
      return;
    }
    b.disabled = false; b.textContent = era;
    dove.querySelector("p").textContent =
      r.esito === "gia_speso" ? "In questo paese hai già scelto un’altra spiaggia."
                              : "Non ha funzionato: riprova fra poco.";
  }
})();
