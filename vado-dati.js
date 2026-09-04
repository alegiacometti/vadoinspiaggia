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

  /* Se un giorno ci sara' una sessione aperta, il suo gettone si mettera' qui
     e partira' con ogni richiesta: il database riconoscera' la persona e le
     fara' vedere anche le regioni che ha sbloccato. Finche' e' vuoto, si parla
     da visitatori. */
  let gettone = null;
  const entra = g => { gettone = g || null; };

  const intestazioni = () => ({
    "apikey": CHIAVE,
    "Authorization": "Bearer " + (gettone || CHIAVE),
    "Accept": "application/json"
  });

  async function chiedi(percorso) {
    const r = await fetch(BASE + "/rest/v1/" + percorso, { headers: intestazioni() });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
    return r.json();
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
  const catalogo = () => chiedi("regioni?select=chiave,nome,paese,riga,spiagge,libera,prezzo&order=ordine");

  return { entra, regione, catalogo, chiedi, BASE };
})();
