import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from backend.config import HISTORIAL_DIR
from backend.services.analytics import get_stored_stocks, get_stored_cedears, resolve_sector

_ema200_memory_cache: Dict[str, List[Dict[str, Any]]] = {}
_ema200_cache_time: Dict[str, datetime] = {}

# Mapeo estricto a series históricas en USD (MEP/CCL/ADRs) para acciones locales
USD_TICKERS_MAP = {
    "ALUA": "ALUAD.json",
    "BBAR": "BBARD.json",
    "BMA": "BMA.D.json",
    "BYMA": "BYMAD.json",
    "CEPU": "CEPUD.json",
    "COME": "COMED.json",
    "CRES": "CRESD.json",
    "ECOG": "ECOGD.json",
    "EDN": "EDND.json",
    "GGAL": "GGALD.json",
    "LOMA": "LOMAD.json",
    "METR": "METRD.json",
    "PAMP": "PAMPD.json",
    "SUPV": "SUPVD.json",
    "TGNO4": "TGN4D.json",
    "TGSU2": "TGSUD.json",
    "TRAN": "TRAND.json",
    "TXAR": "TXARD.json",
    "VALO": "VALOD.json",
    "YPFD": "YPFDD.json",
    "IRSA": "IRSAD.json",
    "TECO2": "TECOD.json",
    "CVH": "CVHD.json"
}

def _compute_ema(values: List[float], period: int) -> List[Optional[float]]:
    n = len(values)
    ema = [None] * n
    if n < period:
        period = max(2, n)
    multiplier = 2.0 / (period + 1.0)
    sma = sum(values[:period]) / period
    ema[period - 1] = sma
    for i in range(period, n):
        if ema[i - 1] is not None:
            ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1]
    return ema

def _compute_atr(highs: List[float], lows: List[float], closes: List[float], period: int = 14) -> List[Optional[float]]:
    n = len(closes)
    atr = [None] * n
    if n <= period:
        period = max(2, n - 1)
        if period <= 0:
            return atr
    
    tr = [0.0] * n
    tr[0] = highs[0] - lows[0]
    for i in range(1, n):
        tr[i] = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1])
        )
    
    first_atr = sum(tr[1:period + 1]) / period
    atr[period] = first_atr
    
    for i in range(period + 1, n):
        if atr[i - 1] is not None:
            atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
            
    return atr

def _get_val(item: dict, keys: list, default: float = 0.0) -> float:
    for k in keys:
        if k in item and item[k] is not None:
            try:
                return float(item[k])
            except (ValueError, TypeError):
                continue
    return default

def _format_time_ago(days_ago: int) -> str:
    if days_ago < 7:
        return f"hace {days_ago} días" if days_ago > 1 else "hace 1 día"
    elif days_ago < 30:
        weeks = max(1, round(days_ago / 7))
        return f"hace {weeks} semanas" if weeks > 1 else "hace 1 semana"
    else:
        months = max(1, round(days_ago / 30.4))
        return f"hace {months} meses" if months > 1 else "hace 1 mes"

def _load_usd_history_for_ticker(ticker: str) -> List[Dict[str, Any]]:
    clean_ticker = ticker.upper()
    candidates = []
    
    # 1. Mapeo explícito a USD MEP (ej. ALUA -> ALUAD.json, GGAL -> GGALD.json)
    if clean_ticker in USD_TICKERS_MAP:
        candidates.append(USD_TICKERS_MAP[clean_ticker])
        
    # 2. Si ya es una variante en dólares
    candidates.append(f"{clean_ticker}.json")
    if not clean_ticker.endswith("D") and not clean_ticker.endswith(".D"):
        candidates.append(f"{clean_ticker}D.json")
        candidates.append(f"{clean_ticker}.D.json")
    else:
        if clean_ticker.endswith("D"):
            candidates.append(f"{clean_ticker[:-1]}.json")
            
    # 3. Sufijo .BA
    if clean_ticker.endswith(".BA"):
        base = clean_ticker[:-3]
        if base in USD_TICKERS_MAP:
            candidates.append(USD_TICKERS_MAP[base])
        candidates.append(f"{base}D.json")
        candidates.append(f"{base}.json")

    for filename in candidates:
        filepath = os.path.join(HISTORIAL_DIR, filename)
        if os.path.exists(filepath) and os.path.getsize(filepath) > 50:
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list) and len(data) >= 30:
                        return data
            except Exception:
                pass
    return []

def _get_base_ticker(ticker: str) -> str:
    t = ticker.upper()
    if t.endswith(".BA"):
        t = t[:-3]
    if t.endswith(".D") or t.endswith(".C"):
        t = t[:-2]
    elif len(t) > 3 and (t.endswith("D") or t.endswith("C")):
        t = t[:-1]
    return t

