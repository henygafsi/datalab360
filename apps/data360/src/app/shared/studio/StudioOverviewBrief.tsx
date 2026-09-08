'use client';

/**
 * StudioOverviewBrief — the application's intelligence brief, and the ONE
 * activation surface.
 *
 * Not another dashboard: it answers, in order — what is this application
 * trying to do, what feeds it, can it be trusted, what is active, and what
 * needs you NOW (one next-best-action, derived from real blockers, never a
 * motivational sentence). Every row reads the SAME context the module
 * behind it edits (the convergence rule: no second memory) — counts come
 * from the already-loaded model, the persisted sources view (no scan), the
 * workflows list and the activation read; a figure that was not read
 * renders '—', never 0.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Database,
  Gauge,
  LayoutDashboard,
  Network,
  ShieldCheck,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import {
  getDraftSummary,
  getWorkflows,
  type ConsistencyIssue,
  type DqGateResult,
  type DraftSummary,
  type StudioModelView,
  type WorkflowItem,
} from '@/app/services/studio/studio-api';
import { getDraftSources, type DraftSourcesView } from '@/app/services/studio/connections';
import ActivationStep from '@/app/shared/studio/onboarding/ActivationStep';
import {
  LIFECYCLE_CLS,
  LIFECYCLE_WORDS,
  deriveLifecycle,
} from '@/app/shared/studio/application-lifecycle';

type GoTab =
  | 'sources'
  | 'model'
  | 'quality'
  | 'jobs'
  | 'reporting'
  | 'knowledge'
  | 'governance'
  | 'workflows';

interface NextAction {
  words: string;
  go: GoTab | 'activation';
  label: string;
}

export default function StudioOverviewBrief({
  draftId,
  model,
  version,
  activation,
  issues,
  dq,
  onGo,
  activationSignal,
}: {
  draftId: string;
  model: StudioModelView | null;
  version: { version_number?: number; is_draft?: boolean } | null;
  activation: Record<string, unknown> | null;
  issues: ConsistencyIssue[] | null;
  dq: DqGateResult | 'running' | null;
  onGo: (tab: GoTab) => void;
  /** bump to force the activation panel open (an « awaiting activation »
   *  link elsewhere always lands HERE — one panel, not one per module) */
  activationSignal?: number;
}) {
  const [summary, setSummary] = useState<DraftSummary | null>(null);
  const [sources, setSources] = useState<DraftSourcesView | 'error' | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowItem[] | 'error' | null>(null);
  const [activationOpen, setActivationOpen] = useState(false);
  const lastSignal = useRef(activationSignal);

  useEffect(() => {
    if (activationSignal !== undefined && activationSignal !== lastSignal.current) {
      lastSignal.current = activationSignal;
      setActivationOpen(true);
    }
  }, [activationSignal]);

  const load = useCallback(() => {
    void getDraftSummary(draftId).then(setSummary);
    void getDraftSources(draftId, { limit: 1 })
      .then(setSources)
      .catch(() => setSources('error'));
    void getWorkflows(draftId)
      .then((r) => setWorkflows(r.items))
      .catch(() => setWorkflows('error'));
  }, [draftId]);

  useEffect(() => load(), [load]);

  const tables = model?.tables ?? [];
  const rels = model?.relationships ?? [];
  const defsToConfirm = (model?.definitions ?? []).filter(
    (d) => (d as { status?: string }).status !== 'confirmed',
  );
  const kpis = model?.report?.kpis ?? [];
  const charts = model?.report?.charts ?? [];
  const wf = Array.isArray(workflows) ? workflows : [];
  const activeSchedules = wf.filter((w) => w.schedule?.active).length;
  const notActivable = wf.filter((w) => w.activable?.ok === false).length;
  const src = typeof sources === 'object' && sources != null ? sources : null;
  const staleCount = src?.stale_for?.length ?? 0;
  const dqObj = typeof dq === 'object' && dq != null ? dq : null;
  const dqFailing = (dqObj?.checks ?? []).filter((c) => c.verdict === 'fail');

  const lifecycle = deriveLifecycle({
    version,
    activation,
    issues,
    anyScheduleActive: activeSchedules > 0,
  });

  /* the ONE next best action — first real blocker wins */
  const next: NextAction = (() => {
    const blocking = (issues ?? []).filter((i) => i.severity === 'blocking');
    if (blocking.length > 0)
      return {
        words: `Resolve ${blocking.length} blocking consistency issue(s) — what is published drifted from the model.`,
        go: 'model',
        label: 'Open the model',
      };
    if (dqFailing.length > 0) {
      const first = dqFailing[0];
      return {
        words: `Fix « ${first.message ?? first.rule ?? first.id} » — it blocks trustworthy figures${first.scope?.fqn ? ` on ${String(first.scope.fqn).split('.').slice(-1)[0]}` : ''}.`,
        go: 'quality',
        label: 'Open quality',
      };
    }
    if (staleCount > 0)
      return {
        words: `Understanding is stale for ${staleCount} object(s) — refresh it so the model and reports stay grounded.`,
        go: 'sources',
        label: 'Open the sources',
      };
    if (defsToConfirm.length > 0)
      return {
        words: `${defsToConfirm.length} definition(s) still wait for your word — the AI never confirms them for you.`,
        go: 'model',
        label: 'Confirm them',
      };
    if (lifecycle.state === 'ready')
      return {
        words: 'Everything checks out — activation is the remaining step to let schedules run.',
        go: 'activation',
        label: 'Open activation',
      };
    if (lifecycle.state === 'draft' && tables.length > 0)
      return {
        words: 'The model is coherent — publish snapshots this version, then activation turns it on.',
        go: 'activation',
        label: 'Open activation',
      };
    return {
      words: 'Nothing needs you right now — the application is coherent with what was read.',
      go: 'reporting',
      label: 'Open the reporting',
    };
  })();

  const rows: Array<{
    icon: typeof Database;
    label: string;
    words: string;
    go: GoTab;
  }> = [
    {
      icon: Database,
      label: 'Data',
      words: src
        ? `${src.total ?? src.items.length} object(s) attached${staleCount ? ` · understanding stale for ${staleCount}` : ''}`
        : sources === 'error'
          ? 'the sources view could not be read'
          : '—',
      go: 'sources',
    },
    {
      icon: Network,
      label: 'Model',
      words: model
        ? `${tables.length} table(s) · ${rels.length} relationship(s)${defsToConfirm.length ? ` · ${defsToConfirm.length} definition(s) to confirm` : ''}`
        : '—',
      go: 'model',
    },
    {
      icon: Gauge,
      label: 'Quality',
      words:
        dq === 'running'
          ? 'gate running…'
          : dqObj
            ? `${(dqObj.checks ?? []).length} check(s) · ${dqFailing.length ? `${dqFailing.length} failing` : 'none failing'}${
                typeof dqObj.gate === 'object' && dqObj.gate?.full_ingestion_allowed === false
                  ? ' · full ingestion blocked'
                  : ''
              }`
            : 'not evaluated yet — nothing here counts as healthy by default',
      go: 'quality',
    },
    {
      icon: LayoutDashboard,
      label: 'Insights',
      words: model?.report
        ? `${kpis.length} KPI(s) · ${charts.length} chart(s)`
        : 'no report yet',
      go: 'reporting',
    },
    {
      icon: WorkflowIcon,
      label: 'Automation',
      words: Array.isArray(workflows)
        ? wf.length === 0
          ? 'no workflow yet'
          : `${wf.length} workflow(s) · ${activeSchedules} schedule(s) running${notActivable ? ` · ${notActivable} blocked by a decision` : ''}`
        : workflows === 'error'
          ? 'the workflows could not be read'
          : '—',
      go: 'workflows',
    },
    {
      icon: ShieldCheck,
      label: 'Access',
      words: 'roles, data profiles and the exact grants — with their proof',
      go: 'governance',
    },
    {
      icon: BookOpen,
      label: 'Knowledge',
      words: 'your words and what the analyses learned — review what is proposed',
      go: 'knowledge',
    },
  ];

  const goal =
    (summary?.title as string | undefined) ??
    (summary?.need as string | undefined) ??
    null;
  const ctx = summary?.context ?? null;

  return (
    <div className="space-y-3">
      {/* ── lifecycle: ONE state, its reasons, ONE activation surface ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[13px] font-medium ${LIFECYCLE_CLS[lifecycle.state]}`}>
            {LIFECYCLE_WORDS[lifecycle.state]}
          </span>
          <span className="min-w-0 text-[13px] text-slate-600 dark:text-slate-300">
            {lifecycle.reasons.join(' · ')}
          </span>
          <button
            type="button"
            aria-expanded={activationOpen}
            onClick={() => setActivationOpen((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
          >
            {activationOpen ? (
              <ChevronDown aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight aria-hidden className="h-3.5 w-3.5" />
            )}
            Activation panel
          </button>
        </div>
        {lifecycle.derived && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            State derived from publish + activation + consistency on this screen — the unified
            lifecycle contract replaces it server-side.
          </p>
        )}
        {activationOpen && (
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <ActivationStep draftId={draftId} />
          </div>
        )}
      </section>

      {/* ── the brief: goal → each facet in one honest line ──────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {goal && (
          <p className="text-[13px] text-slate-700 dark:text-slate-200">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Goal ·{' '}
            </span>
            {goal}
            {ctx?.industry_id ? (
              <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">
                {String(ctx.industry_id)}
                {ctx.category_id ? ` › ${String(ctx.category_id)}` : ''}
              </span>
            ) : null}
          </p>
        )}
        <ul className={`${goal ? 'mt-2 border-t border-slate-100 pt-2 dark:border-slate-800' : ''} divide-y divide-slate-100 dark:divide-slate-800`}>
          {rows.map((r) => {
            const Icon = r.icon;
            return (
              <li key={r.label} className="flex items-center gap-3 py-1.5">
                <Icon aria-hidden className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {r.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700 dark:text-slate-200">
                  {r.words}
                </span>
                <button
                  type="button"
                  onClick={() => onGo(r.go)}
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                >
                  Open
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── next best action — ONE, from real blockers ────────────────── */}
      <section className="rounded-xl border border-accent-200 bg-accent-50/40 p-4 dark:border-accent-900/50 dark:bg-accent-900/10">
        <p className="text-xs font-medium uppercase tracking-wide text-accent-800 dark:text-accent-300">
          Next best action
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-[13px] text-slate-700 dark:text-slate-200">{next.words}</p>
          <button
            type="button"
            onClick={() => {
              if (next.go === 'activation') setActivationOpen(true);
              else onGo(next.go);
            }}
            className="shrink-0 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            {next.label}
          </button>
        </div>
      </section>
    </div>
  );
}
