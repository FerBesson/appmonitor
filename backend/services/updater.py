import os
import json
import asyncio
from datetime import datetime, timedelta
from backend.config import ACCIONES_JSON_PATH, CEDEARS_JSON_PATH, DOLARES_JSON_PATH, MERVAL_CCL_JSON_PATH, DATOS_DIR, UPDATE_INTERVAL_SECONDS
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
    if base == "TECO":
        return "TECO2"
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

def parse_cedears_raw(raw_list: list) -> list:
    quotes = []
    if not isinstance(raw_list, list):
        return quotes

    # Registrar todos los símbolos presentes en la respuesta para distinguir los base de sus variantes
    all_symbols = set()
    for item in raw_list:
        if isinstance(item, dict):
            sym = _get_str(item, ["symbol", "ticker", "s", "codigo"], "").upper()
            if sym:
                all_symbols.add(sym)

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
        
        # Clasificación de moneda inteligente
        currency = "ARS"
        if t_upper.endswith("C"):
            base = t_upper[:-1]
            if base in all_symbols:
                currency = "USDC"
        elif t_upper.endswith("D"):
            base = t_upper[:-1]
            if base in all_symbols:
                currency = "USD"

        panel = "cedear"
        name = f"CEDEAR {ticker}"

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

_dolar_history_cache = None
_dolar_cache_time = None

async def get_cached_dolar_history():
    global _dolar_history_cache, _dolar_cache_time
    now = datetime.now()
    # Cache de 1 hora (3600 segundos) para el historial pesado
    if _dolar_history_cache is not None and _dolar_cache_time is not None:
        if (now - _dolar_cache_time).total_seconds() < 3600:
            return _dolar_history_cache
            
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get("https://api.argentinadatos.com/v1/cotizaciones/dolares", timeout=15.0)
            if response.status_code == 200:
                _dolar_history_cache = response.json()
                _dolar_cache_time = now
                return _dolar_history_cache
    except Exception as e:
        print(f"Error obteniendo histórico de ArgentinaDatos: {e}")
        
    return _dolar_history_cache

async def get_latest_dolar_quotes():
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("https://dolarapi.com/v1/dolares", timeout=5.0)
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        print(f"Error obteniendo cotizaciones del día de DolarApi: {e}")
    return None

