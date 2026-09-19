#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Il robot delle notizie di «Vado in spiaggia».

Una volta al giorno legge i feed dei giornali locali elencati in feed.json,
tiene solo gli articoli che parlano di un comune dove abbiamo una spiaggia, e
li consegna al database dalla porta stretta `carica_notizie`.

Tre cose da sapere prima di metterci le mani.

1. NON HA LA CHIAVE DEL DATABASE. Gira con la chiave pubblica del sito, quella
   che sta gia' dentro vado-dati.js e che legge il mondo, piu' un segreto suo
   (`ROBOT_NOTIZIE`) che apre due sole funzioni: l'elenco dei comuni e il
   caricamento delle notizie. Se il segreto gli viene rubato, chi lo ruba puo'
   inserire notizie. Non puo' toccare nient'altro.

2. RISPETTA IL robots.txt. Prima di leggere un feed chiede al sito se puo'.
   Se il sito dice di no, o se il suo robots.txt non si riesce a leggere, il
   giornale viene saltato e lo scrive nel resoconto. Questo non si aggira: chi
   pubblica un robots.txt sta dicendo a chi legge in automatico cosa puo'
   prendere, e su un sito che vende accessi non e' il caso di fare i furbi con
   i contenuti altrui.

3. I DOPPIONI SONO LA NORMA, non l'eccezione. Un feed contiene gli ultimi venti
   articoli, non quelli nuovi dall'ultima volta: a ogni giro la maggior parte
   di quello che arriva c'e' gia'. Ci sono tre reti, una dietro l'altra:
   l'indirizzo dell'articolo dentro al giro, l'indirizzo contro quello che c'e'
   gia' nel database (l'indice unico fa il resto), e la stessa storia
   raccontata da due giornali con due titoli diversi.

Come si prova senza toccare niente:

    python3 leggi-feed.py --prova            # legge e stampa, non carica
    python3 leggi-feed.py --cartella finti/  # legge file .xml locali, non la rete

Come gira davvero (lo fa GitHub, vedi .github/workflows/notizie.yml):

    ROBOT_NOTIZIE=... python3 leggi-feed.py
