/* ===========================================================================
   Vado in spiaggia — da che parte guarda la spiaggia, e cosa vuol dire il
   vento di oggi.

   Il sito scriveva «vento 15 km/h da NE» e lasciava il lavoro a chi legge. Ma
   quel numero, da solo, non dice la cosa che si vuole sapere davvero:

     vento DA TERRA  → mare piatto, acqua limpida, l'ombrellone sta su
     vento DA MARE   → onda sotto costa, sabbia in faccia, meduse a riva

   E' la stessa direzione: cambia solo da che parte guarda la spiaggia. Quella
   non e' nel database — e non serve che ci sia, perche' la linea di costa e'
   gia' dentro ogni pagina regionale: e' quella che disegna la terra.

   Come si ricava:
     1. la spiaggia si porta nelle coordinate della carta (la proiezione sta
        in testa a ogni pagina);
     2. si cerca il pezzo di costa piu' vicino;
     3. la perpendicolare a quel pezzo ha due versi: quello buono e' quello
        che, uscendo dalla spiaggia, finisce FUORI dalla terra;
     4. si torna in gradi bussola, ricordando che la proiezione stira le
        longitudini diversamente dalle latitudini.

   Dove la costa disegnata e' troppo lontana o troppo semplificata — isolotti,
   scogliere minute — non si inventa niente: si risponde «non lo so» e la
   scheda non scrive nulla sul vento. Meglio tacere che indovinare.
   =========================================================================== */
window.VADOVENTO = (function () {
  let ANELLI = null, PRJ = null, sorgente = null;
  const memoria = new Map();

  /* Il contorno si smonta la PRIMA volta che serve, non all'apertura della
     pagina: certe regioni hanno trecentomila caratteri di costa, e nessuno
     deve aspettarli per vedere la carta. */
  function costa(testo, prj) { sorgente = testo; PRJ = prj; ANELLI = null; memoria.clear(); }

  function smonta() {
    if (ANELLI || !sorgente) return ANELLI;
    ANELLI = [];
    const pezzi = String(sorgente).split("M");
    for (let k = 0; k < pezzi.length; k++) {
      const nums = pezzi[k].match(/-?\d+\.?\d*/g);
      if (!nums || nums.length < 6) continue;
      const an = [];
      for (let i = 0; i + 1 < nums.length; i += 2) an.push([+nums[i], +nums[i + 1]]);
      if (an.length >= 3) ANELLI.push(an);
    }
    sorgente = null;
    return ANELLI;
  }

  /* Regola pari-dispari: si tira una semiretta verso destra e si contano gli
     incroci. Dispari = dentro. */
  function dentro(x, y) {
    let d = false;
    for (const an of ANELLI) {
      const n = an.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const y1 = an[i][1], y2 = an[j][1];
        if ((y1 > y) !== (y2 > y)) {
          const x1 = an[i][0], x2 = an[j][0];
          if (x < x1 + (y - y1) * (x2 - x1) / (y2 - y1)) d = !d;
        }
      }
    }
    return d;
  }

  /* L'esposizione in gradi bussola: 0 = guarda a nord, 90 = a est. */
  function esposizione(lat, lon) {
    const chiave = lat + "," + lon;
    if (memoria.has(chiave)) return memoria.get(chiave);
    let g = null;
    try { g = calcola(lat, lon); } catch (_) { g = null; }
    memoria.set(chiave, g);
    return g;
  }

  function calcola(lat, lon) {
    if (!PRJ) return null;
    smonta();
    if (!ANELLI || !ANELLI.length) return null;
    const x = (lon - PRJ.LON0) * PRJ.KX, y = (PRJ.LAT0 - lat) * PRJ.KY;
    let d2m = Infinity, cx = 0, cy = 0, tx = 0, ty = 0;
    for (const an of ANELLI) {
      const n = an.length;
      for (let i = 0; i < n; i++) {
        const a = an[i], b = an[(i + 1) % n];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const L2 = dx * dx + dy * dy;
        if (!L2) continue;
        let t = ((x - a[0]) * dx + (y - a[1]) * dy) / L2;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const px = a[0] + t * dx, py = a[1] + t * dy;
        const d2 = (x - px) * (x - px) + (y - py) * (y - py);
        if (d2 < d2m) { d2m = d2; cx = px; cy = py; tx = dx; ty = dy; }
      }
    }
    /* oltre un chilometro e mezzo dalla costa disegnata il contorno e' troppo
       semplificato perche' la perpendicolare voglia dire qualcosa */
    const limite = 1.5 * PRJ.KY / 111;
    if (!isFinite(d2m) || Math.sqrt(d2m) > limite) return null;
    const L = Math.hypot(tx, ty);
    if (!L) return null;
    const passo = Math.max(0.35 * PRJ.KY / 111, 0.5);
    let nx = null, ny = null;
    for (const [ux, uy] of [[-ty / L, tx / L], [ty / L, -tx / L]]) {
      if (!dentro(cx + ux * passo, cy + uy * passo)) { nx = ux; ny = uy; break; }
    }
    if (nx === null) return null;
    const est = (nx / PRJ.KX) * Math.cos(lat * Math.PI / 180);
    const nord = -ny / PRJ.KY;
    return Math.round(((Math.atan2(est, nord) * 180 / Math.PI) % 360 + 360) % 360);
  }

  /* --------------------------------------------------------- il giudizio
     La direzione del vento che danno i modelli e' quella da cui SOFFIA. Se
     coincide con la direzione in cui guarda la spiaggia, il vento arriva dal
     mare; se le e' opposta, arriva da terra. */
  function giudizio(esp, dirVento, kmh) {
    if (esp == null || dirVento == null) return null;
    if (kmh != null && kmh < 6)
      return { classe: "ferma", titolo: "Aria ferma",
               dice: "Vento quasi assente: la direzione non cambia niente." };
    /* La differenza fra «da dove soffia» e «dove guarda la spiaggia»:
       vicino a zero il vento arriva dal mare, vicino a 180 da terra. */
    const diff = Math.abs(((dirVento - esp) % 360 + 540) % 360 - 180);
    if (diff <= 60)
      return { classe: "mare", titolo: "Vento dal mare",
               dice: "Spinge l’onda a riva: mare mosso sotto costa, sabbia che vola e ombrelloni da piantare bene." };
    if (diff >= 120)
      return { classe: "terra", titolo: "Vento da terra",
               dice: "Appiattisce il mare: acqua calma e limpida sotto costa, anche quando al largo l’onda è alta." };
    return { classe: "lato", titolo: "Vento di lato",
             dice: "Soffia lungo la costa: onda corta e corrente parallela a riva. Attenzione ai materassini." };
  }

  const ROSA = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const bussola = g => g == null ? "—" : ROSA[Math.round((g % 360) / 22.5) % 16];

  return { costa, esposizione, giudizio, bussola };
})();
