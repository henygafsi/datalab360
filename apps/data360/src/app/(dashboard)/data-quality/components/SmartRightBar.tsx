'use client';

/**
 * SmartRightBar — Data Quality docked right-tab context panel.
 *
 * Aligns the Data Quality module to the 2026 right-tab UX standard by reusing the
 * shared `RightTabPanel` (governance/right-tab-panel): a docked, non-modal
 * (`role="region"` / `aria-modal="false"`) panel that lives as a flex sibling of
 * the page body, with a far-right vertical icon rail flipping between sections.
 *
 * Behaviour preserved from the previous inline implementation: each of the eight
 * sections renders the exact same data / actions / links (Run Check, Associate
 * DMF, Set Schedule, governance tags, lineage deep-link, ingestion status,
 * ownership, AI tips, DMF history). The panel "opens" when a table row is
 * selected and closes (Escape / X / clear selection) by lifting `onClose`, which
 * the parent wires to `setSelectedRow(null)`.
 */

import React, { useState } from 'react';
import {
  Gauge, Zap, ShieldCheck, GitBranch, Upload, UserCog, Sparkles, History,
  Play, Link2, CalendarClock, Activity, Database, Shield, Lightbulb,
  ArrowUpRight, Boxes, EyeOff, Table2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import RightTabPanel, { type RightTabSection } from '@/app/shared/governance/right-tab-panel';
import GovernancePostureCard, { type GovernancePostureData } from '@/app/shared/score-cards/GovernancePostureCard';

type MetricRow = { [key: string]: unknown };

/**
 * Page-level quality rollup used to render the DEFAULT "Quality overview" when no
 * table row is selected. Declared inline (not imported from the page) to keep this
 * component self-contained and avoid a page ↔ component import cycle. All fields
 * are optional / nullable so an honest "—" is shown when a metric is not yet loaded.
 */
export interface QualityOverview {
  total_tables?: number | null;
  health_score?: number | null;
  dmf_pass_rate?: number | null;
  classification_coverage?: number | null;
  checks_run_30d?: number | null;
}

/**
 * One "overview by axis" entry for the default (no-selection) view. Computed by
 * the page from its EXISTING data services (quality summary, dimension rows,
 * breaches, threshold rules) — this component only renders what it is given.
 * `severity` mirrors the cockpit's AxisSeverity buckets; 'idle' = not measured
 * yet and MUST be shown as an honest neutral chip (typically display '—').
 */
export interface AxisHighlight {
  id: string;
  label: string;
  display: string;
  severity: 'ok' | 'warn' | 'blocker' | 'pending' | 'idle';
}

/** Bucket-colored chip classes per axis severity (ok/warn/blocker/idle). */
const AXIS_CHIP_CLS: Record<AxisHighlight['severity'], string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  warn: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  blocker: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  pending: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  idle: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700',
};

// ── Local presentational helpers (duplicated from the parent page to keep this
// component self-contained and avoid a page ↔ component import cycle) ──

function SkeletonBar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('animate-pulse bg-gray-200 dark:bg-gray-700 rounded', className)} style={style} />
  );
}

function StatusBadge({ status }: { status: string | unknown }) {
  const s = String(status ?? '').toUpperCase();
  if (s === 'PASS' || s === 'LOADED' || s === 'UNIQUE')
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{s}</span>;
  if (s === 'FAIL' || s === 'LOAD_FAILED' || s === 'LOAD FAILED' || s === 'HAS_DUPLICATES')
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{s}</span>;
  if (s === 'WARNING' || s === 'PARTIALLY_LOADED' || s === 'PARTIALLY LOADED')
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{s}</span>;
  return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{s || '—'}</span>;
}

interface SmartRightBarProps {
  selectedRow: MetricRow | null;
  /** Page-level rollup for the default "Quality overview" (nothing-selected state). */
  overview?: QualityOverview | null;
  /** "Overview by axis" — bucket-colored highlight chips (page-computed, reuse only). */
  axes?: AxisHighlight[];
  /** Opens the matching cockpit axis when an axis entry is clicked. */
  onOpenAxis?: (id: string) => void;
  data: {
    dqScore: number | null;
    dmfCount: number | null;
    classificationTags: MetricRow[];
    ingestionStatus: string | null;
    owner: string | null;
    steward: string | null;
    dmfHistory: MetricRow[];
  } | null;
  loading: boolean;
  onRunCheck: () => void;
  onAssociateDmf: () => void;
  onScheduleDmf: () => void;
  onClose: () => void;
  canRunCheck: boolean;
  canAssociateDmf: boolean;
  canScheduleDmf: boolean;
}

