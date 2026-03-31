import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";
import type {
  Settings,
  SettingsUpdate,
  AccountInfo,
  EquityPoint,
  Trade,
  AnalysisEntry,
  BotStatus,
  Candle,
} from "../types";

// ── Query keys ───────────────────────────────────────────────────────────────

const keys = {
  settings: ["settings"] as const,
  account: ["account"] as const,
  equityCurve: ["equityCurve"] as const,
  positions: ["positions"] as const,
  trades: (limit: number, offset: number) =>
    ["trades", limit, offset] as const,
  latestAnalysis: ["latestAnalysis"] as const,
  botStatus: ["botStatus"] as const,
  candles: (symbol: string, interval: string) =>
    ["candles", symbol, interval] as const,
};

// ── Settings ─────────────────────────────────────────────────────────────────

export function useSettings() {
  return useQuery<Settings>({
    queryKey: keys.settings,
    queryFn: async () => {
      const { data } = await apiClient.get<Settings>("/settings");
      return data;
    },
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation<Settings, Error, SettingsUpdate>({
    mutationFn: async (update) => {
      const { data } = await apiClient.put<Settings>("/settings", update);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

// ── Account ──────────────────────────────────────────────────────────────────

export function useAccount() {
  return useQuery<AccountInfo>({
    queryKey: keys.account,
    queryFn: async () => {
      const { data } = await apiClient.get<AccountInfo>("/account");
      return data;
    },
    refetchInterval: 15_000,
  });
}

export function useEquityCurve() {
  return useQuery<EquityPoint[]>({
    queryKey: keys.equityCurve,
    queryFn: async () => {
      const { data } = await apiClient.get<EquityPoint[]>(
        "/account/equity-curve",
      );
      return data;
    },
  });
}

// ── Positions ────────────────────────────────────────────────────────────────

export function usePositions() {
  return useQuery<Trade[]>({
    queryKey: keys.positions,
    queryFn: async () => {
      const { data } = await apiClient.get<Trade[]>("/positions");
      return data;
    },
    refetchInterval: 5_000,
  });
}

// ── Trades ───────────────────────────────────────────────────────────────────

export function useTrades(limit = 50, offset = 0) {
  return useQuery<Trade[]>({
    queryKey: keys.trades(limit, offset),
    queryFn: async () => {
      const { data } = await apiClient.get<Trade[]>("/trades", {
        params: { limit, offset },
      });
      return data;
    },
  });
}

// ── Analysis ─────────────────────────────────────────────────────────────────

export function useLatestAnalysis() {
  return useQuery<AnalysisEntry>({
    queryKey: keys.latestAnalysis,
    queryFn: async () => {
      const { data } = await apiClient.get<AnalysisEntry>(
        "/analysis/latest",
      );
      return data;
    },
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useTriggerAnalysis() {
  const qc = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: async () => {
      await apiClient.post("/analysis/trigger");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.latestAnalysis });
      qc.invalidateQueries({ queryKey: keys.positions });
      qc.invalidateQueries({ queryKey: keys.botStatus });
    },
  });
}

// ── Bot Control ──────────────────────────────────────────────────────────────

export function useBotStatus() {
  return useQuery<BotStatus>({
    queryKey: keys.botStatus,
    queryFn: async () => {
      const { data } = await apiClient.get<BotStatus>("/bot/status");
      return data;
    },
    refetchInterval: 5_000,
  });
}

export function useStartBot() {
  const qc = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: async () => {
      await apiClient.post("/bot/start");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.botStatus });
      qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

export function useStopBot() {
  const qc = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: async () => {
      await apiClient.post("/bot/stop");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.botStatus });
      qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

// ── Candles ──────────────────────────────────────────────────────────────────

export function useCandles(symbol: string, interval: string) {
  return useQuery<Candle[]>({
    queryKey: keys.candles(symbol, interval),
    queryFn: async () => {
      const { data } = await apiClient.get<Candle[]>("/candles", {
        params: { symbol, interval },
      });
      return data;
    },
    enabled: Boolean(symbol && interval),
  });
}

// ── Close Position ──────────────────────────────────────────────────────────

export function useClosePosition() {
  const qc = useQueryClient();
  return useMutation<{ status: string; trade_id: number; pnl: number }, Error, number>({
    mutationFn: async (tradeId: number) => {
      const { data } = await apiClient.post(`/positions/${tradeId}/close`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.positions });
      qc.invalidateQueries({ queryKey: keys.account });
      qc.invalidateQueries({ queryKey: keys.equityCurve });
      qc.invalidateQueries({ queryKey: keys.botStatus });
    },
  });
}
