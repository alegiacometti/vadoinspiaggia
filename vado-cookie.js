/* Il consenso ai contenuti esterni.
   =================================

   Prima di scrivere una fascia bisogna sapere che cosa deve fermare, perche'
   una fascia che non ferma niente non mette in regola nessuno: chiede un
   consenso che non serve, e intanto lascia passare quello che servirebbe
   chiedere davvero.

   Questo sito, di suo, non ha cookie di profilazione ne' di statistica.
   Conserva nel browser due cose tecniche — il gettone della sessione e questa
   scelta qui — che la legge non obbliga a far autorizzare, perche' senza non
   funzionerebbe quello che la persona ha chiesto.

   Quello che invece va chiesto sono i CONTENUTI ESTERNI: le finestre di
   Google Maps e di Street View dentro la scheda della spiaggia. Quelle sono
   pagine di Google dentro la nostra, e Google ci mette i suoi cookie. Finche'
   non c'e' il consenso, quelle finestre non si caricano affatto: al loro posto
   c'e' un riquadro con un pulsante.

   Le due risposte pesano uguale — stessa dimensione, stesso colore, un clic
   ciascuna. Una fascia dove rifiutare costa piu' fatica che accettare non e'
   un consenso libero, ed e' esattamente quello che l'autorita' contesta.    */
(function () {
  "use strict";

  const CHIAVE = "vado.cookie";
  const VERSIONE = 1;                 /* si alza solo se cambiano le categorie */

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  function leggi() {
    try {
      const d = JSON.parse(localStorage.getItem(CHIAVE) || "null");
      if (!d || d.versione !== VERSIONE) return null;
      return d;
    } catch (_) { return null; }
  }
  function scrivi(esterni) {
    try {
      localStorage.setItem(CHIAVE, JSON.stringify({
        versione: VERSIONE, esterni: !!esterni, il: new Date().toISOString()
      }));
    } catch (_) { /* navigazione privata: vale per questa visita e basta */ }
    scelta = { versione: VERSIONE, esterni: !!esterni };
  }

  let scelta = leggi();
  const ok = che => !!(scelta && scelta[che || "esterni"]);

  /* ------------------------------------------------------------- la fascia */
  let fascia = null;
  function chiudi() { if (fascia) { fascia.remove(); fascia = null; } }

  function mostra(daPreferenze) {
    chiudi();
    fascia = document.createElement("div");
    fascia.className = "ck";
    fascia.setAttribute("role", "dialog");
    fascia.setAttribute("aria-label", "Preferenze sui cookie");
    fascia.innerHTML =
      '<div class="ck-dentro">' +
        '<div class="ck-testo">' +
          '<p><b>Questo sito non ti profila.</b> Tiene nel browser solo due cose ' +
          'tecniche: che sei entrato, e questa scelta qui.</p>' +
          '<p>Nelle schede delle spiagge però ci sono le finestre di <b>Google Maps ' +
          'e Street View</b>: quelle sono pagine di Google dentro la nostra, e Google ' +
          'ci mette i suoi cookie. Le carico solo se me lo dici tu. ' +
          '<a href="privacy.html">Come tratto i dati</a>.</p>' +
        '</div>' +
        '<div class="ck-scelte">' +
          '<button type="button" data-ck-si>Accetta i contenuti esterni</button>' +
          '<button type="button" data-ck-no>Solo i tecnici</button>' +
        '</div>' +
        (daPreferenze && scelta
          ? '<p class="ck-ora">Adesso: contenuti esterni <b>' +
            (scelta.esterni ? "accettati" : "rifiutati") + '</b>.</p>' : '') +
      '</div>';
    document.body.appendChild(fascia);
    fascia.querySelector("[data-ck-si]").addEventListener("click", () => rispondi(true));
    fascia.querySelector("[data-ck-no]").addEventListener("click", () => rispondi(false));
  }

  function rispondi(si) {
    scrivi(si);
    chiudi();
    /* Chi accetta deve vedere subito il risultato, senza ricaricare a mano:
       i riquadri bloccati che sono gia' in pagina si aprono da soli. */
    if (si) document.querySelectorAll("[data-esterno-src]").forEach(apriRiquadro);
    document.dispatchEvent(new CustomEvent("vado:cookie", { detail: { esterni: si } }));
  }

  /* --------------------------------------------------- i riquadri bloccati */
  function iframe(src, titolo) {
    return '<iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="' +
           esc(titolo) + '" src="' + esc(src) + '"></iframe>';
  }

  /* Si usa al posto di <iframe> per qualunque cosa venga da fuori. Se il
     consenso c'e', e' un iframe e basta; se non c'e', e' un riquadro che
     spiega che cosa manca e come averlo. */
  function esterno(src, titolo) {
    if (ok("esterni")) return iframe(src, titolo);
    return '<div class="ck-bloccato" data-esterno-src="' + esc(src) + '" ' +
           'data-esterno-tit="' + esc(titolo) + '">' +
      '<p><b>' + esc(titolo) + '</b></p>' +
      '<p class="ck-perche">È una finestra di Google. Per mostrarla devo caricarla ' +
      'dai suoi server, che ci mettono i loro cookie.</p>' +
      '<button type="button" data-ck-apri-uno>Mostra solo questa</button>' +
      '<button type="button" class="ck-sempre" data-ck-si>Mostra sempre</button>' +
      '</div>';
  }

  function apriRiquadro(q) {
    const src = q.dataset.esternoSrc, tit = q.dataset.esternoTit || "";
    if (!src) return;
    q.outerHTML = iframe(src, tit);
  }

  /* Un ascoltatore solo: i riquadri nascono e muoiono con le schede, e
     agganciarli uno per uno a ogni ridisegno vuol dire dimenticarsene. */
  document.addEventListener("click", e => {
    const uno = e.target.closest && e.target.closest("[data-ck-apri-uno]");
    if (uno) { e.preventDefault(); return apriRiquadro(uno.closest("[data-esterno-src]")); }
    /* La fascia ha i suoi ascoltatori diretti: qui si guardano solo i «mostra
       sempre» dei riquadri bloccati. Il controllo giusto e' "questo clic viene
       da dentro la fascia?", non "la fascia e' aperta?" — altrimenti, finche'
       la fascia sta a video, i pulsanti dei riquadri non rispondono. */
    const si = e.target.closest && e.target.closest("[data-ck-si]");
    if (si && !si.closest(".ck")) { e.preventDefault(); return rispondi(true); }
    const pref = e.target.closest && e.target.closest("[data-cookie-apri]");
    if (pref) { e.preventDefault(); mostra(true); }
  });

  function avvia() { if (!scelta) mostra(false); }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", avvia);
  else avvia();

  window.VADOCOOKIE = { ok: ok, esterno: esterno, preferenze: () => mostra(true) };
})();
