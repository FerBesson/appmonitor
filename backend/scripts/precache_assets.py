import os
import sys
import json
import asyncio
from datetime import datetime, timedelta

# Asegurar que el directorio raíz del proyecto esté en el path de Python
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.config import HISTORIAL_DIR, DATOS_DIR
from backend.services.updater import fetch_and_save_market_data, get_base_ticker
from backend.services.merval_service import fetch_and_save_merval_ccl
from backend.services.analytics import get_stock_history_processed, get_stored_cedears, get_stored_stocks
from backend.services.yahoo_finance import yahoo_finance_service, FUNDAMENTALES_DIR

async def main():
    print("=" * 60)
    print("INICIANDO PRECARGA FORZADA DE ACTIVOS (ACCIONES Y CEDEARS)")
    print("=" * 60)
    print(f"Hora de inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 1. Cargar las últimas cotizaciones (cierre del viernes ya que es fin de semana)
    print("\n[1/3] Descargando cotizaciones del cierre más reciente...")
    try:
        await fetch_and_save_market_data()
        await fetch_and_save_merval_ccl()
        print("-> Cotizaciones actualizadas correctamente.")
    except Exception as e:
        print(f"-> ERROR al actualizar cotizaciones: {e}")
    
    # 2. Obtener lista de todos los activos almacenados
    print("\n[2/3] Obteniendo lista de activos...")
    try:
        stocks = await get_stored_stocks()
        cedears = await get_stored_cedears()
    except Exception as e:
        print(f"-> ERROR al cargar activos desde almacenamiento local: {e}")
        return

    # Unir todos los tickers
    all_tickers = {s.ticker.upper() for s in stocks} | {c.ticker.upper() for c in cedears}
    
    # Filtrar solo los tickers base para evitar descargas duplicadas de variantes MEP/CCL
    base_tickers = set()
    for ticker in all_tickers:
        # Ignorar dólares e índices
        if ticker in ["USD_MEP", "USD_CCL", "USD_MAYORISTA", "MERVAL_CCL"]:
            continue
            
        t_upper = ticker.upper()
        # Si termina en C o D y el base sin esa letra está en el set de tickers, es una variante
        if t_upper.endswith("C") or t_upper.endswith("D"):
            candidate = t_upper[:-1]
            if candidate in all_tickers:
                base_tickers.add(candidate)
                continue
            if t_upper.endswith("DD"):
                candidate = t_upper[:-2]
                if candidate in all_tickers:
                    base_tickers.add(candidate)
                    continue
        if t_upper.endswith(".D"):
            candidate = t_upper[:-2]
            if candidate in all_tickers:
                base_tickers.add(candidate)
                continue
                
        base_tickers.add(ticker)

    # Añadir MERVAL_CCL explícitamente para el historial del índice
    base_tickers = sorted(list(base_tickers))
    print(f"-> Se encontraron {len(all_tickers)} tickers en total.")
    print(f"-> Se identificaron {len(base_tickers)} tickers base a precargar.")
    
    # Inicializar la miga (crumb) de Yahoo Finance de forma secuencial antes de lanzar peticiones concurrentes
    print("\n[3/3] Inicializando sesión de Yahoo Finance...")
    try:
        crumb = await yahoo_finance_service._get_crumb()
        print(f"-> Conexión establecida con Yahoo Finance (Crumb: {crumb})")
    except Exception as e:
        print(f"-> Advertencia: No se pudo obtener crumb de Yahoo Finance: {e}")

    # Semáforo para limitar la concurrencia y no saturar las APIs (especialmente Data912 con 120 req/min)
    sem = asyncio.Semaphore(3)
    
    stats = {
        "historial_descargados": 0,
        "historial_existentes": 0,
        "historial_errores": 0,
        "fundamentos_descargados": 0,
        "fundamentos_existentes": 0,
        "fundamentos_errores": 0
    }

    async def process_ticker(ticker: str, index: int, total: int):
        # 1. Comprobar Historial
        hist_file = os.path.join(HISTORIAL_DIR, f"{ticker}.json")
        hist_up_to_date = False
        if os.path.exists(hist_file) and os.path.getsize(hist_file) > 10:
            try:
                mtime = os.path.getmtime(hist_file)
                if datetime.fromtimestamp(mtime).date() == datetime.today().date():
                    hist_up_to_date = True
            except Exception:
                pass

        if hist_up_to_date:
            stats["historial_existentes"] += 1
        else:
            async with sem:
                try:
                    await get_stock_history_processed(ticker)
                    stats["historial_descargados"] += 1
                except Exception as e:
                    stats["historial_errores"] += 1
                    print(f"[{index}/{total}] Error descargando historial para {ticker}: {e}")
                # Espera de cortesía para respetar el rate limit de Data912
                await asyncio.sleep(0.7)

        # 2. Comprobar Fundamentos (si no es el índice MERVAL_CCL)
        if ticker != "MERVAL_CCL":
            # Normalizar ticker para Yahoo Finance
            norm_ticker = yahoo_finance_service._normalize_ticker(ticker)
            fund_file = os.path.join(FUNDAMENTALES_DIR, f"{norm_ticker}.json")
            fund_up_to_date = False
            
            if os.path.exists(fund_file) and os.path.getsize(fund_file) > 10:
                try:
                    mtime = os.path.getmtime(fund_file)
                    if datetime.now() - datetime.fromtimestamp(mtime) < timedelta(hours=24):
                        fund_up_to_date = True
                except Exception:
                    pass

            if fund_up_to_date:
                stats["fundamentos_existentes"] += 1
            else:
                async with sem:
                    try:
                        fund = await yahoo_finance_service.fetch_fundamentals(ticker)
                        # Si no se pudo obtener información real, no incrementamos como error de red pero registramos el intento
                        if fund.sector == "N/A" and fund.industry == "N/A" and fund.market_cap == "N/A":
                            # Puede ser que Yahoo Finance no lo tenga, pero lo guardó como N/A cacheado
                            pass
                        stats["fundamentos_descargados"] += 1
                    except Exception as e:
                        stats["fundamentos_errores"] += 1
                        print(f"[{index}/{total}] Error descargando fundamentos para {ticker}: {e}")
                    # Espera corta para Yahoo Finance
                    await asyncio.sleep(0.3)
                    
        # Imprimir progreso cada 15 activos
        if index % 15 == 0 or index == total:
            print(f"-> Progreso: {index}/{total} activos procesados...")

    print(f"\nProcesando {len(base_tickers)} activos base...")
    
    # Procesar de forma asíncrona pero controlando concurrencia
    tasks = []
    for i, ticker in enumerate(base_tickers, 1):
        tasks.append(process_ticker(ticker, i, len(base_tickers)))
        
    await asyncio.gather(*tasks)

    # 4. Mostrar resumen
    print("\n" + "=" * 60)
    print("RESUMEN DE LA PRECARGA")
    print("=" * 60)
    print(f"Total activos base procesados: {len(base_tickers)}")
    print(f"Historiales:")
    print(f"  - Ya actualizados (omitidos): {stats['historial_existentes']}")
    print(f"  - Descargados ahora:          {stats['historial_descargados']}")
    print(f"  - Con error:                  {stats['historial_errores']}")
    print(f"Fundamentos:")
    print(f"  - Ya actualizados (omitidos): {stats['fundamentos_existentes']}")
    print(f"  - Descargados/intentados:     {stats['fundamentos_descargados']}")
    print(f"  - Con error de red:           {stats['fundamentos_errores']}")
    print(f"Hora de finalización: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
