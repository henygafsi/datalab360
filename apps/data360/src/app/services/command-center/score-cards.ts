/**
 * Command Center — Score Cards service (Data360 goal G6).
 *
 * Composes a compact, reusable per-dimension scorecard for the five Data360
 * health axes: DQ · COST · PERF · GOV · PREVISION (forecast placeholder).
 *
 * Each real card pairs ONE headline KPI (pulled from
 * `GET /command-center/kpis/{dimension}`) with that dimension's open/critical
 * recommendation tally (from `GET /command-center/recommendations`). The four
 * KPI fetches + the recommendations fetch run in parallel via `Promise.all`
 * (async-parallel) — one round-trip latency, not five.
 *
 * The 5th PREVISION card is a deliberate placeholder: the Snowflake-ML forecast
 * endpoint doesn't exist yet, so it renders as `status: 'not_computed'` with a
 * `note` — never a fake zero.
 *
 * Backend prefix is `/command-center` (no `/api` — axios baseURL adds none),
 * matching command-center/index.ts and command-center/recommendations.ts.
 */
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

const PREFIX = '/command-center';

// ── Backend payload shapes (subset we read) ─────────────────────────────────

/** A single KPI scorecard entry from `GET /command-center/kpis/{dimension}`. */
interface KpiEntry {
  key: string;
  label: string;
  value: number | string | null;
  unit: string;
  group: string;
  /** Backend emits 'ok' (real value) | 'error' (query failed / value null). */
  status: string;
}

/** Payload from `GET /command-center/kpis/{dimension}`. */
export interface KpiDimensionResponse {
  dimension: string;
  days: number;
  kpis: KpiEntry[];
  table?: { columns: string[]; rows: Array<Record<string, unknown>> };
  sources?: string[];
  row_count?: number;
}

/** Per-dimension open/critical tallies from `/recommendations`. */
interface RecoDimensionCounts {
  open: number;
  critical: number;
}

/** A call-to-action attached to a recommendation by the backend. */
export interface RecommendationCta {
  label: string;
  /** 'navigate' → go to `target` (a route); other verbs run a backend action. */
  action: string;
  /** Route to redirect to (e.g. `/governance/policies`) when action='navigate'. */
  target?: string | null;
}

/** One actionable recommendation from `GET /command-center/recommendations`. */
export interface Recommendation {
  id: string;
  dimension: string;
  severity: string; // 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string;
  detail?: string | null;
  value?: number | string | null;
  cta?: RecommendationCta | null;
}

/** Payload (subset) from `GET /command-center/recommendations`. */
interface RecommendationsResponse {
  total_open: number;
  total_critical: number;
  counts: Record<string, RecoDimensionCounts>;
  recommendations?: Recommendation[];
}

// ── Public card model ───────────────────────────────────────────────────────

/** The four live dimensions backed by `kpis/{dimension}`. */
export type KpiDimension = 'dq' | 'cost' | 'perf' | 'gov';

/** Every dimension a score card can represent (incl. the forecast placeholder
 * and the per-project STORAGE dimension surfaced by the rollup). */
export type ScoreCardDimension = KpiDimension | 'prevision' | 'storage';

/**
 * Card status:
 *   ok            — headline KPI returned a real value
 *   error         — backend query failed for the headline KPI (value null)
 *   not_computed  — no value is computed yet (PREVISION placeholder)
 */
export type ScoreCardStatus = 'ok' | 'error' | 'not_computed';

/**
 * Whether a card's value is scoped to a single project or falls back to
 * account-level. Account-scoped cards in a project context must be labelled
 * honestly so the user is never shown account data as if it were per-project.
 */
export type ScoreCardScope = 'project' | 'account';

