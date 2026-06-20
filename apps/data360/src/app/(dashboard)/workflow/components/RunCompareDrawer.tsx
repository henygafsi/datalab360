'use client';

/**
 * RunCompareDrawer.tsx
 *
 * Side-by-side comparison of two `WorkflowRun` objects.
 *
 * Renders:
 *   1. Header with both run IDs + statuses.
 *   2. Diff strip: total rows, total duration, steps count, error count.
 *   3. Per-step table (step_name | rows A | rows B | Δ rows | status A | status B)
 *      with row highlight when status or rows differ.
 *   4. Stdout / error_log line-level diff: two <pre> columns with `=`/`+`/`-` markers.
 *
 * No external `diff` library — pure line-by-line equality (LCS-free, intentionally
 * simple to avoid pulling deps for a panel that is rarely opened).
 */

import * as React from 'react';
import { X, GitCompare } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { WorkflowRun } from '@/app/services/api/types';

interface RunCompareDrawerProps {
  open: boolean;
  runA: WorkflowRun | null;
  runB: WorkflowRun | null;
  onClose: () => void;
}

interface StepLike {
  step_id?: string;
  step_name?: string;
  status?: string;
  rows_affected?: number;
}

function readSteps(run: WorkflowRun | null): StepLike[] {
  const details = run?.execution_details as Record<string, unknown> | null | undefined;
  const raw = details?.['steps_results'];
  if (!Array.isArray(raw)) return [];
  return raw as StepLike[];
}

function readStdout(run: WorkflowRun | null): string {
  if (!run) return '';
  const details = run.execution_details as Record<string, unknown> | null | undefined;
  // Look at a few likely fields without inventing schema
  const candidate =
    (details?.['stdout'] as string | undefined) ??
    (details?.['logs'] as string | undefined) ??
    (typeof run.error_log === 'string'
      ? (run.error_log as unknown as string)
      : run.error_log
      ? JSON.stringify(run.error_log, null, 2)
      : '');
  return typeof candidate === 'string' ? candidate : '';
}

function totalRows(run: WorkflowRun | null): number {
  const steps = readSteps(run);
  return steps.reduce((sum, s) => sum + (s.rows_affected ?? 0), 0);
}

