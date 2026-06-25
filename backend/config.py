import os

DATA912_BASE_URL = "https://data912.com"
UPDATE_INTERVAL_SECONDS = 30  # 30 segundos
CACHE_TTL_SECONDS = 15

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATOS_DIR = os.path.join(BASE_DIR, "datos")
ACCIONES_JSON_PATH = os.path.join(DATOS_DIR, "acciones.json")
HISTORIAL_DIR = os.path.join(DATOS_DIR, "historial")

LIVE_ENDPOINTS = {
    "arg_stocks": "/live/arg_stocks",
}
