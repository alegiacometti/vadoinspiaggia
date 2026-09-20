#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Il fondo e la lunghezza delle spiagge, dalla carta della Regione Liguria.

La Regione pubblica «Spiagge»: 1489 poligoni disegnati a mano sull'ortofoto
AGEA 2022, in scala 1:5000, licenza CC-BY. Dentro c'e' il campo `caratt_fis`,
che e' esattamente il nostro fondo:

    SPIAGGIA SABBIOSA    -> Sabbia
    SPIAGGIA CIOTTOLOSA  -> Ciottoli
    BATTIGIA ROCCIOSA    -> Scoglio
    TERRAPIENO           -> Piattaforma in cemento

CC-BY e' molto piu' comoda della ODbL di OpenStreetMap: obbliga a citare la
fonte, non a condividere il database. Per un sito che vende le regioni e' la
differenza fra «si puo' fare» e «chiedi all'avvocato».

Una nostra spiaggia puo' cadere su piu' poligoni — un tratto di sabbia, uno di
ciottoli, un terrapieno. Si prendono tutti quelli entro il raggio, il fondo e'
quello del piu' esteso, e la lunghezza e' la somma.

    python3 leggi-kml.py Spiagge.kml --spiagge spiagge.csv --regione liguria
"""

import argparse
import csv
import math
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

KML = "{http://www.opengis.net/kml/2.2}"
RAGGIO = 150          # metri: oltre, non e' la nostra spiaggia

FONDO = {
    "SPIAGGIA SABBIOSA": "Sabbia",
    "SPIAGGIA CIOTTOLOSA": "Ciottoli",
    "BATTIGIA ROCCIOSA": "Scoglio",
    "TERRAPIENO": "Piattaforma in cemento",
}
# i corsi d'acqua sono disegnati nella stessa carta ma non sono spiagge
NON_SPIAGGE = ("CORSO D'ACQUA",)


def piatto(t):
    t = unicodedata.normalize("NFD", (t or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t.replace("’", "'")).strip()


def metri(a, b):
    R = 6371000.0
    f1, f2 = math.radians(a[0]), math.radians(b[0])
    df, dl = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(df / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(h)))


def dentro(punto, anello):
    lat, lon = punto
    dentro_ = False
    for i in range(len(anello)):
        y1, x1 = anello[i]
        y2, x2 = anello[(i + 1) % len(anello)]
        if (y1 > lat) != (y2 > lat):
            xint = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lon < xint:
                dentro_ = not dentro_
    return dentro_


def perimetro(a):
    return sum(metri(a[i], a[(i + 1) % len(a)]) for i in range(len(a)))


def lunghezza(anello):
    """Una spiaggia e' un nastro: mezzo perimetro approssima il fronte a mare."""
    return round(perimetro(anello) / 2) if len(anello) >= 3 else 0


def centro(a):
    return (sum(p[0] for p in a) / len(a), sum(p[1] for p in a) / len(a))


def leggi_kml(percorso):
    """I poligoni, con i loro campi. Si scartano i corsi d'acqua e i frammenti
    sotto i venti metri, che sono pezzi di disegno, non spiagge."""
    radice = ET.parse(percorso).getroot()
    fuori, buttati = [], 0
    for pm in radice.iter(KML + "Placemark"):
        d = {sd.get("name"): (sd.text or "").strip()
             for sd in pm.iter(KML + "SimpleData")}
        co = pm.find(".//" + KML + "coordinates")
        anello = []
        if co is not None and co.text:
            for p in co.text.split():
                pezzi = p.split(",")
                if len(pezzi) >= 2:
                    anello.append((float(pezzi[1]), float(pezzi[0])))
        tipo = d.get("caratt_fis", "").upper()
        if len(anello) < 3 or any(x in tipo for x in NON_SPIAGGE):
            buttati += 1
            continue
        lung = lunghezza(anello)
        if lung < 20:
            buttati += 1
            continue
        fuori.append(dict(anello=anello, centro=centro(anello), lung=lung,
                          tipo=tipo, fondo=FONDO.get(tipo, ""),
                          comune=d.get("comune", ""),
                          codice=d.get("codice_spiaggia", ""),
                          balneabile=d.get("x_balnea", ""),
                          precisione=d.get("grado_iden", "")))
    return fuori, buttati


def pezzi_vicini(punto, poligoni):
    """Tutti i poligoni che ci contengono o che ci stanno vicino."""
    fuori = []
    for p in poligoni:
        if dentro(punto, p["anello"]):
            fuori.append((0, p))
            continue
        d = metri(punto, p["centro"])
        if d <= RAGGIO:
            fuori.append((round(d), p))
    fuori.sort(key=lambda x: x[0])
    return fuori


