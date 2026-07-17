import os
import json
import httpx
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from backend.config import HISTORIAL_DIR

# Mapeo de tickers locales a sus nombres de archivo en USD MEP (D)
D_TICKERS_MAP = {
    "ALUAD": "ALUAD.json",
    "BBARD": "BBARD.json",
    "BMA.D": "BMA.D.json",
    "BYMAD": "BYMAD.json",
    "CEPUD": "CEPUD.json",
    "COMED": "COMED.json",
    "CRESD": "CRESD.json",
    "ECOGD": "ECOGD.json",
    "EDND": "EDND.json",
    "GGALD": "GGALD.json",
    "LOMAD": "LOMAD.json",
    "METRD": "METRD.json",
    "PAMPD": "PAMPD.json",
    "SUPVD": "SUPVD.json",
    "TGN4D": "TGN4D.json",
    "TGSUD": "TGSUD.json",
    "TRAND": "TRAND.json",
    "TXARD": "TXARD.json",
    "VALOD": "VALOD.json",
    "YPFDD": "YPFDD.json"
}

LOCAL_TICKERS = list(D_TICKERS_MAP.keys())

US_SECTOR_ETFS = [
    "XLK", "XLF", "XLE", "XLY", "XLP", "XLV", "XLI", "XLB", "XLRE", "XLU", "XLC", "SMH"
]

def compute_sma(values: list, period: int) -> list:
    sma = [None] * len(values)
    for i in range(period - 1, len(values)):
        sub = values[i - period + 1 : i + 1]
        if any(x is None for x in sub):
            sma[i] = None
        else:
            sma[i] = sum(sub) / period
    return sma

def compute_std(values: list, period: int, sma_values: list) -> list:
    std = [None] * len(values)
    for i in range(period - 1, len(values)):
        sub = values[i - period + 1 : i + 1]
        mean = sma_values[i]
        if mean is None or any(x is None for x in sub):
            std[i] = None
        else:
            variance = sum((x - mean) ** 2 for x in sub) / period
            std[i] = variance ** 0.5
    return std

def compute_ema(values: list, period: int) -> list:
    ema = [None] * len(values)
    start_idx = 0
    while start_idx < len(values) and values[start_idx] is None:
        start_idx += 1
    if start_idx == len(values):
        return ema
    
    ema[start_idx] = values[start_idx]
    multiplier = 2.0 / (period + 1.0)
    for i in range(start_idx + 1, len(values)):
        if values[i] is None:
            ema[i] = ema[i - 1]
        else:
            ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1]
    return ema

