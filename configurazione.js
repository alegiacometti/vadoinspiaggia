/* Configurazione condivisa da tutte le pagine.
   Basta modificarla qui: le sedici carte regionali la leggono da questo file.

   CHIAVE_GOOGLE serve a una cosa sola: chiedere a Google se in un dato punto
   esiste una panoramica di Street View, prima di mostrare il pulsante.
   Le richieste ai metadati non sono a pagamento — verificano l'esistenza,
   non scaricano immagini. La chiave si crea sulla Google Cloud Console
   attivando la «Street View Static API», e va limitata al dominio del sito
   (Restrizioni → Siti web) perché nessun altro possa usarla.

   Lasciandola vuota non cambia niente rispetto a prima: il pulsante Street View
   resta sempre attivo e apre la panoramica più vicina, se c'è. */
window.CHIAVE_GOOGLE = "";
