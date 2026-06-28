import os
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from backend.models import AssetQuote, MarketSummary, StockHistoryPoint, AssetFundamentals
from backend.services.analytics import (
    get_market_summary, get_stock_history_processed, get_stored_stocks, get_stored_cedears,
    is_history_cache_fresh, get_cached_stocks_json, get_cached_cedears_json
)
from backend.services.yahoo_finance import yahoo_finance_service
from backend.services.updater import start_background_updater
from backend.services.data912_client import data912_client
from backend.services.merval_service import get_merval_ccl
from backend.config import HISTORIAL_DIR

@asynccontextmanager
async def lifespan(app: FastAPI):
    updater_task = asyncio.create_task(start_background_updater())
    yield
    updater_task.cancel()
    try:
        await updater_task
    except asyncio.CancelledError:
        pass
    await data912_client.close()

app = FastAPI(
    title="Monitor de Mercado Data912 (Tablet Edition)",
    description="Backend FastAPI con consulta periódica (cada 5 min) y guardado en backend/datos/acciones.json.",
    version="1.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.get("/api/summary", response_model=MarketSummary)
async def api_summary():
    try:
        return await get_market_summary()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo resumen: {str(e)}")

@app.get("/api/merval-ccl")
async def api_merval_ccl():
    try:
        return await get_merval_ccl()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo Merval CCL: {str(e)}")

@app.get("/api/panel/stocks", response_model=List[AssetQuote])
async def api_panel_stocks():
    try:
        raw_json = get_cached_stocks_json()
        if raw_json:
            return Response(content=raw_json, media_type="application/json")
        return await get_stored_stocks()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo panel: {str(e)}")

@app.get("/api/panel/cedears", response_model=List[AssetQuote])
async def api_panel_cedears():
    try:
        raw_json = get_cached_cedears_json()
        if raw_json:
            return Response(content=raw_json, media_type="application/json")
        return await get_stored_cedears()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo panel de cedears: {str(e)}")

@app.get("/api/fundamentals/{ticker}", response_model=AssetFundamentals)
async def api_fundamentals(ticker: str):
    try:
        return await yahoo_finance_service.fetch_fundamentals(ticker)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo fundamentales: {str(e)}")

@app.get("/api/history/{ticker}", response_model=List[StockHistoryPoint])
async def api_history(ticker: str):
    try:
        ticker = ticker.upper()
        filepath = os.path.join(HISTORIAL_DIR, f"{ticker}.json")
        
        # 1. Si existe caché local fresco, responder en crudo (RAW)
        # Esto evita parsear JSON en Python y la lentitud de validación/serialización Pydantic
        if is_history_cache_fresh(filepath):
            try:
                def read_file():
                    with open(filepath, "r", encoding="utf-8") as f:
                        return f.read()
                raw_json = await asyncio.to_thread(read_file)
                return Response(content=raw_json, media_type="application/json")
            except Exception as e:
                print(f"Error leyendo caché crudo para {ticker}: {e}")

        # 2. Si no, procesarlo (se descarga de la API, se calcula SMA/RSI y se guarda en disco)
        history = await get_stock_history_processed(ticker)
        if not history:
            raise HTTPException(status_code=404, detail=f"Histórico no encontrado para {ticker}")
            
        # Intentar responder con el archivo recién guardado en crudo para evitar serialización Pydantic
        if os.path.exists(filepath) and os.path.getsize(filepath) > 10:
            try:
                def read_file():
                    with open(filepath, "r", encoding="utf-8") as f:
                        return f.read()
                raw_json = await asyncio.to_thread(read_file)
                return Response(content=raw_json, media_type="application/json")
            except Exception:
                pass
                
        return history
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo histórico: {str(e)}")

frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
