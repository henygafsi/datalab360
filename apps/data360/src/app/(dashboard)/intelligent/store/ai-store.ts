/**
 * AI Cost Tracking Store — Jotai atoms for surfacing per-call AI credit
 * consumption across the Data360 app.
 *
 * Two persistence horizons:
 *   - `sessionTotalAtom` / `sessionChargesAtom`  → sessionStorage (per tab/QA reset)
 *   - `monthlyChargesAtom`                       → localStorage   (rolling 30d window)
 *
 * Backend rollup endpoints don't exist yet (see Backend Gap card in the
 * Credits tab). Until then, aggregation is purely client-side.
 */

import { atom, useAtom, useAtomValue } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single AI charge recorded after a successful API call. */
export interface AiCharge {
  /** Stable id — `${featureKey}_${timestamp}_${rand}` */
  id: string;
  /** Feature key matching `costs-reference.json` (e.g. 'cortex_complete'). */
  featureKey: string;
  /** Optional model name for richer per-feature breakdown. */
  model?: string;
  /** Credits charged (actual if the API returned it, else the local estimate). */
  credits: number;
  /** Wall-clock ms at the time the charge was recorded. */
  timestamp: number;
}

// ── Storage helpers ──────────────────────────────────────────────────────────

/**
 * sessionStorage-backed atom factory. Falls back to a no-op storage during SSR
 * so jotai doesn't try to touch `window` at build time.
 */
function sessionAtom<T>(key: string, initial: T) {
  return atomWithStorage<T>(
    key,
    initial,
    createJSONStorage<T>(() => (typeof window !== 'undefined' ? window.sessionStorage : (undefined as unknown as Storage))),
  );
}

// ── Atoms ────────────────────────────────────────────────────────────────────

/** Per-session charge log (resets when the browser tab closes). */
export const sessionChargesAtom = sessionAtom<AiCharge[]>('data360:ai-session-charges', []);

/** Sticky 30-day charge log (survives reloads, used for the Credits tab card). */
export const monthlyChargesAtom = atomWithStorage<AiCharge[]>('data360:ai-monthly-charges', []);

/** Whether the user dismissed the floating session counter (per session). */
export const sessionCounterDismissedAtom = sessionAtom<boolean>(
  'data360:ai-session-counter-dismissed',
  false,
);

// ── Derived selectors ────────────────────────────────────────────────────────

/** Total credits charged this session. */
export const sessionTotalAtom = atom((get) =>
  get(sessionChargesAtom).reduce((sum, c) => sum + c.credits, 0),
);

/** Map of featureKey → credits charged in the rolling 30-day window. */
export const monthlyByFeatureAtom = atom((get) => {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const out: Record<string, number> = {};
  for (const c of get(monthlyChargesAtom)) {
    if (c.timestamp < cutoff) continue;
    out[c.featureKey] = (out[c.featureKey] ?? 0) + c.credits;
  }
  return out;
});

/** Total credits across all features in the rolling 30-day window. */
export const monthlyTotalAtom = atom((get) =>
  Object.values(get(monthlyByFeatureAtom)).reduce((sum, n) => sum + n, 0),
);

/** Per-day charge rollup for the last 30 days, oldest first. */
export const monthlyByDayAtom = atom((get) => {
  const charges = get(monthlyChargesAtom);
  const days: { date: string; credits: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, credits: 0 });
  }
  const byKey = new Map(days.map((d) => [d.date, d]));
  for (const c of charges) {
    const key = new Date(c.timestamp).toISOString().slice(0, 10);
    const bucket = byKey.get(key);
    if (bucket) bucket.credits += c.credits;
  }
  return days;
});

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Records an AI charge into both the session log and the rolling monthly log.
 * Call this from the `onSuccess` of any AI-spending API call. The credits
 * argument should be the actual charge from the API response when available;
 * fall back to the estimate emitted by `useAiCostEstimate` otherwise.
 */
export function useTrackAiCharge() {
  const [, setSession] = useAtom(sessionChargesAtom);
  const [, setMonthly] = useAtom(monthlyChargesAtom);

  return (featureKey: string, credits: number, model?: string) => {
    if (!Number.isFinite(credits) || credits < 0) return;
    const charge: AiCharge = {
      id: `${featureKey}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      featureKey,
      model,
      credits,
      timestamp: Date.now(),
    };
    setSession((prev) => [...prev.slice(-99), charge]); // keep last 100 in session
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    setMonthly((prev) => [...prev.filter((c) => c.timestamp >= cutoff), charge]);
  };
}

/** Convenience hook bundling the session-level selectors used by the counter. */
export function useAiSession() {
  const charges = useAtomValue(sessionChargesAtom);
  const total = useAtomValue(sessionTotalAtom);
  const [dismissed, setDismissed] = useAtom(sessionCounterDismissedAtom);
  const [, setSession] = useAtom(sessionChargesAtom);
  return {
    charges,
    total,
    dismissed,
    dismiss: () => setDismissed(true),
    reset: () => setSession([]),
  };
}

/** Convenience hook bundling the rolling monthly selectors. */
export function useAiMonthly() {
  const total = useAtomValue(monthlyTotalAtom);
  const byFeature = useAtomValue(monthlyByFeatureAtom);
  const byDay = useAtomValue(monthlyByDayAtom);
  return { total, byFeature, byDay };
}
