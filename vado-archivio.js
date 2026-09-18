/* =========================================================================
   Le foto d'archivio da portare dentro.

   Una riga per spiaggia: da dove si prende l'immagine, chi l'ha scattata, e il
   collegamento alla pagina originale. Il file non fa niente da solo — lo legge
   l'importatore nella pagina di gestione, che scarica, rimpicciolisce e mette
   in attesa di approvazione.

   Perche' Pexels e non Wikimedia Commons: su Commons quasi tutto e' CC BY-SA,
   che obbliga a citare l'autore su ogni foto E a propagare la stessa licenza a
   chi la riusa — su un sito che vende accessi e' una complicazione vera. La
   licenza Pexels invece permette l'uso commerciale senza attribuzione
   obbligatoria. L'autore lo scriviamo lo stesso, perche' e' giusto e costa
   nulla, ma lo scriviamo per scelta, non per obbligo.

   «sicuro: false» vuol dire: il nome della spiaggia non compare nel titolo
   della foto, compare solo nella descrizione o nella geolocalizzazione. Non e'
   una foto sbagliata, e' una foto NON VERIFICATA — la guardi tu prima di
   approvarla. Le altre le ho scartate: meglio una scheda senza foto che una
   scheda con la spiaggia di qualcun altro.
   ========================================================================= */
(function () {
  const pexels = id =>
    "https://images.pexels.com/photos/" + id + "/pexels-photo-" + id +
    ".jpeg?auto=compress&cs=tinysrgb&w=1600";

  const righe = [
    /* sid,                  spiaggia,                    id Pexels,  autore,                   sicuro */
    ["sardegna-060",      "Cala Goloritzé",              "39429084", "Adrian Mateciuc",        true ],
    ["sardegna-135",      "La Pelosa",                   "37805939", "Edoardo Colombo",        true ],
    ["sicilia-060",       "Scala dei Turchi",            "38906922", "Federico Galassi",       true ],
    ["sicilia-088",       "Mondello",                    "29532339", "Manfredi Taglialavoro",  true ],
    ["sicilia-016",       "Isola Bella (Taormina)",      "37105275", "Alejandro De Roa",       true ],
    ["sicilia-136",       "Spiaggia dei Conigli",        "3754810",  "Daniele Putti",          false],
    ["campania-027",      "Positano · Spiaggia Grande",  "22703234", "Mihaela Claudia Puscas", true ],
    ["calabria-026",      "Tropea · la Rotonda",         "34150665", "Soicm",                  true ],
    ["liguria-033",       "Vernazza",                    "37148727", "Azox",                   true ],
    ["liguria-032",       "Monterosso · Fegina",         "33962750", "Stephan Leuzinger",      true ],
    ["provenza-012",      "Calanque d’En-Vau",           "38058211", "Bingqian Li",            true ],
    ["dalmaziacentro-142","Zlatni Rat",                  "27651498", "Vladimir Srajber",       true ],
    ["budua-012",         "Sveti Stefan",                "13850643", "Hatice Baran",           false],
    ["alvalona-022",      "Ksamil",                      "34092443", "Laura Meinhardt",        true ],
    ["creta-033",         "Elafonisi",                   "25649184", "Przemysław Lunic",       true ],
    ["ionie-108",         "Myrtos (Cefalonia)",          "7962518",  "Ejona Muka",             true ],
    ["ionie-095",         "Porto Katsiki",               "33753936", "Hajni",                  true ],
    ["peloponneso-163",   "Voidokilia",                  "9528997",  "Yiannis Konstantinou",   true ],
    ["peloponneso-133",   "Simos (Elafonisos)",          "6456629",  "Dimitris Mourousiadis",  true ],
    ["gozo-019",          "Blue Lagoon (Comino)",        "26167765", "Ricardo Oliveira",       true ],
    ["malta-010",         "Golden Bay",                  "18780167", "Efrem Efre",             true ],
    ["baleari-045",       "Cala Macarella",              "37835916", "Bianca Ngt",             true ],
    ["baleari-060",       "Cala Comte",                  "34396811", "Dirk Pothen",            true ],
    ["canarie-041",       "Playa de Papagayo",           "38696117", "Jessica Sacco",          true ],
    ["andalusia-106",     "Duna de Bolonia",             "20633958", "Atlantic Ambience",      true ],
    ["algarve-046",       "Praia da Marinha",            "20282904", "Carolina Matos",         true ],
    ["algarve-045",       "Benagil",                     "39417132", "Igor Passchier",         true ],
    ["centro-063",        "Nazaré · Praia do Norte",     "36365744", "karim desouki",          false]
  ];

  window.ARCHIVIO_FOTO = righe.map(([sid, nome, id, autore, sicuro]) => ({
    sid: sid, nome: nome, id: id, autore: autore, sicuro: sicuro,
    url: pexels(id),
    pagina: "https://www.pexels.com/photo/" + id + "/",
    fonte: "Pexels",
    licenza: "Licenza Pexels — uso commerciale libero, attribuzione non obbligatoria"
  }));
})();
