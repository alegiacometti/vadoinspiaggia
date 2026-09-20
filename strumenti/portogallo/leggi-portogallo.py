#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""I quattro campi che mancano alle 601 schede portoghesi.

La catena, verificata su due spiagge vere (Praia da Rocha e Oura-Leste):

    elenco nazionale APA  ->  concelho + codice + nome
    codice                ->  indirizzo del «Perfil de Água Balnear»
    profilo (PDF)         ->  fondo, lunghezza, bagnanti al giorno, accesso

Come gli altri due robot, non scrive niente nel database: produce un foglio da
guardare. E come gli altri due, si ferma da solo dove non capisce invece di
inventare: una riga senza un campo e' meglio di una riga con un campo sbagliato.

    python3 leggi-portogallo.py elenco.pdf --spiagge spiagge.csv
    python3 leggi-portogallo.py --prova finti/          # senza rete

Serve `pdftotext` (pacchetto poppler-utils). Su GitHub c'e' gia'; sul PC di
Windows si installa con i binari di poppler, oppure si lascia fare a GitHub.
"""

import argparse
import csv
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request

QUI = os.path.dirname(os.path.abspath(__file__))
CHI_SONO = ("vadoinspiaggia-portogallo/1.0 "
            "(+https://alegiacometti.github.io/vadoinspiaggia/)")
ATTESA = 30
PAUSA = 1.0     # un secondo fra un profilo e l'altro: sono centinaia

# I due nomi di cartella osservati: alcuni concelhos hanno i profili bilingui.
CARTELLE = ["PerfisAguasBalneares", "PerfisAguasBalnearesBilingues"]
BASE = ("https://apambiente.pt/sites/default/files/_SNIAMB_A_APA/Comunicacao/"
        "Epoca_balnear/PerfisAB/ARH_%s/%s/%s/%s_%s.pdf")


# ------------------------------------------------------------- le parole

LETTERE_INTERE = str.maketrans({"ħ": "h", "đ": "d", "ø": "o",
                                "ł": "l", "ß": "ss", "æ": "ae"})


def piatto(t):
    t = (t or "").lower().translate(LETTERE_INTERE)
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t.replace("’", "'")).strip()


# «Praia da Rocha» e «Rocha» sono la stessa spiaggia: per confrontare i nomi si
# tolgono le parole di servizio, che in portoghese sono sempre le stesse.
SPOGLIA = re.compile(r"^(praia|praias|zona balnear|areal)\s+(da|do|de|das|dos)?\s*"
                     r"|\s+\(.*\)$")


def nocciolo(nome):
    """Il nome ridotto all'osso, per poterlo confrontare.

    I separatori diventano tutti uno spazio: noi scriviamo «Amoreira - Mar»,
    l'APA scrive «AMOREIRA-MAR», e sono la stessa spiaggia. Era il 90% degli
    abbinamenti mancati alla prima prova sull'Algarve."""
    n = piatto(nome)
    for _ in range(2):
        n = SPOGLIA.sub("", n).strip()
    n = re.sub(r"[\-/\u2013\u2014]+", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def senza_spazi(nome):
    """Come l'APA scrive i nomi dentro ai nomi dei file: senza spazi, senza
    accenti, con le iniziali maiuscole. «Oura-Leste» -> «OuraLeste»."""
    pezzi = re.split(r"[\s\-']+", piatto(nome))
    return "".join(p.capitalize() for p in pezzi if p)


# ------------------------------------------------------------- i PDF

def testo_del_pdf(percorso):
    """Il testo di un PDF, con pdftotext. `-layout` tiene le colonne separate,
    che serve per leggere l'elenco nazionale senza mescolare i campi."""
    try:
        r = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8",
                            percorso, "-"],
                           capture_output=True, timeout=120)
    except FileNotFoundError:
        raise SystemExit("manca pdftotext: installa poppler-utils")
    if r.returncode != 0:
        return ""
    return r.stdout.decode("utf-8", "replace")


