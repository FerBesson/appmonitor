import os
import json
import time
import httpx
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from backend.config import DATOS_DIR
from backend.models import AssetFundamentals

FUNDAMENTALES_DIR = os.path.join(DATOS_DIR, "fundamentos")
CACHE_EXPIRY_HOURS = 24

class YahooFinanceService:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        self.crumb = None
        self.client = None

    def get_client(self) -> httpx.AsyncClient:
        if self.client is None:
            self.client = httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=10.0)
        return self.client

    async def _get_crumb(self) -> Optional[str]:
        if self.crumb:
            return self.crumb
        
        client = self.get_client()
        try:
            # First hit fc.yahoo.com (sometimes optional but sets cookies)
            try:
                await client.get("https://fc.yahoo.com", timeout=5.0)
            except Exception:
                pass
            
            # Fetch crumb
            resp = await client.get("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=5.0)
            if resp.status_code == 200:
                self.crumb = resp.text.strip()
                return self.crumb
        except Exception as e:
            print(f"Error fetching Yahoo Finance crumb: {e}")
        return None

    def _normalize_ticker(self, ticker: str) -> str:
        # Standard normalization
        base = ticker.upper()
        
        # Strip currency endings (e.g. BMA.D, ALUAD -> BMA, ALUA)
        if base.endswith("DD") or base.endswith(".D"):
            base = base[:-2]
        elif base.endswith("D") and base not in ["YPFD", "LOMA", "IRSA", "LEDE"]:
            base = base[:-1]
            
        if base == "TECO":
            base = "TECO2"
            
        # Append .BA for Argentine stocks
        if not base.endswith(".BA"):
            return f"{base}.BA"
        return base

    async def fetch_fundamentals(self, ticker: str) -> AssetFundamentals:
        normalized_ticker = self._normalize_ticker(ticker)
        
        # Check cache
        os.makedirs(FUNDAMENTALES_DIR, exist_ok=True)
        cache_path = os.path.join(FUNDAMENTALES_DIR, f"{normalized_ticker}.json")
        
        if os.path.exists(cache_path):
            try:
                mtime = os.path.getmtime(cache_path)
                if datetime.now() - datetime.fromtimestamp(mtime) < timedelta(hours=CACHE_EXPIRY_HOURS):
                    with open(cache_path, "r", encoding="utf-8") as f:
                        cached_data = json.load(f)
                        return AssetFundamentals(**cached_data)
            except Exception as e:
                print(f"Error reading fundamentals cache for {ticker}: {e}")

        # Fetch from Yahoo Finance
        print(f"Fetching fundamentals from Yahoo Finance for: {normalized_ticker}")
        client = self.get_client()
        crumb = await self._get_crumb()
        
        modules = "summaryDetail,assetProfile,financialData,defaultKeyStatistics"
        url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{normalized_ticker}"
        
        params = {"modules": modules}
        if crumb:
            params["crumb"] = crumb
            
        try:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                raw_data = resp.json()
                results = raw_data.get("quoteSummary", {}).get("result")
                if results:
                    result = results[0]
                    profile = result.get("assetProfile", {})
                    detail = result.get("summaryDetail", {})
                    stats = result.get("defaultKeyStatistics", {})
                    financials = result.get("financialData", {})
                    
                    # Safe helper to get string formatted values
                    def _get_val(dct, keys):
                        for k in keys:
                            if k in dct:
                                val = dct[k]
                                if isinstance(val, dict):
                                    return val.get("fmt") or val.get("longFmt") or str(val.get("raw", ""))
                                return str(val)
                        return "N/A"
                    
                    fundamentals_dict = {
                        "ticker": ticker.upper(),
                        "sector": profile.get("sector", "N/A"),
                        "industry": profile.get("industry", "N/A"),
                        "market_cap": _get_val(detail, ["marketCap"]),
                        "pe_ratio": _get_val(detail, ["trailingPE"]),
                        "dividend_yield": _get_val(detail, ["dividendYield"]),
                        "eps": _get_val(stats, ["trailingEps", "eps"]),
                        "beta": _get_val(stats, ["beta"]),
                        "price_to_book": _get_val(stats, ["priceToBook"]),
                        "profit_margin": _get_val(financials, ["profitMargins"]),
                        "description": profile.get("longBusinessSummary", "No description available.")
                    }
                    
                    # Save to cache
                    with open(cache_path, "w", encoding="utf-8") as f:
                        json.dump(fundamentals_dict, f, ensure_ascii=False, indent=2)
                        
                    return AssetFundamentals(**fundamentals_dict)
            
            # Fallback if request fails
            print(f"Yahoo Finance returned status {resp.status_code} for {normalized_ticker}")
        except Exception as e:
            print(f"Error fetching fundamentals for {normalized_ticker} from Yahoo Finance: {e}")
            
        # Return empty fundamentals if fetching fails
        return AssetFundamentals(
            ticker=ticker.upper(),
            sector="N/A",
            industry="N/A",
            market_cap="N/A",
            pe_ratio="N/A",
            dividend_yield="N/A",
            eps="N/A",
            beta="N/A",
            price_to_book="N/A",
            profit_margin="N/A",
            description="Información fundamental no disponible."
        )

yahoo_finance_service = YahooFinanceService()
