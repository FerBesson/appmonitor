import os
import json
import asyncio
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Any
from backend.config import DATOS_DIR

EARNINGS_CACHE_DIR = os.path.join(DATOS_DIR, "earnings_cache")
os.makedirs(EARNINGS_CACHE_DIR, exist_ok=True)

# Mapeo opcional de tickers locales de BCBA/CEDEARs a tickers de EE.UU. o metadatos
CEDEAR_US_MAP = {
    "AAPL": "AAPL", "NVDA": "NVDA", "TSLA": "TSLA", "AMZN": "AMZN",
    "MSFT": "MSFT", "GOOGL": "GOOGL", "META": "META", "MELI": "MELI",
    "GLOB": "GLOB", "GGAL": "GGAL", "YPF": "YPF", "BMA": "BMA",
    "PAM": "PAM", "PAMP": "PAM", "TEO": "TEO", "TECO2": "TEO",
    "BBAR": "BBAR", "SUPV": "SUPV", "CEPU": "CEPU", "EDN": "EDN",
    "VIST": "VIST", "LOMA": "LOMA", "IRS": "IRS", "KO": "KO",
    "PEP": "PEP", "DIS": "DIS", "NFLX": "NFLX", "AMD": "AMD",
    "INTC": "INTC", "BABA": "BABA", "XOM": "XOM", "CVX": "CVX",
    "WMT": "WMT", "JPM": "JPM", "BAC": "BAC", "V": "V", "MA": "MA"
}

