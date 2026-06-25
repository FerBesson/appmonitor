import os
import json
import asyncio
from datetime import datetime
from backend.config import ACCIONES_JSON_PATH, DATOS_DIR, UPDATE_INTERVAL_SECONDS
from backend.services.data912_client import data912_client
from backend.models import AssetQuote

MERVAL_LIDER_TICKERS = {
    "ALUA", "BBAR", "BMA", "BYMA", "CEPU", "COME", "CRES", "ECOG", "EDN", "GGAL",
    "LOMA", "METR", "PAMP", "SUPV", "TGNO4", "TGSU2", "TRAN", "TXAR", "VALO", "YPFD"
}

MERVAL_LIDER_NAMES = {
    "ALUA": "Aluar",
    "BBAR": "Banco BBVA Argentina",
    "BMA": "Banco Macro",
    "BYMA": "Bolsas y Mercados Argentinos",
    "CEPU": "Central Puerto",
    "COME": "Grupo Comercial del Plata",
    "CRES": "Cresud",
    "ECOG": "Distribuidora de Gas Cuyana",
    "EDN": "Edenor",
    "GGAL": "Grupo Financiero Galicia",
    "LOMA": "Loma Negra",
    "METR": "Metrogas",
    "PAMP": "Pampa Energía",
    "SUPV": "Banco Supervielle",
    "TGNO4": "Transportadora de Gas del Norte",
    "TGSU2": "Transportadora de Gas del Sur",
    "TRAN": "Transener",
    "TXAR": "Ternium Argentina",
    "VALO": "Grupo Financiero Valores",
    "YPFD": "YPF"
}

SECONDARY_NAMES = {
    "AGRO": "Agrometal",
    "AUSO": "Autopistas del Sol",
    "BHIP": "Banco Hipotecario",
    "BOLT": "Boldt",
    "BPAT": "Banco Patagonia",
    "CADO": "Carlos Casado",
    "CAPX": "Capex",
    "CARC": "Carboclor",
    "CELU": "Celulosa Argentina",
    "CGPA2": "Camuzzi Gas Pampeana",
    "CTIO": "Consultatio",
    "DGCU2": "Distribuidora de Gas del Centro",
    "FERR": "Ferrum",
    "FIPL": "Fiplasto",
    "GAMI": "Garovaglio y Zorraquín",
    "HAVA": "Havanna",
    "IRSA": "IRSA",
    "LEDE": "Ledesma",
    "LONG": "Longvie",
    "MOLA": "Molinos Agro",
    "MOLI": "Molinos Río de la Plata",
    "MORI": "Morixe Hermanos",
    "OEST": "Grupo Concesionario del Oeste",
    "RICH": "Laboratorios Richmond",
    "RIGO": "Rigolleau",
    "SAMI": "San Miguel",
    "SEMI": "Molinos Juan Semino"
}

STOCK_NAMES = {**MERVAL_LIDER_NAMES, **SECONDARY_NAMES}

def get_base_ticker(ticker: str) -> str:
    t = ticker.upper()
    if t == "YPFD":
        return "YPFD"
    
    if t.endswith("DD") or t.endswith(".D"):
        base = t[:-2]
    elif t.endswith("D"):
        base = t[:-1]
    else:
        base = t
        
    if base == "TGN4":
        return "TGNO4"
    if base == "TGSU":
        return "TGSU2"
    if base == "YPF":
        return "YPFD"
    return base

def get_company_name(ticker: str) -> str:
    base = get_base_ticker(ticker)
    return STOCK_NAMES.get(base, "")

def _get_float(item: dict, keys: list, default: float = 0.0) -> float:
    for k in keys:
        if k in item and item[k] is not None:
            try:
                return float(item[k])
            except (ValueError, TypeError):
                continue
    return default

def _get_str(item: dict, keys: list, default: str = "") -> str:
    for k in keys:
        if k in item and item[k] is not None:
            return str(item[k]).strip()
    return default

