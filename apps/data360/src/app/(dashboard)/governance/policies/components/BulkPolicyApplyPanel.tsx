'use client';

/**
 * BulkPolicyApplyPanel — docked (inline, non-popup) bulk-apply panel for a
 * single masking / row-access / tag policy. Rendered inside PolicyCard, it
 * fans one policy out to N targets the console previously applied one-at-a-time
 * (backlog §E 15/16/17):
 *   • masking   → apply to N columns of a table   (applyMaskingPolicy, looped)
 *   • row-access→ apply to N tables of a schema    (applyRLSPolicy, looped)  + simulate preview
 *   • tag       → tag N tables (or N columns)      (applyTag, looped)
 *
 * Guardrails:
 *   • Gated by useCanPerform('gouvernance','edit'); a denied apply is disabled
 *     with a reason, never hidden-then-failing.
 *   • ConfirmDialog before executing — a fan-out touches many objects.
 *   • Snowflake applies one ALTER per target, so we LOOP and capture per-row
 *     {target, ok, error} via toServiceError, then report an honest
 *     success/partial/fail toast (never a single optimistic success).
 *   • DATA-PLANE op: it only changes masking/row-filtering/tags, NOT the
 *     useCanPerform action graph — so it MUST NOT call invalidateMyPermissions.
 *     After the loop it calls onApplied() to refetch the policy's references.
 *
 * Target picker stays scoped to an already-loaded list: the operator drills
 * database → schema (→ table) with the shared ObjectSelector, then multi-selects
 * from the loaded column/table list of that container.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Play, FlaskConical, X } from 'lucide-react';
import { ObjectSelector } from './ObjectSelector';
import {
  applyMaskingPolicy,
  applyRLSPolicy,
  applyTag,
  getColumns,
  getTables,
  simulateRowAccess,
  type RowAccessSimulateResult,
} from '@/app/services/governance/policies';
import { useCanPerform } from '@/hooks/useCanPerform';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toServiceError } from '@/app/services/_errors';

export type BulkApplyMode = 'masking' | 'row-access' | 'tag';

interface BulkPolicyApplyPanelProps {
  /** masking | row-access | tag */
  mode: BulkApplyMode;
  /** The masking/RLS policy name, or the tag name. */
  policyName: string;
  /** Schema where the policy/tag object itself lives. */
  policySchema: string;
  /** Close the panel. */
  onClose: () => void;
  /** Refetch the policy's references after a run (data-plane refresh). */
  onApplied: () => void;
}

type RowResult = { target: string; ok: boolean; error?: string };

const fmtNum = (n: number | null | undefined) => (n == null ? '—' : String(n));