def proponi(punto, poligoni):
    """Il fondo e la lunghezza della NOSTRA spiaggia, non del quartiere.

    La prima versione sommava tutti i poligoni nel raggio: in centro a Genova
    facevano quattordici pezzi e 1438 metri, cioe' mezzo lungomare attaccato a
    una spiaggia sola. La lunghezza giusta e' quella del pezzo su cui cadiamo;
    quanto c'e' intorno resta, ma in una colonna a parte e con un altro nome,
    perche' e' un'altra cosa."""
    vicini = pezzi_vicini(punto, poligoni)
    if not vicini:
        return None
    dentro_ = [p for d, p in vicini if d == 0]
    nostro = dentro_[0] if dentro_ else vicini[0][1]
    if dentro_:
        # se cadiamo su piu' poligoni sovrapposti, vale il piu' esteso
        nostro = max(dentro_, key=lambda p: p["lung"])
    return dict(
        fondo=nostro["fondo"],
        fondo_carta=nostro["tipo"],
        lunghezza_m=nostro["lung"],
        intorno=("; ".join(sorted({p["tipo"] for _, p in vicini}))
                 if len(vicini) > 1 else ""),
        lung_tratto_m=sum(p["lung"] for _, p in vicini),
        pezzi=len(vicini),
        distanza_m=vicini[0][0],
        comune_carta=nostro["comune"],
        balneabile=nostro["balneabile"],
        precisione=nostro["precisione"],
        abbinata_perche="il punto cade dentro" if dentro_ else "la piu' vicina",
        fiducia=("alta" if dentro_ and nostro["fondo"] else
                 "media" if nostro["fondo"] else "bassa"))


COLONNE = ["sid", "nome", "comune", "regione", "fondo_nostro", "lung_nostra",
           "fondo", "fondo_carta", "lunghezza_m", "intorno",
           "lung_tratto_m", "pezzi", "distanza_m",
           "comune_carta", "balneabile", "precisione", "abbinata_perche",
           "fiducia"]


def leggi_spiagge(percorso, regione):
    def prendi(r, *nomi):
        for n in nomi:
            for k in r:
                if k and k.strip().lower() == n:
                    return (r[k] or "").strip()
        return ""
    fuori = []
    with open(percorso, encoding="utf-8-sig", newline="") as f:
        campione = f.read(4096); f.seek(0)
        try:
            dial = csv.Sniffer().sniff(campione, delimiters=",;\t")
        except csv.Error:
            dial = csv.excel
        for r in csv.DictReader(f, dialect=dial):
            reg = prendi(r, "regione", "region")
            if regione and reg.lower() != regione.lower():
                continue
            try:
                lat = float(prendi(r, "lat", "latitudine").replace(",", "."))
                lon = float(prendi(r, "lon", "lng", "longitudine").replace(",", "."))
            except ValueError:
                continue
            fuori.append(dict(sid=prendi(r, "sid", "codice", "id"),
                              nome=prendi(r, "n", "nome", "spiaggia"),
                              comune=prendi(r, "com", "comune"),
                              regione=reg, lat=lat, lon=lon,
                              fondo_nostro=prendi(r, "fondo"),
                              lung_nostra=prendi(r, "lung", "lunghezza")))
    return fuori


def main():
    p = argparse.ArgumentParser(description="Propone fondo e lunghezza dalla carta regionale.")
    p.add_argument("kml")
    p.add_argument("--spiagge", required=True)
    p.add_argument("--regione", default="liguria")
    p.add_argument("--uscita", default="proposte-carta.csv")
    args = p.parse_args()

    poligoni, buttati = leggi_kml(args.kml)
    print("poligoni utili: %d  (scartati %d fra corsi d'acqua e frammenti)"
          % (len(poligoni), buttati))
    nostre = leggi_spiagge(args.spiagge, args.regione)
    print("nostre schede in %s: %d" % (args.regione, len(nostre)))

    righe, senza = [], 0
    for s in nostre:
        prop = proponi((s["lat"], s["lon"]), poligoni)
        if not prop:
            senza += 1
            continue
        righe.append(dict(s, **prop))

    with open(args.uscita, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLONNE, extrasaction="ignore")
        w.writeheader()
        for r in sorted(righe, key=lambda x: (x["fiducia"] != "alta", x["nome"])):
            w.writerow(r)

    print("\nabbinate: %d — senza riscontro: %d" % (len(righe), senza))
    conta = {}
    for r in righe:
        conta[r["fiducia"]] = conta.get(r["fiducia"], 0) + 1
    for f in ("alta", "media", "bassa"):
        print("   fiducia %-6s %d" % (f, conta.get(f, 0)))
    fondi = {}
    for r in righe:
        if r["fondo"]:
            fondi[r["fondo"]] = fondi.get(r["fondo"], 0) + 1
    print("   fondi proposti: %s" % fondi)
    concordi = [r for r in righe if r["fondo_nostro"] and r["fondo"]]
    if concordi:
        uguali = sum(1 for r in concordi
                     if piatto(r["fondo"])[:5] == piatto(r["fondo_nostro"])[:5])
        print("\n   dove avevamo gia' il fondo: %d su %d combaciano (%.0f%%)"
              % (uguali, len(concordi), 100 * uguali / len(concordi)))
        print("   — e' la misura di quanto fidarsi dove il fondo non ce l'abbiamo")
    print("\nscritto: %s" % args.uscita)
    print("Nessun dato e' stato messo nel database: questo foglio si guarda.")


if __name__ == "__main__":
    main()