def scarica(url):
    r = urllib.request.Request(url, headers={"User-Agent": CHI_SONO})
    with urllib.request.urlopen(r, timeout=ATTESA) as risposta:
        return risposta.read()


# --------------------------------------------------- l'elenco nazionale

# Le regioni idrografiche sono cinque e si chiamano cosi'. Riconoscerle per
# nome, invece di fidarsi delle colonne, e' l'unico modo solido: pdftotext a
# volte lascia uno spazio solo fra due colonne, e una riga letta male sparisce
# senza far rumore — che e' il peggior tipo di errore.
ARH_NOTI = ["TEJO E OESTE", "ALENTEJO", "ALGARVE", "CENTRO", "NORTE",
            "MADEIRA", "ACORES", "AÇORES"]
CODICE = re.compile(r"\b(PT[A-Z0-9]{4,8})\b")
CATEGORIA = re.compile(r"\b(COSTEIRA|INTERIOR|TRANSI[ÇC][ÃA]O)\b")


# Quando il nome del concelho non ci sta nella colonna, la parte che avanza
# finisce da sola sulla riga dopo, incolonnata li' sotto. Senza rimetterla al
# suo posto, «VILA REAL DE SANTO ANTÓNIO» resta «VILA REAL DE SANTO» — e con
# quel nome monco non si costruisce nemmeno l'indirizzo del suo PDF.
CODA = re.compile(r"^\s{6,34}([A-ZÁÂÃÀÇÉÊÍÓÔÕÚ'\.\- ]{3,22})\s*$")


def coda_della_riga(righe, i):
    for j in (i + 1, i - 1):
        if 0 <= j < len(righe):
            m = CODA.match(righe[j])
            if m and not CODICE.search(righe[j]) and not CATEGORIA.search(righe[j]):
                return m.group(1).strip()
    return ""


def leggi_elenco(testo):
    """Dall'elenco APA: una riga per acqua balneare.

    Si tengono tutte le categorie, non solo le COSTEIRA: fra le nostre schede
    ci sono spiagge di fiume e di estuario, e l'APA le chiama INTERIOR e
    TRANSIÇÃO. La categoria finisce nel foglio, cosi' si vede.

    Ogni riga si legge attorno a due punti fermi: il codice PTxxxx e la parola
    della categoria. Quello che sta prima del codice e' regione + concelho,
    quello che sta in mezzo e' il nome."""
    fuori, saltate = [], []
    righe = testo.splitlines()
    for i, riga in enumerate(righe):
        m = CODICE.search(riga)
        if not m:
            continue
        prima = riga[:m.start()].strip()
        dopo = riga[m.end():].strip()
        c = CATEGORIA.search(dopo)
        if not c or not prima:
            saltate.append(riga.strip()[:70])
            continue
        nome = dopo[:c.start()].strip(" .-")
        arh = ""
        for a in ARH_NOTI:
            if piatto(prima).startswith(piatto(a)):
                arh, prima = a, prima[len(a):].strip()
                break
        concelho = re.split(r"\s{2,}", prima)[-1].strip() if prima else ""
        coda = coda_della_riga(righe, i)
        if coda and not piatto(concelho).endswith(piatto(coda)):
            concelho = (concelho + " " + coda).strip()
        if not arh or not concelho or not nome:
            saltate.append(riga.strip()[:70])
            continue
        fuori.append(dict(arh=arh.title(), concelho=concelho,
                          codice=m.group(1), nome=nome,
                          categoria=c.group(1).title()))
    return fuori, saltate


# ------------------------------------------------------ dentro al profilo

FONDO_PT = [
    (r"\bareia\b|\barenosa\b|\barenoso\b", "Sabbia"),   # non «areal»:
    # «areal» e' la distesa di spiaggia, non la sabbia, e compare nella frase
    # della misura anche nei profili delle spiagge di ciottoli.
    (r"\bcalhau\b|\bcalhaus\b|\bcascalho\b|\bseixos\b", "Ghiaia"),
    (r"\brocha\b|\brochosa\b|\brochoso\b", "Scoglio"),
    (r"\blodo\b|\blodosa\b", "Fango"),
]

