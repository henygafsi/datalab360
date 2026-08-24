'use client';

/**
 * Agentic OS — RIGHT rail: human validation + honest capability map.
 *
 * Top: the approval queue — every mutating proposal parked by the discussion.
 * "Approve & discuss" hands the item to the embedded validation chat (the
 * proven human-approval surface) via the canvas hand-off event; nothing
 * mutating executes from this rail directly.
 * Bottom: what THIS step can and cannot do — folded from the step's module
 * action-catalog (ready / needs-validation / unverified), rbac gate shown as a
 * chip. Denied or unverified actions are visible and labeled, never hidden.
 */
import { useCallback, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Badge, Button, Input } from 'rizzui';
import {
  PiShieldCheck,
  PiCheckCircle,
  PiHandPalm,
  PiMagnifyingGlass,
  PiRocketLaunch,
  PiRobot,
  PiWarningCircle,
  PiX,
} from 'react-icons/pi';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { listDeployments } from '@/app/services/api/exploreDesignApi';
import type { ExploreDeployment } from '@/app/services/api/types';
import { STAGE_META } from './types';
import type { StageCapability } from './types';
import {
  activeProjectIdAtom,
  activeStageAtom,
  approvalsAtom,
  groundingTablesAtom,
  projectsAtom,
  touchedStagesAtom,
} from './store';
import { useCapabilityMap } from './useCapabilityMap';

const RISK_TINT: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function gateLabel(rbac: string): string {
  if (!rbac) return 'view';
  if (rbac.startsWith('module:')) return 'view';
  const slash = rbac.indexOf('/');
  return slash >= 0 ? rbac.slice(slash + 1) : rbac;
}

