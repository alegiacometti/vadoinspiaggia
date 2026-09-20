#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""I conti del lettore portoghese, con il risultato atteso scritto.

Non tocca la rete: legge i finti in finti/. Da rilanciare ogni volta che si
mette mano alle espressioni che leggono l'elenco o i profili.

    python3 prova-portogallo.py
"""
import importlib.util, os, sys

QUI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("pt", os.path.join(QUI, "leggi-portogallo.py"))
pt = importlib.util.module_from_spec(spec); spec.loader.exec_module(pt)

male = conti = 0
def controlla(cosa, avuto, atteso):
    global male, conti
    conti += 1
    ok = avuto == atteso
    male += not ok
    print("%s  %-52s -> %r%s" % ("ok  " if ok else "NO  ", cosa, avuto,
          "" if ok else "   (atteso %r)" % (atteso,)))

elenco = open(os.path.join(QUI, "finti", "elenco.txt"), encoding="utf-8").read()
voci, saltate = pt.leggi_elenco(elenco)

print("--- l'elenco nazionale")
controlla("tutte le categorie, con la loro etichetta", len(voci), 7)
controlla("le righe illeggibili vengono dette, non ingoiate", len(saltate), 1)
controlla("la categoria resta scritta",
          [v["categoria"] for v in voci if v["codice"] == "PTCT7E"][0], "Interior")
controlla("un concelho tagliato dalla colonna stretta si abbina lo stesso",
          bool(pt.concelhi_possibili("Vila Real de Santo António",
               {"vila real de santo": [1]})), True)
controlla("ma un nome corto non si prende mezza regione",
          bool(pt.concelhi_possibili("Faro", {"faro nord": [1]})), False)
carcavelos = [v for v in voci if v["codice"] == "PTCX2A"][0]
controlla("«TEJO E OESTE CASCAIS» con un solo spazio: regione",
          carcavelos["arh"], "Tejo E Oeste")
controlla("  ...e concelho", carcavelos["concelho"], "CASCAIS")
controlla("il nome resta separato dalla categoria",
          carcavelos["nome"], "CARCAVELOS")

print("\n--- i nomi")
for dato, atteso in [("Praia da Rocha", "rocha"), ("Meia Praia", "meia praia"),
                     ("Praia de Oura-Leste", "oura leste"),
                     ("Zambujeira do Mar", "zambujeira do mar"),
                     ("Praia do Tamariz (sector poente)", "tamariz")]:
    controlla("nocciolo(%r)" % dato, pt.nocciolo(dato), atteso)
for dato, atteso in [("OURA-LESTE", "OuraLeste"), ("MEIA PRAIA", "MeiaPraia"),
                     ("ROCHA", "Rocha"), ("ZAMBUJEIRA DO MAR", "ZambujeiraDoMar")]:
    controlla("come l'APA scrive %r nel nome del file" % dato,
              pt.senza_spazi(dato), atteso)

print("\n--- i numeri, come li scrivono in portoghese")
for dato, atteso in [("1 139", 1139), ("9 500", 9500), ("2.498", 2498),
                     ("58 500", 58500), ("non un numero", None)]:
    controlla("numero(%r)" % dato, pt.numero(dato), atteso)

print("\n--- dentro al profilo")
profilo = open(os.path.join(QUI, "finti", "profilo.txt"), encoding="utf-8").read()
letto = pt.leggi_profilo(profilo)
controlla("fondo", letto["fondo"], "Sabbia")
controlla("lunghezza della frente de praia", letto["lunghezza_m"], 1139)
controlla("bagnanti al giorno", letto["utenti_giorno"], 9500)
controlla("accesso: vince «viário alcatroado» su «pedonal»",
          letto["accesso"], "auto")
solo_piedi = pt.leggi_profilo(
    "Praia de calhau rolado. Extensão do areal: 320 m. "
    "O acesso faz-se por trilho pedonal e escadas, sem acesso automóvel.")
controlla("un profilo senza strada: fondo", solo_piedi["fondo"], "Ghiaia")
controlla("  ...lunghezza", solo_piedi["lunghezza_m"], 320)
controlla("  ...accesso", solo_piedi["accesso"], "a piedi")
controlla("  ...e i bagnanti restano vuoti, non inventati",
          solo_piedi["utenti_giorno"], "")

# Le etichette ESATTE lette dal PDF di Praia da Rocha il 20 settembre. Sono
# piu' prolisse di come le avevo immaginate — «Extensão da frente de praia,
# aproximadamente:» e una FREQUÊNCIA con mezza frase fra parentesi prima del
# numero — e la prima versione delle espressioni le mancava per pochi caratteri.
VERO = ("A praia da Rocha e uma praia de areia dourada. "
        "Extensão da frente de praia, aproximadamente: 1 139m "
        "FREQUÊNCIA MÉDIA DIÁRIA (capacidade de utilização - nº de banhistas): 9 500 "
        "Tem acesso viário alcatroado através da cidade de Portimão.")
vero = pt.leggi_profilo(VERO)
print("\n--- le etichette vere di Praia da Rocha")
controlla("fondo", vero["fondo"], "Sabbia")
controlla("lunghezza", vero["lunghezza_m"], 1139)
controlla("bagnanti al giorno", vero["utenti_giorno"], 9500)
controlla("accesso", vero["accesso"], "auto")

print("\n--- l'abbinamento, che senza coordinate deve essere prudente")
per_concelho = {}
for v in voci:
    per_concelho.setdefault(pt.piatto(v["concelho"]), []).append(v)
def prova_abbina(nome, comune):
    v, perche = pt.abbina(dict(nome=nome, comune=comune), per_concelho)
    return (v["codice"] if v else None)
controlla("Praia da Rocha a Portimão", prova_abbina("Praia da Rocha", "Portimão"), "PTCH9Q")
controlla("Praia de Carcavelos a Cascais",
          prova_abbina("Praia de Carcavelos", "Cascais"), "PTCX2A")
controlla("la stessa spiaggia nel concelho sbagliato non si abbina",
          prova_abbina("Praia da Rocha", "Cascais"), None)
controlla("un nome che non esiste non si abbina",
          prova_abbina("Praia Inventata", "Portimão"), None)

print("\n--- l'indirizzo del profilo")
u = pt.indirizzi_profilo(dict(arh="Algarve", concelho="PORTIMÃO",
                              nome="ROCHA", codice="PTCH9Q"))
controlla("il primo indirizzo e' quello verificato a mano", u[0],
  "https://apambiente.pt/sites/default/files/_SNIAMB_A_APA/Comunicacao/"
  "Epoca_balnear/PerfisAB/ARH_Algarve/PerfisAguasBalneares/PORTIMAO/Rocha_PTCH9Q.pdf")
controlla("fra le varianti c'e' anche la cartella bilingue",
          any("PerfisAguasBalnearesBilingues" in x for x in u), True)
controlla("le varianti non esplodono di numero", len(u) <= 6, True)

print("\n%d conti, %d sbagliati" % (conti, male))
sys.exit(1 if male else 0)
