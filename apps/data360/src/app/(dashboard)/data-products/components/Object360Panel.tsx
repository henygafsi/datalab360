'use client';

/**
 * Object360Panel — dedicated Object-360 view for a Snowflake object.
 *
 * Docked right-tab panel (Data360 2026 right-tab standard) rendered via the
 * shared `RightTabPanel`: a far-right icon rail flips the body between sections,
 * one visible at a time. `role="region"` + `aria-modal="false"`, Escape-to-close,
 * active section persisted to versioned localStorage (`data360.catalog.smartPanel.v1`).
 * Sections over the `/api/snowflake/explorer/objects/{id}/*` routes:
 *   Columns · Lineage · Governance · Quality · Usage · Cost · Audit · Actions
 *
 * Each section lazily fetches its own route on open and runs the
 * Idle→Running→Completed/Empty/Error state machine independently — a failure in
 * one section degrades to an inline error and never blocks the others. No fake
 * zeros: missing numbers render as "—". Cost has no dedicated backend route, so
 * the Cost section reads the FinOps fields off the `usage` response.
 *
 * The Actions section renders the declarative affordance list from `/actions`
 * (each carries http.method + http.path) — destructive actions require a
 * confirm; nothing executes blindly. It is the object's centralized action shelf.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Columns3,
  DollarSign,
  GitBranch,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import RightTabPanel, { type RightTabSection } from '@/app/shared/governance/right-tab-panel';
import {
  getObjectActions,
  getObjectAudit,
  getObjectColumns,
  getObjectGovernanceTab,
  getObjectLineage,
  getObjectQuality,
  getObjectUsage,
  objectIdFromTable,
  type ObjectAction,
} from '@/app/services/catalog';

type AsyncState = 'idle' | 'running' | 'done' | 'error';
type TabKey =
  | 'columns'
  | 'lineage'
  | 'governance'
  | 'quality'
  | 'usage'
  | 'cost'
  | 'audit'
  | 'actions';

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'columns', label: 'Columns', icon: Columns3 },
  { key: 'lineage', label: 'Lineage', icon: GitBranch },
  { key: 'governance', label: 'Governance', icon: ShieldCheck },
  { key: 'quality', label: 'Quality', icon: Sparkles },
  { key: 'usage', label: 'Usage', icon: Activity },
  { key: 'cost', label: 'Cost', icon: DollarSign },
  { key: 'audit', label: 'Audit', icon: ScrollText },
  { key: 'actions', label: 'Actions', icon: RefreshCw },
];

/** Render a missing numeric value as an em-dash, never a fake 0. */
function num(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString();
}

export interface Object360PanelProps {
  /** Full table FQN `DB.SCHEMA.TABLE` — converted to an object_id internally. */
  tableFqn: string;
  /** Optional display title (defaults to the FQN). */
  title?: string;
  onClose: () => void;
}

export default function Object360Panel({ tableFqn, title, onClose }: Object360PanelProps) {
  const objectId = deriveObjectId(tableFqn);
  const [activeSection, setActiveSection] = useState<TabKey>('columns');

  // Unresolvable FQN → keep a minimal closable panel rather than a section rail.
  if (!objectId) {
    return (
      <div className="h-full shrink-0 overflow-y-auto py-4 pl-2 pr-4">
        <div className="sticky top-4 w-[420px] self-start overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">
              {title || tableFqn}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Object 360"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <span aria-hidden="true" className="text-lg leading-none">×</span>
            </button>
          </div>
          <div className="p-4">
            <EmptyState
              icon={AlertCircle}
              compact
              title="Cannot resolve object"
              description={`"${tableFqn}" is not a fully-qualified DB.SCHEMA.TABLE name, so its Object-360 cannot be loaded.`}
            />
          </div>
        </div>
      </div>
    );
  }

  // Each section renders only when active (RightTabPanel mounts the active body
  // alone), so the lazy fetch-on-open behaviour is preserved per section.
  const sections: RightTabSection[] = TABS.map(({ key, label, icon }) => ({
    id: key,
    icon,
    label,
    render: () => <TabBody objectId={objectId} tab={key} />,
  }));

  return (
    <div className="h-full shrink-0 overflow-y-auto py-4 pl-2 pr-4">
      <RightTabPanel
        title={title || tableFqn}
        subtitle={objectId}
        sections={sections}
        activeSection={activeSection}
        onSectionChange={(id) => setActiveSection(id as TabKey)}
        onClose={onClose}
        storageKey="data360.catalog.smartPanel.v1"
        widthClassName="w-[420px]"
      />
    </div>
  );
}