"""

import argparse
import datetime as dt
import email.utils
import glob
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from urllib.robotparser import RobotFileParser

QUI = os.path.dirname(os.path.abspath(__file__))

# La chiave pubblicabile e l'indirizzo sono gli stessi che sta usando il sito:
# non sono un segreto, stanno dentro vado-dati.js che chiunque puo' leggere.
# Il segreto vero e' uno solo, e arriva dall'ambiente.
BASE = os.environ.get("SUPABASE_URL", "https://meiurmbdotohixqawprd.supabase.co")
CHIAVE = os.environ.get("SUPABASE_ANON", "sb_publishable_T6WweLO_kXsLO57kutuAVA_VDMubUkf")
SEGRETO = os.environ.get("ROBOT_NOTIZIE", "")

CHI_SONO = "vadoinspiaggia-notizie/1.0 (+https://alegiacometti.github.io/vadoinspiaggia/)"
ATTESA = 12          # secondi prima di rinunciare a un feed:
                     # con ottanta giornali, uno lento non puo' fermare tutti
MAX_PER_COMUNE = 8   # per giro: la scheda ne mostra quattro, oltre e' rumore
GIORNI_CONFRONTO = 14  # quanto indietro guardare per riconoscere la stessa storia
MAX_ARTICOLI = 120   # quanti articoli guardare per giornale: un feed che ne
                     # sputa tremila sta dando l'archivio, non le novita'
GIORNI_FRESCHI = 30  # un articolo piu' vecchio di cosi' non entra: una spiaggia
                     # con notizie di primavera racconta una bugia


# ------------------------------------------------------------------ la rete

def apri(url, accetta="application/rss+xml, application/xml, text/xml, */*"):
    """Una GET semplice, con un nome e un limite di pazienza."""
    richiesta = urllib.request.Request(url, headers={
        "User-Agent": CHI_SONO, "Accept": accetta})
    with urllib.request.urlopen(richiesta, timeout=ATTESA) as r:
        return r.read()


def testo_di(byte):
    for come in ("utf-8", "latin-1"):
        try:
            return byte.decode(come)
        except UnicodeDecodeError:
            continue
    return byte.decode("utf-8", "replace")


ROBOTS_LETTI = {}


def posso_leggere(url):
    """Il sito permette a un robot di leggere questo indirizzo?

    Un robots.txt che non si riesce a leggere vale NO, non SI'. La libreria di
    Python, se la lettura fallisce, si comporta come se fosse permesso tutto:
    e' esattamente il contrario di quello che serve qui, quindi il file lo
    leggiamo noi e glielo diamo gia' pronto."""
    pezzi = urllib.parse.urlsplit(url)
    if pezzi.netloc in ROBOTS_LETTI:
        regole, perche = ROBOTS_LETTI[pezzi.netloc]
        if regole is None:
            return False, perche
        ok = regole.can_fetch(CHI_SONO, url) and regole.can_fetch("*", url)
        return ok, "" if ok else "il robots.txt non lo permette"
    dove = "%s://%s/robots.txt" % (pezzi.scheme, pezzi.netloc)
    try:
        righe = testo_di(apri(dove, "*/*")).splitlines()
    except urllib.error.HTTPError as e:
        # 404 = nessuna regola = nessun divieto. Tutto il resto e' un no.
        if e.code in (404, 410):
            vuoto = RobotFileParser(); vuoto.parse([])
            ROBOTS_LETTI[pezzi.netloc] = (vuoto, "")
            return True, ""
        perche = "robots.txt risponde %d" % e.code
        ROBOTS_LETTI[pezzi.netloc] = (None, perche)
        return False, perche
    except Exception as e:
        perche = "robots.txt non leggibile (%s)" % type(e).__name__
        ROBOTS_LETTI[pezzi.netloc] = (None, perche)
        return False, perche
    regole = RobotFileParser()
    regole.parse(righe)
    ROBOTS_LETTI[pezzi.netloc] = (regole, "")
    ok = regole.can_fetch(CHI_SONO, url) and regole.can_fetch("*", url)
    return ok, "" if ok else "il robots.txt non lo permette"


# --------------------------------------------------------------- i feed

# Se l'indirizzo scritto in feed.json non funziona, si provano i soliti posti
# dove i siti tengono il feed. Meta' degli errori del primo giro erano questo:
# testata viva, indirizzo sbagliato di una barra.
PERCORSI = ["/feed", "/feed/", "/rss", "/rss.xml", "/?feed=rss2", "/atom.xml"]


def indirizzi(url, esatto=False):
    if esatto:
        return [url]
    pezzi = urllib.parse.urlsplit(url)
    base = "%s://%s" % (pezzi.scheme, pezzi.netloc)
    fuori = [url]
    for q in PERCORSI:
        if base + q not in fuori:
            fuori.append(base + q)
    return fuori


# Se nessuno dei soliti indirizzi funziona, si chiede al sito stesso: ogni
# pagina che ha un feed lo dichiara nell'intestazione con un <link rel=
# "alternate" type="application/rss+xml">. E' il modo previsto dallo standard,
# ed e' come fanno i lettori di feed da vent'anni. Costa una richiesta sola, e
# solo per i giornali che hanno gia' fallito tutto il resto.
DICHIARA_FEED = re.compile(
    r"""<link[^>]+(?:type=["']application/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']"""
    r"""|href=["']([^"']+)["'][^>]*type=["']application/(?:rss|atom)\+xml["'])""",
    re.I)


def feed_dichiarati(url):
    """Gli indirizzi di feed che la pagina dichiara da se'."""
    pezzi = urllib.parse.urlsplit(url)
    casa = "%s://%s/" % (pezzi.scheme, pezzi.netloc)
    try:
        pagina = testo_di(apri(casa, "text/html"))[:400000]
    except Exception:
        return []
    fuori = []
    for m in DICHIARA_FEED.finditer(pagina):
        href = (m.group(1) or m.group(2) or "").strip()
        if not href or href.startswith("javascript:"):
            continue
        intero = urllib.parse.urljoin(casa, href.replace("&amp;", "&"))
        if intero not in fuori:
            fuori.append(intero)
    return fuori[:3]


