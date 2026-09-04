/* ===========================================================================
   Vado in spiaggia — entrare, uscire, iscriversi.

   Una sola finestrella, tre schede: entra, iscriviti, password dimenticata.
   Nessuna libreria: e' un <dialog>, che il browser sa gia' aprire, chiudere
   col tasto Esc e tenere sopra tutto il resto senza che glielo si dica.

   Il pulsante si mette da se' dentro <div id="conto"></div>, dove lo trova.
   =========================================================================== */
(function conto() {
  const dove = document.getElementById("conto");
  if (!dove || typeof VADO === "undefined") return;

  const E = (t, c, x) => { const e = document.createElement(t);
    if (c) e.className = c; if (x != null) e.textContent = x; return e; };

  /* ------------------------------------------------------------- finestrella */
  const velo = document.createElement("dialog");
  velo.className = "velo-conto";
  velo.innerHTML =
    '<form method="dialog" class="foglio-conto">' +
      '<button class="chiudi" value="x" aria-label="Chiudi">✕</button>' +
      '<div class="conto-schede" role="tablist">' +
        '<button type="button" data-s="entra"    class="on">Entra</button>' +
        '<button type="button" data-s="iscriviti">Iscriviti</button>' +
        '<button type="button" data-s="scordata">Password dimenticata</button>' +
      '</div>' +
      '<p class="conto-nota" data-nota></p>' +
      '<label class="conto-campo"><span>Email</span>' +
        '<input type="email" name="email" autocomplete="email" required></label>' +
      '<label class="conto-campo" data-campo-pw><span>Password</span>' +
        '<input type="password" name="password" autocomplete="current-password" minlength="8" required></label>' +
      '<p class="conto-esito" data-esito hidden></p>' +
      '<button type="button" class="conto-vai" data-vai>Entra</button>' +
    '</form>';
  document.body.appendChild(velo);

  const f      = velo.querySelector("form");
  const nota   = velo.querySelector("[data-nota]");
  const esito  = velo.querySelector("[data-esito]");
  const campoPw= velo.querySelector("[data-campo-pw]");
  const vai    = velo.querySelector("[data-vai]");
  const schede = [...velo.querySelectorAll(".conto-schede button")];
  let modo = "entra";

  const TESTI = {
    entra:     { nota: "Le regioni che hai sbloccato e le spiagge che hai salvato ti seguono su qualunque computer.", vai: "Entra", pw: true,  ac: "current-password" },
    iscriviti: { nota: "Basta un indirizzo email. Le Marche sono libere per tutti: puoi provare il sito prima di sbloccare qualsiasi cosa.", vai: "Crea l’account", pw: true, ac: "new-password" },
    scordata:  { nota: "Ti arriva un messaggio con il collegamento per sceglierne una nuova.", vai: "Mandami il collegamento", pw: false, ac: "" }
  };

  function scheda(m) {
    modo = m;
    schede.forEach(b => b.classList.toggle("on", b.dataset.s === m));
    nota.textContent = TESTI[m].nota;
    vai.textContent  = TESTI[m].vai;
    campoPw.hidden   = !TESTI[m].pw;
    const pw = f.password; pw.required = TESTI[m].pw; pw.autocomplete = TESTI[m].ac;
    esito.hidden = true; esito.className = "conto-esito";
  }
  schede.forEach(b => b.addEventListener("click", () => scheda(b.dataset.s)));

  function dillo(testo, buona) {
    esito.textContent = testo;
    esito.className = "conto-esito" + (buona ? " buona" : " brutta");
    esito.hidden = false;
  }

  /* I messaggi che arrivano dal servizio sono in inglese e parlano di token e
     credenziali: qui si traducono nei due o tre casi che capitano davvero. */
  function inItaliano(e) {
    const t = (e && e.message || "").toLowerCase();
    if (t.includes("invalid login")) return "Email o password non corretti.";
    if (t.includes("already registered") || t.includes("already been registered"))
      return "Questo indirizzo ha già un account. Prova a entrare, o a farti mandare una nuova password.";
    if (t.includes("email not confirmed")) return "L’indirizzo non è ancora confermato: guarda nella posta, anche fra lo spam.";
    if (t.includes("password")) return "La password deve essere di almeno otto caratteri.";
    if (t.includes("rate") || (e && e.stato === 429)) return "Troppi tentativi ravvicinati. Riprova fra qualche minuto.";
    if (t.includes("failed to fetch")) return "Non riesco a raggiungere il servizio. Controlla la connessione.";
    return "Non ha funzionato: " + (e && e.message || "errore sconosciuto");
  }

  vai.addEventListener("click", async () => {
    if (!f.reportValidity()) return;
    const email = f.email.value.trim(), pw = f.password.value;
    vai.disabled = true; const era = vai.textContent; vai.textContent = "Un momento…";
    try {
      if (modo === "entra") {
        await VADO.accedi(email, pw); velo.close();
      } else if (modo === "iscriviti") {
        const r = await VADO.iscriviti(email, pw);
        if (r.entrato) velo.close();
        else dillo("Account creato. Ti ho mandato un messaggio a " + email +
                   ": aprilo per confermare l’indirizzo, poi torna qui ed entra.", true);
      } else {
        await VADO.scordata(email);
        /* Si risponde uguale che l'indirizzo esista o no: dire "questo indirizzo
           non risulta" regalerebbe a chiunque un modo per sapere chi e' iscritto. */
        dillo("Se quell’indirizzo ha un account, il messaggio è partito.", true);
      }
    } catch (e) { dillo(inItaliano(e), false); }
    vai.disabled = false; vai.textContent = era;
  });
  f.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); vai.click(); } });

  /* ------------------------------------------------------------- il pulsante */
  VADO.alCambio(s => {
    dove.innerHTML = "";
    if (!s) {
      const b = E("button", "conto-entra", "Entra");
      b.type = "button";
      b.addEventListener("click", () => { scheda("entra"); velo.showModal(); f.email.focus(); });
      dove.appendChild(b);
      return;
    }
    const chi = E("span", "conto-chi", s.utente ? s.utente.email : "");
    const b = E("button", "conto-esci", "Esci"); b.type = "button";
    b.addEventListener("click", () => VADO.esci());
    dove.append(chi, b);
  });

  /* Se la sessione cambia in un'altra scheda del browser — si esce di là — qui
     il pulsante deve accorgersene, altrimenti si resta a guardare un "Esci"
     che non ha piu' niente da chiudere. */
  addEventListener("storage", e => { if (e.key === "vado.sessione") location.reload(); });
})();
