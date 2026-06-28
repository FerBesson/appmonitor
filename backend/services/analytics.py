import os
import json
import asyncio
import bisect
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from backend.config import ACCIONES_JSON_PATH, CEDEARS_JSON_PATH, DOLARES_JSON_PATH, HISTORIAL_DIR, DATOS_DIR
from backend.models import AssetQuote, MarketSummary, StockHistoryPoint
from backend.services.data912_client import data912_client

_memory_cache_stocks_quotes: Optional[List[AssetQuote]] = None
_memory_cache_stocks_json: Optional[str] = None
_memory_cache_cedears_quotes: Optional[List[AssetQuote]] = None
_memory_cache_cedears_json: Optional[str] = None

def get_cached_stocks_json() -> Optional[str]:
    return _memory_cache_stocks_json

def get_cached_cedears_json() -> Optional[str]:
    return _memory_cache_cedears_json

def set_memory_caches(stocks_list: list, cedears_list: list, dolares_list: list):
    global _memory_cache_stocks_quotes, _memory_cache_stocks_json, _memory_cache_cedears_quotes, _memory_cache_cedears_json
    try:
        merged_stocks = stocks_list + dolares_list
        stocks_quotes = []
        for item in merged_stocks:
            q = AssetQuote(**item)
            if not q.sector or q.sector == "Otros":
                q.sector = resolve_sector(q.ticker)
            stocks_quotes.append(q)
            
        cedears_quotes = []
        for item in cedears_list:
            q = AssetQuote(**item)
            if not q.sector or q.sector == "Otros":
                q.sector = resolve_sector(q.ticker)
            cedears_quotes.append(q)
            
        _memory_cache_stocks_quotes = stocks_quotes
        _memory_cache_cedears_quotes = cedears_quotes
        
        _memory_cache_stocks_json = json.dumps([q.model_dump() for q in stocks_quotes], ensure_ascii=False)
        _memory_cache_cedears_json = json.dumps([q.model_dump() for q in cedears_quotes], ensure_ascii=False)
    except Exception as e:
        print(f"Error actualizando cachés en memoria: {e}")

def is_history_cache_fresh(filepath: str) -> bool:
    if not os.path.exists(filepath) or os.path.getsize(filepath) <= 10:
        return False
    try:
        mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
        now = datetime.now()
        if mtime.date() == now.date():
            return True
        if now.weekday() in (5, 6):
            days_to_friday = now.weekday() - 4
            friday_date = (now - timedelta(days=days_to_friday)).date()
            return mtime.date() >= friday_date
        if now.weekday() == 0 and now.hour < 11:
            friday_date = (now - timedelta(days=3)).date()
            return mtime.date() >= friday_date
        if now.weekday() in (1, 2, 3, 4) and now.hour < 11:
            yesterday_date = (now - timedelta(days=1)).date()
            return mtime.date() >= yesterday_date
    except Exception as e:
        print(f"Error verificando frescura de caché para {filepath}: {e}")
        return False
    return False

# Caché en memoria para sectores (mapeo Ticker -> Sector en español)
_sectors_cache = {}
_sectors_cache_loaded = False

