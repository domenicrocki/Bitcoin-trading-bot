"""Binance exchange API wrapper using python-binance AsyncClient."""

import asyncio
import logging
from datetime import datetime
from typing import Optional

import pandas as pd
from binance import AsyncClient, BinanceSocketManager
from binance.enums import (
    ORDER_TYPE_LIMIT,
    ORDER_TYPE_MARKET,
    ORDER_TYPE_STOP_LOSS,
    SIDE_BUY,
    SIDE_SELL,
    TIME_IN_FORCE_GTC,
)

from config import get_settings

logger = logging.getLogger(__name__)


class BinanceExchange:
    """Async wrapper around the Binance API."""

    TESTNET_API_URL = "https://testnet.binance.vision/api"

    def __init__(self) -> None:
        self._client: Optional[AsyncClient] = None
        self._settings = get_settings()
        self._initializing = False

    async def _ensure_client(self) -> AsyncClient:
        """Lazily initialize and return the async client (singleton)."""
        if self._client is not None:
            return self._client
        if self._initializing:
            # Another coroutine is already creating the client; wait
            while self._initializing:
                await asyncio.sleep(0.05)
            return self._client
        self._initializing = True
        try:
            kwargs: dict = {
                "api_key": self._settings.binance_api_key,
                "api_secret": self._settings.binance_api_secret,
            }
            if self._settings.binance_testnet:
                kwargs["testnet"] = True
            self._client = await AsyncClient.create(**kwargs)
            mode = "TESTNET" if self._settings.binance_testnet else "PRODUCTION"
            logger.info("Binance AsyncClient initialized in %s mode", mode)
        finally:
            self._initializing = False
        return self._client

    # ------------------------------------------------------------------
    # Market data
    # ------------------------------------------------------------------

    async def get_klines(
        self,
        symbol: str,
        interval: str = AsyncClient.KLINE_INTERVAL_1HOUR,
        limit: int = 500,
    ) -> pd.DataFrame:
        """Fetch OHLCV klines and return a pandas DataFrame.

        Columns: open, high, low, close, volume, timestamp
        """
        client = await self._ensure_client()
        raw = await client.get_klines(symbol=symbol, interval=interval, limit=limit)

        df = pd.DataFrame(
            raw,
            columns=[
                "open_time",
                "open",
                "high",
                "low",
                "close",
                "volume",
                "close_time",
                "quote_asset_volume",
                "number_of_trades",
                "taker_buy_base_volume",
                "taker_buy_quote_volume",
                "ignore",
            ],
        )

        df["timestamp"] = pd.to_datetime(df["open_time"], unit="ms")
        for col in ("open", "high", "low", "close", "volume"):
            df[col] = pd.to_numeric(df[col], errors="coerce")

        df = df[["timestamp", "open", "high", "low", "close", "volume"]]
        df = df.set_index("timestamp")
        return df

    async def get_ticker_price(self, symbol: str) -> float:
        """Return the latest ticker price for *symbol*."""
        client = await self._ensure_client()
        ticker = await client.get_symbol_ticker(symbol=symbol)
        return float(ticker["price"])

    async def get_balance(self, asset: str = "USDT") -> float:
        """Return the free balance for the given asset (default USDT)."""
        client = await self._ensure_client()
        account = await client.get_account()
        for balance in account["balances"]:
            if balance["asset"] == asset:
                return float(balance["free"])
        return 0.0

    # ------------------------------------------------------------------
    # Order management
    # ------------------------------------------------------------------

    async def place_market_order(
        self, symbol: str, side: str, quantity: float
    ) -> dict:
        """Place a market BUY or SELL order.

        Parameters
        ----------
        symbol : str   e.g. "BTCUSDT"
        side   : str   "BUY" or "SELL"
        quantity : float
        """
        client = await self._ensure_client()
        order = await client.create_order(
            symbol=symbol,
            side=side.upper(),
            type=ORDER_TYPE_MARKET,
            quantity=f"{quantity:.8f}",
        )
        logger.info(
            "Market %s order placed: %s qty=%s  orderId=%s",
            side,
            symbol,
            quantity,
            order["orderId"],
        )
        return order

    async def place_limit_order(
        self, symbol: str, side: str, quantity: float, price: float
    ) -> dict:
        """Place a limit order with GTC time-in-force."""
        client = await self._ensure_client()
        order = await client.create_order(
            symbol=symbol,
            side=side.upper(),
            type=ORDER_TYPE_LIMIT,
            timeInForce=TIME_IN_FORCE_GTC,
            quantity=f"{quantity:.8f}",
            price=f"{price:.8f}",
        )
        logger.info(
            "Limit %s order placed: %s qty=%s price=%s  orderId=%s",
            side,
            symbol,
            quantity,
            price,
            order["orderId"],
        )
        return order

    async def place_stop_loss(
        self, symbol: str, side: str, quantity: float, stop_price: float
    ) -> dict:
        """Place a stop-loss order."""
        client = await self._ensure_client()
        order = await client.create_order(
            symbol=symbol,
            side=side.upper(),
            type=ORDER_TYPE_STOP_LOSS,
            quantity=f"{quantity:.8f}",
            stopPrice=f"{stop_price:.8f}",
        )
        logger.info(
            "Stop-loss %s order placed: %s qty=%s stop=%s  orderId=%s",
            side,
            symbol,
            quantity,
            stop_price,
            order["orderId"],
        )
        return order

    async def cancel_order(self, symbol: str, order_id: int) -> dict:
        """Cancel an open order by its order ID."""
        client = await self._ensure_client()
        result = await client.cancel_order(symbol=symbol, orderId=order_id)
        logger.info("Order %s cancelled for %s", order_id, symbol)
        return result

    async def get_open_orders(self, symbol: Optional[str] = None) -> list[dict]:
        """Return a list of open orders, optionally filtered by symbol."""
        client = await self._ensure_client()
        kwargs: dict = {}
        if symbol:
            kwargs["symbol"] = symbol
        return await client.get_open_orders(**kwargs)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        """Gracefully close the underlying async client."""
        if self._client is not None:
            await self._client.close_connection()
            self._client = None
            logger.info("Binance AsyncClient connection closed")
