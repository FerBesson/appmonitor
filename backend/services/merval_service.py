import os
import json
import time
import httpx
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, List
from backend.config import MERVAL_CCL_JSON_PATH

YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

async def fetch_yahoo_chart_meta(client: httpx.AsyncClient, symbol: str) -> Dict[str, Any]:
    url = f"{YAHOO_BASE_URL}{symbol}"
    response = await client.get(url, params={"range": "1d"}, headers=HEADERS)
    response.raise_for_status()
    data = response.json()
    
    if "chart" not in data or not data["chart"].get("result"):
        raise ValueError(f"No chart data found for symbol: {symbol}")
        
    return data["chart"]["result"][0]["meta"]

async def fetch_argentinadatos_ccl(client: httpx.AsyncClient) -> Optional[float]:
    # Intentar obtener CCL en tiempo real desde DolarApi
    try:
        response = await client.get("https://dolarapi.com/v1/dolares/contadoconliqui", timeout=5.0)
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, dict):
                venta = data.get("venta") or data.get("compra")
                if venta:
                    return float(venta)
    except Exception as e:
        print(f"Advertencia: No se pudo obtener CCL de DolarApi: {e}")
        
    # Fallback: intentar ArgentinaDatos usando la caché de updater (evita rate limiting)
    try:
        from backend.services.updater import get_cached_dolar_history
        dolar_history = await get_cached_dolar_history()
        if dolar_history:
            ccl_data = [x for x in dolar_history if x.get("casa") == "contadoconliqui"]
            if ccl_data:
                ccl_data.sort(key=lambda x: x.get("fecha", ""))
                last_ccl = ccl_data[-1]
                venta = last_ccl.get("venta") or last_ccl.get("compra")
                if venta:
                    return float(venta)
    except Exception as e:
        print(f"Advertencia: No se pudo obtener CCL de ArgentinaDatos (caché): {e}")
        
    return None

