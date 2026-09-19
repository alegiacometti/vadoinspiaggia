#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Le trappole dei due filtri, una per una, con l'esito atteso scritto.

Non tocca la rete e non tocca il database. Controlla due cose: «di quale
comune parla questo titolo» e «questo titolo interessa a chi sta scegliendo
dove andare al mare». Da rilanciare ogni volta che si mette mano ai nomi, ai
sinonimi o alle liste degli argomenti:

    python3 prova-abbinamento.py
"""
import importlib.util, json, os, sys

QUI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("robot", os.path.join(QUI, "leggi-feed.py"))
robot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(robot)

conf = robot.carica_config(os.path.join(QUI, "finti", "feed-di-prova.json"))
comuni = sorted({c for v in conf["_comuni_di_prova"].values() for c in v})
voci = robot.indice(comuni, conf["sinonimi"], conf["mai_comuni"])
TIENI = robot.regola(conf["argomenti"]["tieni"])
VIETATE = robot.regola(conf["argomenti"]["mai"])

CASI = [
    # titolo,                                                    comune atteso
    ("Cupra, cocaina nel marsupio: arrestato un trentenne",       "Cupra Marittima"),
    ("Cupra Marittima, nel marsupio 12 dosi di cocaina",          "Cupra Marittima"),
    ("San Benedetto, controlli sul lungomare",                    "San Benedetto del Tronto"),
    ("La Samb pareggia a Teramo",                                 "San Benedetto del Tronto"),
    ("Falconara, bandiera blu confermata",                        "Falconara Marittima"),
    ("Civitanova, il porto si allarga",                           "Civitanova Marche"),
    ("Porto Recanati, nuova passerella sulla spiaggia libera",    "Porto Recanati"),
    ("Recanati, minacce col coltello al bar",                     None),
    ("Ancona, auto vandalizzate in via Pesaro",                   "Ancona"),
    ("La Provincia di Ancona ha completato i lavori",             None),
    ("La Prefettura di Pesaro intensifica i controlli",           None),
    ("Incidente sulla statale all'altezza di Porto Recanati",     "Porto Recanati"),
    ("Jesi, il teatro Pergolesi presenta la stagione",            None),
    ("Morto Sandro Mazzola, il calcio in lutto",                  None),
    ("Francavilla al Mare, nuova pista ciclabile",                "Francavilla al Mare"),
    ("Il porto di Ancona chiude per il maltempo",                 None),
    ("Sant'Elpidio a Mare, festa patronale",                      None),
    ("Porto Sant'Elpidio, riapre lo chalet",                      "Porto Sant'Elpidio"),
]

# la stessa storia raccontata da due giornali
DOPPIONI = [
    ("Cupra, cocaina nel marsupio: arrestato un trentenne",
     "Cupra Marittima, nel marsupio 12 dosi di cocaina: un arresto", True),
    ("Grottammare, il mare torna balneabile",
     "Grottammare, rubata una bici sul lungomare", False),
]

# Il secondo filtro: di che cosa parla il titolo. Dentro solo meteo, mare,
# spiaggia ed eventi; il veto su cronaca, sport e politica vince sempre.
ARGOMENTI = [
    # titolo,                                                 comune,            dentro?
    ("allerta meteo arancione: chiusi i parchi",              "Senigallia",       True),
    ("mareggiata, danni alla passerella",                     "Fano",             True),
    ("il mare torna balneabile dopo le analisi",              "Grottammare",      True),
    ("bandiera blu confermata anche per il 2027",             "Falconara",        True),
    ("sagra del pesce azzurro nel fine settimana",            "Numana",           True),
    ("concerto in piazza per il ferragosto",                  "Pesaro",           True),
    ("nuova passerella sulla spiaggia libera",                "Porto Recanati",   True),
    ("chiusi due chioschi sul lungomare",                     "San Benedetto",    True),
    ("divieto di balneazione per lo scarico a mare",          "Ancona",           True),
    # il veto vince anche quando il titolo parla di mare
    ("mareggiata: un ferito sul lungomare",                   "Sirolo",           False),
    ("malore in spiaggia, grave un bagnante",                 "Numana",           False),
    ("cocaina nel marsupio: arrestato un trentenne",          "Cupra",            False),
    ("la Samb pareggia a Teramo, tifosi in festa",            "Samb",             False),
    ("il consiglio comunale approva il bilancio",             "Francavilla al Mare", False),
    ("auto vandalizzate in via Pesaro",                       "Ancona",           False),
    # niente di attinente: fuori
    ("la Rotonda riapre sabato dopo i lavori",                "Senigallia",       False),
    ("il porto si allarga: via ai lavori",                    "Civitanova",       False),
    # i falsi positivi veri del primo giro su tutta Italia, 19 settembre:
    # erano entrati, adesso devono restare fuori
    ("Olbia, addio a Leonardo Deiana: se ne va il nonno dei due fratelli",
                                                              "Olbia",            False),
    ("Maxi-evasione da 30 milioni di euro: coppia nei guai",   "Olbia",            False),
    ("Pescatore cade in mare: salvato dalla Guardia costiera", "San Teodoro",      False),
    ("emergenza in mare: salvati due bagnanti",                "Santa Teresa Gallura", False),
    ("Piscina, il CSI: bloccata l'assistenza in acqua",        "Ravenna",          False),
    # questa l'avevo scambiata per un falso positivo: «AFA» qui e' la sigla di
    # una ginnastica, non l'afa del meteo. Ma il titolo dice «al mare» e si
    # parla di un'attivita' in riva: passa, e va bene cosi'. La parola «afa»
    # resta comunque fuori dai via libera, perche' quella sigla e' una mina.
    ("GINNASTICA AFA AL MARE, TRA BENESSERE E SOCIALITA'",     "Pisa",             True),
    ("SOS Caldo, l'impegno di UNIVOC e Regalati un Sorriso",   "Catanzaro",        False),
    # ma questi due devono continuare a passare
    ("acqua non potabile a Marina di Palo: divieto in alcune zone", "Ladispoli",   True),
    ("stabilimento balneare abusivo, sgomberato dalla Guardia costiera",
                                                    "Santa Teresa Gallura",        True),
    # la trappola: il nome del paese contiene la parola «Mare»
    ("Francavilla al Mare, chiude lo sportello anagrafe",     "Francavilla al Mare", False),
    ("Francavilla al Mare, nuova ciclabile sul lungomare",    "Francavilla al Mare", True),
]

male = 0
for titolo, atteso in CASI:
    avuto, _ = robot.abbina(titolo, voci)
    ok = avuto == atteso
    male += not ok
    print("%s  %-58s -> %s" % ("ok  " if ok else "NO  ", titolo[:58],
                               avuto if avuto else "(nessuno)"))
    if not ok:
        print("      atteso: %s" % (atteso if atteso else "(nessuno)"))

for titolo, comune, atteso in ARGOMENTI:
    avuto, perche = robot.argomento(titolo, comune, TIENI, VIETATE)
    ok = avuto == atteso
    male += not ok
    print("%s  %-58s -> %s %s" % ("ok  " if ok else "NO  ", titolo[:58],
                                  "dentro" if avuto else "fuori ", perche))
    if not ok:
        print("      atteso: %s" % ("dentro" if atteso else "fuori"))

for a, b, atteso in DOPPIONI:
    avuto = robot.stessa_storia(robot.impronta(a), robot.impronta(b))
    ok = avuto == atteso
    male += not ok
    print("%s  doppione? %-48s -> %s" % ("ok  " if ok else "NO  ", a[:48], avuto))

print("\n%d casi, %d sbagliati" % (len(CASI) + len(ARGOMENTI) + len(DOPPIONI), male))
sys.exit(1 if male else 0)
