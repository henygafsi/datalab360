'use client';

/**
 * DeploymentSteps — the dynamic, per-project-type deployment pipeline for the
 * context right-bar.
 *
 * Every step is a REAL backend call (contracts verified live against the
 * seeded retail template — see backend seeds/modeling_step_actionlog.retail.json):
 * run it, see the actual response summarized as text, and every run is logged
 * as a replayable JSON action to POST /projects/{id}/events
 * (event_type=STEP_ACTION, details={step, method, path, body, status, ms}) —
 * so any step can be re-executed from its endpoint later.
 *
 * Steps never auto-run. Mutating steps are labeled; read/simulate steps are
 * the default path (dry-run → checks → readiness → diff → impact → request).
 */

import { useCallback, useState } from 'react';
import { PiArrowClockwise, PiCheckCircle, PiCircleNotch, PiPlay, PiWarningCircle } from 'react-icons/pi';

import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export interface StepDef {
  key: string;
  label: string;
  /** What the step verifies/produces — shown under the label. */
  caption: string;
  method: 'GET' | 'POST';
  path: (projectId: string) => string;
  body?: (projectId: string) => Record<string, unknown>;
  mutating?: boolean;
  /** Turn the raw response into one honest sentence for the UI. */
  summarize: (resp: any) => string;
}

const n = (v: unknown) => (typeof v === 'number' ? v : 0);

/** Explore & Design pipeline — contracts verified live on RETAIL_DW. */
const EXPLORE_STEPS: StepDef[] = [
  {
    key: 'dry_run', label: 'Dry-run', caption: 'Simulate pending DDL without touching the warehouse',
    method: 'POST', path: (id) => `/explore-design/${id}/dry-run`, body: () => ({}),
    summarize: (r) => r?.message || `${n(r?.passed)}/${n(r?.total_events)} events pass (${n(r?.failed)} failing)`,
  },
  {
    key: 'pre_checks', label: 'Pre-deploy checks', caption: 'Warehouse, FK types, circular deps, naming, drift',
    method: 'POST', path: (id) => `/explore-design/${id}/pre-deploy-checks`, body: () => ({}),
    summarize: (r) => {
      const checks = Array.isArray(r?.checks) ? r.checks : [];
      const fail = checks.filter((c: any) => c.status === 'FAIL');
      return fail.length === 0
        ? `${checks.length} checks pass`
        : `${fail.length}/${checks.length} FAIL — ${fail.map((c: any) => c.details).join('; ').slice(0, 140)}`;
    },
  },
  {
    key: 'conflict', label: 'Conflict check', caption: 'Other projects touching the same objects',
    method: 'POST', path: (id) => `/explore-design/${id}/conflict-check`, body: () => ({}),
    summarize: (r) => r?.has_blocking_conflicts
      ? `BLOCKING conflicts: ${(r?.conflicts ?? []).length}`
      : `No blocking conflicts (${n(r?.total_checked)} checked)`,
  },
  {
    key: 'readiness', label: 'Readiness', caption: 'Version, change diff and lineage impact in one read',
    method: 'GET', path: (id) => `/explore-design/${id}/deployment-readiness`,
    summarize: (r) => r?.current_version_id
      ? `Version ${r.current_version_id}${r?.last_deployed_version_id ? ` (last deployed ${r.last_deployed_version_id})` : ' — never deployed'}`
      : 'No version yet',
  },
  {
    key: 'request', label: 'Request deployment', caption: 'Files the governed request (approval required)',
    method: 'POST', path: (id) => `/projects/${id}/deployments`,
    body: () => ({ module: 'explore_design', description: 'Requested from the context right-bar' }),
    mutating: true,
    summarize: (r) => r?.deployment_id ? `Filed ${r.deployment_id} (${r?.deployment_type ?? 'with_approval'})` : 'Request filed',
  },
];

/** Workflow pipeline — build gates before any deploy request. */
const WORKFLOW_STEPS: StepDef[] = [
  {
    key: 'compile', label: 'Compile', caption: 'Blocks → SQL, no execution',
    method: 'POST', path: (id) => `/workflow/${id}/compile`, body: () => ({}),
    summarize: (r) => r?.sql ? 'Compiled to SQL' : (r?.message || 'Compiled'),
  },
  {
    key: 'validate', label: 'Validate', caption: 'Block config + graph validity',
    method: 'POST', path: (id) => `/workflow/${id}/validate`, body: () => ({}),
    summarize: (r) => (r?.valid === false ? `Invalid — ${(r?.errors ?? []).length} errors` : 'Valid'),
  },
  {
    key: 'dry_run', label: 'Dry-run', caption: 'Execute plan without warehouse writes',
    method: 'POST', path: (id) => `/workflow/${id}/dry-run`, body: () => ({}),
    summarize: (r) => r?.message || 'Dry-run complete',
  },
  {
    key: 'pre_check', label: 'Pre-check', caption: 'Sources, targets and privileges reachable',
    method: 'POST', path: (id) => `/workflow/${id}/pre-check`, body: () => ({}),
    summarize: (r) => r?.message || 'Pre-check complete',
  },
  {
    key: 'request', label: 'Request deployment', caption: 'Files the governed request (approval required)',
    method: 'POST', path: (id) => `/projects/${id}/deployments`,
    body: () => ({ module: 'workflow', description: 'Requested from the context right-bar' }),
    mutating: true,
    summarize: (r) => r?.deployment_id ? `Filed ${r.deployment_id}` : 'Request filed',
  },
];

