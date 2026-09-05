/* ===========================================================================
   Vado in spiaggia — i pareri di chi c'e' stato.

   Sta in un file solo, condiviso da tutte le pagine, invece che copiato dentro
   le cinquantanove: una correzione qui vale ovunque.

   Due cose da tenere a mente leggendo:

   - le recensioni si leggono da CHIUNQUE, anche da chi non e' entrato e anche
     su regioni non sbloccate. E' voluto: il muro sta sulla scheda — fondo,
     servizi, accesso, meteo — non sul parere di chi c'e' andato. Il parere e'
     la vetrina di quello che c'e' dietro;

   - scriverne una richiede di essere entrati E di avere quella regione. Non lo
     decide questo file: lo decide il database, che a chi non ha la regione
     risponde che quella spiaggia non esiste. Qui si evita solo di far scrivere
     a vuoto un commento che verrebbe rifiutato.
   =========================================================================== */
window.VADORECE = (function () {
  const esc = t => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* Le medie di tutta la pagina si chiedono una volta sola, all'apertura, e
     restano qui: una spiaggia per volta vorrebbe dire centinaia di richieste. */
  let MEDIE = {};
  const media = sid => MEDIE[sid] || null;
  async function caricaMedie(sids) {
    try { MEDIE = await VADO.votiSpiagge(sids); } catch (_) { MEDIE = {}; }
    return MEDIE;
  }

  /* Cinque stelle piene o vuote, mai mezze: mezza stella si legge male e non
     aggiunge niente che il numero accanto non dica meglio. */
  function stelleFisse(v) {
    const n = Math.round(Number(v) || 0);
    let s = "";
    for (let i = 1; i <= 5; i++) s += '<span class="' + (i <= n ? "on" : "") + '">' + (i <= n ? "★" : "☆") + "</span>";
    return '<span class="voto-stelle" aria-label="' + n + ' su 5">' + s + "</span>";
  }

  /* Il riassunto accanto al nome della spiaggia. Quando non c'e' nessun parere
     non si scrive «0 pareri» — un numero a zero sembra un giudizio. */
  function riassunto(sid) {
    const m = media(sid);
    if (!m) return '<span class="voto-vuoto">nessun parere</span>';
    return stelleFisse(m.media) + '<b>' + String(m.media).replace(".", ",") + '</b>' +
           '<span class="voto-quanti">' + m.quanti + (m.quanti === 1 ? " parere" : " pareri") + '</span>';
  }

  const quando = t => {
    const d = new Date(t);
    return isNaN(d) ? "" : d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  };

  /* ------------------------------------------------------------ il riquadro */
  async function disegna(sid, nomeSpiaggia, dove) {
    if (!dove) return;
    dove.innerHTML = '<div class="rec"><p class="titoletto">Pareri di chi c’è stato</p>' +
                     '<p class="rec-attesa">Un momento…</p></div>';

    let elenco = [], mia = null, admin = false;
    try {
      elenco = await VADO.recensioniSpiaggia(sid);
    } catch (e) {
      dove.innerHTML = '<div class="rec"><p class="titoletto">Pareri di chi c’è stato</p>' +
        '<p class="rec-attesa">Non riesco a leggerli in questo momento.</p></div>';
      return;
    }
    if (VADO.chiSono()) {
      try { mia = await VADO.miaRecensione(sid); } catch (_) {}
      try { admin = await VADO.sonoAdmin(); } catch (_) {}
    }
    /* All'amministratore serve sapere DI CHI e' ogni riga per poterla togliere:
       l'elenco pubblico non lo dice apposta, quindi per lui si chiede l'altro. */
    let perModerare = null;
    if (admin) { try { perModerare = await VADO.recensioniModerabili(sid); } catch (_) {} }

    const m = media(sid);
    let html = '<div class="rec"><p class="titoletto">Pareri di chi c’è stato</p>';

    html += '<div class="rec-media">' +
      (m ? stelleFisse(m.media) + '<b>' + String(m.media).replace(".", ",") + '</b>' +
           '<span class="voto-quanti">su ' + m.quanti + (m.quanti === 1 ? " parere" : " pareri") + '</span>'
         : '<span class="voto-vuoto">Ancora nessuno ha detto la sua su questa spiaggia.</span>') +
      '</div>';

    if (elenco.length) {
      html += '<ul class="rec-elenco">' + elenco.map((r, i) => {
        const mod = perModerare && perModerare[i] ? perModerare[i] : null;
        return '<li><div class="rec-alto">' + stelleFisse(r.voto) +
          '<span class="rec-firma">' + esc(r.firma) + '</span>' +
          '<span class="rec-quando">' + quando(r.creata) + '</span>' +
          (mod ? '<button type="button" class="rec-togli" data-mod-sid="' + esc(mod.sid) +
                 '" data-mod-utente="' + esc(mod.utente) + '" title="Togli questa recensione">✕</button>' : '') +
          '</div>' +
          (r.commento ? '<p class="rec-testo">' + esc(r.commento) + '</p>' : '') + '</li>';
      }).join("") + '</ul>';
    }

    /* -------------------------------------------------------- il modulo */
    if (!VADO.chiSono()) {
      html += '<div class="rec-invito"><p>Ci sei stato? Il tuo parere aiuta chi ci deve ancora andare.</p>' +
              '<button type="button" class="conto-vai" data-rec-entra>Accedi / Registrati</button></div>';
    } else {
      const v = mia ? mia.voto : 0;
      html += '<form class="rec-modulo" data-rec-modulo>' +
        '<p class="rec-mio">' + (mia ? "Il tuo parere" : "Dì la tua") + '</p>' +
        '<div class="rec-voto" data-rec-voto role="radiogroup" aria-label="Voto da 1 a 5">' +
          [1,2,3,4,5].map(n => '<button type="button" data-n="' + n + '" class="' + (n <= v ? "on" : "") +
            '" aria-label="' + n + ' su 5" aria-pressed="' + (n === v) + '">' +
            (n <= v ? "★" : "☆") + '</button>').join("") +
          '<span class="rec-voto-eti">' + (v ? v + " su 5" : "tocca una stella") + '</span>' +
        '</div>' +
        '<textarea data-rec-testo rows="3" maxlength="1200" placeholder="Com’era? Fondo, acqua, servizi, quanta gente… (facoltativo)">' +
          esc(mia && mia.commento || "") + '</textarea>' +
        '<label class="rec-nome"><input type="checkbox" data-rec-nome' +
          (!mia || mia.mostra_nome ? " checked" : "") + '>' +
          '<span>Mostra il mio nome accanto al parere</span></label>' +
        '<p class="rec-esito" data-rec-esito hidden></p>' +
        '<div class="rec-azioni">' +
          '<button type="button" class="conto-vai" data-rec-salva>' +
            (mia ? "Aggiorna il parere" : "Pubblica il parere") + '</button>' +
          (mia ? '<button type="button" class="rec-cancella" data-rec-cancella>Togli il mio parere</button>' : '') +
        '</div></form>';
    }
    html += '</div>';
    dove.innerHTML = html;
    lega(dove, sid, nomeSpiaggia, mia);
  }

  function lega(dove, sid, nomeSpiaggia, mia) {
    const entra = dove.querySelector("[data-rec-entra]");
    if (entra) entra.onclick = () => window.apriConto && window.apriConto("accedi");

    dove.querySelectorAll("[data-mod-sid]").forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await VADO.togliRecensione(b.dataset.modSid, b.dataset.modUtente); }
      catch (e) { b.disabled = false; return; }
      await ricarica(dove, sid, nomeSpiaggia);
    });

    const modulo = dove.querySelector("[data-rec-modulo]");
    if (!modulo) return;
    const esito = modulo.querySelector("[data-rec-esito]");
    const testo = modulo.querySelector("[data-rec-testo]");
    const vediNome = modulo.querySelector("[data-rec-nome]");
    const eti = modulo.querySelector(".rec-voto-eti");
    let voto = mia ? mia.voto : 0;

    modulo.querySelectorAll("[data-rec-voto] button").forEach(b => b.onclick = () => {
      voto = +b.dataset.n;
      modulo.querySelectorAll("[data-rec-voto] button").forEach(x => {
        const on = +x.dataset.n <= voto;
        x.classList.toggle("on", on); x.textContent = on ? "★" : "☆";
        x.setAttribute("aria-pressed", String(+x.dataset.n === voto));
      });
      eti.textContent = voto + " su 5";
      esito.hidden = true;
    });

    const dillo = (t, buona) => {
      esito.innerHTML = t; esito.hidden = false;
      esito.className = "rec-esito " + (buona ? "buona" : "brutta");
    };

    modulo.querySelector("[data-rec-salva]").onclick = async () => {
      if (!voto) return dillo("Scegli quante stelle, da 1 a 5.", false);
      const b = modulo.querySelector("[data-rec-salva]");
      b.disabled = true; const era = b.textContent; b.textContent = "Un momento…";
      try {
        await VADO.salvaRecensione(sid, voto, testo.value, vediNome.checked);
        /* Chi ha chiesto di mostrare il nome e non l'ha mai scritto comparirebbe
           come «Anonimo» senza capire perche'. Meglio dirlo subito, con il
           collegamento per rimediare in dieci secondi. */
        if (vediNome.checked) {
          let p = null; try { p = await VADO.ilMioProfilo(); } catch (_) {}
          if (!p || !p.nome) {
            dillo('Pubblicato. Per firmarlo con il tuo nome scrivilo nel ' +
                  '<a href="profilo.html">tuo profilo</a>: per ora appare come «Anonimo».', true);
            setTimeout(() => ricarica(dove, sid, nomeSpiaggia), 2600);
            return;
          }
        }
        await ricarica(dove, sid, nomeSpiaggia);
      } catch (e) {
        b.disabled = false; b.textContent = era;
        dillo(inItaliano(e), false);
      }
    };

    const canc = modulo.querySelector("[data-rec-cancella]");
    if (canc) canc.onclick = async () => {
      canc.disabled = true;
      try { await VADO.togliRecensione(sid); } catch (e) { canc.disabled = false; return; }
      await ricarica(dove, sid, nomeSpiaggia);
    };
  }

  function inItaliano(e) {
    const t = (e && e.message || "").toLowerCase();
    if (t.includes("42501") || t.includes("row-level"))
      return "Questa spiaggia è in una regione che non hai sbloccato.";
    if (t.includes("failed to fetch")) return "Non riesco a raggiungere il servizio.";
    return "Non ha funzionato: " + (e && e.message || "errore sconosciuto");
  }

  /* Dopo ogni modifica la media cambia: si richiede solo quella di QUESTA
     spiaggia, non tutte quelle della pagina. */
  async function ricarica(dove, sid, nomeSpiaggia) {
    try {
      const r = await VADO.votiSpiagge([sid]);
      if (r[sid]) MEDIE[sid] = r[sid]; else delete MEDIE[sid];
    } catch (_) {}
    await disegna(sid, nomeSpiaggia, dove);
    /* il riassunto accanto al nome, se la pagina ne ha uno, va rifatto */
    document.querySelectorAll('[data-riassunto="' + sid + '"]').forEach(e => e.innerHTML = riassunto(sid));
  }

  return { caricaMedie, media, riassunto, stelleFisse, disegna, ricarica };
})();