def _process_quotes_usd_sync(quotes: list) -> List[Dict[str, Any]]:
    valid_quotes = [
        q for q in quotes 
        if q.ticker not in ["USD_MEP", "USD_CCL", "USD_MAYORISTA", "MERVAL_CCL"]
    ]
    
    seen_base_tickers = set()
    performances_now = {}
    performances_1m = {}
    today_dt = datetime.now()
    
    processed_results = []
    for quote in valid_quotes:
        base_ticker = _get_base_ticker(quote.ticker)
        if base_ticker in seen_base_tickers:
            continue
            
        history = _load_usd_history_for_ticker(quote.ticker)
        if len(history) < 30:
            continue
            
        seen_base_tickers.add(base_ticker)
        
        closes = []
        highs = []
        lows = []
        dates = []
        
        for p in history:
            c = _get_val(p, ["c", "close"])
            h = _get_val(p, ["h", "high"])
            l = _get_val(p, ["l", "low"])
            d_str = p.get("date", "")
            if c > 0 and h > 0 and l > 0 and d_str:
                closes.append(c)
                highs.append(h)
                lows.append(l)
                dates.append(d_str)
                
        n = len(closes)
        if n < 30:
            continue
            
        ema_period = min(200, n)
        ema200 = _compute_ema(closes, ema_period)
        atr14 = _compute_atr(highs, lows, closes, 14)
        
        c_now = closes[-1] # Precio de cierre en USD
        e_now = ema200[-1]
        a_now = atr14[-1]
        
        if e_now is None or a_now is None or a_now <= 0:
            continue
            
        dist_atrs = (c_now - e_now) / a_now
        
        p_now_idx = max(0, n - 63)
        p_1m_start_idx = max(0, n - 84)
        p_1m_end_idx = max(0, n - 22)
        
        perf_now = (closes[-1] / closes[p_now_idx] - 1.0) if n > p_now_idx else 0.0
        perf_1m = (closes[p_1m_end_idx] / closes[p_1m_start_idx] - 1.0) if p_1m_end_idx > p_1m_start_idx else perf_now
        
        touch_indices = []
        start_eval_idx = max(0, n - ema_period)
        for i in range(start_eval_idx, n):
            if ema200[i] is not None and atr14[i] is not None:
                is_touch = (lows[i] <= ema200[i] <= highs[i]) or (abs(closes[i] - ema200[i]) <= 0.75 * atr14[i])
                if is_touch:
                    touch_indices.append(i)
                    
        touch_clusters = []
        if touch_indices:
            current_cluster = [touch_indices[0]]
            for idx in touch_indices[1:]:
                if idx - current_cluster[-1] <= 4:
                    current_cluster.append(idx)
                else:
                    touch_clusters.append(current_cluster)
                    current_cluster = [idx]
            touch_clusters.append(current_cluster)
            
        lookback_start_idx = max(0, n - 500)
        recent_clusters = [c for c in touch_clusters if c[-1] >= lookback_start_idx]
        freq_count = len(recent_clusters)
        
        if freq_count <= 2:
            freq_label = "visita rara"
            freq_cat = "rara"
        elif freq_count <= 4:
            freq_label = "ocasional"
            freq_cat = "ocasional"
        else:
            freq_label = "habitual"
            freq_cat = "habitual"
            
        last_visit_str = "hace >1 año"
        if touch_clusters:
            previous_clusters = [c for c in touch_clusters if c[-1] < (n - 8)]
            if previous_clusters:
                last_cluster_idx = previous_clusters[-1][-1]
                last_date_str = dates[last_cluster_idx]
                try:
                    dt = datetime.strptime(last_date_str, "%Y-%m-%d")
                    days_ago = (today_dt - dt).days
                    last_visit_str = _format_time_ago(days_ago)
                except Exception:
                    last_visit_str = "hace varios meses"
            else:
                last_visit_str = "visita inicial"
                
        res_item = {
            "ticker": base_ticker,
            "name": quote.name or base_ticker,
            "sector": quote.sector or resolve_sector(base_ticker),
            "price": c_now,
            "currency": "USD",
            "dist_atrs": round(dist_atrs, 1),
            "dist_str": f"{'+' if dist_atrs >= 0 else ''}{round(dist_atrs, 1):.1f}".replace('.', ',') + " ATRs",
            "last_visit": last_visit_str,
            "freq_label": freq_label,
            "freq_cat": freq_cat,
            "perf_now": perf_now,
            "perf_1m": perf_1m
        }
        processed_results.append(res_item)
        performances_now[base_ticker] = perf_now
        performances_1m[base_ticker] = perf_1m
            
    if not processed_results:
        return []
        
    sorted_now = sorted(performances_now.items(), key=lambda x: x[1])
    sorted_1m = sorted(performances_1m.items(), key=lambda x: x[1])
    total_count = len(processed_results)
    
    rank_now_map = {}
    for rank_idx, (tkr, _) in enumerate(sorted_now):
        percentile = int(round((rank_idx + 1) / total_count * 98)) + 1
        rank_now_map[tkr] = min(99, max(1, percentile))
        
    rank_1m_map = {}
    for rank_idx, (tkr, _) in enumerate(sorted_1m):
        percentile = int(round((rank_idx + 1) / total_count * 98)) + 1
        rank_1m_map[tkr] = min(99, max(1, percentile))
        
    for item in processed_results:
        tkr = item["ticker"]
        rs_1m = rank_1m_map.get(tkr, 50)
        rs_now = rank_now_map.get(tkr, 50)
        item["rs_str"] = f"{rs_1m} → {rs_now}"
        item["rs_1m"] = rs_1m
        item["rs_now"] = rs_now
        
    processed_results.sort(key=lambda x: abs(x["dist_atrs"]))
    return processed_results[:25]

async def calculate_ema200_pullbacks(panel: str = "cedears") -> List[Dict[str, Any]]:
    """
    Calcula los activos más cercanos a su EMA200 estrictamente en USD (dólares)
    con historial de toques, distancia en ATRs, frecuencia y rating de fuerza relativa (RS 1M -> HOY).
    """
    global _ema200_memory_cache, _ema200_cache_time
    now = datetime.now()
    
    if panel in _ema200_memory_cache and panel in _ema200_cache_time:
        if now - _ema200_cache_time[panel] < timedelta(minutes=5) and len(_ema200_memory_cache[panel]) > 0:
            return _ema200_memory_cache[panel]
            
    if panel == "cedears":
        quotes = await get_stored_cedears()
    else:
        quotes = await get_stored_stocks()
        
    results = await asyncio.to_thread(_process_quotes_usd_sync, quotes)
    
    if results:
        _ema200_memory_cache[panel] = results
        _ema200_cache_time[panel] = now
        
    return results