ATOM = "{http://www.w3.org/2005/Atom}"
DC = "{http://purl.org/dc/elements/1.1/}"


def prima_data(*candidate):
    for t in candidate:
        if not t:
            continue
        t = t.strip()
        try:
            d = email.utils.parsedate_to_datetime(t)
            if d:
                return d.date()
        except Exception:
            pass
        try:
            return dt.datetime.fromisoformat(t.replace("Z", "+00:00")).date()
        except Exception:
            pass
    return None


def articoli(xml):
    """Gli articoli di un feed, RSS o Atom che sia.

    Nessuna libreria esterna: il formato e' semplice e le due forme si
    distinguono dal nome del nodo. Un feed rotto non ferma il giro."""
    fuori = []
    radice = ET.fromstring(xml.strip())

    for it in radice.iter("item"):                     # RSS
        titolo = (it.findtext("title") or "").strip()
        url = (it.findtext("link") or "").strip()
        data = prima_data(it.findtext("pubDate"), it.findtext(DC + "date"))
        if titolo and url:
            fuori.append(dict(titolo=titolo, url=url, pubblicata=data))

    for en in radice.iter(ATOM + "entry"):             # Atom
        titolo = (en.findtext(ATOM + "title") or "").strip()
        url = ""
        for a in en.findall(ATOM + "link"):
            if a.get("rel", "alternate") == "alternate":
                url = (a.get("href") or "").strip()
                break
        data = prima_data(en.findtext(ATOM + "published"),
                          en.findtext(ATOM + "updated"))
        if titolo and url:
            fuori.append(dict(titolo=titolo, url=url, pubblicata=data))

    return fuori


# ------------------------------------------------------- l'abbinamento

# Le lettere che NON si scompongono. Togliere gli accenti funziona perche' «à»
# in fondo e' «a» piu' un segno, e il segno si butta. Ma la «ħ» maltese, la «đ»
# croata, la «ø» e la «ł» sono lettere intere: nessun segno da buttare. Senza
# questa tabella «Mellieħa» sul giornale e «Mellieha» nell'elenco non si
# riconoscono, e Malta intera resterebbe senza notizie.
LETTERE_INTERE = str.maketrans({
    "\u0127": "h", "\u0126": "h",      # ħ Ħ  maltese
    "\u0111": "d", "\u0110": "d",      # đ Đ  croato, montenegrino
    "\u00f8": "o", "\u00d8": "o",      # ø Ø
    "\u0142": "l", "\u0141": "l",      # ł Ł
    "\u00fe": "th", "\u00f0": "d",     # þ ð
    "\u00df": "ss", "\u00e6": "ae", "\u0153": "oe",
    "\u0131": "i",                     # ı  senza punto
})


def piatto(t):
    """Senza accenti, senza maiuscole, con un apostrofo solo: cosi' «Sant’Elpidio»
    e «Sant'Elpidio» diventano la stessa cosa, e «Mellieħa» diventa «Mellieha»."""
    t = (t or "").lower().translate(LETTERE_INTERE)
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return t.replace("\u2019", "'").replace("\u00a0", " ")


# I pezzi di nome che i giornali lasciano cadere. «Cupra Marittima» sul
# giornale e' «Cupra», «Civitanova Marche» e' «Civitanova».
# L'ordine conta: le forme lunghe vanno provate per prime, altrimenti «mare»
# mangerebbe la fine di «Francavilla al Mare» lasciando «francavilla al».
CODE = re.compile(r"\s+(a mare|al mare|sul mare|di romagna|del tronto|"
                  r"marittima|marittimo|marina|marche|mare|"
                  r"picena|piceno|terme|adriatico|adriatica|ionica|ionico)$")
# un nome accorciato non puo' finire con una parolina: «francavilla al» non e'
# il nome di niente.
FINISCE_MALE = re.compile(r"(?:^|\s)(a|al|la|le|lo|il|i|di|del|della|sul|san|"
                          r"santa|santo|sant'|porto|lido|marina|torre)$")

