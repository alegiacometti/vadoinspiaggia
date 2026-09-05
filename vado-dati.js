/* ===========================================================================
   Vado in spiaggia — il ponte fra le pagine e il database.

   Le schede delle spiagge non stanno piu' dentro le pagine: stanno in un
   database che, prima di rispondere, guarda chi sta chiedendo. Questo file e'
   l'unico posto da cui le pagine gliele chiedono.

   La chiave qui sotto e' PUBBLICA, ed e' giusto che si veda: non apre niente.
   Serve solo a dire "sono il sito di Vado in spiaggia" e porta con se' il ruolo
   del visitatore non registrato. Chi vede una regione e chi no lo decide il
   database con le proprie regole, non questa chiave e non questo file: se
   qualcuno copiasse la chiave e chiedesse le spiagge di Creta, si sentirebbe
   rispondere con un elenco vuoto, esattamente come chiunque altro.

   Non c'e' nessuna libreria da scaricare: e' una richiesta HTTP e basta, come
   tutto il resto del sito.
   =========================================================================== */
const VADO = (() => {
  /* In prova, sul computer di chi sviluppa, si puo' puntare a un finto
     servizio locale; dal sito vero l'indirizzo e' uno solo e non si tocca. */
  const LOCALE = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const BASE = (LOCALE && window.VADO_BASE) || "https://meiurmbdotohixqawprd.supabase.co";
  const CHIAVE = "sb_publishable_T6WweLO_kXsLO57kutuAVA_VDMubUkf";

  /* ---------------------------------------------------------------- sessione
     Il gettone della sessione parte con ogni richiesta: il database riconosce
     la persona e le fa vedere anche le regioni che ha sbloccato. Finche' e'
     vuoto si parla da visitatori, e si vede solo quel che e' libero.

     Sta in localStorage perche' deve sopravvivere alla chiusura della finestra:
     nessuno vuole rifare l'accesso ogni volta che riapre il sito. Il gettone
     d'accesso scade dopo un'ora, e allora si rinnova da se' con quello di
     rinnovo, che dura molto di piu'. */
  const CASSETTO = "vado.sessione";
  let sessione = null;
  const ascoltatori = [];

  const leggiCassetto = () => {
    try { return JSON.parse(localStorage.getItem(CASSETTO) || "null"); }
    catch (_) { return null; }
  };
  const scriviCassetto = s => {
    try { s ? localStorage.setItem(CASSETTO, JSON.stringify(s))
            : localStorage.removeItem(CASSETTO); } catch (_) {}
  };
  /* Gli ascoltatori vanno svegliati quando cambia CHI sta guardando: entrato,
     uscito, un altro. NON quando si rinnova soltanto il gettone — quello
     succede da se' ogni ora, e la pagina di una regione reagisce al cambio
     ricaricandosi: una ricarica a tradimento mentre uno legge una scheda. */
  let ultimoChi = null;
  const avvisa = () => {
    const ora = (sessione && sessione.utente && sessione.utente.id) || null;
    if (ora === ultimoChi) return;
    ultimoChi = ora;
    ascoltatori.forEach(f => { try { f(sessione); } catch (e) { console.warn(e); } });
  };

  sessione = leggiCassetto();
  ultimoChi = (sessione && sessione.utente && sessione.utente.id) || null;
  const alCambio = f => { ascoltatori.push(f); f(sessione); };

  /* Un altro pannello aperto sullo stesso sito puo' aver fatto accesso, o
     essere uscito, o aver rinnovato il gettone. Il cassetto e' in comune:
     lo si rilegge invece di restare con una sessione vecchia in mano. */
  window.addEventListener("storage", e => {
    if (e.key !== CASSETTO) return;
    sessione = leggiCassetto();
    avvisa();
  });
  const chiSono  = () => sessione && sessione.utente || null;

  function apriSessione(d) {
    if (!d || !d.access_token) { sessione = null; scriviCassetto(null); avvisa(); return null; }
    sessione = {
      gettone:  d.access_token,
      rinnovo:  d.refresh_token,
      /* si segna QUANDO scade, non quanto manca: "3600 secondi" invecchia da
         solo, un istante nel tempo no. Trenta secondi di margine perche' una
         richiesta partita un attimo prima della scadenza non arrivi scaduta. */
      scade:    Date.now() + ((d.expires_in || 3600) - 30) * 1000,
      utente:   d.user ? { id: d.user.id, email: d.user.email } : (sessione && sessione.utente) || null,
      /* il ruolo non cambia rinnovando il gettone: non lo si richiede da capo */
      admin:    (sessione && sessione.admin != null) ? sessione.admin : null
    };
    scriviCassetto(sessione); avvisa(); return sessione;
  }

  async function auth(percorso, corpo, gettoneEsplicito) {
    const r = await fetch(BASE + "/auth/v1/" + percorso, {
      method: "POST",
      headers: {
        "apikey": CHIAVE, "Content-Type": "application/json",
        "Authorization": "Bearer " + (gettoneEsplicito || CHIAVE)
      },
      body: JSON.stringify(corpo || {})
    });
    const testo = await r.text();
    let d = null; try { d = testo ? JSON.parse(testo) : null; } catch (_) {}
    if (!r.ok) {
      const e = new Error((d && (d.msg || d.error_description || d.message)) || ("HTTP " + r.status));
      e.stato = r.status; throw e;
    }
    return d;
  }

  /* Rinnova il gettone quando e' scaduto.

     Il gettone di rinnovo si CONSUMA: il servizio ne restituisce uno nuovo e
     invalida quello appena speso. Quindi puo' essere speso una volta sola —
     e una pagina non fa mai una richiesta alla volta. All'apertura di una
     regione ne partono quattro insieme (zone, spiagge, e i due elenchi dei
     preferiti): se il gettone e' scaduto, tutte e quattro si accorgono
     insieme che va rinnovato, e tutte e quattro provano a spendere lo stesso
     gettone. Una vince; le altre si sentono rispondere "gia' usato".

     Era questo il guasto: chi perdeva la corsa buttava via la sessione — e la
     buttava via per tutti, anche per l'amministratore, che si ritrovava
     davanti al muro delle regioni bloccate pur essendo entrato.

     Due cose lo tolgono di mezzo:
       - il rinnovo e' UNO SOLO. Chi lo trova gia' in corso aspetta quello,
         non ne apre un secondo;
       - se fallisce, prima di dichiarare morta la sessione si rilegge il
         cassetto: un altro pannello puo' averla rinnovata un istante prima,
         e allora la sessione e' viva e la nostra copia era solo vecchia. */
  let rinnovoInCorso = null;

  async function rinnovaGettone() {
    const speso = sessione && sessione.rinnovo;
    try {
      const s = apriSessione(await auth("token?grant_type=refresh_token",
                                       { refresh_token: speso }));
      return s && s.gettone;
    } catch (_) {
      const c = leggiCassetto();
      if (c && c.gettone && c.rinnovo !== speso && Date.now() < c.scade) {
        sessione = c; avvisa(); return c.gettone;   /* l'ha rinnovata un altro */
      }
      apriSessione(null); return null;              /* finita per davvero */
    }
  }

  function gettoneVivo() {
    if (!sessione) return Promise.resolve(null);
    if (Date.now() < sessione.scade) return Promise.resolve(sessione.gettone);
    if (!rinnovoInCorso) {
      rinnovoInCorso = rinnovaGettone().finally(() => { rinnovoInCorso = null; });
    }
    return rinnovoInCorso;
  }

  /* Dove si atterra dopo aver confermato l'indirizzo o chiesto una nuova
     password. Lo diciamo noi a ogni richiesta invece di affidarci al "Site URL"
     del pannello: quello e' un'impostazione lontana, che si dimentica e che non
     si vede fallire — ci si accorge dell'errore solo quando un iscritto
     atterra su una pagina che non esiste. location.pathname senza l'ultimo
     pezzo e' la cartella del sito, qualunque sia. */
  /* Le pagine pubbliche delle spiagge stanno in una sottocartella: da li' il
     ritorno dopo la conferma per email deve puntare alla RADICE del sito, non
     a una cartella che non ha una pagina d'ingresso. */
  const RITORNO = (location.origin + location.pathname.replace(/[^/]*$/, ""))
                    .replace(/\/(spiaggia|elenco)\/$/, "/");

  /* Il gettone del captcha, quando c'e', viaggia in gotrue_meta_security: e'
     il posto dove il servizio lo cerca. Se il captcha e' spento il campo non
     si manda affatto — mandarlo vuoto, con la protezione accesa, e' un rifiuto
     sicuro. */
  const conCaptcha = (corpo, gettone) =>
    gettone ? Object.assign({}, corpo, { gotrue_meta_security: { captcha_token: gettone } }) : corpo;

  const iscriviti = (email, password, captcha) =>
    auth("signup?redirect_to=" + encodeURIComponent(RITORNO),
         conCaptcha({ email, password }, captcha)).then(d => {
    /* Se la conferma per email e' attiva, qui NON arriva nessun gettone: e'
       normale, e va detto a chi si e' iscritto invece di lasciarlo davanti a
       una schermata che non cambia. */
    if (d && d.access_token) apriSessione(d);
    return { entrato: !!(d && d.access_token), email: d && d.user && d.user.email };
  });

  const accedi = (email, password, captcha) =>
    auth("token?grant_type=password", conCaptcha({ email, password }, captcha)).then(apriSessione);

  const scordata = (email, captcha) =>
    auth("recover?redirect_to=" + encodeURIComponent(RITORNO),
         conCaptcha({ email }, captcha)).then(() => true);

  /* Cambiare la password di chi e' gia' dentro (o e' appena rientrato dal
     collegamento del "password dimenticata"). */
  const nuovaPassword = async password => {
    const g = await gettoneVivo();
    if (!g) throw new Error("sessione scaduta");
    const r = await fetch(BASE + "/auth/v1/user", {
      method: "PUT",
      headers: { "apikey": CHIAVE, "Content-Type": "application/json", "Authorization": "Bearer " + g },
      body: JSON.stringify({ password })
    });
    if (!r.ok) { const t = await r.text(); const e = new Error(t.slice(0,200)); e.stato = r.status; throw e; }
    return true;
  };

  /* --------------------------------------------------- il ritorno dalla posta
     Confermata l'iscrizione, o aperto il collegamento per la nuova password,
     Supabase rimanda al sito con i gettoni appesi al frammento dell'indirizzo
     (dopo il #). Se nessuno li raccoglie, la persona atterra sul sito ANCORA
     SLEGATA e pensa che non abbia funzionato. Qui si raccolgono, si apre la
     sessione, e si ripulisce l'indirizzo: quei gettoni non devono restare
     scritti nella barra del browser, ne' finire nella cronologia. */
  let arrivo = null;                       /* "signup" | "recovery" | "errore" */
  (function raccogli() {
    const f = location.hash.slice(1);
    if (!f || f.indexOf("access_token=") < 0 && f.indexOf("error") < 0) return;
    const p = new URLSearchParams(f);
    if (p.get("access_token")) {
      apriSessione({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token"),
                     expires_in: +(p.get("expires_in") || 3600) });
      arrivo = p.get("type") || "signup";
    } else {
      arrivo = "errore";
    }
    history.replaceState(null, "", location.pathname + location.search);
  })();
  const daPosta = () => arrivo;

  /* Tornando dal collegamento della posta i gettoni arrivano nudi: dentro non
     c'e' chi sei. Senza questo, dopo aver confermato l'indirizzo la sessione
     e' aperta ma senza nome — il sito sa che sei entrato e non sa chi sei. */
  async function completaUtente(){
    if (!sessione || (sessione.utente && sessione.utente.id)) return;
    try{
      const r = await fetch(BASE + "/auth/v1/user",
        { headers: { "apikey": CHIAVE, "Authorization": "Bearer " + sessione.gettone } });
      if (!r.ok) return;
      const u = await r.json();
      sessione.utente = { id: u.id, email: u.email };
      scriviCassetto(sessione); avvisa();
    }catch(_){}
  }
  if (arrivo) completaUtente();

  /* Sei un amministratore? Serve solo a decidere se mostrare il collegamento
     alla gestione: a decidere davvero e' il database, che a chi non lo e'
     risponde vuoto qualunque cosa mostri questa pagina. Si chiede una volta
     per sessione e si tiene da parte — non a ogni pagina aperta. */
  async function sonoAdmin(){
    if (!sessione || !sessione.utente) return false;
    if (sessione.admin != null) return sessione.admin;
    try{
      const r = await chiedi("profili?select=ruolo&utente=eq." + sessione.utente.id);
      sessione.admin = !!(r[0] && r[0].ruolo === "admin");
    }catch(_){ sessione.admin = false; }
    scriviCassetto(sessione);
    return sessione.admin;
  }

  async function esci() {
    const g = sessione && sessione.gettone;
    apriSessione(null);
    if (g) { try { await auth("logout", {}, g); } catch (_) {} }
  }

  /* --------------------------------------------------------------- richieste */
  async function chiedi(percorso, opzioni) {
    const o = opzioni || {};
    const manda = g => fetch(BASE + "/rest/v1/" + percorso, {
      method: o.metodo || "GET",
      headers: Object.assign({
        "apikey": CHIAVE,
        "Authorization": "Bearer " + (g || CHIAVE),
        "Accept": "application/json"
      }, o.corpo ? { "Content-Type": "application/json" } : {},
         o.intestazioni || {}),
      body: o.corpo ? JSON.stringify(o.corpo) : undefined
    });

    let g = await gettoneVivo();
    let r = await manda(g);
    /* 401 con un gettone in mano vuol dire che quel gettone non vale piu':
       l'orologio di qui e quello del servizio possono non essere d'accordo,
       e allora "scade" ci ha detto di si' un momento di troppo. Si rinnova e
       si riprova UNA volta — non di piu', o un gettone morto diventa un giro
       infinito di richieste. */
    if (r.status === 401 && g) {
      if (sessione) sessione.scade = 0;
      const g2 = await gettoneVivo();
      if (g2 && g2 !== g) r = await manda(g2);
    }
    if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
    if (r.status === 204) return null;
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  /* Le spiagge di una regione, e le sue zone.
     Attenzione a come si legge la risposta: un elenco VUOTO non e' un errore e
     non e' un guasto di rete — e' la risposta giusta a chi quella regione non
     ce l'ha. E' il muro, e arriva sotto forma di zero righe. Per questo la
     pagina distingue i tre casi: rete caduta, regione chiusa, tutto a posto. */
  async function regione(chiave) {
    const [zone, spiagge] = await Promise.all([
      chiedi("zone?regione=eq." + chiave + "&select=chiave,etichetta&order=ordine"),
      chiedi("spiagge?regione=eq." + chiave +
             "&select=sid,n,com,zona,lat,lon,lato,lung,fondo,folla,acc,camm,park,sv,id,nota,sc,pid,vo,mid,apa,lag" +
             "&order=sid")
    ]);
    return {
      zone: Object.fromEntries(zone.map(z => [z.chiave, z.etichetta])),
      /* nel resto del sito la zona di una spiaggia si chiama "z": la tabella la
         chiama "zona", che nel database e' piu' chiaro. Si traduce qui, una
         volta sola, invece di cambiare mille righe di pagina. */
      spiagge: spiagge.map(b => { b.z = b.zona; delete b.zona; return b; })
    };
  }

  /* Il catalogo e' pubblico: serve a dire che cosa esiste anche a chi non ha
     comprato niente. */
  /* La riga di catalogo di una regione: nome, quante spiagge, se e' libera.
     E' pubblica apposta — chi non l'ha sbloccata deve poter sapere che cosa si
     perde. Una porta chiusa senza targhetta non si bussa. */
  const dettaglioRegione = c =>
    chiedi("regioni?chiave=eq." + c + "&select=chiave,nome,riga,spiagge,libera,prezzo,paese,paesi(nome)")
      .then(r => r[0] || null);

  const catalogo = () => chiedi("regioni?select=chiave,nome,paese,riga,spiagge,libera,prezzo&order=ordine");

  /* ------------------------------------------------------------- preferiti
     Due elenchi separati, spiagge e zone, come sono separati nel database:
     una zona salvata e' un tratto di costa intero, non la somma delle sue
     spiagge. */
  /* Le spiagge salvate arrivano con dentro la loro scheda, chiesta in una volta
     sola invece che una per una. Attenzione a un caso che sembra un errore e non
     lo e': se la regione non e' piu' tua, la scheda torna VUOTA mentre il
     preferito resta. E' giusto — il ricordo e' tuo, il contenuto no — e la
     pagina lo dice invece di far sparire la riga senza spiegazioni. */
  const preferitiSpiagge = () => chiedi(
    "preferiti_spiagge?select=sid,aggiunto,nota,spiagge(n,com,regione,zona,lat,lon,acc,lung,fondo)" +
    "&order=aggiunto.desc");
  /* Il nome della regione NON si chiede qui. preferiti_zone punta a "zone"
     (regione + chiave), non a "regioni": una chiave esterna che non esiste non
     si puo' seguire, e PostgREST rispondeva 400 all'intera richiesta — cioe'
     la pagina dei preferiti non mostrava piu' niente, nemmeno le spiagge, per
     un nome che la pagina aveva gia' in mano: il catalogo delle regioni lo
     carica per conto suo. */
  const preferitiZone = () => chiedi(
    "preferiti_zone?select=regione,zona,aggiunto,nota,zone(etichetta)" +
    "&order=aggiunto.desc");

  /* Solo gli identificativi: serve ad accendere le stelline sulla pagina di una
     regione senza scaricare tutte le schede salvate. */
  const stelleAccese = async () => {
    if (!chiSono()) return { spiagge: new Set(), zone: new Set() };
    try {
      const [sp, zo] = await Promise.all([
        chiedi("preferiti_spiagge?select=sid"),
        chiedi("preferiti_zone?select=regione,zona")
      ]);
      return { spiagge: new Set(sp.map(x => x.sid)),
               zone: new Set(zo.map(x => x.regione + "/" + x.zona)) };
    } catch (_) { return { spiagge: new Set(), zone: new Set() }; }
  };

  const salvaSpiaggia = sid => chiedi("preferiti_spiagge", {
    metodo: "POST", corpo: { utente: chiSono().id, sid },
    intestazioni: { "Prefer": "resolution=merge-duplicates,return=minimal" } });
  const togliSpiaggia = sid => chiedi("preferiti_spiagge?sid=eq." + encodeURIComponent(sid),
    { metodo: "DELETE", intestazioni: { "Prefer": "return=minimal" } });

  const salvaZona = (regione, zona) => chiedi("preferiti_zone", {
    metodo: "POST", corpo: { utente: chiSono().id, regione, zona },
    intestazioni: { "Prefer": "resolution=merge-duplicates,return=minimal" } });
  const togliZona = (regione, zona) => chiedi(
    "preferiti_zone?regione=eq." + encodeURIComponent(regione) + "&zona=eq." + encodeURIComponent(zona),
    { metodo: "DELETE", intestazioni: { "Prefer": "return=minimal" } });

  /* Che cosa ho sbloccato. Non serve a decidere niente — decide il database —
     ma a dirlo a chi guarda. */
  const mieiAccessi = () => chiedi("accessi?select=regione,pacchetto,scade_il,origine");

  /* L'indirizzo della pagina pubblica di una spiaggia. La regola sta scritta
     qui una volta sola perche' la usano in due: questo file, per il pulsante
     «manda a chi viene con te», e il generatore che quelle pagine le scrive.
     Se le due regole divergessero, meta' dei collegamenti porterebbe a un 404
     — quindi non e' una comodita', e' un vincolo. */
  const rullo = t => String(t || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   /* via gli accenti */
    .toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  const paginaSpiaggia = b => "spiaggia/" + (rullo(b && b.n) || "spiaggia") + "-" + b.sid + ".html";

  /* ------------------------------------------------------------ vicinanza
     La posizione non viene salvata da nessuna parte: entra in una domanda ed
     esce con una risposta. Il database non la scrive, e qui non resta.

     "vicine" risponde solo con le spiagge delle regioni che chi chiede ha
     sbloccato — non perche' lo controlli questa funzione, ma perche' e' la
     regola scritta sulla tabella. "quante_vicine" invece conta ANCHE quelle
     chiuse: il numero si', quali no. */
  const vicine = (lat, lon, raggio, quante) => chiedi("rpc/vicine", {
    metodo: "POST", corpo: { la: lat, lo: lon, raggio: raggio || 30, quante: quante || 40 } });

  const quanteVicine = (lat, lon, raggio) => chiedi("rpc/quante_vicine", {
    metodo: "POST", corpo: { la: lat, lo: lon, raggio: raggio || 30 } });

  /* Il catalogo dei nomi e' pubblico: cercare una spiaggia deve funzionare
     anche per chi non ha comprato niente — se no non sa nemmeno che c'e'. */
  /* Tutti i nomi di una regione: pubblici, e servono a far scegliere l'assaggio
     a chi quella regione non ce l'ha — non si puo' scegliere fra cose che non
     si vedono. */
  const nomiRegione = reg => chiedi(
    "nomi_spiagge?regione=eq." + encodeURIComponent(reg) + "&select=sid,n,com&order=n");

  const cercaNomi = (testo, quante) => {
    const p = "*" + String(testo).replace(/[*(),]/g, "") + "*";
    return chiedi("nomi_spiagge?or=(n.ilike." + encodeURIComponent(p) +
                  ",com.ilike." + encodeURIComponent(p) + ")" +
                  "&select=sid,n,com,regione,regione_nome,paese,libera&order=n&limit=" + (quante || 30));
  };

  /* -------------------------------------------------------------- assaggi
     Una spiaggia per paese, gratis, scelta da chi guarda. Non e' una vetrina
     decisa da noi: e' la prima che quella persona decide di aprire in quel
     paese, e da quel momento resta sua.

     La regola sta nella chiave primaria della tabella — (persona, paese) —
     non qui: il database non PUO' accettarne una seconda, quindi non serve
     un controllo in questa pagina, e non c'e' un controllo in questa pagina
     che possa sbagliarsi. */
  const mieiAssaggi = () => chiSono()
    ? chiedi("miei_assaggi?select=paese,paese_nome,sid,spiaggia,regione,regione_nome,preso")
    : Promise.resolve([]);

  /* La risposta dice che cosa e' successo davvero, e sono quattro cose
     diverse: presa adesso, ne avevi gia' un'altra in questo paese, questa
     regione ce l'hai gia' (e allora l'assaggio non si spreca), non sei
     entrato. Confonderle vuol dire lasciare qualcuno davanti a una pagina
     che non cambia senza sapere perche'. */
  const assaggia = async sid => {
    const r = await chiedi("rpc/assaggia", { metodo: "POST", corpo: { p_sid: sid } });
    return (r && r[0]) || { esito: "errore" };
  };

  /* ------------------------------------------------------------- recensioni
     Le recensioni si leggono da DUE posti diversi, e non e' una ripetizione:

       - recensioni_pubbliche e' quello che vede il mondo. Niente identificativo
         di chi ha scritto: solo il parere e una firma gia' composta («Prova R.»
         oppure «Anonimo»). La legge chiunque, anche chi non e' entrato e anche
         su regioni che non ha sbloccato — il muro sta sulla scheda della
         spiaggia, non sul parere di chi c'e' stato;

       - la tabella "recensioni" nuda la si legge solo per la PROPRIA riga: e'
         quella che serve al modulo, per ritrovare il voto che si era gia' dato
         invece di farlo riscrivere da capo. */
  const recensioniSpiaggia = sid => chiedi(
    "recensioni_pubbliche?sid=eq." + encodeURIComponent(sid) +
    "&select=voto,commento,firma,creata&order=creata.desc");

  /* Le ultime di una regione: serve alla fascia di chi la regione non ce l'ha,
     per far vedere che dietro c'e' gente vera. */
  const recensioniRegione = (regione, quante) => chiedi(
    "recensioni_pubbliche?regione=eq." + encodeURIComponent(regione) +
    "&select=sid,spiaggia,voto,commento,firma,creata&order=creata.desc&limit=" + (quante || 4));

  /* Le medie di un gruppo di spiagge in una richiesta sola, non una per
     spiaggia: l'elenco di una regione ne ha centinaia. */
  const votiSpiagge = async sids => {
    if (!sids || !sids.length) return {};
    const fuori = {};
    /* la lista dentro in.() ha un limite di lunghezza pratico: si va a blocchi */
    for (let i = 0; i < sids.length; i += 300) {
      const pezzo = sids.slice(i, i + 300).map(s => '"' + String(s).replace(/"/g, '') + '"').join(",");
      const r = await chiedi("voti_spiagge?sid=in.(" + encodeURIComponent(pezzo) + ")&select=sid,media,quanti");
      r.forEach(x => fuori[x.sid] = x);
    }
    return fuori;
  };

  const miaRecensione = async sid => {
    if (!chiSono()) return null;
    const r = await chiedi("recensioni?sid=eq." + encodeURIComponent(sid) +
                           "&select=sid,voto,commento,mostra_nome,creata");
    return r[0] || null;
  };

  const mieRecensioni = () => chiedi(
    "recensioni?select=sid,voto,commento,mostra_nome,creata&order=creata.desc");

  /* Salvare e correggere sono la stessa cosa: la chiave e' (persona, spiaggia),
     quindi la seconda volta si sovrascrive invece di aggiungere una riga. */
  const salvaRecensione = (sid, voto, commento, mostraNome) => chiedi("recensioni", {
    metodo: "POST",
    corpo: { utente: chiSono().id, sid: sid, voto: voto,
             commento: (commento || "").trim() || null, mostra_nome: !!mostraNome },
    intestazioni: { "Prefer": "resolution=merge-duplicates,return=minimal" } });

  /* Senza utente si cancella la propria — le regole del database non ne
     lascerebbero toccare altre. Con l'utente e' l'amministratore che modera:
     la stessa richiesta, che a chiunque altro non toglierebbe niente. */
  const togliRecensione = (sid, utente) => chiedi(
    "recensioni?sid=eq." + encodeURIComponent(sid) +
    (utente ? "&utente=eq." + encodeURIComponent(utente) : "&utente=eq." + chiSono().id),
    { metodo: "DELETE", intestazioni: { "Prefer": "return=minimal" } });

  /* Le recensioni di UNA spiaggia con dentro chi le ha scritte: serve solo a
     chi modera, e a chi non modera la vista risponde vuoto. */
  const recensioniModerabili = sid => chiedi(
    "recensioni_admin?sid=eq." + encodeURIComponent(sid) +
    "&select=sid,utente,voto,creata&order=creata.desc");

  const daModerare = (quante) => chiedi(
    "recensioni_admin?select=sid,spiaggia,regione,utente,email,voto,commento,mostra_nome,creata" +
    "&order=creata.desc&limit=" + (quante || 50));

  /* ---------------------------------------------------------------- profilo
     Nome e cognome sono facoltativi e servono a una cosa sola: firmare una
     recensione. Chi non li mette resta «Anonimo», e il sito funziona uguale. */
  const ilMioProfilo = async () => {
    if (!chiSono()) return null;
    const r = await chiedi("profili?utente=eq." + chiSono().id + "&select=nome,cognome,email");
    return r[0] || null;
  };
  const salvaProfilo = (nome, cognome) => chiedi(
    "profili?utente=eq." + chiSono().id,
    { metodo: "PATCH",
      corpo: { nome: (nome || "").trim() || null, cognome: (cognome || "").trim() || null },
      intestazioni: { "Prefer": "return=minimal" } });

  return { regione, catalogo, dettaglioRegione, chiedi, BASE,
           iscriviti, accedi, esci, scordata, alCambio, chiSono,
           nuovaPassword, daPosta, sonoAdmin,
           preferitiSpiagge, preferitiZone, stelleAccese, salvaSpiaggia, togliSpiaggia,
           salvaZona, togliZona, mieiAccessi, vicine, quanteVicine, cercaNomi, nomiRegione, paginaSpiaggia, rullo, mieiAssaggi, assaggia,
           recensioniSpiaggia, recensioniRegione, votiSpiagge, miaRecensione, mieRecensioni,
           salvaRecensione, togliRecensione, daModerare, recensioniModerabili,
           ilMioProfilo, salvaProfilo };
})();
