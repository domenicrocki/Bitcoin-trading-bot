"""Kraken exchange API wrapper using httpx AsyncClient."""

import base64
import hashlib
import hmac
import logging
import time
import urllib.parse
from typing import Optional

import httpx
import pandas as pd

from config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Symbol mapping: Binance-style -> Kraken pair
# ---------------------------------------------------------------------------
_BINANCE_TO_KRAKEN = {
    "BTCUSDT": "XBTUSDT",
    "ETHUSDT": "ETHUSDT",
    "BNBUSDT": "BNBUSDT",
    "XRPUSDT": "XRPUSDT",
    "SOLUSDT": "SOLUSDT",
    "TRXUSDT": "TRXUSDT",
    "BTCUSD": "XXBTZUSD",
    "ETHUSD": "XETHZUSD",
}

# Reverse lookup for responses
_KRAKEN_TO_BINANCE = {v: k for k, v in _BINANCE_TO_KRAKEN.items()}

# ---------------------------------------------------------------------------
# Interval mapping: Binance-style string -> Kraken minutes integer
# ---------------------------------------------------------------------------
_INTERVAL_MAP = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
    "1w": 10080,
}


def _map_symbol(symbol: str) -> str:
    """Convert a Binance-style symbol to the Kraken pair name."""
    mapped = _BINANCE_TO_KRAKEN.get(symbol.upper())
    if mapped is None:
        # Fall through: caller may already be using a Kraken pair
        return symbol
    return mapped


def _map_interval(interval: str) -> int:
    """Convert a Binance-style interval string to Kraken minutes integer."""
    if isinstance(interval, int) or interval.isdigit():
        return int(interval)
    mapped = _INTERVAL_MAP.get(interval.lower())
    if mapped is None:
        raise ValueError(
            f"Unsupported interval '{interval}'. "
            f"Supported: {list(_INTERVAL_MAP.keys())}"
        )
    return mapped