/** One compact scorecard, ready to render. */
export interface ScoreCard {
  dimension: ScoreCardDimension;
  /** Short display label (e.g. "Data Quality", "Forecast"). */
  label: string;
  /** Headline value, or null when not computed / failed. */
  value: number | string | null;
  /** Unit suffix for the headline value (e.g. "%", "credits", "ms"). */
  unit: string;
  /**
   * The headline metric's OWN name (e.g. "MFA adoption", "DMF coverage",
   * "Failure rate", "Total credits"). The value shown is this specific metric,
   * NOT a composite dimension score — so a compact rail chip must label it by
   * the metric ("MFA 0%") and never by the dimension code ("GOV 0%"), which
   * would read as "governance is 0%". Undefined when no headline was computed.
   */
  metricLabel?: string;
  status: ScoreCardStatus;
  /** Open recommendations for this dimension. */
  openRecos: number;
  /** Critical (critical+high) recommendations for this dimension. */
  criticalRecos: number;
  /** The actual recommendation items for this dimension (with CTAs), so the
   * card can drill down into actionable fixes — not just a count. */
  recos?: Recommendation[];
  /** Optional note shown under not-computed cards (e.g. "coming soon"). */
  note?: string;
  /**
   * Scope of the value. Undefined for the account-wide `getScoreCards` path
   * (everything is account-level by definition there — no label needed). Set to
   * 'project' | 'account' by `getProjectScoreCards`, so the UI can mark which
   * dimensions are honestly per-project vs an account-level fallback.
   */
  scope?: ScoreCardScope;
  /**
   * Raw backend supporting metrics for this dimension — e.g. gov →
   * `{ contributors, active_rls_policies }`, perf → `{ total_runs }`,
   * storage → `{ storage_mb }`. Populated by the per-project rollup builder
   * (the account-wide KPI path has no supporting object on its KpiEntry
   * source, so it stays undefined there). Optional + additive: existing
   * consumers ignore it.
   */
  supporting?: Record<string, unknown>;
}

// ── Dimension config ────────────────────────────────────────────────────────

/**
 * Human label per dimension. Kept here (not in the component) so any consumer
 * of `getScoreCards` gets consistent labels.
 */
const DIMENSION_LABEL: Record<ScoreCardDimension, string> = {
  dq: 'Data Quality',
  cost: 'Cost',
  perf: 'Performance',
  gov: 'Governance',
  storage: 'Storage',
  prevision: 'Forecast',
};

/**
 * Headline-KPI priority per dimension. We pick the FIRST key in this list that
 * is present in the returned `kpis[]` — never a hardcoded index — because a
 * dimension can list several KPIs (dq→coverage_pct/fresh_pct,
 * perf→fail_rate/p95_exec_ms) and a degraded source may omit some.
 */
const HEADLINE_KEYS: Record<KpiDimension, string[]> = {
  dq: ['coverage_pct', 'fresh_pct'],
  cost: ['total_credits'],
  perf: ['fail_rate', 'p95_exec_ms'],
  gov: ['mfa_pct'],
};

/** The four live dimensions, in display order. */
const LIVE_DIMENSIONS: KpiDimension[] = ['dq', 'cost', 'perf', 'gov'];

// ── Availability ──────────────────────────────────────────────────────────
//
// A 404/501 means the score-cards route isn't provisioned on this backend yet
// — the feature is *unavailable*, not broken. The UI renders a quiet muted
// state for this, never an error banner with a Retry that can never succeed.
// Any other failure (5xx / network) stays a genuine, retryable error.

export class ScoreCardsUnavailableError extends Error {
  constructor() {
    super('Score cards not available');
    this.name = 'ScoreCardsUnavailableError';
  }
}

function isUnavailable(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 501;
}

// ── Fetchers ────────────────────────────────────────────────────────────────
//
// Fetchers throw on failure; `getScoreCards` collects results with
// `Promise.allSettled` so a single failing axis degrades to an `error` card
// (not a thrown promise that blanks the row), while still letting the caller
// inspect *why* every axis failed (unavailable vs error).

async function fetchKpiDimension(
  dimension: KpiDimension,
  days?: number,
): Promise<KpiDimensionResponse> {
  const { data } = await apiClient.get<KpiDimensionResponse>(
    `${PREFIX}/kpis/${dimension}`,
    { params: days != null ? { days } : undefined },
  );
  return data;
}

async function fetchRecommendations(
  days?: number,
): Promise<RecommendationsResponse> {
  const { data } = await apiClient.get<RecommendationsResponse>(
    `${PREFIX}/recommendations`,
    { params: days != null ? { days } : undefined },
  );
  return data;
}

/**
 * Full auditable payload for ONE dimension (`GET /command-center/kpis/{dim}`):
 * every KPI entry + the evidence table + sources. Used by the Account
 * Overview's Data Quality tab (the score-card path above only keeps the
 * headline). 404/501 → ScoreCardsUnavailableError so the tab can render a
 * quiet "not provisioned" state instead of a dead Retry.
 */