async def fetch_and_save_market_data():
    """Consulta la API de Data912 y guarda acciones y cedears"""
    try:
        stocks_raw = await data912_client.get_arg_stocks()
        stocks_dump = parse_stocks_raw(stocks_raw)

        cedears_raw = await data912_client.get_arg_cedears()
        cedears_dump = parse_cedears_raw(cedears_raw)

        # Obtener cotizaciones de dólares
        dolar_assets = []
        try:
            # 1. Obtener histórico de ArgentinaDatos (usando caché) para la variación diaria
            dolar_history = await get_cached_dolar_history()
            
            # 2. Obtener cotización en tiempo real del día
            latest_quotes = await get_latest_dolar_quotes()
            
            dolar_configs = [
                {"casa": "mayorista", "ticker": "USD_MAYORISTA", "name": "A3500", "dolarapi_casa": "mayorista"},
                {"casa": "bolsa", "ticker": "USD_MEP", "name": "MEP", "dolarapi_casa": "bolsa"},
                {"casa": "contadoconliqui", "ticker": "USD_CCL", "name": "CCL", "dolarapi_casa": "contadoconliqui"}
            ]
            
            for config in dolar_configs:
                casa = config["casa"]
                ticker = config["ticker"]
                name = config["name"]
                dolarapi_casa = config["dolarapi_casa"]
                
                # Obtener precio anterior del cierre del día anterior (usando el historial)
                prev_price = 0.0
                if dolar_history:
                    house_history = [x for x in dolar_history if x.get("casa") == casa]
                    if house_history:
                        house_history.sort(key=lambda x: x.get("fecha", ""))
                        today_str = datetime.now().strftime("%Y-%m-%d")
                        latest_hist = house_history[-1]
                        
                        # Si el último registro del histórico es de hoy, el anterior/cierre previo es el penúltimo
                        if latest_hist.get("fecha") == today_str:
                            if len(house_history) >= 2:
                                prev_price = float(house_history[-2].get("venta") or house_history[-2].get("compra") or 0.0)
                            else:
                                prev_price = float(latest_hist.get("venta") or latest_hist.get("compra") or 0.0)
                        else:
                            prev_price = float(latest_hist.get("venta") or latest_hist.get("compra") or 0.0)
                
                # Obtener el precio actual del día
                price = 0.0
                if latest_quotes:
                    latest_item = next((q for q in latest_quotes if q.get("casa") == dolarapi_casa), None)
                    if latest_item:
                        price = float(latest_item.get("venta") or latest_item.get("compra") or 0.0)
                
                # Fallback al histórico si DolarApi falla
                if price <= 0 and dolar_history:
                    house_history = [x for x in dolar_history if x.get("casa") == casa]
                    if house_history:
                        house_history.sort(key=lambda x: x.get("fecha", ""))
                        latest_hist = house_history[-1]
                        price = float(latest_hist.get("venta") or latest_hist.get("compra") or 0.0)
                        if prev_price <= 0 and len(house_history) >= 2:
                            prev_price = float(house_history[-2].get("venta") or house_history[-2].get("compra") or price)
                
                if price > 0:
                    if prev_price <= 0:
                        prev_price = price
                        
                    change_pct = ((price - prev_price) / prev_price) * 100.0
                    
                    dolar_assets.append({
                        "ticker": ticker,
                        "price": price,
                        "change_pct": round(change_pct, 2),
                        "volume": 0.0,
                        "high": price,
                        "low": price,
                        "open": prev_price,
                        "name": name,
                        "panel": "general",
                        "currency": "ARS"
                    })
        except Exception as e:
            print(f"Error cargando cotizaciones de dólares en updater: {e}")
            
        # Fallback de último recurso: mantener cotizaciones existentes en disco si falló todo
        if not dolar_assets:
            try:
                if os.path.exists(DOLARES_JSON_PATH):
                    with open(DOLARES_JSON_PATH, "r", encoding="utf-8") as f:
                        old_dolares = json.load(f)
                        dolar_assets = old_dolares.get("dolares", [])
            except Exception as e:
                print(f"Error leyendo fallback de dolares.json: {e}")
                
        from backend.services.analytics import resolve_sector, set_memory_caches
        for s in stocks_dump:
            s["sector"] = resolve_sector(s["ticker"])
        for c in cedears_dump:
            c["sector"] = resolve_sector(c["ticker"])
        for d in dolar_assets:
            d["sector"] = "Monedas"
            
        set_memory_caches(stocks_dump, cedears_dump, dolar_assets)
        os.makedirs(DATOS_DIR, exist_ok=True)

        payload_acciones = {
            "updated_at": datetime.now().isoformat(),
            "acciones": stocks_dump
        }

        payload_cedears = {
            "updated_at": datetime.now().isoformat(),
            "cedears": cedears_dump
        }

        payload_dolares = {
            "updated_at": datetime.now().isoformat(),
            "dolares": dolar_assets
        }

        def save_files():
            # Guardar acciones.json
            temp_path_acc = ACCIONES_JSON_PATH + ".tmp"
            with open(temp_path_acc, "w", encoding="utf-8") as f:
                json.dump(payload_acciones, f, ensure_ascii=False, indent=2)
            os.replace(temp_path_acc, ACCIONES_JSON_PATH)

            # Guardar cedears.json
            temp_path_ced = CEDEARS_JSON_PATH + ".tmp"
            with open(temp_path_ced, "w", encoding="utf-8") as f:
                json.dump(payload_cedears, f, ensure_ascii=False, indent=2)
            os.replace(temp_path_ced, CEDEARS_JSON_PATH)

            # Guardar dolares.json
            temp_path_dol = DOLARES_JSON_PATH + ".tmp"
            with open(temp_path_dol, "w", encoding="utf-8") as f:
                json.dump(payload_dolares, f, ensure_ascii=False, indent=2)
            os.replace(temp_path_dol, DOLARES_JSON_PATH)

        await asyncio.to_thread(save_files)

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Datos guardados en datos/acciones.json ({len(stocks_dump)} acciones), datos/cedears.json ({len(cedears_dump)} cedears) y datos/dolares.json ({len(dolar_assets)} dólares)")
        return payload_acciones
    except Exception as e:
        print(f"Error en actualización periódica: {e}")
        return None

async def precache_historical_data():
    """Recorre todas las acciones (líderes primero, luego general) y CEDEARs y precarga su historial y fundamentales si no están actualizados"""
    from backend.services.analytics import get_stock_history_processed, load_stored_data, load_stored_cedears
    from backend.config import HISTORIAL_DIR
    import os
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Iniciando precarga de datos históricos y fundamentales en segundo plano...")
    
    # Obtener todos los tickers clasificados para priorizar líderes
    try:
        stored = await asyncio.to_thread(load_stored_data)
        acciones = stored.get("acciones", [])
        
        stored_ced = await asyncio.to_thread(load_stored_cedears)
        cedears = stored_ced.get("cedears", [])
        
        lider_tickers = [a["ticker"] for a in acciones if a.get("panel") == "lider"]
        general_tickers = [a["ticker"] for a in acciones if a.get("panel") != "lider"]
        
        # Obtener tickers base de CEDEARs
        cedear_tickers = {c["ticker"].upper() for c in cedears}
        ced_base_tickers = set()
        for t in cedear_tickers:
            if t.endswith("C") or t.endswith("D"):
                candidate = t[:-1]
                if candidate in cedear_tickers:
                    ced_base_tickers.add(candidate)
                    continue
                if t.endswith("DD"):
                    candidate = t[:-2]
                    if candidate in cedear_tickers:
                        ced_base_tickers.add(candidate)
                        continue
            ced_base_tickers.add(t)
            
        ced_base_tickers = sorted(list(ced_base_tickers))
        
        if not lider_tickers:
            lider_tickers = list(MERVAL_LIDER_TICKERS)
            
        tickers_to_precache = ["MERVAL_CCL"] + lider_tickers + general_tickers + ced_base_tickers
    except Exception:
        tickers_to_precache = list(MERVAL_LIDER_TICKERS)
        
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Se precargarán {len(tickers_to_precache)} tickers (líderes primero, luego general y CEDEARs).")
    
    for ticker in tickers_to_precache:
        filepath = os.path.join(HISTORIAL_DIR, f"{ticker}.json")
        is_up_to_date = False
        
        # Verificar que el archivo esté fresco
        from backend.services.analytics import is_history_cache_fresh
        if is_history_cache_fresh(filepath):
            is_up_to_date = True
                
        # 1. Precargar historial
        if not is_up_to_date:
            try:
                await get_stock_history_processed(ticker)
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Precargado historial para {ticker}")
                await asyncio.sleep(1.5)
            except Exception as e:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Error precargando {ticker}: {e}")
                await asyncio.sleep(1.5)
                
        # 2. Precargar fundamentales
        if ticker != "MERVAL_CCL":
            try:
                from backend.services.yahoo_finance import yahoo_finance_service
                await yahoo_finance_service.fetch_fundamentals(ticker)
            except Exception:
                pass
                
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Fin de la precarga de datos históricos y fundamentales.")

