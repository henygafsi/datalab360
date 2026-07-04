'use client';

/**
 * Release ▸ Step 1 — Changes: what will ship (tables/columns/relations).
 * Feeders (all WIRED): GET /deployment-readiness (change_diff),
 * GET project events (pending), GET /ddl-actions (SQL preview).
 * "Create checkpoint" has no backend route yet → honest disabled gap.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { FileCode2, Flag, ListChecks } from 'lucide-react';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { isUnavailable } from '@/lib/http-status';
import EmptyState from '@/components/ui/EmptyState';
import {
  getProjectEvents,
  type DesignEvent,
} from '@/app/services/explore-design';
import { listDDLActions } from '@/app/services/api/exploreDesignApi';
import type { DeploymentReadiness } from '../../hooks/useDeploymentReadiness';
import {
  ErrorNote,
  SkeletonRows,
  StepButton,
  StepSection,
  UnavailableNote,
  fmtCount,
} from './ui';

/** Pull "<key>: N" summary chips out of an arbitrary change_diff record. */
function diffSummary(diff: Record<string, unknown> | null | undefined): Array<{ label: string; count: number }> {
  if (!diff) return [];
  return Object.entries(diff)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => ({
      label: k.replace(/_/g, ' '),
      count: (v as unknown[]).length,
    }))
    .filter((e) => e.count > 0);
}

export default function StepChanges({ projectId }: { projectId: string }) {
  const [readiness, setReadiness] = useState<DeploymentReadiness | null>(null);
  const [events, setEvents] = useState<DesignEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const [showSql, setShowSql] = useState(false);
  const [sql, setSql] = useState<string | null>(null);
  const [sqlLoading, setSqlLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    const [readinessRes, eventsRes] = await Promise.allSettled([
      apiClient.get<DeploymentReadiness>(API.exploreDesign.deploymentReadiness(projectId)),
      getProjectEvents(projectId),
    ]);
    if (readinessRes.status === 'fulfilled') {
      setReadiness(readinessRes.value.data);
    } else if (isUnavailable(readinessRes.reason)) {
      setUnavailable(true);
    } else {
      setError(getApiErrorMessage(readinessRes.reason));
    }
    if (eventsRes.status === 'fulfilled') {
      setEvents(eventsRes.value.events ?? []);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSql = useCallback(async () => {
    if (showSql) {
      setShowSql(false);
      return;
    }
    setShowSql(true);
    if (sql !== null) return;
    setSqlLoading(true);
    try {
      const res = await listDDLActions(projectId);
      const text = (res.actions ?? [])
        .map((a) => a.ddl_sql)
        .filter(Boolean)
        .join('\n\n');
      setSql(text);
    } catch {
      setSql(''); // honest empty — the panel shows "no SQL yet"
    } finally {
      setSqlLoading(false);
    }
  }, [projectId, showSql, sql]);

  const pending = events.filter((e) => e.status === 'pending');
  const chips = diffSummary(readiness?.change_diff);

  return (
    <StepSection
      title="Changes"
      subtitle="What this release will change"
      actions={
        <>
          <StepButton onClick={toggleSql} aria-expanded={showSql}>
            <FileCode2 className="h-3 w-3" aria-hidden="true" />
            {showSql ? 'Hide SQL diff' : 'Open SQL diff'}
          </StepButton>
          <StepButton
            disabled
            title="Checkpoints are not available yet on this environment"
          >
            <Flag className="h-3 w-3" aria-hidden="true" />
            Create checkpoint
          </StepButton>
        </>
      }
    >
      {loading ? (
        <SkeletonRows rows={4} />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <div className="space-y-3">
          {unavailable && <UnavailableNote what="Change diff (deployment readiness)" />}

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span
                  key={c.label}
                  className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium capitalize text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                >
                  {c.label}: {fmtCount(c.count)}
                </span>
              ))}
            </div>
          )}

          {pending.length === 0 && chips.length === 0 ? (
            <EmptyState
              compact
              icon={ListChecks}
              title="No pending changes"
              description="Model changes made on the canvas will appear here before release."
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {pending.slice(0, 12).map((e) => (
                <li key={e.event_id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="truncate text-[11px] text-slate-700 dark:text-slate-200">
                    <span className="font-medium">{e.event_type}</span>
                    {' · '}
                    {e.target?.database}.{e.target?.schema}.{e.target?.table}
                    {e.target?.column ? `.${e.target.column}` : ''}
                  </span>
                  <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    pending
                  </span>
                </li>
              ))}
              {pending.length > 12 && (
                <li className="py-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  +{pending.length - 12} more pending change{pending.length - 12 > 1 ? 's' : ''}
                </li>
              )}
            </ul>
          )}

          {showSql && (
            <div className="rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
              {sqlLoading ? (
                <div className="p-2">
                  <SkeletonRows rows={3} />
                </div>
              ) : sql ? (
                <pre className="max-h-48 overflow-auto p-2 text-[10px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {sql}
                </pre>
              ) : (
                <p className="p-2 text-[11px] text-slate-500 dark:text-slate-400">
                  No generated SQL for this release yet.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </StepSection>
  );
}