function CapabilityRow({ c }: { c: StageCapability }) {
  return (
    <li className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {c.verdict === 'ready' ? (
          <PiCheckCircle className="h-3.5 w-3.5 text-emerald-500" />
        ) : c.verdict === 'gated' ? (
          <PiHandPalm className="h-3.5 w-3.5 text-amber-500" />
        ) : (
          <PiWarningCircle className="h-3.5 w-3.5 text-gray-400" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-gray-700 dark:text-gray-200" title={c.why}>
          {c.label}
        </span>
        <span className="text-[10px] text-gray-400">
          {c.verdict === 'ready'
            ? 'runs inline'
            : c.verdict === 'gated'
              ? 'needs your validation'
              : 'contract not verified'}
        </span>
      </span>
      <Badge variant="outline" size="sm" className="shrink-0 text-[10px]">
        {gateLabel(c.rbac)}
      </Badge>
    </li>
  );
}

const DEPLOY_TONE: Record<string, string> = {
  completed: 'text-emerald-600 dark:text-emerald-400',
  active: 'text-emerald-600 dark:text-emerald-400',
  approved: 'text-emerald-600 dark:text-emerald-400',
  pending: 'text-amber-600 dark:text-amber-400',
  awaiting_approval: 'text-amber-600 dark:text-amber-400',
  scheduled: 'text-amber-600 dark:text-amber-400',
  failed: 'text-red-600 dark:text-red-400',
  rejected: 'text-gray-400',
};

const STAGE_ORDER_7 = [
  'sources',
  'models',
  'ingestion',
  'workflow',
  'dashboards',
  'questions',
  'dependencies',
] as const;

export default function ValidationRail() {
  const stage = useAtomValue(activeStageAtom);
  const [approvals, setApprovals] = useAtom(approvalsAtom);
  const projectId = useAtomValue(activeProjectIdAtom);
  const grounding = useAtomValue(groundingTablesAtom);
  const touched = useAtomValue(touchedStagesAtom);
  const projects = useAtomValue(projectsAtom);
  const caps = useCapabilityMap(stage);
  const [q, setQ] = useState('');

  // AI Agent header (WAW): what's understood + next actions + progress.
  const doneCount = STAGE_ORDER_7.filter((s) => touched[s] === 'done').length;
  const progressPct = Math.round((doneCount / STAGE_ORDER_7.length) * 100);
  const projectName = projects.find((p) => p.project_id === projectId)?.name ?? null;
  const understood = projectName
    ? `Working on ${projectName}${grounding.length ? ` · ${grounding.length} table${grounding.length === 1 ? '' : 's'} grounded` : ''}.`
    : grounding.length
      ? `Grounded on ${grounding.length} table${grounding.length === 1 ? '' : 's'} — ready to model, chart or question them.`
      : 'Tell me your objective or pick tables — I ground on your data and build from there.';
  const nextActions = projectName
    ? ['Propose a star model (Models)', 'Generate a dashboard (Dashboards)', 'Draft the pipeline (Workflow)']
    : grounding.length
      ? ['Ask a question on the selection', 'Chart it (Dashboards)', 'Build a product from it']
      : ['Pick tables in the left rail', 'Or ask "what products can I build?"', 'Or "assess my account"'];

  // Live deployment follow-up for the active project (SSE-refreshed) — the
  // discussion's outputs are projects, and their deploys are tracked here.
  const fetchDeployments = useCallback(
    () =>
      projectId
        ? listDeployments(projectId).then((r) => {
            // The route may answer flat ({deployments}) or enveloped
            // ({data:{deployments}}) — normalize to a real array, always.
            const raw = r as unknown as {
              deployments?: unknown;
              data?: { deployments?: unknown };
            };
            if (Array.isArray(r)) return r as ExploreDeployment[];
            if (Array.isArray(raw.deployments)) return raw.deployments as ExploreDeployment[];
            if (Array.isArray(raw.data?.deployments))
              return raw.data.deployments as ExploreDeployment[];
            return [] as ExploreDeployment[];
          })
        : Promise.resolve([] as ExploreDeployment[]),
    [projectId],
  );
  const deploymentsQ = useCacheAwareQuery<ExploreDeployment[]>(fetchDeployments, {
    cacheKeys: [CACHE_KEYS.DEPLOYMENTS],
    initialData: [],
    enabled: Boolean(projectId),
  });
  const deployments = Array.isArray(deploymentsQ.data) ? deploymentsQ.data : [];

  const pending = approvals.filter((a) => a.status === 'pending');
  const filter = (list: StageCapability[]) =>
    q.trim()
      ? list.filter(
          (c) =>
            c.label.toLowerCase().includes(q.toLowerCase()) ||
            c.why.toLowerCase().includes(q.toLowerCase()),
        )
      : list;

  const approve = (id: string) => {
    const item = approvals.find((a) => a.id === id);
    if (!item) return;
    window.dispatchEvent(
      new CustomEvent('agentic-os:handoff', { detail: { text: item.prompt } }),
    );
    setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'sent' } : a)));
  };

  const dismiss = (id: string) => {
    setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'dismissed' } : a)));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* AI Agent header — WAW: online, understood, next actions, progress */}
      <section
        aria-label="AI Agent"
        className="shrink-0 border-b border-gray-200 px-2 pb-2.5 pt-1 dark:border-gray-700"
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PiRobot className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI Agent</span>
          <span className="flex items-center gap-1 text-[10px] text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> Online
          </span>
        </div>
        <p className="rounded-md bg-primary/[0.04] px-2 py-1.5 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
          <span className="font-medium text-gray-700 dark:text-gray-200">Understood · </span>
          {understood}
        </p>
        <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Next actions
        </p>
        <ol className="mt-0.5 space-y-0.5">
          {nextActions.map((a, i) => (
            <li key={a} className="flex items-start gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
              <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[8px] font-semibold text-gray-500 dark:bg-gray-800">
                {i + 1}
              </span>
              <span className="min-w-0">{a}</span>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] text-gray-400">
            {doneCount} of {STAGE_ORDER_7.length} · {progressPct}%
          </span>
        </div>
      </section>

      {/* Approval queue */}
      <section aria-label="Pending validations" className="shrink-0 border-b border-gray-200 pb-2 dark:border-gray-700">
        <h3 className="flex items-center gap-1.5 px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          <PiShieldCheck className="h-3.5 w-3.5" aria-hidden />
          To validate
          {pending.length > 0 && (
            <Badge size="sm" color="warning" className="ml-auto">
              {pending.length}
            </Badge>
          )}
        </h3>
        {pending.length === 0 ? (
          <p className="px-2 text-xs text-gray-400">
            Nothing waiting. Mutating proposals from the discussion land here —
            they never run without you.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto px-2">
            {pending.map((a) => (
              <li key={a.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-900/40 dark:bg-amber-900/10">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{a.label}</span>
                  {a.risk && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${RISK_TINT[a.risk] ?? ''}`}>
                      {a.risk}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => dismiss(a.id)}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    <PiX className="h-3 w-3" aria-hidden />
                  </button>
                </div>
                {a.rationale && <p className="mt-1 text-[11px] text-gray-500">{a.rationale}</p>}
                <div className="mt-1.5">
                  <Button size="sm" variant="outline" onClick={() => approve(a.id)}>
                    Approve & discuss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Deployment follow-up — active project, all statuses, read-only */}
      {projectId && (
        <section
          aria-label="Project deployments"
          className="shrink-0 border-b border-gray-200 pb-2 pt-1 dark:border-gray-700"
        >
          <h3 className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <PiRocketLaunch className="h-3.5 w-3.5" aria-hidden />
            Deployments
            {deployments.length > 0 && (
              <span className="ml-auto text-[10px] font-normal normal-case text-gray-400">
                {deployments.length}
              </span>
            )}
          </h3>
          {deployments.length === 0 ? (
            <p className="px-2 text-xs text-gray-400">
              No deployment yet for this project — drafts stay drafts until you
              deploy from its workbench.
            </p>
          ) : (
            <ul className="max-h-36 space-y-0.5 overflow-y-auto px-2">
              {deployments.slice(0, 8).map((d) => (
                <li key={d.deployment_id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">
                    {d.deployment_type}
                    {d.environment ? ` · ${d.environment}` : ''}
                  </span>
                  <span
                    className={`shrink-0 font-medium ${DEPLOY_TONE[d.status?.toLowerCase()] ?? 'text-gray-500'}`}
                  >
                    {d.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Capability map for the active step */}
      <section aria-label="Step capabilities" className="flex min-h-0 flex-1 flex-col pt-2">
        <h3 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {STAGE_META[stage].label} — can / can&apos;t
        </h3>
        <div className="px-2 py-1.5">
          <Input
            size="sm"
            aria-label="Filter capabilities"
            placeholder="Filter…"
            prefix={<PiMagnifyingGlass className="h-3.5 w-3.5" aria-hidden />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {caps.loading ? (
            <p className="px-2 text-xs text-gray-400">Loading the capability catalog…</p>
          ) : caps.unavailable ? (
            <p className="px-2 text-xs text-gray-400">
              Catalog not provisioned for this step — actions unavailable, not
              hidden.
            </p>
          ) : (
            <>
              {filter(caps.ready).length > 0 && (
                <ul className="space-y-0.5 px-1">
                  {filter(caps.ready).map((c) => (
                    <CapabilityRow key={c.action_id} c={c} />
                  ))}
                </ul>
              )}
              {filter(caps.gated).length > 0 && (
                <ul className="space-y-0.5 px-1">
                  {filter(caps.gated).map((c) => (
                    <CapabilityRow key={c.action_id} c={c} />
                  ))}
                </ul>
              )}
              {filter(caps.unverified).length > 0 && (
                <ul className="space-y-0.5 px-1 opacity-70">
                  {filter(caps.unverified).map((c) => (
                    <CapabilityRow key={c.action_id} c={c} />
                  ))}
                </ul>
              )}
              {caps.all.length === 0 && (
                <p className="px-2 text-xs text-gray-400">No catalog entry for this step yet.</p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
