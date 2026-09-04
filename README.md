# Vado in spiaggia

Cinquemilacinquecento spiagge del Mediterraneo e dell'Atlantico europeo, una
pagina per regione, nessun framework: solo HTML, CSS e JavaScript.

**Il sito è pubblicato su GitHub Pages.**

## Che cosa c'è dentro

| | |
|---|---:|
| Paesi | 10 |
| Regioni | 59 |
| Spiagge | 5534 |

Italia, Francia, Spagna, Portogallo, Slovenia, Croazia, Malta,
Bosnia-Erzegovina, Albania, Montenegro, Grecia.

## Come è fatto

- `index.html` — la carta d'insieme: prima si sceglie il paese, poi la regione.
- `spiagge-<regione>.html` — una pagina per regione, autosufficiente: contiene
  la propria carta, le proprie schede e il proprio codice.
- `carte-spiagge.css` — il foglio di stile comune a tutte.
- `configurazione.js` — le poche impostazioni condivise.

Non c'è nessuna dipendenza da installare e nessun passaggio di compilazione:
si aprono i file e funzionano. I caratteri arrivano da Google Fonts, le
bandiere da Wikimedia Commons, il meteo-marino da Open-Meteo, le tessere
satellitari da Esri, le mappe e le recensioni da Google Maps.

## Da dove vengono i dati

Le posizioni delle spiagge vengono, per la maggior parte, dal censimento
europeo delle acque di balneazione dell'**Agenzia europea dell'ambiente**;
dove quello non arriva — Malta, Albania fuori monitoraggio, Montenegro,
Bosnia — da gazetteer geografici pubblici, e ogni scheda dichiara la propria
fonte. Le sagome delle regioni vengono da **geoBoundaries**, le linee di costa
da **GSHHG**, le previsioni da **Open-Meteo** (modello ICON-EU del servizio
meteorologico tedesco).

Il metodo, paese per paese, è documentato a parte.

## Avvertenza

Le informazioni sono fornite a titolo indicativo e possono essere incomplete o
non aggiornate. Il mare è un ambiente potenzialmente pericoloso: verifica
sempre le condizioni sul posto.

---

© 2026. Tutti i diritti riservati.
