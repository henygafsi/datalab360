// Shared view-model types for the API Health admin tab.
// These are purely presentational contracts — no service-layer imports here,
// so the components that consume them stay tsc-clean (page.tsx is @ts-nocheck).

export type ProbeStatus = 'idle' | 'running' | 'success' | 'error' | 'warn';

export type ProbeResult = {
  status: ProbeStatus;
  ms?: number;
  error?: string;
  httpStatus?: number;
  /** Captured from the failing request's axios config when available. */
  method?: string;
  url?: string;
};

/** A single probed endpoint flattened for the drill / detail panel. */
export type ProbeDetail = {
  module: string;
  name: string;
  result?: ProbeResult;
  isSlow: boolean;
};

/** Latency (ms) at/above which a successful probe is flagged "slow". */
export const SLOW_THRESHOLD_MS = 1500;
