import os

DATA912_BASE_URL = "https://data912.com"
UPDATE_INTERVAL_SECONDS = 30  # 30 segundos
CACHE_TTL_SECONDS = 15

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATOS_DIR = os.path.join(BASE_DIR, "datos")
ACCIONES_JSON_PATH = os.path.join(DATOS_DIR, "acciones.json")
CEDEARS_JSON_PATH = os.path.join(DATOS_DIR, "cedears.json")
CEDEAR_NAMES_JSON_PATH = os.path.join(DATOS_DIR, "cedear_names.json")
CEDEAR_RATIOS_JSON_PATH = os.path.join(DATOS_DIR, "cedear_ratios.json")
DOLARES_JSON_PATH = os.path.join(DATOS_DIR, "dolares.json")
MERVAL_CCL_JSON_PATH = os.path.join(DATOS_DIR, "merval_ccl.json")
HISTORIAL_DIR = os.path.join(DATOS_DIR, "historial")

LIVE_ENDPOINTS = {
    "arg_stocks": "/live/arg_stocks",
    "arg_cedears": "/live/arg_cedears",
}
