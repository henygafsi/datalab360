/**
 * automation.ts — the /studio/automation client (tranche 3, probed live
 * 2026-09-06 ~19:53 on :8078, schema_version studio.automation.v1).
 *
 * Propose (≤3 candidates, graph ready for React Flow, condition.threshold
 * ALWAYS null until the user decides — never inferred) and simulate
 * (dry-run + live evaluation, zero side effects, 0 credits). Selection is
 * persisted on the backend draft via studio-api's updateDraft — this file
 * only wraps it; studio-api.ts itself is owned by the main session.
 *
 * Endpoint literals follow the studio service convention set by
 * studio-api.ts (probed contract, /studio/* namespace).
 */

import { studioMutate } from '@/app/services/studio/studio-api';
import { updateDraft, type GlobalFilter } from '@/app/services/studio/studio-api';

/* ── Propose ───────────────────────────────────────────────────────── */

export interface AutomationTrigger {
  type?: string; // 'schedule'
  cron_choice?: string; // 'daily' | …  (a decision surface, not a default run)
  cron?: string;
  note?: string;
  [k: string]: unknown;
}

export interface AutomationCondition {
  chart_id?: string;
  measure?: string;
  aggregator?: string;
  operator?: string; // '<' | '>' | …
  /** null until the USER decides — the backend never infers a threshold. */
  threshold: number | null;
  requires_decision?: boolean;
  [k: string]: unknown;
}

export interface AutomationStepBlock {
  step_id: string;
  block_type: string; // source | quality_check | notify | export_file | aggregate | destination
  capability?: string;
  label?: string;
  config?: Record<string, unknown>;
}

export interface AutomationDestination {
  capability?: string; // e.g. notify.in_app
  executable?: boolean;
  route?: string;
  block_type?: string;
  destination_kind?: string; // in_app | stage | table
  test_destination?: string; // where a TEST run would land (never production)
  [k: string]: unknown;
}

/** email / Slack / webhook / ticket → not_integrated: shown greyed, never a decorative node. */
export interface AutomationNotAvailable {
  capability?: string;
  label?: string;
  status?: string; // 'not_integrated'
}

export interface AutomationGraphNode {
  id: string;
  type?: string;
  label?: string;
  config?: Record<string, unknown>;
  capability?: string;
  executable?: boolean;
  position?: { x: number; y: number };
}

export interface AutomationGraphEdge {
  id: string;
  source: string;
  target: string;
}

/** Ready for React Flow as-is (nodes carry positions). */
export interface AutomationGraph {
  nodes?: AutomationGraphNode[];
  edges?: AutomationGraphEdge[];
}

export interface AutomationCandidate {
  automation_id: string;
  kind?: string; // alert | export | workflow
  status?: string; // proposed
  title: string;
  rationale?: string;
  trigger?: AutomationTrigger;
  condition?: AutomationCondition | null;
  steps?: AutomationStepBlock[];
  destinations?: AutomationDestination[];
  /** Paths the user must decide (e.g. 'condition.threshold') — never pre-answered. */
  requires_decision?: string[];
  not_available?: AutomationNotAvailable[];
  graph?: AutomationGraph;
  [k: string]: unknown;
}

export interface AutomationCapabilityInfo {
  label?: string;
  executable?: boolean;
  status?: string; // available | not_integrated
}

export interface AutomationProposeResponse {
  draft_id?: string | null;
  credits_charged?: number;
  schema_version?: string;
  run_id?: string;
  candidates?: AutomationCandidate[];
  optional?: boolean;
  note?: string;
  capabilities?: Record<string, AutomationCapabilityInfo>;
}

/** Prefer draft_id — the report + understanding live on the backend draft.
 *  A draft without a generated report answers 422 REPORT_REQUIRED. */
export async function proposeAutomations(body: {
  draft_id?: string | null;
  report?: Record<string, unknown>;
  understanding?: Record<string, unknown>;
  need?: string;
}): Promise<AutomationProposeResponse> {
  return studioMutate<AutomationProposeResponse>('POST', '/studio/automation/propose', body, 60_000);
}