LUNGHEZZA = re.compile(
    r"extens[aã]o\s+(?:d[ao]\s+)?(?:frente\s+de\s+praia|areal|praia)"
    r"[^0-9]{0,70}([0-9][0-9 .,]*)\s*m\b", re.I)

UTENTI = re.compile(
    r"(?:frequ[eê]ncia\s+m[eé]dia\s+di[aá]ria|capacidade\s+de\s+utiliza[cç][aã]o|"
    r"utentes|utilizadores|banhistas)[^0-9]{0,70}([0-9][0-9 .,]*)", re.I)

# La parola che conta sta in gruppo 1: la negazione va cercata davanti a
# QUELLA, non davanti ad «acesso». In «o acesso faz-se por trilho pedonal,
# sem acesso automovel» la negazione e' in mezzo alla frase, non all'inizio.
ACCESSO = [
    (r"acesso[^.]{0,80}?(vi[aá]rio|autom[oó]vel|alcatroado|asfaltado)", "auto"),
    (r"acesso[^.]{0,80}?(terra\s+batida|n[aã]o\s+alcatroado|caminho\s+de\s+terra)", "sterrato"),
    (r"acesso[^.]{0,80}?(pedonal|a\s+p[eé]|escadas|passadi[cç]o|trilho)", "a piedi"),
    (r"acesso[^.]{0,80}?(mar[ií]tim[oa]|barco|embarca[cç][aã]o)", "barca"),
]


NEGAZIONE = re.compile(r"\b(sem|nao|n[aã]o|inexiste|impossibilidade\s+de)\b")


def numero(t):
    """«1 139 m» e «2.498» sono lo stesso tipo di numero scritto in due modi.
    In portoghese il punto separa le migliaia, quindi va buttato, non letto
    come virgola decimale."""
    t = re.sub(r"[ .]", "", (t or "").strip()).replace(",", ".")
    try:
        return int(round(float(t)))
    except ValueError:
        return None


def leggi_profilo(testo):
    t = re.sub(r"\s+", " ", testo)
    basso = piatto(t)
    fuori = dict(fondo="", fondo_parola="", lunghezza_m="", utenti_giorno="",
                 accesso="")
    for schema, valore in FONDO_PT:
        m = re.search(schema, basso)
        if m:
            fuori["fondo"], fuori["fondo_parola"] = valore, m.group(0)
            break
    m = LUNGHEZZA.search(t)
    if m:
        fuori["lunghezza_m"] = numero(m.group(1)) or ""
    m = UTENTI.search(t)
    if m:
        fuori["utenti_giorno"] = numero(m.group(1)) or ""
    for schema, valore in ACCESSO:
        for m in re.finditer(schema, basso):
            # «sem acesso automóvel» e «não existe acesso viário» dicono il
            # contrario della stessa frase: se prima c'e' una negazione, la
            # riga non vale.
            if NEGAZIONE.search(basso[max(0, m.start(1) - 14):m.start(1)]):
                continue
            fuori["accesso"] = valore
            break
        if fuori["accesso"]:
            break
    return fuori


def nomi_file(nome):
    """Come l'APA puo' aver scritto il nome dentro al nome del file.

    Il primo e' quello verificato a mano su Praia da Rocha e Oura-Leste; gli
    altri sono i modi ragionevoli in cui potrebbe scriverlo altrove. Solo chi
    sbaglia paga le richieste in piu'."""
    fuori = [senza_spazi(nome)]
    # tenendo i trattini: «Almádena-Cabanas Velhas» -> «Almadena-CabanasVelhas»
    pezzi = [senza_spazi(p) for p in re.split(r"[\-/]", nome) if p.strip()]
    if len(pezzi) > 1:
        fuori.append("-".join(pezzi))
    senza = re.sub(r"[^A-Za-z0-9]", "", piatto(nome).title())
    if senza not in fuori:
        fuori.append(senza)
    return fuori


