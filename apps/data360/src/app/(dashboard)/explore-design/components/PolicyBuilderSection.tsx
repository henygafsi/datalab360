'use client';

/**
 * Guided "New policy" builder — the FULL Snowflake policy family, object-first.
 *
 * Flow (mirrors how Snowflake docs teach policies):
 *   1. Target — the table is the current right-bar selection; pick the column
 *      when the chosen type is column-level (masking, projection).
 *   2. Type — cards rendered from GET /explore-design/policy-types (registry
 *      in tables; masking/CLS, row access/RLS, aggregation, projection, join,
 *      tag-based). Planned types show greyed with their doc link.
 *   3. Parameters — form generated from the registry's `inputs` spec.
 *   4. Review — generated DDL preview + "Queue for release": POST
 *      /policies/draft queues ONE pending DDL_ACTION, so the change is traced
 *      in the Release tab and ships at deploy (DCM-style plan → deploy).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  AlertTriangle, ArrowLeft, BookOpen, Check, ChevronRight, Columns3,
  ExternalLink, Loader2, Lock, ShieldCheck, Table2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableItem, ColumnInfo } from '../../mapping/components/VirtualizedTableList';
import {
  draftPolicy,
  getPolicyTypes,
  type PolicyTypeInput,
  type PolicyTypeSpec,
} from '@/app/services/explore-design';
import { getApiErrorMessage } from '@/lib/api-client';

interface PolicyBuilderSectionProps {
  table: TableItem | null;
  columns: ColumnInfo[];
  selectedColumn?: string | null;
  projectId?: string | null;
  /** Called after a draft is queued so the parent can refresh counters. */
  onDrafted?: (policyName: string) => void;
}

const LEVEL_LABEL: Record<string, string> = {
  column: 'Column-level',
  object: 'Table / view',
  tag: 'Tag-based',
};

