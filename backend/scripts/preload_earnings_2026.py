import os
import sys
import time
from datetime import datetime, timedelta

# Asegurar que el directorio raíz del proyecto esté en PYTHONPATH
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend.services.earnings_service import _get_nasdaq_earnings_for_date

def preload_2026_earnings():
    start_date = datetime(2026, 1, 1)
    end_date = datetime.now()
    
    current = start_date
    total_days = (end_date - start_date).days + 1
    processed = 0
    cached = 0
    fetched = 0
    
    print(f"Iniciando precarga de earnings desde {start_date.strftime('%Y-%m-%d')} hasta {end_date.strftime('%Y-%m-%d')} ({total_days} dias)...")
    
    while current <= end_date:
        d_str = current.strftime("%Y-%m-%d")
        processed += 1
        
        # Saltar fines de semana (Sábado = 5, Domingo = 6)
        if current.weekday() in [5, 6]:
            current += timedelta(days=1)
            continue
            
        try:
            res = _get_nasdaq_earnings_for_date(d_str)
            if res:
                fetched += 1
                print(f"[{processed}/{total_days}] {d_str}: {len(res)} empresas guardadas en cache.")
            else:
                print(f"[{processed}/{total_days}] {d_str}: Sin resultados.")
        except Exception as e:
            print(f"[{processed}/{total_days}] {d_str}: Error ({e})")
            
        current += timedelta(days=1)
        time.sleep(0.05)
        
    print(f"Precarga completada. Dias procesados: {processed}. Dias con balances: {fetched}.")

if __name__ == "__main__":
    preload_2026_earnings()