def cartelle_concelho(concelho):
    """Come puo' chiamarsi la cartella del concelho: senza accenti (verificato
    su PORTIMAO e ALBUFEIRA) oppure con gli accenti, che nell'indirizzo vanno
    scritti in percentuale."""
    fuori = [urllib.parse.quote(piatto(concelho).upper())]
    con_accenti = urllib.parse.quote(concelho.upper())
    if con_accenti not in fuori:
        fuori.append(con_accenti)
    return fuori


def indirizzi_profilo(voce):
    """Tutti gli indirizzi plausibili, dal piu' probabile al meno.

    Il primo e' quello verificato a mano su Praia da Rocha. Gli altri sono
    varianti ragionevoli: l'APA non pubblica la regola con cui nomina i file,
    quindi la si impara dal primo giro guardando quale variante vince."""
    arh = piatto(voce["arh"]).title().replace(" ", "_")
    return [BASE % (arh, cartella, conc, nome, voce["codice"])
            for cartella in CARTELLE
            for conc in cartelle_concelho(voce["concelho"])
            for nome in nomi_file(voce["nome"])]


# ---------------------------------------------------------- le nostre

def leggi_spiagge(percorso, regioni):
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
            if regioni and reg.lower() not in regioni:
                continue
            fuori.append(dict(sid=prendi(r, "sid", "codice", "id"),
                              nome=prendi(r, "n", "nome", "spiaggia"),
                              comune=prendi(r, "com", "comune", "concelho"),
                              regione=reg,
                              fondo_nostro=prendi(r, "fondo"),
                              lung_nostra=prendi(r, "lung", "lunghezza")))
    return fuori


PORTOGALLO = {"acores", "alentejo", "algarve", "centro", "lisboa", "madeira", "norte"}

COLONNE = ["sid", "nome", "comune", "regione", "fondo_nostro", "lung_nostra",
           "apa_codice", "apa_nome", "apa_concelho", "apa_categoria", "apa_url", "abbinata_perche",
           "fondo", "fondo_parola", "lunghezza_m", "utenti_giorno", "accesso",
           "fiducia"]


def concelhi_possibili(comune, per_concelho):
    """Le voci dell'elenco che stanno in quel comune.

    Nel PDF dell'APA la colonna del concelho e' stretta e i nomi lunghi
    vengono tagliati: «VILA REAL DE SANTO ANTÓNIO» diventa «VILA REAL DE
    SANTO». Quindi vale anche quando uno dei due e' l'inizio dell'altro — ma
    solo da otto lettere in su, se no «FARO» si prenderebbe mezza regione."""
    c = piatto(comune)
    if c in per_concelho:
        return per_concelho[c]
    for chiave, voci in per_concelho.items():
        # il limite vale sul piu' CORTO dei due, se no «Faro» si aggancerebbe
        # a qualunque concelho che comincia per Faro
        if min(len(c), len(chiave)) >= 8 and (c.startswith(chiave)
                                              or chiave.startswith(c)):
            return voci
    return []


def abbina(nostra, per_concelho):
    """Stesso concelho, stesso nocciolo del nome. Senza coordinate non si puo'
    fare di meglio, quindi si e' prudenti: o il nome combacia, o si lascia
    perdere. Meglio nessuna proposta che la spiaggia sbagliata."""
    voci = concelhi_possibili(nostra["comune"], per_concelho)
    n = nocciolo(nostra["nome"])
    if not n:
        return None, ""
    for v in voci:
        if nocciolo(v["nome"]) == n:
            return v, "stesso concelho, stesso nome"
    for v in voci:
        a, b = nocciolo(v["nome"]), n
        if len(a) >= 6 and len(b) >= 6 and (a in b or b in a):
            return v, "stesso concelho, nome contenuto"
    return None, ""


PROFILI_COLONNE = ["codice", "concelho", "arh", "nome", "categoria", "url",
                   "fondo", "fondo_parola", "lunghezza_m", "utenti_giorno",
                   "accesso"]


