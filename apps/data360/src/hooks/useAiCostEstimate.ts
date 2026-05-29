/**
 * useAiCostEstimate — Estimates the credit cost of an AI call before the
 * user clicks the trigger. Powers the inline cost chips and the session
 * counter's per-charge fallback.
 *
 * Resolution order:
 *   1. POST /ai/estimate { feature, params }      → source: 'api'
 *      (currently expected to 404 — gracefully fall through after ~1s)
 *   2. Local reference at intelligent/costs-reference.json → source: 'local'
 *
 * Formula (matches the documented backend G2 shape):
 *   credits = base_credits
 *           + (params.tokens / 1000) * per_1k_tokens * model_multiplier
 *           + params.rows    * per_row    (if per_row defined)
 *           + params.columns * per_column (if per_column defined)
 *
 * Memoization: keyed on `featureKey + JSON.stringify(params)`. Identical
 * re-renders of the same button do not re-fetch nor re-compute.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import costsReference from '@/app/(dashboard)/intelligent/costs-reference.json';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AiCostBreakdown {
  /** Flat base cost for the feature. */
  base: number;
  /** Variable cost (tokens / rows / columns). */
  variable: number;
  /** Model multiplier applied (defaults to 1 if no model passed). */
  modelFactor: number;
}

export interface AiCostEstimate {
  /** Total credits the call is expected to consume. */
  credits: number;
  /** Component-wise breakdown for the tooltip. */
  breakdown: AiCostBreakdown;
  /** Whether the result came from the backend or the local fallback. */
  source: 'local' | 'api';
}

interface FeatureRule {
  base_credits?: number;
  per_1k_tokens?: number;
  per_row?: number;
  per_column?: number;
  model_multiplier?: Record<string, number>;
}

interface CostParams {
  /** Token count for prompt-based features. */
  tokens?: number;
  /** Approximate prompt size in chars (converted to tokens at 4 char/token). */
  prompt_chars?: number;
  /** Row count for batch features (sentiment, sandbox_execute…). */
  rows?: number;
  /** Column count for schema-level features. */
  columns?: number;
  /** Model id for `model_multiplier` lookup. */
  model?: string;
}

// ── Local computation ────────────────────────────────────────────────────────

function computeLocal(featureKey: string, params: CostParams): AiCostEstimate {
  const ref = costsReference as { features: Record<string, FeatureRule> };
  const rule = ref.features[featureKey] ?? {};
  const base = rule.base_credits ?? 0;

  const tokens = params.tokens ?? (params.prompt_chars ? params.prompt_chars / 4 : 0);
  const modelFactor =
    rule.model_multiplier?.[params.model ?? ''] ??
    rule.model_multiplier?.['default'] ??
    1;

  let variable = 0;
  if (rule.per_1k_tokens && tokens) variable += (tokens / 1000) * rule.per_1k_tokens * modelFactor;
  if (rule.per_row && params.rows) variable += rule.per_row * params.rows;
  if (rule.per_column && params.columns) variable += rule.per_column * params.columns;

  const credits = base + variable;
  return {
    credits,
    breakdown: { base, variable, modelFactor },
    source: 'local',
  };
}

// ── Module-level memo cache (shared across components) ───────────────────────

const cache = new Map<string, AiCostEstimate>();

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the estimated cost of `featureKey` invoked with `params`. Falls
 * back to the local reference if the `/ai/estimate` endpoint is unreachable
 * within ~1s. Safe to call from any component; memoized per-key.
 */
export function useAiCostEstimate(
  featureKey: string,
  params: CostParams = {},
): AiCostEstimate {
  const key = `${featureKey}:${JSON.stringify(params)}`;

  // Synchronous local fallback so the chip never blanks.
  const local = useMemo(() => computeLocal(featureKey, params), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const [estimate, setEstimate] = useState<AiCostEstimate>(() => cache.get(key) ?? local);
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    // Already resolved → reuse.
    const cached = cache.get(key);
    if (cached) {
      setEstimate(cached);
      return;
    }
    setEstimate(local);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    fetch('/ai/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: featureKey, params }),
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('estimate-unavailable');
        const data = (await r.json()) as Partial<{ credits: number; breakdown: AiCostBreakdown }>;
        if (typeof data?.credits !== 'number') throw new Error('bad-shape');
        const next: AiCostEstimate = {
          credits: data.credits,
          breakdown: data.breakdown ?? local.breakdown,
          source: 'api',
        };
        cache.set(key, next);
        if (!aborted.current) setEstimate(next);
      })
      .catch(() => {
        // Endpoint missing / timed out / aborted — keep local estimate.
        cache.set(key, local);
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      aborted.current = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return estimate;
}