export async function getKpiDimensionDetail(
  dimension: KpiDimension,
  days?: number,
): Promise<KpiDimensionResponse> {
  try {
    return await fetchKpiDimension(dimension, days);
  } catch (err) {
    if (isUnavailable(err)) throw new ScoreCardsUnavailableError();
    throw err;
  }
}

// ── Card builders ───────────────────────────────────────────────────────────

/** Pick the first present headline KPI for a dimension. */
function pickHeadline(
  dimension: KpiDimension,
  payload: KpiDimensionResponse | null,
): KpiEntry | null {
  const kpis = payload?.kpis ?? [];
  for (const key of HEADLINE_KEYS[dimension]) {
    const match = kpis.find((k) => k.key === key);
    if (match) return match;
  }
  return null;
}

function buildLiveCard(
  dimension: KpiDimension,
  payload: KpiDimensionResponse | null,
  recos: RecommendationsResponse | null,
): ScoreCard {
  const headline = pickHeadline(dimension, payload);
  const counts = recos?.counts?.[dimension];

  const hasValue = headline != null && headline.value != null;
  const status: ScoreCardStatus = hasValue ? 'ok' : 'error';

  return {
    dimension,
    label: DIMENSION_LABEL[dimension],
    value: hasValue ? headline.value : null,
    unit: headline?.unit ?? '',
    metricLabel: headline?.label ?? undefined,
    status,
    openRecos: counts?.open ?? 0,
    criticalRecos: counts?.critical ?? 0,
    recos: (recos?.recommendations ?? []).filter((r) => r.dimension === dimension),
  };
}

