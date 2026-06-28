from typing import List, Optional
from pydantic import BaseModel

class AssetQuote(BaseModel):
    ticker: str
    price: float
    change_pct: float
    volume: float
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None
    name: Optional[str] = ""
    panel: Optional[str] = "general"
    currency: Optional[str] = "ARS"
    sector: Optional[str] = "Otros"

class MarketSummary(BaseModel):
    top_gainers: List[AssetQuote]
    top_losers: List[AssetQuote]
    most_active: List[AssetQuote]
    total_stocks: int
    top_gainer_single: Optional[AssetQuote] = None
    top_volume_single: Optional[AssetQuote] = None

class StockHistoryPoint(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    sma20: Optional[float] = None
    sma50: Optional[float] = None
    rsi: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_lower: Optional[float] = None
    bb_middle: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None

class AssetFundamentals(BaseModel):
    ticker: str
    sector: Optional[str] = None
    industry: Optional[str] = None
    market_cap: Optional[str] = None
    pe_ratio: Optional[str] = None
    dividend_yield: Optional[str] = None
    eps: Optional[str] = None
    beta: Optional[str] = None
    price_to_book: Optional[str] = None
    profit_margin: Optional[str] = None
    description: Optional[str] = None