/** BI pipeline — snapshot then publish/share happen in the editor. */
const BI_STEPS: StepDef[] = [
  {
    key: 'status', label: 'Publish status', caption: 'Current publication + shares',
    method: 'GET', path: (id) => `/bi-dashboard/${id}/status`,
    summarize: (r) => (r?.published ? 'Published' : 'Not published'),
  },
  {
    key: 'snapshot', label: 'Snapshot', caption: 'Freeze the current design as a version',
    method: 'POST', path: (id) => `/bi-dashboard/${id}/snapshot`, body: () => ({}), mutating: true,
    summarize: (r) => r?.snapshot_id ? `Snapshot ${r.snapshot_id}` : 'Snapshot created',
  },
];

const STEPS_BY_TYPE: Record<string, StepDef[]> = {
  explore_design: EXPLORE_STEPS,
  workflow: WORKFLOW_STEPS,
  bi_dashboard: BI_STEPS,
};

interface StepState {
  running: boolean;
  ok?: boolean;
  summary?: string;
  status?: number;
}

async function logStepAction(projectId: string, entry: Record<string, unknown>) {
  // Replayable JSON trail — best-effort, never blocks the step itself.
  try {
    await apiClient.post(`/projects/${projectId}/events`, {
      module_name: 'PROJECT',
      event_type: 'STEP_ACTION',
      status: (entry.status as number) < 400 ? 'SUCCESS' : 'FAILED',
      details: entry,
    });
  } catch {
    /* trail is additive */
  }
}

export default function DeploymentSteps({
  projectId,
  projectType,
}: {
  projectId: string | null;
  projectType: string;
}) {
  const steps = STEPS_BY_TYPE[(projectType || '').toLowerCase()] ?? EXPLORE_STEPS;
  const [states, setStates] = useState<Record<string, StepState>>({});

  const runStep = useCallback(
    async (s: StepDef) => {
      if (!projectId) return;
      setStates((st) => ({ ...st, [s.key]: { running: true } }));
      const path = s.path(projectId);
      const body = s.body?.(projectId);
      const t0 = performance.now();
      try {
        const res = s.method === 'GET'
          ? await apiClient.get(path)
          : await apiClient.post(path, body ?? {});
        const data = res.data?.data ?? res.data;
        const summary = s.summarize(data);
        setStates((st) => ({ ...st, [s.key]: { running: false, ok: true, summary, status: res.status } }));
        void logStepAction(projectId, {
          step: s.key, method: s.method, path, body: body ?? null,
          status: res.status, ms: Math.round(performance.now() - t0), summary,
        });
      } catch (err) {
        const summary = getApiErrorMessage(err);
        const status = (err as any)?.response?.status ?? 0;
        setStates((st) => ({ ...st, [s.key]: { running: false, ok: false, summary, status } }));
        void logStepAction(projectId, {
          step: s.key, method: s.method, path, body: body ?? null,
          status, ms: Math.round(performance.now() - t0), summary,
        });
      }
    },
    [projectId],
  );

  if (!projectId) {
    return <p className="p-4 text-sm text-slate-500">Select a project to see its deployment pipeline.</p>;
  }

  return (
    <div className="p-3">
      <p className="mb-2 px-1 text-[11px] text-slate-400 dark:text-slate-500">
        Each step calls the real endpoint and shows the actual response — every run is logged as a
        replayable JSON action on this project.
      </p>
      <ol className="space-y-1.5">
        {steps.map((s, i) => {
          const st = states[s.key];
          return (
            <li key={s.key} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="w-4 text-right font-mono text-[10px] text-slate-400">{i + 1}</span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.label}</span>
                {s.mutating && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    governed write
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void runStep(s)}
                  disabled={st?.running}
                  className="ml-auto inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-100 disabled:opacity-50 dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-800"
                >
                  {st?.running ? <PiCircleNotch className="h-3 w-3 animate-spin" />
                    : st?.ok != null ? <PiArrowClockwise className="h-3 w-3" />
                    : <PiPlay className="h-3 w-3" />}
                  {st?.ok != null ? 'Re-run' : 'Run'}
                </button>
              </div>
              <p className="ml-6 mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{s.caption}</p>
              {st?.summary && (
                <p className={cn('ml-6 mt-1 flex items-start gap-1 text-xs',
                  st.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                  {st.ok ? <PiCheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <PiWarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>{st.summary}</span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