class KrakenExchange:
    """Async wrapper around the Kraken REST API."""

    BASE_URL = "https://api.kraken.com"

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._settings = get_settings()

    # ------------------------------------------------------------------
    # HTTP helpers
    # ------------------------------------------------------------------

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.BASE_URL,
                timeout=30.0,
            )
        return self._client

    def _sign(self, url_path: str, data: dict) -> dict[str, str]:
        """Create Kraken API signature headers.

        Algorithm:
        1. SHA-256 hash of (nonce + POST-data)
        2. HMAC-SHA-512 of (url_path + sha256_hash) keyed with base64-decoded secret
        """
        api_secret = self._settings.kraken_api_secret
        encoded_data = urllib.parse.urlencode(data)

        sha256_hash = hashlib.sha256(
            (str(data["nonce"]) + encoded_data).encode("utf-8")
        ).digest()

        hmac_key = base64.b64decode(api_secret)
        signature = hmac.new(
            hmac_key,
            url_path.encode("utf-8") + sha256_hash,
            hashlib.sha512,
        ).digest()

        return {
            "API-Key": self._settings.kraken_api_key,
            "API-Sign": base64.b64encode(signature).decode("utf-8"),
        }

    async def _public_get(self, path: str, params: dict | None = None) -> dict:
        """Send a GET request to a Kraken public endpoint."""
        client = self._get_client()
        resp = await client.get(path, params=params)
        resp.raise_for_status()
        body = resp.json()
        if body.get("error"):
            raise RuntimeError(f"Kraken API error: {body['error']}")
        return body["result"]

    async def _private_post(self, path: str, data: dict | None = None) -> dict:
        """Send an authenticated POST request to a Kraken private endpoint."""
        if data is None:
            data = {}
        data["nonce"] = str(int(time.time() * 1000))
        headers = self._sign(path, data)
        client = self._get_client()
        resp = await client.post(path, data=data, headers=headers)
        resp.raise_for_status()
        body = resp.json()
        if body.get("error"):
            raise RuntimeError(f"Kraken API error: {body['error']}")
        return body["result"]

    # ------------------------------------------------------------------
    # Market data (public)
    # ------------------------------------------------------------------

    async def get_klines(
        self,
        symbol: str,
        interval: str = "60",
        limit: int = 100,
    ) -> pd.DataFrame:
        """Fetch OHLCV klines and return a pandas DataFrame.

        Columns: open, high, low, close, volume  (index = timestamp)
        """
        pair = _map_symbol(symbol)
        minutes = _map_interval(interval)

        result = await self._public_get(
            "/0/public/OHLC",
            params={"pair": pair, "interval": minutes},
        )

        # Result keys vary; pick the first (and usually only) pair key
        pair_key = [k for k in result if k != "last"][0]
        raw = result[pair_key]

        # Kraken OHLC: [time, open, high, low, close, vwap, volume, count]
        rows = raw[-limit:]  # respect the caller's limit

        df = pd.DataFrame(
            rows,
            columns=[
                "time", "open", "high", "low", "close",
                "vwap", "volume", "count",
            ],
        )
        df["timestamp"] = pd.to_datetime(df["time"], unit="s")
        for col in ("open", "high", "low", "close", "volume"):
            df[col] = pd.to_numeric(df[col], errors="coerce")

        df = df[["timestamp", "open", "high", "low", "close", "volume"]]
        df = df.set_index("timestamp")
        return df

    async def get_ticker_price(self, symbol: str) -> float:
        """Return the latest ticker price for *symbol*."""
        pair = _map_symbol(symbol)
        result = await self._public_get(
            "/0/public/Ticker",
            params={"pair": pair},
        )
        # result is keyed by the pair; pick the first entry
        ticker = next(iter(result.values()))
        # 'c' = last trade closed [price, lot-volume]
        return float(ticker["c"][0])

    # ------------------------------------------------------------------
    # Account (private)
    # ------------------------------------------------------------------

    async def get_balance(self, asset: str = "USDT") -> float:
        """Return the free balance for the given asset (default USDT)."""
        result = await self._private_post("/0/private/Balance")
        # Kraken balance keys use their own naming: ZUSD, XXBT, XETH, USDT, etc.
        # Try common variations
        candidates = [asset, f"Z{asset}", f"X{asset}", asset.upper()]
        # Special cases
        if asset.upper() == "BTC":
            candidates.extend(["XXBT", "XBT"])
        for key in candidates:
            if key in result:
                return float(result[key])
        return 0.0

    # ------------------------------------------------------------------
    # Order management (private)
    # ------------------------------------------------------------------

    async def place_market_order(
        self, symbol: str, side: str, quantity: float
    ) -> dict:
        """Place a market BUY or SELL order."""
        pair = _map_symbol(symbol)
        result = await self._private_post(
            "/0/private/AddOrder",
            data={
                "pair": pair,
                "type": side.lower(),  # Kraken uses "buy" / "sell"
                "ordertype": "market",
                "volume": f"{quantity:.8f}",
            },
        )
        logger.info(
            "Kraken market %s order placed: %s qty=%s  txid=%s",
            side, symbol, quantity, result.get("txid"),
        )
        return result

    async def place_limit_order(
        self, symbol: str, side: str, quantity: float, price: float
    ) -> dict:
        """Place a limit order."""
        pair = _map_symbol(symbol)
        result = await self._private_post(
            "/0/private/AddOrder",
            data={
                "pair": pair,
                "type": side.lower(),
                "ordertype": "limit",
                "price": f"{price:.8f}",
                "volume": f"{quantity:.8f}",
            },
        )
        logger.info(
            "Kraken limit %s order placed: %s qty=%s price=%s  txid=%s",
            side, symbol, quantity, price, result.get("txid"),
        )
        return result

    async def place_stop_loss(
        self, symbol: str, side: str, quantity: float, stop_price: float
    ) -> dict:
        """Place a stop-loss order."""
        pair = _map_symbol(symbol)
        result = await self._private_post(
            "/0/private/AddOrder",
            data={
                "pair": pair,
                "type": side.lower(),
                "ordertype": "stop-loss",
                "price": f"{stop_price:.8f}",
                "volume": f"{quantity:.8f}",
            },
        )
        logger.info(
            "Kraken stop-loss %s order placed: %s qty=%s stop=%s  txid=%s",
            side, symbol, quantity, stop_price, result.get("txid"),
        )
        return result

    async def cancel_order(self, symbol: str, order_id: str) -> dict:
        """Cancel an open order by its transaction ID."""
        result = await self._private_post(
            "/0/private/CancelOrder",
            data={"txid": order_id},
        )
        logger.info("Kraken order %s cancelled for %s", order_id, symbol)
        return result

    async def get_open_orders(self, symbol: str | None = None) -> list:
        """Return a list of open orders, optionally filtered by symbol."""
        result = await self._private_post("/0/private/OpenOrders")
        orders = result.get("open", {})
        order_list = []
        kraken_pair = _map_symbol(symbol) if symbol else None
        for txid, info in orders.items():
            info["txid"] = txid
            # Filter by pair if requested
            if kraken_pair and info.get("descr", {}).get("pair") != kraken_pair:
                continue
            order_list.append(info)
        return order_list

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        """Gracefully close the underlying httpx client."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
            logger.info("Kraken httpx AsyncClient connection closed")
