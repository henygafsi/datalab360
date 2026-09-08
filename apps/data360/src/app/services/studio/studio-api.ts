/**
 * studio-api.ts — the /studio module client (contract T1, probed live
 * 2026-09-06 ~19:36, schema_version studio.v1).
 *
 * Everything the Application Studio journey needs: unified sources,
 * bounded discovery, understanding, backend-persisted drafts, and the
 * REAL preview (report generate / validate / run). No local business
 * data — the backend is the source of truth (user directive).
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { API_CONFIG } from '@/config/database.config';
import { dedupGet } from '@/app/services/request-dedup';

/**
 * THE studio mutation transport — fetch-based AND SERIALIZED.
 *
 * Two findings drove this (2026-09-06/07, reproduced with network traces):
 *  1. axios POSTs through the /api-proxy rewrite can stall in-browser
 *     (request issued, response never delivered) while the identical
 *     request via fetch/curl answers in seconds.
 *  2. TWO CONCURRENT studio POSTs through the `next start` rewrite wedge
 *     BOTH — e.g. the journey's debounced draft persist colliding with an
 *     understand call. Sequential POSTs never wedge.
 * So every /studio mutation goes through this single queued fetch chain:
 * one POST/PUT in flight at a time, bounded by an AbortController so a
 * stall surfaces as an error, never a silent forever-spinner. GETs stay on
 * axios — concurrent reads have never wedged.
 */
let studioMutationChain: Promise<unknown> = Promise.resolve();

/** Mutations BYPASS the `next start` rewrite when the backend origin is
 *  local: the rewrite has repeatedly LOST in-flight POST responses (network
 *  traces 2026-09-07 — request issued, backend answers in seconds, browser
 *  never sees the response). The local backend is CORS-open, so a direct
 *  origin call is observable end to end; deployed hosts keep the proxy. */
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const STUDIO_MUTATION_BASE = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(RAW_API_URL)
  ? RAW_API_URL.replace(/\/$/, '')
  : API_CONFIG.BASE_URL;

