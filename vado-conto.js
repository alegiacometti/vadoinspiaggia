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
        /* niente minlength: la convalida del browser qui non si vede. Vedi
           sotto, in controlla(). */
        '<input type="password" name="password" autocomplete="current-password"></label>' +
      '<div class="conto-forza" data-forza hidden>' +
        '<div class="forza-barra"><i></i></div><span class="forza-eti"></span></div>' +
      '<div class="conto-captcha" data-captcha hidden></div>' +
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
  const cForza  = velo.querySelector("[data-forza]");
  const cCapt   = velo.querySelector("[data-captcha]");
  const barra   = cForza.querySelector("i");
  const etiForza= cForza.querySelector(".forza-eti");
  const schede  = [...velo.querySelectorAll(".conto-schede button")];
  let modo = "accedi";

  const TESTI = {
    accedi:     { nota: "Le regioni che hai sbloccato e le spiagge che hai salvato ti seguono su qualunque computer.",
                  vai: "Accedi", email: true, pw: true, ac: "current-password", scordata: true, tab: "accedi" },
    registrati: { nota: "Basta un indirizzo email. Le Marche sono libere per tutti: puoi provare il sito prima di sbloccare qualsiasi cosa.",
                  vai: "Crea l’account", email: true, pw: true, ac: "new-password", tab: "registrati", nuova: true },
    recupera:   { nota: "Scrivi l’indirizzo con cui ti sei registrato: ti arriva un messaggio con il collegamento per scegliere una password nuova.",
                  vai: "Mandami il collegamento", email: true, pw: false, torna: true },
    nuova:      { nota: "Scegli la password nuova. Almeno otto caratteri.",
                  vai: "Salva la password", email: false, pw: true, ac: "new-password", senzaSchede: true, nuova: true }
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
    /* Il misuratore si mostra solo a chi la password la sta SCEGLIENDO. A chi
       sta entrando non serve sapere quanto e' robusta quella che ha gia': e'
       un giudizio che non puo' usare, e in piu' la disegna mentre la scrive. */
    cForza.hidden = !(t.pw && t.nuova);
    disegnaForza();
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

  /* ------------------------------------------------- quanto regge una password
     E' una stima, non una misura: nessuno puo' dire quanto e' sicura una
     password guardandola. Conta quello che conta davvero — la lunghezza, e
     quanti alfabeti diversi mescola — e toglie punti a quello che un programma
     prova per primo: la parola sola, la ripetizione, la sequenza di tastiera,
     il nome di chi la sta scegliendo. */
  const MIN = 8;
  const OVVIE = ["password","12345678","123456789","1234567890","qwertyuiop","qwerty123",
                 "iloveyou","abc12345","passw0rd","11111111","admin123","letmein1"];

  function forza(pw, email) {
    if (!pw) return { p: 0, et: "", col: "var(--corallo)" };
    if (pw.length < MIN) return { p: Math.round(pw.length / MIN * 22), et: "troppo corta", col: "var(--corallo)" };
    let p = Math.min(pw.length, 24) * 2.3;
    const alfabeti = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
    p += (alfabeti - 1) * 9;
    if (pw.length >= 12) p += 8;
    if (pw.length >= 16) p += 9;
    if (/^(.)\1+$/.test(pw))                                        p -= 45;
    if (/(.)\1{2,}/.test(pw))                                       p -= 8;
    if (/(012|123|234|345|456|567|678|789|890)/.test(pw))           p -= 10;
    if (/(abc|qwe|asd|zxc|qwerty|password|admin|1234)/i.test(pw))    p -= 18;
    const nome = String(email || "").split("@")[0].toLowerCase();
    if (nome.length > 2 && pw.toLowerCase().includes(nome))          p -= 28;
    if (OVVIE.indexOf(pw.toLowerCase()) >= 0) p = 3;
    p = Math.max(3, Math.min(100, Math.round(p)));
    if (p < 38) return { p: p, et: "debole",    col: "var(--corallo)" };
    if (p < 58) return { p: p, et: "così così", col: "var(--ambra)" };
    if (p < 78) return { p: p, et: "buona",     col: "var(--verde)" };
    return              { p: p, et: "ottima",   col: "var(--verde)" };
  }

  function disegnaForza() {
    if (cForza.hidden) return;
    const g = forza(f.password.value, f.email.value);
    barra.style.width = g.p + "%";
    barra.style.background = g.col;
    etiForza.textContent = g.et;
    etiForza.style.color = g.p >= 38 ? g.col : "var(--grigio)";
  }
  f.password.addEventListener("input", disegnaForza);
  f.email.addEventListener("input", disegnaForza);

  /* --------------------------------------------------------------- convalida
     La faceva il browser, con reportValidity() e minlength="8". Due difetti,
     e il secondo e' quello che hai visto:

       - il fumetto del browser dentro una finestra modale a volte non compare
         affatto, e quando compare e' nella lingua del browser, non del sito;
       - minlength non scatta su un valore che l'utente non ha DIGITATO: se la
         password arriva dal gestore di password, o e' incollata, il campo
         risulta valido comunque. Il pulsante allora parte, e la protesta
         arriva dal servizio, o non arriva affatto.

     Qui si controlla da soli e si scrive nello stesso posto dove finiscono
     tutti gli altri messaggi: uno solo, sempre visibile, sempre in italiano. */
  function controlla() {
    const t = TESTI[modo], em = f.email.value.trim(), pw = f.password.value;
    if (t.email) {
      if (!em) return [cEmail, "Scrivi il tuo indirizzo email."];
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em))
        return [cEmail, "Quell’indirizzo non sembra completo: ci vuole una chiocciola e un punto dopo."];
    }
    if (t.pw) {
      if (!pw) return [cPw, "Scrivi la password."];
      /* La lunghezza minima si chiede a chi la sta SCEGLIENDO. A chi sta
         entrando no: la sua password e' quella che e', e rifiutarla qui non la
         renderebbe piu' sicura — impedirebbe solo di entrare. */
      if (t.nuova) {
        if (pw.length < MIN)
          return [cPw, "La password deve essere di almeno " + MIN + " caratteri: ne hai scritti " +
                       pw.length + "."];
        if (OVVIE.indexOf(pw.toLowerCase()) >= 0)
          return [cPw, "Questa è fra le prime password che un programma prova. Cambiane almeno una parte."];
        const nome = em.split("@")[0].toLowerCase();
        if (nome.length > 2 && pw.toLowerCase().includes(nome))
          return [cPw, "La password contiene il tuo indirizzo: è la prima cosa che si tenta."];
      }
    }
    return null;
  }

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
    /* Il servizio rifiuta una password per due motivi diversi, e dirli
       entrambi «e' troppo corta» sarebbe una bugia in un caso su due: una
       password di venti caratteri finita in un furto di dati e' lunghissima
       e va cambiata lo stesso. */
    if (t.includes("known to be weak") || t.includes("easy to guess") || t.includes("pwned"))
      return "Questa password compare in elenchi di password rubate: chi attacca gli account le prova per prime. Scegline un’altra.";
    if (t.includes("at least") || t.includes("too short") || t.includes("characters"))
      return "La password è troppo corta o non ha i caratteri richiesti.";
    if (t.includes("weak_password") || t.includes("password")) return "Questa password non va bene: scegline un’altra.";
    if (t.includes("rate") || (e && e.stato === 429)) return "Troppi tentativi ravvicinati. Riprova fra qualche minuto.";
    if (t.includes("failed to fetch")) return "Non riesco a raggiungere il servizio. Controlla la connessione.";
    return "Non ha funzionato: " + (e && e.message || "errore sconosciuto");
  }

  /* ------------------------------------------------------------------ captcha
     Cloudflare Turnstile. Sta spento finche' questa chiave e' vuota: senza,
     non si disegna niente e le richieste partono esattamente come prima.

     Per accenderlo servono DUE chiavi, e vanno messe in due posti diversi:
       1. la chiave pubblica del sito, qui sotto;
       2. la chiave segreta, in Supabase → Authentication → Attack Protection
          → Enable Captcha protection → Turnstile.
     Metterne una sola non funziona, e fallisce in modi opposti: con la chiave
     qui e non la', il servizio ignora il gettone; con quella la' e non qui,
     rifiuta ogni iscrizione. */
  const CHIAVE_CAPTCHA = "";

  let widgetCaptcha = null;
  if (CHIAVE_CAPTCHA) {
    cCapt.hidden = false;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.defer = true;
    s.onload = () => {
      widgetCaptcha = window.turnstile.render(cCapt, {
        sitekey: CHIAVE_CAPTCHA, theme: "light", language: "it", size: "flexible"
      });
    };
    /* Se lo script non arriva — rete, blocco pubblicitario — non si lascia la
       finestra senza uscita: si va avanti senza gettone. Chi decide se serve
       davvero e' il servizio, che rifiutera'; ma almeno il messaggio lo scrive
       lui, invece di un pulsante che non fa niente per sempre. */
    s.onerror = () => { cCapt.hidden = true; };
    document.head.appendChild(s);
  }

  /* Il gettone si consuma: dopo ogni tentativo va chiesto di nuovo, o il
     secondo tentativo viene rifiutato con "timeout-or-duplicate". */
  function gettoneCaptcha() {
    if (!CHIAVE_CAPTCHA || !window.turnstile || widgetCaptcha === null) return "";
    try { return window.turnstile.getResponse(widgetCaptcha) || ""; } catch (_) { return ""; }
  }
  function rifaiCaptcha() {
    if (!CHIAVE_CAPTCHA || !window.turnstile || widgetCaptcha === null) return;
    try { window.turnstile.reset(widgetCaptcha); } catch (_) {}
  }

  vai.addEventListener("click", async () => {
    const male = controlla();
    if (male) {
      dillo(male[1], false);
      const campo = male[0].querySelector("input");
      if (campo) { campo.focus(); if (campo.select) campo.select(); }
      return;
    }
    const cap = gettoneCaptcha();
    if (CHIAVE_CAPTCHA && !cap && !cCapt.hidden) {
      dillo("Completa la verifica «non sono un robot» qui sopra.", false); return;
    }
    const email = f.email.value.trim(), pw = f.password.value;
    vai.disabled = true; const era = vai.textContent; vai.textContent = "Un momento…";
    try {
      if (modo === "accedi") {
        await VADO.accedi(email, pw, cap); velo.close();
      } else if (modo === "registrati") {
        const r = await VADO.iscriviti(email, pw, cap);
        if (r.entrato) velo.close();
        else dillo("Account creato. Ti ho mandato un messaggio a " + email +
                   ": aprilo per confermare l’indirizzo, poi torna qui e accedi.", true);
      } else if (modo === "nuova") {
        await VADO.nuovaPassword(pw);
        dillo("Password cambiata. Sei dentro.", true);
        setTimeout(() => velo.close(), 1400);
      } else {
        await VADO.scordata(email, cap);
        /* Si risponde uguale che l'indirizzo esista o no: dire "questo indirizzo
           non risulta" regalerebbe a chiunque un modo per sapere chi e' iscritto. */
        dillo("Se quell’indirizzo ha un account, il messaggio è partito.", true);
      }
    } catch (e) { dillo(inItaliano(e), false); }
    rifaiCaptcha();          /* il gettone e' bruciato: ne serve uno nuovo */
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
    /* Su quale pagina siamo: serve a non offrire un collegamento a quella
       che si sta gia' guardando. */
    const qui = p => new RegExp(p + "$").test(location.pathname);
    /* L'indirizzo e' anche il modo di arrivare al proprio profilo: e' dove la
       gente clicca per cercarlo, su qualunque sito. */
    const chi = document.createElement(qui("profilo\\.html") ? "span" : "a");
    chi.className = "conto-chi"; chi.textContent = s.utente ? s.utente.email : "";
    if (chi.tagName === "A") { chi.href = "profilo.html"; chi.title = "Il mio profilo"; }
    const b = document.createElement("button");
    b.type = "button"; b.className = "conto-esci"; b.textContent = "Esci";
    b.addEventListener("click", () => VADO.esci());
    dove.append(chi, b);

    /* Il collegamento alla gestione compare solo a chi amministra — e solo
       quando non ci si e' gia' dentro. Non e' una protezione: la pagina resta
       aperta a chiunque e sono le regole del database a non dargli niente.
       Serve a non dover ricordare a memoria un indirizzo. */
    const collega = (dove2, href, testo) => {
      const a = document.createElement("a");
      a.className = "conto-gest"; a.href = href; a.textContent = testo;
      dove2.insertBefore(a, b);
    };
    /* «Le mie spiagge» a chiunque sia entrato; «Gestione» solo a chi amministra.
       Nessuno dei due e' una protezione: la pagina resta aperta a tutti e sono
       le regole del database a non dare niente a chi non deve. Servono a non
       far ricordare a memoria un indirizzo. */
    if (!qui("preferiti\\.html")) collega(dove, "preferiti.html", "Le mie spiagge");
    if (!qui("confronta\\.html")) collega(dove, "confronta.html", "Confronta");
    if (!qui("gestione\\.html")) VADO.sonoAdmin().then(si => {
      if (si && dove.contains(b)) collega(dove, "gestione.html", "Gestione");
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
