'use client';

/**
 * Release ▸ Step 7 — Recovery (only after deploy / on failure): previous
 * versions + version compare. Feeders (WIRED): GET /versions, GET
 * /versions/{from}/compare/{to}. Rollback / restore-checkpoint belong to the
 * /deployments/track/* spine which is NOT live yet → honest disabled gaps.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { GitCompareArrows, History, RotateCcw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import {
  compareVersions,
  listVersions,
  type Version,
} from '@/app/services/explore-design';
import {
  ErrorNote,
  SkeletonRows,
  StepButton,
  StepSection,
  fmtCount,
  relativeTime,
} from './ui';

type CompareResult = Awaited<ReturnType<typeof compareVersions>>;

export default function StepRecovery({ projectId }: { projectId: string }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [diff, setDiff] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { versions: list } = await listVersions(projectId);
      const sorted = [...(list ?? [])].sort(
        (a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0),
      );
      setVersions(sorted);
      if (sorted.length >= 2) {
        setToId((v) => v || sorted[0].version_id);
        setFromId((v) => v || sorted[1].version_id);
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const compare = useCallback(async () => {
    if (!fromId || !toId || fromId === toId) return;
    setComparing(true);
    setDiff(null);
    try {
      const result = await compareVersions(fromId, toId);
      setDiff(result);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setComparing(false);
    }
  }, [fromId, toId]);

  const selectClass =
    'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200';

  return (
    <StepSection
      title="Recovery"
      subtitle="Previous versions, comparisons and rollback options"
      actions={
        <>
          <StepButton
            disabled
            title="Rollback is not available yet on this environment"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Rollback
          </StepButton>
          <StepButton
            disabled
            title="Checkpoint restore is not available yet on this environment"
          >
            <History className="h-3 w-3" aria-hidden="true" />
            Restore checkpoint
          </StepButton>
        </>
      }
    >
      {loading ? (
        <SkeletonRows rows={4} />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : versions.length === 0 ? (
        <EmptyState
          compact
          icon={History}
          title="No versions yet"
          description="Versions are created when a release is deployed."
        />
      ) : (
        <div className="space-y-3">
          <ul className="max-h-32 divide-y divide-slate-100 overflow-auto rounded-md border border-slate-200 dark:divide-slate-700/60 dark:border-slate-700">
            {versions.slice(0, 8).map((v) => (
              <li key={v.version_id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                <span className="truncate text-slate-700 dark:text-slate-200">
                  <span className="font-medium">v{v.version}</span>
                  {v.changelog?.summary ? ` · ${v.changelog.summary}` : ''}
                </span>
                <span className="shrink-0 text-slate-400 dark:text-slate-500">
                  {v.status} · {relativeTime(v.created_at)}
                </span>
              </li>
            ))}
          </ul>

          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  From
                </span>
                <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={selectClass}>
                  {versions.map((v) => (
                    <option key={v.version_id} value={v.version_id}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  To
                </span>
                <select value={toId} onChange={(e) => setToId(e.target.value)} className={selectClass}>
                  {versions.map((v) => (
                    <option key={v.version_id} value={v.version_id}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <StepButton
              variant="primary"
              onClick={compare}
              disabled={comparing || !fromId || !toId || fromId === toId}
              title={fromId === toId ? 'Pick two different versions' : undefined}
              className="w-full justify-center"
            >
              <GitCompareArrows className="h-3 w-3" aria-hidden="true" />
              {comparing ? 'Comparing…' : 'Compare versions'}
            </StepButton>
          </div>

          {diff && (
            <div className="rounded-md border border-slate-200 p-2 text-[11px] dark:border-slate-700">
              <div className="mb-1 flex flex-wrap gap-1.5">
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {fmtCount(diff.diff.tables_added.length)} added
                </span>
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {fmtCount(diff.diff.tables_removed.length)} removed
                </span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {fmtCount(diff.diff.tables_modified.length)} modified
                </span>
              </div>
              {diff.diff.tables_modified.slice(0, 6).map((m) => (
                <p key={m.table} className="truncate text-slate-600 dark:text-slate-300">
                  {m.table}: {m.changes.length} change(s)
                </p>
              ))}
              {diff.diff.tables_added.length +
                diff.diff.tables_removed.length +
                diff.diff.tables_modified.length ===
                0 && (
                <p className="text-slate-500 dark:text-slate-400">
                  No differences between the selected versions.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </StepSection>
  );
}
