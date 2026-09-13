/* Il piede del sito.
   ==================

   Gli stessi dati in fondo a ogni pagina: chi c'e' dietro, dove sta, la
   partita IVA. Scritti una volta sola nel database e stampati qui, perche'
   scritti a mano in sessantasette pagine, alla prima variazione, diventano
   sessantasette versioni diverse.

   Attenzione al nome della classe: «piede» esisteva gia' — e' la riga dei
   crediti in fondo alle carte regionali. Chiamare cosi' anche questo voleva
   dire che il controllo «c'e' gia' un piede?» trovava quello vecchio e non
   disegnava mai il nuovo. Qui si chiama «piede-sito».

   Le voci vuote non si stampano. Un piede che dice «Capitale sociale: »
   e' peggio di un piede che non lo dice: sembra un guasto, e per un privato
   senza società quella riga non esiste proprio.                            */
(function () {
  "use strict";

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function riga(etichetta, valore) {
    if (!valore) return "";
    return '<span class="piede-voce">' +
      (etichetta ? '<i>' + esc(etichetta) + '</i> ' : '') + esc(valore) + '</span>';
  }

  function disegna(i) {
    const anno = new Date().getFullYear();
    const da = (i.anno_da || "").trim();
    const arco = (da && +da < anno) ? da + "–" + anno : (da || String(anno));
    const nome = i.nome_sito || "Vado in spiaggia";

    const dati = [
      riga("Sede", i.sede),
      riga("P. IVA", i.piva),
      riga("C.F.", i.cf && i.cf !== i.piva ? i.cf : ""),
      riga("Cap. soc.", i.capitale),
      riga("", i.rea),
      riga("PEC", i.pec)
    ].join("");

    /* Qui dentro non va niente che non sia gia' pubblico per legge: il piede
       lo legge chiunque, motori di ricerca compresi. */
    return '<footer class="piede-sito">' +
      '<div class="piede-dentro">' +
        '<p class="piede-copy">© ' + esc(arco) + ' ' + esc(nome) +
          (i.titolare ? ' · <b>' + esc(i.titolare) + '</b>' : '') + '</p>' +
        (dati ? '<p class="piede-dati">' + dati + '</p>' : '') +
        '<p class="piede-vie">' +
          '<a href="privacy.html">Privacy</a>' +
          '<a href="termini.html">Termini di servizio</a>' +
          '<a href="crediti.html">Crediti e licenze</a>' +
          '<a href="#" data-cookie-apri>Preferenze cookie</a>' +
        '</p>' +
      '</div></footer>';
  }

  async function metti() {
    if (document.querySelector(".piede-sito")) return;
    let i = {};
    try { i = await VADO.impostazioni(); } catch (_) {}
    const guscio = document.querySelector(".guscio") || document.body;
    guscio.insertAdjacentHTML("beforeend", disegna(i));
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", metti);
  else metti();

  window.VADOPIEDE = { metti: metti };
})();