function studioMutate<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  timeoutMs = 120_000,
): Promise<T> {
  const run = async (): Promise<T> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let token = '';
      try {
        token = window.localStorage.getItem('access_token') ?? '';
      } catch {
        /* storage unavailable */
      }
      const res = await fetch(`${STUDIO_MUTATION_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => null)) as T | null;
      if (!res.ok) {
        const err = new Error(`Request failed (${res.status})`) as Error & {
          response?: { status: number; data: unknown };
        };
        err.response = { status: res.status, data };
        throw err;
      }
      return data as T;
    } finally {
      clearTimeout(timer);
    }
  };
  // Chain regardless of the previous call's outcome — a failure must never
  // poison the queue.
  const next = studioMutationChain.then(run, run);
  studioMutationChain = next.catch(() => undefined);
  return next;
}

export { studioMutate };

async function studioPostDirect<T>(
  path: string,
  body: unknown,
  timeoutMs = 120_000,
): Promise<T> {
  return studioMutate<T>('POST', path, body, timeoutMs);
}

/* ── Sources (unified, permission-filtered, never credentials) ─────── */

export interface StudioSourceHealth {
  state?: string; // 'ok' | …
  checked_at?: string;
  signal?: string;
}

export interface StudioSource {
  id: string; // e.g. "sf:db:ACTIVITY_TRACKING"
  kind?: string;
  connector_id?: string;
  connector_version?: string;
  family?: string; // warehouse | cloud_storage | …
  label: string;
  status?: string; // available | to_configure | partial | not_integrated
  health?: StudioSourceHealth;
  capabilities?: {
    discovery?: boolean;
    sample?: boolean;
    ingestion?: string;
    write_actions?: string[];
  };
  last_read?: string | null;
  scope?: Record<string, unknown>;
  operations?: Record<string, string>;
}

export async function getStudioSources(): Promise<StudioSource[]> {
  return dedupGet('studio:v1:sources', 120_000, async () => {
    const { data } = await apiClient.get<{ sources?: StudioSource[] }>('/studio/sources');
    return Array.isArray(data?.sources) ? data.sources : [];
  });
}

export interface CatalogConnector {
  id?: string;
  label?: string;
  family?: string;
  status?: string; // available | to_configure | partial | not_integrated
  [k: string]: unknown;
}

export async function getStudioSourcesCatalog(): Promise<CatalogConnector[]> {
  return dedupGet('studio:v1:catalog', 300_000, async () => {
    const { data } = await apiClient.get<{ connectors?: CatalogConnector[]; items?: CatalogConnector[] }>(
      '/studio/sources/catalog',
    );
    return (data?.connectors ?? data?.items ?? []) as CatalogConnector[];
  });
}

export interface StudioObject {
  fqn: string;
  schema: string;
  table: string;
  type?: string;
  approx_row_count?: number | null;
  bytes?: number | null;
  last_altered?: string | null;
  selected?: boolean;
}

export async function getStudioObjects(database: string): Promise<{
  objects: StudioObject[];
  truncated?: boolean;
  note?: string | null;
}> {
  return dedupGet(`studio:v1:objects:${database}`, 120_000, async () => {
    const { data } = await apiClient.get<{
      objects?: StudioObject[];
      truncated?: boolean;
      note?: string | null;
    }>(`/studio/sources/${encodeURIComponent(database)}/objects`);
    return {
      objects: Array.isArray(data?.objects) ? data.objects : [],
      truncated: data?.truncated,
      note: data?.note,
    };
  });
}

/* ── Understanding ─────────────────────────────────────────────────── */

export interface UnderstandingField {
  name: string;
  type?: string;
  nullable?: boolean;
  role?: 'identifier' | 'measure' | 'dimension' | 'time' | 'flag' | string;
}

export interface StudioEntity {
  entity_id: string;
  name: string;
  source_fqn: string;
  /** String on early payloads; structured ModelGrain on the live backend —
   *  render through grainText(), never interpolated raw. */
  grain?: string | ModelGrain | null;
  fields?: UnderstandingField[];
  candidate_keys?: Array<{ columns?: string[]; status?: string }>;
  approx_row_count?: number | null;
  /** false ⇒ metadata only — key uniqueness was NOT verified (budget). */
  profiled?: boolean;
  /** Backend layout hint — facts left, referenced dimensions right. */
  position?: { x?: number; y?: number; layer?: string } | null;
  /** Plain-words description; source 'ai' when Claude wrote it. */
  description?: string | null;
  description_source?: 'ai' | 'deterministic' | string;
}

export interface StudioRelationship {
  from_entity?: string;
  to_entity?: string;
  from_fqn?: string;
  to_fqn?: string;
  keys?: string;
  from_column?: string;
  to_column?: string;
  status?: string; // hypothesis | validated
  duplication_risk?: string; // low | high | unknown
  confidence?: number;
  [k: string]: unknown;
}

/** One end of a relationship. The live backend sends OBJECTS
 *  ({entity_id, entity_name, fqn, column}); older payloads sent flat ids
 *  (from_entity/from_fqn/from_column). Normalize before rendering — an
 *  un-normalized object stringifies to "[object Object]" and a flat read
 *  of the object shape renders '—' (the em-dash bug of 2026-09-06). */
export interface RelEnd {
  id?: string;
  name?: string;
  fqn?: string;
  column?: string;
}

function relEnd(v: unknown): RelEnd {
  if (typeof v === 'string') return { id: v, name: v };
  if (v && typeof v === 'object') {
    const o = v as { entity_id?: string; entity_name?: string; fqn?: string; column?: string };
    return { id: o.entity_id, name: o.entity_name, fqn: o.fqn, column: o.column };
  }
  return {};
}

export function relEndpoints(r: StudioRelationship): {
  from: RelEnd;
  to: RelEnd;
  label?: string;
  keys?: string;
} {
  const raw = r as unknown as { from?: unknown; to?: unknown; label?: unknown };
  const from = raw.from != null ? relEnd(raw.from) : relEnd(r.from_entity ?? r.from_fqn);
  const to = raw.to != null ? relEnd(raw.to) : relEnd(r.to_entity ?? r.to_fqn);
  if (!from.column && r.from_column) from.column = r.from_column;
  if (!to.column && r.to_column) to.column = r.to_column;
  const keys =
    (typeof r.keys === 'string' && r.keys) ||
    (from.column && to.column ? `${from.column} → ${to.column}` : undefined);
  return {
    from,
    to,
    label: typeof raw.label === 'string' ? raw.label : undefined,
    keys,
  };
}

export interface DefinitionToConfirm {
  definition_id: string;
  label: string;
  kind?: string;
  question?: string;
  options?: string[];
  status?: string; // to_confirm
  source?: string;
  formula_hint?: string;
}

/** One decision the USER makes (unified contract, iteration A). */
export interface StudioDecision {
  decision_id: string;
  kind?: 'metric' | 'localization' | 'status_mapping' | 'missing_data' | string;
  field?: string | null;
  label?: string;
  question?: string;
  reason?: string;
  /** Observed/valid choices; null ⇒ free input per `input`. */
  choices?: Array<{ value: unknown; count?: number; label?: string }> | null;
  input?: 'single_select' | 'multi_select' | 'text' | string;
  /** A PROPOSAL — never counted as confirmed until the user says so. */
  proposal?: unknown;
  evidence?: unknown[];
  status?: 'proposed' | 'confirmed' | 'rejected' | 'deferred' | string;
  /** What an unresolved decision blocks (e.g. 'kpi:backlog'). */
  blocks?: string[];
  blocking?: boolean;
  possible_restitution?: Record<string, unknown>;
  data_needed?: string;
}

export interface StudioCoverage {
  selected?: number | string[];
  analyzed?: number | string[];
  profiled?: number | string[];
  not_analyzed?: Array<{ fqn: string; reason?: string }>;
  retained_in_model?: Array<string | { fqn: string }>;
  not_retained?: Array<{ fqn: string; relevance?: string; reason?: string }>;
  need?: {
    concepts?: string[];
    covered_concepts?: string[];
    missing_concepts?: Array<{ concept: string; consequence?: string }>;
  };
  campaign_limit?: Record<string, unknown> & { note?: string };
}

export interface StudioDomainInfo {
  domain_id?: string;
  label?: string;
  industry_id?: string;
  category_id?: string;
  hierarchy?: string[];
  /** true ⇒ chosen by the backend from the need — confirm in the context. */
  inferred?: boolean;
  inferred_from?: string[];
  note?: string;
}

/** The user's call on one decision — persisted on the draft. */
/** Register the pattern KPI candidates of an EXISTING draft as decisions —
 *  drafts created before the contract display candidates on read, but a
 *  keep/discard needs the decision row to exist first. */
export async function proposeKpiCandidates(draftId: string): Promise<Record<string, unknown>> {
  return studioMutate(
    'POST',
    `/studio/drafts/${encodeURIComponent(draftId)}/kpi-candidates/propose`,
    {},
    120_000,
  );
}

export async function postDecision(
  draftId: string,
  body: {
    decision_id: string;
    status: 'confirmed' | 'rejected' | 'deferred' | 'proposed';
    value?: { choice?: unknown } | { open_values?: unknown[] } | { text?: string };
    note?: string;
  },
): Promise<{ decision?: StudioDecision; report_stale?: boolean }> {
  return studioMutate('POST', API.studio.draftDecision(draftId), body, 30_000);
}

export interface StudioUnderstanding {
  schema_version?: string;
  decisions?: StudioDecision[];
  coverage?: StudioCoverage;
  domain?: StudioDomainInfo | null;
  /** Auto-created when the call carried no draft_id (auto_draft default). */
  draft?: { draft_id?: string; title?: string; auto_created?: boolean };
  /** Registry writes are deferred post-response ('deferred'). */
  registry?: { status?: string };
  /** true ⇒ the 75 s profiling budget ran out: some tables kept only their
   *  metadata (entities[].profiled === false) and appear in `skipped`. */
  partial?: boolean;
  skipped?: Array<{ fqn: string; reason?: string }>;
  budget?: { understand_budget_s?: number; elapsed_s?: number };
  entities?: StudioEntity[];
  relationships?: StudioRelationship[];
  definitions_to_confirm?: DefinitionToConfirm[];
  ai?: {
    status?: 'ok' | 'unavailable' | 'skipped' | string;
    reason?: string;
    summary?: string;
    suggested_metrics?: unknown[];
    open_questions?: string[];
    model?: string;
    provider?: string;
    validation?: { mode?: string; attempts?: number; dropped_for_unknown_fields?: string[] };
    model_selection?: { model?: string; verified?: boolean; reason?: string };
  };
  steps?: unknown[];
  traceability?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Business context (drafts + understand contract) — persisted in the draft
 *  and fed to the AI prompt as the user's business context. All optional. */
export interface StudioBusinessContext {
  industry_id?: string | null;
  category_id?: string | null;
  /** Drill order, e.g. ['company','region','store'] — max 8 levels. */
  hierarchy?: string[];
  audience?: string | null;
  /** Preferred-display phrases, verbatim (registry: display_hint enrichment). */
  display_hints?: string[];
  notes?: string | null;
  /** Multi-domain selection (≤5) — the backend merges the packs and the
   *  datalake scan reports coverage PER domain. */
  domains?: string[];
}

/* ── Datalake multi-domain scan (directive 2) ──────────────────────── */

export interface DatalakeScan {
  coverage?: Record<string, unknown>;
  uncovered_domains?: string[];
  candidates?: Array<{
    fqn: string;
    relevance_by_domain?: Record<string, string>;
    best_domain?: string;
    preselect?: boolean;
    domains_covered?: string[];
  }>;
  union_preselect?: string[];
  merged_pack?: Record<string, unknown>;
}

/** Bounded datalake discovery across up to 5 domains — coverage said per
 *  domain, uncovered domains named, never silently dropped. */
export async function scanDatalake(body: {
  need: string;
  domains: string[];
  databases?: string[];
}): Promise<DatalakeScan> {
  return studioMutate<DatalakeScan>('POST', '/studio/datalake/scan', body, 180_000);
}

export async function understand(body: {
  need: string;
  /** Omit to analyze the sources RECORDED ON THE DRAFT — the backend
   *  refuses honestly when the draft holds none. */
  objects?: Array<{ fqn: string }>;
  domain_id?: string | null;
  context?: StudioBusinessContext | null;
  use_ai?: boolean;
  draft_id?: string | null;
}): Promise<StudioUnderstanding> {
  return studioMutate<StudioUnderstanding>('POST', '/studio/understand', body, 180_000);
}

/* ── Drafts (backend-persisted journey — no local business data) ───── */

export interface StudioDraftSummary {
  draft_id: string;
  title?: string | null;
  /** The short business name (set at generate time, renamable) — the
   *  question lives in `need`, never as the identity. */
  display_name?: string | null;
  need?: string | null;
  purpose?: 'application' | 'source_analysis' | string;
  has_report?: boolean;
  has_understanding?: boolean;
  active_version?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  step?: string | null;
  step_name?: string | null;
  [k: string]: unknown;
}

export async function listDrafts(
  purpose?: 'application' | 'source_analysis' | 'all',
): Promise<StudioDraftSummary[]> {
  const { data } = await apiClient.get<{ drafts?: StudioDraftSummary[] }>(
    `/studio/drafts${purpose ? `?purpose=${purpose}` : ''}`,
  );
  return Array.isArray(data?.drafts) ? data.drafts : [];
}

export async function createDraft(payload: Record<string, unknown>): Promise<string | null> {
  const data = await studioMutate<{ draft_id?: string }>('POST', '/studio/drafts', payload, 30_000);
  return data?.draft_id ?? null;
}

/** Source-onboarding variants on the fetch transport (see studioPostDirect). */
export async function createDraftDirect(
  payload: Record<string, unknown>,
): Promise<string | null> {
  const data = await studioPostDirect<{ draft_id?: string }>('/studio/drafts', payload, 30_000);
  return data?.draft_id ?? null;
}

export async function understandDirect(
  body: Parameters<typeof understand>[0],
): Promise<StudioUnderstanding> {
  return studioPostDirect<StudioUnderstanding>('/studio/understand', body, 180_000);
}

/** Remove ONE application draft — the model/report/decisions with it. */
export async function deleteDraft(draftId: string): Promise<void> {
  await apiClient.delete(API.studio.draftDelete(draftId), { timeout: 30_000 });
}

export async function getDraft(draftId: string): Promise<Record<string, unknown> | null> {
  const { data } = await apiClient.get<Record<string, unknown>>(
    `/studio/drafts/${encodeURIComponent(draftId)}`,
  );
  return data ?? null;
}

/** The light per-application rollup — counts, context, activation, cost,
 *  usage — without the heavy bodies (one call instead of four). */
export interface DraftSummary {
  draft_id?: string;
  title?: string | null;
  step?: string | null;
  context?: StudioBusinessContext | null;
  activation?: { status?: string; [k: string]: unknown } | null;
  cost?: {
    interventions?: number;
    ai_calls?: number;
    duration_ms?: number;
    credits_charged?: number;
    by_kind?: Record<string, number>;
    models?: unknown;
    usage?: Record<string, unknown>;
  } | null;
  summary?: Record<string, number> | null;
  [k: string]: unknown;
}

export async function getDraftSummary(draftId: string): Promise<DraftSummary | null> {
  try {
    const { data } = await apiClient.get<DraftSummary>(
      API.studio.draftWithInclude(draftId, 'summary'),
    );
    return data ?? null;
  } catch {
    return null;
  }
}

/** The FULL chart specs (runnable) without understanding/automation —
 *  lighter than the include_ops model read. */
export async function getDraftReport(draftId: string): Promise<StudioReportSpec | null> {
  try {
    const { data } = await apiClient.get<{ report?: StudioReportSpec }>(
      API.studio.draftWithInclude(draftId, 'report'),
    );
    return data?.report ?? null;
  } catch {
    return null;
  }
}

export async function updateDraft(
  draftId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await studioMutate('PUT', `/studio/drafts/${encodeURIComponent(draftId)}`, payload, 30_000);
}

/* ── Report (the REAL preview) ─────────────────────────────────────── */

export interface ChartSpecMeasure {
  column: string;
  aggregator: string;
  aggregation?: string | null;
  seuils?: unknown[];
}

export interface StudioChartSpec {
  chart_id: string;
  title: string;
  kind: 'kpi' | 'chart' | 'table' | string;
  chart_type: string; // kpi_card | line | bar | table | …
  dataset: { database: string; schema: string; table: string };
  measures: ChartSpecMeasure[];
  dimensions: Array<string | { column: string }>;
  time?: { column: string; grain: string } | null;
  filters?: Array<{ column: string; operator?: string; op?: string; value?: unknown }>;
  sort?: unknown;
  limit?: number;
  columns?: string[];
  presentation?: Record<string, unknown>;
  status?: string; // available | unavailable
  unavailable_reason?: string | null;
  provenance?: { generated_by?: string; run_id?: string; rationale?: string; definition_ids?: string[] };
}

/** One page of the dashboard. A report without `pages` is a single page. */
export interface StudioReportPage {
  page_id: string;
  title: string;
  order?: number;
}

/** Where a widget sits, and — since the multi-page contract — on which page. */
export interface StudioLayoutEntry {
  /** optional on the wire — a layout row can arrive without its widget */
  chart_id?: string;
  page_id?: string;
  order?: number;
  w?: number;
  h?: number;
}

export interface StudioReportSpec {
  title: string;
  kpis: StudioChartSpec[];
  charts: StudioChartSpec[];
  detail?: StudioChartSpec | null;
  filters?: Array<{ filter_id: string; column: string; type: string }>;
  pages?: StudioReportPage[];
  layout?: StudioLayoutEntry[];
  unavailable?: Array<{ label: string; reason: string }>;
  [k: string]: unknown;
}

export async function generateReport(body: {
  understanding?: StudioUnderstanding;
  draft_id?: string | null;
  need?: string;
}): Promise<{ draft_id?: string; credits_charged?: number; report: StudioReportSpec }> {
  return studioMutate('POST', '/studio/report/generate', body, 150_000);
}

export interface RunResult {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  sql?: string;
  meta?: Record<string, unknown>;
  scope?: { is_production_total?: boolean; [k: string]: unknown };
  duration_ms?: number;
}

export type GlobalFilter = { column: string; operator: string; value: unknown };

export async function runChart(
  spec: StudioChartSpec,
  globalFilters: GlobalFilter[] = [],
): Promise<RunResult> {
  return studioMutate<RunResult>(
    'POST',
    '/studio/report/run',
    { spec, global_filters: globalFilters },
    120_000,
  );
}

/** One tile of a batch run — errors are isolated per tile. */
export interface BatchTileResult extends Partial<RunResult> {
  chart_id?: string;
  status?: 'ok' | 'valid' | 'error' | string;
  /** NOT a string on the wire: the route sends a structured object
   *  ({error_code, message, detail}). Typing it `string` is what let an
   *  object reach JSX and blank the page — read it with readFailure(). */
  error?: unknown;
  /** dry_run only: partitions/bytes from EXPLAIN — never a money amount. */
  estimate?: {
    partitions_total?: number;
    partitions_assigned?: number;
    bytes_assigned?: number;
    source?: string;
    note?: string;
    state?: string;
  };
}

export interface BatchRunResult {
  results?: BatchTileResult[];
  count?: number;
  ok?: number;
  failed?: number;
  duration_ms?: number;
  /** Which contract version served this run — is_draft flips true as soon
   *  as an edit follows the last publication. */
  version?: { version_number?: number; is_draft?: boolean };
  [k: string]: unknown;
}

/** Every tile of a report in ONE call (≤40 specs, one connection backend-
 *  side). dry_run=true returns cost estimates instead of rows. */
export async function runChartBatch(
  specs: StudioChartSpec[],
  opts?: { draftId?: string; globalFilters?: GlobalFilter[]; dryRun?: boolean },
): Promise<BatchRunResult> {
  return studioMutate<BatchRunResult>(
    'POST',
    API.studio.reportRunBatch(),
    {
      draft_id: opts?.draftId,
      specs,
      global_filters: opts?.globalFilters ?? [],
      dry_run: opts?.dryRun ?? false,
    },
    180_000,
  );
}

export async function validateChart(
  spec: StudioChartSpec,
  globalFilters: GlobalFilter[] = [],
): Promise<{ ok?: boolean; [k: string]: unknown }> {
  return studioMutate(
    'POST',
    '/studio/report/validate',
    { spec, global_filters: globalFilters },
    60_000,
  );
}

/* ── Export: three scopes, never one silently capped extract ───────── */

/**
 * The three scopes are the product's, not a UI invention: the backend's
 * preview policy already treats `export_job` as a credit-gated operation,
 * so only the preview envelope is free. `visible` never leaves the browser
 * — those rows are already on screen and cost nothing to serialise.
 */
export type ExportScope = 'result_preview' | 'full_result' | 'raw_rows';

export interface ExportOutcome {
  ok: boolean;
  scope: ExportScope;
  /** the file body, when the policy allowed it */
  csv?: string;
  /** rows actually written, read from x-export-rows */
  rows?: number;
  /** true ⇒ the file is NOT the whole answer */
  truncated?: boolean;
  /** set when the policy refuses this scope — carries why and what unlocks it */
  gated?: { op?: string; message: string; nextStep?: string };
  /**
   * Set when the answer could not be computed at all. `productFailure`
   * false means the budget ran out or the session lapsed — the product is
   * not broken, and saying so is the difference between an honest surface
   * and a bug report. The backend states it rather than us guessing from
   * message text.
   */
  unavailable?: {
    message: string;
    code?: string;
    blockedBy?: string;
    productFailure?: boolean;
  };
}

/**
 * Ask the server for one widget's figures at an explicit scope. Refusals
 * are returned, never thrown: a 403 from the credit policy is a legitimate
 * product answer ("this needs activation"), not an error to swallow.
 */
export async function exportChartResult(
  spec: StudioChartSpec,
  opts: { draftId?: string; scope: ExportScope; globalFilters?: GlobalFilter[] },
): Promise<ExportOutcome> {
  let token = '';
  try {
    token = window.localStorage.getItem('access_token') ?? '';
  } catch {
    /* storage unavailable */
  }
  const res = await fetch(`${STUDIO_MUTATION_BASE}/studio/report/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      spec,
      draft_id: opts.draftId,
      scope: opts.scope,
      format: 'csv',
      global_filters: opts.globalFilters ?? [],
    }),
  });

  if (res.ok) {
    const rows = Number(res.headers.get('x-export-rows'));
    return {
      ok: true,
      scope: opts.scope,
      csv: await res.text(),
      rows: Number.isFinite(rows) ? rows : undefined,
      truncated: res.headers.get('x-export-truncated') === 'true',
    };
  }

  const detail = (await res.json().catch(() => null)) as {
    detail?: {
      error_code?: string;
      message?: string;
      next_step?: string;
      op?: string;
      blocked_by?: string;
      is_product_failure?: boolean;
    };
  } | null;
  const d = detail?.detail ?? {};

  // The policy refusing a paid scope is a product ANSWER, not a failure:
  // the reader is told what this costs and who can authorise it.
  if (res.status === 403 && d.error_code === 'PREVIEW_OP_CREDIT_GATED') {
    return {
      ok: false,
      scope: opts.scope,
      gated: {
        op: d.op,
        message: d.message ?? 'This export needs activation.',
        nextStep: d.next_step,
      },
    };
  }
  return {
    ok: false,
    scope: opts.scope,
    unavailable: {
      message: d.message ?? `The server could not produce this export (${res.status}).`,
      code: d.error_code,
      blockedBy: d.blocked_by,
      productFailure: d.is_product_failure,
    },
  };
}

