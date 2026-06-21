'use client';

/**
 * ObjectSmartPanel — SmartRightBar for the Sources/Catalog page.
 *
 * Docked right-tab panel (Data360 2026 right-tab standard) rendered via the
 * shared `RightTabPanel`: a far-right icon rail flips the body between sections,
 * one section visible at a time. `role="region"` + `aria-modal="false"`,
 * Escape-to-close, active section persisted to versioned localStorage. Renders
 * the contextual "story" of the selected object across SmartRightBar sections:
 *   Trust Scores · Recommendations · Context · Governance · Lineage ·
 *   Ingestion · Ownership · History
 *
 * Each section fetches its own endpoint independently (per-section loading
 * skeleton + per-section error handling), so a slow or undeployed endpoint
 * never blocks the others. All eight fetches fire eagerly on selection
 * (regardless of the active tab); the rail only chooses which body is shown.
 *
 * Degradation (per smart-rightbar-spec):
 *   - loading                 → skeleton rows
 *   - 404                     → quiet "Not deployed yet" note (backend-gap)
 *   - any other HTTP / network error → "Section unavailable" + status code
 *   - null numeric values     → "—"  (NEVER rendered as 0)
 *
 * We call apiClient directly (via API.catalog.* path builders) rather than the
 * rightbar.ts safeGet wrappers, because safeGet collapses every failure to
 * null — it cannot distinguish a 404 (not-deployed) from a 500 (real error),
 * which this panel must surface differently. Types are still imported from the
 * service layer (single source of truth for the response shapes).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAtomValue } from 'jotai';
import {
  Package, Shield, GitBranch, Zap, User, Gauge,
  Lightbulb, Clock, ArrowRight, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { useCanPerform } from '@/hooks/useCanPerform';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { safeNum } from '@/lib/format-number';
import {
  applyRecommendation,
  type Recommendation,
  type ObjectHistoryResponse,
  type Object360Response,
} from '@/app/services/catalog';
import type {
  TableContext,
  TableGovernance,
  TableLineage,
  TableIngestion,
  TableOwnership,
} from '@/app/services/catalog/rightbar';
import RightTabPanel, { type RightTabSection } from '@/app/shared/governance/right-tab-panel';
import GovernancePostureCard, { type GovernancePostureData } from '@/app/shared/score-cards/GovernancePostureCard';
import SourceAiSummary, {
  type SourceDescriptor,
  type GovernanceContext,
  type LineageContext,
  type ProfileContext,
} from '@/app/shared/source-hub/SourceAiSummary';

interface SelectedObject {
  database: string;
  schema: string;
  table: string;
}

interface ObjectSmartPanelProps {
  selected: SelectedObject | null;
  onClose?: () => void;
}

/** GET /catalog/objects/{fqn}/scores — the per-object DQ/GOV/COST/trust rollup
 *  (scores === null until computed; ``recommended_actions`` are the CTAs). */
interface ObjectScores {
  scores: {
    quality_score: number | null;
    governance_score: number | null;
    modeling_score: number | null;
    finops_score: number | null;
    ml_ready_score: number | null;
    trust_score: number | null;
  } | null;
  top_issues?: string[];
  recommended_actions?: Array<string | { title?: string; label?: string; target?: string }>;
  hint?: string;
}

/** GET /catalog/recommendations?object_fqn=… — object-scoped reco list envelope. */
interface RecommendationsResponse {
  items: Recommendation[];
  count: number;
  filters?: Record<string, unknown>;
}

// Stable (module-level) URL factories: useSection's useCallback deps must not
// change identity each render, so these can't be inline arrows in the body.
const objectScoresUrl = (db: string, s: string, t: string) =>
  API.catalog.objectScores(`${db}.${s}.${t}`);

// Recommendations are fetched through useSection (not the getCatalogRecommendations
// wrapper) on purpose: the wrapper collapses a 404 into a thrown error, whereas this
// panel must distinguish 'not deployed' (gap) from a real failure — same rationale as
// the file header. The object_fqn is passed as a query param on the list route.
const objectRecommendationsUrl = (db: string, s: string, t: string) =>
  `${API.catalog.recommendations()}?object_fqn=${encodeURIComponent(`${db}.${s}.${t}`)}`;

