/* =========================================================================
   Le foto d'archivio da scegliere.

   Una riga per spiaggia: da dove si prende l'immagine, chi l'ha scattata, e il
   collegamento alla pagina originale. Il file non fa niente da solo — lo legge
   la griglia dei provini nella pagina di gestione.

   QUESTA LISTA E' FISSA. Non si aggiorna da sola, non c'e' nessun flusso che
   la riempie: quando servono altre foto, la lista si allunga a mano. E' una
   scelta, non un limite: ogni riga qui dentro e' passata per un controllo che
   nessun automatismo saprebbe fare.

   ---------------------------------------------------------------------------
   DUE REGOLE, e valgono per ogni riga che verra' aggiunta in futuro.

   1. I DIRITTI. Solo immagini con licenza che permette l'uso COMMERCIALE.
      Qui e' tutto Pexels: uso commerciale libero, attribuzione non
      obbligatoria, nessun obbligo di propagare la licenza a chi riusa la
      pagina. Wikimedia Commons e' escluso apposta: quasi tutto li' e' CC BY-SA,
      che obbliga alla citazione E alla propagazione della licenza — su un sito
      che vende accessi e' una complicazione vera.

   2. LA CERTEZZA. Il nome della spiaggia deve comparire nel TITOLO della foto
      o nel suo indirizzo. Non basta che sia nella descrizione, nei tag o nella
      geolocalizzazione: quelle sono tre cose che il fotografo scrive dopo, a
      memoria, e sbagliano spesso. Il campo «prova» qui sotto dice dove sta il
      nome, riga per riga, cosi' la verifica si puo' rifare.

      Le foto che passavano solo per descrizione o geotag sono state tolte —
      Spiaggia dei Conigli, Elafonisi, Porto Katsiki, Simos: nessuna era
      sbagliata per quel che ne so, ma «non so se e' sbagliata» non e' un
      criterio per pubblicare su una guida di spiagge.
   ========================================================================= */