/* ── Model view + structured edits (K3 contract, live :8078) ───────── */

export interface ModelIngestion {
  ingestion_type?: string;
  cadence?: string | null;
  last_run?: string | null;
  source_name?: string | null;
  days_since_last_load?: number | null;
  [k: string]: unknown;
}

export interface ModelGrain {
  key?: string[];
  statement?: string;
  status?: string;
  time_field?: string | null;
}

export interface ModelTable {
  entity_id: string;
  name: string;
  fqn: string;
  row_count_approx?: number | null;
  description?: string | null;
  description_source?: 'ai' | 'deterministic' | string;
  position?: { x?: number; y?: number; layer?: string } | null;
  /** String on understand entities; structured object on the model view. */
  grain?: string | ModelGrain | null;
  /** Field COUNT on the model view; full field list on understand entities. */
  fields?: number | UnderstandingField[];
  event_contract?: Record<string, unknown> | null;
  ingestion?: ModelIngestion | null;
  /** HOW this source is fed — snapshot/event_driven/batch/realtime, or an
   *  honest `unknown`. Proof levels mirror the key reading (declared >
   *  sampled > inferred); a user's explicit choice is never overwritten
   *  by a rescan. */
  load_pattern?: {
    pattern?: string;
    confidence?: string;
    evidence?: string[];
    time_field?: string | null;
    values?: string[];
  } | null;
  /** Scan-time DQ from the SAMPLE the understanding already held — key
   *  nulls, grain duplicates. Referential integrity needs a join, so it
   *  arrives "not evaluated" with the route that computes it. */
  sample_dq?: {
    overall?: string;
    checks?: Array<{
      check?: string;
      columns?: string[];
      verdict?: string;
      evidence?: Record<string, unknown>;
      scope?: string;
      how?: string;
    }>;
    scope?: string;
  } | null;
  /** Pattern-aware repetitive KPIs, each a DECISION the user keeps or
   *  discards — nothing is generated without that word. `spec` compiles
   *  directly in the report engine; what the pattern wants but the engine
   *  cannot express yet is listed in not_expressible, never approximated. */
  kpi_candidates?: {
    candidates?: Array<{
      kpi_id?: string;
      decision_id?: string;
      title?: string;
      pattern?: string;
      why?: string;
      measure?: { column?: string; aggregator?: string };
      dimensions?: string[];
      period?: string | null;
      spec?: StudioChartSpec;
      status?: string;
    }>;
    not_expressible?: Array<{ title?: string; reason?: string; why?: string }>;
    pattern?: string;
  } | null;
  lineage?: {
    upstream?: string[];
    downstream?: string[];
    upstream_count?: number;
    downstream_count?: number;
    impact_count?: number;
    risk_level?: string;
    source?: string;
  };
}

/** One plain sentence for a grain, whichever shape the backend sent. */
export function grainText(g: ModelTable['grain']): string | null {
  if (!g) return null;
  if (typeof g === 'string') return g;
  return g.statement ?? (g.key?.length ? `keyed by ${g.key.join('+')}` : null);
}

export interface ModelGraphNode {
  id: string;
  label?: string;
  fqn?: string;
  rows?: number | null;
  position?: { x?: number; y?: number; layer?: string } | null;
  [k: string]: unknown;
}

export interface ModelGraph {
  nodes?: ModelGraphNode[];
  edges?: Array<{ from?: string; to?: string; label?: string; [k: string]: unknown }>;
}

/** GET /studio/model/{draft_id} — the full editable model of one draft. */
export interface StudioModelView {
  schema_version?: string;
  tables?: ModelTable[];
  relationships?: Array<StudioRelationship & { from?: string; to?: string; label?: string }>;
  definitions?: DefinitionToConfirm[];
  report?: StudioReportSpec | null;
  /** Ready for React Flow — nodes/edges precomputed backend-side. */
  graph?: ModelGraph;
  /** The allowlisted edit paths (/report/title, /report/kpis/<i>/…, …). */
  editable_paths?: string[];
  traceability?: Record<string, unknown>;
  [k: string]: unknown;
}

