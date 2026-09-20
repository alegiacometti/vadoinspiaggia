#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Quello che OpenStreetMap sa delle nostre spiagge, e noi no.

Legge un elenco di spiagge (CSV esportato dal Registro in gestione), chiede a
OpenStreetMap che cosa c'e' in quei punti, e scrive un secondo CSV con i valori
PROPOSTI per le caselle vuote: fondo, lunghezza, parcheggio, wc, docce,
ristoro, sorveglianza, accessibilita', cani.

Non scrive niente nel database e non tocca il sito. Produce un foglio da
guardare. Questo non e' timidezza: e' che OpenStreetMap lo scrivono i
volontari, e un dato sbagliato in una scheda che vendi vale meno di zero.

    python3 chiedi-osm.py spiagge.csv --regione marche
    python3 chiedi-osm.py spiagge.csv --regione marche --prova finti/

UNA NOTA SUL robots.txt, perche' altrove in questo progetto lo rispettiamo alla
lettera: il robot delle notizie legge le PAGINE dei giornali, e li' il
robots.txt e' la voce di chi le pubblica. Qui si usa invece l'**API pubblica e
documentata** di Overpass, fatta apposta perche' i programmi la interroghino:
la regola che vale e' la sua politica d'uso (una richiesta per volta, un nome
riconoscibile, niente fretta), ed e' quella che questo script segue. Sono due
cose diverse e conviene che restino separate anche nella testa di chi legge.

