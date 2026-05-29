/**
 * useMeteringEstimate — Estimates the recurring credit cost of an account
 * across its priced dimensions (sources, projects, module activations,
 * per-module cost, account base) BEFORE a real billing endpoint exists.
 *
 * Resolution order:
 *   1. GET /billing/estimate?account_id=&sources=&projects=&modules=  → source: 'api'
 *      (currently expected to 404 — gracefully fall through after ~1s)
 *   2. Local reference at account-overview/pricing-reference.json     → source: 'reference'
 *
 * Formula (per dimension, all `reference_price` are 0 placeholders today):
 *   per_source  subtotal = sources  * dimensions.per_source.reference_price
 *   per_project subtotal = projects * dimensions.per_project.reference_price
 *   per_module  subtotal = modulesActive.length * dimensions.per_module.reference_price
 *   module_cost subtotal = Σ dimensions.module_cost[<moduleKey>]
 *                          (unknown module keys fall through to
 *                           dimensions.per_module.reference_price so they
 *                           still surface in the breakdown — still 0)
 *   account_base subtotal = dimensions.account_base.reference_price
 *
 * Memoization: keyed on JSON.stringify({ sources, projects, modulesActive }).
 * Identical re-renders of the same inputs do not re-fetch nor re-compute.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import pricingReference from '@/app/(dashboard)/account-overview/pricing-reference.json';

// ── Types ────────────────────────────────────────────────────────────────────

/** A priced dimension of the cost model. */
export type MeteringDimension =
  | 'per_source'
  | 'per_project'
  | 'per_module'
  | 'module_cost'
  | 'account_base';

/** Whether a value came from the backend or the local reference table. */
export type MeteringSource = 'reference' | 'api';

export interface MeteringBreakdownRow {
  /** Which priced dimension this row represents. */
  dimension: MeteringDimension;
  /** Human-readable label for the row. */
  label: string;
  /** Billing unit (e.g. "source", "project", "module-activation"). */
  unit: string;
  /** How many billable units of this dimension are in scope. */
  count: number;
  /** Price per unit. 0 = reference placeholder until the endpoint lands. */
  unit_price: number;
  /** count * unit_price. */
  subtotal: number;
  /** Whether `unit_price` is a backend value or a local reference. */
  source: MeteringSource;
}

export interface MeteringFreeDiscovery {
  /** Free-discovery row allowance (1000 by default). */
  rowCap: number;
  /**
   * Rows consumed against the free allowance, when known. Left undefined
   * until `GET /account/{id}/usage` exists — never fabricated.
   */
  used?: number;
}

export interface MeteringEstimate {
  /** One row per priced dimension. */
  breakdown: MeteringBreakdownRow[];
  /** Sum of every row subtotal. */
  total: number;
  /** Free-discovery allowance + (when known) consumption. */
  freeDiscovery: MeteringFreeDiscovery;
  /** Whether the overall estimate came from the backend or the reference. */
  source: MeteringSource;
}

export interface MeteringInput {
  /** Number of connected data sources. */
  sources: number;
  /** Number of active projects. */
  projects: number;
  /** Module keys that are currently enabled (e.g. ['workflow', 'governance']). */
  modulesActive: string[];
}

// ── Reference-table shape ────────────────────────────────────────────────────

interface DimensionPrice {
  unit: string;
  reference_price: number;
  description: string;
}

interface PricingReference {
  version: string;
  currency: string;
  free_discovery: { row_cap: number; description: string };
  dimensions: {
    per_source: DimensionPrice;
    per_project: DimensionPrice;
    per_module: DimensionPrice;
    module_cost: Record<string, number>;
    account_base: DimensionPrice;
  };
  _note: string;
}

// ── Backend response shape (GET /billing/estimate) ───────────────────────────

interface ApiEstimateResponse {
  breakdown?: Array<Partial<MeteringBreakdownRow>>;
  total?: number;
  free_discovery?: { row_cap?: number; used?: number };
}

// ── Local computation ────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  workflow: 'Workflow',
  explore_design: 'Explore & Design',
  bi_dashboard: 'BI Dashboard',
  connect: 'Connect',
  intelligent: 'Intelligent',
  governance: 'Governance',
  data_quality: 'Data Quality',
  observability: 'Observability',
};