/** Convert a table FQN into the explorer object_id, or null if it isn't an FQN. */
function deriveObjectId(tableFqn: string): string | null {
  const parts = (tableFqn || '').split('.');
  if (parts.length !== 3 || parts.some((p) => !p.trim())) return null;
  const [db, schema, name] = parts;
  return objectIdFromTable(db.trim(), schema.trim(), name.trim());
}

// ---------------------------------------------------------------------------
// Tab body — one fetch hook per tab, lazily run when the tab is first opened.
// ---------------------------------------------------------------------------
function useTabData(objectId: string, tab: TabKey) {
  const [state, setState] = useState<AsyncState>('idle');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('running');
    setError(null);
    try {
      let res: any;
      switch (tab) {
        case 'columns':
          res = await getObjectColumns(objectId);
          break;
        case 'lineage':
          res = await getObjectLineage(objectId, { direction: 'both', depth: 3 });
          break;
        case 'governance':
          res = await getObjectGovernanceTab(objectId);
          break;
        case 'quality':
          res = await getObjectQuality(objectId);
          break;
        case 'usage':
        case 'cost':
          // Cost shares the usage route — its FinOps fields drive the Cost tab.
          res = await getObjectUsage(objectId, { period: '30d', group_by: 'day' });
          break;
        case 'audit':
          res = await getObjectAudit(objectId);
          break;
        case 'actions':
          res = await getObjectActions(objectId);
          break;
        default:
          res = null;
      }
      setData(res);
      setState('done');
    } catch (err) {
      setError(getApiErrorMessage(err));
      setState('error');
    }
  }, [objectId, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, data, error, reload: load };
}

function TabBody({ objectId, tab }: { objectId: string; tab: TabKey }) {
  const { state, data, error, reload } = useTabData(objectId, tab);

  if (state === 'running' || state === 'idle') {
    return (
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-9 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
          />
        ))}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Could not load {tab}</p>
            <p className="break-words">{error}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-lg border border-red-300 px-2.5 py-1 text-[11px] font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/30"
        >
          Retry
        </button>
      </div>
    );
  }

  switch (tab) {
    case 'columns':
      return <ColumnsTab data={data} />;
    case 'lineage':
      return <LineageTab data={data} />;
    case 'governance':
      return <GovernanceTab data={data} />;
    case 'quality':
      return <QualityTab data={data} />;
    case 'usage':
      return <UsageTab data={data} />;
    case 'cost':
      return <CostTab data={data} />;
    case 'audit':
      return <AuditTab data={data} />;
    case 'actions':
      return <ActionsTab data={data} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Tab renderers — defensive about partial shapes; "—" for missing values.
// ---------------------------------------------------------------------------
function asItems(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.columns)) return data.columns;
  return [];
}