def load_sectors_cache():
    global _sectors_cache, _sectors_cache_loaded
    if _sectors_cache_loaded:
        return
    
    # Sectores estáticos predefinidos para acciones locales de Argentina (en español)
    static_sectors = {
        "ALUA": "Materiales Básicos",
        "BBAR": "Servicios Financieros",
        "BMA": "Servicios Financieros",
        "BYMA": "Servicios Financieros",
        "CEPU": "Servicios Públicos",
        "COME": "Industriales",
        "CRES": "Bienes Raíces",
        "ECOG": "Servicios Públicos",
        "EDN": "Servicios Públicos",
        "GGAL": "Servicios Financieros",
        "LOMA": "Materiales Básicos",
        "METR": "Servicios Públicos",
        "PAMP": "Energía",
        "SUPV": "Servicios Financieros",
        "TGNO4": "Servicios Públicos",
        "TGSU2": "Servicios Públicos",
        "TRAN": "Servicios Públicos",
        "TXAR": "Materiales Básicos",
        "VALO": "Servicios Financieros",
        "YPFD": "Energía",
        
        # Panel General
        "AGRO": "Industriales",
        "AUSO": "Servicios Públicos",
        "BHIP": "Servicios Financieros",
        "BOLT": "Consumo Cíclico",
        "BPAT": "Servicios Financieros",
        "CADO": "Bienes Raíces",
        "CAPX": "Servicios Públicos",
        "CARC": "Materiales Básicos",
        "CELU": "Materiales Básicos",
        "CGPA2": "Servicios Públicos",
        "CTIO": "Bienes Raíces",
        "DGCU2": "Servicios Públicos",
        "FERR": "Industriales",
        "FIPL": "Materiales Básicos",
        "GAMI": "Servicios Financieros",
        "HAVA": "Consumo Defensivo",
        "IRSA": "Bienes Raíces",
        "LEDE": "Consumo Defensivo",
        "LONG": "Consumo Cíclico",
        "MOLA": "Consumo Defensivo",
        "MOLI": "Consumo Defensivo",
        "MORI": "Consumo Defensivo",
        "OEST": "Servicios Públicos",
        "RICH": "Salud",
        "RIGO": "Materiales Básicos",
        "SAMI": "Consumo Defensivo",
        "SEMI": "Consumo Defensivo",
        "TECO2": "Telecomunicaciones",
    }
    _sectors_cache.update(static_sectors)
    
    # Traducción de sectores de Yahoo Finance (inglés) a español
    sector_translation = {
        "Technology": "Tecnología",
        "Financial Services": "Servicios Financieros",
        "Healthcare": "Salud",
        "Consumer Cyclical": "Consumo Cíclico",
        "Consumer Defensive": "Consumo Defensivo",
        "Industrials": "Industriales",
        "Utilities": "Servicios Públicos",
        "Energy": "Energía",
        "Basic Materials": "Materiales Básicos",
        "Real Estate": "Bienes Raíces",
        "Communication Services": "Telecomunicaciones",
        "N/A": "Otros",
        "": "Otros"
    }

    # Leer archivos de fundamentos cacheados en disco
    fundamentos_dir = os.path.join(DATOS_DIR, "fundamentos")
    if os.path.exists(fundamentos_dir):
        try:
            for filename in os.listdir(fundamentos_dir):
                if filename.endswith(".json"):
                    filepath = os.path.join(fundamentos_dir, filename)
                    try:
                        with open(filepath, "r", encoding="utf-8") as f:
                            fund_data = json.load(f)
                            ticker = fund_data.get("ticker", "")
                            # Eliminar sufijo .BA de Yahoo Finance
                            if ticker.endswith(".BA"):
                                ticker = ticker[:-3]
                            ticker = ticker.upper()
                            sector_eng = fund_data.get("sector", "")
                            sector_esp = sector_translation.get(sector_eng, sector_eng or "Otros")
                            if ticker and sector_esp:
                                _sectors_cache[ticker] = sector_esp
                    except Exception:
                        pass
        except Exception as e:
            print(f"Error cargando sectores desde fundamentos: {e}")
            
    _sectors_cache_loaded = True

def update_sector_in_cache(ticker: str, sector: str):
    """Permite registrar un sector en la caché en memoria al descargar nuevos fundamentos."""
    global _sectors_cache
    sector_translation = {
        "Technology": "Tecnología",
        "Financial Services": "Servicios Financieros",
        "Healthcare": "Salud",
        "Consumer Cyclical": "Consumo Cíclico",
        "Consumer Defensive": "Consumo Defensivo",
        "Industrials": "Industriales",
        "Utilities": "Servicios Públicos",
        "Energy": "Energía",
        "Basic Materials": "Materiales Básicos",
        "Real Estate": "Bienes Raíces",
        "Communication Services": "Telecomunicaciones",
        "N/A": "Otros",
        "": "Otros"
    }
    
    t = ticker.upper()
    if t.endswith(".BA"):
        t = t[:-3]
    
    sector_esp = sector_translation.get(sector, sector or "Otros")
    _sectors_cache[t] = sector_esp