const objectHistoryUrl = (db: string, s: string, t: string) =>
  API.catalog.objectHistory(`${db}.${s}.${t}`);

// Consolidated per-object 360 (catalog.object360). `include_profile=true` runs a
// sample profiling pass server-side, so this is the one section fetched LAZILY
// (see the gated useSection below) rather than eagerly with the other eight.
// Object id format is `TYPE:DB.SCHEMA.NAME` (matches getObject360 / objectIdFromTable).
const object360Url = (db: string, s: string, t: string) =>
  `${API.catalog.object360(`TABLE:${db}.${s}.${t}`)}?include_profile=true`;

// ---------------------------------------------------------------------------
// Per-section fetch state machine
// ---------------------------------------------------------------------------

type SectionStatus = 'loading' | 'ok' | 'gap' | 'error';

interface SectionState<T> {
  status: SectionStatus;
  data: T | null;
  /** HTTP status code on 'error' (undefined for network errors). */
  code?: number;
}

/**
 * useSection — fetch a single SmartRightBar endpoint with status-aware result.
 * Distinguishes 404/501 (backend-gap → 'gap') from other errors ('error' + code).
 */
function useSection<T>(
  urlFactory: ((db: string, s: string, t: string) => string) | null,
  selected: SelectedObject | null,
): SectionState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = useState<SectionState<T>>({ status: 'loading', data: null });

  const fetchSection = useCallback(async () => {
    if (!selected || !urlFactory) return;
    const { database, schema, table } = selected;
    setState({ status: 'loading', data: null });
    try {
      const { data } = await apiClient.get<T>(urlFactory(database, schema, table));
      setState({ status: 'ok', data });
    } catch (err: unknown) {
      const code = (err as { response?: { status?: number } })?.response?.status;
      if (code === 404 || code === 501) {
        setState({ status: 'gap', data: null, code });
      } else {
        setState({ status: 'error', data: null, code });
      }
    }
  }, [urlFactory, selected]);

  useEffect(() => {
    if (!selected || !urlFactory) {
      setState({ status: 'loading', data: null });
      return;
    }
    void fetchSection();
  }, [selected, urlFactory, fetchSection]);

  return { ...state, refetch: fetchSection };
}

// ---------------------------------------------------------------------------
// Presentational primitives
// ---------------------------------------------------------------------------

/** null/undefined numeric → "—", never 0. */
function num(v: number | string | null | undefined, fmt?: (n: number) => string): string {
  // Backend may send numeric fields as strings; coerce + guard so a non-numeric
  // value renders "—" instead of crashing the formatter (e.g. "85".toFixed).
  const n = safeNum(v);
  if (n === null) return '—';
  return fmt ? fmt(n) : String(n);
}

