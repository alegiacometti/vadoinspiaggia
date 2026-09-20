#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""I conti di chiedi-osm.py, uno per uno, con il risultato atteso scritto.

Non tocca la rete: usa il finto Overpass in finti/, costruito con distanze
scelte apposta perche' i numeri siano esatti e non «circa».

    python3 prova-osm.py
"""
import importlib.util, json, math, os, sys

QUI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("osm", os.path.join(QUI, "chiedi-osm.py"))
osm = importlib.util.module_from_spec(spec); spec.loader.exec_module(osm)

LAT0, LON0 = 43.7200, 13.2300
M_LAT = 111320.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))
def sposta(dn, de): return (LAT0 + dn / M_LAT, LON0 + de / M_LON)

male = 0
conti = 0
def controlla(cosa, avuto, atteso, tolleranza=0):
    global male, conti
    conti += 1
    ok = (abs(avuto - atteso) <= tolleranza) if isinstance(atteso, (int, float)) \
         and isinstance(avuto, (int, float)) else (avuto == atteso)
    male += not ok
    print("%s  %-46s -> %s%s" % ("ok  " if ok else "NO  ", cosa, avuto,
          "" if ok else "   (atteso %s)" % (atteso,)))

print("--- la geometria")
controlla("mille metri a nord sono mille metri",
          round(osm.metri((LAT0, LON0), sposta(1000, 0))), 1000, 2)
controlla("mille metri a est sono mille metri",
          round(osm.metri((LAT0, LON0), sposta(0, 1000))), 1000, 2)
nastro = [sposta(-25, -500), sposta(-25, 500), sposta(25, 500), sposta(25, -500)]
controlla("il punto al centro sta dentro", osm.dentro((LAT0, LON0), nastro), True)
controlla("un punto a 200 m a nord sta fuori", osm.dentro(sposta(200, 0), nastro), False)
controlla("un nastro di 1000x50 m e' stimato ~1000",
          osm.lunghezza_stimata(nastro), 1050, 60)

print("\n--- il fondo, dai tag di OpenStreetMap")
for tag, atteso in [({"surface": "sand"}, "Sabbia"),
                    ({"surface": "pebbles;sand"}, "Ghiaia"),
                    ({"surface": "shingle"}, "Ciottoli"),
                    ({"surface": "bare_rock"}, "Scoglio"),
                    ({"beach:surface": "gravel"}, "Ghiaia"),
                    ({"surface": "asfalto strano"}, None),
                    ({}, None)]:
    controlla("surface=%s" % (tag or "(niente)"), osm.fondo_da(tag)[0], atteso)

print("\n--- si, no, non si sa")
for v, atteso in [("yes","si"),("designated","si"),("limited","si"),
                  ("no","no"),("private","no"),("",""),("chissa","")]:
    controlla("wheelchair=%r" % v, osm.si_no(v), atteso)

print("\n--- l'abbinamento e i raggi dei servizi")
risposta = json.load(open(os.path.join(QUI, "finti", "overpass.json"), encoding="utf-8"))
spiagge, servizi = osm.spiagge_osm(risposta), osm.servizi_osm(risposta)
controlla("il contorno di due punti viene scartato", len(spiagge), 3)

dentro_ = osm.proponi(dict(lat=LAT0, lon=LON0), spiagge, servizi)
controlla("chi cade dentro e' abbinato a way/101", dentro_["osm"], "way/101")
controlla("  fondo", dentro_["fondo"], "Sabbia")
controlla("  parcheggio a 380 m entra (raggio 400)", dentro_["parcheggio"], "si a 380 m")
controlla("  wc a 80 m entra", dentro_["wc"], "si a 80 m")
controlla("  bagnino a 300 m NON entra (raggio 250)", dentro_["sorveglianza"], "")
controlla("  acqua a 260 m NON entra (raggio 200)", dentro_["acqua"], "")
controlla("  cani=no si legge", dentro_["cani"], "no")
controlla("  fiducia", dentro_["fiducia"], "alta")

vicino = osm.proponi(dict(lat=sposta(150,0)[0], lon=sposta(150,0)[1]), spiagge, servizi)
controlla("il valore composto «pebbles;sand» da' Ghiaia", vicino["fondo"], "Ghiaia")
controlla("supervised=yes da' sorveglianza", vicino["sorveglianza"], "si")

lontano = osm.proponi(dict(lat=sposta(-900,0)[0], lon=sposta(-900,0)[1]), spiagge, servizi)
controlla("a 900 m non si abbina niente", lontano, None)

vicinissimo = osm.proponi(dict(lat=sposta(-200,0)[0], lon=sposta(-200,0)[1]),
                          spiagge, servizi)
controlla("a 200 m si abbina per vicinanza",
          vicinissimo and vicinissimo["abbinata_perche"], "la piu' vicina")

print("\n%d conti, %d sbagliati" % (conti, male))
sys.exit(1 if male else 0)
