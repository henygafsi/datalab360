'use client';

/**
 * TableDataPreview — the shared "show me the rows" grid (2026 design system).
 *
 * One component for previewing ANY Snowflake table's data across modules —
 * a workflow block's output, an explore-design SOURCE or DESTINATION table,
 * a catalog object. Live `tablePreview`; honest empty/error; NULLs styled,
 * not faked; 100/500/1000 row limit. Used by the workflow bottom panel and the
 * explore-design preview rail so both read identically.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Database, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import { tablePreview } from '@/app/services/api/exploreDesignApi';
import type { TablePreview } from '@/app/services/api/types';

export interface TableTarget {
  database: string;
  schema: string;
  table: string;
}

export interface TableDataPreviewProps {
  projectId: string | null;
  target: TableTarget | null;
  defaultLimit?: number;
  /** Empty-state prompt when no target is selected. */
  emptyHint?: string;
  className?: string;
}

const LIMITS = [100, 500, 1000] as const;

function cell(v: unknown): { text: string; isNull: boolean } {
  if (v === null || v === undefined) return { text: 'NULL', isNull: true };
  if (typeof v === 'object') return { text: JSON.stringify(v), isNull: false };
  return { text: String(v), isNull: false };
}

export default function TableDataPreview({
  projectId,
  target,
  defaultLimit = 100,
  emptyHint = 'Select a table to preview its data',
  className,
}: TableDataPreviewProps) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [data, setData] = useState<TablePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<number>(defaultLimit);

  const load = useCallback(async () => {
    if (!projectId || !target) return;
    setState('running');
    setError(null);
    try {
      setData(
        await tablePreview(projectId, target.database, target.schema, target.table, { limit }),
      );
      setState('done');
    } catch (err) {
      setError(getApiErrorMessage(err));
      setState('error');
    }
  }, [projectId, target, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!projectId || !target) {
    return <EmptyState icon={Table2} compact title={emptyHint} />;
  }
  if (state === 'running' || state === 'idle') {
    return (
      <div className={cn('space-y-1', className)} aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
        ))}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50/70 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
        <div className="flex-1">
          <span className="break-words">{error}</span>{' '}
          <button type="button" className="underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  const cols = data?.columns ?? [];
  const rows = data?.rows ?? [];
  if (rows.length === 0) return <EmptyState icon={Table2} compact title="No rows" />;

  return (
    <div className={cn('flex h-full flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1 truncate font-mono">
          <Database className="h-3 w-3 shrink-0" />
          {target.database}.{target.schema}.{target.table}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span>
            {rows.length.toLocaleString()} of {data?.row_count?.toLocaleString() ?? '—'} rows
          </span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded border border-slate-200 bg-transparent px-1 py-0.5 text-[10px] dark:border-slate-700"
            aria-label="Row limit"
          >
            {LIMITS.map((l) => (
              <option key={l} value={l}>
                {l} rows
              </option>
            ))}
          </select>
        </span>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="glass-2 border-b border-slate-200 px-2 py-1 text-right font-mono text-[9px] text-slate-400 dark:border-slate-700">
                #
              </th>
              {cols.map((c) => (
                <th
                  key={c}
                  className="glass-2 whitespace-nowrap border-b border-slate-200 px-2 py-1 text-left font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="odd:bg-slate-50/50 dark:odd:bg-slate-800/30">
                <td className="px-2 py-1 text-right font-mono text-[9px] text-slate-300 dark:text-slate-600">
                  {ri + 1}
                </td>
                {cols.map((c) => {
                  const { text, isNull } = cell(row[c]);
                  return (
                    <td
                      key={c}
                      className={cn(
                        'max-w-[280px] truncate whitespace-nowrap px-2 py-1 font-mono',
                        isNull
                          ? 'italic text-slate-300 dark:text-slate-600'
                          : 'text-slate-700 dark:text-slate-200',
                      )}
                      title={text}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