/** null/empty string → "—". */
function str(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  return v;
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-1" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse"
          style={{ width: `${85 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

/** Quiet backend-gap note (404/501 — endpoint not deployed yet). */
function GapNote() {
  return (
    <p className="text-[11px] italic text-gray-400 dark:text-gray-500 py-1">
      Not deployed yet
    </p>
  );
}

/** Real error — surfaces the status code, with an optional Retry. */
function ErrorNote({ code, onRetry }: { code?: number; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <p className="text-[11px] text-rose-600 dark:text-rose-400">
        Section unavailable{code ? ` (${code})` : ''}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded border border-rose-200 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/20"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Section body with the fetch state-machine renderer. The collapsible header is
 * gone — RightTabPanel's icon rail + eyebrow label own section selection now —
 * but the loading/gap/error/ok degradation is preserved verbatim.
 */
function SectionBody<T>({
  state,
  children,
}: {
  state: SectionState<T> & { refetch?: () => void };
  children: (data: T) => React.ReactNode;
}) {
  return (
    <div className="text-xs text-gray-700 dark:text-gray-300">
      {state.status === 'loading' && <SkeletonRows />}
      {state.status === 'gap' && <GapNote />}
      {state.status === 'error' && <ErrorNote code={state.code} onRetry={state.refetch} />}
      {state.status === 'ok' && state.data && children(state.data)}
      {state.status === 'ok' && !state.data && <GapNote />}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="shrink-0 text-gray-400 dark:text-gray-500">{label}</span>
      <span className="truncate text-right font-medium text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}

function Pill({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'amber' | 'rose' | 'emerald' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  } as const;
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', tones[tone])}>
      {children}
    </span>
  );
}

/**
 * One object-scoped recommendation with an Apply CTA (POST then refetch).
 *
 * Apply is a mutating action, so it is gated through System-2 Action-RBAC by the
 * parent (`useCanPerform('data_products', 'edit')` — applying a remediation edits
 * the catalog object; `data_products` is the registry module for catalog/object
 * surfaces). `canApply` is fail-open while the permission set loads; when it
 * resolves to a denial the button is honestly disabled with an ask-admin tooltip.
 */
function RecoRow({
  reco,
  onApplied,
  canApply,
}: {
  reco: Recommendation;
  onApplied: () => void;
  canApply: boolean;
}) {
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const title = reco.title || reco.feature || reco.rule_id;
  const detail = reco.rationale || reco.explanation || reco.proposed_action || undefined;
  const sev = (reco.severity || '').toLowerCase();
  const tone = sev === 'critical' || sev === 'high' ? 'rose' : sev === 'medium' ? 'amber' : 'gray';

  const apply = async () => {
    if (!canApply) return;
    setApplying(true);
    setErr(null);
    try {
      await applyRecommendation(reco.reco_id);
      onApplied();
    } catch {
      setErr('Apply failed');
      setApplying(false);
    }
  };

  return (
    <div className="rounded border border-gray-100 p-2 dark:border-gray-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {reco.severity && <Pill tone={tone}>{sev}</Pill>}
            <span className="truncate font-medium text-gray-800 dark:text-gray-200">{title}</span>
          </div>
          {detail && <p className="mt-0.5 text-gray-500 dark:text-gray-400">{detail}</p>}
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={applying || !canApply}
          title={
            !canApply
              ? 'You lack the "edit" permission on data products. Ask an administrator to grant it.'
              : undefined
          }
          className="shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applying ? '…' : 'Apply'}
        </button>
      </div>
      {err && <p className="mt-0.5 text-[10px] text-rose-600 dark:text-rose-400">{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function ObjectSmartPanel({ selected, onClose }: ObjectSmartPanelProps) {
  const router = useRouter();
  // Active section for the icon-rail flip menu. Restored from versioned
  // localStorage on mount by RightTabPanel (see `storageKey` below).
  const [activeSection, setActiveSection] = useState('scores');

  // All eight sections fetch eagerly on selection — the rail only chooses which
  // body is rendered, never which endpoints are hit (preserves prior behavior).
  const context    = useSection<TableContext>(selected ? API.catalog.tableContext : null, selected);
  const governance = useSection<TableGovernance>(selected ? API.catalog.tableGovernance : null, selected);
  const lineage    = useSection<TableLineage>(selected ? API.catalog.tableLineage : null, selected);
  const ingestion  = useSection<TableIngestion>(selected ? API.catalog.tableIngestion : null, selected);
  const ownership  = useSection<TableOwnership>(selected ? API.catalog.tableOwnership : null, selected);
  const scores     = useSection<ObjectScores>(selected ? objectScoresUrl : null, selected);
  const recos      = useSection<RecommendationsResponse>(selected ? objectRecommendationsUrl : null, selected);
  const history    = useSection<ObjectHistoryResponse>(selected ? objectHistoryUrl : null, selected);

  // Intentionally LAZY (breaks this file's "all fetches fire eagerly" invariant):
  // object360 with include_profile=true triggers sample-profiling queries, so we
  // only hit it once the user opens the AI Summary tab. It enriches the AI brief
  // (column count, sample null-rate, storage size, owner/comment, persisted scores).
  const object360  = useSection<Object360Response>(
    selected && activeSection === 'ai-summary' ? object360Url : null,
    selected,
  );

  // System-2 Action-RBAC gate for the per-recommendation "Apply" CTA (a mutating
  // remediation that edits the catalog object). `data_products` is the registry
  // module for catalog/object surfaces (`catalog` itself is not registered);
  // `edit` is its mutate action. Fail-open while loading (advisory gate; the
  // module-level cache is usually warm), hard-deny only on a definitive allow-set.
  const applyPerm = useCanPerform('data_products', 'edit');
  const canApplyReco = applyPerm.allowed || applyPerm.loading;

  // Real-time refresh (SSE): a governance edit (masking / RLS / tag) or a catalog
  // recompute lands as a cache-invalidation event. The per-section fetches above
  // are keyed only on the selected object, so without this the panel would show
  // stale PII / posture / scores for the selected table until the 30-min TTL.
  // Re-pull just the affected sections (mirrors the listing-remount on the page).
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!selected || !lastInvalidation) return;
    const keys = lastInvalidation.keys;
    const governanceTouched = keys.some(
      (k: string) =>
        k === CACHE_KEYS.POLICIES ||
        k === CACHE_KEYS.MASKING_POLICIES ||
        k === CACHE_KEYS.ROW_ACCESS_POLICIES ||
        k === CACHE_KEYS.GRANTS ||
        k === CACHE_KEYS.CATALOG_OBJECTS,
    );
    if (governanceTouched) {
      void governance.refetch();
      void context.refetch();
    }
    const catalogTouched = keys.some(
      (k: string) =>
        k === CACHE_KEYS.CATALOG_OBJECTS ||
        k === CACHE_KEYS.CATALOG_SCORES ||
        k === CACHE_KEYS.CATALOG_RECOMMENDATIONS,
    );
    if (catalogTouched) {
      void scores.refetch();
      void recos.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  // Idle state: nothing selected — keep the column footprint with a quiet hint.
  if (!selected) {
    return (
      <div className="flex h-full w-[380px] shrink-0 flex-col items-center justify-center border-l border-gray-200 px-6 text-center dark:border-gray-700">
        <Package className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Select a table to see its context, governance, lineage, ingestion and ownership.
        </p>
      </div>
    );
  }

  const sections: RightTabSection[] = [
    {
      // S-AI — AI SUMMARY (ephemeral, per-view brief composed from the data this
      // panel already fetches + the lazy object360 enrichment). Leads the rail.
      id: 'ai-summary',
      icon: Sparkles,
      label: 'AI Summary',
      description: 'Plain-language brief of this table from its context, governance, lineage and quality',
      help: 'A plain-language brief of this table, written on demand from its context, governance, lineage and quality signals. Generate it when you need it — it is ephemeral and nothing is stored.',
      render: () => {
        const ctx = context.data;
        const gov = governance.data;
        const lin = lineage.data;
        const own = ownership.data;
        const sc = scores.data;
        const o = object360.data;
        const prof = o?.tiers?.object?.profiling;

        // Storage size in bytes — prefer exact warehouse metadata, then profiled
        // bytes, then convert the context's GB figure. Honest "absent" → undefined.
        const sizeBytes =
          o?.snowflake_metadata?.total_storage_bytes ??
          prof?.bytes ??
          (ctx?.size_gb != null ? Math.round(ctx.size_gb * 1024 ** 3) : undefined) ??
          undefined;

        // Key columns from the profiling sample (only when actually profiled).
        const entities =
          prof?.available && prof.per_column?.length
            ? prof.per_column.slice(0, 12).map((c) => c.column)
            : undefined;

        // Sample null-rate: real, defensible (over the profiled sample), not faked.
        let nullRatePct: number | undefined;
        if (prof?.available && prof.per_column?.length) {
          const cells = prof.per_column.reduce((a, c) => a + (c.sample_total || 0), 0);
          const nulls = prof.per_column.reduce((a, c) => a + (c.null_count || 0), 0);
          if (cells > 0) nullRatePct = Math.round((nulls / cells) * 100);
        }

        const sensitiveColumns = gov?.pii_columns?.map((c) => c.column_name);
        const maskedColumns = gov?.pii_columns
          ?.filter((c) => c.masking_status !== 'NONE')
          .map((c) => c.column_name);

        const descriptor: SourceDescriptor = {
          kind: 'table',
          name: selected.table,
          database: selected.database,
          schema: selected.schema,
          description: o?.snowflake_metadata?.comment ?? undefined,
          owner: own?.owner_email ?? ctx?.owner ?? o?.snowflake_metadata?.owner ?? undefined,
          rowCount: ctx?.row_count ?? prof?.rows ?? undefined,
          columnCount: prof?.available && prof.columns ? prof.columns : undefined,
          sizeBytes,
          tags: ctx?.tags?.length ? ctx.tags.map((t) => `${t.tag_name}: ${t.tag_value}`) : undefined,
          entities,
        };

        // NOTE: deliberately no `classification` — data_class is a pipeline tier
        // (SOURCE/INTERMEDIATE/PRODUCT), not a sensitivity label, so feeding it as
        // a classification would misframe it. Omit rather than guess.
        const governanceCtx: GovernanceContext = {
          sensitiveColumns: sensitiveColumns?.length ? sensitiveColumns : undefined,
          maskedColumns: maskedColumns?.length ? maskedColumns : undefined,
          policies: gov?.rls_policies?.length ? gov.rls_policies.map((p) => p.policy_name) : undefined,
        };

        const lineageCtx: LineageContext = {
          upstream: lin?.upstream?.length ? lin.upstream.map((n) => n.name) : undefined,
          downstream: lin?.downstream?.length ? lin.downstream.map((n) => n.name) : undefined,
        };

        const freshnessSrc = ingestion.data?.last_run ?? ctx?.last_altered ?? null;
        const profileCtx: ProfileContext = {
          qualityScore:
            sc?.scores?.quality_score ?? o?.persisted_scores?.scores?.quality_score ?? undefined,
          nullRatePct,
          freshness: freshnessSrc ? `updated ${fmtDate(freshnessSrc)}` : undefined,
          issues: sc?.top_issues?.length ? sc.top_issues : undefined,
        };

        return (
          <div className="space-y-2">
            <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
              A plain-language brief built from this table&apos;s context, governance, lineage
              and quality signals. Ephemeral — generated on demand, nothing is stored.
            </p>
            <SourceAiSummary
              // Remount on table change: SourceAiSummary keeps its generated text
              // in local state and (with autoRun off) never self-resets, so without
              // a key the prior table's summary would linger after selection changes.
              // Key on the FQN — not the descriptor — so object360 resolving for the
              // SAME table doesn't wipe an already-generated summary.
              key={`${selected.database}.${selected.schema}.${selected.table}`}
              descriptor={descriptor}
              governance={governanceCtx}
              lineage={lineageCtx}
              profile={profileCtx}
              autoRun={false}
              title="Object summary"
            />
          </div>
        );
      },
    },
    {
      // S0 — TRUST SCORES (DQ / GOV / COST / trust rollup + recommended actions)
      id: 'scores',
      icon: Gauge,
      label: 'Trust Scores',
      help: 'A 0-100 rollup of how trustworthy this table is, blending its quality, governance, cost and ML-readiness. Follow a recommended action to lift a weak score; "—" means that dimension has not been computed yet.',
      render: () => (
        <SectionBody state={scores}>
          {(d) =>
            d.scores ? (
              <div className="space-y-0.5">
                <Field label="Trust" value={num(d.scores.trust_score, (n) => n.toFixed(0))} />
                <Field label="Quality (DQ)" value={num(d.scores.quality_score, (n) => n.toFixed(0))} />
                <Field label="Governance" value={num(d.scores.governance_score, (n) => n.toFixed(0))} />
                <Field label="FinOps (Cost)" value={num(d.scores.finops_score, (n) => n.toFixed(0))} />
                <Field label="ML-ready" value={num(d.scores.ml_ready_score, (n) => n.toFixed(0))} />
                {!!d.recommended_actions?.length && (
                  <div className="mt-2 space-y-1">
                    <span className="text-gray-400 dark:text-gray-500">Recommended actions</span>
                    {d.recommended_actions.slice(0, 4).map((a, i) => {
                      const target = typeof a === 'string' ? undefined : a.target;
                      const text = typeof a === 'string' ? a : (a.title || a.label);
                      return target ? (
                        <button
                          key={i}
                          type="button"
                          onClick={() => router.push(target)}
                          className="flex w-full items-center justify-between gap-1.5 rounded border border-amber-200 px-1.5 py-1 text-left text-gray-700 hover:bg-amber-50 dark:border-amber-800 dark:text-gray-300 dark:hover:bg-amber-900/20"
                        >
                          <span className="truncate">{text}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                        </button>
                      ) : (
                        <div key={i} className="flex items-start gap-1.5">
                          <Pill tone="amber">action</Pill>
                          <span className="text-gray-700 dark:text-gray-300">{text}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 dark:text-gray-400">
                Not yet scored.{d.hint ? ` ${d.hint}` : ''}
              </div>
            )
          }
        </SectionBody>
      ),
    },
    {
      // S0b — RECOMMENDATIONS (object-scoped, actionable)
      id: 'recommendations',
      icon: Lightbulb,
      label: 'Recommendations',
      help: 'Concrete, table-specific fixes we suggest — for example adding masking or documentation. Click Apply on any item to action it right here; the list refreshes once the change lands.',
      render: () => (
        <SectionBody state={recos}>
          {(d) =>
            d.items && d.items.length > 0 ? (
              <div className="space-y-1.5">
                {d.items.slice(0, 6).map((r) => (
                  <RecoRow
                    key={r.reco_id}
                    reco={r}
                    canApply={canApplyReco}
                    onApplied={() => void recos.refetch()}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No open recommendations.</p>
            )
          }
        </SectionBody>
      ),
    },
    {
      // S1 — CONTEXT
      id: 'context',
      icon: Package,
      label: 'Context',
      help: 'The table’s key facts at a glance: type, row count, size, owner, key dates and tags. Use it to confirm you are looking at the right object before you act on it.',
      render: () => (
        <SectionBody state={context}>
          {(d) => (
            <div className="space-y-0.5">
              <Field label="Type" value={str(d.type)} />
              <Field label="Rows" value={num(d.row_count, fmtInt)} />
              <Field label="Size (GB)" value={num(d.size_gb, (n) => n.toFixed(2))} />
              <Field label="Cluster key" value={str(d.cluster_key)} />
              <Field label="Owner" value={str(d.owner)} />
              <Field label="Created" value={fmtDate(d.created_at)} />
              <Field label="Last altered" value={fmtDate(d.last_altered)} />
              {d.tags && d.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1.5">
                  {d.tags.map((t, i) => (
                    <Pill key={`${t.tag_name}-${i}`}>{t.tag_name}: {t.tag_value}</Pill>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionBody>
      ),
    },
    {
      // S3 — GOVERNANCE
      id: 'governance',
      icon: Shield,
      label: 'Governance',
      help: 'Shows how well this table is protected: its governance rate, its sensitive (PII) columns and any row-access policies. Red pills flag sensitive columns with no masking — the ones that most need attention.',
      render: () => (
        <SectionBody state={governance}>
          {(d) => (
            // Converged onto the shared GovernancePostureCard (presentational `data`
            // path — no self-fetch; SectionBody above still owns loading/gap/error).
            // Pass ONLY the array-provenance fields: TableGovernance.sensitive_columns
            // is an ARRAY, not a count, so spreading `d` would corrupt the card's
            // numeric `sensitive_columns` slot. The card derives sensitive/masked/
            // unprotected (and the RED pills) from pii_columns' masking_status.
            <GovernancePostureCard
              compact
              title="Governance"
              data={{
                gov_rate: d.gov_rate,
                pii_columns: d.pii_columns,
                rls_policies: d.rls_policies,
              } satisfies GovernancePostureData}
            />
          )}
        </SectionBody>
      ),
    },
    {
      // S4 — LINEAGE
      id: 'lineage',
      icon: GitBranch,
      label: 'Lineage',
      help: 'The tables that feed this one (upstream) and the ones that depend on it (downstream), with a risk level for changes. Check downstream impact before you alter, rename or drop this table.',
      render: () => (
        <SectionBody state={lineage}>
          {(d) => (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Field label="Impact" value={num(d.impact_count)} />
              </div>
              {d.risk_level && (
                <Field
                  label="Risk"
                  value={<Pill tone={d.risk_level === 'HIGH' ? 'rose' : d.risk_level === 'MEDIUM' ? 'amber' : 'emerald'}>{d.risk_level}</Pill>}
                />
              )}
              <div className="pt-1">
                <p className="text-[10px] uppercase text-gray-400">Upstream ({d.upstream?.length ?? 0})</p>
                {d.upstream && d.upstream.length > 0 ? (
                  <ul className="mt-0.5 space-y-0.5">
                    {d.upstream.slice(0, 5).map((n, i) => (
                      <li key={`u-${n.name}-${i}`} className="truncate text-gray-700 dark:text-gray-300">↑ {n.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-400">—</p>
                )}
              </div>
              <div className="pt-1">
                <p className="text-[10px] uppercase text-gray-400">Downstream ({d.downstream?.length ?? 0})</p>
                {d.downstream && d.downstream.length > 0 ? (
                  <ul className="mt-0.5 space-y-0.5">
                    {d.downstream.slice(0, 5).map((n, i) => (
                      <li key={`d-${n.name}-${i}`} className="truncate text-gray-700 dark:text-gray-300">↓ {n.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-400">—</p>
                )}
              </div>
            </div>
          )}
        </SectionBody>
      ),
    },
    {
      // S5 — INGESTION
      id: 'ingestion',
      icon: Zap,
      label: 'Ingestion',
      help: 'How this table is loaded: its pipeline, mode, schedule, last and next run, and the typical cost per refresh. Use it to check whether the data is fresh and what each load costs.',
      render: () => (
        <SectionBody state={ingestion}>
          {(d) => (
            <div className="space-y-0.5">
              <Field label="Mode" value={str(d.mode)} />
              <Field label="Status" value={str(d.status)} />
              <Field label="Pipeline" value={str(d.pipeline_name)} />
              <Field label="Step" value={num(d.pipeline_step)} />
              <Field label="Last run" value={fmtDate(d.last_run)} />
              <Field label="Next run" value={fmtDate(d.next_run)} />
              <Field label="Avg cost (credits)" value={num(d.avg_cost_credits, (n) => n.toFixed(3))} />
              <Field label="Avg rows" value={num(d.avg_rows, fmtInt)} />
            </div>
          )}
        </SectionBody>
      ),
    },
    {
      // S6 — OWNERSHIP
      id: 'ownership',
      icon: User,
      label: 'Ownership',
      help: 'Who owns and maintains this table, plus the people who query it most (its top consumers). Use it to find the right contact and to see who relies on the data before you change it.',
      render: () => (
        <SectionBody state={ownership}>
          {(d) => (
            <div className="space-y-0.5">
              <Field label="Owner email" value={str(d.owner_email)} />
              <Field label="Team" value={str(d.owner_team)} />
              <Field label="Role" value={str(d.snowflake_role)} />
              <Field
                label="Data class"
                value={d.data_class ? <Pill>{d.data_class}</Pill> : '—'}
              />
              <Field label="Pipeline" value={str(d.pipeline_name)} />
              <Field label="Step" value={num(d.pipeline_step)} />
              <div className="pt-1">
                <p className="text-[10px] uppercase text-gray-400">Consumers ({d.consumers?.length ?? 0})</p>
                {d.consumers && d.consumers.length > 0 ? (
                  <ul className="mt-0.5 space-y-0.5">
                    {d.consumers.slice(0, 5).map((c, i) => (
                      <li key={`c-${c.user_name}-${i}`} className="flex justify-between gap-2 text-gray-700 dark:text-gray-300">
                        <span className="truncate">{c.user_name}</span>
                        <span className="shrink-0 text-gray-400">{num(c.access_count)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-400">—</p>
                )}
              </div>
            </div>
          )}
        </SectionBody>
      ),
    },
    {
      // S7 — HISTORY (recent events across sources for this object)
      id: 'history',
      icon: Clock,
      label: 'History',
      help: 'A timeline of recent events on this object across sources — loads, edits and access. Use it to trace what changed and when; failed events are shown in red.',
      render: () => (
        <SectionBody state={history}>
          {(d) =>
            d.entries && d.entries.length > 0 ? (
              <ul className="space-y-1.5">
                {d.entries.slice(0, 8).map((e, i) => (
                  <li key={`${e.ts}-${i}`} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Pill tone={e.status === 'error' || e.status === 'failed' ? 'rose' : 'gray'}>{str(e.kind)}</Pill>
                        <span className="truncate text-gray-700 dark:text-gray-300">{str(e.actor)}</span>
                      </div>
                      {e.source && <p className="text-[10px] text-gray-400">{e.source}</p>}
                    </div>
                    <span className="shrink-0 text-[10px] text-gray-400">{fmtDate(e.ts)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No recent activity.</p>
            )
          }
        </SectionBody>
      ),
    },
  ];

  return (
    <div className="h-full shrink-0 overflow-y-auto py-4 pl-2 pr-4">
      <RightTabPanel
        title={selected.table}
        subtitle={`${selected.database}.${selected.schema}`}
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onClose={() => onClose?.()}
        storageKey="data360.sources.smartPanel.v1"
        widthClassName="w-[380px]"
      />
    </div>
  );
}