export default function PolicyBuilderSection({
  table, columns, selectedColumn, projectId, onDrafted,
}: PolicyBuilderSectionProps) {
  const [types, setTypes] = useState<PolicyTypeSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [chosen, setChosen] = useState<PolicyTypeSpec | null>(null);
  const [column, setColumn] = useState<string | null>(selectedColumn ?? null);
  const [params, setParams] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ policy_name: string; statements: string[] } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getPolicyTypes();
        if (alive) setTypes(res.policy_types ?? []);
      } catch (e) {
        if (alive) setLoadError(getApiErrorMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const needsColumn = chosen?.level === 'column';
  const columnInfo = useMemo(
    () => columns.find((c) => c.name === column) ?? null,
    [columns, column],
  );

  const setParam = useCallback((name: string, value: any) => {
    setParams((p) => ({ ...p, [name]: value }));
  }, []);

  const missingRequired = useMemo(() => {
    if (!chosen) return [];
    const missing: string[] = [];
    if (needsColumn && !column) missing.push('column');
    for (const input of chosen.inputs) {
      if (!input.required) continue;
      const v = params[input.name];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
        missing.push(input.label);
      }
    }
    return missing;
  }, [chosen, needsColumn, column, params]);

  const submit = useCallback(async () => {
    if (!chosen || !table || !projectId) return;
    setSubmitting(true);
    try {
      const res = await draftPolicy(projectId, {
        policy_type: chosen.policy_type,
        target: {
          database: table.database,
          schema_name: table.schema,
          table: table.table,
          column: needsColumn ? column : null,
        },
        params,
        column_data_type: columnInfo?.dataType ?? null,
      });
      setResult({ policy_name: res.policy_name, statements: res.statements });
      toast.success(`${res.policy_name} queued for release`);
      onDrafted?.(res.policy_name);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, [chosen, table, projectId, needsColumn, column, params, columnInfo, onDrafted]);

  // ── Step 0: no target yet — the object-first guide ────────────────────────
  if (!table) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-4 text-center dark:border-slate-600">
        <Table2 className="mx-auto mb-2 h-5 w-5 text-slate-400" aria-hidden="true" />
        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
          Pick the object to protect first
        </p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Select a table on the canvas — every Snowflake policy attaches to a
          table, a view or one of their columns. The builder then guides the
          type and parameters.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Policy catalog unavailable: {loadError}
      </div>
    );
  }

  // ── Step 3 result: queued ──────────────────────────────────────────────────
  if (result) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 dark:border-emerald-800 dark:bg-emerald-900/20">
          <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
            <span className="font-semibold">{result.policy_name}</span> queued as a release
            change — review and deploy it from the Release tab.
          </p>
        </div>
        <pre className="max-h-48 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
          {result.statements.join(';\n\n')}
        </pre>
        <button
          className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
          onClick={() => { setResult(null); setChosen(null); setParams({}); }}
        >
          Create another policy
        </button>
      </div>
    );
  }

  // ── Step 1+2: type cards ───────────────────────────────────────────────────
  if (!chosen) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Protecting{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {table.database}.{table.schema}.{table.table}
          </span>
          {selectedColumn ? <> · column <span className="font-medium">{selectedColumn}</span></> : null}
          {' '}— choose how:
        </p>
        {types.map((t) => {
          const planned = t.status === 'planned';
          return (
            <button
              key={t.policy_type}
              disabled={planned}
              onClick={() => {
                setChosen(t);
                setColumn(selectedColumn ?? null);
                const defaults: Record<string, any> = {};
                for (const input of t.inputs) {
                  if (input.kind === 'enum' && input.options?.length) defaults[input.name] = input.options[0];
                }
                setParams(defaults);
              }}
              className={cn(
                'w-full rounded-md border p-2.5 text-left transition-colors',
                planned
                  ? 'cursor-not-allowed border-slate-200 opacity-50 dark:border-slate-700'
                  : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-blue-900/10',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
                  {t.label}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {t.status === 'preview' && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Preview
                    </span>
                  )}
                  {planned && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Roadmap
                    </span>
                  )}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {LEVEL_LABEL[t.level] ?? t.level}
                  </span>
                </span>
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                {t.why}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // ── Step 3: parameters for the chosen type ─────────────────────────────────
  return (
    <div className="space-y-3">
      <button
        className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        onClick={() => { setChosen(null); setParams({}); }}
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> All policy types
      </button>

      <div className="rounded-md border border-slate-200 p-2.5 dark:border-slate-700">
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{chosen.label}</p>
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          {chosen.attach_verb} · {chosen.one_per}
        </p>
        <a
          href={chosen.doc_url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          <BookOpen className="h-3 w-3" aria-hidden="true" /> Snowflake docs
          <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
        </a>
      </div>

      {/* Column pick — object-first: column is part of the target for
          column-level types, so it comes before the parameters. */}
      {needsColumn && (
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-200">
            <Columns3 className="h-3 w-3" aria-hidden="true" /> Column to protect
            <span className="text-red-500">*</span>
          </span>
          <select
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={column ?? ''}
            onChange={(e) => setColumn(e.target.value || null)}
            disabled={columns.length === 0}
          >
            <option value="">{columns.length === 0 ? 'No columns on this table' : 'Select a column…'}</option>
            {columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.dataType}){c.isSensitive ? ' · sensitive' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {chosen.inputs.map((input) => (
        <PolicyParamField
          key={input.name}
          input={input}
          value={params[input.name]}
          onChange={(v) => setParam(input.name, v)}
          columns={columns}
        />
      ))}

      {chosen.gotchas.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-900/15">
          {chosen.gotchas.map((g) => (
            <p key={g} className="flex items-start gap-1.5 py-0.5 text-[10px] leading-snug text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              {g}
            </p>
          ))}
        </div>
      )}

      {chosen.examples.length > 0 && (
        <details className="rounded-md border border-slate-200 dark:border-slate-700">
          <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            Doc examples ({chosen.examples.length})
          </summary>
          <div className="space-y-2 border-t border-slate-100 p-2 dark:border-slate-700/60">
            {chosen.examples.map((ex) => (
              <div key={ex.title}>
                <p className="mb-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">{ex.title}</p>
                <pre className="overflow-x-auto rounded bg-slate-50 p-1.5 text-[10px] leading-relaxed text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                  {ex.sql}
                </pre>
              </div>
            ))}
          </div>
        </details>
      )}

      <button
        disabled={missingRequired.length > 0 || submitting || !projectId}
        onClick={submit}
        title={
          !projectId
            ? 'Select a project first'
            : missingRequired.length > 0
              ? `Missing: ${missingRequired.join(', ')}`
              : undefined
        }
        className={cn(
          'flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors',
          missingRequired.length > 0 || submitting || !projectId
            ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            : 'bg-blue-600 text-white hover:bg-blue-700',
        )}
      >
        {submitting
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
        Queue for release
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
      </button>
      <p className="text-center text-[10px] text-slate-400 dark:text-slate-500">
        Generates the CREATE + ATTACH statements as one pending release change —
        nothing touches Snowflake until you deploy.
      </p>
    </div>
  );
}

// ── Param field renderer (driven by the registry inputs spec) ───────────────
function PolicyParamField({
  input, value, onChange, columns,
}: {
  input: PolicyTypeInput;
  value: any;
  onChange: (v: any) => void;
  columns: ColumnInfo[];
}) {
  const label = (
    <span className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
      {input.label}
      {input.required && <span className="ml-0.5 text-red-500">*</span>}
    </span>
  );
  const help = input.help ? (
    <p className="mt-0.5 text-[10px] leading-snug text-slate-400 dark:text-slate-500">{input.help}</p>
  ) : null;

  switch (input.kind) {
    case 'enum':
      return (
        <label className="block">
          {label}
          <select
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={!(input.options ?? []).length}
          >
            {(input.options ?? []).length === 0 && <option value="">No options available</option>}
            {(input.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {help}
        </label>
      );
    case 'int':
      return (
        <label className="block">
          {label}
          <input
            type="number"
            min={1}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
          {help}
        </label>
      );
    case 'column':
      return (
        <label className="block">
          {label}
          <select
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            disabled={columns.length === 0}
          >
            <option value="">{columns.length === 0 ? 'No columns on this table' : 'Select a column…'}</option>
            {columns.map((c) => (
              <option key={c.name} value={c.name}>{c.name} ({c.dataType})</option>
            ))}
          </select>
          {help}
        </label>
      );
    case 'columns':
      return (
        <div>
          {label}
          <div className="max-h-28 space-y-0.5 overflow-auto rounded-md border border-slate-200 p-1.5 dark:border-slate-700">
            {columns.map((c) => {
              const list: string[] = Array.isArray(value) ? (value as string[]) : [];
              const checked = list.includes(c.name);
              return (
                <label key={c.name} className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onChange(checked ? list.filter((n) => n !== c.name) : [...list, c.name])}
                  />
                  {c.name} <span className="text-slate-400">({c.dataType})</span>
                </label>
              );
            })}
          </div>
          {help}
        </div>
      );
    case 'roles':
      return (
        <label className="block">
          {label}
          <input
            type="text"
            placeholder="ANALYST, DATA_ENGINEER"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={Array.isArray(value) ? value.join(', ') : (value ?? '')}
            onChange={(e) =>
              onChange(e.target.value.split(',').map((r) => r.trim()).filter(Boolean))
            }
          />
          {help}
        </label>
      );
    case 'bool':
      return (
        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {input.label}
        </label>
      );
    default: // text
      return (
        <label className="block">
          {label}
          <input
            type="text"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
          {help}
        </label>
      );
  }
}