export async function getModel(
  draftId: string,
  includeOps = true,
): Promise<StudioModelView> {
  const { data } = await apiClient.get<StudioModelView>(
    API.studio.model(draftId, includeOps),
    { timeout: 60_000 },
  );
  return data;
}

/** Per-table ingestion + lineage, loaded lazily (role cache 15 min). */
export async function getModelTableOps(
  draftId: string,
  fqn: string,
): Promise<{ ingestion?: ModelIngestion | null; lineage?: ModelTable['lineage'] } | null> {
  try {
    const { data } = await apiClient.get<{
      ingestion?: ModelIngestion | null;
      lineage?: ModelTable['lineage'];
    }>(API.studio.modelTableOps(draftId, fqn), { timeout: 45_000 });
    return data ?? null;
  } catch {
    return null; // ops are enrichment — the graph stays useful without them
  }
}

export interface ModelPatchOp {
  op: 'set' | 'remove' | 'add';
  path: string;
  value?: unknown;
}

export interface PatchDependency {
  path: string;
  impacts?: string[];
  risk?: 'none' | 'low' | 'medium' | 'high' | string;
}

export interface PatchValidationResult {
  target?: string;
  status?: 'valid' | 'invalid' | string;
  sql?: string;
  error?: string;
}

/** Shared preview/apply envelope of POST patch and POST edit. */
export interface ModelPatchResult {
  status?: 'previewed' | 'applied' | 'clarification_needed' | 'ai_unavailable' | string;
  ops?: ModelPatchOp[];
  applied?: Array<{ op?: string; path: string; before?: unknown; after?: unknown }>;
  dependencies?: PatchDependency[];
  validation?: { results?: PatchValidationResult[]; ok?: boolean };
  can_apply?: boolean;
  questions?: string[];
  provenance?: {
    source?: string;
    prompt_version?: string;
    model?: string;
    mode?: string;
    run_id?: string;
  };
  [k: string]: unknown;
}

/** Manual structured edit — apply:false previews (diff + deps + revalidated
 *  SQL), apply:true writes a new draft version; nothing regenerates. */
export async function patchModel(
  draftId: string,
  ops: ModelPatchOp[],
  apply: boolean,
  summary?: string,
  /** The updated_at read with the state being edited — the backend 409s
   *  (EDIT_CONFLICT) when someone else saved in between. */
  expectedUpdatedAt?: string,
): Promise<ModelPatchResult> {
  return studioMutate<ModelPatchResult>(
    'POST',
    API.studio.modelPatch(draftId),
    {
      ops,
      apply,
      summary,
      ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}),
    },
    60_000,
  );
}

/** Natural-language edit — AI turns the instruction into an allowlisted
 *  patch, previewed exactly like patchModel. Apply through patchModel with
 *  the returned ops. `clarification_needed` carries `questions[]`;
 *  `ai_unavailable` means manual editing stays possible. */
export async function editModel(
  draftId: string,
  instruction: string,
  model?: string,
  /** Optimistic lock — the backend refuses BEFORE spending an AI unit
   *  (ai_call_spent:false) when another tab saved in between. */
  expectedUpdatedAt?: string,
): Promise<ModelPatchResult> {
  return studioMutate<ModelPatchResult>(
    'POST',
    API.studio.modelEdit(draftId),
    {
      instruction,
      model,
      apply: false,
      ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}),
    },
    120_000,
  );
}

/* ── Access plan (Studio governance — chat-driven, no forms) ───────── */

export interface AccessPlanWho {
  type: 'user' | 'role' | string;
  name: string;
}

/** POST /studio/access/plan — propose who can see/do what on a draft's
 *  objects. The backend answers with a structured plan (never executes). */
export async function planAccess(body: {
  draft_id: string;
  who: AccessPlanWho[];
  actions?: string[];
  objects?: Array<{ fqn: string }> | null;
  restrictions?: Record<string, unknown> | null;
}): Promise<Record<string, unknown>> {
  return studioMutate<Record<string, unknown>>('POST', API.studio.accessPlan(), body, 60_000);
}

/** Bulk enrichment decision — one approval instead of N clicks; filter
 *  by scope prefix/kind/status (limit ≤500) or explicit ids. */
export async function decideEnrichmentsMany(body: {
  status: 'confirmed' | 'rejected';
  filter?: { scope_prefix?: string; kind?: string; status?: string; limit?: number };
  enrichment_ids?: string[];
}): Promise<{ decided?: number; skipped?: unknown[]; by_source?: Record<string, number> }> {
  return studioMutate(
    'POST',
    '/studio/registry/enrichments/decide-many',
    body,
    120_000,
  );
}

/* ── ETL block catalog + job graphs + block proposals ──────────────── */

export interface BlockAvailability {
  status?: 'available' | 'partial' | 'to_configure' | 'not_integrated' | 'template' | string;
  studio_execution?: boolean;
  evidence?: string;
  not_integrated?: string[];
  how?: string;
}

export interface BlockNode {
  id: string;
  block_type?: string;
  family?: 'ingestion' | 'transform' | 'python_ml' | 'delivery' | 'control' | string;
  label?: string;
  description?: string;
  config?: Record<string, unknown>;
  edit_paths?: string[];
  availability?: BlockAvailability;
  position?: { x?: number; y?: number };
}

export interface BlockGraph {
  nodes: BlockNode[];
  edges: Array<{ id?: string; source: string; target: string; label?: string }>;
}

/** A JOB as an editable graph of ETL blocks — derived on read, never
 *  stored; the edit_paths are the SAME allowlisted patch paths the
 *  existing editors use (one definition everywhere). */
export async function getJobGraph(draftId: string, jobId: string): Promise<BlockGraph> {
  const { data } = await apiClient.get<Partial<BlockGraph>>(
    `/studio/drafts/${encodeURIComponent(draftId)}/jobs/${encodeURIComponent(jobId)}/graph`,
    { timeout: 60_000 },
  );
  return {
    nodes: Array.isArray(data?.nodes) ? data.nodes : [],
    edges: Array.isArray(data?.edges) ? data.edges : [],
  };
}

export interface BlockProposal {
  proposal_id: string;
  block_type?: string;
  family?: string;
  label?: string;
  title?: string;
  description?: string;
  description_ai?: string;
  why?: Array<{ type?: string; ref?: string; detail?: string }>;
  config?: Record<string, unknown>;
  availability?: BlockAvailability;
  editable_in?: Record<string, unknown>;
  where?: { kind?: string; attach_to?: string };
  state?: 'proposed' | 'accepted' | 'rejected' | 'deferred' | string;
  source?: 'deterministic' | 'ai' | string;
  next?: { note?: string; availability?: BlockAvailability };
}

export interface BlockProposalsView {
  proposals: BlockProposal[];
  questions?: string[];
  rejected?: Array<{ reason?: string }>;
  ai?: { status?: string; mode?: string; model?: string; run_id?: string };
}

/** Derive block proposals from the APPLICATION's own context. use_ai:true
 *  spends 1 AI unit for business descriptions + ≤3 VALIDATED extras. */
export async function proposeBlocks(
  draftId: string,
  useAi = false,
): Promise<BlockProposalsView> {
  const data = await studioMutate<Partial<BlockProposalsView>>(
    'POST',
    `/studio/drafts/${encodeURIComponent(draftId)}/blocks/propose`,
    { use_ai: useAi },
    180_000,
  );
  return {
    proposals: Array.isArray(data?.proposals) ? data.proposals : [],
    questions: data?.questions,
    rejected: data?.rejected,
    ai: data?.ai,
  };
}

export async function getBlocks(draftId: string): Promise<BlockProposalsView> {
  const { data } = await apiClient.get<Partial<BlockProposalsView>>(
    `/studio/drafts/${encodeURIComponent(draftId)}/blocks`,
    { timeout: 60_000 },
  );
  return { proposals: Array.isArray(data?.proposals) ? data.proposals : [] };
}

/** A proposal is NEVER executed by its acceptance — the decision persists
 *  across re-proposals; accepted-but-not-executable carries next{note}. */
export async function decideBlock(
  draftId: string,
  proposalId: string,
  state: 'accepted' | 'rejected' | 'deferred',
): Promise<BlockProposal> {
  const data = await studioMutate<{ proposal?: BlockProposal } & BlockProposal>(
    'POST',
    `/studio/drafts/${encodeURIComponent(draftId)}/blocks/${encodeURIComponent(proposalId)}/decision`,
    { state },
    60_000,
  );
  return (data?.proposal ?? data) as BlockProposal;
}

/* ── Per-application cost attribution (QUERY_TAG → attributed credits) ── */

export interface AppCost {
  warehouse?: {
    state?: string;
    days?: number;
    queries?: number;
    credits_attributed_compute?: number;
    elapsed_ms?: number;
    bytes_scanned?: number;
    warehouses?: unknown[];
    source?: string;
    latency?: string;
  };
  unavailable?: { reason?: string; hint?: string };
}

/** Credits ATTRIBUTED to this application's queries (QUERY_TAG-based,
 *  ≤45 min metering latency; only queries after the tagging deploy).
 *  Never a currency amount — attribution is credits, honestly. */
export async function getAppCost(draftId: string, days = 7): Promise<AppCost> {
  const { data } = await apiClient.get<AppCost>(
    `/studio/registry/cost?draft_id=${encodeURIComponent(draftId)}&days=${days}`,
    { timeout: 60_000 },
  );
  return data ?? {};
}

/* ── D-1 — consolidated administration (no new monitoring page) ────── */

/** All the account's studio applications — light digest rows. */
export async function getAdminStudioApps(): Promise<StudioDraftSummary[]> {
  const { data } = await apiClient.get<{ apps?: StudioDraftSummary[] }>(
    '/api/administration/studio/apps',
    { timeout: 60_000 },
  );
  return Array.isArray(data?.apps) ? data.apps : [];
}