(function () {
  const pexels = id =>
    "https://images.pexels.com/photos/" + id + "/pexels-photo-" + id +
    ".jpeg?auto=compress&cs=tinysrgb&w=1600";

  const righe = [
    /* sid,                  spiaggia,                    id Pexels,  autore,                   prova */
    /* --- Italia ---------------------------------------------------------- */
    ["sardegna-060",      "Cala Goloritzé",              "39429084", "Adrian Mateciuc",        "indirizzo"],
    ["sardegna-135",      "La Pelosa",                   "37805939", "Edoardo Colombo",        "titolo"],
    ["sardegna-038",      "Cala Brandinchi",             "29773796", "Davide Robetti",         "titolo"],
    ["sicilia-060",       "Scala dei Turchi",            "38906922", "Federico Galassi",       "titolo"],
    ["sicilia-088",       "Mondello",                    "29532339", "Manfredi Taglialavoro",  "titolo"],
    ["sicilia-016",       "Isola Bella (Taormina)",      "37105275", "Alejandro De Roa",       "titolo"],
    ["sicilia-093",       "Cefalù",                      "36802143", "Antoaneta Mehandova",    "titolo"],
    ["campania-027",      "Positano · Spiaggia Grande",  "22703234", "Mihaela Claudia Puscas", "titolo"],
    ["campania-031",      "Fiordo di Furore",            "26976142", "Josh Withers",           "titolo"],
    ["puglia-057",        "Lama Monachile (Polignano)",  "25524426", "Serban Mihaila",         "indirizzo"],
    ["calabria-026",      "Tropea · la Rotonda",         "34150665", "Soicm",                  "titolo"],
    ["liguria-033",       "Vernazza",                    "37148727", "Azox",                   "titolo"],
    ["liguria-032",       "Monterosso · Fegina",         "33962750", "Stephan Leuzinger",      "titolo"],
    /* --- Francia --------------------------------------------------------- */
    ["provenza-012",      "Calanque d’En-Vau",           "38058211", "Bingqian Li",            "titolo"],
    /* --- Spagna ---------------------------------------------------------- */
    ["baleari-045",       "Cala Macarella",              "37835916", "Bianca Ngt",             "titolo"],
    ["baleari-060",       "Cala Comte",                  "34396811", "Dirk Pothen",            "titolo"],
    ["canarie-041",       "Playa de Papagayo",           "38696117", "Jessica Sacco",          "titolo"],
    ["andalusia-106",     "Duna de Bolonia",             "20633958", "Atlantic Ambience",      "titolo"],
    /* --- Portogallo ------------------------------------------------------ */
    ["algarve-046",       "Praia da Marinha",            "20282904", "Carolina Matos",         "titolo"],
    ["algarve-045",       "Benagil",                     "39417132", "Igor Passchier",         "titolo"],
    ["algarve-027",       "Praia do Camilo",             "34208760", "Farnaz Kohankhaki",      "titolo"],
    ["algarve-043",       "Carvoeiro",                   "37549281", "Laura Arnedo",           "titolo"],
    ["centro-063",        "Nazaré",                      "36365744", "karim desouki",          "titolo"],
    /* --- Grecia ---------------------------------------------------------- */
    ["ionie-108",         "Myrtos (Cefalonia)",          "7962518",  "Ejona Muka",             "indirizzo"],
    ["peloponneso-163",   "Voidokilia",                  "9528997",  "Yiannis Konstantinou",   "indirizzo"],
    /* --- Malta ----------------------------------------------------------- */
    ["gozo-019",          "Blue Lagoon (Comino)",        "26167765", "Ricardo Oliveira",       "indirizzo"],
    ["gozo-006",          "Ramla Bay",                   "36523009", "Simone Dinoia",          "titolo"],
    ["malta-010",         "Golden Bay",                  "18780167", "Efrem Efre",             "indirizzo"],
    /* --- Croazia --------------------------------------------------------- */
    ["dalmaziacentro-142","Zlatni Rat",                  "27651498", "Vladimir Srajber",       "titolo"],
    /* --- Montenegro ------------------------------------------------------ */
    ["budua-012",         "Sveti Stefan",                "13850643", "Hatice Baran",           "titolo"],
    /* --- Albania --------------------------------------------------------- */
    ["alvalona-022",      "Ksamil",                      "34092443", "Laura Meinhardt",        "indirizzo"],

    /* ===================================================================
       Secondo lotto — 20 settembre 2026. Stessa regola di sempre: il nome
       nel titolo della foto o nel suo indirizzo, mai solo nei tag.

       Dove la foto ritrae il posto giusto ma non l'arenile — il paese, la
       tonnara, la grotta — c'e' una nota, e in gestione si legge sotto la
       miniatura. Non sono errori: sono decisioni che tocca a te prendere
       guardando, e per questo sono scritte invece che nascoste.
       =================================================================== */
    /* --- Italia ---------------------------------------------------------- */
    ["sardegna-057",      "Cala Luna",                   "19546814", "Nataly Yeromenko",       "titolo"],
    ["sardegna-077",      "Porto Giunco",                "8633923",  "Manzoni Studios",        "titolo"],
    ["sicilia-079",       "Cala Capreria · Zingaro",     "38007750", "Federico Galassi",       "titolo",
                          "veduta della riserva, non della singola cala"],
    ["sicilia-039",       "Vendicari · la Tonnara",      "13154893", "Francesco Ungaro",       "titolo",
                          "la tonnara, non l’arenile"],
    ["campania-033",      "Atrani",                      "38046314", "Ahmet Yüksek",           "titolo"],
    ["toscana-021",       "Golfo di Baratti",            "34566968", "MR Ledger",              "titolo"],
    ["liguria-034",       "Riomaggiore",                 "34969626", "Çağla Sara",             "titolo",
                          "il paese visto dall’alto, non l’arenile"],
    ["liguria-024",       "San Fruttuoso",               "36749057", "Kateryna Tartachna",     "titolo"],
    /* --- Francia --------------------------------------------------------- */
    ["corsica-048",       "Santa Giulia",                "37306205", "SlimMars 13",            "titolo"],
    ["corsica-006",       "Saleccia",                    "38638308", "SlimMars 13",            "titolo"],
    ["occitania-033",     "Plage de Collioure",          "32644345", "Ekaterina Nekhai",       "titolo"],
    /* --- Spagna ---------------------------------------------------------- */
    ["canarie-029",       "Playa de Maspalomas",         "32464945", "Karina Badura",          "titolo"],
    ["canarie-006",       "Playa de Las Teresitas",      "31466226", "Danyil",                 "titolo"],
    ["canarie-040",       "Playa de Famara",             "37000081", "Mihai Vlasceanu",        "titolo"],
    ["andalusia-028",     "San Miguel · Cabo de Gata",   "39466686", "Vasti Vanhee",           "titolo",
                          "veduta del parco, non della singola spiaggia"],
    ["catalogna-005",     "Platja Gran de Cadaqués",     "20843247", "Lorena Villarreal",      "titolo"],
    ["catalogna-041",     "Platja Gran de Tossa",        "38468025", "Olivia",                 "titolo"],
    /* --- Portogallo ------------------------------------------------------ */
    ["algarve-009",       "Odeceixe · Mar",              "20117919", "Rodrigo Curi",           "titolo"],
    ["algarve-078",       "Falésia · Açoteias",          "34793650", "Ivan Dražić",            "titolo",
                          "uno dei due tratti di Falésia: l’altro è Alfamar"],
    ["lisboa-034",        "Guincho Norte",               "14622448", "joao Guerreiro",         "titolo",
                          "uno dei due tratti del Guincho: l’altro è Sul"],
    /* --- Malta ----------------------------------------------------------- */
    ["malta-056",         "Wied iż-Żurrieq · Grotta Azzurra", "19725918", "Ivan Dražić",       "titolo",
                          "la grotta, che è poi quello che si va a vedere"],
    /* --- Montenegro ------------------------------------------------------ */
    ["budua-002",         "Jaz",                         "8430924",  "Mikhail Nilov",          "titolo"]
  ];

  window.ARCHIVIO_FOTO = righe.map(([sid, nome, id, autore, prova, nota]) => ({
    sid: sid, nome: nome, id: id, autore: autore, prova: prova, nota: nota || "",
    url: pexels(id),
    pagina: "https://www.pexels.com/photo/" + id + "/",
    fonte: "Pexels",
    licenza: "Licenza Pexels — uso commerciale libero, attribuzione non obbligatoria"
  }));
})();