# Un nome preceduto da queste parole non e' quel comune: «Ancona, auto
# vandalizzate in via Pesaro» non e' una notizia di Pesaro, e «la Provincia di
# Ancona» non e' il comune di Ancona.
PRIMA_NON_VALE = re.compile(
    r"(via|viale|piazza|piazzale|corso|largo|vicolo|lungomare|"
    r"provincia di|prefettura di|questura di|procura di|tribunale di|"
    r"diocesi di|curia di|universita di|universita' di|ospedale di|"
    r"aeroporto di|stazione di|porto di)\s+$")


def nomi_del_comune(comune, sinonimi, code=None):
    """Tutti i modi in cui quel comune puo' comparire in un titolo."""
    fuori = [comune]
    corto = (code or CODE).sub("", piatto(comune))
    if (corto and corto != piatto(comune) and len(corto) >= 5
            and not FINISCE_MALE.search(corto)):
        fuori.append(corto)
    fuori += sinonimi.get(comune, [])
    return fuori


def indice(comuni, sinonimi, mai, code=None):
    """Da «elenco di comuni» a «elenco di nomi da cercare».

    Ogni voce e' (nome appiattito, comune vero). Un nome che sta nella lista
    «mai» non entra: «Porto» da solo non e' un comune."""
    vietati = {piatto(m) for m in mai}
    fuori = []
    for c in comuni:
        for n in nomi_del_comune(c, sinonimi, code):
            n = piatto(n).strip()
            if len(n) >= 4 and n not in vietati:
                fuori.append((n, c))
    return sorted(set(fuori), key=lambda x: -len(x[0]))


def abbina(titolo, voci, prima=None):
    """Il comune di cui parla il titolo, o (None, None).

    Vince sempre il nome piu' lungo: cosi' «Porto Recanati» batte «Recanati»
    (sono due comuni diversi a dodici chilometri l'uno dall'altro) e «Cupra
    Marittima» batte «Cupra»."""
    t = piatto(titolo)
    trovati = []
    for nome, comune in voci:
        for m in re.finditer(r"(?<![\w'])" + re.escape(nome) + r"(?![\w'])", t):
            if (prima or PRIMA_NON_VALE).search(t[:m.start()]):
                continue
            trovati.append((len(nome), comune, nome))
            break
    if not trovati:
        return None, None
    trovati.sort(reverse=True)
    return trovati[0][1], trovati[0][2]


# ------------------------------------------------------- l'argomento

def regola(voci):
    """Da un elenco di parole a un setaccio.

    Le righe che cominciano con «_» sono titoletti per chi legge il file, non
    parole da cercare. La stella vuol dire «e quel che segue»: balnea* prende
    balneabile, balneazione, balneare. Senza stella la parola dev'essere
    intera, cosi' «mare» non si accende dentro «mareggiata» (che infatti e'
    scritta a parte) ne' dentro «Grottammare»."""
    pezzi = []
    for v in voci or []:
        v = piatto(v).strip()
        if not v or v.startswith("_"):
            continue
        pezzi.append(re.escape(v[:-1]) + r"\w*" if v.endswith("*") else re.escape(v))
    if not pezzi:
        return None
    return re.compile(r"(?<![\w'])(" + "|".join(pezzi) + r")(?![\w'])")


def argomento(titolo, nome_comune, tieni, mai):
    """Questo titolo parla di qualcosa che interessa a chi sta scegliendo dove
    andare al mare?

    Prima si toglie dal titolo il nome del comune, altrimenti «Francavilla al
    Mare» passerebbe sempre per via di quel «Mare» che e' solo un pezzo del
    nome del paese, non l'argomento dell'articolo.

    Poi due setacci, in quest'ordine: il veto vince sempre sul via libera.
    «Mareggiata, un ferito sul lungomare» parla di mare ed e' cronaca: fuori."""
    t = piatto(titolo)
    if nome_comune:
        t = re.sub(r"(?<![\w'])" + re.escape(piatto(nome_comune)) + r"(?![\w'])", " ", t)
    if mai:
        m = mai.search(t)
        if m:
            return False, "«%s»" % m.group(0)
    if tieni:
        m = tieni.search(t)
        if not m:
            return False, "non parla di mare, meteo o eventi"
        return True, m.group(0)
    return True, ""