function computeReference(input: MeteringInput): MeteringEstimate {
  const ref = pricingReference as PricingReference;
  const dim = ref.dimensions;

  const perSourcePrice = dim.per_source.reference_price;
  const perProjectPrice = dim.per_project.reference_price;
  const perModulePrice = dim.per_module.reference_price;
  const accountBasePrice = dim.account_base.reference_price;

  // module_cost: sum the per-module cost for every active module. Unknown
  // module keys fall through to per_module.reference_price so they still
  // surface (and are still 0) instead of being silently dropped.
  const moduleCostSubtotal = input.modulesActive.reduce((acc, key) => {
    const known = dim.module_cost[key];
    return acc + (typeof known === 'number' ? known : perModulePrice);
  }, 0);

  const breakdown: MeteringBreakdownRow[] = [
    {
      dimension: 'account_base',
      label: 'Account base',
      unit: dim.account_base.unit,
      count: 1,
      unit_price: accountBasePrice,
      subtotal: accountBasePrice,
      source: 'reference',
    },
    {
      dimension: 'per_source',
      label: 'Connected sources',
      unit: dim.per_source.unit,
      count: input.sources,
      unit_price: perSourcePrice,
      subtotal: input.sources * perSourcePrice,
      source: 'reference',
    },
    {
      dimension: 'per_project',
      label: 'Active projects',
      unit: dim.per_project.unit,
      count: input.projects,
      unit_price: perProjectPrice,
      subtotal: input.projects * perProjectPrice,
      source: 'reference',
    },
    {
      dimension: 'per_module',
      label: 'Module activations',
      unit: dim.per_module.unit,
      count: input.modulesActive.length,
      unit_price: perModulePrice,
      subtotal: input.modulesActive.length * perModulePrice,
      source: 'reference',
    },
    {
      dimension: 'module_cost',
      label: 'Cost of modules',
      unit: 'module',
      count: input.modulesActive.length,
      // Effective per-module price — total divided by count, or 0 when no
      // modules are active. Kept purely informational; subtotal is the sum.
      unit_price:
        input.modulesActive.length > 0
          ? moduleCostSubtotal / input.modulesActive.length
          : 0,
      subtotal: moduleCostSubtotal,
      source: 'reference',
    },
  ];

  const total = breakdown.reduce((acc, row) => acc + row.subtotal, 0);

  return {
    breakdown,
    total,
    freeDiscovery: { rowCap: ref.free_discovery.row_cap },
    source: 'reference',
  };
}

/** Validates + normalizes a backend response into a MeteringEstimate. */
function fromApi(
  data: ApiEstimateResponse,
  reference: MeteringEstimate,
): MeteringEstimate | null {
  if (!Array.isArray(data.breakdown) || typeof data.total !== 'number') {
    return null;
  }
  const breakdown: MeteringBreakdownRow[] = data.breakdown.map((row, i) => {
    const fallback = reference.breakdown[i];
    return {
      dimension: (row.dimension ?? fallback?.dimension ?? 'per_source') as MeteringDimension,
      label: row.label ?? fallback?.label ?? 'Unknown',
      unit: row.unit ?? fallback?.unit ?? 'unit',
      count: typeof row.count === 'number' ? row.count : (fallback?.count ?? 0),
      unit_price: typeof row.unit_price === 'number' ? row.unit_price : 0,
      subtotal: typeof row.subtotal === 'number' ? row.subtotal : 0,
      source: 'api',
    };
  });
  return {
    breakdown,
    total: data.total,
    freeDiscovery: {
      rowCap: data.free_discovery?.row_cap ?? reference.freeDiscovery.rowCap,
      used: typeof data.free_discovery?.used === 'number' ? data.free_discovery.used : undefined,
    },
    source: 'api',
  };
}

// ── Module-level memo cache (shared across components) ───────────────────────

const cache = new Map<string, MeteringEstimate>();

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the estimated recurring cost for an account with the given
 * `sources` / `projects` / `modulesActive`. Falls back to the local
 * reference table if `GET /billing/estimate` is unreachable within ~1s.
 * Safe to call from any component; memoized per-input.
 */
export function useMeteringEstimate(input: MeteringInput): MeteringEstimate {
  const key = JSON.stringify({
    sources: input.sources,
    projects: input.projects,
    modulesActive: input.modulesActive,
  });

  // Synchronous reference fallback so the panel never blanks.
  const reference = useMemo(() => computeReference(input), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const [estimate, setEstimate] = useState<MeteringEstimate>(
    () => cache.get(key) ?? reference,
  );
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    const cached = cache.get(key);
    if (cached) {
      setEstimate(cached);
      return;
    }
    setEstimate(reference);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    const query = new URLSearchParams({
      sources: String(input.sources),
      projects: String(input.projects),
      modules: input.modulesActive.join(','),
    });

    fetch(`/billing/estimate?${query.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('estimate-unavailable');
        const data = (await r.json()) as ApiEstimateResponse;
        const next = fromApi(data, reference);
        if (!next) throw new Error('bad-shape');
        cache.set(key, next);
        if (!aborted.current) setEstimate(next);
      })
      .catch(() => {
        // Endpoint missing / timed out / aborted — keep the reference estimate.
        cache.set(key, reference);
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

export { MODULE_LABELS };
