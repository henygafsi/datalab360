'use client';

/**
 * RollbackVersionDialog — select a version, preview the diff, roll back.
 * Uses POST /projects/{id}/rollback (projectsApi).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  History,
  Clock,
  User,
  GitBranch,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import * as workflowApi from '@/app/services/api/workflowApi';
import * as projectsApi from '@/app/services/api/projectsApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { WorkflowVersion } from '@/app/services/api/types';

interface RollbackVersionDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  workflowId: string | null;
  workflowName: string;
  /** Called after a successful rollback so the canvas can refresh. */
  onRolledBack?: () => void;
}

// ----- helpers --------------------------------------------------------------

function relativeFromNow(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function extractStepNames(version: WorkflowVersion | null): string[] {
  if (!version) return [];
  const steps = version.definition?.steps;
  if (!Array.isArray(steps)) return [];
  return steps.map((s, i) => {
    if (s && typeof s === 'object') {
      const obj = s as Record<string, unknown>;
      const name =
        (typeof obj.step_name === 'string' && obj.step_name) ||
        (typeof obj.name === 'string' && obj.name) ||
        (typeof obj.action_type === 'string' && obj.action_type) ||
        '';
      return name || `step ${i + 1}`;
    }
    return `step ${i + 1}`;
  });
}

// ----- component ------------------------------------------------------------

const RollbackVersionDialog: React.FC<RollbackVersionDialogProps> = ({
  open,
  onOpenChange,
  workflowId,
  workflowName,
  onRolledBack,
}) => {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const fetchFn = useCallback(
    () =>
      workflowId
        ? workflowApi.listVersions(workflowId, { limit: 10 })
        : Promise.resolve({ versions: [], count: 0 }),
    [workflowId],
  );

  const { data, loading, error } = useCacheAwareQuery(fetchFn, {
    cacheKeys: [CACHE_KEYS.WORKFLOWS],
    enabled: !!workflowId && open,
    initialData: null,
  });

  const versions: WorkflowVersion[] = useMemo(
    () => data?.versions ?? [],
    [data],
  );
  // Current = highest version_number (versions API typically returns newest
  // first, but sort defensively to be safe).
  const currentVersion = useMemo(() => {
    if (versions.length === 0) return null;
    return [...versions].sort(
      (a, b) => (b.version_number ?? 0) - (a.version_number ?? 0),
    )[0];
  }, [versions]);

  const selectedVersion = useMemo(
    () => versions.find((v) => v.version_id === selectedVersionId) ?? null,
    [versions, selectedVersionId],
  );

  // ---- Diff vs. current --------------------------------------------------
  const diff = useMemo(() => {
    if (!selectedVersion || !currentVersion) return null;
    const currentNames = extractStepNames(currentVersion);
    const targetNames = extractStepNames(selectedVersion);

    const currentSet = new Set(currentNames);
    const targetSet = new Set(targetNames);
    const added = targetNames.filter((n) => !currentSet.has(n));
    const removed = currentNames.filter((n) => !targetSet.has(n));

    // Prefer typed changes_summary when available, otherwise compute counts.
    const targetCount =
      selectedVersion.changes_summary?.steps_count ?? targetNames.length;
    const currentCount =
      currentVersion.changes_summary?.steps_count ?? currentNames.length;

    return {
      currentCount,
      targetCount,
      delta: targetCount - currentCount,
      added,
      removed,
    };
  }, [selectedVersion, currentVersion]);

  // ---- Reset selection when dialog closes --------------------------------
  useEffect(() => {
    if (!open) {
      setSelectedVersionId(null);
    }
  }, [open]);

  // ---- Close on Escape — keyboard parity for the backdrop-less drawer ----
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  // ---- Confirm rollback --------------------------------------------------
  const handleConfirmRollback = useCallback(async () => {
    if (!workflowId || !selectedVersion) return;
    setIsRollingBack(true);
    try {
      await projectsApi.rollbackVersion(workflowId, {
        target_version_id: selectedVersion.version_id,
      });
      toast.success(`Rolled back to v${selectedVersion.version_number}`);
      onOpenChange(false);
      onRolledBack?.();
    } catch (err) {
      console.error('Rollback failed:', err);
      toast.error(getApiErrorMessage(err) || 'Failed to roll back workflow');
    } finally {
      setIsRollingBack(false);
    }
  }, [workflowId, selectedVersion, onOpenChange, onRolledBack]);

  // ---- Render ------------------------------------------------------------
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex bg-slate-900/40"
      onClick={() => onOpenChange(false)}
      aria-hidden="true"
    >
    <aside
      role="dialog"
      aria-modal="true"
      aria-label="Roll back workflow"
      onClick={(e) => e.stopPropagation()}
      className="ml-auto flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <History className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Roll back workflow
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Pick one of the last 10 versions. We&apos;ll show a diff against
              the current version before you commit the change.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Loading / error / empty */}
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Failed to load versions. Try closing and reopening this dialog.</span>
            </div>
          )}

          {!loading && !error && versions.length === 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
              No versions found for this workflow yet.
            </div>
          )}

          {/* Version list */}
          {!loading && versions.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* List */}
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {versions.map((v) => {
                  const isCurrent = v.version_id === currentVersion?.version_id;
                  const isSelected = v.version_id === selectedVersionId;
                  return (
                    <button
                      key={v.version_id}
                      type="button"
                      onClick={() => setSelectedVersionId(v.version_id)}
                      disabled={isCurrent}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        isSelected
                          ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/60',
                        isCurrent && 'opacity-60',
                      )}
                      aria-pressed={isSelected}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-3.5 w-3.5 text-slate-500" />
                          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                            v{v.version_number}
                          </span>
                          {isCurrent && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">
                              current
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {relativeFromNow(v.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <User className="h-3 w-3" />
                        <span className="truncate">{v.created_by || '—'}</span>
                      </div>
                      {(v.description || v.version_name) && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">
                          {v.version_name ?? v.description}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Diff preview */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                {!selectedVersion ? (
                  <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                    <ArrowRight className="mb-2 h-5 w-5 text-slate-300 dark:text-slate-600" />
                    <p className="text-xs text-slate-500">
                      Select a version to preview the diff.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">
                        Target
                      </p>
                      <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                        v{selectedVersion.version_number}
                        {selectedVersion.version_name
                          ? ` — ${selectedVersion.version_name}`
                          : ''}
                      </p>
                    </div>

                    {diff && (
                      <>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500">Steps:</span>
                          <span className="font-mono text-slate-700 dark:text-slate-200">
                            {diff.currentCount}
                          </span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                          <span className="font-mono text-slate-700 dark:text-slate-200">
                            {diff.targetCount}
                          </span>
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                              diff.delta === 0
                                ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                                : diff.delta > 0
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                            )}
                          >
                            {diff.delta > 0 ? `+${diff.delta}` : diff.delta}
                          </span>
                        </div>

                        {diff.added.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                              + Added
                            </p>
                            <ul className="mt-1 space-y-0.5 text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
                              {diff.added.slice(0, 6).map((name) => (
                                <li key={`a-${name}`}>+ {name}</li>
                              ))}
                              {diff.added.length > 6 && (
                                <li className="opacity-60">
                                  +{diff.added.length - 6} more…
                                </li>
                              )}
                            </ul>
                          </div>
                        )}

                        {diff.removed.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                              − Removed
                            </p>
                            <ul className="mt-1 space-y-0.5 text-[11px] font-mono text-amber-700 dark:text-amber-300">
                              {diff.removed.slice(0, 6).map((name) => (
                                <li key={`r-${name}`}>− {name}</li>
                              ))}
                              {diff.removed.length > 6 && (
                                <li className="opacity-60">
                                  +{diff.removed.length - 6} more…
                                </li>
                              )}
                            </ul>
                          </div>
                        )}

                        {diff.added.length === 0 &&
                          diff.removed.length === 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
                              Step names unchanged — only metadata or step
                              configs may differ.
                            </div>
                          )}
                      </>
                    )}

                    {selectedVersion.created_at && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock className="h-3 w-3" />
                        Created {relativeFromNow(selectedVersion.created_at)} by{' '}
                        {selectedVersion.created_by}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
      </div>

      {/* Footer actions */}
      {!loading && versions.length > 0 && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRollback}
                disabled={!selectedVersion || selectedVersion.version_id === currentVersion?.version_id || isRollingBack}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {isRollingBack ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <History className="h-4 w-4" />
                )}
                {isRollingBack ? 'Rolling back…' : 'Roll back'}
              </button>
        </div>
      )}
    </aside>
    </div>,
    document.body,
  );
};

export default RollbackVersionDialog;
// Re-export refetch helper for callers that want to invalidate the list
// (currently not exposed — kept private to this file).
export { type RollbackVersionDialogProps };