# --------------------------------------------------------------- le lingue

def coda_regex(voci):
    """I pezzi di nome che cadono: «-sur-Mer», «de Mar», «Marittima»."""
    pezzi = sorted((piatto(v) for v in voci or [] if v), key=len, reverse=True)
    if not pezzi:
        return re.compile(r"(?!)")          # non combacia mai
    return re.compile(r"[\s-]+(" + "|".join(re.escape(x) for x in pezzi) + r")$")


def prima_regex(voci):
    """Le parole che, se stanno davanti a un nome, lo annullano: «rue Nice»
    non e' Nizza, «calle Malaga» non e' Malaga."""
    pezzi = sorted((piatto(v) for v in voci or [] if v), key=len, reverse=True)
    if not pezzi:
        return re.compile(r"(?!)")
    return re.compile(r"(" + "|".join(re.escape(x) for x in pezzi) + r")[\s'-]+$")


def regole_lingue(conf, dove):
    """Un setaccio per lingua. L'italiano sta in feed.json (si tocca spesso);
    le altre lingue in lingue.json, accanto."""
    arg = conf.get("argomenti", {})
    fuori = {"it": dict(tieni=regola(arg.get("tieni")), mai=regola(arg.get("mai")),
                        code=CODE, prima=PRIMA_NON_VALE)}
    percorso = os.path.join(os.path.dirname(os.path.abspath(dove)), "lingue.json")
    if not os.path.exists(percorso):
        percorso = os.path.join(QUI, "lingue.json")
    if os.path.exists(percorso):
        with open(percorso, encoding="utf-8") as f:
            altre = json.load(f)
        for lingua, v in altre.items():
            if lingua.startswith("_") or not isinstance(v, dict):
                continue
            fuori[lingua] = dict(tieni=regola(v.get("tieni")),
                                 mai=regola(v.get("mai")),
                                 code=coda_regex(v.get("code")),
                                 prima=prima_regex(v.get("prima")))
    return fuori


# ------------------------------------------------------------ i doppioni

PAROLINE = set("""il lo la i gli le un uno una di a da in con su per tra fra
del della dello dei degli delle dal dalla al alla allo ai agli alle nel nella
nello nei negli nelle sul sulla sullo sui sugli sulle e ed o od ma se che chi
cui non piu' piu si ci vi ne come dove quando anche ancora dopo prima contro
verso fino ecco tutto tutti tutte questa questo queste questi""".split())


def impronta(titolo):
    """Le parole che contano di un titolo.

    «Cupra, cocaina nel marsupio» e «Cupra Marittima, nel marsupio 12 dosi di
    cocaina» sono lo stesso arresto raccontato due volte: le parole in comune
    lo dicono, l'ordine no."""
    parole = re.findall(r"[a-z0-9']{3,}", piatto(titolo))
    return frozenset(p for p in parole if p not in PAROLINE)


def stessa_storia(a, b):
    if not a or not b:
        return False
    comuni = len(a & b)
    return comuni >= 3 and comuni >= 0.6 * min(len(a), len(b))


# ------------------------------------------------------------ il database

def chiama(percorso, corpo=None, metodo="POST"):
    url = BASE.rstrip("/") + "/rest/v1/" + percorso
    dati = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    r = urllib.request.Request(url, data=dati, method=metodo, headers={
        "apikey": CHIAVE, "Authorization": "Bearer " + CHIAVE,
        "Content-Type": "application/json", "Accept": "application/json",
        "User-Agent": CHI_SONO})
    try:
        with urllib.request.urlopen(r, timeout=ATTESA) as risposta:
            grezzo = risposta.read().decode("utf-8") or "null"
            return json.loads(grezzo)
    except urllib.error.HTTPError as e:
        raise SystemExit("il database ha risposto %d: %s"
                         % (e.code, testo_di(e.read())[:400]))