async def fetch_and_save_merval_ccl() -> Dict[str, Any]:
    """Consulta las APIs externas, calcula el Merval en CCL y lo guarda en backend/datos/merval_ccl.json"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # 1. Consultar Yahoo Finance para MERVAL en pesos y cotizaciones de Galicia (local/ADR)
            # Esto se hace en paralelo.
            merv_task = fetch_yahoo_chart_meta(client, "^MERV")
            ggal_ba_task = fetch_yahoo_chart_meta(client, "GGAL.BA")
            ggal_us_task = fetch_yahoo_chart_meta(client, "GGAL")
            
            merv_meta, ggal_ba_meta, ggal_us_meta = await asyncio.gather(
                merv_task, ggal_ba_task, ggal_us_task
            )
            
            merv_price = merv_meta.get("regularMarketPrice")
            merv_prev = merv_meta.get("previousClose") or merv_meta.get("chartPreviousClose")
            
            ggal_ba_price = ggal_ba_meta.get("regularMarketPrice")
            ggal_us_price = ggal_us_meta.get("regularMarketPrice")
            
            ggal_ba_prev = ggal_ba_meta.get("previousClose") or ggal_ba_meta.get("chartPreviousClose")
            ggal_us_prev = ggal_us_meta.get("previousClose") or ggal_us_meta.get("chartPreviousClose")
            
            # Validación de datos esenciales de Yahoo Finance
            if not all([merv_price, merv_prev, ggal_ba_prev, ggal_us_prev]):
                raise ValueError("Datos esenciales de Merval/Galicia nulos en Yahoo Finance")
            
            # 2. Obtener tipo de cambio CCL actual
            ccl_current = None
            
            # Prioridad 1: ArgentinaDatos (último valor de CCL)
            ccl_current = await fetch_argentinadatos_ccl(client)
            if ccl_current:
                print(f"CCL obtenido de ArgentinaDatos: {ccl_current}")
                
            # Prioridad 2: Cálculo directo GGAL.BA * 10 / GGAL (Yahoo Finance)
            if not ccl_current and ggal_ba_price and ggal_us_price:
                ccl_current = (ggal_ba_price * 10.0) / ggal_us_price
                print(f"CCL calculado vía Yahoo Finance (GGAL): {ccl_current}")
            
            # Si no logramos calcular la tasa de cambio actual, lanzamos error
            if not ccl_current or ccl_current <= 0:
                raise ValueError("No se pudo determinar una tasa CCL válida actual")
                
            # 3. Obtener tipo de cambio CCL previo (para el porcentaje de variación diaria)
            ccl_prev = (ggal_ba_prev * 10.0) / ggal_us_prev
            if not ccl_prev or ccl_prev <= 0:
                ccl_prev = ccl_current # Fallback de seguridad
                
            # 4. Calcular Merval en CCL
            merval_ccl_current = merv_price / ccl_current
            merval_ccl_prev = merv_prev / ccl_prev
            
            # Calcular variación
            change_pct = ((merval_ccl_current - merval_ccl_prev) / merval_ccl_prev) * 100.0
            
            payload = {
                "merval_ccl": round(merval_ccl_current, 2),
                "change_pct": round(change_pct, 2),
                "ccl_rate": round(ccl_current, 2),
                "updated_at": datetime.now().isoformat()
            }
            
            # Guardar en archivo JSON aparte
            os.makedirs(os.path.dirname(MERVAL_CCL_JSON_PATH), exist_ok=True)
            temp_path = MERVAL_CCL_JSON_PATH + ".tmp"
            
            def save_json():
                with open(temp_path, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
                os.replace(temp_path, MERVAL_CCL_JSON_PATH)
                
            await asyncio.to_thread(save_json)
            print(f"Merval CCL actualizado y guardado en merval_ccl.json: {payload}")
            return payload
            
        except Exception as e:
            print(f"Error actualizando Merval CCL: {e}")
            # Si falla, intentar leer del archivo existente
            stored = await get_stored_merval_ccl()
            if stored:
                return stored
            raise e

async def get_stored_merval_ccl() -> Optional[Dict[str, Any]]:
    """Lee el Merval CCL almacenado en merval_ccl.json de forma asíncrona"""
    if os.path.exists(MERVAL_CCL_JSON_PATH):
        try:
            def read_json():
                with open(MERVAL_CCL_JSON_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            return await asyncio.to_thread(read_json)
        except Exception as e:
            print(f"Error leyendo merval_ccl.json: {e}")
    return None

async def get_merval_ccl() -> Dict[str, Any]:
    """Retorna los datos del Merval CCL leyendo del archivo o calculándolo en vivo si no existe"""
    stored = await get_stored_merval_ccl()
    if stored:
        return stored
    return await fetch_and_save_merval_ccl()

async def fetch_yahoo_history(client: httpx.AsyncClient, symbol: str) -> Dict[str, Any]:
    url = f"{YAHOO_BASE_URL}{symbol}"
    # Pedir 25 años de historial diario a Yahoo Finance
    response = await client.get(url, params={"range": "25y", "interval": "1d"}, headers=HEADERS)
    response.raise_for_status()
    data = response.json()
    if "chart" not in data or not data["chart"].get("result"):
        raise ValueError(f"No chart data found for history of symbol: {symbol}")
    return data["chart"]["result"][0]

def parse_yahoo_series(result: dict) -> Dict[str, dict]:
    from datetime import timezone
    timestamps = result.get("timestamp", [])
    quotes = result.get("indicators", {}).get("quote", [{}])[0]
    
    opens = quotes.get("open", [])
    highs = quotes.get("high", [])
    lows = quotes.get("low", [])
    closes = quotes.get("close", [])
    volumes = quotes.get("volume", [])
    
    series_map = {}
    for i, ts in enumerate(timestamps):
        date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        
        c = closes[i] if i < len(closes) else None
        o = opens[i] if i < len(opens) else c
        h = highs[i] if i < len(highs) else max(o, c) if o and c else None
        l = lows[i] if i < len(lows) else min(o, c) if o and c else None
        v = volumes[i] if i < len(volumes) else 0.0
        
        if c is not None:
            series_map[date_str] = {
                "open": o,
                "high": h,
                "low": l,
                "close": c,
                "volume": v or 0.0
            }
    return series_map

async def fetch_and_save_merval_ccl_history() -> List[StockHistoryPoint]:
    """Descarga históricos de ^MERV, GGAL.BA y GGAL, calcula el histórico de Merval en CCL y lo guarda en backend/datos/historial/MERVAL_CCL.json"""
    from backend.config import HISTORIAL_DIR
    from backend.models import StockHistoryPoint
    
    filepath = os.path.join(HISTORIAL_DIR, "MERVAL_CCL.json")
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            # Descargar los 3 históricos en paralelo
            merv_task = fetch_yahoo_history(client, "^MERV")
            ggal_ba_task = fetch_yahoo_history(client, "GGAL.BA")
            ggal_us_task = fetch_yahoo_history(client, "GGAL")
            
            merv_res, ggal_ba_res, ggal_us_res = await asyncio.gather(
                merv_task, ggal_ba_task, ggal_us_task
            )
            
            merv_map = parse_yahoo_series(merv_res)
            ggal_ba_map = parse_yahoo_series(ggal_ba_res)
            ggal_us_map = parse_yahoo_series(ggal_us_res)
            
            merv_dates = sorted(list(merv_map.keys()))
            if not merv_dates:
                raise ValueError("No se encontraron fechas de históricos para el Merval")
                
            # Alinear tipo de cambio CCL (GGAL) llenando días faltantes con la última tasa conocida
            ccl_rates = {}
            last_ccl = 1500.0  # Tasa por defecto
            for d in merv_dates:
                g_ba = ggal_ba_map.get(d)
                g_us = ggal_us_map.get(d)
                if g_ba and g_us and g_us["close"] > 0:
                    last_ccl = (g_ba["close"] * 10.0) / g_us["close"]
                ccl_rates[d] = last_ccl
                
            points = []
            for d in merv_dates:
                ccl = ccl_rates[d]
                m_data = merv_map[d]
                
                # Omitir días con datos corruptos
                if m_data["open"] is None or m_data["high"] is None or m_data["low"] is None or m_data["close"] is None:
                    continue
                    
                points.append({
                    "date": d,
                    "open": round(m_data["open"] / ccl, 2),
                    "high": round(m_data["high"] / ccl, 2),
                    "low": round(m_data["low"] / ccl, 2),
                    "close": round(m_data["close"] / ccl, 2),
                    "volume": m_data["volume"]
                })
                
            points.sort(key=lambda x: x["date"])
            
            closes = [p["close"] for p in points]
            n = len(closes)
            
            # Calcular indicadores SMA 20 y SMA 50
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
        
            # Calcular indicador RSI (14)
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
                
            # Guardar en caché física
            try:
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                serializable_result = [p.model_dump() for p in result]
                
                # Preparar también ^MERV (en pesos)
                merv_list = []
                for d in sorted(merv_map.keys()):
                    m_data = merv_map[d]
                    if m_data["open"] is not None and m_data["close"] is not None:
                        merv_list.append({
                            "date": d,
                            "open": round(m_data["open"], 2) if m_data["open"] else 0.0,
                            "high": round(m_data["high"], 2) if m_data["high"] else 0.0,
                            "low": round(m_data["low"], 2) if m_data["low"] else 0.0,
                            "close": round(m_data["close"], 2) if m_data["close"] else 0.0,
                            "volume": m_data["volume"] or 0.0
                        })
                
                def save_cache():
                    # Guardar MERVAL_CCL
                    temp_filepath = filepath + ".tmp"
                    with open(temp_filepath, "w", encoding="utf-8") as f:
                        json.dump(serializable_result, f, ensure_ascii=False, indent=2)
                    os.replace(temp_filepath, filepath)
                    
                    # Guardar ^MERV
                    merv_filepath = os.path.join(os.path.dirname(filepath), "^MERV.json")
                    temp_merv_filepath = merv_filepath + ".tmp"
                    with open(temp_merv_filepath, "w", encoding="utf-8") as f:
                        json.dump(merv_list, f, ensure_ascii=False, indent=2)
                    os.replace(temp_merv_filepath, merv_filepath)
                    
                await asyncio.to_thread(save_cache)
                print(f"Historial de MERVAL_CCL y ^MERV guardado exitosamente en caché.")
            except Exception as e:
                print(f"Error guardando caché de historial MERVAL_CCL / ^MERV: {e}")
                
            return result
        except Exception as e:
            print(f"Error procesando historial de MERVAL_CCL: {e}")
            raise e