export default function SmartRightBar({
  selectedRow,
  overview,
  axes,
  onOpenAxis,
  data,
  loading,
  onRunCheck,
  onAssociateDmf,
  onScheduleDmf,
  onClose,
  canRunCheck,
  canAssociateDmf,
  canScheduleDmf,
}: SmartRightBarProps) {
  // Hooks must run unconditionally — declare state BEFORE any early return.
  const [section, setSection] = useState('context');

  const tableName = selectedRow ? String(selectedRow.TABLE_NAME || selectedRow.table_name || '') : null;
  const schemaName = selectedRow ? String(selectedRow.SCHEMA_NAME || selectedRow.TABLE_SCHEMA || '') : null;
  const columnName = selectedRow ? String(selectedRow.COLUMN_NAME || selectedRow.column_name || '') : '';

  // DEFAULT VIEW — nothing selected. Instead of collapsing the column (return
  // null), the bar opens with a purposeful "Quality overview": the page's rollup
  // KPIs (honest "—" when unknown) plus the same primary actions the detail view
  // exposes, so the panel always states the page's purpose on load and switches
  // to the per-table story once a row is selected.
  if (!selectedRow || !tableName) {
    const pct = (v: number | null | undefined) =>
      v === null || v === undefined ? '—' : `${Math.round(v)}%`;
    const int = (v: number | null | undefined) =>
      v === null || v === undefined ? '—' : new Intl.NumberFormat('en-US').format(v);
    const overviewSection: RightTabSection = {
      id: 'overview',
      icon: Gauge,
      label: 'Overview',
      help: 'A snapshot of data quality across every catalogued table. Select a table row to drill into its score, checks, governance and history.',
      render: () => (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Monitor and improve the quality of your data. Select a table to see its
            score, run checks and review its metric history.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Tables monitored</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{int(overview?.total_tables)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Health score</p>
              <p className={cn('text-lg font-bold',
                (overview?.health_score === null || overview?.health_score === undefined) ? 'text-gray-400' :
                (overview?.health_score ?? 0) >= 80 ? 'text-green-600 dark:text-green-400' :
                (overview?.health_score ?? 0) >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
              )}>{pct(overview?.health_score)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">DMF pass rate</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{pct(overview?.dmf_pass_rate)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Checks run (30d)</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{int(overview?.checks_run_30d)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            Classification coverage: {pct(overview?.classification_coverage)}
          </div>
          {/* Overview by axis — bucket-colored highlight chips (existing data only;
              'idle' axes show a neutral chip with an honest '—'). Click → cockpit axis. */}
          {axes && axes.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-gray-100 dark:border-gray-800">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 pt-2">
                <Gauge className="h-3 w-3" /> Overview by axis
              </p>
              {axes.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  data-dq-axis={a.id}
                  onClick={() => onOpenAxis?.(a.id)}
                  disabled={!onOpenAxis}
                  title={onOpenAxis ? `Open the ${a.label} axis in the quality cockpit` : undefined}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 rounded-lg border border-gray-100 dark:border-gray-800 px-2.5 py-1.5 text-left transition-colors',
                    onOpenAxis ? 'hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer' : 'cursor-default',
                  )}
                >
                  <span className="min-w-0 truncate text-xs font-medium text-gray-700 dark:text-gray-300">{a.label}</span>
                  <span className={cn(
                    'inline-flex flex-shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                    AXIS_CHIP_CLS[a.severity] ?? AXIS_CHIP_CLS.idle,
                  )}>
                    {a.display}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-gray-800">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 pt-2">
              <Table2 className="h-3 w-3" /> Primary actions
            </p>
            <button
              onClick={onRunCheck}
              disabled={!canRunCheck}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                canRunCheck
                  ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                  : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800 cursor-not-allowed'
              )}
              title={!canRunCheck ? 'You lack the "run" permission on data quality.' : 'Run a threshold check'}
            >
              <Play className="h-3.5 w-3.5 flex-shrink-0" />
              Run Check
            </button>
            <button
              onClick={onAssociateDmf}
              disabled={!canAssociateDmf}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                canAssociateDmf
                  ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-400 dark:hover:bg-violet-900/40'
                  : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800 cursor-not-allowed'
              )}
              title={!canAssociateDmf ? 'You lack the "associate" permission on data quality.' : 'Associate a new metric check'}
            >
              <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
              Add Rule (DMF)
            </button>
          </div>
        </div>
      ),
    };
    return (
      <RightTabPanel
        title="Data Quality"
        subtitle="Overview"
        sections={[overviewSection]}
        activeSection="overview"
        onSectionChange={() => { /* single default section — no switching */ }}
        onClose={onClose}
        storageKey="data360.dataQuality.smartPanel.overview.v1"
        accentClassName="bg-blue-500"
        maxHeightClassName="max-h-full"
      />
    );
  }

  // ── Outbound prefilled deep-links (mirror of the inbound scan-prefill pattern
  // and the lineage CTA below). We carry the selected table (and column) as
  // honest context breadcrumbs and a truthful `from=data-quality` origin — NOT
  // `from=scan`, which would fire the destinations' account-wide scan banners
  // and mis-advertise generic suggestions as "this table". The destination lands
  // on the right page/tab and can adopt the context params as they're consumed. ──
  const exploreModelHref =
    `/explore-design?intent=model&from=data-quality&table=${encodeURIComponent(tableName)}`;
  const governanceMaskingHref =
    `/governance/policies?tab=masking&from=data-quality&table=${encodeURIComponent(tableName)}` +
    (columnName ? `&column=${encodeURIComponent(columnName)}` : '');

  // While the context fan-out is in flight, the active section shows skeletons —
  // mirrors the previous inline panel's loading state.
  const loadingBody = (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => <SkeletonBar key={i} className="h-12 w-full rounded-lg" />)}
    </div>
  );

  const sections: RightTabSection[] = [
    {
      id: 'context',
      icon: Gauge,
      label: 'Context',
      help: "Snapshot of this table's data-quality score and how many metric checks are attached to it. A score below 80% means freshness, completeness or validity needs a closer look.",
      render: () => loading ? loadingBody : (
        <>
          {/* DQ score + DMF count */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">DQ Score</p>
              <p className={cn('text-lg font-bold',
                (data?.dqScore === null || data?.dqScore === undefined) ? 'text-gray-400' :
                (data?.dqScore ?? 0) >= 80 ? 'text-green-600 dark:text-green-400' :
                (data?.dqScore ?? 0) >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
              )}>
                {data?.dqScore !== null && data?.dqScore !== undefined ? `${data.dqScore}%` : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">DMF Checks</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {data?.dmfCount ?? '—'}
              </p>
            </div>
          </div>
          {schemaName && (
            <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate">Schema: {schemaName}</p>
          )}
        </>
      ),
    },
    {
      id: 'actions',
      icon: Zap,
      label: 'Actions',
      help: 'Run a quality check on this table right now, attach a new metric check to it, or set checks to run on a schedule. Any action you lack permission for is shown greyed out.',
      render: () => loading ? loadingBody : (
        // Run Check / Associate DMF / Set Schedule — verbatim handlers + RBAC gates.
        <div className="space-y-1.5">
          <button
            onClick={onRunCheck}
            disabled={!canRunCheck}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
              canRunCheck
                ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800 cursor-not-allowed'
            )}
            title={!canRunCheck ? 'You lack the "run" permission on data quality.' : `Run threshold check on ${tableName}`}
          >
            <Play className="h-3.5 w-3.5 flex-shrink-0" />
            Run Check
          </button>
          <button
            onClick={onAssociateDmf}
            disabled={!canAssociateDmf}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
              canAssociateDmf
                ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-400 dark:hover:bg-violet-900/40'
                : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800 cursor-not-allowed'
            )}
            title={!canAssociateDmf ? 'You lack the "associate" permission on data quality.' : `Associate a DMF to ${tableName}`}
          >
            <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
            Associate DMF
          </button>
          <button
            onClick={onScheduleDmf}
            disabled={!canScheduleDmf}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
              canScheduleDmf
                ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40'
                : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800 cursor-not-allowed'
            )}
            title={!canScheduleDmf ? 'You lack the "schedule" permission on data quality.' : `Set DMF schedule for ${tableName}`}
          >
            <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />
            Set Schedule
          </button>
        </div>
      ),
    },
    {
      id: 'governance',
      icon: ShieldCheck,
      label: 'Governance',
      help: 'Columns on this table that have been flagged as sensitive (such as PII) and the classification tags applied to them. Use it to confirm regulated data is properly labelled before the table is shared.',
      render: () => loading ? loadingBody : (
        // Converged onto the shared GovernancePostureCard. This payload is
        // classification-tags-only: map each tag row → the card's tag chips
        // (classification → column). We deliberately do NOT feed `dqScore` as the
        // governance score (quality ≠ governance) and do NOT synthesize sensitive/
        // masked counts the backend didn't report — those grid cells stay honest
        // "—". Empty tags → the card's neutral empty message.
        <GovernancePostureCard
          compact
          title="Governance"
          data={{
            tags: (data?.classificationTags ?? []).map((tag) => ({
              tag_name: String(tag.TAG_NAME || tag.CATEGORY || '—'),
              tag_value: tag.COLUMN_NAME ? String(tag.COLUMN_NAME) : null,
            })),
          } satisfies GovernancePostureData}
        />
      ),
    },
    {
      id: 'act',
      icon: ArrowUpRight,
      label: 'Act',
      help: 'Shortcuts to a related task for this table — model it downstream in Explore & Design, or review its masking rules in Governance. The table (and column) is carried over so you land in the right place.',
      render: () => (
        // Outbound prefilled deep-link CTAs — model the table downstream, or
        // review its masking controls — mirroring the lineage deep-link below.
        <div className="space-y-2">
          <a
            href={exploreModelHref}
            className="group flex items-start gap-2.5 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-900/10 px-3 py-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/20 transition-colors"
          >
            <Boxes className="h-4 w-4 text-indigo-500 mt-0.5 flex-shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-indigo-700 dark:text-indigo-300">Model this in Explore &amp; Design</span>
              <span className="block text-[10px] text-indigo-600/70 dark:text-indigo-400/70 truncate">Open the AI-guided modeler with this table carried over.</span>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
          <a
            href={governanceMaskingHref}
            className="group flex items-start gap-2.5 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 px-3 py-2 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors"
          >
            <EyeOff className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-amber-700 dark:text-amber-300">Review masking in Governance</span>
              <span className="block text-[10px] text-amber-600/70 dark:text-amber-400/70 truncate">
                {columnName ? `Open masking policies for ${columnName}.` : 'Open masking policies for this table.'}
              </span>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      ),
    },
    {
      id: 'lineage',
      icon: GitBranch,
      label: 'Lineage',
      help: 'Opens this table in the Observability lineage view, where you can trace where its data comes from and what downstream tables depend on it.',
      render: () => loading ? loadingBody : (
        // Deep-link to /observability/lineage.
        <a
          href={tableName ? `/observability?tab=lineage&table=${encodeURIComponent(tableName)}` : '/observability'}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Activity className="h-3.5 w-3.5" />
          View in Observability Lineage
        </a>
      ),
    },
    {
      id: 'ingestion',
      icon: Upload,
      label: 'Ingestion',
      help: 'The result of the most recent data load into this table. A failed or partial status here often explains a sudden drop in the quality score.',
      render: () => loading ? loadingBody : (
        // Last load status + COPY_HISTORY freshness.
        <div className="flex items-center gap-2">
          <Upload className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-600 dark:text-gray-300">Last status:</span>
          <StatusBadge status={data?.ingestionStatus || '—'} />
        </div>
      ),
    },
    {
      id: 'ownership',
      icon: UserCog,
      label: 'Ownership',
      help: 'The business owner and data steward responsible for this table. Reach out to them when you spot a quality issue that needs fixing at the source.',
      render: () => loading ? loadingBody : (
        // Data owner + steward from catalog.
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <Database className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-gray-500 dark:text-gray-400">Owner:</span>
            <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{data?.owner || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Shield className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-gray-500 dark:text-gray-400">Steward:</span>
            <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{data?.steward || '—'}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'ai-tips',
      icon: Sparkles,
      label: 'AI Tips',
      help: "Plain-language suggestions for raising this table's quality score, generated from its current checks and metrics. Treat them as a starting checklist, not a mandatory to-do list.",
      render: () => loading ? loadingBody : (
        // AI-generated DQ recommendations.
        <div className="rounded-lg border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 px-3 py-2">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {data?.dqScore !== null && data?.dqScore !== undefined && (data.dqScore ?? 0) < 80
                ? `DQ score ${data.dqScore}% — associate NULL_COUNT and DUPLICATE_COUNT DMFs to improve coverage.`
                : data?.dmfCount === 0
                  ? `No DMF checks configured. Add NULL_COUNT to key columns to begin continuous monitoring.`
                  : `Quality looks good. Schedule periodic DMF runs and review classification tags for PII compliance.`
              }
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'history',
      icon: History,
      label: 'DMF History',
      help: 'The most recent metric measurements recorded for this table. Use it to confirm a check is actually running and to see when its quality last changed.',
      render: () => loading ? loadingBody : (
        // Last 5 DMF measurements.
        data?.dmfHistory && data.dmfHistory.length > 0 ? (
          <div className="space-y-1">
            {data.dmfHistory.map((h, i) => (
              <div
                key={`${String(h.METRIC_NAME || h.metric_name || '')}-${String(h.COLUMN_NAME || h.column_name || '')}-${String(h.MEASUREMENT_TIME || h.measured_at || i)}`}
                className="flex items-center justify-between gap-2 rounded border border-gray-100 dark:border-gray-800 px-2 py-1"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate">{String(h.METRIC_NAME || h.metric_name || '—')}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{String(h.MEASUREMENT_TIME || h.measured_at || '—')}</p>
                </div>
                <StatusBadge status={h.STATUS || h.status || '—'} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">No DMF measurements yet for this table.</p>
        )
      ),
    },
  ];

  return (
    <RightTabPanel
      title={tableName}
      subtitle={schemaName || undefined}
      sections={sections}
      activeSection={section}
      onSectionChange={setSection}
      onClose={onClose}
      storageKey="data360.dataQuality.smartPanel.v1"
      accentClassName="bg-blue-500"
      maxHeightClassName="max-h-full"
    />
  );
}