/* ── Simulate (dry-run + live evaluation — zero side effects) ──────── */

export interface AutomationDryRun {
  valid?: boolean;
  validation_error?: string | null;
  planned_steps?: number;
  warnings?: Array<{ level?: string; message?: string }>;
}

export interface AutomationEvaluation {
  chart_id?: string;
  value?: number | null;
  operator?: string;
  threshold?: number | null;
  would_fire?: boolean | null;
  status?: 'evaluated' | 'threshold_undecided' | string;
  scope?: {
    limit?: number;
    filters_applied?: number;
    is_production_total?: boolean;
    note?: string;
  };
  computed_at?: string;
}

export interface SimulatedDestination {
  capability?: string;
  kind?: string; // in_app | stage | table
  test_target?: string;
  status?: string; // 'simulated'
  sent?: boolean; // always false in simulation
}

/** Cost prediction of ONE run — EXPLAIN-based, never a money amount. */
export interface AutomationPerRun {
  estimate?: {
    state?: 'estimated' | 'unavailable' | string;
    source?: string; // "EXPLAIN USING JSON"
    partitions_total?: number;
    partitions_assigned?: number;
    bytes_assigned?: number;
    analyze_mode?: string;
    note?: string;
  };
  duration_ms_expected?: number;
  ai_calls?: number;
}

/** Linear projection at the chosen frequency. */
export interface AutomationPerPeriod {
  frequency?: string;
  runs_per_day?: number;
  runs_per_month?: number;
  bytes_assigned_per_month?: number;
  ai_calls_per_month?: number;
  note?: string;
}

/** Live-progress steps (also SSE `automation_simulation` on the cache
 *  stream: {run_id, automation_id, step, pct, status}). */
export interface SimulationStep {
  step?: string;
  pct?: number;
  status?: string;
}

export type AutomationFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface AutomationSimulateResponse {
  draft_id?: string | null;
  schema_version?: string;
  run_id?: string;
  automation_id?: string;
  dry_run?: AutomationDryRun;
  evaluation?: AutomationEvaluation;
  destinations?: SimulatedDestination[];
  side_effects?: { scheduled?: boolean; written?: boolean; notified?: boolean };
  requires_decision?: string[];
  per_run?: AutomationPerRun;
  per_period?: AutomationPerPeriod;
  /** true as soon as a frequency or analyze_mode 'full' is asked —
   *  credit-gated, an ACCOUNTADMIN call. */
  gate?: { activation_required?: boolean; note?: string };
  state?: 'estimated' | 'unavailable' | string;
  steps?: SimulationStep[];
  simulated_at?: string;
  credits_charged?: number; // 0 for simulation
}

export async function simulateAutomation(body: {
  draft_id?: string | null;
  /** Either the id of a candidate already proposed on the draft… */
  automation_id?: string;
  /** …or the full candidate object. */
  automation?: AutomationCandidate | Record<string, unknown>;
  report?: Record<string, unknown>;
  global_filters?: GlobalFilter[];
  /** Chosen cadence (or a 5-field cron); the candidate's cron_choice
   *  applies when omitted. */
  frequency?: AutomationFrequency | string;
  /** 'sample' = policy LIMIT; 'full' = whole objects (credit-gated). */
  analyze_mode?: 'sample' | 'full';
}): Promise<AutomationSimulateResponse> {
  return studioMutate<AutomationSimulateResponse>(
    'POST',
    '/studio/automation/simulate',
    { global_filters: [], ...body },
    120_000,
  );
}

/* ── Selection — persisted on the backend draft ────────────────────── */

export interface AutomationSelectionPayload {
  proposed?: AutomationCandidate[];
  simulations?: Record<string, AutomationSimulateResponse>;
  /** The kept automations, with the user's decided thresholds embedded. */
  selected: AutomationCandidate[];
}

/** PUT /studio/drafts/{id} {automation: payload} via studio-api's updateDraft. */
export async function writeSelectedAutomations(
  draftId: string,
  payload: AutomationSelectionPayload,
): Promise<void> {
  await updateDraft(draftId, { automation: payload });
}
