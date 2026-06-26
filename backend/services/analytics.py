import os
import json
import asyncio
import bisect
from datetime import datetime
from typing import Any, Dict, List, Optional
from backend.config import ACCIONES_JSON_PATH, DOLARES_JSON_PATH, HISTORIAL_DIR
from backend.models import AssetQuote, MarketSummary, StockHistoryPoint
from backend.services.data912_client import data912_client

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

async def get_stored_stocks() -> List[AssetQuote]:
    data = await ensure_data_loaded()
    stocks_list = data.get("acciones", [])
    
    dolares_list = await asyncio.to_thread(load_stored_dolares)
    merged_list = stocks_list + dolares_list
    
    return [AssetQuote(**item) for item in merged_list]

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

async def get_stock_history_processed(ticker: str) -> List[StockHistoryPoint]:
    ticker = ticker.upper()
    filepath = os.path.join(HISTORIAL_DIR, f"{ticker}.json")

    if ticker == "MERVAL_CCL":
        from backend.services.merval_service import fetch_and_save_merval_ccl_history
        def read_cache_file():
            if os.path.exists(filepath) and os.path.getsize(filepath) > 10:
                try:
                    mtime = os.path.getmtime(filepath)
                    if datetime.fromtimestamp(mtime).date() == datetime.today().date():
                        with open(filepath, "r", encoding="utf-8") as f:
                            return json.load(f)
                except Exception:
                    pass
            return None

        cached_data = await asyncio.to_thread(read_cache_file)
        if cached_data is not None:
            return [StockHistoryPoint(**p) for p in cached_data]
        return await fetch_and_save_merval_ccl_history()

    # Intentar leer caché local si es de hoy
    def read_cache_file():
        if os.path.exists(filepath):
            try:
                mtime = os.path.getmtime(filepath)
                if datetime.fromtimestamp(mtime).date() == datetime.today().date():
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
            points.append({
                "date": item.get("fecha", "")[:10],
                "open": val,
                "high": val,
                "low": val,
                "close": val,
                "volume": 0.0
            })
    else:
        # Detectar si el ticker es en USD
        is_usd = (ticker == "YPFDD" or (ticker.endswith("D") and ticker != "YPFD") or ticker.endswith(".D"))
        
        if is_usd:
            from backend.services.updater import get_base_ticker
            base_ticker = get_base_ticker(ticker)
            raw_hist = await data912_client.get_stock_history(base_ticker)
            mep_rates = await get_historical_mep_rates()
            sorted_mep_dates = sorted(mep_rates.keys())
        else:
            raw_hist = await data912_client.get_stock_history(ticker)
            mep_rates = {}
            sorted_mep_dates = []

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

            # Si es USD, convertimos los precios usando la tasa MEP de ese día
            if is_usd:
                d_key = date_str[:10]
                rate = mep_rates.get(d_key)
                if rate is None:
                    if sorted_mep_dates:
                        idx = bisect.bisect_right(sorted_mep_dates, d_key)
                        if idx > 0:
                            rate = mep_rates[sorted_mep_dates[idx - 1]]
                        else:
                            rate = mep_rates[sorted_mep_dates[0]]
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
