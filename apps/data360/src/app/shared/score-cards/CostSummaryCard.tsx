'use client';

/**
 * CostSummaryCard — ONE shared cost-summary card (Data360 T2 §4a).
 *
 * Kills the rendering duplication across three surfaces that each hand-rolled
 * the same FinOps read:
 *   - workflow/WorkflowProjectBar     (CostTab — WorkflowCostSummary shape)
 *   - data-products/Object360Panel    (CostTab — FinOps-from-usage shape)
 *   - observability/budget            (warehouse credits overview)
 *
 * It accepts the UNION of those payloads via `data` and normalizes them into one
 * canonical model, then renders small metric cards with the ONE honesty rule
 * that must never be violated:
 *
 *   ATTRIBUTED-vs-ACCOUNT-TOTAL IS LOAD-BEARING.
 *   The headline is *attributed* credits — this project's own queries, carried
 *   with a "project" scope tag. The account/window *total* (which may include
 *   shared warehouse time not exclusive to this project) is shown SEPARATELY and
 *   labelled as such. We NEVER show the account total as the project's spend.
 *
 * Honesty rules (no fake data):
 *   - a missing number renders as "—" (via shared `dash`), NEVER a fabricated 0
 *   - the USD figure is flagged as an estimate unless the source says otherwise
 *   - on the self-fetch path a 404/501 (route not deployed) hides the card
 *     entirely rather than showing a permanent broken state
 *
 * Sourcing — two mutually-exclusive props (precedence: data → projectId):
 *   <CostSummaryCard data={cost} />          // pre-fetched (kills dup today)
 *   <CostSummaryCard projectId={id} />       // self-fetch workflow cost-summary
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dash, isBlank } from '@/app/shared/ui/format';
import { isUnavailable } from '@/lib/http-status';
import { getApiErrorMessage } from '@/lib/api-client';
import { getWorkflowCostSummary } from '@/app/services/api/workflowApi';

// ── Union input shape (superset of every consumer's cost payload) ─────────────

export interface CostSummaryData {
  // Workflow / project cost-summary (attributed vs total)
  attributed_credits?: number | null;
  total_credits?: number | null;
  credits?: number | null;
  estimated_cost_usd?: number | null;
  estimate?: boolean;
  task_runs?: number | null;
  success_rate?: number | null;
  lookback_days?: number | null;
  warnings?: string[] | null;

  // Aliases used by the FinOps-from-usage payload
  credits_attributed?: number | null;
  credits_total?: number | null;

  // FinOps-from-usage (object-scoped, derived from query usage)
  credits_cloud_services?: number | null;
  elapsed_ms_total?: number | null;
  bytes_scanned_total?: number | null;
  queries_last_30d?: number | null;
}

export interface CostSummaryCardProps {
  /** Pre-fetched cost payload (union shape). Highest precedence. */
  data?: CostSummaryData | null;
  /** Project / workflow id — self-fetches the per-project cost summary. */
  projectId?: string | null;
  /** Card heading (default "Cost summary"). */
  title?: string;
  /** Tighter padding for dense right-rail contexts. */
  compact?: boolean;
  className?: string;
}

// ── Formatting (FinOps-specific; blank-safe via isBlank) ─────────────────────

