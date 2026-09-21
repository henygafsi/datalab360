'use client';

/**
 * StudioAutomationCockpit — automations as a cockpit, not a table.
 *
 * The old page was a five-column listing whose « does » column truncated
 * mid-word, whose decisions hid as small orange text, and which threw the
 * list away the moment you opened one row. Here the list stays on the left,
 * the selected automation reads as the sentence it actually is —
 * WHEN → IF → THEN → DELIVERS — and everything that needs a human sits in
 * one rail instead of being scattered through the form.
 *
 * Honesty invariants:
 *  • Every word comes from the served `phrase` / prerequisites / runs; an
 *    automation that never ran says so, and a blocked one names what blocks
 *    it rather than showing a dead button.
 *  • Nothing here executes. Test-runs, decisions and activation live in the
 *    editor below, which is the proven surface — this shell only makes the
 *    state readable and the next move obvious.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  ChevronRight,
  Database,
  Filter,
  Play,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Workflow as WorkflowIcon,
  Zap,
} from 'lucide-react';
import { getWorkflows, type WorkflowItem } from '@/app/services/studio/studio-api';
import StudioWorkflowEditor from '@/app/shared/studio/StudioWorkflowEditor';

type LucideIcon = typeof Bell;

interface Family {
  id: string;
  label: string;
  hint: string;
  Icon: LucideIcon;
  tint: string;
  test: (k: string) => boolean;
}

const FAMILIES: Family[] = [
  {
    id: 'alerts',
    label: 'Alerts',
    hint: 'watch a condition, tell someone',
    Icon: Bell,
    tint: 'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300',
    test: (k) => k.startsWith('alert'),
  },
  {
    id: 'reports',
    label: 'Periodic reports',
    hint: 'recurring summaries, delivered',
    Icon: BarChart3,
    tint: 'bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-300',
    test: (k) => k.includes('report'),
  },
  {
    id: 'delivery',
    label: 'External hand-offs',
    hint: 'tickets, exports and webhooks',
    Icon: Send,
    tint: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
    test: (k) => /ticket|export|webhook/.test(k),
  },
  {
    id: 'schedules',
    label: 'Load schedules',
    hint: 'keep the data loaded on time',
    Icon: Database,
    tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    test: (k) => /schedule/.test(k),
  },
];
const OTHER: Family = {
  id: 'other',
  label: 'Other automations',
  hint: '',
  Icon: WorkflowIcon,
  tint: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  test: () => true,
};

function familyOf(w: WorkflowItem) {
  const k = String(w.kind ?? '').toLowerCase();
  return FAMILIES.find((f) => f.test(k)) ?? OTHER;
}

/** how many human decisions this automation is waiting on */
function decisionsOf(w: WorkflowItem): number {
  const ids = w.activable?.decision_ids?.length ?? 0;
  if (ids) return ids;
  const miss =
    (w.prerequisites?.data?.missing?.length ?? 0) + (w.prerequisites?.destination?.missing?.length ?? 0);
  return miss;
}

