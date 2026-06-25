import os
import json
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional
from backend.config import ACCIONES_JSON_PATH, HISTORIAL_DIR
from backend.models import AssetQuote, MarketSummary, StockHistoryPoint
from backend.services.data912_client import data912_client

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

async def ensure_data_loaded() -> Dict[str, Any]:
    data = await asyncio.to_thread(load_stored_data)
    if not data or "acciones" not in data:
        from backend.services.updater import fetch_and_save_market_data
        data = await fetch_and_save_market_data() or {}
    return data

async def get_stored_stocks() -> List[AssetQuote]:
    data = await ensure_data_loaded()
    stocks_list = data.get("acciones", [])
    return [AssetQuote(**item) for item in stocks_list]

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
        al30_pesos, al30_usd = await asyncio.gather(
            data912_client.get_bond_history("AL30"),
            data912_client.get_bond_history("AL30D")
        )
        
        if not al30_pesos or not al30_usd:
            return _mep_history_cache or {}
            
        usd_map = {item['date']: item['c'] for item in al30_usd if 'date' in item and 'c' in item}
        mep_map = {}
        sorted_pesos = sorted(al30_pesos, key=lambda x: x.get('date', ''))
        
        last_rate = 1000.0
        for item in sorted_pesos:
            date = item.get('date')
            if not date:
                continue
            close_pesos = item.get('c', 0.0)
            close_usd = usd_map.get(date, 0.0)
            if close_usd > 0 and close_pesos > 0:
                last_rate = close_pesos / close_usd
                mep_map[date] = last_rate
            else:
                mep_map[date] = last_rate
                
        all_dates = sorted(list(set(list(usd_map.keys()) + [item.get('date') for item in al30_pesos if item.get('date')])))
        current_rate = 1000.0
        mep_history = {}
        for d in all_dates:
            if d in mep_map:
                current_rate = mep_map[d]
            mep_history[d] = current_rate
            
        _mep_history_cache = mep_history
        _mep_cache_date = today
        return _mep_history_cache
    except Exception as e:
        print(f"Error calculando historial MEP: {e}")
        return _mep_history_cache or {}

async def get_stock_history_processed(ticker: str) -> List[StockHistoryPoint]:
    ticker = ticker.upper()
    filepath = os.path.join(HISTORIAL_DIR, f"{ticker}.json")

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

    # Detectar si el ticker es en USD
    is_usd = (ticker == "YPFDD" or (ticker.endswith("D") and ticker != "YPFD") or ticker.endswith(".D"))
    
    if is_usd:
        from backend.services.updater import get_base_ticker
        base_ticker = get_base_ticker(ticker)
        raw_hist = await data912_client.get_stock_history(base_ticker)
        mep_rates = await get_historical_mep_rates()
    else:
        raw_hist = await data912_client.get_stock_history(ticker)
        mep_rates = {}

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
                past_dates = [d for d in mep_rates.keys() if d <= d_key]
                if past_dates:
                    rate = mep_rates[past_dates[-1]]
                else:
                    if mep_rates:
                        rate = mep_rates[sorted(mep_rates.keys())[0]]
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
    for i in range(n):
        if i >= 19:
            sma20[i] = round(sum(closes[i-19:i+1]) / 20.0, 2)
        if i >= 49:
            sma50[i] = round(sum(closes[i-49:i+1]) / 50.0, 2)

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
            rsi=rsi[i]
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
