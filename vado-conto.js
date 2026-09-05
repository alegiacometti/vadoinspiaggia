/* ===========================================================================
   Vado in spiaggia — accedere, registrarsi, uscire.

   Una finestrella sola, due schede: Accedi e Registrati. Il recupero della
   password NON e' una terza scheda: e' un collegamento piccolo sotto il campo
   della password, dov'e' su quasi tutti i siti — perche' lo si cerca solo dopo
   aver provato a entrare e aver sbagliato, non prima.

   Nessuna libreria: e' un <dialog>, che il browser sa gia' aprire, chiudere col
   tasto Esc e tenere sopra tutto il resto.

   Il pulsante si mette da se' dentro <div id="conto"></div>, dove lo trova.
   =========================================================================== */
(function conto() {
  const dove = document.getElementById("conto");
  if (!dove || typeof VADO === "undefined") return;

  /* ------------------------------------------------------------- finestrella */
  const velo = document.createElement("dialog");
  velo.className = "velo-conto";
  velo.innerHTML =
    '<form method="dialog" class="foglio-conto">' +
      '<button class="chiudi" value="x" aria-label="Chiudi">✕</button>' +
      '<div class="conto-schede" role="tablist">' +
        '<button type="button" data-s="accedi"    class="on">Accedi</button>' +
        '<button type="button" data-s="registrati">Registrati</button>' +
      '</div>' +
      '<p class="conto-nota" data-nota></p>' +
      '<label class="conto-campo" data-campo-email><span>Email</span>' +
        '<input type="email" name="email" autocomplete="email" required></label>' +
      '<label class="conto-campo" data-campo-pw><span>Password</span>' +
        '<input type="password" name="password" autocomplete="current-password" minlength="8" required></label>' +
      '<div class="conto-scordata" data-riga-scordata>' +
        '<button type="button" data-scordata>Password dimenticata?</button></div>' +
      '<div class="conto-torna" data-riga-torna hidden>' +
        '<button type="button" data-torna>← Torna all’accesso</button></div>' +
      '<p class="conto-esito" data-esito hidden></p>' +
      '<button type="button" class="conto-vai" data-vai>Accedi</button>' +
    '</form>';
  document.body.appendChild(velo);

  const f       = velo.querySelector("form");
  const nota    = velo.querySelector("[data-nota]");
  const esito   = velo.querySelector("[data-esito]");
  const cEmail  = velo.querySelector("[data-campo-email]");
  const cPw     = velo.querySelector("[data-campo-pw]");
  const rScord  = velo.querySelector("[data-riga-scordata]");
  const rTorna  = velo.querySelector("[data-riga-torna]");
  const vai     = velo.querySelector("[data-vai]");
  const schede  = [...velo.querySelectorAll(".conto-schede button")];
  let modo = "accedi";

  const TESTI = {
    accedi:     { nota: "Le regioni che hai sbloccato e le spiagge che hai salvato ti seguono su qualunque computer.",
                  vai: "Accedi", email: true, pw: true, ac: "current-password", scordata: true, tab: "accedi" },
    registrati: { nota: "Basta un indirizzo email. Le Marche sono libere per tutti: puoi provare il sito prima di sbloccare qualsiasi cosa.",
                  vai: "Crea l’account", email: true, pw: true, ac: "new-password", tab: "registrati" },
    recupera:   { nota: "Scrivi l’indirizzo con cui ti sei registrato: ti arriva un messaggio con il collegamento per scegliere una password nuova.",
                  vai: "Mandami il collegamento", email: true, pw: false, torna: true },
    nuova:      { nota: "Scegli la password nuova. Almeno otto caratteri.",
                  vai: "Salva la password", email: false, pw: true, ac: "new-password", senzaSchede: true }
  };

  function scheda(m) {
    modo = m;
    const t = TESTI[m];
    schede.forEach(b => b.classList.toggle("on", b.dataset.s === t.tab));
    velo.querySelector(".conto-schede").hidden = !!t.senzaSchede;
    nota.textContent = t.nota;
    vai.textContent  = t.vai;
    cEmail.hidden = !t.email; f.email.required    = !!t.email;
    cPw.hidden    = !t.pw;    f.password.required = !!t.pw;
    if (t.ac) f.password.autocomplete = t.ac;
    rScord.hidden = !t.scordata;
    rTorna.hidden = !t.torna;
    esito.hidden = true; esito.className = "conto-esito";
  }
  schede.forEach(b => b.addEventListener("click", () => scheda(b.dataset.s)));
  velo.querySelector("[data-scordata]").addEventListener("click", () => {
    /* l'indirizzo gia' scritto si porta dietro: chi arriva qui l'ha appena
       digitato, e ribatterlo e' la classica scortesia che fa abbandonare */
    const em = f.email.value; scheda("recupera"); f.email.value = em; f.email.focus();
  });
  velo.querySelector("[data-torna]").addEventListener("click", () => {
    const em = f.email.value; scheda("accedi"); f.email.value = em;
  });

  function dillo(testo, buona) {
    esito.textContent = testo;
    esito.className = "conto-esito" + (buona ? " buona" : " brutta");
    esito.hidden = false;
  }

  /* I messaggi che arrivano dal servizio sono in inglese e parlano di token e
     credenziali: qui si traducono nei casi che capitano davvero. */
  function inItaliano(e) {
    const t = (e && e.message || "").toLowerCase();
    if (t.includes("invalid login")) return "Email o password non corretti.";
    if (t.includes("already registered") || t.includes("already been registered"))
      return "Questo indirizzo ha già un account. Prova ad accedere, oppure fatti mandare una password nuova.";
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
      if (modo === "accedi") {
        await VADO.accedi(email, pw); velo.close();
      } else if (modo === "registrati") {
        const r = await VADO.iscriviti(email, pw);
        if (r.entrato) velo.close();
        else dillo("Account creato. Ti ho mandato un messaggio a " + email +
                   ": aprilo per confermare l’indirizzo, poi torna qui e accedi.", true);
      } else if (modo === "nuova") {
        await VADO.nuovaPassword(pw);
        dillo("Password cambiata. Sei dentro.", true);
        setTimeout(() => velo.close(), 1400);
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

  /* Aprire la finestra dall'esterno: la usa anche il pulsante della fascia
     "regione da sbloccare", che deve poter portare qui senza duplicare niente. */
  window.apriConto = function (m) {
    scheda(m === "registrati" ? "registrati" : "accedi");
    velo.showModal();
    (f.email.hidden ? f.password : f.email).focus();
  };

  /* ------------------------------------------------------------- il pulsante */
  VADO.alCambio(s => {
    dove.innerHTML = "";
    if (!s) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "conto-entra";
      b.textContent = "Accedi / Registrati";
      b.addEventListener("click", () => window.apriConto("accedi"));
      dove.appendChild(b);
      return;
    }
    const chi = document.createElement("span");
    chi.className = "conto-chi"; chi.textContent = s.utente ? s.utente.email : "";
    const b = document.createElement("button");
    b.type = "button"; b.className = "conto-esci"; b.textContent = "Esci";
    b.addEventListener("click", () => VADO.esci());
    dove.append(chi, b);

    /* Il collegamento alla gestione compare solo a chi amministra — e solo
       quando non ci si e' gia' dentro. Non e' una protezione: la pagina resta
       aperta a chiunque e sono le regole del database a non dargli niente.
       Serve a non dover ricordare a memoria un indirizzo. */
    if (!/gestione\.html$/.test(location.pathname)) VADO.sonoAdmin().then(si => {
      if (!si || !dove.contains(b)) return;
      const g = document.createElement("a");
      g.className = "conto-gest"; g.href = "gestione.html"; g.textContent = "Gestione";
      dove.insertBefore(g, b);
    });
  });

  /* ---------------------------------------------- si torna dalla posta
     Chi ha appena confermato l'iscrizione, o ha aperto il collegamento per la
     nuova password, deve accorgersi che e' successo qualcosa: altrimenti vede
     una pagina identica a prima e pensa che il collegamento fosse rotto. */
  const arrivo = VADO.daPosta && VADO.daPosta();
  const fascetta = (testo, brutto) => {
    const b = document.createElement("div");
    b.className = "conto-benvenuto" + (brutto ? " brutto" : "");
    b.textContent = testo;
    document.querySelector(".guscio").prepend(b);
    if (!brutto) setTimeout(() => b.remove(), 6000);
  };
  if (arrivo === "recovery") { scheda("nuova"); velo.showModal(); f.password.focus(); }
  else if (arrivo === "signup" || arrivo === "magiclink") fascetta("Indirizzo confermato: sei dentro.");
  else if (arrivo === "errore") fascetta("Quel collegamento non è più valido: chiedine un altro dalla finestra d’accesso.", true);

  /* Se la sessione cambia in un'altra scheda del browser — si esce di là — qui
     il pulsante deve accorgersene, altrimenti si resta a guardare un "Esci"
     che non ha piu' niente da chiudere. */
  addEventListener("storage", e => { if (e.key === "vado.sessione") location.reload(); });
})();
