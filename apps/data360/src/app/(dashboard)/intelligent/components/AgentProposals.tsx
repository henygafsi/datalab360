'use client';

/**
 * AgentProposals — the agentic surface of Intelligent Analytics.
 *
 * Instead of a passive form: pick a project + state a goal, and the platform
 * PROPOSES 1-5 governed next actions grounded in the project's 360 context
 * (POST /cortex/agent/propose). Each proposal is a card carrying its
 * require_action gate + risk level:
 *   - coco_sql   → "Run" executes inline via the governed READ-ONLY coco path
 *                  (POST /cortex/coco/run-sql) and displays the rows here.
 *   - endpoint   → GETs fetch + display inline; mutating proposals hand the
 *                  intent to the chat (approval stays a human step).
 * Nothing executes without a click; nothing mutating executes here at all.
 */

import { useCallback, useState } from 'react';
import { PiArrowRight, PiCircleNotch, PiPlay, PiShieldCheck, PiSparkle } from 'react-icons/pi';

import apiClient from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  cocoRunSql,
  proposeAgentActions,
  type AgentProposeResult,
  type CocoRunResult,
  type ProposedAction,
} from '@/app/services/cortex';
import type { UnifiedProject } from '@/app/services/api/projectsApi';
import { useTrackEvent } from '@/hooks/useTrackEvent';

const RISK_TINT: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

interface RunState {
  running: boolean;
  result?: CocoRunResult;
  fetched?: unknown;
  error?: string;
}

export default function AgentProposals({
  projects,
  onHandOffToChat,
}: {
  projects: UnifiedProject[];
  onHandOffToChat: (prompt: string) => void;
}) {
  const { trackFeatureClick } = useTrackEvent();
  const [projectId, setProjectId] = useState<string>('');
  const [goal, setGoal] = useState('');
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<AgentProposeResult | null>(null);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<number, RunState>>({});

  const effectiveProject = projectId || projects[0]?.project_id || '';

  const propose = useCallback(async () => {
    if (!effectiveProject || !goal.trim()) return;
    setProposing(true);
    setProposeError(null);
    setProposal(null);
    setRuns({});
    trackFeatureClick('intelligent_agent_propose');
    try {
      const res = await proposeAgentActions(effectiveProject, goal.trim());
      setProposal(res);
      if (res.error) setProposeError(res.error);
    } catch (err) {
      setProposeError(err instanceof Error ? err.message : 'Proposal failed');
    } finally {
      setProposing(false);
    }
  }, [effectiveProject, goal, trackFeatureClick]);

  const runAction = useCallback(
    async (a: ProposedAction, i: number) => {
      setRuns((r) => ({ ...r, [i]: { running: true } }));
      trackFeatureClick(`intelligent_agent_run_${a.kind}`);
      try {
        if (a.kind === 'coco_sql' && a.sql) {
          const result = await cocoRunSql(a.sql, 50);
          setRuns((r) => ({ ...r, [i]: { running: false, result } }));
          return;
        }
        if (a.kind === 'endpoint' && a.endpoint && a.endpoint.method === 'GET') {
          const res = await apiClient.get(a.endpoint.path);
          setRuns((r) => ({ ...r, [i]: { running: false, fetched: res.data?.data ?? res.data } }));
          return;
        }
        // Mutating endpoint → hand the intent to the chat; approval is human.
        onHandOffToChat(
          `I want to: ${a.label}. Proposed call: ${a.endpoint?.method ?? ''} ${a.endpoint?.path ?? ''}. ` +
            `Walk me through the impact before I do it.`,
        );
        setRuns((r) => ({ ...r, [i]: { running: false } }));
      } catch (err) {
        setRuns((r) => ({
          ...r,
          [i]: { running: false, error: err instanceof Error ? err.message : 'failed' },
        }));
      }
    },
    [onHandOffToChat, trackFeatureClick],
  );

  return (
    <section aria-label="Agent proposals" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <PiSparkle className="h-3.5 w-3.5 text-purple" aria-hidden />
          Agent proposals
        </h3>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          governed next actions from your project&apos;s live context — nothing runs without your click
        </span>
      </div>

      {/* One line of input: project + goal + propose */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={effectiveProject}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 sm:w-56"
          aria-label="Project"
        >
          {projects.map((p) => (
            <option key={p.project_id} value={p.project_id}>{p.name}</option>
          ))}
        </select>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void propose()}
          placeholder="Your goal — e.g. improve data quality, cut warehouse cost, find duplicates…"
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="button"
          onClick={() => void propose()}
          disabled={proposing || !goal.trim() || !effectiveProject}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-purple px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {proposing ? <PiCircleNotch className="h-4 w-4 animate-spin" /> : <PiSparkle className="h-4 w-4" />}
          Propose
        </button>
      </div>

      {proposeError && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{proposeError}</p>
      )}
      {proposal?.context_summary && (
        <p className="mt-2 text-[11px] italic text-gray-400 dark:text-gray-500">{proposal.context_summary}</p>
      )}

      {/* Proposal cards */}
      {proposal && proposal.actions.length > 0 && (
        <ul className="mt-3 space-y-2">
          {proposal.actions.map((a, i) => {
            const run = runs[i];
            const runnable = (a.kind === 'coco_sql' && a.sql) ||
              (a.kind === 'endpoint' && a.endpoint?.method === 'GET');
            return (
              <li key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', RISK_TINT[a.risk ?? 'low'])}>
                    {a.risk ?? 'low'}
                  </span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{a.label}</span>
                  {a.requires && (
                    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      <PiShieldCheck className="h-3 w-3" />
                      {a.requires.module}·{a.requires.action}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void runAction(a, i)}
                    disabled={run?.running || Boolean(a._rejected)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-100 disabled:opacity-50 dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-800"
                  >
                    {run?.running ? <PiCircleNotch className="h-3 w-3 animate-spin" />
                      : runnable ? <PiPlay className="h-3 w-3" /> : <PiArrowRight className="h-3 w-3" />}
                    {runnable ? 'Run' : 'Discuss in chat'}
                  </button>
                </div>
                {a.rationale && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{a.rationale}</p>
                )}
                {a._rejected && (
                  <p className="mt-1 text-[11px] text-red-500">Blocked: {a._rejected}</p>
                )}
                {run?.error && (
                  <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{run.error}</p>
                )}
                {run?.result && (
                  <div className="mt-2 overflow-x-auto rounded-md bg-gray-50 p-2 dark:bg-gray-800/60">
                    <table className="min-w-full text-[11px]">
                      <thead>
                        <tr>{run.result.columns.map((c) => (
                          <th key={c} className="px-2 py-1 text-left font-semibold text-gray-500 dark:text-gray-400">{c}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {run.result.rows.slice(0, 8).map((row, ri) => (
                          <tr key={ri} className="border-t border-gray-100 dark:border-gray-700">
                            {run.result!.columns.map((c) => (
                              <td key={c} className="px-2 py-1 tabular-nums text-gray-700 dark:text-gray-300">{String(row[c] ?? '—')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-1 text-[10px] text-gray-400">{run.result.row_count} rows (read-only coco)</p>
                  </div>
                )}
                {run?.fetched != null && (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-gray-50 p-2 text-[11px] text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
                    {JSON.stringify(run.fetched, null, 1).slice(0, 1500)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
