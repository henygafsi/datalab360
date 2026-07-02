'use client';

/**
 * Release ▸ Step 3 — Impact: impacted objects, risk and cost signals.
 * Feeder (WIRED): POST /explore-design/{id}/impact-analysis/enhanced, run
 * per changed table (targets derived from the project's pending events).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Radar } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import EmptyState from '@/components/ui/EmptyState';
import { getProjectEvents } from '@/app/services/explore-design';
import { enhancedImpactAnalysis } from '@/app/services/api/exploreDesignApi';
import type { EnhancedImpactAnalysisResult } from '@/app/services/api/types';
import {
  ErrorNote,
  SkeletonRows,
  StepButton,
  StepSection,
  UnavailableNote,
  fmtCount,
} from './ui';

interface ImpactTarget {
  database: string;
  schema: string;
  table: string;
}

const RISK_CLASS: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  LOW: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

export default function StepImpact({ projectId }: { projectId: string }) {
  const [targets, setTargets] = useState<ImpactTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [results, setResults] = useState<Record<string, EnhancedImpactAnalysisResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { events } = await getProjectEvents(projectId);
      const seen = new Set<string>();
      const distinct: ImpactTarget[] = [];
      for (const e of events) {
        const t = e.target;
        if (!t?.database || !t.schema || !t.table) continue;
        const key = `${t.database}.${t.schema}.${t.table}`;
        if (seen.has(key)) continue;
        seen.add(key);
        distinct.push({ database: t.database, schema: t.schema, table: t.table });
      }
      setTargets(distinct);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const analyze = useCallback(
    async (t: ImpactTarget) => {
      const key = `${t.database}.${t.schema}.${t.table}`;
      setRunning(key);
      try {
        const result = await enhancedImpactAnalysis(projectId, {
          database: t.database,
          schema: t.schema,
          table: t.table,
        });
        setResults((prev) => ({ ...prev, [key]: result }));
      } catch (err) {
        if (isUnavailable(err)) setUnavailable(true);
        else toast.error(getApiErrorMessage(err));
      } finally {
        setRunning(null);
      }
    },
    [projectId],
  );

  return (
    <StepSection
      title="Impact"
      subtitle="Downstream objects, risk and cost impact of the changed tables"
    >
      {loading ? (
        <SkeletonRows rows={4} />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : targets.length === 0 ? (
        <EmptyState
          compact
          icon={Radar}
          title="No changed tables to analyze"
          description="Impact analysis runs against the tables touched by this release."
        />
      ) : (
        <div className="space-y-2">
          {unavailable && <UnavailableNote what="Enhanced impact analysis" />}
          {targets.map((t) => {
            const key = `${t.database}.${t.schema}.${t.table}`;
            const r = results[key];
            return (
              <div
                key={key}
                className="rounded-md border border-slate-200 p-2 dark:border-slate-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {key}
                  </span>
                  <StepButton
                    variant="primary"
                    onClick={() => analyze(t)}
                    disabled={running !== null || unavailable}
                    title={
                      unavailable
                        ? 'Enhanced impact analysis is not available yet on this environment'
                        : undefined
                    }
                  >
                    <Radar className="h-3 w-3" aria-hidden="true" />
                    {running === key ? 'Analyzing…' : r ? 'Re-analyze' : 'Analyze impact'}
                  </StepButton>
                </div>

                {r && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {fmtCount(r.total)} impacted
                      </span>
                      <span className={`rounded px-1.5 py-0.5 ${RISK_CLASS.HIGH}`}>
                        {fmtCount(r.high_risk)} high
                      </span>
                      <span className={`rounded px-1.5 py-0.5 ${RISK_CLASS.MEDIUM}`}>
                        {fmtCount(r.medium_risk)} medium
                      </span>
                      <span className={`rounded px-1.5 py-0.5 ${RISK_CLASS.LOW}`}>
                        {fmtCount(r.low_risk)} low
                      </span>
                      <span
                        className={
                          r.safe_to_proceed
                            ? 'font-medium text-emerald-600 dark:text-emerald-400'
                            : 'font-medium text-red-600 dark:text-red-400'
                        }
                      >
                        {r.safe_to_proceed ? 'Safe to proceed' : 'Review before proceeding'}
                      </span>
                    </div>
                    {r.access_warning && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        {r.access_warning}
                      </p>
                    )}
                    {r.impacts.length > 0 && (
                      <ul className="max-h-36 divide-y divide-slate-100 overflow-auto dark:divide-slate-700/60">
                        {r.impacts.slice(0, 10).map((imp, i) => (
                          <li
                            key={`${imp.object_name}-${i}`}
                            className="flex items-center justify-between gap-2 py-1 text-[11px]"
                          >
                            <span className="truncate text-slate-600 dark:text-slate-300">
                              {imp.object_type.toLowerCase()} · {imp.object_name} — {imp.reason}
                            </span>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${RISK_CLASS[imp.risk_level] ?? RISK_CLASS.LOW}`}
                            >
                              {imp.risk_level.toLowerCase()}
                            </span>
                          </li>
                        ))}
                        {r.impacts.length > 10 && (
                          <li className="py-1 text-[11px] text-slate-400 dark:text-slate-500">
                            +{r.impacts.length - 10} more
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </StepSection>
  );
}
