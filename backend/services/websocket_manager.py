"""WebSocket connection manager for broadcasting real-time data to frontend clients."""

import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and provides typed broadcast helpers."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    @property
    def active_count(self) -> int:
        """Number of currently active connections."""
        return len(self._connections)

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self._connections.append(websocket)
        logger.info(
            "WebSocket connected: %s  (total: %d)",
            websocket.client,
            self.active_count,
        )

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection from the pool."""
        if websocket in self._connections:
            self._connections.remove(websocket)
        logger.info(
            "WebSocket disconnected: %s  (total: %d)",
            websocket.client,
            self.active_count,
        )

    # ------------------------------------------------------------------
    # Generic broadcast
    # ------------------------------------------------------------------

    async def broadcast(self, message: dict) -> None:
        """Send a JSON message to every connected client.

        Stale or broken connections are silently removed.
        """
        stale: list[WebSocket] = []

        for ws in self._connections:
            try:
                if ws.application_state == WebSocketState.CONNECTED:
                    await ws.send_json(message)
                else:
                    stale.append(ws)
            except (WebSocketDisconnect, RuntimeError, Exception) as exc:
                logger.debug("Failed to send to %s: %s", ws.client, exc)
                stale.append(ws)

        for ws in stale:
            self.disconnect(ws)

    # ------------------------------------------------------------------
    # Typed broadcast helpers
    # ------------------------------------------------------------------

    async def broadcast_price(
        self, symbol: str, price: float, timestamp: Any = None
    ) -> None:
        """Broadcast a live price update."""
        await self.broadcast(
            {
                "type": "price_update",
                "data": {
                    "symbol": symbol,
                    "price": price,
                    "timestamp": _to_iso(timestamp),
                },
            }
        )

    async def broadcast_signal(self, signal_data: dict) -> None:
        """Broadcast a trading signal (e.g. BUY / SELL recommendation)."""
        await self.broadcast(
            {
                "type": "signal",
                "data": signal_data,
                "timestamp": _now_iso(),
            }
        )

    async def broadcast_position_update(self, position_data: dict) -> None:
        """Broadcast a position change (open, close, PnL update)."""
        await self.broadcast(
            {
                "type": "position_update",
                "data": position_data,
                "timestamp": _now_iso(),
            }
        )

    async def broadcast_status(self, status_data: dict) -> None:
        """Broadcast a general status update (bot running, paused, etc.)."""
        await self.broadcast(
            {
                "type": "status",
                "data": status_data,
                "timestamp": _now_iso(),
            }
        )

    async def broadcast_error(self, message: str) -> None:
        """Broadcast an error message to all connected clients."""
        await self.broadcast(
            {
                "type": "error",
                "data": {"message": message},
                "timestamp": _now_iso(),
            }
        )


# ======================================================================
# Private helpers
# ======================================================================

def _now_iso() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def _to_iso(value: Any) -> str:
    """Convert a timestamp value to ISO-8601, falling back to now."""
    if value is None:
        return _now_iso()
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    return str(value)
