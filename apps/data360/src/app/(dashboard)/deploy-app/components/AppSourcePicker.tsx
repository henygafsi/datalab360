'use client';

/**
 * Step 2 — AppSourcePicker.
 *
 * Three radio cards (workflow output | Explore-Design dataset | Connect feed).
 * Picking one expands an inline picker. After the user resolves a
 * database/schema/table tuple we hit `POST /explore-design/table/preview`
 * (limit 3) and inline-render the rows so they can SEE what their app
 * will actually read.
 *
 * The Connect feed mode is intentionally disabled — there is no `/connectors`
 * service file in the front-end yet, so we surface a BackendGapNote with the
 * exact endpoint shape we want and disable the radio. This matches the
 * "Backend gap — UX target" pattern from WizardPreflightPanel.tsx.
 */
import {
  AlertCircle,
  Beaker,
  Check,
  Database,
  FileSpreadsheet,
  GitBranch,
  Loader2,
  Lock,
  Plug,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { listProjects } from '@/app/services/api/projectsApi';
import {
  listDatabases,
  listSchemas,
  listTables,
} from '@/app/services/cortex/ml-features';
import {
  getTablePreview,
  type TablePreviewData,
} from '@/app/services/explore-design';
import type { SourceSelection, SourceMode } from './DeployAppWizard';

interface Props {
  value: SourceSelection;
  onChange: (patch: Partial<SourceSelection>) => void;
}

interface WorkflowOption {
  id: string;
  name: string;
}

export default function AppSourcePicker({ value, onChange }: Props) {
  return (
    <div className="space-y-5">
      <header>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Where will your app read from?
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Pick one source. We&apos;ll inject its schema into the generation
          prompt so the AI-drafted code is grounded.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <RadioCard
          id="workflow"
          active={value.mode === 'workflow'}
          icon={<GitBranch className="h-4 w-4" />}
          title="Workflow output"
          subtitle="A table written by a Data360 workflow."
          onClick={() => onChange({ mode: 'workflow' })}
        />
        <RadioCard
          id="dataset"
          active={value.mode === 'dataset'}
          icon={<Database className="h-4 w-4" />}
          title="Explore-Design dataset"
          subtitle="Any table the active warehouse can see."
          onClick={() => onChange({ mode: 'dataset' })}
        />
        <RadioCard
          id="connector"
          active={value.mode === 'connector'}
          icon={<Plug className="h-4 w-4" />}
          title="Connect feed"
          subtitle="A registered external connector."
          disabled
          onClick={() => onChange({ mode: 'connector' })}
        />
      </div>

      {value.mode === 'workflow' && <WorkflowSourceSubPanel value={value} onChange={onChange} />}
      {value.mode === 'dataset' && <DatasetSourceSubPanel value={value} onChange={onChange} />}
      {value.mode === 'connector' && <ConnectorBackendGap />}

      {value.database && value.schema && value.table && (
        <TablePeek
          database={value.database}
          schema={value.schema}
          table={value.table}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sub-panel: workflow output
 * ────────────────────────────────────────────────────────────────────────── */

function WorkflowSourceSubPanel({ value, onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listProjects({
          project_type: 'workflow',
          mine_only: false,
        });
        if (cancelled) return;
        const list = Array.isArray(data?.projects) ? data.projects : [];
        setWorkflows(
          list.map((p) => ({ id: p.project_id, name: p.project_name })),
        );
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load workflows');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Pick a workflow
      </h4>
      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading workflows…
        </div>
      ) : error ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      ) : workflows.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          No workflows found. Build one in the Workflow module first.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            value={value.workflowId || ''}
            onChange={(e) => {
              const wf = workflows.find((w) => w.id === e.target.value);
              onChange({
                workflowId: wf?.id || undefined,
                workflowName: wf?.name || undefined,
              });
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">— select a workflow —</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            We&apos;ll point the app at this workflow&apos;s destination table.
            Adjust the database / schema / table below if needed.
          </p>
        </div>
      )}

      {/* Workflow output table — manual override so we can also build the
          preview without needing a separate lookup endpoint. */}
      <DatasetTriple value={value} onChange={onChange} compact />
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sub-panel: Explore-Design dataset
 * ────────────────────────────────────────────────────────────────────────── */

function DatasetSourceSubPanel({ value, onChange }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Pick a table
      </h4>
      <DatasetTriple value={value} onChange={onChange} />
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Shared dataset triple (database → schema → table).
 * ────────────────────────────────────────────────────────────────────────── */

interface DatasetTripleProps extends Props {
  compact?: boolean;
}

function DatasetTriple({ value, onChange, compact }: DatasetTripleProps) {
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [scLoading, setScLoading] = useState(false);
  const [tbLoading, setTbLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [scError, setScError] = useState<string | null>(null);
  const [tbError, setTbError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDbLoading(true);
    setDbError(null);
    listDatabases()
      .then((dbs) => {
        if (cancelled) return;
        setDatabases(dbs.map((d) => d.name || String(d)));
      })
      .catch((err) => {
        if (!cancelled) {
          setDatabases([]);
          setDbError(err instanceof Error ? err.message : 'Failed to load databases');
        }
      })
      .finally(() => {
        if (!cancelled) setDbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!value.database) {
      setSchemas([]);
      setScError(null);
      return;
    }
    let cancelled = false;
    setScLoading(true);
    setScError(null);
    listSchemas(value.database)
      .then((scs) => {
        if (cancelled) return;
        setSchemas(scs.map((s) => s.name || String(s)));
      })
      .catch((err) => {
        if (!cancelled) {
          setSchemas([]);
          setScError(err instanceof Error ? err.message : 'Failed to load schemas');
        }
      })
      .finally(() => {
        if (!cancelled) setScLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value.database]);

  useEffect(() => {
    if (!value.database || !value.schema) {
      setTables([]);
      setTbError(null);
      return;
    }
    let cancelled = false;
    setTbLoading(true);
    setTbError(null);
    listTables(value.database, value.schema)
      .then((tbs) => {
        if (cancelled) return;
        setTables(tbs.map((t) => t.name || String(t)));
      })
      .catch((err) => {
        if (!cancelled) {
          setTables([]);
          setTbError(err instanceof Error ? err.message : 'Failed to load tables');
        }
      })
      .finally(() => {
        if (!cancelled) setTbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value.database, value.schema]);

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 md:grid-cols-3',
        compact && 'mt-3',
      )}
    >
      <TripleSelect
        label="Database"
        loading={dbLoading}
        error={dbError}
        options={databases}
        value={value.database || ''}
        onChange={(v) =>
          onChange({ database: v || undefined, schema: undefined, table: undefined })
        }
      />
      <TripleSelect
        label="Schema"
        loading={scLoading}
        error={scError}
        disabled={!value.database}
        options={schemas}
        value={value.schema || ''}
        onChange={(v) => onChange({ schema: v || undefined, table: undefined })}
      />
      <TripleSelect
        label="Table"
        loading={tbLoading}
        error={tbError}
        disabled={!value.schema}
        options={tables}
        value={value.table || ''}
        onChange={(v) => onChange({ table: v || undefined })}
      />
    </div>
  );
}

function TripleSelect({
  label,
  loading,
  error,
  disabled,
  options,
  value,
  onChange,
}: {
  label: string;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-700 dark:text-slate-300">
      <span className="font-medium">{label}</span>
      <div className="relative">
        <select
          value={value}
          disabled={disabled || loading}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
            (disabled || loading) && 'cursor-not-allowed opacity-60',
            error && 'border-amber-300 dark:border-amber-900/60',
          )}
        >
          <option value="">{loading ? 'Loading…' : `— ${label.toLowerCase()} —`}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <span className="flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          <span className="break-words">{error}</span>
        </span>
      )}
    </label>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Backend gap card for the Connect feed mode.
 * ────────────────────────────────────────────────────────────────────────── */

function ConnectorBackendGap() {
  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900/40 dark:bg-violet-900/20">
      <div className="flex items-center gap-2">
        <Lock className="h-3 w-3 text-violet-500" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Backend gap — UX target
        </p>
      </div>
      <dl className="mt-2 space-y-1.5 text-[11px]">
        <Row label="Endpoint" value="GET /connectors" />
        <Row label="Returns" value="[{ id, name, status, source_url }]" />
        <Row
          label="Why"
          value="The wizard needs to list registered Connect-module feeds so we can prefill the connector dropdown."
        />
      </dl>
      <div className="mt-2 flex items-center gap-2 rounded bg-violet-100 px-2 py-1 dark:bg-violet-900/40">
        <Beaker className="h-3 w-3 text-violet-600 dark:text-violet-300" />
        <span className="text-[10px] text-violet-800 dark:text-violet-200">
          Until this lands, pick an Explore-Design dataset instead.
        </span>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2">
      <dt className="font-semibold text-violet-700 dark:text-violet-300">{label}</dt>
      <dd className="font-mono text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 3-row table peek using getTablePreview.
 * ────────────────────────────────────────────────────────────────────────── */

function TablePeek({
  database,
  schema,
  table,
}: {
  database: string;
  schema: string;
  table: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TablePreviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    getTablePreview(database, schema, table, 3)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Preview failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [database, schema, table]);

  const columns = useMemo<string[]>(() => data?.columns ?? [], [data]);

  const rows = useMemo<unknown[][]>(() => {
    if (!data?.rows) return [];
    return data.rows.map((r) => columns.map((c) => r[c]));
  }, [data, columns]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Preview · {database}.{schema}.{table}
        </h4>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        {!loading && data && (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{error}</p>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          No rows returned. The table may be empty.
        </p>
      )}
      {rows.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-[11px]">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                  {columns.map((c, j) => (
                    <td
                      key={c}
                      className="px-2 py-1 font-mono text-slate-700 dark:text-slate-200"
                    >
                      {formatCell(r[j])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  return String(v);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Radio card primitive
 * ────────────────────────────────────────────────────────────────────────── */

function RadioCard({
  id,
  active,
  icon,
  title,
  subtitle,
  disabled,
  onClick,
}: {
  id: SourceMode;
  active: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-disabled={disabled}
      disabled={disabled}
      data-source-mode={id}
      onClick={onClick}
      className={cn(
        'group flex items-start gap-2 rounded-xl border p-3 text-left transition-all',
        active
          ? 'border-cyan-500 bg-cyan-50/60 ring-2 ring-cyan-200 dark:border-cyan-500 dark:bg-cyan-900/20 dark:ring-cyan-900/40'
          : 'border-slate-200 bg-white hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-cyan-700',
        disabled && 'cursor-not-allowed opacity-60 hover:border-slate-200 dark:hover:border-slate-700',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          active
            ? 'bg-cyan-600 text-white'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
          {subtitle}
        </p>
        {disabled && (
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-violet-600 dark:text-violet-400">
            Backend gap
          </p>
        )}
      </div>
    </button>
  );
}