def scarica_profilo(voce):
    """Il testo del profilo, e l'indirizzo che ha funzionato."""
    # al massimo sei tentativi per spiaggia: con cinquecento spiagge, provarne
    # dodici a testa vorrebbe dire seimila richieste a un server pubblico.
    for url in indirizzi_profilo(voce)[:6]:
        try:
            dati = scarica(url)
        except Exception:
            continue
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(dati); tmp = f.name
        testo = testo_del_pdf(tmp)
        os.unlink(tmp)
        if testo.strip():
            return testo, url
    return "", ""


def scrivi_profili(voci, uscita, quante, mostra=False):
    """Tutti i profili dell'APA in un foglio solo.

    Qui dentro non c'e' niente di nostro: e' l'elenco pubblico delle acque
    balneari portoghesi con quattro campi presi dai loro PDF. Per questo puo'
    girare su GitHub in un deposito pubblico senza esporre niente."""
    righe, presi, muti = [], 0, []
    for i, v in enumerate(voci, 1):
        if quante and presi >= quante:
            break
        testo, url = scarica_profilo(v)
        riga = dict(codice=v["codice"], concelho=v["concelho"], arh=v["arh"],
                    nome=v["nome"], categoria=v.get("categoria", ""), url=url,
                    fondo="", fondo_parola="", lunghezza_m="",
                    utenti_giorno="", accesso="")
        if testo:
            if mostra and presi == 0:
                print("\n--- il primo profilo, come lo vede il programma "
                      + "-" * 20)
                print(re.sub(r"\n{3,}", "\n\n", testo)[:2000])
                print("--- fine del primo profilo " + "-" * 34 + "\n",
                      flush=True)
            riga.update(leggi_profilo(testo))
            presi += 1
        else:
            muti.append("%s %s (%s)" % (v["codice"], v["nome"], v["concelho"]))
        righe.append(riga)
        if i % 25 == 0:
            print("   ...%d letti, %d senza profilo" % (presi, len(muti)),
                  flush=True)
        time.sleep(PAUSA)

    with open(uscita, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=PROFILI_COLONNE, extrasaction="ignore")
        w.writeheader()
        for r in righe:
            w.writerow(r)

    print("\nprofili trovati: %d su %d" % (presi, len(righe)))
    forme = {}
    for r in righe:
        if not r["url"]:
            continue
        pezzi = r["url"].split("/")
        forme[pezzi[-3]] = forme.get(pezzi[-3], 0) + 1
    if forme:
        print("   cartelle che hanno funzionato: %s" % forme)
    for campo in ("fondo", "lunghezza_m", "utenti_giorno", "accesso"):
        print("   %-14s %d" % (campo, sum(1 for r in righe if r[campo] != "")))
    if muti:
        print("\nsenza profilo (%d), i primi venti:" % len(muti))
        for m in muti[:20]:
            print("   ·", m)
    print("\nscritto: %s" % uscita)


