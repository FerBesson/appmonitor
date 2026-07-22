import os
import json
import shutil
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACCIONES_PATH = os.path.join(BASE_DIR, 'datos', 'acciones.json')
CEDEARS_PATH = os.path.join(BASE_DIR, 'datos', 'cedears.json')
LOGOS_DIR = os.path.join(os.path.dirname(BASE_DIR), 'frontend', 'assets', 'logos')

os.makedirs(LOGOS_DIR, exist_ok=True)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

# Domain mapping for local Argentine stocks and special tickers
LOCAL_DOMAINS = {
    'GGAL': 'grupofinancierogalicia.com.ar',
    'YPFD': 'ypf.com',
    'YPF': 'ypf.com',
    'PAMP': 'pampaenergia.com',
    'ALUA': 'aluar.com.ar',
    'BMA': 'bancomacro.com.ar',
    'EDN': 'edenor.com.ar',
    'EDSH': 'edenor.com.ar',
    'SUPV': 'gruposupervielle.com',
    'VALO': 'bancovalores.com.ar',
    'TXAR': 'ternium.com',
    'CRES': 'cresud.com.ar',
    'CEPU': 'centralpuerto.com',
    'MIRG': 'mirgor.com.ar',
    'METR': 'metrogas.com.ar',
    'TGN4': 'tgn.com.ar',
    'TGNO4': 'tgn.com.ar',
    'TGSU2': 'tgs.com.ar',
    'TGS': 'tgs.com.ar',
    'TRAN': 'transener.com.ar',
    'REGE': 'transener.com.ar',
    'LOMA': 'lomanegra.com',
    'MOLI': 'molinos.com.ar',
    'MOLA': 'molinos.com.ar',
    'AGRO': 'agrometal.com',
    'COME': 'comercialdelplata.com',
    'BYMA': 'byma.com.ar',
    'BHIP': 'hipotecario.com.ar',
    'BPAT': 'bancopatagonia.com.ar',
    'TECO2': 'telecom.com.ar',
    'CVH': 'cablevisionholding.com.ar',
    'CECO2': 'centralcostanera.com.ar',
    'HAVA': 'havanna.com.ar',
    'CAPX': 'capex.com.ar',
    'CTIO': 'consultatio.com.ar',
    'FERR': 'ferrum.com.ar',
    'HARG': 'holcim.com.ar',
    'MORI': 'morixe.com.ar',
    'RICH': 'richmond.com.ar',
    'SEMI': 'semino.com.ar',
    'LONG': 'longvie.com',
    'AUSO': 'ausol.com.ar',
    'IRSA': 'irsa.com.ar',
    'LEDE': 'ledesma.com.ar',
    'GCDI': 'gcdi.com.ar',
    'GCLA': 'grupoclarin.com.ar',
    'DGCU2': 'dgcu.com.ar',
    'CGPA2': 'camuzzigas.com.ar',
    'OEST': 'grupoconcesionario.com.ar',
    'INVJ': 'invertironline.com',
    'IEB': 'iebonline.com.ar',
    'GAMI': 'garovaglio.com.ar',
    'BRKB': 'berkshirehathaway.com',
    'BRK.B': 'berkshirehathaway.com',
    'GRIM': 'grimoldi.com',
    'MRVL': 'marvell.com',
    'HOOD': 'robinhood.com',
    'DISN': 'disney.com',
    'HLD': 'heico.com',
    'PETR3': 'petrobras.com.br',
    'VALE3': 'vale.com',
    'ITUB3': 'itau.com.br',
    'BBDC3': 'bradesco.com.br',
    'WEGE3': 'weg.net',
    'ABEV3': 'ambev.com.br',
    'RENT3': 'localiza.com',
    'TIMS3': 'tim.com.br',
    'VIVT3': 'vivo.com.br',
    'BBAS3': 'bb.com.br',
    'CSNA3': 'csn.com.br',
    'HAPV3': 'hapvida.com.br',
    'LREN3': 'lojasrenner.com.br',
    'MGLU3': 'magazineluiza.com.br',
    'NATU3': 'natura.com.br',
    'PRIO3': 'prio3.com.br',
    'SBSP3': 'sabesp.com.br',
    'SUZB3': 'suzano.com.br',
    'AKO.B': 'koandina.com',
    'XROX': 'xerox.com',
    'EMBJ': 'embraer.com'
}

ALIAS_MAP = {
    'ABEV3': 'ABEV',
    'ADGO': 'ADGOC',
    'ADGOD': 'ADGOC',
    'AKOBD': 'AKO.B',
    'GOGLD': 'GOOGL',
    'GOGLC': 'GOOGL',
    'GOGL': 'GOOGL',
    'B.C': 'B',
    'B.D': 'B',
    'BA.C': 'BA',
    'BA.CC': 'BA',
    'BA.CD': 'BA',
    'BAD': 'BA',
    'BB.D': 'BB',
    'BBV': 'BBAR',
    'BMA.D': 'BMA',
    'BPA11': 'BPAT',
    'BPD': 'BP',
    'BRKBC': 'BRKB',
    'BRKBD': 'BRKB',
    'BXD': 'BX',
    'C.D': 'C',
    'CAR.C': 'CAR',
    'CAR.D': 'CAR',
    'CRWDD': 'CRWD',
    'CXD': 'CX',
    'CVHD': 'CVH',
    'DED': 'DE',
    'GMD': 'GM',
    'HDD': 'HD',
    'HOODD': 'HOOD',
    'IPD': 'IP',
    'KOC': 'KO',
    'MOC': 'MO',
    'MRVLD': 'MRVL',
    'NUD': 'NU',
    'SEC': 'SE',
    'TGN4D': 'TGN4',
    'TGNO4': 'TGN4',
    'TXR': 'TX',
    'VAL3D': 'VALE3',
    'VD': 'V',
    'VZD': 'VZ',
    'XPC': 'XP',
    'XROXD': 'XROX',
    'ZMC': 'ZM',
    'ZMD': 'ZM'
}