function ColumnsTab({ data }: { data: any }) {
  const items = asItems(data);
  if (items.length === 0) {
    return <EmptyState icon={Columns3} compact title="No columns reported" />;
  }
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-[10px] uppercase tracking-wider text-slate-400">
        <tr>
          <th className="pb-2 pr-3 font-medium">Column</th>
          <th className="pb-2 pr-3 font-medium">Type</th>
          <th className="pb-2 font-medium">Nullable</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((c, i) => (
          <tr key={c.name ?? c.column_name ?? i}>
            <td className="py-1.5 pr-3 font-mono text-slate-800 dark:text-slate-200">
              {c.name ?? c.column_name ?? '—'}
            </td>
            <td className="py-1.5 pr-3 text-slate-500 dark:text-slate-400">
              {c.data_type ?? c.type ?? '—'}
            </td>
            <td className="py-1.5 text-slate-500 dark:text-slate-400">
              {c.nullable === undefined || c.nullable === null
                ? '—'
                : c.nullable
                  ? 'Yes'
                  : 'No'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LineageTab({ data }: { data: any }) {
  const upstream: any[] = data?.upstream ?? data?.nodes_upstream ?? [];
  const downstream: any[] = data?.downstream ?? data?.nodes_downstream ?? [];
  const edges: any[] = data?.edges ?? [];
  if (upstream.length === 0 && downstream.length === 0 && edges.length === 0) {
    return <EmptyState icon={GitBranch} compact title="No lineage recorded" />;
  }
  return (
    <div className="space-y-4">
      <LineageList title="Upstream" items={upstream} />
      <LineageList title="Downstream" items={downstream} />
      {upstream.length === 0 && downstream.length === 0 && edges.length > 0 && (
        <LineageList
          title="Edges"
          items={edges.map((e) => ({
            fqn: `${e.source ?? e.from ?? '?'} → ${e.target ?? e.to ?? '?'}`,
          }))}
        />
      )}
    </div>
  );
}

function LineageList({ title, items }: { title: string; items: any[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {title} ({items.length})
      </p>
      <ul className="space-y-1">
        {items.map((n, i) => (
          <li
            key={n.fqn ?? n.object_id ?? i}
            className="truncate rounded-md bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {n.fqn ?? n.fully_qualified_name ?? n.object_id ?? '—'}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GovernanceTab({ data }: { data: any }) {
  const tags: any[] = data?.tags ?? [];
  const policies: any[] = data?.policies ?? [];
  const metrics = [
    { label: 'Governance score', value: data?.score == null ? '—' : `${Math.round(data.score)}` },
    { label: 'Sensitive cols', value: num(data?.sensitive_columns) },
    { label: 'Masked', value: num(data?.masked_sensitive_columns) },
    { label: 'Unprotected', value: num(data?.unprotected_sensitive_columns) },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
          >
            <p className="text-[10px] text-slate-500">{m.label}</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{m.value}</p>
          </div>
        ))}
      </div>
      {tags.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Tags
          </p>
          <div className="flex flex-wrap gap-1">
            {tags.map((t, i) => (
              <span
                key={i}
                className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
              >
                {t.tag_name ?? '—'}
                {t.tag_value ? `: ${t.tag_value}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      {policies.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Policies
          </p>
          <ul className="space-y-1">
            {policies.map((p, i) => (
              <li
                key={i}
                className="rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {p.policy_name ?? '—'}{' '}
                <span className="text-slate-400">({p.policy_type ?? '—'})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tags.length === 0 && policies.length === 0 && (
        <EmptyState icon={ShieldCheck} compact title="No tags or policies applied" />
      )}
    </div>
  );
}

function QualityTab({ data }: { data: any }) {
  const checks: any[] = data?.checks ?? data?.items ?? [];
  if (checks.length === 0) {
    return <EmptyState icon={Sparkles} compact title="No quality checks reported" />;
  }
  return (
    <ul className="space-y-1.5">
      {checks.map((c, i) => {
        const passed: boolean =
          c.passed ?? (c.status === 'PASS' || c.status === 'passed');
        return (
          <li
            key={c.check_id ?? c.name ?? i}
            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
          >
            <span className="text-slate-700 dark:text-slate-300">
              {c.name ?? c.check ?? c.rule ?? '—'}
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                passed
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
              )}
            >
              {c.status ?? (passed ? 'PASS' : 'FAIL')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function UsageTab({ data }: { data: any }) {
  const summary = data?.summary ?? data ?? {};
  const metrics = [
    { label: 'Queries (30d)', value: num(summary.queries_last_30d ?? summary.query_count) },
    { label: 'Distinct users', value: num(summary.distinct_users) },
    { label: 'Bytes scanned', value: num(summary.bytes_scanned_total ?? summary.bytes_scanned) },
    { label: 'Errored queries', value: num(summary.errored_queries) },
  ];
  const series: any[] = data?.series ?? data?.time_series ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
          >
            <p className="text-[10px] text-slate-500">{m.label}</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{m.value}</p>
          </div>
        ))}
      </div>
      {series.length === 0 ? (
        <EmptyState icon={Activity} compact title="No usage time series" />
      ) : (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {series.length} data points over the last 30 days.
        </p>
      )}
    </div>
  );
}

function CostTab({ data }: { data: any }) {
  // Cost has no dedicated route — read FinOps fields off the usage response.
  const fin = data?.finops ?? data?.summary ?? data ?? {};
  const metrics = [
    { label: 'Cloud-services credits', value: num(fin.credits_cloud_services) },
    { label: 'Compute ms', value: num(fin.elapsed_ms_total) },
    { label: 'Bytes scanned', value: num(fin.bytes_scanned_total ?? fin.bytes_scanned) },
    { label: 'Queries (30d)', value: num(fin.queries_last_30d ?? fin.query_count) },
  ];
  const allMissing = metrics.every((m) => m.value === '—');
  if (allMissing) {
    return (
      <EmptyState
        icon={DollarSign}
        compact
        title="No cost data"
        description="FinOps metrics are derived from query usage. None are available for this object yet."
      />
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-slate-400">
        Derived from query usage (FinOps) — no separate cost endpoint.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
          >
            <p className="text-[10px] text-slate-500">{m.label}</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditTab({ data }: { data: any }) {
  const items = asItems(data);
  if (items.length === 0) {
    return <EmptyState icon={ScrollText} compact title="No audit events" />;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((e, i) => (
        <li
          key={e.event_id ?? i}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {e.event_type ?? e.action ?? e.query_type ?? '—'}
            </span>
            <span className="text-[10px] text-slate-400">
              {e.event_ts ?? e.ts ?? e.start_time
                ? new Date(e.event_ts ?? e.ts ?? e.start_time).toLocaleString()
                : '—'}
            </span>
          </div>
          {(e.user_name ?? e.actor ?? e.user) && (
            <p className="mt-0.5 text-[10px] text-slate-500">
              {e.user_name ?? e.actor ?? e.user}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function ActionsTab({ data }: { data: any }) {
  const actions: ObjectAction[] = data?.actions ?? [];
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (actions.length === 0) {
    return <EmptyState icon={RefreshCw} compact title="No actions available" />;
  }
  return (
    <ul className="space-y-1.5">
      {actions.map((a) => (
        <li
          key={a.action_id}
          className={cn(
            'rounded-lg border px-3 py-2',
            a.destructive
              ? 'border-red-200 dark:border-red-900/40'
              : 'border-slate-200 dark:border-slate-700',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                {a.label}
              </p>
              <p className="truncate font-mono text-[10px] text-slate-400">
                {a.http?.method} {a.http?.path}
              </p>
              {!a.enabled && a.disabled_reason && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  {a.disabled_reason}
                </p>
              )}
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase',
                a.group === 'danger'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
              )}
            >
              {a.group}
            </span>
          </div>
          {a.destructive && (
            <div className="mt-2 text-[10px] text-red-600 dark:text-red-400">
              {confirmId === a.action_id ? (
                <span>
                  Destructive — run from the owning module to confirm.{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setConfirmId(null)}
                  >
                    Dismiss
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="underline"
                  onClick={() => setConfirmId(a.action_id)}
                >
                  Requires confirmation
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
