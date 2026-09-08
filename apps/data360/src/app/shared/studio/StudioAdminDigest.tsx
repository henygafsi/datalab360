'use client';

/**
 * StudioAdminDigest — D-1: the account's applications and, per application,
 * the operational truth (endpoints, generation, SQL query_ids, executions,
 * errors, tests, consumption) — consumed from the consolidated admin
 * contract, NOT a new monitoring page. Display GETs are not audited
 * (the contract says so); mutations and executions are.
 */

import { cleanName } from '@/app/shared/studio/StudioAppsHome';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import {
  getAdminStudioApp,
  getAdminStudioApps,
  type AdminAppDetail,
  type StudioDraftSummary,
} from '@/app/services/studio/studio-api';
import { routes } from '@/config/routes';

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const n = (v: unknown): string =>
  typeof v === 'number' ? v.toLocaleString() : v == null ? '—' : String(v).slice(0, 24);

export default function StudioAdminDigest() {
  const [apps, setApps] = useState<StudioDraftSummary[] | 'loading' | 'error'>('loading');
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminAppDetail | 'loading' | 'error' | null>(null);

  const load = useCallback(async () => {
    try {
      setApps(await getAdminStudioApps());
    } catch {
      setApps('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return setDetail(null);
    setDetail('loading');
    getAdminStudioApp(open)
      .then(setDetail)
      .catch(() => setDetail('error'));
  }, [open]);

  if (apps === 'loading')
    return <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;
  if (apps === 'error')
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        The account digest needs the product ACCOUNTADMIN — your role sees its own applications
        above.
      </p>
    );

  const d = typeof detail === 'object' && detail !== null ? detail : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Account applications — operational truth
      </h3>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        Every application of the account, linked to its endpoints, generations, SQL proofs,
        executions, errors, tests and consumption. Display reads are not audited; mutations and
        executions are.
      </p>
      <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <tr>
              <th className="px-2 py-1 font-medium">Application</th>
              <th className="px-2 py-1 font-medium">By</th>
              <th className="px-2 py-1 font-medium">Step</th>
              <th className="px-2 py-1 font-medium">Report</th>
              <th className="px-2 py-1 font-medium">Version</th>
              <th className="px-2 py-1 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {apps.map((a) => (
              <tr
                key={a.draft_id}
                onClick={() => setOpen((o) => (o === a.draft_id ? null : a.draft_id))}
                className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 ${open === a.draft_id ? 'bg-accent-50/50 dark:bg-accent-900/10' : ''}`}
              >
                <td className="max-w-[260px] truncate px-2 py-1 font-medium text-slate-800 dark:text-slate-200">
                  {cleanName(a as never)}
                </td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{String(a.created_by ?? '—')}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">
                  {String(a.step ?? '—').replace(/_/g, ' ')}
                </td>
                <td className="px-2 py-1">{a.has_report ? '✓' : '—'}</td>
                <td className="px-2 py-1 tabular-nums">
                  {a.active_version != null ? `v${a.active_version}` : 'draft'}
                </td>
                <td className="px-2 py-1 text-slate-400 dark:text-slate-500">{fmtDate(a.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
          {detail === 'loading' ? (
            <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <RefreshCw aria-hidden className="h-3 w-3 animate-spin" /> reading the operational
              truth…
            </p>
          ) : detail === 'error' ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This detail needs the product ACCOUNTADMIN.
            </p>
          ) : d ? (
            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <p className="flex flex-wrap gap-x-4 gap-y-0.5">
                <span>
                  generations:{' '}
                  {n(
                    (d.generation as { total?: number } | undefined)?.total ??
                      Object.values(
                        (d.generation as { by_kind?: Record<string, number> } | undefined)
                          ?.by_kind ?? {},
                      ).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0),
                  )}
                </span>
                <span>job runs: {n((d.tests as { job_runs?: number } | undefined)?.job_runs)}</span>
                <span>workflow tests: {n((d.tests as { workflow_test_runs?: number } | undefined)?.workflow_test_runs)}</span>
                <span>DLQ open: {n((d.errors as { dlq_open_records?: number } | undefined)?.dlq_open_records)}</span>
                <span>failed runs: {n((d.errors as { failed_runs?: number } | undefined)?.failed_runs)}</span>
              </p>
              <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400 dark:text-slate-500">
                <span>
                  sql proofs: {n(((d.sql as { job_run_query_ids?: unknown[] } | undefined)?.job_run_query_ids ?? []).length)} job ·{' '}
                  {n(((d.sql as { workflow_test_query_ids?: unknown[] } | undefined)?.workflow_test_query_ids ?? []).length)} workflow ·{' '}
                  {n(((d.sql as { access_apply_query_ids?: unknown[] } | undefined)?.access_apply_query_ids ?? []).length)} access
                </span>
                {typeof (d.digest as { note?: string } | undefined)?.note === 'string' && (
                  <span>{(d.digest as { note?: string }).note}</span>
                )}
              </p>
              <p className="flex flex-wrap gap-3">
                <Link href={routes.studioApp(open)} className="text-xs text-accent-600 hover:underline dark:text-accent-400">
                  Open the application
                </Link>
                <Link href={`${routes.studioApp(open)}?view=quality`} className="text-xs text-accent-600 hover:underline dark:text-accent-400">
                  Quality
                </Link>
                <Link href={`${routes.studioApp(open)}?view=jobs`} className="text-xs text-accent-600 hover:underline dark:text-accent-400">
                  Jobs & workflows
                </Link>
              </p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
