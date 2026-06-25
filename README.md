# ArgMonitor — Monitor de Acciones Argentinas (Tablet Edition)

Aplicación web completa optimizada para visualización en Tablets (iPad, Android Tablets) e integración directa con la API pública de **data912.com**, utilizando **FastAPI** y cálculos técnicos con **Python**.

## Características
- 📈 **Cotizaciones en Tiempo Real:** Dólares MEP y CCL + Panel completo de Acciones Argentinas (BCBA).
- 🐍 **Motor Analítico Python:** Cálculo de Top Ganadoras, Top Perdedoras, Medias Móviles (SMA 20 y SMA 50) e Índice de Fuerza Relativa (RSI 14) sobre datos históricos OHLC.
- 🎨 **Diseño Premium:** Dark Mode elegante, Glassmorphism, tipografía Google Fonts (Inter / Outfit) y objetivos de toque táctiles amplios (Touch-first).
- ⚡ **Caché Inteligente:** Protección interna en memoria en el backend para no saturar los límites de peticiones de Data912 (120 req/min) aunque recargues continuamente.
- 🕯️ **Gráficos Profesionales:** Integración con TradingView Lightweight Charts.

## Instrucciones de Ejecución

1. **Instalar dependencias:**
   ```powershell
   pip install -r requirements.txt
   ```

2. **Iniciar el servidor FastAPI:**
   Desde la carpeta raíz del proyecto (`App Monitor`), ejecutá:
   ```powershell
   python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. **Ver en tu Escritorio / PC:**
   Abrí tu navegador web e ingresá a:
   `http://localhost:8000`

4. **Ver en tu Tablet (iPad / Android):**
   Asegurate de que tu tablet esté conectada al **mismo Wi-Fi** que tu PC.
   Buscá la IP local de tu PC (ejemplo: `192.168.1.50`). En tu tablet, abrí el navegador web (Safari / Chrome) e ingresá:
   `http://192.168.1.50:8000`

---
*Desarrollado con FastAPI, Python 3 y Vanilla JS.*