E UNA SULLA LICENZA, che e' la domanda vera: i dati di OpenStreetMap sono
ODbL. L'attribuzione e' facile e va messa (c'e' gia' crediti.html). Il punto
aperto e' la clausola share-alike sui database derivati, e su un sito che vende
le regioni non e' una sottigliezza. Finche' non e' sciolta, questo script si
ferma al foglio: niente entra nel database.
"""

import argparse
import csv
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

QUI = os.path.dirname(os.path.abspath(__file__))
OVERPASS = "https://overpass-api.de/api/interpreter"
CHI_SONO = ("vadoinspiaggia-osm/1.0 "
            "(+https://alegiacometti.github.io/vadoinspiaggia/; dati ODbL OSM)")
ATTESA = 180          # Overpass e' lento per costruzione: qui si aspetta
PAUSA = 5             # secondi fra una regione e l'altra, per educazione
VICINO = 300          # metri: oltre questa distanza non e' la nostra spiaggia
RAGGIO = {"parking": 400, "toilets": 200, "shower": 200, "drinking_water": 200,
          "restaurant": 250, "cafe": 250, "bar": 250, "ice_cream": 250,
          "lifeguard": 250, "beach_resort": 200}


# --------------------------------------------------------------- la geometria

def metri(a, b):
    """Distanza fra due punti (lat, lon) in metri. Formula dell'emisenoverso:
    sulla scala di una spiaggia l'errore e' sotto il metro."""
    R = 6371000.0
    f1, f2 = math.radians(a[0]), math.radians(b[0])
    df = math.radians(b[0] - a[0])
    dl = math.radians(b[1] - a[1])
    h = math.sin(df / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(h)))


def dentro(punto, anello):
    """Il punto sta dentro al poligono? Si tira una semiretta verso destra e si
    contano gli attraversamenti: dispari = dentro."""
    lat, lon = punto
    within = False
    n = len(anello)
    for i in range(n):
        y1, x1 = anello[i]
        y2, x2 = anello[(i + 1) % n]
        if (y1 > lat) != (y2 > lat):
            xint = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lon < xint:
                within = not within
    return within


def perimetro(anello):
    return sum(metri(anello[i], anello[(i + 1) % len(anello)])
               for i in range(len(anello)))


def lunghezza_stimata(anello):
    """Una spiaggia e' un nastro: lunga e stretta. Meta' del perimetro e'
    percio' una stima onesta del fronte a mare — sbaglia per difetto sulle
    baie molto curve e per eccesso sui poligoni quadrati, ed e' per questo che
    nel foglio la colonna si chiama «stimata» e non «lunghezza»."""
    if len(anello) < 3:
        return None
    return round(perimetro(anello) / 2)


def centro(anello):
    return (sum(p[0] for p in anello) / len(anello),
            sum(p[1] for p in anello) / len(anello))


# ---------------------------------------------------------- da OSM a noi

FONDO = {
    "sand": "Sabbia", "fine_gravel": "Ghiaia fine", "gravel": "Ghiaia",
    "pebbles": "Ghiaia", "pebblestone": "Ghiaia", "shingle": "Ciottoli",
    "rock": "Scoglio", "rocks": "Scoglio", "stone": "Scoglio",
    "bare_rock": "Scoglio", "concrete": "Piattaforma in cemento",
    "grass": "Erba", "earth": "Terra", "dirt": "Terra", "mud": "Fango",
}


def fondo_da(tag):
    """Il fondo, dai tag OSM. `surface` e' il campo giusto; alcuni mappatori
    usano `natural` o `beach:surface`. Un valore composto («sand;pebbles»)
    vince il primo, che per convenzione e' il prevalente."""
    for chiave in ("surface", "beach:surface", "seamark:beach:surface"):
        v = (tag.get(chiave) or "").strip().lower()
        if not v:
            continue
        for pezzo in re.split(r"[;,]", v):
            if pezzo.strip() in FONDO:
                return FONDO[pezzo.strip()], pezzo.strip()
    return None, None


def si_no(v):
    v = (v or "").strip().lower()
    if v in ("yes", "designated", "limited", "official"):
        return "si"
    if v in ("no", "none", "private"):
        return "no"
    return ""


# ------------------------------------------------------------- Overpass

def interroga(riquadro, prova=""):
    """Una sola domanda per regione. Le spiagge con il contorno intero
    (serve per la lunghezza e per il punto-dentro-poligono), i servizi solo
    con il loro centro."""
    s, w, n, e = riquadro
    q = """[out:json][timeout:%d];
(
  way["natural"="beach"](%f,%f,%f,%f);
  relation["natural"="beach"](%f,%f,%f,%f);
);
out geom;
(
  node["amenity"~"^(parking|toilets|shower|drinking_water|restaurant|cafe|bar|ice_cream)$"](%f,%f,%f,%f);
  way["amenity"~"^(parking|toilets)$"](%f,%f,%f,%f);
  node["emergency"="lifeguard"](%f,%f,%f,%f);
  nwr["leisure"="beach_resort"](%f,%f,%f,%f);
);
out center;""" % ((ATTESA - 20,) + (s, w, n, e) * 6)

    if prova:
        with open(os.path.join(prova, "overpass.json"), encoding="utf-8") as f:
            return json.load(f)

    dati = urllib.parse.urlencode({"data": q}).encode("utf-8")
    r = urllib.request.Request(OVERPASS, data=dati, headers={
        "User-Agent": CHI_SONO, "Accept": "application/json"})
    for tentativo in range(3):
        try:
            with urllib.request.urlopen(r, timeout=ATTESA) as risposta:
                return json.loads(risposta.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # 429 = troppe richieste, 504 = il server e' in coda. Si aspetta,
            # non si insiste: la politica d'uso di Overpass chiede proprio
            # questo, ed e' un servizio pagato da volontari.
            if e.code in (429, 504) and tentativo < 2:
                time.sleep(30 * (tentativo + 1))
                continue
            raise SystemExit("Overpass ha risposto %d: %s"
                             % (e.code, e.read()[:300].decode("utf-8", "replace")))
    raise SystemExit("Overpass non risponde")


def spiagge_osm(risposta):
    """Le spiagge, con il contorno."""
    fuori = []
    for el in risposta.get("elements", []):
        if el.get("type") not in ("way", "relation"):
            continue
        punti = [(p["lat"], p["lon"]) for p in el.get("geometry", []) or []
                 if "lat" in p]
        if len(punti) < 3:
            continue
        fuori.append(dict(id="%s/%s" % (el["type"], el["id"]),
                          tag=el.get("tags", {}) or {},
                          anello=punti, centro=centro(punti)))
    return fuori


def servizi_osm(risposta):
    fuori = []
    for el in risposta.get("elements", []):
        t = el.get("tags", {}) or {}
        p = None
        if el.get("type") == "node" and "lat" in el:
            p = (el["lat"], el["lon"])
        elif "center" in el:
            p = (el["center"]["lat"], el["center"]["lon"])
        if not p:
            continue
        genere = t.get("amenity") or t.get("emergency") or t.get("leisure")
        if genere in RAGGIO:
            fuori.append((genere, p, t))
    return fuori


# --------------------------------------------------------------- il lavoro

def proponi(spiaggia, spiagge, servizi):
    """Per una nostra spiaggia: la spiaggia OSM piu' probabile, e cosa si
    ricava. Vince chi ci contiene dentro; altrimenti la piu' vicina entro
    trecento metri."""
    punto = (spiaggia["lat"], spiaggia["lon"])
    migliore, distanza, come = None, None, ""
    for s in spiagge:
        if dentro(punto, s["anello"]):
            migliore, distanza, come = s, 0, "il punto cade dentro"
            break
        d = metri(punto, s["centro"])
        if d <= VICINO and (distanza is None or d < distanza):
            migliore, distanza, come = s, d, "la piu' vicina"
    if not migliore:
        return None

    t = migliore["tag"]
    fondo, grezzo = fondo_da(t)
    riga = dict(
        osm=migliore["id"],
        osm_nome=t.get("name", ""),
        distanza_m=round(distanza),
        abbinata_perche=come,
        fondo=fondo or "",
        fondo_osm=grezzo or "",
        lung_stimata_m=lunghezza_stimata(migliore["anello"]) or "",
        accessibile=si_no(t.get("wheelchair")),
        cani=si_no(t.get("dog")),
        nudismo=si_no(t.get("nudism")),
        sorveglianza=si_no(t.get("supervised")),
    )
    vicini = {}
    for genere, p, tag in servizi:
        d = metri(punto, p)
        if d <= RAGGIO[genere] and (genere not in vicini or d < vicini[genere][0]):
            vicini[genere] = (round(d), tag)
    riga["parcheggio"] = ("si a %d m" % vicini["parking"][0]) if "parking" in vicini else ""
    riga["wc"] = ("si a %d m" % vicini["toilets"][0]) if "toilets" in vicini else ""
    riga["docce"] = ("si a %d m" % vicini["shower"][0]) if "shower" in vicini else ""
    riga["acqua"] = ("si a %d m" % vicini["drinking_water"][0]) if "drinking_water" in vicini else ""
    ristoro = [g for g in ("restaurant", "cafe", "bar", "ice_cream") if g in vicini]
    riga["ristoro"] = ("si a %d m" % min(vicini[g][0] for g in ristoro)) if ristoro else ""
    if "lifeguard" in vicini and not riga["sorveglianza"]:
        riga["sorveglianza"] = "si a %d m" % vicini["lifeguard"][0]
    riga["stabilimento"] = ("si a %d m" % vicini["beach_resort"][0]) if "beach_resort" in vicini else ""

    quante = sum(1 for k in ("fondo", "lung_stimata_m", "parcheggio", "wc",
                             "docce", "ristoro", "sorveglianza", "accessibile")
                 if riga[k])
    riga["fiducia"] = ("alta" if come.startswith("il punto") and quante >= 3
                       else "media" if quante >= 2 else "bassa")
    return riga


COLONNE = ["sid", "nome", "comune", "regione", "lat", "lon",
           "fondo_nostro", "lung_nostra",
           "osm", "osm_nome", "distanza_m", "abbinata_perche", "fiducia",
           "fondo", "fondo_osm", "lung_stimata_m", "parcheggio", "wc", "docce",
           "acqua", "ristoro", "sorveglianza", "stabilimento", "accessibile",
           "cani", "nudismo"]


def leggi_spiagge(percorso, regione):
    """Il CSV esportato dal Registro spiagge della pagina di gestione.
    Si accettano le intestazioni piu' probabili senza fare storie."""
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
            dialetto = csv.Sniffer().sniff(campione, delimiters=",;\t")
        except csv.Error:
            dialetto = csv.excel
        for r in csv.DictReader(f, dialect=dialetto):
            reg = prendi(r, "regione", "region")
            if regione and reg.lower() != regione.lower():
                continue
            try:
                lat = float(prendi(r, "lat", "latitudine").replace(",", "."))
                lon = float(prendi(r, "lon", "lng", "longitudine").replace(",", "."))
            except ValueError:
                continue
            fuori.append(dict(
                sid=prendi(r, "sid", "codice", "id"),
                nome=prendi(r, "n", "nome", "spiaggia"),
                comune=prendi(r, "com", "comune"),
                regione=reg, lat=lat, lon=lon,
                fondo_nostro=prendi(r, "fondo"),
                lung_nostra=prendi(r, "lung", "lunghezza")))
    return fuori


def riquadro_di(spiagge, margine=0.02):
    lat = [s["lat"] for s in spiagge]; lon = [s["lon"] for s in spiagge]
    return (min(lat) - margine, min(lon) - margine,
            max(lat) + margine, max(lon) + margine)


def main():
    p = argparse.ArgumentParser(description="Propone i dati mancanti da OpenStreetMap.")
    p.add_argument("spiagge", help="CSV esportato dal Registro spiagge")
    p.add_argument("--regione", default="", help="una regione per volta")
    p.add_argument("--uscita", default="proposte-osm.csv")
    p.add_argument("--prova", default="", help="cartella con overpass.json finto")
    p.add_argument("--solo-vuote", action="store_true",
                   help="solo le spiagge a cui manca il fondo")
    args = p.parse_args()

    nostre = leggi_spiagge(args.spiagge, args.regione)
    if args.solo_vuote:
        nostre = [s for s in nostre if not s["fondo_nostro"]]
    if not nostre:
        raise SystemExit("nessuna spiaggia da cercare: controlla il CSV e --regione")
    print("spiagge da cercare: %d" % len(nostre))

    riq = riquadro_di(nostre)
    print("riquadro: %.3f %.3f %.3f %.3f" % riq)
    risposta = interroga(riq, args.prova)
    spiagge = spiagge_osm(risposta)
    servizi = servizi_osm(risposta)
    print("OpenStreetMap: %d spiagge, %d servizi nel riquadro"
          % (len(spiagge), len(servizi)))

    righe, senza = [], 0
    for s in nostre:
        prop = proponi(s, spiagge, servizi)
        if not prop:
            senza += 1
            continue
        riga = dict(s); riga.update(prop); righe.append(riga)

    with open(args.uscita, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLONNE, extrasaction="ignore")
        w.writeheader()
        for r in sorted(righe, key=lambda x: (x["fiducia"] != "alta",
                                              x["fiducia"] != "media", x["nome"])):
            w.writerow(r)

    conta = {}
    for r in righe:
        conta[r["fiducia"]] = conta.get(r["fiducia"], 0) + 1
    print("\nabbinate: %d — senza riscontro su OSM: %d" % (len(righe), senza))
    for f in ("alta", "media", "bassa"):
        print("   fiducia %-6s %d" % (f, conta.get(f, 0)))
    for campo in ("fondo", "lung_stimata_m", "parcheggio", "wc", "docce",
                  "ristoro", "sorveglianza", "accessibile"):
        print("   %-16s %d" % (campo, sum(1 for r in righe if r[campo])))
    print("\nscritto: %s" % args.uscita)
    print("Nessun dato e' stato messo nel database: questo foglio si guarda.")


if __name__ == "__main__":
    main()
