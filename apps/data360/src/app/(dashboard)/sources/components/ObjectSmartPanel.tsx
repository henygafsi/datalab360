'use client';

/**
 * ObjectSmartPanel — SmartRightBar for the Sources/Catalog page.
 *
 * Always-visible right rail (w-[380px], NOT a modal). Renders the contextual
 * "story" of the selected Snowflake object across SmartRightBar sections:
 *   S1 Context · S3 Governance · S4 Lineage · S5 Ingestion · S6 Ownership
 *
 * Each section fetches its own endpoint independently (per-section loading
 * skeleton + per-section error handling), so a slow or undeployed endpoint
 * never blocks the others.
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
import {
  Package, Shield, GitBranch, Zap, User, X, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import type {
  TableContext,
  TableGovernance,
  TableLineage,
  TableIngestion,
  TableOwnership,
} from '@/app/services/catalog/rightbar';

interface SelectedObject {
  database: string;
  schema: string;
  table: string;
}

interface ObjectSmartPanelProps {
  selected: SelectedObject | null;
  onClose?: () => void;
}

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
): SectionState<T> {
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

  return state;
}

// ---------------------------------------------------------------------------
// Presentational primitives
// ---------------------------------------------------------------------------

/** null/undefined numeric → "—", never 0. */
function num(v: number | null | undefined, fmt?: (n: number) => string): string {
  if (v === null || v === undefined) return '—';
  return fmt ? fmt(v) : String(v);
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

/** Real error — surfaces the status code. */
function ErrorNote({ code }: { code?: number }) {
  return (
    <p className="text-[11px] text-rose-600 dark:text-rose-400 py-1">
      Section unavailable{code ? ` (${code})` : ''}
    </p>
  );
}

/** Collapsible section shell with a fetch state-machine renderer. */
function Section<T>({
  title,
  icon,
  state,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  state: SectionState<T>;
  children: (data: T) => React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-100 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
          {icon}
          {title}
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-gray-400 transition-transform',
            !open && '-rotate-90',
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-3 text-xs text-gray-700 dark:text-gray-300">
          {state.status === 'loading' && <SkeletonRows />}
          {state.status === 'gap' && <GapNote />}
          {state.status === 'error' && <ErrorNote code={state.code} />}
          {state.status === 'ok' && state.data && children(state.data)}
          {state.status === 'ok' && !state.data && <GapNote />}
        </div>
      )}
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

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function ObjectSmartPanel({ selected, onClose }: ObjectSmartPanelProps) {
  const context    = useSection<TableContext>(selected ? API.catalog.tableContext : null, selected);
  const governance = useSection<TableGovernance>(selected ? API.catalog.tableGovernance : null, selected);
  const lineage    = useSection<TableLineage>(selected ? API.catalog.tableLineage : null, selected);
  const ingestion  = useSection<TableIngestion>(selected ? API.catalog.tableIngestion : null, selected);
  const ownership  = useSection<TableOwnership>(selected ? API.catalog.tableOwnership : null, selected);

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            Smart Panel
          </p>
          {selected ? (
            <>
              <h2 className="truncate text-sm font-bold text-gray-900 dark:text-white">{selected.table}</h2>
              <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                {selected.database}.{selected.schema}
              </p>
            </>
          ) : (
            <h2 className="text-sm font-bold text-gray-400 dark:text-gray-500">No object selected</h2>
          )}
        </div>
        {selected && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Package className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Select a table to see its context, governance, lineage, ingestion and ownership.
            </p>
          </div>
        ) : (
          <>
            {/* S1 — CONTEXT */}
            <Section title="Context" icon={<Package className="h-3.5 w-3.5" />} state={context}>
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
            </Section>

            {/* S3 — GOVERNANCE */}
            <Section title="Governance" icon={<Shield className="h-3.5 w-3.5" />} state={governance}>
              {(d) => (
                <div className="space-y-1.5">
                  <Field
                    label="Gov rate"
                    value={d.gov_rate === null || d.gov_rate === undefined ? '—' : `${Math.round(d.gov_rate * 100)}%`}
                  />
                  <Field label="PII columns" value={num(d.pii_columns?.length)} />
                  <Field label="RLS policies" value={num(d.rls_policies?.length)} />
                  {d.pii_columns && d.pii_columns.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {d.pii_columns.slice(0, 8).map((c) => (
                        <Pill
                          key={c.column_name}
                          tone={c.masking_status === 'NONE' ? 'rose' : c.masking_status === 'PARTIAL' ? 'amber' : 'emerald'}
                        >
                          {c.column_name}
                        </Pill>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* S4 — LINEAGE */}
            <Section title="Lineage" icon={<GitBranch className="h-3.5 w-3.5" />} state={lineage}>
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
            </Section>

            {/* S5 — INGESTION */}
            <Section title="Ingestion" icon={<Zap className="h-3.5 w-3.5" />} state={ingestion}>
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
            </Section>

            {/* S6 — OWNERSHIP */}
            <Section title="Ownership" icon={<User className="h-3.5 w-3.5" />} state={ownership}>
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
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