def is_data_up_to_date_with_friday_close() -> bool:
    """Verifica si los archivos de datos locales ya tienen la información de cierre del viernes."""
    try:
        if not os.path.exists(ACCIONES_JSON_PATH) or not os.path.exists(CEDEARS_JSON_PATH) or not os.path.exists(DOLARES_JSON_PATH) or not os.path.exists(MERVAL_CCL_JSON_PATH):
            return False
            
        with open(ACCIONES_JSON_PATH, "r", encoding="utf-8") as f:
            data_acc = json.load(f)
        with open(CEDEARS_JSON_PATH, "r", encoding="utf-8") as f:
            data_ced = json.load(f)
        with open(DOLARES_JSON_PATH, "r", encoding="utf-8") as f:
            data_dol = json.load(f)
        with open(MERVAL_CCL_JSON_PATH, "r", encoding="utf-8") as f:
            data_merv = json.load(f)
            
        updated_acc_str = data_acc.get("updated_at")
        updated_ced_str = data_ced.get("updated_at")
        updated_dol_str = data_dol.get("updated_at")
        updated_merv_str = data_merv.get("updated_at")
        
        if not updated_acc_str or not updated_ced_str or not updated_dol_str or not updated_merv_str:
            return False
            
        updated_acc = datetime.fromisoformat(updated_acc_str)
        updated_ced = datetime.fromisoformat(updated_ced_str)
        updated_dol = datetime.fromisoformat(updated_dol_str)
        updated_merv = datetime.fromisoformat(updated_merv_str)
        
        now = datetime.now()
        # Encontrar el viernes más cercano en el pasado
        # 0=Lunes, 4=Viernes, 5=Sábado, 6=Domingo
        days_since_friday = (now.weekday() - 4) % 7
        last_friday = now - timedelta(days=days_since_friday)
        # Consideramos cierre de mercado a las 18:00 local
        last_friday_close = last_friday.replace(hour=18, minute=0, second=0, microsecond=0)
        
        # Si todos los archivos fueron actualizados después del cierre del viernes, están al día
        return (updated_acc >= last_friday_close and 
                updated_ced >= last_friday_close and 
                updated_dol >= last_friday_close and 
                updated_merv >= last_friday_close)
    except Exception as e:
        print(f"Error comprobando estado de datos de cierre de viernes: {e}")
        return False

async def start_background_updater():
    """Bucle infinito que actualiza datos cada 30 segundos en días hábiles"""
    from backend.services.merval_service import fetch_and_save_merval_ccl
    
    now = datetime.now()
    
    # Si es fin de semana y los datos están al día con el cierre del viernes, evitamos consultar al arrancar
    if now.weekday() in (5, 6) and is_data_up_to_date_with_friday_close():
        print(f"[{now.strftime('%H:%M:%S')}] Fin de semana: Los datos ya están actualizados con el cierre del viernes. Omitiendo consulta inicial.")
    else:
        print(f"[{now.strftime('%H:%M:%S')}] Iniciando consulta de datos en el arranque del servidor...")
        await asyncio.gather(
            fetch_and_save_market_data(),
            fetch_and_save_merval_ccl()
        )
        # Lanzar la precarga en segundo plano
        asyncio.create_task(precache_historical_data())
        
    while True:
        await asyncio.sleep(UPDATE_INTERVAL_SECONDS)
        
        current_time = datetime.now()
        # Si es fin de semana (sábado=5 o domingo=6), omitimos la consulta periódica
        if current_time.weekday() in (5, 6):
            continue
            
        try:
            await asyncio.gather(
                fetch_and_save_market_data(),
                fetch_and_save_merval_ccl()
            )
        except Exception as e:
            print(f"Error en bucle de actualización: {e}")