async def get_history_points(ticker: str, is_us: bool = False) -> List[Dict[str, Any]]:
    """Obtiene los puntos históricos de un activo. Si is_us=True, consulta Yahoo Finance directamente."""
    if ticker in D_TICKERS_MAP:
        filename = D_TICKERS_MAP[ticker]
    else:
        filename = f"{ticker}_US.json" if is_us else f"{ticker}.json"
        
    filepath = os.path.join(HISTORIAL_DIR, filename)
    
    # Intentar leer caché local si está fresco (menos de 24 horas)
    if os.path.exists(filepath) and os.path.getsize(filepath) > 100:
        mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
        if datetime.now() - mtime < timedelta(hours=24):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
                
    # Si es de EE.UU. o si es el benchmark en ARS ^MERV, lo descargamos de Yahoo Finance
    if is_us or ticker == "^MERV":
        try:
            from backend.services.merval_service import fetch_yahoo_history, parse_yahoo_series
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await fetch_yahoo_history(client, ticker)
                series = parse_yahoo_series(res)
                
                points = []
                for d in sorted(series.keys()):
                    points.append({
                        "date": d,
                        "close": series[d]["close"]
                    })
                
                # Guardar en caché
                try:
                    os.makedirs(os.path.dirname(filepath), exist_ok=True)
                    with open(filepath, "w", encoding="utf-8") as f:
                        json.dump(points, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass
                return points
        except Exception as e:
            print(f"Error descargando {ticker} de Yahoo Finance: {e}")
            
    # Para acciones locales, usamos get_stock_history_processed para que actualice la caché automáticamente si está desactualizada
    try:
        from backend.services.analytics import get_stock_history_processed
        data = await get_stock_history_processed(ticker)
        if data:
            return [{"date": x.date, "close": x.close} for x in data]
    except Exception as e:
        print(f"Error cargando historial procesado para {ticker}: {e}")
            
    # Fallback si falla el actualizador
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [{"date": x["date"], "close": x["close"]} for x in data if "close" in x]
        except Exception:
            pass
            
    return []

async def get_merval_mep_points() -> List[Dict[str, Any]]:
    """Calcula el histórico del S&P Merval en MEP (USD) dividiendo ^MERV por USD_MEP."""
    merv_pts = await get_history_points("^MERV", is_us=False)
    mep_pts = await get_history_points("USD_MEP", is_us=False)
    
    mep_map = {x["date"]: x["close"] for x in mep_pts if x.get("close")}
    
    merv_mep_pts = []
    for x in merv_pts:
        dt = x["date"]
        if dt in mep_map and mep_map[dt] > 0 and x.get("close") is not None:
            merv_mep_pts.append({
                "date": dt,
                "close": x["close"] / mep_map[dt]
            })
    merv_mep_pts.sort(key=lambda x: x["date"])
    return merv_mep_pts

async def calculate_rotation_coordinates(panel: str) -> Dict[str, Any]:
    """Calcula RS-Ratio y RS-Momentum utilizando estandarización transversal (Cross-Sectional)."""
    if panel == "acciones":
        benchmark_ticker = "MERVAL_MEP"
        tickers = LOCAL_TICKERS
        is_us = False
        benchmark_task = get_merval_mep_points()
    else:  # cedears
        benchmark_ticker = "SPY"
        tickers = US_SECTOR_ETFS
        is_us = True
        benchmark_task = get_history_points(benchmark_ticker, is_us=True)
        
    # Descargar/cargar históricos en paralelo
    asset_tasks = [get_history_points(t, is_us=is_us) for t in tickers]
    
    benchmark_pts, *assets_pts_list = await asyncio.gather(benchmark_task, *asset_tasks)
    
    if not benchmark_pts:
        return {"error": f"No se pudo cargar el historial del benchmark {benchmark_ticker}"}
        
    bench_map = {x["date"]: x["close"] for x in benchmark_pts if x.get("close")}
    
    # 1. Alinear fechas y crear mapas de cierre {fecha: close}
    all_dates = sorted(list(bench_map.keys()))
    assets_maps = {}
    for idx, ticker in enumerate(tickers):
        pts = assets_pts_list[idx]
        if pts:
            assets_maps[ticker] = {x["date"]: x["close"] for x in pts if x.get("close") is not None}
            
    # Filtrar fechas donde al menos 3 activos tengan precio y el benchmark tenga precio
    valid_dates = []
    for dt in all_dates:
        count = sum(1 for t in assets_maps if dt in assets_maps[t])
        if count >= 3:
            valid_dates.append(dt)
            
    valid_dates.sort()
    n_dates = len(valid_dates)
    if n_dates < 20:
        return {"error": "No hay suficientes fechas comunes para calcular RRG"}
        
    # 2. Calcular Fuerza Relativa (RS) cruda para cada activo
    rs_series = {}
    for t in tickers:
        if t in assets_maps:
            rs_series[t] = []
            for dt in valid_dates:
                if dt in assets_maps[t]:
                    rs_series[t].append(assets_maps[t][dt] / bench_map[dt])
                else:
                    rs_series[t].append(None)
                    
    # 3. Calcular la media móvil de RS (14 períodos) para suavizado previo
    sma_rs_series = {}
    for t in tickers:
        if t in rs_series:
            sma_rs_series[t] = compute_sma(rs_series[t], 14)
            
    # 4. Estandarización Transversal de la Fuerza Relativa (RS-Ratio / Eje X)
    ratio_series = {t: [None] * n_dates for t in tickers if t in rs_series}
    for i in range(n_dates):
        vals = []
        for t in ratio_series:
            val = sma_rs_series[t][i]
            if val is not None:
                vals.append(val)
        if len(vals) >= 3:
            mean_val = sum(vals) / len(vals)
            var_val = sum((x - mean_val) ** 2 for x in vals) / len(vals)
            std_val = var_val ** 0.5
            if std_val > 0:
                for t in ratio_series:
                    val = sma_rs_series[t][i]
                    if val is not None:
                        z = (val - mean_val) / std_val
                        ratio_series[t][i] = 100.0 + z * 10.0
                        
    # 5. Calcular la Tasa de Cambio (ROC de 5 días hábiles) del Ratio
    roc_series = {}
    for t in ratio_series:
        roc_series[t] = [None] * n_dates
        for i in range(5, n_dates):
            val_prev = ratio_series[t][i - 5]
            val_curr = ratio_series[t][i]
            if val_prev is not None and val_curr is not None and val_prev != 0:
                roc_series[t][i] = ((val_curr - val_prev) / val_prev) * 100.0
                
    # 6. Estandarización Transversal del ROC (RS-Momentum / Eje Y)
    momentum_series = {t: [None] * n_dates for t in tickers if t in rs_series}
    for i in range(n_dates):
        vals = []
        for t in momentum_series:
            val = roc_series[t][i]
            if val is not None:
                vals.append(val)
        if len(vals) >= 3:
            mean_val = sum(vals) / len(vals)
            var_val = sum((x - mean_val) ** 2 for x in vals) / len(vals)
            std_val = var_val ** 0.5
            if std_val > 0:
                for t in momentum_series:
                    val = roc_series[t][i]
                    if val is not None:
                        z = (val - mean_val) / std_val
                        momentum_series[t][i] = 100.0 + z * 10.0
                        
    # 7. Suavizar las series finales con EMA de 5 períodos para remover ruido diario
    final_ratio_series = {}
    final_momentum_series = {}
    for t in ratio_series:
        final_ratio_series[t] = compute_ema(ratio_series[t], 5)
        final_momentum_series[t] = compute_ema(momentum_series[t], 5)
        
    # 8. Dar formato a los resultados de salida
    results = {}
    for t in ratio_series:
        series_points = []
        for i in range(n_dates):
            rx = final_ratio_series[t][i]
            ry = final_momentum_series[t][i]
            if rx is not None and ry is not None:
                series_points.append({
                    "date": valid_dates[i],
                    "x": round(rx, 2),
                    "y": round(ry, 2)
                })
        if len(series_points) > 0:
            results[t] = series_points[-45:]
            
    # Alinear fechas finales de salida
    all_dates_lists = [[pt["date"] for pt in results[t]] for t in results]
    if not all_dates_lists:
        return {"benchmark": benchmark_ticker, "dates": [], "assets": {}}
        
    common_dates = set(all_dates_lists[0])
    for lst in all_dates_lists[1:]:
        common_dates.intersection_update(lst)
        
    sorted_common_dates = sorted(list(common_dates))
    
    final_assets = {}
    for t in results:
        final_assets[t] = [pt for pt in results[t] if pt["date"] in common_dates]
        
    return {
        "benchmark": benchmark_ticker,
        "dates": sorted_common_dates,
        "assets": final_assets
    }
