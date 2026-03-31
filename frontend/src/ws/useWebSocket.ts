import { useEffect, useRef, useState, useCallback } from "react";
import { useBotStore } from "../store/useBotStore";
import type { WebSocketMessage } from "../types";

const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(INITIAL_RECONNECT_DELAY_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const {
    setPrice,
    setSignal,
    addPosition,
    updatePosition,
    setStatus,
    addNotification,
  } = useBotStore.getState();

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg: WebSocketMessage = JSON.parse(event.data);
        setLastMessage(msg);

        switch (msg.type) {
          case "price":
            setPrice(msg.data.price ?? msg.data);
            break;
          case "signal":
            setSignal(msg.data);
            addNotification(
              `New signal: ${msg.data.action} (confidence ${msg.data.confidence}%)`,
              "info",
            );
            break;
          case "position":
            if (msg.data.event === "opened") {
              addPosition(msg.data);
            } else {
              updatePosition(msg.data);
            }
            break;
          case "status":
            setStatus(msg.data);
            break;
          case "error":
            addNotification(
              msg.data.message ?? "Unknown error from server",
              "error",
            );
            break;
          default:
            break;
        }
      } catch {
        console.error("[WS] Failed to parse message", event.data);
      }
    },
    [setPrice, setSignal, addPosition, updatePosition, setStatus, addNotification],
  );

  const connect = useCallback(() => {
    if (unmounted.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectDelay.current = INITIAL_RECONNECT_DELAY_MS;
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      setIsConnected(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [handleMessage]);

  const scheduleReconnect = useCallback(() => {
    if (unmounted.current) return;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

    reconnectTimer.current = setTimeout(() => {
      connect();
    }, reconnectDelay.current);

    // Exponential backoff, capped
    reconnectDelay.current = Math.min(
      reconnectDelay.current * 2,
      MAX_RECONNECT_DELAY_MS,
    );
  }, [connect]);

  useEffect(() => {
    unmounted.current = false;
    connect();

    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected, lastMessage };
}
