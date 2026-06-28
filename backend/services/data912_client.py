import time
import httpx
from typing import Any, Dict, List, Optional
from backend.config import DATA912_BASE_URL, CACHE_TTL_SECONDS, LIVE_ENDPOINTS

class Data912Client:
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._client: Optional[httpx.AsyncClient] = None

    def get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=DATA912_BASE_URL, timeout=10.0)
        return self._client

    async def fetch(self, path: str) -> Any:
        now = time.time()
        if path in self._cache:
            entry = self._cache[path]
            if now - entry["timestamp"] < CACHE_TTL_SECONDS:
                return entry["data"]

        client = self.get_client()
        try:
            response = await client.get(path)
            response.raise_for_status()
            data = response.json()
            self._cache[path] = {"timestamp": now, "data": data}
            return data
        except Exception as e:
            if path in self._cache:
                return self._cache[path]["data"]
            raise e

    async def close(self):
        if self._client is not None:
            await self._client.aclose()
            self._client = None


    async def get_arg_stocks(self) -> List[Dict[str, Any]]:
        try:
            res = await self.fetch(LIVE_ENDPOINTS["arg_stocks"])
            if isinstance(res, list):
                return res
            elif isinstance(res, dict) and "data" in res:
                return res["data"]
            return []
        except Exception:
            return []

    async def get_arg_cedears(self) -> List[Dict[str, Any]]:
        try:
            res = await self.fetch(LIVE_ENDPOINTS["arg_cedears"])
            if isinstance(res, list):
                return res
            elif isinstance(res, dict) and "data" in res:
                return res["data"]
            return []
        except Exception:
            return []

    async def get_stock_history(self, ticker: str) -> List[Dict[str, Any]]:
        path = f"/historical/stocks/{ticker.upper()}"
        try:
            res = await self.fetch(path)
            if isinstance(res, list):
                return res
            elif isinstance(res, dict) and "data" in res:
                return res["data"]
            return []
        except Exception:
            return []

    async def get_cedear_history(self, ticker: str) -> List[Dict[str, Any]]:
        path = f"/historical/cedears/{ticker.upper()}"
        try:
            res = await self.fetch(path)
            if isinstance(res, list):
                return res
            elif isinstance(res, dict) and "data" in res:
                return res["data"]
            return []
        except Exception:
            return []

    async def get_bond_history(self, ticker: str) -> List[Dict[str, Any]]:
        path = f"/historical/bonds/{ticker.upper()}"
        try:
            res = await self.fetch(path)
            if isinstance(res, list):
                return res
            elif isinstance(res, dict) and "data" in res:
                return res["data"]
            return []
        except Exception:
            return []

data912_client = Data912Client()

