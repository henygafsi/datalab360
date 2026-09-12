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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Gauge,
  LayoutDashboard,
  Minus,
  Network,
  Receipt,
  ShieldCheck,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import {
  getDraftSummary,
  getWorkflows,
  type AppCost,
  type ConsistencyIssue,
  type DqGateResult,
  type DraftSummary,
  type StudioModelView,
  type WorkflowItem,
} from '@/app/services/studio/studio-api';
import { getDraftSources, type DraftSourcesView } from '@/app/services/studio/connections';
import { useModelChanged } from '@/app/services/studio/studio-bus';
import {
  getApplicationContext,
  getKnowledge,
  type ApplicationContext,
  type KnowledgeView,
  type ServerLifecycle,
} from '@/app/services/studio/context';
import { getStudioSummary, type AccessSummary } from '@/app/services/studio/summary';
import ActivationStep from '@/app/shared/studio/onboarding/ActivationStep';
import {
  LIFECYCLE_CLS,
  LIFECYCLE_WORDS,
  deriveLifecycle,
  type LifecycleState,
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

/** governed-operation kinds, said the way a person reads them */
const KIND_LABEL: Record<string, string> = {
  edit: 'edits',
  access_plan: 'access plans',
  dq_gate: 'quality gates',
  understand: 'analyses',
  publish: 'publishes',
  other: 'other',
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? k.replace(/_/g, ' ');

export default function StudioOverviewBrief({
  draftId,
  model,
  version,
  activation,
  issues,
  dq,
  appCost = null,
  onGo,
  activationSignal,
}: {
  draftId: string;
  model: StudioModelView | null;
  version: { version_number?: number; is_draft?: boolean } | null;
  activation: Record<string, unknown> | null;
  issues: ConsistencyIssue[] | null;
  dq: DqGateResult | 'running' | null;
  /** per-application cost (admin-only, fetched once by the workspace);
   *  null when unavailable or the reader is not a cost admin */
  appCost?: AppCost | null;
  onGo: (tab: GoTab) => void;
  /** bump to force the activation panel open (an « awaiting activation »
   *  link elsewhere always lands HERE — one panel, not one per module) */
  activationSignal?: number;
}) {
  const [summary, setSummary] = useState<DraftSummary | null>(null);
  const [ctx, setCtx] = useState<ApplicationContext | null>(null);
  const [sources, setSources] = useState<DraftSourcesView | 'error' | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowItem[] | 'error' | null>(null);
  const [access, setAccess] = useState<AccessSummary | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeView | null>(null);
  const [activationOpen, setActivationOpen] = useState(false);
  const lastSignal = useRef(activationSignal);

  useEffect(() => {
    if (activationSignal !== undefined && activationSignal !== lastSignal.current) {
      lastSignal.current = activationSignal;
      setActivationOpen(true);
    }
  }, [activationSignal]);

  const load = useCallback(() => {
    // the server Intelligence Brief IS the context — everything else is a
    // graceful fallback while a payload is missing
    void getApplicationContext(draftId, { view: 'overview' }).then(setCtx);
    void getDraftSummary(draftId).then(setSummary);
    void getDraftSources(draftId, { limit: 1 })
      .then(setSources)
      .catch(() => setSources('error'));
    void getWorkflows(draftId)
      .then((r) => setWorkflows(r.items))
      .catch(() => setWorkflows('error'));
    // live words for the Access and Knowledge rows — free persisted reads;
    // "—" while unread, never a static sentence pretending to be this app's.
    void getStudioSummary(draftId, ['access'])
      .then((r) => setAccess(r.access ?? {}))
      .catch(() => setAccess(null));
    void getKnowledge(draftId).then(setKnowledge);
  }, [draftId]);

  useEffect(() => load(), [load]);

  /* an applied model edit changes what the brief summarises (workflow
     activability, the next-best-action) — re-read on that signal, not only on
     draft change. */
  useModelChanged(draftId, load);

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

  /* SERVER lifecycle when computed (the only true rule) — client
     derivation only while the app was not rewritten since deployment */
  const serverLc: ServerLifecycle | null =
    (ctx?.overview?.lifecycle ?? ctx?.lifecycle ?? null) as ServerLifecycle | null;
  const lifecycle =
    serverLc?.state && LIFECYCLE_WORDS[serverLc.state as LifecycleState]
      ? {
          state: serverLc.state as LifecycleState,
          reasons:
            (serverLc.reasons?.length ? serverLc.reasons : null) ??
            (serverLc.next?.step
              ? [`next: ${serverLc.next.step}${serverLc.next.why ? ` — ${serverLc.next.why}` : ''}`]
              : []),
          derived: false,
        }
      : deriveLifecycle({
          version,
          activation,
          issues,
          anyScheduleActive: activeSchedules > 0,
        });
  const attention = ctx?.overview?.attention ?? [];
  /* The server now groups identical (rule, object, column) failures into ONE
     attention item carrying `count` and all `check_ids` (and a clean `what`
     naming the real tables — no more "?"). We keep a defensive FE grouping for
     older payloads, but the displayed count SUMS the server `count`: reading it
     as "rows the FE saw" would drop the server's "6 checks" down to 1. Quality
     items carry a `rule`; the lifecycle "quality gate failing" item does not,
     so only the former gets the "open Quality" affordance. */
  const attentionGrouped = useMemo(() => {
    const seen = new Map<
      string,
      { severity?: string; text: string; count: number; rule?: string }
    >();
    for (const a of attention) {
      const text = String(a.what ?? a.kind ?? '—').trim();
      const key = `${a.severity ?? 'info'}|${text}`;
      const inc = typeof a.count === 'number' && a.count > 0 ? a.count : 1;
      const cur = seen.get(key);
      if (cur) cur.count += inc;
      else seen.set(key, { severity: a.severity, text, count: inc, rule: a.rule });
    }
    return [...seen.values()];
  }, [attention]);
  const serverNext = ctx?.overview?.next_best_action ?? null;
  const questions = ctx?.overview?.questions ?? null;

  /** the server's next_best_action names a module — map its word to a tab */
  const actionToTab = (action?: string): GoTab | 'activation' | null => {
    const a = (action ?? '').toLowerCase();
    if (!a) return null;
    if (a.includes('activation')) return 'activation';
    if (a.includes('source') || a.includes('understand')) return 'sources';
    if (a.includes('quality') || a.includes('dq')) return 'quality';
    if (a.includes('report') || a.includes('insight')) return 'reporting';
    if (a.includes('model') || a.includes('relation') || a.includes('definition')) return 'model';
    if (a.includes('job') || a.includes('load')) return 'jobs';
    if (a.includes('workflow') || a.includes('automation') || a.includes('alert')) return 'workflows';
    if (a.includes('access') || a.includes('profile') || a.includes('grant')) return 'governance';
    if (a.includes('knowledge')) return 'knowledge';
    return null;
  };

  /* the ONE next best action — the SERVER's word when it has one, the
     client's blocker derivation as fallback */
  const next: NextAction = (() => {
    if (serverNext?.action) {
      const go = actionToTab(serverNext.action) ?? 'reporting';
      return {
        words: `${serverNext.action}${serverNext.why ? ` — ${serverNext.why}` : ''}`,
        go,
        label: go === 'activation' ? 'Open activation' : 'Open it',
      };
    }
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
      // live served counts, not the same sentence on every application
      words: access
        ? `${access.applied?.masked_columns ?? access.masked_columns ?? '—'} masked applied · ${
            (access.staged?.mutations ?? 0) > 0 ? `${access.staged?.mutations} staged · ` : ''
          }${access.footprint?.columns ?? '—'} columns in footprint${
            (access.pending_count ?? 0) > 0 ? ` · ${access.pending_count} pending approval` : ''
          }`
        : '—',
      go: 'governance',
    },
    {
      icon: BookOpen,
      label: 'Knowledge',
      words: knowledge?.counts
        ? `${knowledge.counts.confirmed ?? '—'} confirmed · ${knowledge.counts.proposed ?? '—'} proposed to review${
            (knowledge.counts.stale ?? 0) > 0 ? ` · ${knowledge.counts.stale} stale` : ''
          }`
        : '—',
      go: 'knowledge',
    },
  ];

  const goal =
    ctx?.overview?.goal ??
    ctx?.overview?.title ??
    (summary?.title as string | undefined) ??
    (summary?.need as string | undefined) ??
    null;
  const bizCtx = summary?.context ?? null;

  /* ── per-application cost, said honestly ─────────────────────────────
     Money valuation is metered per app in CREDITS, not dollars: the
     account chip's dollar figure is warehouse spend across every workload,
     and per-application currency pricing is not configured. "0 credits" is
     a real read, not a placeholder — preview operations are free. */
  const cost = appCost && !appCost.unavailable ? appCost : null;
  const spentCredits = cost?.credits_charged;
  const attributed = cost?.warehouse?.credits_attributed_compute;
  const whDays = cost?.warehouse?.days ?? null;
  const whQueries = cost?.warehouse?.queries ?? 0;
  const aiDraft = cost?.usage?.ai_calls_per_draft;
  const aiHour = cost?.usage?.ai_calls_per_hour;
  const kindRows = Object.entries(cost?.by_kind ?? {})
    .map(([k, v]) => ({ k, count: v?.count ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const totalOps = cost?.interventions;

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
            <ActivationStep draftId={draftId} onChanged={load} />
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
            {bizCtx?.industry_id ? (
              <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">
                {String(bizCtx.industry_id)}
                {bizCtx.category_id ? ` › ${String(bizCtx.category_id)}` : ''}
              </span>
            ) : null}
          </p>
        )}
        {questions && (
          <ul role="list" className="mt-1.5 flex flex-wrap gap-1" aria-label="The seven questions">
            {Object.entries(questions).map(([k, ok]) => (
              <li
                key={k}
                role="listitem"
                aria-label={`${k}: ${ok ? 'answered by the context' : 'not answered yet'}`}
                title={ok ? `${k}: answered by the context` : `${k}: not answered yet`}
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-xs uppercase tracking-wide ${
                  ok
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {ok ? (
                  <Check aria-hidden className="h-3 w-3" />
                ) : (
                  <Minus aria-hidden className="h-3 w-3" />
                )}
                {k}
              </li>
            ))}
          </ul>
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
                <span
                  title={r.words}
                  className="min-w-0 flex-1 truncate text-[13px] text-slate-700 dark:text-slate-200"
                >
                  {r.words}
                </span>
                <button
                  type="button"
                  onClick={() => onGo(r.go)}
                  aria-label={`Open ${r.label}`}
                  title={r.words}
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                >
                  Open
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── cost — this application, metered in CREDITS (money per app is
           credits, not dollars; the account chip's $ is warehouse-wide) ── */}
      {cost && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Receipt aria-hidden className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Cost — this application
            </p>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <p className="text-2xl font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {spentCredits == null ? '—' : Number(spentCredits).toLocaleString()}
                <span className="ml-1 text-sm font-normal text-slate-400 dark:text-slate-500">
                  credits used
                </span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {spentCredits == null || Number(spentCredits) === 0
                  ? 'Every operation so far is within the free preview.'
                  : `${Number(spentCredits).toLocaleString()} credit(s) charged to date.`}
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <p className="text-2xl font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {attributed == null ? '—' : Number(attributed).toFixed(3)}
                <span className="ml-1 text-sm font-normal text-slate-400 dark:text-slate-500">
                  cr{whDays != null ? ` / ${whDays}d` : ''} compute
                </span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Billable warehouse compute attributed to this app — {whQueries} tagged quer
                {whQueries === 1 ? 'y' : 'ies'}; attribution starts at the tagging deploy, metering
                lags {cost.warehouse?.latency ?? 'up to 45 min'}.
              </p>
            </div>
          </div>

          <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-[13px] text-slate-600 dark:border-slate-800 dark:text-slate-300">
            {totalOps != null && (
              <li>
                <span className="text-slate-500 dark:text-slate-400">Operations · </span>
                {totalOps} recorded
                {kindRows.length
                  ? ` — ${kindRows
                      .slice(0, 4)
                      .map((r) => `${r.count} ${kindLabel(r.k)}`)
                      .join(' · ')}`
                  : ''}
              </li>
            )}
            {aiDraft && (aiDraft.used != null || aiDraft.limit != null) && (
              <li>
                <span className="text-slate-500 dark:text-slate-400">AI analyses · </span>
                {aiDraft.used ?? '—'} of {aiDraft.limit ?? '—'} used for this app
                {aiHour?.limit != null
                  ? ` (${aiHour.used ?? '—'} of ${aiHour.limit} this hour)`
                  : ''}{' '}
                — free while in preview
              </li>
            )}
          </ul>

          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            The dollar figure top-right is account-wide warehouse spend across every workload — not
            this application. Per-application cost is metered in credits.
          </p>
          <button
            type="button"
            onClick={() => setActivationOpen(true)}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
          >
            See what activating this app will cost
          </button>
        </section>
      )}

      {/* ── attention — the server's list, grouped, severity said ─────── */}
      {attentionGrouped.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Needs your attention
          </p>
          <ul className="mt-1.5 space-y-1">
            {attentionGrouped.slice(0, 6).map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]">
                <span
                  className={`mt-px shrink-0 rounded-full px-1.5 py-px text-xs ${
                    g.severity === 'critical'
                      ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : g.severity === 'warning'
                        ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {g.severity ?? 'info'}
                </span>
                <span className="min-w-0 text-slate-700 dark:text-slate-200">
                  {g.text}
                  {g.count > 1 && (
                    <span className="text-slate-400 dark:text-slate-500"> · {g.count} checks</span>
                  )}
                  {g.rule && (
                    <button
                      type="button"
                      onClick={() => onGo('quality')}
                      className="ml-1.5 rounded text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
                    >
                      open Quality
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {attentionGrouped.length > 6 &&
            (() => {
              // never DROP the 7th+ group silently — this section's whole job
              // is honesty; say how much more is waiting and where to see it
              const hidden = attentionGrouped.slice(6);
              const more = hidden.reduce((n, g) => n + (g.count > 0 ? g.count : 1), 0);
              return (
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  +{more} more check{more > 1 ? 's' : ''} in {hidden.length} other item
                  {hidden.length > 1 ? 's' : ''} —{' '}
                  <button
                    type="button"
                    onClick={() => onGo('quality')}
                    className="rounded text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
                  >
                    open Quality
                  </button>
                </p>
              );
            })()}
        </section>
      )}

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