def parse_stocks_raw(raw_list: list) -> list:
    quotes = []
    if not isinstance(raw_list, list):
        return quotes
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        ticker = _get_str(item, ["symbol", "ticker", "s", "codigo"], "")
        if not ticker:
            continue
        price = _get_float(item, ["c", "price", "last", "close", "p"], 0.0)
        change_pct = _get_float(item, ["pct_change", "change_pct", "dr", "var", "variacion"], 0.0)
        volume = _get_float(item, ["v", "volume", "vol", "volumen"], 0.0)
        high = _get_float(item, ["h", "high", "max"], None)
        low = _get_float(item, ["l", "low", "min"], None)
        open_p = _get_float(item, ["o", "open", "apertura"], None)

        t_upper = ticker.upper()
        base_t = get_base_ticker(ticker)
        
        # Classification by panel (depends on base ticker)
        panel = "lider" if base_t in MERVAL_LIDER_TICKERS else "general"
        
        # Classification by currency
        is_usd = (t_upper == "YPFDD" or (t_upper.endswith("D") and t_upper != "YPFD") or t_upper.endswith(".D"))
        currency = "USD" if is_usd else "ARS"

        # Resolving company name
        name = get_company_name(ticker)

        quotes.append(AssetQuote(
            ticker=ticker,
            price=price,
            change_pct=change_pct,
            volume=volume,
            high=high,
            low=low,
            open=open_p,
            name=name,
            panel=panel,
            currency=currency
        ).model_dump())
    return quotes

async def fetch_and_save_market_data():
    """Consulta la API de Data912 y guarda únicamente las acciones en backend/datos/acciones.json"""
    try:
        stocks_raw = await data912_client.get_arg_stocks()
        stocks_dump = parse_stocks_raw(stocks_raw)

        os.makedirs(DATOS_DIR, exist_ok=True)

        payload = {
            "updated_at": datetime.now().isoformat(),
            "acciones": stocks_dump
        }

        def save_file():
            temp_path = ACCIONES_JSON_PATH + ".tmp"
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            os.replace(temp_path, ACCIONES_JSON_PATH)

        await asyncio.to_thread(save_file)

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Datos guardados exitosamente en datos/acciones.json ({len(stocks_dump)} acciones)")
        return payload
    except Exception as e:
        print(f"Error en actualización periódica: {e}")
        return None

async def precache_historical_data():
    """Recorre todas las acciones (líderes primero, luego general) y precarga su historial si no está actualizado (de hoy)"""
    from backend.services.analytics import get_stock_history_processed, load_stored_data
    from backend.config import HISTORIAL_DIR
    import os
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Iniciando precarga de datos históricos en segundo plano...")
    
    # Obtener todos los tickers clasificados para priorizar líderes
    try:
        stored = await asyncio.to_thread(load_stored_data)
        acciones = stored.get("acciones", [])
        
        lider_tickers = [a["ticker"] for a in acciones if a.get("panel") == "lider"]
        general_tickers = [a["ticker"] for a in acciones if a.get("panel") != "lider"]
        
        if not lider_tickers:
            lider_tickers = list(MERVAL_LIDER_TICKERS)
            
        tickers_to_precache = lider_tickers + general_tickers
    except Exception:
        tickers_to_precache = list(MERVAL_LIDER_TICKERS)
        
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Se precargarán {len(tickers_to_precache)} tickers (líderes primero).")
    
    for ticker in tickers_to_precache:
        filepath = os.path.join(HISTORIAL_DIR, f"{ticker}.json")
        is_up_to_date = False
        
        # Verificar que el archivo exista, no esté vacío (>10 bytes) y sea de hoy
        if os.path.exists(filepath) and os.path.getsize(filepath) > 10:
            try:
                mtime = os.path.getmtime(filepath)
                if datetime.fromtimestamp(mtime).date() == datetime.today().date():
                    is_up_to_date = True
            except Exception:
                pass
                
        if not is_up_to_date:
            try:
                await get_stock_history_processed(ticker)
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Precargado historial para {ticker}")
                await asyncio.sleep(1.5)
            except Exception as e:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Error precargando {ticker}: {e}")
                await asyncio.sleep(1.5)
                
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Fin de la precarga de datos históricos.")

async def start_background_updater():
    """Bucle infinito que actualiza datos cada 30 segundos"""
    await fetch_and_save_market_data()
    # Lanzar la precarga en segundo plano
    asyncio.create_task(precache_historical_data())
    while True:
        await asyncio.sleep(UPDATE_INTERVAL_SECONDS)
        await fetch_and_save_market_data()