export interface AdminAppDetail {
  application?: Record<string, unknown>;
  versions?: unknown[];
  endpoints?: { by_route?: Array<Record<string, unknown>>; timeline?: unknown; note?: string };
  generation?: Record<string, unknown>;
  cache?: Record<string, unknown>;
  sql?: Record<string, unknown>;
  executions?: Record<string, unknown>;
  errors?: Record<string, unknown>;
  tests?: Record<string, unknown>;
  consumption?: Record<string, unknown>;
  links?: Record<string, unknown>;
  digest?: Record<string, unknown>;
}

/** One application's full operational truth (product ACCOUNTADMIN). */
export async function getAdminStudioApp(draftId: string): Promise<AdminAppDetail> {
  const { data } = await apiClient.get<AdminAppDetail>(
    `/api/administration/studio/apps/${encodeURIComponent(draftId)}`,
    { timeout: 120_000 },
  );
  return data ?? {};
}

/* ── C-3 — per-application access (who → what → data → restrictions) ── */

export interface AccessObjectRead {
  as?: string;
  kind?: string;
  fqn?: string;
  read?: 'allowed' | 'denied' | 'predicted_allowed' | 'predicted_denied' | string;
  verified?: boolean;
  query_id?: string | null;
  duration_ms?: number;
  expect?: string;
}

export interface AccessMutation {
  mutation_id?: string;
  kind?: string;
  sql?: string[];
  undo_sql?: string[];
  layer?: string;
  risk?: string;
  apply_supported?: boolean;
}

export interface AccessView {
  me?: {
    username?: string;
    snowflake_role?: string;
    data360_role?: string;
    is_accountadmin?: boolean;
    objects?: AccessObjectRead[];
    can_change_access?: boolean;
    note?: string;
  };
  plan?: Record<string, unknown> | null;
  diff?: {
    mutations?: AccessMutation[];
    effects?: Array<Record<string, unknown>>;
    /** 'layered' = access-role model: grants once on <APP>_ACCESS, reused
     *  by the ≤5 functional roles. */
    model?: string;
    roles?: { app_key?: string; access_role?: string; functional?: Record<string, string> };
    order?: unknown;
  } | null;
  effects?: Array<Record<string, unknown>>;
  tests?: AccessObjectRead[];
  applied?: Array<Record<string, unknown>>;
  status?: 'no_plan' | 'planned' | 'dry_run' | 'applied' | string;
  question_template?: string;
}

export async function getAccess(draftId: string): Promise<AccessView> {
  const { data } = await apiClient.get<AccessView>(
    `/studio/drafts/${encodeURIComponent(draftId)}/access`,
    { timeout: 180_000 },
  );
  return data ?? {};
}

/** The app's GENERATED governance names + per-column RLS candidates —
 *  a read-only suggestion (observed values), nothing executes. */
export interface RlsSuggestion {
  roles?: { app_key?: string; access_role?: string; functional?: Record<string, string> };
  candidates?: Array<{
    entity_id?: string;
    fqn?: string;
    column?: string;
    role?: string;
    observed_values?: Array<{ value?: string; count?: number }>;
  }>;
}

export async function suggestRls(draftId: string): Promise<RlsSuggestion> {
  const { data } = await apiClient.post<RlsSuggestion>(
    API.studio.rlsSuggest(draftId),
    {},
    { timeout: 180_000 },
  );
  return data ?? {};
}

/**
 * The people and warehouse roles that ALREADY EXIST on the account.
 *
 * Governance is an association, not an invention: you map someone who
 * exists onto a Data360 role. Typing a name into a free-text box — which
 * is what this replaced — let a typo produce a grant for a principal that
 * is not there, and gave no way to see who was already covered.
 *
 * Failures are returned as an empty list plus a reason rather than thrown:
 * a reader without governance rights should see "you cannot list the
 * account's users", not an error boundary.
 */
export async function listAccountPrincipals(): Promise<{
  principals: Array<{ name: string; kind: 'user' | 'role'; disabled?: boolean }>;
  note?: string;
}> {
  const pick = (payload: unknown, keys: string[]): Array<Record<string, unknown>> => {
    if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
    const o = (payload ?? {}) as Record<string, unknown>;
    for (const k of keys) if (Array.isArray(o[k])) return o[k] as Array<Record<string, unknown>>;
    return [];
  };
  const nameOf = (r: Record<string, unknown>): string =>
    String(r.name ?? r.username ?? r.role ?? r.role_name ?? r.NAME ?? '').trim();

  const [users, roles] = await Promise.allSettled([
    apiClient.get(API.gouvernance.users(), { timeout: 60_000 }),
    apiClient.get(API.gouvernance.roles(), { timeout: 60_000 }),
  ]);

  const out: Array<{ name: string; kind: 'user' | 'role'; disabled?: boolean }> = [];
  if (users.status === 'fulfilled')
    for (const u of pick(users.value.data, ['users', 'items', 'data'])) {
      const n = nameOf(u);
      if (n) out.push({ name: n, kind: 'user', disabled: u.disabled === true || u.enabled === false });
    }
  if (roles.status === 'fulfilled')
    for (const r of pick(roles.value.data, ['roles', 'items', 'data'])) {
      const n = nameOf(r);
      if (n) out.push({ name: n, kind: 'role' });
    }

  const failed = [users, roles].filter((p) => p.status === 'rejected').length;
  return {
    principals: out,
    note:
      out.length === 0 && failed
        ? 'The account’s users and roles could not be read — this usually means your role may not list them.'
        : undefined,
  };
}

/**
 * Who WOULD see which rows under a PLANNED restriction — before anything
 * is applied. The governance simulate route replays a policy already
 * bound to the table; this one simulates the plan itself, read-only, on
 * the caller's session, zero credits beyond bounded counts.
 */
export interface RlsPlanSimulation {
  fqn?: string;
  column?: string;
  total_rows?: number;
  by_grant_type?: Record<
    string,
    {
      allowed_values?: string[] | '*';
      visible_rows?: number;
      share?: number;
      filter?: string;
      warning?: string;
    }
  >;
  predicate?: string;
  state?: string;
}

export async function simulateRlsPlan(
  draftId: string,
  body: {
    fqn?: string;
    target_id?: string;
    column: string;
    allowed_values_by_grant_type: Record<string, string[] | '*'>;
    rows?: number;
  },
): Promise<RlsPlanSimulation> {
  return studioMutate<RlsPlanSimulation>(
    'POST',
    `/studio/drafts/${encodeURIComponent(draftId)}/access/rls/simulate`,
    body,
    120_000,
  );
}

/** The five functional grant types (view|edit|operate|approve|admin) +
 *  the layering rules — max 5 per application, data access SEPARATE
 *  behind one per-app access role. */
export async function getGrantTypes(): Promise<
  Array<{ grant_type?: string; id?: string; label?: string; description?: string }>
> {
  const { data } = await apiClient.get<{ grant_types?: Array<Record<string, string>> }>(
    '/studio/access/grant-types',
    { timeout: 30_000 },
  );
  return (data?.grant_types ?? []) as Array<{ grant_type?: string; label?: string; description?: string }>;
}

export async function planDraftAccess(
  draftId: string,
  body: {
    who: Array<{ type: string; name: string; via_role?: string; grant_type?: string }>;
    actions?: string[];
    grant_types?: string[];
    objects?: Array<{ fqn: string }>;
    restrictions?: {
      rows?: Array<{
        column: string;
        allowed_values?: unknown[];
        allowed_values_by_grant_type?: Record<string, unknown>;
      }>;
      columns_masked?: string[];
      unmasked_grant_types?: string[];
    };
    layering?: boolean;
  },
): Promise<AccessView> {
  return studioMutate<AccessView>(
    'POST',
    `/studio/drafts/${encodeURIComponent(draftId)}/access/plan`,
    body,
    180_000,
  );
}

/** Dry-run by default; confirm:true executes ONLY the listed mutation ids
 *  (gated — a non-ACCOUNTADMIN gets 403 APPROVAL_REQUIRED rendered as-is). */
export async function applyDraftAccess(
  draftId: string,
  mutationIds: string[],
  confirm: boolean,
): Promise<Record<string, unknown>> {
  return studioMutate(
    'POST',
    `/studio/drafts/${encodeURIComponent(draftId)}/access/apply`,
    { mutation_ids: mutationIds, confirm },
    180_000,
  );
}

export async function testDraftAccess(
  draftId: string,
  subjects: string[],
): Promise<AccessObjectRead[]> {
  const data = await studioMutate<{ tests?: AccessObjectRead[]; results?: AccessObjectRead[] }>(
    'POST',
    `/studio/drafts/${encodeURIComponent(draftId)}/access/test`,
    { subjects },
    240_000,
  );
  return data?.tests ?? data?.results ?? [];
}

/* ── AI registry (interventions journal + enrichment directory) ────── */

export interface AiIntervention {
  intervention_id: string;
  kind?: string;
  prompt_id?: string;
  prompt_version?: string;
  pack_id?: string;
  model?: string;
  provider?: string;
  mode?: string;
  run_id?: string;
  target?: string | null;
  output_summary?: string | null;
  validation?: Record<string, unknown> | null;
  decision?: { status?: string; by?: string | null; at?: string | null } | null;
  cost?: { duration_ms?: number; ai_calls?: number; credits?: number } | null;
  username?: string;
  created_at?: string;
}

export async function listInterventions(p?: {
  draftId?: string;
  kind?: string;
  limit?: number;
}): Promise<AiIntervention[]> {
  const { data } = await apiClient.get<{ items?: AiIntervention[] }>(
    API.studio.registryInterventions(p),
  );
  return Array.isArray(data?.items) ? data.items : [];
}

export interface AiEnrichment {
  enrichment_id: string;
  application_id?: string | null;
  kind?: string;
  scope_key?: string;
  value?: unknown;
  status?: 'proposed' | 'confirmed' | 'rejected' | string;
  confidence?: number | null;
  version?: number | string;
  source_intervention_id?: string | null;
}

export async function listEnrichments(p?: {
  draftId?: string;
  kind?: string;
  status?: string;
  scopeKey?: string;
}): Promise<AiEnrichment[]> {
  const { data } = await apiClient.get<{ items?: AiEnrichment[] }>(
    API.studio.registryEnrichments(p),
  );
  return Array.isArray(data?.items) ? data.items : [];
}