def comuni_delle_regioni(regioni):
    righe = chiama("rpc/comuni_notizie",
                   {"p_segreto": SEGRETO, "p_regioni": sorted(regioni)})
    per_regione = {}
    for r in righe or []:
        per_regione.setdefault(r["regione"], []).append(r["comune"])
    return per_regione


def gia_dentro():
    """Titoli e indirizzi delle notizie recenti gia' caricate, per non
    riproporre la stessa storia con un titolo diverso. La tabella si legge in
    chiaro: non serve nessun segreto per questo."""
    da = (dt.date.today() - dt.timedelta(days=GIORNI_CONFRONTO)).isoformat()
    righe = chiama("notizie?select=comune,titolo,url&pubblicata=gte." + da,
                   metodo="GET") or []
    return righe


# ------------------------------------------------------------------ il giro

def carica_config(percorso):
    """La configurazione, con le regole prese da feed.json se il file non le ha.

    Serve alla prova: finti/feed-di-prova.json elenca solo i giornali finti e i
    comuni finti, e le regole vere — sinonimi, argomenti, parole vietate — se
    le fa prestare da feed.json. Cosi' la prova controlla le regole VERE, non
    una loro copia invecchiata."""
    with open(percorso, encoding="utf-8") as f:
        conf = json.load(f)
    vero = os.path.join(QUI, "feed.json")
    if os.path.abspath(percorso) != os.path.abspath(vero) and os.path.exists(vero):
        with open(vero, encoding="utf-8") as f:
            base = json.load(f)
        for chiave in ("sinonimi", "mai_comuni", "argomenti"):
            conf.setdefault(chiave, base.get(chiave, {}))
    return conf


def prendi_feed(giornale, cartella):
    """Il testo del feed, e l'indirizzo che ha funzionato davvero.

    In prova legge un file locale che si chiama come il giornale, tutto
    minuscolo e con i trattini: «Senigallia Notizie» -> senigallia-notizie.xml

    Dalla rete prova l'indirizzo scritto in feed.json e, se non va, i soliti
    posti dove i siti tengono il feed. Si ferma al primo che restituisce
    davvero degli articoli: un indirizzo che risponde ma non e' un feed non
    conta come risposta."""
    if cartella:
        nome = re.sub(r"[^a-z0-9]+", "-", piatto(giornale["nome"])).strip("-")
        dove = os.path.join(cartella, nome + ".xml")
        if not os.path.exists(dove):
            return "", "", "manca il file di prova %s" % os.path.basename(dove)
        with open(dove, encoding="utf-8") as h:
            return h.read(), dove, ""

    ultimo = "non risponde"
    for url in indirizzi(giornale["url"], giornale.get("esatto")):
        ok, perche = posso_leggere(url)
        if not ok:
            return "", "", perche          # il robots.txt vale per tutto il sito
        try:
            xml = testo_di(apri(url))
        except urllib.error.HTTPError as e:
            # 404 = indirizzo sbagliato, si prova il prossimo.
            # 403 = il sito non vuole essere letto in automatico: e' un no
            # detto in un altro modo, e vale come il robots.txt.
            ultimo = "il sito risponde %d" % e.code
            if e.code in (401, 403, 429):
                return "", "", ultimo + " (non ci vuole)"
            continue
        except Exception as e:
            ultimo = "non risponde (%s)" % type(e).__name__
            continue
        try:
            if articoli(xml):
                return xml, url, ""
            ultimo = "feed vuoto"
        except ET.ParseError:
            ultimo = "non e' un feed"

    # nessuno dei soliti posti: si chiede alla pagina dove tiene il feed
    if not giornale.get("esatto"):
        for url in feed_dichiarati(giornale["url"]):
            ok, perche = posso_leggere(url)
            if not ok:
                return "", "", perche
            try:
                xml = testo_di(apri(url))
                if articoli(xml):
                    return xml, url, ""
            except Exception:
                continue
    return "", "", ultimo