def resolve_sector(ticker: str) -> str:
    """Resuelve el sector de un activo limpiando su ticker de variantes de moneda."""
    load_sectors_cache()
    
    t = ticker.upper()
    
    # Casos especiales
    if t in ["USD_MEP", "USD_CCL", "USD_MAYORISTA"]:
        return "Monedas"
    if t == "MERVAL_CCL":
        return "Índices"
        
    # Recortar sufijos de moneda de CEDEARs / Acciones locales
    if t.endswith("C") or t.endswith("D"):
        candidate = t[:-1]
        if candidate in _sectors_cache:
            return _sectors_cache[candidate]
        if t.endswith("DD"):
            candidate = t[:-2]
            if candidate in _sectors_cache:
                return _sectors_cache[candidate]
                
    if t.endswith(".D"):
        candidate = t[:-2]
        if candidate in _sectors_cache:
            return _sectors_cache[candidate]
            
    # Búsqueda exacta
    if t in _sectors_cache:
        return _sectors_cache[t]
        
    return "Otros"


def _compute_ema(values: List[float], period: int) -> List[Optional[float]]:
    n = len(values)
    ema = [None] * n
    if n < period:
        return ema
    multiplier = 2.0 / (period + 1.0)
    sma = sum(values[:period]) / period
    ema[period - 1] = sma
    for i in range(period, n):
        ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1]
    return ema

def _compute_macd(closes: List[float]) -> tuple:
    n = len(closes)
    macd_line = [None] * n
    signal_line = [None] * n
    histogram = [None] * n
    ema12 = _compute_ema(closes, 12)
    ema26 = _compute_ema(closes, 26)
    for i in range(n):
        if ema12[i] is not None and ema26[i] is not None:
            macd_line[i] = ema12[i] - ema26[i]
    valid_macd = [x for x in macd_line if x is not None]
    if len(valid_macd) >= 9:
        macd_ema9 = _compute_ema(valid_macd, 9)
        first_valid_idx = macd_line.index(valid_macd[0])
        for i in range(len(macd_ema9)):
            val = macd_ema9[i]
            if val is not None:
                idx = first_valid_idx + i
                signal_line[idx] = round(val, 4)
                macd_line[idx] = round(macd_line[idx], 4)
                histogram[idx] = round(macd_line[idx] - val, 4)
    return macd_line, signal_line, histogram

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

