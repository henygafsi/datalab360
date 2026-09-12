'use client';

/**
 * StudioExportMenu — the export of one widget, with its scope stated.
 *
 * Why it exists: a single "Download" button shipped whatever the tile had
 * already rendered. That render is capped by the preview envelope, and the
 * cap is invisible in the payload (`row_count` equals `rows.length`, so
 * nothing in the numbers betrays the truncation). The user received twenty
 * rows believing they held the answer.
 *
 * Three scopes, because the product has three — the split is the backend's
 * preview policy, not a UI invention: `export_job` is a credit-gated
 * operation there, so only the preview envelope is free.
 *
 *   visible        the rows already on screen. Never leaves the browser.
 *   result_preview the widget's result inside the free envelope, from the
 *                  server, which reports the cap and whether it truncated.
 *   full_result    the complete filtered answer — credit-gated.
 *   raw_rows       the underlying rows — credit-gated.
 *
 * A gated scope is not hidden and not disabled-in-silence: it is offered,
 * and answers with the reason plus what would unlock it. Nothing here
 * regenerates the report — only /studio/report/export is called.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Lock } from 'lucide-react';
import {
  exportChartResult,
  type ExportOutcome,
  type ExportScope,
  type GlobalFilter,
  type RunResult,
  type StudioChartSpec,
} from '@/app/services/studio/studio-api';

function saveCsv(title: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^\w\-. ]+/g, '_').slice(0, 60) || 'widget'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The rows already rendered — serialised locally, no request. */
export function csvFromResult(result: RunResult): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    (result.columns ?? []).map(esc).join(','),
    ...(result.rows ?? []).map((r) => (r as unknown[]).map(esc).join(',')),
  ].join('\n');
}

type Choice = { id: ExportScope | 'visible'; label: string; detail: string; gated: boolean };

export default function StudioExportMenu({
  title,
  spec,
  result,
  draftId,
  globalFilters,
  disabled,
}: {
  title: string;
  spec: StudioChartSpec;
  result: RunResult | null;
  draftId?: string;
  globalFilters?: GlobalFilter[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ExportOutcome | { ok: true; scope: 'visible'; rows: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const visibleRows = result?.rows?.length ?? 0;
  const filtersOn = (globalFilters ?? []).length;

  const choices: Choice[] = [
    {
      id: 'visible',
      label: `The ${visibleRows} rows on screen`,
      detail: 'Exactly what this widget shows. Written here, nothing is sent.',
      gated: false,
    },
    {
      id: 'result_preview',
      label: 'This widget’s result, free preview',
      detail: filtersOn
        ? `Recomputed with the ${filtersOn} active filter${filtersOn > 1 ? 's' : ''}. Says if it was capped.`
        : 'Recomputed by the server, which states its cap.',
      gated: false,
    },
    {
      id: 'full_result',
      label: 'The complete filtered result',
      detail: 'Every row the question returns, no cap.',
      gated: true,
    },
    {
      id: 'raw_rows',
      label: 'The underlying rows',
      detail: 'The source rows behind the figures, where allowed.',
      gated: true,
    },
  ];

  const run = useCallback(
    async (choice: Choice) => {
      setBusy(choice.id);
      setOutcome(null);
      try {
        if (choice.id === 'visible') {
          if (!result) return;
          saveCsv(`${title} (on screen)`, csvFromResult(result));
          setOutcome({ ok: true, scope: 'visible', rows: visibleRows });
          return;
        }
        const res = await exportChartResult(spec, {
          draftId,
          scope: choice.id,
          globalFilters,
        });
        if (res.ok && res.csv) saveCsv(`${title} (${choice.id})`, res.csv);
        setOutcome(res);
      } finally {
        setBusy(null);
      }
    },
    [draftId, globalFilters, result, spec, title, visibleRows],
  );

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={disabled ? 'Available once the widget has run' : 'Export — choose how much'}
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:text-slate-300"
      >
        <Download aria-hidden className="h-3.5 w-3.5" />
        <span className="sr-only">Export this widget</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Export scope"
          className="absolute right-0 z-30 mt-1 w-80 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="px-2 pb-1 pt-0.5 text-xs text-slate-500 dark:text-slate-400">
            How much of the answer do you want?
          </p>
          {choices.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              disabled={busy != null || (c.id === 'visible' && visibleRows === 0)}
              onClick={() => void run(c)}
              className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:bg-slate-800"
            >
              <span className="flex items-center gap-1.5">
                {c.gated && <Lock aria-hidden className="h-3 w-3 shrink-0 text-slate-400" />}
                <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                  {busy === c.id ? 'Preparing…' : c.label}
                </span>
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-slate-500 dark:text-slate-400">
                {c.detail}
              </span>
            </button>
          ))}

          {outcome && (
            <p
              role="status"
              className={`mt-1 rounded-lg px-2 py-1.5 text-xs leading-snug ${
                outcome.ok
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
                  : 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200'
              }`}
            >
              {outcome.ok
                ? outcome.scope === 'visible'
                  ? 'rows' in outcome && outcome.rows != null
                    ? `Saved the ${outcome.rows} rows that were on screen.`
                    : 'Saved the rows that were on screen.'
                  : `${
                      (outcome as ExportOutcome).rows != null
                        ? `Saved ${(outcome as ExportOutcome).rows} rows.`
                        : 'Saved the file — the server did not report a row count.'
                    }${
                      // three-state: only claim a cap (or its absence) when the
                      // server actually said so — silence must not read as a
                      // guarantee that nothing was capped.
                      (outcome as ExportOutcome).truncated === true
                        ? ' This is capped by the free preview — it is not the whole answer.'
                        : (outcome as ExportOutcome).truncated === false
                          ? ' The server reported no cap on this result.'
                          : ''
                    }`
                : (outcome as ExportOutcome).gated
                  ? `${(outcome as ExportOutcome).gated!.message}${
                      (outcome as ExportOutcome).gated!.nextStep
                        ? ` ${(outcome as ExportOutcome).gated!.nextStep}`
                        : ''
                    }`
                  : /* the server states whether the product is at fault —
                       a spent budget must never read as a broken feature */
                    `${(outcome as ExportOutcome).unavailable?.message ?? 'No export was produced.'}${
                      (outcome as ExportOutcome).unavailable?.productFailure === false
                        ? ' Nothing is broken — this is a budget limit, and it needs an account administrator.'
                        : ''
                    }`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
