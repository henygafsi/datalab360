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
// ////dependency//// services.command-center → lib.api-client (apiClient)
import apiClient from '@/lib/api-client';

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
interface KpiDimensionResponse {
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

/** Payload (subset) from `GET /command-center/recommendations`. */
interface RecommendationsResponse {
  total_open: number;
  total_critical: number;
  counts: Record<string, RecoDimensionCounts>;
}

// ── Public card model ───────────────────────────────────────────────────────

/** The four live dimensions backed by `kpis/{dimension}`. */
export type KpiDimension = 'dq' | 'cost' | 'perf' | 'gov';

/** Every dimension a score card can represent (incl. the forecast placeholder). */
export type ScoreCardDimension = KpiDimension | 'prevision';

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
  status: ScoreCardStatus;
  /** Open recommendations for this dimension. */
  openRecos: number;
  /** Critical (critical+high) recommendations for this dimension. */
  criticalRecos: number;
  /** Optional note shown under not-computed cards (e.g. "coming soon"). */
  note?: string;
  /**
   * Scope of the value. Undefined for the account-wide `getScoreCards` path
   * (everything is account-level by definition there — no label needed). Set to
   * 'project' | 'account' by `getProjectScoreCards`, so the UI can mark which
   * dimensions are honestly per-project vs an account-level fallback.
   */
  scope?: ScoreCardScope;
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

// ── Fetchers ────────────────────────────────────────────────────────────────

async function fetchKpiDimension(
  dimension: KpiDimension,
  days?: number,
): Promise<KpiDimensionResponse | null> {
  try {
    const { data } = await apiClient.get<KpiDimensionResponse>(
      `${PREFIX}/kpis/${dimension}`,
      { params: days != null ? { days } : undefined },
    );
    return data;
  } catch {
    // Degrade per-dimension: a failing axis becomes an `error` card, not a
    // thrown promise that blanks the whole row.
    return null;
  }
}

async function fetchRecommendations(
  days?: number,
): Promise<RecommendationsResponse | null> {
  try {
    const { data } = await apiClient.get<RecommendationsResponse>(
      `${PREFIX}/recommendations`,
      { params: days != null ? { days } : undefined },
    );
    return data;
  } catch {
    return null;
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
    status,
    openRecos: counts?.open ?? 0,
    criticalRecos: counts?.critical ?? 0,
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
  const [dq, cost, perf, gov, recos] = await Promise.all([
    fetchKpiDimension('dq', days),
    fetchKpiDimension('cost', days),
    fetchKpiDimension('perf', days),
    fetchKpiDimension('gov', days),
    fetchRecommendations(days),
  ]);

  // If every backend call failed (network/auth down), reject so the UI can show
  // an error + retry rather than five hollow "—" cards. Partial failures still
  // degrade gracefully into per-card `status: 'error'`.
  if (dq === null && cost === null && perf === null && gov === null && recos === null) {
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
  const { data } = await apiClient.get<ProjectScoresResponse>(
    `${PREFIX}/projects/${encodeURIComponent(projectId)}/scores`,
    { params: days != null ? { days } : undefined },
  );

  const dims = data?.dimensions ?? ({} as Record<KpiDimension, ProjectScoreDimension>);
  return LIVE_DIMENSIONS.map((d) => buildProjectCard(d, dims[d]));
}