def main():
    p = argparse.ArgumentParser(description="Legge i feed e carica le notizie.")
    p.add_argument("--prova", action="store_true",
                   help="legge e stampa, ma non carica niente nel database")
    p.add_argument("--cartella", default="",
                   help="legge file .xml da una cartella invece che dalla rete")
    p.add_argument("--tutto", action="store_true",
                   help="non filtrare per argomento: tiene anche cronaca e sport")
    p.add_argument("--config", default=os.path.join(QUI, "feed.json"))
    args = p.parse_args()

    conf = carica_config(args.config)
    sinonimi = conf.get("sinonimi", {})
    mai_comuni = conf.get("mai_comuni", [])
    arg = conf.get("argomenti", {})
    filtra = arg.get("filtro", True) and not args.tutto
    LINGUE = regole_lingue(conf, args.config)
    regioni = sorted({r for g in conf["giornali"] for r in g["regioni"]})

    if not SEGRETO and not args.cartella:
        raise SystemExit("manca ROBOT_NOTIZIE nell'ambiente: senza segreto il "
                         "database non apre. Vedi COME-SI-ACCENDONO-LE-NOTIZIE.md")

    # 1. di quali comuni possiamo parlare
    if args.cartella:
        per_regione = conf.get("_comuni_di_prova", {})
    else:
        per_regione = comuni_delle_regioni(regioni)
    quanti = sum(len(v) for v in per_regione.values())
    print("comuni con spiaggia nelle regioni dichiarate: %d" % quanti)
    for r in sorted(per_regione):
        print("   %-16s %d" % (r, len(per_regione[r])))

    # 2. leggere i giornali
    raccolti, saltati, scartati_tema, tabella = [], [], [], []
    if filtra:
        print("\nfiltro per argomento: ACCESO (meteo, mare, spiaggia, eventi)"
              " — lingue: %s" % ", ".join(sorted(LINGUE)))
    else:
        print("\nfiltro per argomento: spento — entra tutto, cronaca compresa")
    vecchie_via = 0
    limite = dt.date.today() - dt.timedelta(days=GIORNI_FRESCHI)
    for g in conf["giornali"]:
        xml, usato, perche = prendi_feed(g, args.cartella)
        if not xml:
            saltati.append((g["nome"], perche))
            tabella.append((g["nome"], g["regioni"], 0, 0, 0, perche))
            print("   - %-26s saltato: %s" % (g["nome"], perche))
            continue
        try:
            letti = articoli(xml)
        except ET.ParseError:
            saltati.append((g["nome"], "non e' un feed"))
            tabella.append((g["nome"], g["regioni"], 0, 0, 0, "non e' un feed"))
            print("   - %-26s non e' un feed" % g["nome"])
            continue
        # Un feed che restituisce tremila articoli sta dando l'archivio, non le
        # novita': si guardano i primi, che sono i piu' recenti, e si buttano
        # quelli vecchi. Senza questo, a ogni giro si rileggono anni di roba e
        # nelle schede finiscono notizie di primavera.
        letti = letti[:MAX_ARTICOLI]
        prima = len(letti)
        letti = [a for a in letti
                 if a["pubblicata"] is None or a["pubblicata"] >= limite]
        vecchie_via += prima - len(letti)

        # Ogni giornale porta la sua lingua: cambiano le parole del filtro, i
        # pezzi di nome che cadono e le parole che annullano un nome.
        lingua = g.get("lingua", "it")
        reg = LINGUE.get(lingua) or LINGUE["it"]
        tieni = reg["tieni"] if filtra else None
        vietate = reg["mai"] if filtra else None
        voci = indice(sorted({c for r in g["regioni"]
                              for c in per_regione.get(r, [])}),
                      sinonimi, mai_comuni, reg["code"])
        presi = fuori_tema = 0
        for a in letti:
            comune, con = abbina(a["titolo"], voci, reg["prima"])
            if not comune:
                continue
            ok, perche_no = argomento(a["titolo"], con, tieni, vietate)
            if not ok:
                fuori_tema += 1
                scartati_tema.append((a["titolo"], comune, perche_no))
                continue
            a.update(comune=comune, con=con, fonte=g["nome"], perche=perche_no)
            raccolti.append(a)
            presi += 1
        tabella.append((g["nome"], g["regioni"], len(letti),
                        presi + fuori_tema, presi, ""))
        diverso = "" if usato == g["url"] else "   -> %s" % usato
        print("   + %-26s %3d recenti, %2d del posto, %2d in tema%s"
              % (g["nome"], len(letti), presi + fuori_tema, presi, diverso))

    # 3. le tre reti contro i doppioni
    vecchie = [] if args.cartella else gia_dentro()
    viste_url = {v["url"] for v in vecchie}
    impronte = {}
    for v in vecchie:
        impronte.setdefault(v["comune"], []).append(impronta(v["titolo"]))

    raccolti.sort(key=lambda a: a["pubblicata"] or dt.date.min, reverse=True)
    buoni, per_comune = [], {}
    for a in raccolti:
        if a["url"] in viste_url:
            continue
        imp = impronta(a["titolo"])
        if any(stessa_storia(imp, altra) for altra in impronte.get(a["comune"], [])):
            continue
        if per_comune.get(a["comune"], 0) >= MAX_PER_COMUNE:
            continue
        viste_url.add(a["url"])
        impronte.setdefault(a["comune"], []).append(imp)
        per_comune[a["comune"]] = per_comune.get(a["comune"], 0) + 1
        buoni.append(a)

    if vecchie_via:
        print("\narticoli piu' vecchi di %d giorni, lasciati stare: %d"
              % (GIORNI_FRESCHI, vecchie_via))

    if scartati_tema:
        print("\nfuori tema, non caricate (%d):" % len(scartati_tema))
        for titolo, comune, perche_no in scartati_tema[:12]:
            print("   - %-58s %s" % (titolo[:58], perche_no))
        if len(scartati_tema) > 12:
            print("   - ... e altre %d" % (len(scartati_tema) - 12))

    print("\nin tema: %d — nuove dopo i doppioni: %d" % (len(raccolti), len(buoni)))
    for c in sorted(per_comune, key=lambda x: -per_comune[x]):
        print("   %-28s %d" % (c, per_comune[c]))
        for a in buoni:
            if a["comune"] == c:
                segno = "" if piatto(a["con"]) == piatto(c) else " [da «%s»]" % a["con"]
                tema = "  (%s)" % a["perche"] if a.get("perche") else ""
                print("      · %s%s%s" % (a["titolo"][:66], segno, tema))

    # La tabella e' il motivo per cui questo giro si guarda a occhio: dice quali
    # giornali vale la pena tenere e quali sono solo attesa sprecata.
    print("\n--- i giornali, uno per uno " + "-" * 44)
    print("%-28s %-14s %5s %5s %5s  %s"
          % ("giornale", "regione", "rec.", "posto", "tema", "problema"))
    for nome, reg, letti, posto, tema, problema in sorted(
            tabella, key=lambda r: (-r[4], -r[3], r[0])):
        print("%-28s %-14s %5d %5d %5d  %s"
              % (nome[:28], reg[0][:14], letti, posto, tema, problema))
    muti = [t[0] for t in tabella if t[5]]
    if muti:
        print("\nnon hanno dato niente (%d): %s" % (len(muti), ", ".join(muti)))
        print("togli dal feed.json quelli che sbagliano due giri di fila.")

    if not buoni:
        print("\nniente di nuovo: e' il caso normale quando gira ogni giorno.")
        return

    righe = [dict(comune=a["comune"], titolo=a["titolo"][:300], fonte=a["fonte"],
                  url=a["url"],
                  pubblicata=(a["pubblicata"] or dt.date.today()).isoformat())
             for a in buoni]

    if args.prova or args.cartella:
        print("\n--prova: non carico niente. Avrei mandato %d righe:" % len(righe))
        print(json.dumps(righe[:3], ensure_ascii=False, indent=1))
        return

    # 4. la consegna
    quante = chiama("rpc/carica_notizie", {"p_segreto": SEGRETO, "p_righe": righe})
    print("\ncaricate davvero: %s" % quante)


if __name__ == "__main__":
    main()