function errorCount(run: WorkflowRun | null): number {
  if (!run) return 0;
  return readSteps(run).filter((s) => s.status === 'failed').length;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

interface DiffStripCellProps {
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
  diff?: boolean;
}

function DiffStripCell({ label, a, b, diff = false }: DiffStripCellProps) {
  return (
    <div
      className={cn(
        'rounded-md border p-2',
        diff
          ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
          : 'border-slate-200 dark:border-slate-700',
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
        <div className="font-mono text-slate-700 dark:text-slate-200">{a}</div>
        <div className="font-mono text-slate-700 dark:text-slate-200">{b}</div>
      </div>
    </div>
  );
}

interface DiffLine {
  marker: '=' | '+' | '-';
  text: string;
}

/**
 * Produce a paired line diff suitable for side-by-side rendering. We don't
 * implement Myers/LCS; instead we walk both lists positionally, treating
 * mismatched lines as a "-" on the left and "+" on the right. Acceptable for
 * the small stdout payloads we deal with (< 200 lines typical).
 */
function buildLineDiff(
  a: string,
  b: string,
): { left: DiffLine[]; right: DiffLine[] } {
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];
  const linesA = a ? a.split('\n') : [];
  const linesB = b ? b.split('\n') : [];
  const max = Math.max(linesA.length, linesB.length);

  for (let i = 0; i < max; i++) {
    const la = linesA[i];
    const lb = linesB[i];
    if (la === lb) {
      left.push({ marker: '=', text: la ?? '' });
      right.push({ marker: '=', text: lb ?? '' });
    } else {
      if (la !== undefined) left.push({ marker: '-', text: la });
      else left.push({ marker: '=', text: '' });
      if (lb !== undefined) right.push({ marker: '+', text: lb });
      else right.push({ marker: '=', text: '' });
    }
  }
  return { left, right };
}

const RunCompareDrawer: React.FC<RunCompareDrawerProps> = ({
  open,
  runA,
  runB,
  onClose,
}) => {
  // Esc to close
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const stepsA = readSteps(runA);
  const stepsB = readSteps(runB);
  const stdoutA = readStdout(runA);
  const stdoutB = readStdout(runB);

  // Merge steps by step_id (or position fallback)
  const stepKeys: string[] = [];
  const mapA = new Map<string, StepLike>();
  const mapB = new Map<string, StepLike>();
  stepsA.forEach((s, i) => {
    const k = s.step_id ?? `idx-${i}`;
    mapA.set(k, s);
    if (!stepKeys.includes(k)) stepKeys.push(k);
  });
  stepsB.forEach((s, i) => {
    const k = s.step_id ?? `idx-${i}`;
    mapB.set(k, s);
    if (!stepKeys.includes(k)) stepKeys.push(k);
  });

  const rowsA = totalRows(runA);
  const rowsB = totalRows(runB);
  const durA = runA?.duration_seconds ?? null;
  const durB = runB?.duration_seconds ?? null;
  const stepsCountA = stepsA.length;
  const stepsCountB = stepsB.length;
  const errA = errorCount(runA);
  const errB = errorCount(runB);

  const diff = buildLineDiff(stdoutA, stdoutB);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Compare runs"
      className="fixed inset-y-0 right-0 z-[70] flex"
    >
      {/* Drawer */}
      <div className="ml-auto h-full w-full max-w-3xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Compare runs
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Header strip with both run IDs */}
          <div className="grid grid-cols-2 gap-2">
            {[runA, runB].map((r, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-md border p-2',
                  'border-slate-200 dark:border-slate-700',
                )}
              >
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Run {i === 0 ? 'A' : 'B'}
                </div>
                <code className="block break-all font-mono text-[11px] text-slate-700 dark:text-slate-200">
                  {r?.run_id ?? '—'}
                </code>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Status:{' '}
                  <span className="font-medium">
                    {r?.status ?? '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Diff strip */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DiffStripCell
              label="Total rows"
              a={rowsA}
              b={rowsB}
              diff={rowsA !== rowsB}
            />
            <DiffStripCell
              label="Duration"
              a={formatDuration(durA)}
              b={formatDuration(durB)}
              diff={durA !== durB}
            />
            <DiffStripCell
              label="Steps"
              a={stepsCountA}
              b={stepsCountB}
              diff={stepsCountA !== stepsCountB}
            />
            <DiffStripCell
              label="Errors"
              a={errA}
              b={errB}
              diff={errA !== errB}
            />
          </div>

          {/* Per-step table */}
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Per-step diff
            </h3>
            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr className="text-slate-600 dark:text-slate-300">
                    <th className="px-2 py-1.5 text-left font-semibold">Step</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Rows A</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Rows B</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Δ Rows</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Status A</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Status B</th>
                  </tr>
                </thead>
                <tbody>
                  {stepKeys.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-2 py-3 text-center text-slate-500"
                      >
                        No step results to compare.
                      </td>
                    </tr>
                  ) : (
                    stepKeys.map((k) => {
                      const a = mapA.get(k);
                      const b = mapB.get(k);
                      const aRows = a?.rows_affected ?? 0;
                      const bRows = b?.rows_affected ?? 0;
                      const delta = bRows - aRows;
                      const rowDiff = aRows !== bRows;
                      const statusDiff = (a?.status ?? '') !== (b?.status ?? '');
                      const name =
                        a?.step_name ?? b?.step_name ?? a?.step_id ?? b?.step_id ?? k;
                      return (
                        <tr
                          key={k}
                          className={cn(
                            'border-t border-slate-100 dark:border-slate-800',
                            (rowDiff || statusDiff) &&
                              'bg-amber-50/60 dark:bg-amber-900/10',
                          )}
                        >
                          <td className="px-2 py-1 font-medium text-slate-700 dark:text-slate-200">
                            {name}
                          </td>
                          <td className={cn('px-2 py-1 text-right font-mono', rowDiff && 'text-amber-700 dark:text-amber-300')}>
                            {a ? aRows : '—'}
                          </td>
                          <td className={cn('px-2 py-1 text-right font-mono', rowDiff && 'text-amber-700 dark:text-amber-300')}>
                            {b ? bRows : '—'}
                          </td>
                          <td
                            className={cn(
                              'px-2 py-1 text-right font-mono',
                              delta > 0 && 'text-green-600',
                              delta < 0 && 'text-red-600',
                            )}
                          >
                            {a && b ? (delta > 0 ? `+${delta}` : delta) : '—'}
                          </td>
                          <td className={cn('px-2 py-1', statusDiff && 'text-amber-700 dark:text-amber-300')}>
                            {a?.status ?? '—'}
                          </td>
                          <td className={cn('px-2 py-1', statusDiff && 'text-amber-700 dark:text-amber-300')}>
                            {b?.status ?? '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stdout diff */}
          {(stdoutA || stdoutB) && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Output / error log
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { lines: diff.left, label: 'A' },
                  { lines: diff.right, label: 'B' },
                ].map((side, i) => (
                  <pre
                    key={i}
                    aria-label={`Run ${side.label} log`}
                    className="max-h-[260px] overflow-auto rounded-md bg-slate-900 p-2 font-mono text-[10px] leading-snug text-slate-200"
                  >
                    {side.lines.length === 0 ? (
                      <span className="italic text-slate-500">No output.</span>
                    ) : (
                      side.lines.map((ln, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            ln.marker === '+' && 'text-green-300 bg-green-900/20',
                            ln.marker === '-' && 'text-red-300 bg-red-900/20',
                            ln.marker === '=' && 'text-slate-300',
                          )}
                        >
                          <span className="select-none text-slate-500">
                            {ln.marker}{' '}
                          </span>
                          {ln.text || ' '}
                        </div>
                      ))
                    )}
                  </pre>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RunCompareDrawer;