/** The USER's decision — confirmed enrichments feed later prompts as
 *  KNOWN CONTEXT and land in the business glossary. Never automatic. */
export async function decideEnrichment(
  id: string,
  status: 'confirmed' | 'rejected',
  value?: Record<string, unknown>,
): Promise<void> {
  await studioMutate('POST', API.studio.enrichmentDecision(id), { status, value }, 30_000);
}

/** GET /studio/activation/{draft_id} — activation status, shape defensive
 *  (status/requested_by/decided_by/decided_at when present). */
export async function getActivation(
  draftId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await apiClient.get<Record<string, unknown>>(
      API.studio.activation(draftId),
    );
    return data ?? null;
  } catch {
    return null; // no activation yet is a normal state, not an error
  }
}

/* ── Need-aware source relevance (discovery must justify itself) ───── */

export interface SourceSuggestion {
  fqn: string;
  relevance?: 'high' | 'medium' | 'low' | 'unrelated' | string;
  score?: number;
  reasons?: string[];
  /** true ⇒ safe to preselect for this need — the ONLY preselect signal. */
  preselect?: boolean;
}

export async function suggestSources(body: {
  need: string;
  domain_id?: string | null;
  /** Scopes the scan budget to THIS draft (1 unit per database scanned);
   *  without it the backend falls back to a shared sliding-hour window. */
  draft_id?: string | null;
  /** Explicit table candidates to rank… */
  candidates?: Array<{ fqn: string }>;
  /** …and/or up to 5 databases to NAME-SCAN (bounded INFORMATION_SCHEMA
   *  read, platform schemas excluded, never a data row). */
  databases?: string[];
}): Promise<{ suggestions: SourceSuggestion[]; scanned?: Record<string, unknown> }> {
  const data = await studioMutate<{
    suggestions?: SourceSuggestion[];
    scanned_databases?: Record<string, unknown>;
  }>('POST', API.studio.sourcesSuggest(), body, 60_000);
  return {
    suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
    scanned: data?.scanned_databases,
  };
}

/* ── Consistency + versions (iteration B) ──────────────────────────── */

export interface ConsistencyIssue {
  severity?: 'blocking' | 'warning' | 'info' | string;
  code?: string;
  chart_id?: string;
  message?: string;
  /** The actionable repair the backend guarantees — every issue carrying a
   *  fix carries `available`, so a button is never dead. */
  fix?: {
    kind?: string;
    available?: boolean;
    reason?: string;
    to?: string;
    target_id?: string;
    job_id?: string;
    route?: string;
    instruction?: string;
    next_step?: { kind?: string; route?: string };
  } | null;
  publish_impact?: string;
}

export async function getConsistency(
  draftId: string,
): Promise<{ issues: ConsistencyIssue[] }> {
  try {
    const { data } = await apiClient.get<{ issues?: ConsistencyIssue[] }>(
      API.studio.consistency(draftId),
      { timeout: 60_000 },
    );
    return { issues: Array.isArray(data?.issues) ? data.issues : [] };
  } catch {
    return { issues: [] }; // the report stays useful without the drift check
  }
}

/* ── C-2 — workflows per application (one definition with jobs) ────── */

export interface WorkflowMissing {
  what?: string;
  why?: string;
  how_to_complete?: string;
  decision_id?: string;
  proposal?: Record<string, unknown> | null;
}

export interface WorkflowItem {
  automation_id: string;
  kind?: string;
  name?: string;
  state?: 'proposed' | 'simulated' | 'delivered' | 'stopped' | string;
  /** Execution counters carried on the list item — no extra call needed
   *  to show « ran N times, last on … ». */
  runs_summary?: {
    count?: number;
    by_kind?: Record<string, number>;
    last?: { at?: string; kind?: string; status?: string; delivered?: number } | null;
    detail?: string;
  };
  definition_version?: {
    revision?: number;
    definition_hash?: string;
    last_changed_at?: string;
    last_changed_by?: string;
  };
  phrase?: {
    event?: string;
    condition?: string;
    action?: string;
    destination?: string;
    prerequisites?: string;
    expected_result?: string;
  };
  prerequisites?: {
    data?: { ok?: boolean; missing?: WorkflowMissing[] };
    destination?: { ok?: boolean; missing?: WorkflowMissing[] };
  };
  activable?: { ok?: boolean; reason?: string; decision_ids?: string[] };
  derived_from?: Array<{ type?: string; ref?: string; label?: string; status?: string }>;
  trigger?: { type?: string; cron_choice?: string | null; cron?: string | null; next_run?: string | null; note?: string };
  /** The resolved patch path — for a job-linked item this IS the job's
   *  trigger path: one definition, whichever view edits it. */
  trigger_path?: string;
  job_id?: string;
  steps?: Array<Record<string, unknown>>;
  graph?: { nodes?: unknown[]; edges?: unknown[] };
  edit_paths?: Record<string, unknown>;
  window?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  last_preview?: Record<string, unknown> | null;
  test_runs?: Array<Record<string, unknown>>;
  stopped?: { verification?: { ok?: boolean; checks?: Record<string, unknown> } } | null;
}

export interface WorkflowPreview {
  status?: 'computable' | 'not_computable' | string;
  expected_triggerings?: Array<{ at?: string; key?: string; deduped?: boolean; deduped_reason?: string }>;
  count?: number;
  deduplicated?: number;
  dedup_note?: string;
  window?: Record<string, unknown>;
  missing?: WorkflowMissing[];
  side_effects?: Record<string, boolean>;
  proofs?: Array<Record<string, unknown>>;
  /** When 0 rows land in the window: why, and which window reaches data. */
  history_hint?: {
    open_records?: number;
    overdue_records_all_time?: number;
    min_due?: string;
    max_due?: string;
    window_days_to_reach_min_due?: number;
  };
  window_semantic?: string;
}

export interface WorkflowTestRun {
  run_id?: string;
  status?: string;
  results?: {
    expected_triggerings?: number;
    delivered_new?: number;
    deduplicated?: number;
    deliveries_before?: number;
    deliveries_after?: number;
  };
  evidence?: {
    deliveries_table?: string;
    inbox?: { status?: string; raw_id?: string; to?: string };
    is_test_data?: boolean;
  };
  steps?: unknown[];
  query_ids?: string[];
  proofs?: Array<Record<string, unknown>>;
}

export async function getWorkflows(
  draftId: string,
  propose = false,
): Promise<{ items: WorkflowItem[]; counts?: Record<string, number>; trigger_choices?: string[] }> {
  const { data } = await apiClient.get<{
    items?: WorkflowItem[];
    counts?: Record<string, number>;
    trigger_choices?: string[];
  }>(API.studio.workflows(draftId, propose), { timeout: 180_000 });
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    counts: data?.counts,
    trigger_choices: data?.trigger_choices,
  };
}

export async function getWorkflow(
  draftId: string,
  aid: string,
  verify = false,
): Promise<WorkflowItem | null> {
  const { data } = await apiClient.get<{ item?: WorkflowItem } & WorkflowItem>(
    API.studio.workflow(draftId, aid, verify),
    { timeout: 120_000 },
  );
  return (data?.item ?? data) || null;
}

export async function previewWorkflow(
  draftId: string,
  aid: string,
  body: { window_days?: number; limit?: number } = {},
): Promise<WorkflowPreview> {
  return studioMutate<WorkflowPreview>(
    'POST',
    API.studio.workflowPreview(draftId, aid),
    { window_days: Math.min(body.window_days ?? 365, 365), limit: body.limit ?? 50 },
    180_000,
  );
}

export async function testRunWorkflow(
  draftId: string,
  aid: string,
  body: { window_days?: number; limit?: number } = {},
): Promise<WorkflowTestRun> {
  return studioMutate<WorkflowTestRun>(
    'POST',
    API.studio.workflowTestRun(draftId, aid),
    { window_days: Math.min(body.window_days ?? 365, 365), limit: body.limit ?? 50, notify: true },
    240_000,
  );
}

export async function stopWorkflow(
  draftId: string,
  aid: string,
  reason?: string,
): Promise<WorkflowItem> {
  const data = await studioMutate<{ item?: WorkflowItem } & WorkflowItem>(
    'POST',
    API.studio.workflowStop(draftId, aid),
    { reason },
    120_000,
  );
  return (data?.item ?? data) as WorkflowItem;
}

/** DELETE — the backend answers 409 STOP_FIRST for a live item. */
export async function removeWorkflow(
  draftId: string,
  aid: string,
): Promise<{ status?: string; remaining?: number; post_removal?: Record<string, unknown> }> {
  const { data } = await apiClient.delete<{
    status?: string;
    remaining?: number;
    post_removal?: Record<string, unknown>;
  }>(API.studio.workflowRemove(draftId, aid), { timeout: 120_000 });
  return data ?? {};
}

/* ── Tranche A — target model, jobs, runs, DLQ, quality ────────────── */

export interface TargetColumn {
  name: string;
  type?: string;
  role?: string;
  source?: { fqn?: string; column?: string } | null;
  expression?: string | null;
  nullable?: boolean;
  default?: unknown;
  rule?: { rule_id?: string; kind?: string; behavior?: string } | null;
  rule_ref?: string;
  responsible_job_id?: string;
}

export interface StudioTarget {
  target_id: string;
  name: string;
  kind?: 'fact' | 'dimension' | string;
  target_fqn?: string;
  object_type?: string;
  /** proposed | validated | created | loaded | checked | published | degraded */
  state?: string;
  grain?: string | ModelGrain | null;
  columns?: TargetColumn[];
  mapping?: {
    sources?: string[];
    joins?: unknown[];
    filters?: unknown[];
    dedup?: { key?: string[]; keep?: string };
    load_mode?: string;
    watermark?: { column?: string; strategy?: string };
    dlq?: boolean;
  };
  producer_job_id?: string;
  model_version?: number | string;
  last_run?: string | null;
  is_test_data?: boolean;
}