const STATE_TONE: Record<string, string> = {
  delivered: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  simulated: 'bg-accent-50 text-accent-700 dark:bg-accent-950/50 dark:text-accent-300',
  stopped: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  proposed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function fmtWhen(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ── one step of the sentence, as a card ───────────────────────────── */
function FlowCard({
  n,
  label,
  text,
  icon: Icon,
  tone,
}: {
  n: string;
  label: string;
  text?: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <li className="min-w-0 flex-1">
      <div className="flex h-full min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="flex items-center gap-1.5">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>
            <Icon aria-hidden className="h-3.5 w-3.5" />
          </span>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
            {n} · {label}
          </span>
        </span>
        <p className="mt-1.5 text-[13px] leading-snug text-slate-700 dark:text-slate-200">
          {text?.trim() || <span className="text-slate-400 dark:text-slate-500">not defined yet</span>}
        </p>
      </div>
    </li>
  );
}

export default function StudioAutomationCockpit({
  draftId,
  onOpenActivation,
  onOpenAccess,
}: {
  draftId: string;
  onOpenActivation?: () => void;
  onOpenAccess?: () => void;
}) {
  const [items, setItems] = useState<WorkflowItem[] | 'loading' | 'error'>('loading');
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [proposing, setProposing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getWorkflows(draftId);
      setItems(r.items);
      setCounts(r.counts ?? null);
      if (r.trigger_choices?.length) setChoices(r.trigger_choices);
    } catch {
      setItems('error');
    }
  }, [draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  const proposeMore = async () => {
    setProposing(true);
    try {
      const r = await getWorkflows(draftId, true);
      setItems(r.items);
      setCounts(r.counts ?? null);
    } catch {
      /* the list keeps what it had — the button re-arms */
    } finally {
      setProposing(false);
    }
  };

  const list = Array.isArray(items) ? items : [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (w) =>
        String(w.name ?? '').toLowerCase().includes(needle) ||
        String(w.phrase?.event ?? '').toLowerCase().includes(needle),
    );
  }, [list, q]);

  /* grouped, decisions first — the eye lands on what is waiting */
  const groups = useMemo(() => {
    const byFam = new Map<string, { fam: Family; rows: WorkflowItem[] }>();
    for (const w of filtered) {
      const fam = familyOf(w);
      const cur = byFam.get(fam.id) ?? { fam, rows: [] };
      cur.rows.push(w);
      byFam.set(fam.id, cur);
    }
    for (const g of byFam.values()) {
      g.rows.sort((a, b) => decisionsOf(b) - decisionsOf(a) || String(a.name).localeCompare(String(b.name)));
    }
    return [...byFam.values()].sort((a, b) => {
      const ad = a.rows.reduce((s, w) => s + decisionsOf(w), 0);
      const bd = b.rows.reduce((s, w) => s + decisionsOf(w), 0);
      return bd - ad || b.rows.length - a.rows.length;
    });
  }, [filtered]);

  useEffect(() => {
    if (!selected && groups.length > 0 && groups[0].rows.length > 0) {
      setSelected(groups[0].rows[0].automation_id);
    }
  }, [groups, selected]);

  const sel = selected ? list.find((w) => w.automation_id === selected) ?? null : null;
  const totalDecisions = list.reduce((s, w) => s + decisionsOf(w), 0);

  if (items === 'loading') {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <RefreshCw aria-hidden className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }
  if (items === 'error') {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        The automations could not be read.{' '}
        <button type="button" onClick={() => void load()} className="font-medium underline">
          Retry
        </button>
      </p>
    );
  }

  const KPIS: Array<{ label: string; value: number | undefined; icon: LucideIcon; tone?: string }> = [
    { label: 'Proposed', value: counts?.proposed ?? list.length, icon: Sparkles },
    { label: 'Ready to activate', value: counts?.activable, icon: Zap },
    { label: 'Delivering', value: counts?.delivered, icon: Send },
    { label: 'Stopped', value: counts?.stopped, icon: Filter },
    {
      label: 'Waiting on you',
      value: totalDecisions || undefined,
      icon: Bell,
      tone: totalDecisions > 0 ? 'brand' : undefined,
    },
  ];

  return (
    <div className="space-y-3">
      {/* ══ the state of automation, in five served figures ══════════ */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {KPIS.map((k) => (
          <div
            key={k.label}
            className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                k.tone === 'brand'
                  ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              <k.icon aria-hidden className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[22px] font-semibold leading-none tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
                {typeof k.value === 'number' ? k.value.toLocaleString() : '—'}
              </span>
              <span className="mt-0.5 block truncate text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {k.label}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[290px_minmax(0,1fr)]">
        {/* ══ LEFT — every automation, grouped, decisions first ══════ */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Automations
            </p>
            <button
              type="button"
              disabled={proposing}
              onClick={() => void proposeMore()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              {proposing ? (
                <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles aria-hidden className="h-3 w-3" />
              )}
              Propose more
            </button>
          </div>
          <div className="relative mt-2">
            <Search aria-hidden className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search automations"
              aria-label="Search automations"
              className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <div className="mt-2 max-h-[520px] space-y-3 overflow-y-auto pr-0.5">
            {groups.map((g) => {
              const famDecisions = g.rows.reduce((s, w) => s + decisionsOf(w), 0);
              return (
                <div key={g.fam.id}>
                  <p className="flex items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    <g.fam.Icon aria-hidden className="h-3 w-3" />
                    {g.fam.label}
                    <span className="text-slate-300 dark:text-slate-600">{g.rows.length}</span>
                    {famDecisions > 0 && (
                      <span className="ml-auto rounded-full bg-brand-50 px-1.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
                        {famDecisions} to decide
                      </span>
                    )}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {g.rows.map((w) => {
                      const on = selected === w.automation_id;
                      const dec = decisionsOf(w);
                      const state = String(w.state ?? 'proposed');
                      return (
                        <li key={w.automation_id}>
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() => setSelected(w.automation_id)}
                            className={`w-full rounded-xl border px-2 py-2 text-left transition-all ${
                              on
                                ? 'border-accent-200 bg-accent-50/70 shadow-sm dark:border-accent-800 dark:bg-accent-950/40'
                                : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <span className="flex items-start gap-2">
                              <span
                                className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${g.fam.tint}`}
                              >
                                <g.fam.Icon aria-hidden className="h-3 w-3" />
                              </span>
                              {/* two full lines, cut on a word — never mid-word */}
                              <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-slate-800 line-clamp-2 dark:text-slate-100">
                                {w.name ?? w.automation_id}
                              </span>
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-1 pl-8">
                              <span
                                className={`rounded-full px-1.5 py-px text-[10px] ${STATE_TONE[state] ?? STATE_TONE.proposed}`}
                              >
                                {state}
                              </span>
                              {dec > 0 && (
                                <span className="rounded-full bg-brand-50 px-1.5 py-px text-[10px] font-semibold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
                                  {dec} to decide
                                </span>
                              )}
                              {w.runs_summary?.last?.at && (
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                  ran {fmtWhen(w.runs_summary.last.at)}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            {groups.length === 0 && (
              <p className="rounded-xl border border-slate-200 p-4 text-center text-[12.5px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {q ? 'No automation matches this search.' : 'No automation proposed yet.'}
              </p>
            )}
          </div>
        </section>

        {/* ══ RIGHT — the selected automation, as a sentence then a form ══ */}
        <section className="min-w-0 space-y-3">
          {!sel ? (
            <p className="rounded-2xl border border-slate-200/80 bg-white py-12 text-center text-[13px] text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Pick an automation on the left to read what it does.
            </p>
          ) : (
            <>
              {/* the automation as the sentence it is */}
              <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 flex-1 text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                    {sel.name ?? sel.automation_id}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      STATE_TONE[String(sel.state ?? 'proposed')] ?? STATE_TONE.proposed
                    }`}
                  >
                    {sel.state ?? 'proposed'}
                  </span>
                  {decisionsOf(sel) > 0 && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
                      {decisionsOf(sel)} decision{decisionsOf(sel) > 1 ? 's' : ''} to take
                    </span>
                  )}
                </div>
                <ul className="mt-2.5 flex flex-col gap-2 lg:flex-row lg:items-stretch">
                  <FlowCard
                    n="1"
                    label="When"
                    text={sel.phrase?.event}
                    icon={Bell}
                    tone="bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-300"
                  />
                  <FlowCard
                    n="2"
                    label="If"
                    text={sel.phrase?.condition}
                    icon={Filter}
                    tone="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300"
                  />
                  <FlowCard
                    n="3"
                    label="Then"
                    text={sel.phrase?.action}
                    icon={Play}
                    tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                  />
                  <FlowCard
                    n="4"
                    label="Delivers to"
                    text={sel.phrase?.destination}
                    icon={Send}
                    tone="bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300"
                  />
                </ul>
                {/* the event summary — what ran, what is next, what blocks */}
                <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200/70 pt-2 text-[12px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <span>
                    {sel.runs_summary?.count
                      ? `ran ${sel.runs_summary.count}×, last ${fmtWhen(sel.runs_summary.last?.at)}`
                      : 'never ran'}
                  </span>
                  <span>·</span>
                  <span>
                    {sel.trigger?.type ?? sel.trigger?.cron_choice ?? 'no trigger'}
                    {sel.trigger?.next_run ? ` · next ${fmtWhen(sel.trigger.next_run)}` : ''}
                  </span>
                  {sel.activable?.ok === false && sel.activable?.reason && (
                    <>
                      <span>·</span>
                      <span className="text-brand-700 dark:text-brand-300">{sel.activable.reason}</span>
                    </>
                  )}
                  {onOpenActivation && (
                    <button
                      type="button"
                      onClick={onOpenActivation}
                      className="ml-auto inline-flex items-center gap-1 text-accent-700 hover:underline dark:text-accent-400"
                    >
                      Activation panel
                      <ChevronRight aria-hidden className="h-3 w-3" />
                    </button>
                  )}
                </p>
              </div>

              {/* the proven editor — definition, steps, runs & history */}
              <StudioWorkflowEditor
                key={sel.automation_id}
                draftId={draftId}
                workflow={sel}
                triggerChoices={choices}
                embedded
                onClose={() => setSelected(null)}
                onChanged={() => void load()}
                onOpenActivation={onOpenActivation}
                onOpenAccess={onOpenAccess}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
