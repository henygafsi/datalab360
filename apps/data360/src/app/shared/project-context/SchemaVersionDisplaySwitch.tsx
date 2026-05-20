'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  Clock,
  User,
  RotateCcw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Check,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSchemaVersions, rollbackSchema, type SchemaVersion } from '@/app/services/explore-design';
import { DeploymentUnavailableNote } from '@/app/(dashboard)/explore-design/components/DeploymentUnavailableNote';
import { toast } from 'react-hot-toast';

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    superseded: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    rolled_back: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', map[status] || 'bg-slate-100 text-slate-600')}>
      {status}
    </span>
  );
}

export interface SchemaVersionDisplaySwitchProps {
  projectId: string | null;
  onVersionChange?: () => void;
  /** Optional: call when user selects a version as target (e.g. for ingestion) */
  onSelectVersion?: (versionId: string, version: SchemaVersion) => void;
  /** Optional: currently selected version id (e.g. ingestion target) */
  selectedVersionId?: string | null;
  className?: string;
}

export function SchemaVersionDisplaySwitch({
  projectId,
  onVersionChange,
  onSelectVersion,
  selectedVersionId = null,
  className,
}: SchemaVersionDisplaySwitchProps) {
  const [versions, setVersions] = useState<SchemaVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<SchemaVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** Honest fetch outcome — distinguishes genuinely-empty from endpoint-failure. */
  const [availability, setAvailability] =
    useState<'ok' | 'empty' | 'unavailable'>('ok');
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  /**
   * Fetch versions. Accepts an AbortSignal so the StrictMode double-mount in
   * dev (which fired this twice → 4 network calls) aborts the stale request
   * instead of racing two responses into state.
   */
  const fetchVersions = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getSchemaVersions(projectId, { limit: 20, signal });
      if (signal?.aborted) return;
      setVersions(res.versions ?? []);
      setCurrentVersion(res.current_version ?? null);
      setAvailability(res.availability ?? (res.versions?.length ? 'ok' : 'empty'));
      setError(res.error ?? null);
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'CanceledError' || e?.name === 'AbortError') return;
      setAvailability('unavailable');
      setError(e?.message ?? 'Failed to load schema versions');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [projectId]);

  // One fetch per project selection. AbortController cancels the StrictMode
  // duplicate (and any stale in-flight request when projectId changes).
  useEffect(() => {
    const controller = new AbortController();
    fetchVersions(controller.signal);
    return () => controller.abort();
  }, [fetchVersions]);

  // Refresh when a deployment completes (StepVerify emits this event) so the
  // freshly created version appears without a manual reload.
  useEffect(() => {
    function onRefresh() { fetchVersions(); }
    window.addEventListener('explore-design:open-context-tab', onRefresh);
    return () => window.removeEventListener('explore-design:open-context-tab', onRefresh);
  }, [fetchVersions]);

  const handleRollback = async (versionId: string) => {
    if (!projectId) return;
    const ok = typeof window !== 'undefined' && window.confirm('Rollback to this schema version? This may affect existing data.');
    if (!ok) return;
    setRollingBackId(versionId);
    try {
      await rollbackSchema(versionId, { dry_run: false });
      toast.success('Schema rolled back');
      await fetchVersions();
      onVersionChange?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Rollback failed');
    } finally {
      setRollingBackId(null);
    }
  };

  if (!projectId) {
    return (
      <div className={cn('p-4 text-sm text-slate-500 dark:text-slate-400', className)}>
        Select a project to view schema versions.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn('p-4 flex items-center justify-center gap-2 text-slate-500', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading versions…
      </div>
    );
  }

  // Endpoint failed (400/404/500) — honest "unavailable" panel, NOT empty.
  if (availability === 'unavailable') {
    return (
      <div className={className}>
        <DeploymentUnavailableNote
          title="Version history is unavailable"
          description="The backend returned an error while loading schema versions. Your deployments may still have succeeded — check the History tab."
          endpoints={[
            { endpoint: 'GET /explore-design/{projectId}/versions', status: 'currently 400' },
            { endpoint: 'GET /explore-design/schema_versions/{projectId}', status: 'currently 404' },
          ]}
          error={error ?? undefined}
          onRetry={() => fetchVersions()}
          retrying={isLoading}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Current version */}
      {currentVersion && (
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-blue-50/50 dark:bg-blue-900/10">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="h-4 w-4 text-blue-500" />
            <span className="font-medium text-slate-800 dark:text-slate-200">
              Current: {currentVersion.version_name || `V${currentVersion.version_number}`}
            </span>
            {getStatusBadge(currentVersion.status)}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><User className="h-3 w-3" />{currentVersion.created_by}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(currentVersion.created_at)}</span>
          </div>
          {currentVersion.description && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{currentVersion.description}</p>
          )}
        </div>
      )}

      {/* Version list with display + switch */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
        {versions.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium text-slate-600 dark:text-slate-300">No versions yet</p>
            <p className="text-sm mt-1">Deploy a model to create the first version.</p>
          </div>
        ) : (
          versions.map((v) => {
            const isExpanded = expandedId === v.version_id;
            const isCurrent = v.status === 'active';
            const isSelected = selectedVersionId === v.version_id;

            return (
              <div
                key={v.version_id}
                className={cn(
                  'p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                  isCurrent && 'bg-blue-50/30 dark:bg-blue-900/10'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : v.version_id)}
                      className="flex items-center gap-2 w-full text-left"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {v.version_name || `V${v.version_number}`}
                      </span>
                      {getStatusBadge(v.status)}
                      {isSelected && <Check className="h-4 w-4 text-green-500 flex-shrink-0" />}
                    </button>
                    <div className="flex items-center gap-4 mt-1 ml-6 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{v.created_by}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(v.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {onSelectVersion && (
                      <button
                        type="button"
                        onClick={() => onSelectVersion(v.version_id, v)}
                        className={cn(
                          'px-2 py-1 text-xs rounded-lg transition-colors',
                          isSelected
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        )}
                      >
                        {isSelected ? 'Selected' : 'Use'}
                      </button>
                    )}
                    {v.can_rollback && !isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleRollback(v.version_id)}
                        disabled={rollingBackId === v.version_id}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {rollingBackId === v.version_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Rollback
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-3 ml-6 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs">
                    {v.description && <p className="text-slate-600 dark:text-slate-400 mb-2">{v.description}</p>}
                    <div className="text-slate-500">Version ID: <code className="font-mono text-slate-700 dark:text-slate-300">{v.version_id.slice(0, 16)}…</code></div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default SchemaVersionDisplaySwitch;