export interface JobRunCounts {
  rows_read?: number;
  rows_accepted?: number;
  rows_rejected?: number;
  target_count_after?: number;
  dlq_open?: number;
  dlq_resolved?: number;
}

export interface JobRun {
  run_id?: string;
  status?: string;
  scope?: string;
  version?: number | string;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  error?: string | null;
  results?: JobRunCounts[];
  proofs?: Array<{ step?: string; query_id?: string; duration_ms?: number; sql?: string }>;
  query_ids?: string[];
}

export interface StudioJob {
  job_id: string;
  name?: string;
  state?: string;
  mode?: string;
  sql?: string;
  /** generated | expert — expert never pretends to round-trip. */
  sql_mode?: string;
  trigger?: { cron_choice?: string | null; next_run?: string | null; note?: string };
  rules?: Array<{ rule_id?: string; kind?: string; column?: string; behavior?: string; predicate?: string }>;
  on_failure?: string;
  schema_change_policy?: string;
  target_ids?: string[];
  sources?: string[];
  last_run?: string | null;
  runs?: JobRun[];
}

/** A relation projected onto the TARGET model: exact columns on both
 *  sides, cardinality, and an honest state — `unverified` until a check
 *  has actually run, `broken` when a column no longer exists. */
export interface TargetRelationship {
  relationship_id?: string;
  cardinality?: string;
  source_status?: string;
  state?: 'valid' | 'broken' | 'unverified' | string;
  missing_columns?: string[];
  left?: { target_id?: string; name?: string; fqn?: string; columns?: string[] };
  right?: { target_id?: string; name?: string; fqn?: string; columns?: string[] };
  validation?: { scope?: string; check?: string; guarantee?: string; [k: string]: unknown };
}

/* ── one source table's columns, searchable and bounded ───────────── */

/** A source column, with the honest key verdict and whether it already
 *  feeds the target. This is the tool for composing a target FROM a wide
 *  source — not a prettier way to list a narrow one. */
export interface SourceColumn {
  name: string;
  type?: string;
  nullable?: boolean;
  role?: string;
  key?: {
    role?: 'declared_primary' | 'grain_key' | 'candidate_unique_sample' | 'join_key' | 'none' | string;
    composite?: boolean;
    columns?: string[];
    enforced?: boolean;
    scope?: string;
    evidence?: Record<string, unknown>;
  } | null;
  /** Present when the column already lands in the application's target. */
  target?: {
    target_id?: string;
    column?: string;
    type?: string;
    expression?: string | null;
    rule?: { rule_id?: string; kind?: string; behavior?: string } | null;
    responsible_job_id?: string;
  } | null;
}

export interface SourceColumnsPage {
  fqn?: string;
  entity_id?: string;
  found?: boolean;
  total?: number;
  offset?: number;
  limit?: number;
  q?: string | null;
  items: SourceColumn[];
  has_more?: boolean;
}

