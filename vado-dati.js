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
  const avvisa = () => ascoltatori.forEach(f => { try { f(sessione); } catch (e) { console.warn(e); } });

  sessione = leggiCassetto();
  const alCambio = f => { ascoltatori.push(f); f(sessione); };
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
      utente:   d.user ? { id: d.user.id, email: d.user.email } : (sessione && sessione.utente) || null
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

  /* Rinnova il gettone se sta per scadere. Se il rinnovo fallisce la sessione
     e' finita davvero — meglio accorgersene qui e chiedere di rientrare, che
     lasciare la pagina a chiedere dati con un gettone morto. */
  async function gettoneVivo() {
    if (!sessione) return null;
    if (Date.now() < sessione.scade) return sessione.gettone;
    try { return apriSessione(await auth("token?grant_type=refresh_token",
                                        { refresh_token: sessione.rinnovo })).gettone; }
    catch (_) { apriSessione(null); return null; }
  }

  /* Dove si atterra dopo aver confermato l'indirizzo o chiesto una nuova
     password. Lo diciamo noi a ogni richiesta invece di affidarci al "Site URL"
     del pannello: quello e' un'impostazione lontana, che si dimentica e che non
     si vede fallire — ci si accorge dell'errore solo quando un iscritto
     atterra su una pagina che non esiste. location.pathname senza l'ultimo
     pezzo e' la cartella del sito, qualunque sia. */
  const RITORNO = location.origin + location.pathname.replace(/[^/]*$/, "");

  const iscriviti = (email, password) =>
    auth("signup?redirect_to=" + encodeURIComponent(RITORNO), { email, password }).then(d => {
    /* Se la conferma per email e' attiva, qui NON arriva nessun gettone: e'
       normale, e va detto a chi si e' iscritto invece di lasciarlo davanti a
       una schermata che non cambia. */
    if (d && d.access_token) apriSessione(d);
    return { entrato: !!(d && d.access_token), email: d && d.user && d.user.email };
  });

  const accedi = (email, password) =>
    auth("token?grant_type=password", { email, password }).then(apriSessione);

  const scordata = email =>
    auth("recover?redirect_to=" + encodeURIComponent(RITORNO),
         { email, gotrue_meta_security: {} }).then(() => true);

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
    const g = await gettoneVivo();
    const o = opzioni || {};
    const r = await fetch(BASE + "/rest/v1/" + percorso, {
      method: o.metodo || "GET",
      headers: Object.assign({
        "apikey": CHIAVE,
        "Authorization": "Bearer " + (g || CHIAVE),
        "Accept": "application/json"
      }, o.corpo ? { "Content-Type": "application/json" } : {},
         o.intestazioni || {}),
      body: o.corpo ? JSON.stringify(o.corpo) : undefined
    });
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
    chiedi("regioni?chiave=eq." + c + "&select=chiave,nome,riga,spiagge,libera,prezzo")
      .then(r => r[0] || null);

  const catalogo = () => chiedi("regioni?select=chiave,nome,paese,riga,spiagge,libera,prezzo&order=ordine");

  /* ------------------------------------------------------------- preferiti
     Due elenchi separati, spiagge e zone, come sono separati nel database:
     una zona salvata e' un tratto di costa intero, non la somma delle sue
     spiagge. */
  const preferitiSpiagge = () => chiedi("preferiti_spiagge?select=sid,aggiunto,nota&order=aggiunto.desc");
  const preferitiZone    = () => chiedi("preferiti_zone?select=regione,zona,aggiunto,nota&order=aggiunto.desc");

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

  return { regione, catalogo, dettaglioRegione, chiedi, BASE,
           iscriviti, accedi, esci, scordata, alCambio, chiSono,
           nuovaPassword, daPosta, sonoAdmin,
           preferitiSpiagge, preferitiZone, salvaSpiaggia, togliSpiaggia,
           salvaZona, togliZona, mieiAccessi };
})();