def main():
    p = argparse.ArgumentParser(description="Propone i dati mancanti dai profili APA.")
    p.add_argument("elenco", nargs="?", default="",
                   help="il PDF dell'elenco nazionale delle acque balneari")
    p.add_argument("--spiagge", default="", help="CSV del Registro spiagge")
    p.add_argument("--uscita", default="proposte-portogallo.csv")
    p.add_argument("--prova", default="", help="cartella con elenco.txt e profilo.txt")
    p.add_argument("--profili", default="",
                   help="scarica tutti i profili e scrivi qui il CSV pubblico "
                        "(non serve il nostro elenco: gira anche su GitHub)")
    p.add_argument("--categoria", default="costeira,transicao",
                   help="quali acque leggere: costeira, transicao, interior, "
                        "tutte (a virgole). Le interne sono spiagge di fiume: "
                        "il loro profilo non porta lunghezza ne' bagnanti.")
    p.add_argument("--mostra", action="store_true",
                   help="stampa il testo del primo profilo letto, per capire "
                        "come e' scritto quando qualcosa non si estrae")
    p.add_argument("--quante", type=int, default=0,
                   help="fermati dopo N profili (per provare senza scaricarne 600)")
    args = p.parse_args()

    if args.prova:
        testo = open(os.path.join(args.prova, "elenco.txt"), encoding="utf-8").read()
    elif args.elenco:
        testo = testo_del_pdf(args.elenco)
    else:
        raise SystemExit("serve il PDF dell'elenco, o --prova")

    voci, saltate = leggi_elenco(testo)
    print("elenco APA: %d acque balneari" % len(voci))
    if saltate:
        print("   righe con un codice PT che non ho saputo leggere: %d" % len(saltate))
        for r in saltate[:5]:
            print("      · %s" % r)
    per_concelho = {}
    for v in voci:
        per_concelho.setdefault(piatto(v["concelho"]), []).append(v)
    print("   concelhos: %d" % len(per_concelho))

    volute = {piatto(x) for x in args.categoria.split(",") if x.strip()}
    if "tutte" not in volute:
        prima = len(voci)
        voci = [v for v in voci if piatto(v.get("categoria", "")) in volute]
        print("   tenute %d su %d con categoria %s"
              % (len(voci), prima, sorted(volute)))

    if args.profili:
        scrivi_profili(voci, args.profili, args.quante, args.mostra)
        return

    if not args.spiagge:
        print("\nniente CSV delle nostre spiagge: mi fermo all'elenco.")
        return

    nostre = leggi_spiagge(args.spiagge, PORTOGALLO)
    print("nostre schede portoghesi: %d" % len(nostre))

    righe, senza = [], 0
    for s in nostre:
        v, perche = abbina(s, per_concelho)
        if not v:
            senza += 1
            continue
        riga = dict(s, apa_codice=v["codice"], apa_nome=v["nome"],
                    apa_concelho=v["concelho"],
                    apa_categoria=v.get("categoria", ""), abbinata_perche=perche,
                    apa_url="", fondo="", fondo_parola="", lunghezza_m="",
                    utenti_giorno="", accesso="", fiducia="")
        righe.append((riga, v))
    print("abbinate a un'acqua balneare: %d — senza riscontro: %d"
          % (len(righe), senza))

    fatti = 0
    for riga, v in righe:
        if args.quante and fatti >= args.quante:
            break
        if args.prova:
            testo_p = open(os.path.join(args.prova, "profilo.txt"),
                           encoding="utf-8").read()
            riga["apa_url"] = "(prova)"
        else:
            testo_p = ""
            for url in indirizzi_profilo(v):
                try:
                    dati = scarica(url)
                except urllib.error.HTTPError:
                    continue
                except Exception:
                    continue
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
                    f.write(dati); tmp = f.name
                testo_p = testo_del_pdf(tmp)
                os.unlink(tmp)
                if testo_p.strip():
                    riga["apa_url"] = url
                    break
            time.sleep(PAUSA)
        if not testo_p.strip():
            continue
        riga.update(leggi_profilo(testo_p))
        quanti = sum(1 for k in ("fondo", "lunghezza_m", "utenti_giorno", "accesso")
                     if riga[k] != "")
        riga["fiducia"] = ("alta" if quanti >= 3 and
                           riga["abbinata_perche"].endswith("stesso nome")
                           else "media" if quanti >= 2 else "bassa")
        fatti += 1

    with open(args.uscita, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLONNE, extrasaction="ignore")
        w.writeheader()
        for riga, _ in righe:
            w.writerow(riga)

    print("\nprofili letti: %d" % fatti)
    for campo in ("fondo", "lunghezza_m", "utenti_giorno", "accesso"):
        print("   %-14s %d" % (campo, sum(1 for r, _ in righe if r[campo] != "")))
    print("\nscritto: %s" % args.uscita)
    print("Nessun dato e' stato messo nel database: questo foglio si guarda.")


if __name__ == "__main__":
    main()
