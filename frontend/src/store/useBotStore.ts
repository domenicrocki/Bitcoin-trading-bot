import { create } from "zustand";
import type { Signal, Trade, BotStatus } from "../types";

// ── Notification ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: number;
}

// ── Price history point (for live mini-chart) ────────────────────────────────

export interface PricePoint {
  time: number;
  price: number;
}

// ── Store shape ──────────────────────────────────────────────────────────────

interface BotStoreState {
  currentPrice: number | null;
  lastSignal: Signal | null;
  positions: Trade[];
  botStatus: BotStatus | null;
  notifications: Notification[];
  priceHistory: PricePoint[];
}

interface BotStoreActions {
  setPrice: (price: number) => void;
  setSignal: (signal: Signal) => void;
  addPosition: (position: Trade) => void;
  updatePosition: (position: Trade) => void;
  setStatus: (status: BotStatus) => void;
  addNotification: (message: string, type: Notification["type"]) => void;
  clearNotification: (id: string) => void;
  addPricePoint: (point: PricePoint) => void;
}

const MAX_PRICE_HISTORY = 500;

let notificationCounter = 0;

export const useBotStore = create<BotStoreState & BotStoreActions>()(
  (set) => ({
    // ── State ──────────────────────────────────────────────────────────────
    currentPrice: null,
    lastSignal: null,
    positions: [],
    botStatus: null,
    notifications: [],
    priceHistory: [],

    // ── Actions ────────────────────────────────────────────────────────────

    setPrice: (price) =>
      set((state) => {
        const point: PricePoint = { time: Date.now(), price };
        const history = [...state.priceHistory, point].slice(
          -MAX_PRICE_HISTORY,
        );
        return { currentPrice: price, priceHistory: history };
      }),

    setSignal: (signal) => set({ lastSignal: signal }),

    addPosition: (position) =>
      set((state) => ({
        positions: [...state.positions, position],
      })),

    updatePosition: (position) =>
      set((state) => ({
        positions: state.positions.map((p) =>
          p.id === position.id ? position : p,
        ),
      })),

    setStatus: (status) => set({ botStatus: status }),

    addNotification: (message, type) =>
      set((state) => {
        const id = `notif-${++notificationCounter}-${Date.now()}`;
        const notification: Notification = {
          id,
          message,
          type,
          timestamp: Date.now(),
        };
        return { notifications: [...state.notifications, notification] };
      }),

    clearNotification: (id) =>
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),

    addPricePoint: (point) =>
      set((state) => ({
        priceHistory: [...state.priceHistory, point].slice(
          -MAX_PRICE_HISTORY,
        ),
      })),
  }),
);