function fmtCredits(v: number | null | undefined): string {
  if (isBlank(v) || !Number.isFinite(v as number)) return '—';
  const n = v as number;
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function fmtUsd(v: number | null | undefined): string {
  if (isBlank(v) || !Number.isFinite(v as number)) return '—';
  return `$${(v as number).toFixed(2)}`;
}

function fmtPct(v: number | null | undefined): string {
  if (isBlank(v) || !Number.isFinite(v as number)) return '—';
  // Source emits 0–1 or 0–100 depending on origin; normalise to a percentage.
  const n = v as number;
  const pct = n <= 1 ? n * 100 : n;
  return `${Math.round(pct)}%`;
}

function fmtMs(v: number | null | undefined): string {
  if (isBlank(v) || !Number.isFinite(v as number)) return '—';
  const ms = v as number;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtBytes(v: number | null | undefined): string {
  if (isBlank(v) || !Number.isFinite(v as number)) return '—';
  let bytes = v as number;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (Math.abs(bytes) >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i += 1;
  }
  return `${bytes.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtCount(v: number | null | undefined): string {
  if (isBlank(v) || !Number.isFinite(v as number)) return '—';
  return new Intl.NumberFormat('en-US').format(v as number);
}

// ── Normalization ────────────────────────────────────────────────────────────

interface NormalizedCost {
  attributed: number | null;
  total: number | null;
  estUsd: number | null;
  isEstimate: boolean;
  runs: number | null;
  successRate: number | null;
  lookbackDays: number | null;
  cloudServices: number | null;
  elapsedMs: number | null;
  bytesScanned: number | null;
  queries30d: number | null;
  warnings: string[];
}

function pick(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) if (!isBlank(v)) return v as number;
  return null;
}

function normalize(d: CostSummaryData): NormalizedCost {
  return {
    // Attributed = THIS project's queries. `credits` is the headline fallback
    // (WorkflowCostSummary sets it to attributed). Never fall back to total.
    attributed: pick(d.attributed_credits, d.credits_attributed, d.credits),
    total: pick(d.total_credits, d.credits_total),
    estUsd: pick(d.estimated_cost_usd),
    isEstimate: d.estimate !== false,
    runs: pick(d.task_runs),
    successRate: pick(d.success_rate),
    lookbackDays: pick(d.lookback_days),
    cloudServices: pick(d.credits_cloud_services),
    elapsedMs: pick(d.elapsed_ms_total),
    bytesScanned: pick(d.bytes_scanned_total),
    queries30d: pick(d.queries_last_30d),
    warnings: Array.isArray(d.warnings) ? d.warnings : [],
  };
}

function isEmptyCost(c: NormalizedCost): boolean {
  return (
    c.attributed == null &&
    c.total == null &&
    c.estUsd == null &&
    c.cloudServices == null &&
    c.elapsedMs == null &&
    c.bytesScanned == null &&
    c.queries30d == null
  );
}

// ── Presentation ─────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-700">
      <p className={cn('text-base font-semibold', tone ?? 'text-slate-800 dark:text-slate-100')}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function CostBody({ cost }: { cost: NormalizedCost }) {
  // Secondary FinOps metrics — only rendered when at least one is present, so a
  // workflow-cost payload (which lacks them) doesn't show a row of em-dashes.
  const hasFinops =
    cost.cloudServices != null ||
    cost.elapsedMs != null ||
    cost.bytesScanned != null ||
    cost.queries30d != null;

  return (
    <div className="space-y-2.5">
      {/* Headline — attributed credits + estimated USD (clearly an estimate) */}
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Attributed credits" value={fmtCredits(cost.attributed)} />
        <Stat
          label={cost.isEstimate ? 'Est. cost (USD)' : 'Cost (USD)'}
          value={fmtUsd(cost.estUsd)}
          tone="text-amber-600 dark:text-amber-400"
        />
      </div>

      {/* Honesty badges — attributed (project) vs account/window total */}
      <div className="flex flex-wrap items-center gap-1">
        <span
          title="Credits attributed to this project's own queries (query attribution history)"
          className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
        >
          project {fmtCredits(cost.attributed)}
        </span>
        {cost.total != null && (
          <span
            title="Total credits in the lookback window — may include shared warehouse time not exclusive to this project"
            className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            account total {fmtCredits(cost.total)}
          </span>
        )}
        {(cost.runs != null || cost.successRate != null) && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {dash(cost.runs)} runs · {fmtPct(cost.successRate)} success
          </span>
        )}
        {cost.lookbackDays != null && (
          <span className="text-[9px] text-slate-400">last {cost.lookbackDays}d</span>
        )}
      </div>

      {/* Secondary FinOps metrics (object-scoped, derived from query usage) */}
      {hasFinops && (
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Cloud-services cr" value={fmtCredits(cost.cloudServices)} />
          <Stat label="Compute time" value={fmtMs(cost.elapsedMs)} />
          <Stat label="Bytes scanned" value={fmtBytes(cost.bytesScanned)} />
          <Stat label="Queries (30d)" value={fmtCount(cost.queries30d)} />
        </div>
      )}

      {/* Warnings — surfaced verbatim and honestly */}
      {cost.warnings.length > 0 && (
        <ul className="space-y-1">
          {cost.warnings.map((w) => (
            <li
              key={w}
              className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2 py-1 text-[10px] text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words">{w}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[9px] leading-tight text-slate-400">
        “account total” may include shared warehouse time — only “project” credits
        are attributed to this project, never the account total.
      </p>
    </div>
  );
}

// ── Shell + states ───────────────────────────────────────────────────────────

function Shell({
  title,
  compact,
  className,
  children,
}: {
  title: string;
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-amber-500" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function SkeletonBody() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="grid grid-cols-2 gap-1.5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="h-5 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

type FetchStatus = 'loading' | 'ok' | 'gap' | 'error';

/**
 * CostSummaryCard — the single shared cost summary surface.
 */
export default function CostSummaryCard({
  data,
  projectId,
  title = 'Cost summary',
  compact,
  className,
}: CostSummaryCardProps) {
  const [fetched, setFetched] = useState<CostSummaryData | null>(null);
  const [status, setStatus] = useState<FetchStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const shouldFetch = Boolean(projectId) && !data;

  const load = useCallback(async () => {
    if (!projectId) return;
    setStatus('loading');
    setError(null);
    try {
      const res = await getWorkflowCostSummary(projectId);
      setFetched(res as CostSummaryData);
      setStatus('ok');
    } catch (err) {
      if (isUnavailable(err)) setStatus('gap');
      else {
        setError(getApiErrorMessage(err));
        setStatus('error');
      }
    }
  }, [projectId]);

  useEffect(() => {
    if (shouldFetch) void load();
  }, [shouldFetch, load]);

  // 1) Pre-fetched data — pure presentational path, no state machine.
  if (data) {
    const cost = normalize(data);
    return (
      <Shell title={title} compact={compact} className={className}>
        {isEmptyCost(cost) ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No cost data yet.</p>
        ) : (
          <CostBody cost={cost} />
        )}
      </Shell>
    );
  }

  // 2) projectId — self-fetch the per-project cost summary.
  if (projectId) {
    // Route not deployed here → hide entirely (honest, no broken shell).
    if (status === 'gap') return null;
    return (
      <Shell title={title} compact={compact} className={className}>
        {status === 'loading' && <SkeletonBody />}
        {status === 'error' && (
          <div className="flex flex-col items-start gap-2 text-xs text-rose-600 dark:text-rose-400">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error ?? 'Could not load cost summary.'}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-rose-300 px-2.5 py-1 text-[11px] font-medium hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-900/20"
            >
              Retry
            </button>
          </div>
        )}
        {status === 'ok' &&
          (() => {
            const cost = normalize(fetched ?? {});
            return isEmptyCost(cost) ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">No cost data yet.</p>
            ) : (
              <CostBody cost={cost} />
            );
          })()}
      </Shell>
    );
  }

  // Nothing to source from.
  return null;
}