export async function getTableColumns(
  draftId: string,
  fqn: string,
  opts?: { q?: string; offset?: number; limit?: number },
): Promise<SourceColumnsPage> {
  const p = new URLSearchParams();
  if (opts?.q) p.set('q', opts.q);
  if (opts?.offset != null) p.set('offset', String(opts.offset));
  p.set('limit', String(opts?.limit ?? 25));
  const { data } = await apiClient.get<Partial<SourceColumnsPage>>(
    `/studio/model/${encodeURIComponent(draftId)}/tables/${encodeURIComponent(fqn)}/columns?${p}`,
    { timeout: 60_000 },
  );
  return {
    ...data,
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

/* ── workflow execution history + definition history ──────────────── */

export interface WorkflowRun {
  run_id?: string;
  kind?: 'test' | 'scheduled' | string;
  status?: string;
  version?: string;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  by?: string;
  delivered?: number;
  deduplicated?: number;
  expected_triggerings?: number;
  evidence?: {
    deliveries_table?: string;
    inbox?: { status?: string } | string;
    query_ids?: string[];
    is_test_data?: boolean;
  };
}

export interface WorkflowRunsPage {
  items: WorkflowRun[];
  count?: number;
  by_kind?: Record<string, number>;
  has_more?: boolean;
  retention?: { test_runs_kept?: number; note?: string };
  /** Scheduled runs do not exist before activation — said, not hidden. */
  scheduled?: { available?: boolean; reason?: string };
  application_version?: { active?: string; note?: string };
}

export async function getWorkflowRuns(
  draftId: string,
  automationId: string,
  opts?: { kind?: 'test' | 'scheduled'; limit?: number },
): Promise<WorkflowRunsPage> {
  const p = new URLSearchParams();
  if (opts?.kind) p.set('kind', opts.kind);
  p.set('limit', String(opts?.limit ?? 20));
  const { data } = await apiClient.get<Partial<WorkflowRunsPage>>(
    `/studio/drafts/${encodeURIComponent(draftId)}/workflows/${encodeURIComponent(automationId)}/runs?${p}`,
    { timeout: 60_000 },
  );
  return { ...data, items: Array.isArray(data?.items) ? data.items : [] };
}

export interface WorkflowVersionEvent {
  at?: string;
  by?: string;
  kind?: 'derived' | 'edit' | 'stop' | string;
  summary?: string;
  path?: string;
  field?: string;
  before?: unknown;
  after?: unknown;
}

export interface WorkflowVersions {
  current?: {
    revision?: number;
    definition_hash?: string;
    last_changed_at?: string;
    last_changed_by?: string;
  };
  events: WorkflowVersionEvent[];
  count?: number;
  application_versions?: Record<string, unknown>;
}

export async function getWorkflowVersions(
  draftId: string,
  automationId: string,
): Promise<WorkflowVersions> {
  const { data } = await apiClient.get<Partial<WorkflowVersions>>(
    `/studio/drafts/${encodeURIComponent(draftId)}/workflows/${encodeURIComponent(automationId)}/versions`,
    { timeout: 60_000 },
  );
  return { ...data, events: Array.isArray(data?.events) ? data.events : [] };
}

/** The closed list of visuals, with what each one draws and whether the
 *  CURRENT widget composition satisfies its condition — so the picker
 *  greys a shape with the real reason instead of a hardcoded guess. */
export interface ChartTypeOption {
  chart_type: string;
  draws?: string;
  requires?: string | null;
  requirement_message?: string | null;
  accepts_current_spec?: boolean;
  blocked_reason?: string | null;
}

export async function getChartTypes(spec?: {
  measures?: number;
  dimensions?: number;
  time?: number;
}): Promise<ChartTypeOption[]> {
  const p = new URLSearchParams();
  if (spec?.measures != null) p.set('measures', String(spec.measures));
  if (spec?.dimensions != null) p.set('dimensions', String(spec.dimensions));
  if (spec?.time != null) p.set('time', String(spec.time));
  const { data } = await apiClient.get<{ chart_types?: ChartTypeOption[] }>(
    `/studio/report/chart-types${p.toString() ? `?${p}` : ''}`,
    { timeout: 30_000 },
  );
  return Array.isArray(data?.chart_types) ? data.chart_types : [];
}

/** A guarded SELECT on the sources a target is built from — the rows it
 *  WOULD hold, before anything is created. Nothing is written. */
export interface TargetPreview {
  target_id?: string;
  sql?: string;
  columns?: string[];
  rows?: unknown[][];
  row_count?: number;
  error?: string | null;
}

export async function previewTarget(draftId: string, targetId: string): Promise<TargetPreview> {
  return studioMutate<TargetPreview>(
    'POST',
    API.studio.targetPreview(draftId, targetId),
    {},
    180_000,
  );
}

/** The application's published versions — enrichment history. */
export interface StudioVersion {
  version_id?: string;
  version_number?: number;
  version_name?: string;
  status?: string;
  description?: string | null;
  created_by?: string;
  created_at?: string;
  content_hash?: string;
  changes_summary?: Record<string, unknown>;
}

export async function getVersions(
  draftId: string,
): Promise<{ active?: StudioVersion | null; versions: StudioVersion[] }> {
  const { data } = await apiClient.get<{
    active_version?: StudioVersion;
    versions?: StudioVersion[];
  }>(`/studio/drafts/${encodeURIComponent(draftId)}/versions`, { timeout: 60_000 });
  return {
    active: data?.active_version ?? null,
    versions: Array.isArray(data?.versions) ? data.versions : [],
  };
}

/** A dry ingestion test: EXPLAIN + bounded preview, NOTHING written. */
export interface JobTestResult {
  job_id?: string;
  target_id?: string;
  persisted?: boolean;
  sql_source?: string;
  affected?: { targets?: string[]; rules?: string[] };
  estimate?: {
    state?: string;
    source?: string;
    partitions_total?: number;
    partitions_assigned?: number;
    bytes_assigned?: number;
    note?: string;
  };
  explain?: { ok?: boolean; state?: string; error?: string };
  output_schema?: Array<{ name?: string; type?: string }>;
  error?: string | null;
}

export async function testJob(draftId: string, jobId: string): Promise<JobTestResult> {
  return studioMutate<JobTestResult>(
    'POST',
    `/studio/drafts/${encodeURIComponent(draftId)}/jobs/${encodeURIComponent(jobId)}/test`,
    {},
    180_000,
  );
}

export interface TargetsView {
  target_schema?: {
    database?: string;
    schema?: string;
    environment?: string;
    state?: string;
    note?: string;
  };
  targets: StudioTarget[];
  jobs: StudioJob[];
  states?: Record<string, string>;
  /** Relations between TARGET tables, with the exact join columns. */
  relationships?: TargetRelationship[];
  /** Root edit stamp — send it back as expected_updated_at so a
   *  concurrent edit 409s instead of being silently clobbered. */
  updated_at?: string;
}

export async function getTargetsView(draftId: string): Promise<TargetsView> {
  const { data } = await apiClient.get<Partial<TargetsView>>(API.studio.modelTargets(draftId), {
    timeout: 60_000,
  });
  return {
    target_schema: data?.target_schema,
    targets: Array.isArray(data?.targets) ? data.targets : [],
    jobs: Array.isArray(data?.jobs) ? data.jobs : [],
    states: data?.states,
    relationships: Array.isArray(data?.relationships) ? data.relationships : [],
    updated_at: data?.updated_at,
  };
}

export async function proposeTargets(draftId: string): Promise<TargetsView> {
  const data = await studioMutate<Partial<TargetsView>>(
    'POST',
    API.studio.targetsPropose(draftId),
    {},
    120_000,
  );
  return {
    target_schema: data?.target_schema,
    targets: Array.isArray(data?.targets) ? data.targets : [],
    jobs: Array.isArray(data?.jobs) ? data.jobs : [],
  };
}

export async function proposeJobs(draftId: string): Promise<{ jobs: StudioJob[] }> {
  const data = await studioMutate<{ jobs?: StudioJob[] }>(
    'POST',
    API.studio.jobsPropose(draftId),
    {},
    120_000,
  );
  return { jobs: Array.isArray(data?.jobs) ? data.jobs : [] };
}

/** The REAL sandbox load. The 207/failed case carries error verbatim. */
export async function runJob(draftId: string, jobId: string): Promise<JobRun> {
  const data = await studioMutate<{ run?: JobRun } & JobRun>(
    'POST',
    API.studio.jobRun(draftId, jobId),
    { scope: 'sandbox' },
    240_000,
  );
  return (data?.run ?? data) as JobRun;
}

/** Targeted replay of ONLY the affected records (tranche B contract). */
export async function replayDlq(
  draftId: string,
  jobId: string,
  body: { record_keys?: string[]; rule_id?: string; status?: 'open' },
): Promise<JobRun> {
  const data = await studioMutate<{ run?: JobRun } & JobRun>(
    'POST',
    API.studio.jobReplay(draftId, jobId),
    body,
    240_000,
  );
  return (data?.run ?? data) as JobRun;
}

export interface DlqItem {
  dlq_id?: string;
  target?: string;
  record_key?: string;
  source_ref?: string;
  original?: string;
  rule_id?: string;
  column?: string;
  cause?: string;
  job_id?: string;
  run_id?: string;
  version?: number | string;
  first_seen?: string;
  last_seen?: string;
  attempts?: number;
  status?: string;
}

export async function getDlq(
  draftId: string,
  status: 'open' | 'resolved',
): Promise<DlqItem[]> {
  const { data } = await apiClient.get<{ items?: DlqItem[]; rejects?: DlqItem[] }>(
    API.studio.dlq(draftId, status),
    { timeout: 45_000 },
  );
  return data?.items ?? data?.rejects ?? [];
}

/** Explicit SOURCE-CONTRACT confirmation for an ambiguous date format —
 *  the backend refuses (422) without it; never an AI interpretation. */
export async function confirmDateContract(
  draftId: string,
  body: { target_id: string; column: string; formats: string[] },
): Promise<Record<string, unknown>> {
  return studioMutate(
    'POST',
    API.studio.targetDateContract(draftId),
    { ...body, confirmed_by_source_contract: true },
    60_000,
  );
}

export interface QualityIndicator {
  value?: number | string;
  unit?: string;
  numerator?: number;
  denominator?: number;
  note?: string;
  population?: string;
}

export interface QualityView {
  indicators?: Record<string, QualityIndicator>;
  source?: { objects?: Array<Record<string, unknown>>; method?: string; evaluated_at?: string };
  target?: {
    tables?: Array<{
      target_id?: string;
      target?: string;
      target_fqn?: string;
      state?: string;
      producer_job_id?: string;
      last_run?: string;
      population?: Record<string, number>;
      indicators?: Record<string, QualityIndicator>;
      checks?: Array<Record<string, unknown>>;
      method?: string;
      sample_vs_full?: string;
    }>;
  };
  cross_table?: { checks?: Array<Record<string, unknown>>; note?: string };
  anomalies?: Array<{
    id?: string;
    level?: string;
    object?: string;
    rule?: string;
    verdict?: string;
    count?: number;
    fix?: { kind?: string; job_id?: string; instruction?: string; available?: boolean };
  }>;
  legend?: Record<string, string>;
  evaluated_at?: string;
  refresh?: boolean;
}

export async function getQuality(draftId: string, refresh = false): Promise<QualityView> {
  const { data } = await apiClient.get<QualityView>(API.studio.quality(draftId, refresh), {
    timeout: refresh ? 180_000 : 60_000,
  });
  return data ?? {};
}

/* ── Data & jobs — the read-only truth of one application (iteration C) ── */

export interface StudioDataSource {
  fqn: string;
  entity_id?: string;
  name?: string;
  connector_id?: string;
  connector_status?: string;
  in_model?: boolean;
  availability?: string;
  row_count_approx?: number | null;
  freshness?: {
    last_altered?: string | null;
    days_since?: number | null;
    watermark_field?: string | null;
  };
  processing?: {
    ingestion_type?: string | null;
    cadence?: string | null;
    last_run?: string | null;
    pipeline_name?: string | null;
    status?: string | null;
  };
  quality?: { checks?: number; verdicts?: unknown[] };
  state?: 'configured' | 'running' | 'loaded' | 'verified' | string;
  state_reason?: string;
  event_contract?: {
    strategy?: string;
    watermark?: string | null;
    dedup_key?: string[];
    source_time?: string | null;
    status?: string;
    schema_evolution?: string;
    late_data_policy?: string;
  };
}

export interface StudioDataView {
  sources: StudioDataSource[];
  destinations: unknown[];
  jobs: Array<Record<string, unknown>>;
  existing_pipelines: Array<{
    fqn?: string;
    pipeline?: string | null;
    type?: string | null;
    cadence?: string | null;
    last_run?: string | null;
  }>;
  recommendation?: { ingestion_needed?: boolean; note?: string };
  perimeter?: {
    mode?: string;
    sample_rows?: number;
    profile_rows?: number;
    objects_per_draft?: number;
    activation_status?: string;
    note?: string;
  };
  states_legend?: Record<string, string>;
  checked_at?: string;
}

/** The « données & jobs » contract: what each source IS (state + reason),
 *  what runs on it, and what does NOT exist — recommendation says plainly
 *  when no job is created rather than inventing one to look complete. */
export async function getDraftData(draftId: string): Promise<StudioDataView> {
  // First read on a fresh application computes the contract cold (profiles
  // every source) — observed >60 s on 200M-row tables, warm reads ~1 s.
  const { data } = await apiClient.get<Partial<StudioDataView>>(
    API.studio.draftData(draftId, true),
    { timeout: 120_000 },
  );
  return {
    sources: Array.isArray(data?.sources) ? data.sources : [],
    destinations: Array.isArray(data?.destinations) ? data.destinations : [],
    jobs: Array.isArray(data?.jobs) ? data.jobs : [],
    existing_pipelines: Array.isArray(data?.existing_pipelines) ? data.existing_pipelines : [],
    recommendation: data?.recommendation,
    perimeter: data?.perimeter,
    states_legend: data?.states_legend,
    checked_at: data?.checked_at,
  };
}

export interface ActiveVersion {
  version_id?: string;
  version_number?: number;
  published_at?: string;
  content_hash?: string;
}

/** Snapshot the application contract as the ACTIVE version. Throws with
 *  response.data.detail.consistency on 409 PUBLISH_BLOCKED. */
export async function publishDraft(
  draftId: string,
  note?: string,
): Promise<{ status?: string; active_version?: ActiveVersion; consistency?: unknown }> {
  return studioMutate('POST', API.studio.publish(draftId), { note }, 60_000);
}

/* ── DQ gate + AI-proposed automations (workspace) ─────────────────── */

export interface DqCheck {
  id: string;
  rule?: string;
  rule_ref?: string;
  scope?: {
    entity_id?: string;
    fqn?: string;
    column?: string;
    columns?: string[];
    sample_rows?: number;
  };
  verdict?: 'pass' | 'fail' | 'warn' | string;
  evidence?: Record<string, unknown>;
  blocking?: boolean;
  message?: string;
}

export interface DqGateResult {
  run_id?: string;
  overall?: string;
  /** Object on the live backend: {full_ingestion_allowed, note}. */
  gate?: string | { full_ingestion_allowed?: boolean; note?: string };
  checks?: DqCheck[];
  blockers?: unknown[];
  counts?: Record<string, number>;
  duration_ms?: number;
  [k: string]: unknown;
}

export async function runDqGate(draftId: string): Promise<DqGateResult> {
  return studioMutate<DqGateResult>('POST', API.studio.dqGate(), { draft_id: draftId }, 120_000);
}

/** AI-proposed automations — throws with error_code REPORT_REQUIRED until
 *  the application's report exists. Proposals only: nothing is launched. */
export async function proposeAutomations(
  draftId: string,
  need?: string,
): Promise<Record<string, unknown>> {
  return studioMutate<Record<string, unknown>>(
    'POST',
    API.studio.automationPropose(),
    { draft_id: draftId, need },
    60_000,
  );
}

/* ── Preview usage (the studio's cost meter) ───────────────────────── */

export interface PreviewUsage {
  policy_id?: string;
  ai_calls_per_hour?: { used?: number; limit?: number };
  ai_calls_per_draft?: { used?: number; limit?: number };
  objects_per_draft?: { used?: number; limit?: number };
  credits_charged?: number;
}

export async function getPreviewUsage(): Promise<PreviewUsage> {
  return dedupGet('studio:v1:preview-usage', 30_000, async () => {
    const { data } = await apiClient.get<PreviewUsage>(API.studio.previewUsage());
    return data ?? {};
  });
}

/* ── Preview policy (free envelope) ────────────────────────────────── */

export interface PreviewPolicy {
  policy_id?: string;
  version?: string;
  limits?: Record<string, number>;
  eligible_ops?: string[];
}

export async function getPreviewPolicy(): Promise<PreviewPolicy> {
  return dedupGet('studio:v1:preview-policy', 300_000, async () => {
    const { data } = await apiClient.get<PreviewPolicy>('/studio/preview-policy');
    return data ?? {};
  });
}