def _get_nasdaq_earnings_for_date(date_str: str) -> List[Dict[str, Any]]:
    """
    Obtiene los datos de earnings de Nasdaq para una fecha específica (YYYY-MM-DD).
    Utiliza caché local en disco por 12 horas para evitar rate limiting.
    """
    cache_file = os.path.join(EARNINGS_CACHE_DIR, f"{date_str}.json")
    
    # 1. Verificar si hay caché reciente (< 12 horas)
    if os.path.exists(cache_file):
        try:
            mtime = os.path.getmtime(cache_file)
            if datetime.now().timestamp() - mtime < 43200: # 12h
                with open(cache_file, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            print(f"Error leyendo caché de earnings para {date_str}: {e}")

    # 2. Consultar la API de Nasdaq
    url = f"https://api.nasdaq.com/api/calendar/earnings?date={date_str}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Origin": "https://www.nasdaq.com",
        "Referer": "https://www.nasdaq.com/"
    }
    
    results = []
    try:
        resp = requests.get(url, headers=headers, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            rows = data.get("data", {}).get("rows", []) or []
            for r in rows:
                symbol = r.get("symbol", "").strip().upper()
                if not symbol:
                    continue
                results.append({
                    "symbol": symbol,
                    "name": r.get("name", symbol),
                    "marketCap": r.get("marketCap", ""),
                    "eps": r.get("eps", ""),
                    "epsForecast": r.get("epsForecast", ""),
                    "surprise": r.get("surprise", ""),
                    "time": r.get("time", "time-not-supplied"),
                    "lastYearEPS": r.get("lastYearEPS", ""),
                    "fiscalQuarterEnding": r.get("fiscalQuarterEnding", "")
                })
    except Exception as e:
        print(f"Error consultando Nasdaq earnings para {date_str}: {e}")
        
    # Guardar en caché si obtuvimos respuesta válida
    if results or not os.path.exists(cache_file):
        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error guardando caché de earnings para {date_str}: {e}")
            
    return results

# Lista de tickers de acciones locales argentinas (ADRs en NY)
LOCAL_ARG_SYMBOLS = {
    "GGAL", "YPF", "BMA", "PAM", "PAMP", "TEO", "TECO2", "BBAR", 
    "SUPV", "CEPU", "EDN", "VIST", "LOMA", "IRS"
}

# Mapeo de tickers alias/clases duplicadas para unificar en un solo ticker principal
SYMBOL_ALIASES = {
    "GOOG": "GOOGL",
    "FOX": "FOXA",
    "NWS": "NWSA",
    "BRK.B": "BRK.A"
}

def _base_company_name(name: str) -> str:
    """
    Normaliza el nombre de la empresa eliminando sufijos de tipo de acción (Class A, Class B, Inc, etc.)
    para evitar que aparezca la misma compañía dos veces en el mismo día.
    """
    if not name:
        return ""
    n = name.upper()
    for word in [" CLASS A", " CLASS B", " CLASS C", " INC.", " INC", " CORP.", " CORP", " LTD.", " LTD", " COMMON STOCK", " ORDINARY SHARES"]:
        n = n.replace(word, "")
    return n.strip()

def _parse_market_cap(mc_str: str) -> float:
    """
    Parsea strings como '$831,310,492', '$2.5B', '$500M' a número flotante.
    """
    if not mc_str or not isinstance(mc_str, str):
        return 0.0
    s = mc_str.upper().replace("$", "").replace(",", "").strip()
    try:
        if s.endswith("B"):
            return float(s[:-1]) * 1_000_000_000
        elif s.endswith("M"):
            return float(s[:-1]) * 1_000_000
        elif s.endswith("K"):
            return float(s[:-1]) * 1_000
        return float(s)
    except ValueError:
        return 0.0

def _is_relevant_symbol(item: Dict[str, Any], panel: str = "cedears", min_market_cap: float = 1_000_000_000) -> bool:
    """
    Verifica si una empresa es relevante según el panel activo ('acciones' vs 'cedears').
    """
    sym = item.get("symbol", "").upper()
    
    # Si el panel es acciones locales, mostramos solo empresas argentinas
    if panel == "acciones":
        return sym in LOCAL_ARG_SYMBOLS
        
    # Si el panel es CEDEARs / afuera, excluimos duplicados con acciones locales si los hay
    if sym in CEDEAR_US_MAP and sym not in LOCAL_ARG_SYMBOLS:
        return True
        
    mc = _parse_market_cap(item.get("marketCap", ""))
    return mc >= min_market_cap

async def get_earnings_for_date_range(start_date: datetime, end_date: datetime, panel: str = "cedears", only_relevant: bool = True) -> List[Dict[str, Any]]:
    """
    Obtiene los eventos de earnings formateados por día entre start_date y end_date.
    Garantiza que no haya duplicados y aplica el filtro de panel (acciones vs cedears).
    """
    current = start_date
    days_data = []
    
    tasks = []
    dates = []
    
    while current <= end_date:
        d_str = current.strftime("%Y-%m-%d")
        dates.append((current, d_str))
        tasks.append(asyncio.to_thread(_get_nasdaq_earnings_for_date, d_str))
        current += timedelta(days=1)
        
    raw_results = await asyncio.gather(*tasks)
    
    for (dt, d_str), rows in zip(dates, raw_results):
        before_open = []
        after_close = []
        other_time = []
        
        seen_symbols = set()
        seen_company_names = set()
        dedup_rows = []
        
        for r in rows:
            raw_sym = r.get("symbol", "").strip().upper()
            if not raw_sym:
                continue
                
            canonical_sym = SYMBOL_ALIASES.get(raw_sym, raw_sym)
            base_name = _base_company_name(r.get("name", ""))
            
            # Evitar duplicados por ticker o nombre base de empresa
            if canonical_sym not in seen_symbols and (not base_name or base_name not in seen_company_names):
                seen_symbols.add(canonical_sym)
                if base_name:
                    seen_company_names.add(base_name)
                
                r_copy = dict(r)
                r_copy["symbol"] = canonical_sym
                dedup_rows.append(r_copy)
        
        # Filtrar por panel y relevancia
        filtered_rows = [r for r in dedup_rows if _is_relevant_symbol(r, panel=panel)] if only_relevant else dedup_rows
        
        # Ordenar por Market Cap descendente
        filtered_rows.sort(key=lambda x: _parse_market_cap(x.get("marketCap", "")), reverse=True)
        
        for item in filtered_rows:
            timing = item.get("time", "")
            formatted_item = {
                "symbol": item["symbol"],
                "name": item["name"],
                "marketCap": item.get("marketCap", ""),
                "eps": item.get("eps", ""),
                "epsForecast": item.get("epsForecast", ""),
                "surprise": item.get("surprise", ""),
                "lastYearEPS": item.get("lastYearEPS", ""),
                "fiscalQuarterEnding": item.get("fiscalQuarterEnding", ""),
                "timing": timing
            }
            if timing == "time-pre-market":
                before_open.append(formatted_item)
            elif timing == "time-after-hours":
                after_close.append(formatted_item)
            else:
                other_time.append(formatted_item)
                
        days_data.append({
            "date": d_str,
            "dayOfWeek": dt.strftime("%A"),
            "formattedDate": dt.strftime("%d/%m/%Y"),
            "dayNum": dt.day,
            "monthNum": dt.month,
            "yearNum": dt.year,
            "before_open": before_open,
            "after_close": after_close,
            "other": other_time,
            "total_count": len(filtered_rows)
        })
        
    return days_data

async def get_weekly_earnings(target_date_str: str = None, panel: str = "cedears", only_relevant: bool = True) -> Dict[str, Any]:
    """
    Devuelve los earnings para la semana laborable (Lunes a Viernes) que contiene target_date.
    """
    if target_date_str:
        try:
            dt = datetime.strptime(target_date_str, "%Y-%m-%d")
        except ValueError:
            dt = datetime.now()
    else:
        dt = datetime.now()
        
    monday = dt - timedelta(days=dt.weekday())
    friday = monday + timedelta(days=4)
    
    days = await get_earnings_for_date_range(monday, friday, panel=panel, only_relevant=only_relevant)
    
    return {
        "startDate": monday.strftime("%Y-%m-%d"),
        "endDate": friday.strftime("%Y-%m-%d"),
        "days": days
    }

async def get_monthly_earnings(year: int, month: int, panel: str = "cedears", only_relevant: bool = True) -> Dict[str, Any]:
    """
    Devuelve los earnings para todo el mes especificado.
    """
    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = datetime(year, month + 1, 1) - timedelta(days=1)
        
    days = await get_earnings_for_date_range(start_date, end_date, panel=panel, only_relevant=only_relevant)
    
    return {
        "year": year,
        "month": month,
        "startDate": start_date.strftime("%Y-%m-%d"),
        "endDate": end_date.strftime("%Y-%m-%d"),
        "days": days
    }