def load_stored_data() -> Dict[str, Any]:
    if os.path.exists(ACCIONES_JSON_PATH):
        try:
            with open(ACCIONES_JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error leyendo acciones.json: {e}")
    return {}

def load_stored_cedears() -> Dict[str, Any]:
    if os.path.exists(CEDEARS_JSON_PATH):
        try:
            with open(CEDEARS_JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error leyendo cedears.json: {e}")
    return {}

def load_stored_dolares() -> List[Dict[str, Any]]:
    if os.path.exists(DOLARES_JSON_PATH):
        try:
            with open(DOLARES_JSON_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("dolares", [])
        except Exception as e:
            print(f"Error leyendo dolares.json: {e}")
    return []

async def ensure_data_loaded() -> Dict[str, Any]:
    data = await asyncio.to_thread(load_stored_data)
    dolares = await asyncio.to_thread(load_stored_dolares)
    if not data or "acciones" not in data or not dolares:
        from backend.services.updater import fetch_and_save_market_data
        data = await fetch_and_save_market_data() or {}
    return data

async def ensure_cedears_loaded() -> Dict[str, Any]:
    data = await asyncio.to_thread(load_stored_cedears)
    if not data or "cedears" not in data:
        from backend.services.updater import fetch_and_save_market_data
        await fetch_and_save_market_data()
        data = await asyncio.to_thread(load_stored_cedears) or {}
    return data

async def get_stored_stocks() -> List[AssetQuote]:
    global _memory_cache_stocks_quotes
    if _memory_cache_stocks_quotes is not None:
        return _memory_cache_stocks_quotes
        
    data = await ensure_data_loaded()
    stocks_list = data.get("acciones", [])
    dolares_list = await asyncio.to_thread(load_stored_dolares)
    cedears_data = await ensure_cedears_loaded()
    cedears_list = cedears_data.get("cedears", [])
    
    set_memory_caches(stocks_list, cedears_list, dolares_list)
    return _memory_cache_stocks_quotes or []

async def get_stored_cedears() -> List[AssetQuote]:
    global _memory_cache_cedears_quotes
    if _memory_cache_cedears_quotes is not None:
        return _memory_cache_cedears_quotes
        
    cedears_data = await ensure_cedears_loaded()
    cedears_list = cedears_data.get("cedears", [])
    data = await ensure_data_loaded()
    stocks_list = data.get("acciones", [])
    dolares_list = await asyncio.to_thread(load_stored_dolares)
    
    set_memory_caches(stocks_list, cedears_list, dolares_list)
    return _memory_cache_cedears_quotes or []

def get_cedear_base_ticker(ticker: str, cedear_tickers: set) -> str:
    t = ticker.upper()
    if t.endswith("C") or t.endswith("D"):
        base = t[:-1]
        if base in cedear_tickers:
            return base
    return t

async def get_market_summary() -> MarketSummary:
    stocks = await get_stored_stocks()

    valid_stocks = [s for s in stocks if s.price > 0]
    top_gainers = sorted(valid_stocks, key=lambda x: x.change_pct, reverse=True)[:6]
    top_losers = sorted(valid_stocks, key=lambda x: x.change_pct)[:6]
    most_active = sorted(valid_stocks, key=lambda x: x.volume, reverse=True)[:6]

    top_gainer = top_gainers[0] if top_gainers else None
    top_vol = most_active[0] if most_active else None

    return MarketSummary(
        top_gainers=top_gainers,
        top_losers=top_losers,
        most_active=most_active,
        total_stocks=len(valid_stocks),
        top_gainer_single=top_gainer,
        top_volume_single=top_vol
    )
_mep_history_cache = {}
_mep_cache_date = None

async def get_historical_mep_rates() -> Dict[str, float]:
    global _mep_history_cache, _mep_cache_date
    today = datetime.today().date()
    
    if _mep_history_cache and _mep_cache_date == today:
        return _mep_history_cache
        
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get("https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa", timeout=10.0)
            if response.status_code == 200:
                data = response.json()
                mep_history = {}
                for item in data:
                    date = item.get("fecha")
                    val = item.get("venta") or item.get("compra")
                    if date and val:
                        mep_history[date] = float(val)
                _mep_history_cache = mep_history
                _mep_cache_date = today
                return _mep_history_cache
    except Exception as e:
        print(f"Error obteniendo historial MEP desde ArgentinaDatos: {e}")
    return _mep_history_cache or {}

_ccl_history_cache = {}
_ccl_cache_date = None

async def get_historical_ccl_rates() -> Dict[str, float]:
    global _ccl_history_cache, _ccl_cache_date
    today = datetime.today().date()
    
    if _ccl_history_cache and _ccl_cache_date == today:
        return _ccl_history_cache
        
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get("https://api.argentinadatos.com/v1/cotizaciones/dolares/contadoconliqui", timeout=10.0)
            if response.status_code == 200:
                data = response.json()
                ccl_history = {}
                for item in data:
                    date = item.get("fecha")
                    val = item.get("venta") or item.get("compra")
                    if date and val:
                        ccl_history[date] = float(val)
                _ccl_history_cache = ccl_history
                _ccl_cache_date = today
                return _ccl_history_cache
    except Exception as e:
        print(f"Error obteniendo historial CCL desde ArgentinaDatos: {e}")
    return _ccl_history_cache or {}

async def get_stock_history_processed(ticker: str) -> List[StockHistoryPoint]:
    ticker = ticker.upper()
    filepath = os.path.join(HISTORIAL_DIR, f"{ticker}.json")

    if ticker == "MERVAL_CCL":
        from backend.services.merval_service import fetch_and_save_merval_ccl_history
        def read_cache_file():
            if is_history_cache_fresh(filepath):
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception:
                    pass
            return None

        cached_data = await asyncio.to_thread(read_cache_file)
        if cached_data is not None:
            return [StockHistoryPoint(**p) for p in cached_data]
        return await fetch_and_save_merval_ccl_history()

    # Intentar leer caché local si está fresco
    def read_cache_file():
        if is_history_cache_fresh(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error leyendo caché local para {ticker}: {e}")
        return None

    cached_data = await asyncio.to_thread(read_cache_file)
    if cached_data is not None:
        return [StockHistoryPoint(**p) for p in cached_data]

    # Detectar si el ticker es de dólares para usar ArgentinaDatos
    if ticker in ["USD_MEP", "USD_CCL", "USD_MAYORISTA"]:
        casa_map = {
            "USD_MEP": "bolsa",
            "USD_CCL": "contadoconliqui",
            "USD_MAYORISTA": "mayorista"
        }
        casa = casa_map[ticker]
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"https://api.argentinadatos.com/v1/cotizaciones/dolares/{casa}", timeout=10.0)
                if response.status_code == 200:
                    raw_data = response.json()
                else:
                    raw_data = []
        except Exception as e:
            print(f"Error descargando histórico de dólar {ticker}: {e}")
            raw_data = []
            
        points = []
        for item in raw_data:
            val = float(item.get("venta") or item.get("compra") or 0.0)
            if val <= 0:
                continue
            
            # Filtro de días de semana (Lunes a Viernes) para tener la misma lógica que las acciones y cedears
            date_str = item.get("fecha", "")[:10]
            if date_str:
                try:
                    f_dt = datetime.strptime(date_str, "%Y-%m-%d")
                    if f_dt.weekday() >= 5:  # Sábado o Domingo
                        continue
                except Exception:
                    pass
                    
            points.append({
                "date": date_str,
                "open": val,
                "high": val,
                "low": val,
                "close": val,
                "volume": 0.0
            })
    else:
        # Detectar si es CEDEAR o acción
        stored_cedears = await get_stored_cedears()
        cedear_tickers = {c.ticker.upper() for c in stored_cedears}
        is_ced = ticker in cedear_tickers
        
        if is_ced:
            is_usd = ticker.endswith("D") and (ticker[:-1] in cedear_tickers)
            is_usdc = ticker.endswith("C") and (ticker[:-1] in cedear_tickers)
            
            if is_usd or is_usdc:
                base_ticker = get_cedear_base_ticker(ticker, cedear_tickers)
                raw_hist = await data912_client.get_cedear_history(base_ticker)
                if is_usd:
                    rates = await get_historical_mep_rates()
                else: # is_usdc
                    rates = await get_historical_ccl_rates()
                sorted_dates = sorted(rates.keys())
            else:
                raw_hist = await data912_client.get_cedear_history(ticker)
                rates = {}
                sorted_dates = []
        else:
            # Acción local
            is_usd = (ticker == "YPFDD" or (ticker.endswith("D") and ticker != "YPFD") or ticker.endswith(".D"))
            is_usdc = False
            if is_usd:
                from backend.services.updater import get_base_ticker
                base_ticker = get_base_ticker(ticker)
                raw_hist = await data912_client.get_stock_history(base_ticker)
                rates = await get_historical_mep_rates()
                sorted_dates = sorted(rates.keys())
            else:
                raw_hist = await data912_client.get_stock_history(ticker)
                rates = {}
                sorted_dates = []

        if not raw_hist:
            return []

        points = []
        for item in raw_hist:
            if not isinstance(item, dict):
                continue
            date_str = _get_str(item, ["date", "time", "t", "fecha"], "")
            if not date_str:
                continue
            c = _get_float(item, ["c", "close", "price"], 0.0)
            if c == 0:
                continue
            o = _get_float(item, ["o", "open"], c)
            h = _get_float(item, ["h", "high"], max(o, c))
            l = _get_float(item, ["l", "low"], min(o, c))
            v = _get_float(item, ["v", "volume"], 0.0)

            # Si es USD/USDC, convertimos los precios usando la tasa correspondiente de ese día
            if is_usd or is_usdc:
                d_key = date_str[:10]
                rate = rates.get(d_key)
                if rate is None:
                    if sorted_dates:
                        idx = bisect.bisect_right(sorted_dates, d_key)
                        if idx > 0:
                            rate = rates[sorted_dates[idx - 1]]
                        else:
                            rate = rates[sorted_dates[0]]
                    else:
                        rate = 1.0
                if rate <= 0:
                    rate = 1.0
                
                o = o / rate
                h = h / rate
                l = l / rate
                c = c / rate

            points.append({
                "date": date_str[:10],
                "open": o,
                "high": h,
                "low": l,
                "close": c,
                "volume": v
            })

    points.sort(key=lambda x: x["date"])


    closes = [p["close"] for p in points]
    n = len(closes)
    
    sma20 = [None] * n
    sma50 = [None] * n
    
    if n >= 20:
        val_sum = sum(closes[:20])
        sma20[19] = round(val_sum / 20.0, 2)
        for i in range(20, n):
            val_sum += closes[i] - closes[i - 20]
            sma20[i] = round(val_sum / 20.0, 2)
            
    if n >= 50:
        val_sum = sum(closes[:50])
        sma50[49] = round(val_sum / 50.0, 2)
        for i in range(50, n):
            val_sum += closes[i] - closes[i - 50]
            sma50[i] = round(val_sum / 50.0, 2)

    rsi = [None] * n
    if n > 14:
        gains = []
        losses = []
        for i in range(1, 15):
            diff = closes[i] - closes[i-1]
            gains.append(max(0.0, diff))
            losses.append(max(0.0, -diff))
        
        avg_gain = sum(gains) / 14.0
        avg_loss = sum(losses) / 14.0

        if avg_loss == 0:
            rsi[14] = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi[14] = round(100.0 - (100.0 / (1.0 + rs)), 2)

        for i in range(15, n):
            diff = closes[i] - closes[i-1]
            gain = max(0.0, diff)
            loss = max(0.0, -diff)
            avg_gain = (avg_gain * 13.0 + gain) / 14.0
            avg_loss = (avg_loss * 13.0 + loss) / 14.0

            if avg_loss == 0:
                rsi[i] = 100.0
            else:
                rs = avg_gain / avg_loss
                rsi[i] = round(100.0 - (100.0 / (1.0 + rs)), 2)

    # Bollinger Bands (20, 2)
    bb_upper = [None] * n
    bb_lower = [None] * n
    bb_middle = [None] * n
    if n >= 20:
        import math
        for i in range(19, n):
            slice_20 = closes[i-19:i+1]
            mean = sum(slice_20) / 20.0
            variance = sum((x - mean) ** 2 for x in slice_20) / 20.0
            std_dev = math.sqrt(variance)
            bb_middle[i] = round(mean, 2)
            bb_upper[i] = round(mean + 2 * std_dev, 2)
            bb_lower[i] = round(mean - 2 * std_dev, 2)

    # MACD
    macd, macd_signal, macd_hist = _compute_macd(closes)

    result = []
    for i in range(n):
        p = points[i]
        result.append(StockHistoryPoint(
            date=p["date"],
            open=p["open"],
            high=p["high"],
            low=p["low"],
            close=p["close"],
            volume=p["volume"],
            sma20=sma20[i],
            sma50=sma50[i],
            rsi=rsi[i],
            bb_upper=bb_upper[i],
            bb_lower=bb_lower[i],
            bb_middle=bb_middle[i],
            macd=macd[i],
            macd_signal=macd_signal[i],
            macd_hist=macd_hist[i]
        ))

    # Guardar en caché local
    try:
        os.makedirs(HISTORIAL_DIR, exist_ok=True)
        serializable_result = [p.model_dump() for p in result]
        
        def save_cache_file():
            temp_filepath = filepath + ".tmp"
            with open(temp_filepath, "w", encoding="utf-8") as f:
                json.dump(serializable_result, f, ensure_ascii=False, indent=2)
            os.replace(temp_filepath, filepath)
            
        await asyncio.to_thread(save_cache_file)
    except Exception as e:
        print(f"Error escribiendo caché local para {ticker}: {e}")

    return result