def fetch_url(url, timeout=5):
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                data = resp.read()
                if len(data) > 100:
                    return data
    except Exception:
        pass
    return None

def get_base_ticker(ticker):
    t = ticker.upper()
    if t in ALIAS_MAP:
        return ALIAS_MAP[t]
    if t in LOCAL_DOMAINS:
        return t
    if len(t) > 3:
        if t.endswith('D') and not t.startswith('USD_'):
            base = t[:-1]
            if base.endswith('D'): base = base[:-1]
            return base
        if t.endswith('C') and not t.startswith('USD_'):
            return t[:-1]
    return t

def save_data(ticker, data):
    is_svg = b'<svg' in data[:40].lower() or b'<?xml' in data[:40].lower() or b'<!doctype svg' in data[:40].lower()
    ext = '.svg' if is_svg else '.png'
    dest_path = os.path.join(LOGOS_DIR, f"{ticker}{ext}")
    with open(dest_path, 'wb') as f:
        f.write(data)
    # Also save as .png for backwards fallback if svg
    if is_svg:
        png_dest = os.path.join(LOGOS_DIR, f"{ticker}.png")
        with open(png_dest, 'wb') as f:
            f.write(data)

def download_logo_for_ticker(ticker):
    ticker = ticker.strip().upper()
    if not ticker:
        return

    base_ticker = get_base_ticker(ticker)
    
    # Check if files already exist
    svg_exists = os.path.exists(os.path.join(LOGOS_DIR, f"{ticker}.svg"))
    png_exists = os.path.exists(os.path.join(LOGOS_DIR, f"{ticker}.png"))
    if svg_exists or png_exists:
        return

    base_svg = os.path.join(LOGOS_DIR, f"{base_ticker}.svg")
    base_png = os.path.join(LOGOS_DIR, f"{base_ticker}.png")
    
    if os.path.exists(base_svg):
        shutil.copyfile(base_svg, os.path.join(LOGOS_DIR, f"{ticker}.svg"))
        if not os.path.exists(os.path.join(LOGOS_DIR, f"{ticker}.png")):
            shutil.copyfile(base_svg, os.path.join(LOGOS_DIR, f"{ticker}.png"))
        print(f"[COPY SVG] {ticker} from {base_ticker}")
        return

    if os.path.exists(base_png):
        shutil.copyfile(base_png, os.path.join(LOGOS_DIR, f"{ticker}.png"))
        print(f"[COPY PNG] {ticker} from {base_ticker}")
        return

    data = None
    target = base_ticker if base_ticker in LOCAL_DOMAINS else ticker
    
    if target in LOCAL_DOMAINS:
        domain = LOCAL_DOMAINS[target]
        data = fetch_url(f"https://logo.clearbit.com/{domain}")
        if not data:
            data = fetch_url(f"https://www.google.com/s2/favicons?domain={domain}&sz=128")

    if not data:
        data = fetch_url(f"https://assets.parqet.com/logos/symbol/{base_ticker}")

    if not data:
        data = fetch_url(f"https://logo.clearbit.com/{base_ticker.lower()}.com")

    if not data:
        data = fetch_url(f"https://www.google.com/s2/favicons?domain={base_ticker.lower()}.com&sz=128")

    if data:
        save_data(ticker, data)
        if base_ticker != ticker:
            save_data(base_ticker, data)
        print(f"[OK] Downloaded logo for {ticker}")
    else:
        print(f"[SKIP] No logo found for {ticker}")

def main():
    items_set = set()
    
    if os.path.exists(ACCIONES_PATH):
        with open(ACCIONES_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for item in data.get('acciones', []):
                t = item.get('ticker', '').strip().upper()
                if t: items_set.add(t)

    if os.path.exists(CEDEARS_PATH):
        with open(CEDEARS_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for item in data.get('cedears', []):
                t = item.get('ticker', '').strip().upper()
                if t: items_set.add(t)

    tickers = sorted(list(items_set))
    print(f"Total unique tickers to process: {len(tickers)}")

    base_tickers = sorted(list(set(get_base_ticker(t) for t in tickers)))
    with ThreadPoolExecutor(max_workers=15) as executor:
        executor.map(download_logo_for_ticker, base_tickers)

    with ThreadPoolExecutor(max_workers=15) as executor:
        executor.map(download_logo_for_ticker, tickers)

    print(f"Logos process completed. Directory: {LOGOS_DIR}")

if __name__ == '__main__':
    main()