export default function BulkPolicyApplyPanel({
  mode,
  policyName,
  policySchema,
  onClose,
  onApplied,
}: BulkPolicyApplyPanelProps) {
  const { allowed, loading: permLoading } = useCanPerform('gouvernance', 'edit');
  const canEdit = allowed || permLoading; // fail-open while the allow-set loads

  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const [table, setTable] = useState('');

  // tag-only
  const [objectType, setObjectType] = useState<'TABLE' | 'COLUMN'>('TABLE');
  const [tagValue, setTagValue] = useState('');
  // row-access-only
  const [policyColumn, setPolicyColumn] = useState('');

  const [candidates, setCandidates] = useState<string[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);

  // row-access simulate preview (best-effort; degrades quietly when unavailable)
  const [simBusy, setSimBusy] = useState(false);
  const [simResults, setSimResults] = useState<Record<string, RowAccessSimulateResult> | null>(null);

  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; run: () => void }>({
    open: false, title: '', message: '', run: () => {},
  });

  // Candidate level: columns (need a table) vs tables (need a schema).
  const candidateLevel: 'column' | 'table' = useMemo(() => {
    if (mode === 'masking') return 'column';
    if (mode === 'row-access') return 'table';
    return objectType === 'COLUMN' ? 'column' : 'table'; // tag
  }, [mode, objectType]);
  const needsTablePick = candidateLevel === 'column';

  // Reset the picked targets whenever the candidate container changes.
  useEffect(() => {
    setSelected(new Set());
    setResults(null);
    setSimResults(null);
  }, [database, schema, table, candidateLevel]);

  // Load the candidate list (an already-loaded column/table list of the container).
  useEffect(() => {
    let alive = true;
    const ready = candidateLevel === 'column'
      ? Boolean(database && schema && table)
      : Boolean(database && schema);
    if (!ready) {
      setCandidates([]);
      setCandidatesError(null);
      return;
    }
    setLoadingCandidates(true);
    setCandidatesError(null);
    const loader = candidateLevel === 'column'
      ? getColumns(database, schema, table)
      : getTables(database, schema).then((rows) => rows.map((t) => t.name).filter(Boolean));
    loader
      .then((list) => { if (alive) setCandidates(list ?? []); })
      .catch((e) => {
        if (alive) {
          setCandidates([]);
          setCandidatesError(toServiceError(e, `Failed to load ${candidateLevel}s`).message);
        }
      })
      .finally(() => { if (alive) setLoadingCandidates(false); });
    return () => { alive = false; };
  }, [candidateLevel, database, schema, table]);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const allSelected = candidates.length > 0 && selected.size === candidates.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(candidates));

  const targets = useMemo(() => Array.from(selected), [selected]);

  // FQN for display / confirm copy.
  const displayOf = useCallback(
    (t: string) =>
      candidateLevel === 'column'
        ? `${database}.${schema}.${table}.${t}`
        : `${database}.${schema}.${t}`,
    [candidateLevel, database, schema, table],
  );

  const applyOne = useCallback(
    (t: string) => {
      if (mode === 'masking') {
        return applyMaskingPolicy({
          policy_name: policyName,
          database,
          schema,
          table,
          column: t,
          policy_schema: policySchema,
        });
      }
      if (mode === 'row-access') {
        return applyRLSPolicy({
          policy_name: policyName,
          table_name: t,
          database,
          schema,
          policy_column: policyColumn,
          policy_schema: policySchema,
        });
      }
      // tag
      return applyTag({
        tag_name: policyName,
        tag_value: tagValue,
        object_type: objectType,
        database,
        schema,
        ...(objectType === 'COLUMN' ? { table, column: t } : { table: t }),
        tag_schema: policySchema,
      });
    },
    [mode, policyName, database, schema, table, policyColumn, tagValue, objectType, policySchema],
  );

  const runBulk = useCallback(async () => {
    setBusy(true);
    setResults(null);
    setProgress({ done: 0, total: targets.length });
    const acc: RowResult[] = [];
    for (const t of targets) {
      try {
        await applyOne(t);
        acc.push({ target: t, ok: true });
      } catch (e) {
        acc.push({ target: t, ok: false, error: toServiceError(e, 'apply failed').message });
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    const okCount = acc.filter((r) => r.ok).length;
    const failCount = acc.length - okCount;
    const noun = candidateLevel === 'column' ? 'column' : 'object';
    if (failCount === 0) {
      toast.success(`Applied to ${okCount} ${noun}${okCount === 1 ? '' : 's'}`);
    } else if (okCount > 0) {
      toast(`${okCount} applied, ${failCount} failed (${acc.filter((r) => !r.ok).map((r) => r.target).join(', ')})`, { icon: '⚠️' });
    } else {
      toast.error(`Apply failed for all ${failCount} ${noun}${failCount === 1 ? '' : 's'}`);
    }
    setResults(acc);
    setBusy(false);
    setProgress(null);
    // DATA-PLANE: refetch references — do NOT invalidateMyPermissions.
    onApplied();
  }, [targets, applyOne, candidateLevel, onApplied]);

  // row-access only: simulate each selected table before applying.
  const runSimulate = useCallback(async () => {
    setSimBusy(true);
    const out: Record<string, RowAccessSimulateResult> = {};
    for (const t of targets) {
      try {
        out[t] = await simulateRowAccess({ database, schema, table: t });
      } catch {
        out[t] = { available: false, note: 'Simulation unavailable' };
      }
    }
    setSimResults(out);
    setSimBusy(false);
  }, [targets, database, schema]);

  // Validation → a single disabled-reason string (empty = ready).
  const disabledReason = useMemo(() => {
    if (!canEdit) return 'Requires governance edit permission';
    if (!database || !schema) return 'Pick a database and schema';
    if (needsTablePick && !table) return 'Pick a table';
    if (mode === 'row-access' && !policyColumn.trim()) return 'Enter the mapping column';
    if (mode === 'tag' && !tagValue.trim()) return 'Enter a tag value';
    if (targets.length === 0) return `Select at least one ${candidateLevel}`;
    return '';
  }, [canEdit, database, schema, needsTablePick, table, mode, policyColumn, tagValue, targets.length, candidateLevel]);

  const title =
    mode === 'masking' ? 'Bulk apply masking policy to columns'
    : mode === 'row-access' ? 'Bulk apply row-access policy to tables'
    : 'Bulk tag objects';

  const ask = () =>
    setConfirm({
      open: true,
      title,
      message:
        `Apply "${policyName}" to ${targets.length} ${candidateLevel === 'column' ? 'column' : 'object'}` +
        `${targets.length === 1 ? '' : 's'}?\n\n${targets.map(displayOf).join('\n')}`,
      run: () => { setConfirm((s) => ({ ...s, open: false })); void runBulk(); },
    });

  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/40 dark:bg-blue-900/10">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">{title}</span>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Drill: database → schema (→ table when columns are the target) */}
      <div className="grid gap-2 sm:grid-cols-3">
        <ObjectSelector
          level="database"
          value={database}
          onSelect={(v) => { setDatabase(v); setSchema(''); setTable(''); }}
          disabled={busy}
          label="Database"
        />
        <ObjectSelector
          level="schema"
          database={database}
          value={schema}
          onSelect={(v) => { setSchema(v); setTable(''); }}
          disabled={busy || !database}
          label="Schema"
        />
        {needsTablePick && (
          <ObjectSelector
            level="table"
            database={database}
            schema={schema}
            value={table}
            onSelect={(v) => setTable(v)}
            disabled={busy || !schema}
            label="Table"
          />
        )}
      </div>

      {/* Mode-specific inputs */}
      {mode === 'tag' && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Object type
            <select
              value={objectType}
              onChange={(e) => setObjectType(e.target.value as 'TABLE' | 'COLUMN')}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="TABLE">Tables</option>
              <option value="COLUMN">Columns</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Tag value
            <input
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              disabled={busy}
              placeholder="e.g. CONFIDENTIAL"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
          </label>
        </div>
      )}
      {mode === 'row-access' && (
        <div className="mt-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Mapping column (the row-access policy binds ON this column in every selected table)
            <input
              value={policyColumn}
              onChange={(e) => setPolicyColumn(e.target.value)}
              disabled={busy}
              placeholder="e.g. REGION"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
          </label>
        </div>
      )}

      {/* Candidate multi-select (already-loaded list) */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {candidateLevel === 'column' ? 'Columns' : 'Tables'}
            {selected.size > 0 && ` · ${selected.size} selected`}
          </span>
          {candidates.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              disabled={busy}
              className="text-[11px] text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-300"
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          )}
        </div>
        {loadingCandidates ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : candidatesError ? (
          <p className="text-xs text-red-600 dark:text-red-400">{candidatesError}</p>
        ) : candidates.length === 0 ? (
          <p className="text-xs italic text-slate-400">
            {needsTablePick && !table ? 'Pick a table to list its columns.' : `Pick a database and schema to list ${candidateLevel === 'column' ? 'columns' : 'tables'}.`}
          </p>
        ) : (
          <div className="max-h-44 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
            {candidates.map((name) => {
              const sim = simResults?.[name];
              return (
                <label
                  key={name}
                  className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-700/40"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(name)}
                    onChange={() => toggle(name)}
                    disabled={busy}
                  />
                  <span className="font-mono text-slate-700 dark:text-slate-300">{name}</span>
                  {mode === 'row-access' && sim && (
                    <span className="ml-auto text-[10px] text-slate-500 dark:text-slate-400">
                      {sim.available
                        ? `visible ${fmtNum(sim.visible_count)} · hidden ${fmtNum(sim.hidden_count)}`
                        : 'preview n/a'}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-row results from the last run */}
      {results && (
        <div className="mt-2 max-h-28 overflow-auto rounded-md border border-slate-200 text-[11px] dark:border-slate-700">
          {results.map((r) => (
            <div key={r.target} className="flex items-center gap-2 px-2 py-0.5">
              <span className={r.ok ? 'text-emerald-600' : 'text-red-600'}>{r.ok ? '✓' : '✗'}</span>
              <span className="font-mono text-slate-600 dark:text-slate-300">{r.target}</span>
              {!r.ok && r.error && <span className="truncate text-red-500">{r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {mode === 'row-access' && (
          <button
            type="button"
            onClick={() => void runSimulate()}
            disabled={busy || simBusy || targets.length === 0}
            title={targets.length === 0 ? 'Select tables to simulate' : 'Preview row visibility before applying'}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {simBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Simulate
          </button>
        )}
        <button
          type="button"
          onClick={ask}
          disabled={busy || !!disabledReason}
          title={disabledReason || `Apply to ${targets.length} target(s)`}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Apply to {targets.length || ''} {candidateLevel === 'column' ? 'column' : 'object'}{targets.length === 1 ? '' : 's'}
        </button>
        {progress && (
          <span className="text-sm text-blue-800 dark:text-blue-300">{progress.done}/{progress.total}…</span>
        )}
      </div>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel="Apply"
        onConfirm={confirm.run}
        onCancel={() => setConfirm((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}
