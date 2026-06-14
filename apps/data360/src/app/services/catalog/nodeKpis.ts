// Catalog map-tree node KPIs (G12).
//
// Goal-axis KPIs per OBJECT node — DQ · GOV · COST · PERF — derived from the
// EXISTING persisted-scores endpoint (`GET /catalog/objects/{id}/scores`) and
// refreshed by the EXISTING recompute endpoint (`POST .../scores/recompute`),
// which samples the table and re-persists (= the "dry-run → refresh" action).
//
// Axis mapping (decided against the real /scores shape — see report):
//   DQ   ← scores.quality_score      (0–100)
//   GOV  ← scores.governance_score   (0–100)
//   COST ← scores.finops_score       (0–100, higher = cheaper/leaner)
//   PERF ← DERIVED from inputs.finops.avg_ms (latency). The endpoint has no
//          standalone perf score (finops conflates cost+latency), so PERF is a
//          labeled latency indicator, NOT a 0–100 score. Flagged `derived`.
//
// NOTE: scores are per-OBJECT only. There is no per-DB / per-schema score
// endpoint, so DB/schema nodes do NOT carry the 4 axes (they get a tag chip +
// counts). Container aggregates, when shown, are client-side over already
// loaded children only — we never fan out recompute across a whole schema.

import { getObjectScores, recomputeObjectScores, objectIdFromTable } from './index';

export type GoalAxis = 'DQ' | 'GOV' | 'COST' | 'PERF';

export interface NodeKpis {
  /** 0–100 score axes (null = never computed / not available). */
  dq: number | null;
  gov: number | null;
  cost: number | null;
  /** PERF is a latency indicator, not a 0–100 score. null = unknown. */
  perfMs: number | null;
  /** Marks PERF as a derived (non-score) axis for the "(derived)" label. */
  perfDerived: true;
  trust: number | null;
  computedAt: string | null;
  /** True once a real persisted row exists (recompute has run at least once). */
  hasScores: boolean;
}

/** Buckets a 0–100 score into the catalog health palette. */
export function scoreBucket(v: number | null): 'critical' | 'warn' | 'healthy' | 'none' {
  if (v == null) return 'none';
  if (v < 40) return 'critical';
  if (v < 70) return 'warn';
  return 'healthy';
}

/** Human latency label for the PERF axis. */
export function latencyLabel(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}

/** Latency bucket (fast / ok / slow) — mirrors scoreBucket semantics. */
export function latencyBucket(ms: number | null): 'healthy' | 'warn' | 'critical' | 'none' {
  if (ms == null) return 'none';
  if (ms < 1000) return 'healthy';
  if (ms < 5000) return 'warn';
  return 'critical';
}

function toKpis(raw: any): NodeKpis {
  // `getObjectScores` returns either the persisted row { scores, inputs, ... }
  // or { scores: null, hint } when never computed. Be defensive on both.
  const scores = raw?.scores ?? null;
  const avgMs = raw?.inputs?.finops?.avg_ms;
  return {
    dq: scores?.quality_score ?? null,
    gov: scores?.governance_score ?? null,
    cost: scores?.finops_score ?? null,
    perfMs: typeof avgMs === 'number' ? avgMs : null,
    perfDerived: true,
    trust: scores?.trust_score ?? null,
    computedAt: raw?.computed_at ?? null,
    hasScores: scores != null,
  };
}

/** Read persisted goal-axis KPIs for one table object. */
export async function fetchNodeKpis(
  database: string,
  schema: string,
  table: string,
): Promise<NodeKpis> {
  const objectId = objectIdFromTable(database, schema, table);
  const raw = await getObjectScores(objectId);
  return toKpis(raw);
}

/**
 * "Dry-run → refresh scores": recompute samples the table + re-persists, then
 * we read the fresh row back so the node KPIs reflect the new values.
 */
export async function dryRunRefreshNodeKpis(
  database: string,
  schema: string,
  table: string,
): Promise<NodeKpis> {
  const objectId = objectIdFromTable(database, schema, table);
  const recomputed = await recomputeObjectScores(objectId);
  // recompute echoes the persisted row shape ({ scores, inputs, ... }); use it
  // directly to avoid a second round-trip, falling back to a re-GET if absent.
  if (recomputed?.scores) return toKpis(recomputed);
  const raw = await getObjectScores(objectId);
  return toKpis(raw);
}