/** The forecast placeholder — no backend endpoint exists yet. */
function buildPrevisionCard(): ScoreCard {
  return {
    dimension: 'prevision',
    label: DIMENSION_LABEL.prevision,
    value: null,
    unit: '',
    status: 'not_computed',
    openRecos: 0,
    criticalRecos: 0,
    note: 'coming soon',
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch the four live KPI dimensions + recommendations in parallel and compose
 * the five score cards (DQ · COST · PERF · GOV · PREVISION).
 *
 * @param days Optional ACCOUNT_USAGE window (defaults to backend default, 30).
 */
export async function getScoreCards(days?: number): Promise<ScoreCard[]> {
  // async-parallel: 4 KPI fetches + 1 recommendations fetch, single latency.
  const settled = await Promise.allSettled([
    fetchKpiDimension('dq', days),
    fetchKpiDimension('cost', days),
    fetchKpiDimension('perf', days),
    fetchKpiDimension('gov', days),
    fetchRecommendations(days),
  ]);
  const valueOf = <T,>(r: PromiseSettledResult<T>): T | null =>
    r.status === 'fulfilled' ? r.value : null;
  const dq = valueOf(settled[0]);
  const cost = valueOf(settled[1]);
  const perf = valueOf(settled[2]);
  const gov = valueOf(settled[3]);
  const recos = valueOf(settled[4]);

  // If every backend call failed, decide between two honest UIs:
  //   · all 404/501 → the route isn't provisioned: throw the *unavailable*
  //     signal so the UI shows a quiet muted state (no pointless Retry).
  //   · otherwise (5xx / network / auth) → a genuine error + retry.
  // Partial failures still degrade gracefully into per-card `status: 'error'`.
  if (dq === null && cost === null && perf === null && gov === null && recos === null) {
    if (settled.every((r) => r.status === 'rejected' && isUnavailable(r.reason))) {
      throw new ScoreCardsUnavailableError();
    }
    throw new Error('Failed to load score cards.');
  }

  const byDimension: Record<KpiDimension, KpiDimensionResponse | null> = {
    dq,
    cost,
    perf,
    gov,
  };

  const liveCards = LIVE_DIMENSIONS.map((d) =>
    buildLiveCard(d, byDimension[d], recos),
  );

  return [...liveCards, buildPrevisionCard()];
}

// ── Per-project scores ──────────────────────────────────────────────────────
//
// `getScoreCards` above is ACCOUNT-wide. The per-project variant calls the
// dedicated `GET /command-center/projects/{id}/scores` endpoint, which returns
// each dimension already scorecard-shaped + flagged `scope` ("project" vs
// "account"). Only PERF (PROJECT_RUNS) and GOV (contributors + RLS bindings)
// — and DQ when the project's deployed objects are DMF-monitored — are real
// per-project; COST (and an un-monitored DQ) come back scope:"account" with a
// null value and a `note`, NEVER a fabricated number.

/** One backend dimension entry from `/projects/{id}/scores`. */
interface ProjectScoreDimension {
  dimension: KpiDimension;
  label: string;
  value: number | string | null;
  unit: string;
  scope: ScoreCardScope;
  /** 'ok' (real value) | 'not_computed' (account-fallback, null) | 'error'. */
  status: string;
  note?: string | null;
  supporting?: Record<string, unknown>;
  source?: string | null;
}

/** Payload from `GET /command-center/projects/{id}/scores`. */
interface ProjectScoresResponse {
  project_id: string;
  days: number;
  dimensions: Record<KpiDimension, ProjectScoreDimension>;
  scopes: Record<KpiDimension, ScoreCardScope>;
}

function buildProjectCard(
  dimension: KpiDimension,
  entry: ProjectScoreDimension | undefined,
): ScoreCard {
  // Backend status maps straight to the card status; a missing entry is an error.
  const backendStatus = entry?.status;
  const status: ScoreCardStatus =
    backendStatus === 'ok'
      ? 'ok'
      : backendStatus === 'not_computed'
        ? 'not_computed'
        : 'error';

  return {
    dimension,
    label: DIMENSION_LABEL[dimension],
    value: entry?.value ?? null,
    unit: entry?.unit ?? '',
    status,
    // Per-project scores have no /recommendations equivalent — zero the badges
    // rather than borrow account-level recos (which would be misleading).
    openRecos: 0,
    criticalRecos: 0,
    note: entry?.note ?? undefined,
    scope: entry?.scope ?? 'account',
  };
}

/**
 * Fetch the four DQ/COST/PERF/GOV scores for ONE project. Each card carries a
 * `scope` flag so the UI can honestly mark account-level fallbacks. PREVISION
 * is not included (it has no per-project source).
 *
 * @param projectId The project to scope to.
 * @param days      Optional lookback window (defaults to backend default, 30).
 */
export async function getProjectScoreCards(
  projectId: string,
  days?: number,
): Promise<ScoreCard[]> {
  let data: ProjectScoresResponse;
  try {
    ({ data } = await apiClient.get<ProjectScoresResponse>(
      API.commandCenter.projectScores(projectId, days),
    ));
  } catch (err) {
    // Route not provisioned → unavailable (quiet), not a retryable error.
    if (isUnavailable(err)) throw new ScoreCardsUnavailableError();
    throw err;
  }

  const dims = data?.dimensions ?? ({} as Record<KpiDimension, ProjectScoreDimension>);
  return LIVE_DIMENSIONS.map((d) => buildProjectCard(d, dims[d]));
}

// ── Per-project ROLLUP (G7) ──────────────────────────────────────────────────
//
// `GET /command-center/projects/{id}/rollup` serves the precomputed rollup
// (DQ·PERF·GOV·STORAGE + per-project COST + reco counts + last deploy/event) from
// the batch-materialised PROJECT_ROLLUP table — one cheap read instead of the
// scores fan-out. On a cold miss the backend falls back to a live compute and
// flags `served_from: "live"`. Unlike `getProjectScoreCards` (which zeroes recos),
// the rollup carries real per-project reco counts, split back onto the cards here
// with the SAME thresholds the backend used (`recos` total stays authoritative).

/** Dimension order shown for the rollup (storage + cost included). */
const ROLLUP_DIMENSIONS: ScoreCardDimension[] = ['dq', 'perf', 'gov', 'storage', 'cost'];

/** Backend rollup payload (subset we read). Dimensions share the shape of
 * `/projects/{id}/scores` so the same card builder logic applies. */
interface ProjectRollupResponse {
  project_id: string;
  days: number;
  dimensions: Record<string, ProjectScoreDimension | undefined>;
  scopes: Record<string, ScoreCardScope>;
  recos: { open: number; critical: number };
  last_deploy_at: string | null;
  last_deploy_status: string | null;
  last_event_at: string | null;
  event_count_30d: number;
  computed_at: string | null;
  /** 'rollup' (warm table hit) | 'live' (cold-miss fallback). */
  served_from: string;
}

/** The composed rollup model the UI consumes. */
export interface ProjectRollup {
  /** Cards for dq · perf · gov · storage · cost, each with per-dimension recos. */
  cards: ScoreCard[];
  /** Authoritative project-level reco totals (use for the compact "N recos" strip). */
  recos: { open: number; critical: number };
  lastDeployAt: string | null;
  lastDeployStatus: string | null;
  lastEventAt: string | null;
  eventCount30d: number;
  /** 'rollup' = served from the precomputed table; 'live' = cold-miss fallback. */
  servedFrom: string;
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Per-dimension reco split — a faithful mirror of the backend
 * `_derive_per_project_recos` thresholds, so each card shows its own contribution.
 * The project-level `recos` total from the payload stays the source of truth for
 * the strip; this split is purely for per-card display.
 */
function derivePerDimensionRecos(
  dimension: ScoreCardDimension,
  entry: ProjectScoreDimension | undefined,
): { open: number; critical: number } {
  let open = 0;
  let critical = 0;
  const sup = (entry?.supporting ?? {}) as Record<string, unknown>;
  if (dimension === 'perf') {
    const v = asNum(entry?.value);
    if (v != null) {
      if (v > 25) critical += 1;
      else if (v > 5) open += 1;
    }
  } else if (dimension === 'gov') {
    if (sup.contributors === 0) critical += 1;
    if (sup.active_rls_policies === 0) open += 1;
  } else if (dimension === 'dq') {
    const deployed = asNum(sup.deployed_objects) ?? 0;
    if (sup.monitored_objects === 0 && deployed > 0) open += 1;
  } else if (dimension === 'storage') {
    const mb = asNum(sup.storage_mb) ?? asNum(entry?.value);
    if (mb != null && mb > 500) open += 1;
  }
  return { open, critical };
}

function buildRollupCard(
  dimension: ScoreCardDimension,
  entry: ProjectScoreDimension | undefined,
): ScoreCard {
  const backendStatus = entry?.status;
  const status: ScoreCardStatus =
    backendStatus === 'ok'
      ? 'ok'
      : backendStatus === 'not_computed'
        ? 'not_computed'
        : 'error';
  const { open, critical } = derivePerDimensionRecos(dimension, entry);
  return {
    dimension,
    label: DIMENSION_LABEL[dimension] ?? String(dimension),
    value: entry?.value ?? null,
    unit: entry?.unit ?? '',
    status,
    openRecos: open,
    criticalRecos: critical,
    note: entry?.note ?? undefined,
    scope: entry?.scope ?? 'account',
    // Pass the raw per-dimension supporting metrics through so a consumer (e.g.
    // ProjectKpiStrip) can surface gov contributor/RLS counts and perf
    // total_runs — values the backend parks here, never on `value`.
    supporting: entry?.supporting,
  };
}

/**
 * Fetch the precomputed per-project rollup. ONE cheap call replacing the
 * per-project scores fan-out, and — unlike `getProjectScoreCards` — surfacing the
 * real per-project reco counts.
 *
 * @param projectId The project to scope to.
 * @param days      Optional lookback window (defaults to backend default, 30).
 */
export async function getProjectRollup(
  projectId: string,
  days?: number,
): Promise<ProjectRollup> {
  let data: ProjectRollupResponse;
  try {
    ({ data } = await apiClient.get<ProjectRollupResponse>(
      API.commandCenter.projectRollup(projectId, days),
    ));
  } catch (err) {
    // Route not provisioned (404/501) → unavailable (quiet), not a retryable error.
    if (isUnavailable(err)) throw new ScoreCardsUnavailableError();
    throw err;
  }

  const dims = data?.dimensions ?? {};
  return {
    cards: ROLLUP_DIMENSIONS.map((d) => buildRollupCard(d, dims[d])),
    recos: { open: data?.recos?.open ?? 0, critical: data?.recos?.critical ?? 0 },
    lastDeployAt: data?.last_deploy_at ?? null,
    lastDeployStatus: data?.last_deploy_status ?? null,
    lastEventAt: data?.last_event_at ?? null,
    eventCount30d: data?.event_count_30d ?? 0,
    servedFrom: data?.served_from ?? 'live',
  };
}
