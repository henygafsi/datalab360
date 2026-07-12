'use client';

/**
 * ProjectKpiStrip — a compact, self-contained per-project KPI strip (Data360 G7).
 *
 * Renders the standardized PER-PROJECT rollup (never per-account) as a row of
 * small chips: RUNS · COST · PERF · RECOS · DQ · GOV · STORAGE. It needs only a
 * `projectId`; everything else is derived from `useProjectRollup` →
 * `getProjectRollup` (the precomputed `/command-center/projects/{id}/rollup`).
 *
 * Honesty rules baked in (no fake numbers, no account data masquerading as
 * per-project):
 *   · COST   — shows credits ONLY when the rollup attributed them to THIS
 *              project (`scope === 'project'`). An account-level cost shows a
 *              muted "acct" chip (the account total is NOT this project's cost),
 *              and an unattributed/null cost shows "—".
 *   · DQ /   — account-scoped values still render (they're the backend's honest
 *     STORAGE  answer) but de-emphasised (muted tone + "acct" tag), so they read
 *              as context, not as a per-project score.
 *   · every  — `null`/`undefined` → "—", honouring the no-fake-zero rule.
 *
 * States: loading → skeleton chips; unavailable (404/501) → render nothing (the
 * feature isn't provisioned — no scary banner); genuine error → one muted
 * inline retry chip. Dark-mode correct; tones reuse the score-card palette.
 *
 * Slot-ready: another agent owns the shared right-panel; this is a standalone
 * component to be dropped in later as that panel's `kpiStrip`.
 */
import Link from 'next/link';
import {
  Activity,
  BadgeCheck,
  Coins,
  Database,
  Gauge,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import cn from '@core/utils/class-names';
import { useProjectRollup } from '@/app/shared/score-cards/useProjectRollup';
import type {
  ProjectRollup,
  ScoreCard,
  ScoreCardDimension,
} from '@/app/services/command-center/score-cards';

// ── Public types ─────────────────────────────────────────────────────────────

/** Every chip the strip can show. `runs`/`recos` are rollup-level (not cards). */
export type ProjectKpiKey =
  | 'runs'
  | 'cost'
  | 'perf'
  | 'recos'
  | 'dq'
  | 'gov'
  | 'storage';

export interface ProjectKpiStripProps {
  /** The project to scope the rollup to. Self-contained — this is all it needs. */
  projectId: string;
  /** Optional subset / reordering of chips. Defaults to all seven (header order). */
  dimensions?: ProjectKpiKey[];
  /** Denser variant: hides text labels (icon + value only), tighter spacing. */
  compact?: boolean;
  /** Optional lookback window in days (defaults to the backend default, 30). */
  days?: number;
  /** Extra classes for the outer row. */
  className?: string;
}

// Header order: "Runs · Cost · Perf · Recos + DQ · GOV · Storage".
const DEFAULT_ORDER: ProjectKpiKey[] = [
  'runs',
  'cost',
  'perf',
  'recos',
  'dq',
  'gov',
  'storage',
];

// Drill-down targets (plain absolute routes, mirroring ScoreCards' link style).
const DRILL = {
  recos: '/account-overview', // recommendations hub
  cost: '/observability/budget', // cost / budget tab
  storage: '/observability/budget',
  perf: '/observability',
  runs: '/observability',
  dq: '/data-quality',
  gov: '/governance/projects',
} as const;

// ── Tone palette (reuses the score-card severity colours, dark-mode aware) ───

type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'muted';

const TONE_CLASS: Record<Tone, string> = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300',
  warn: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300',
  bad: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300',
  neutral:
    'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200',
  muted:
    'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500',
};

// ── Badge model ──────────────────────────────────────────────────────────────

interface Badge {
  key: ProjectKpiKey;
  icon: LucideIcon;
  label: string;
  /** Already-formatted display value ("—" when null/unknown). */
  value: string;
  tone: Tone;
  /** Small trailing detail (relative time, critical count, …). */
  sub?: string;
  /** Hover tooltip — the honest explanation of what the value is. */
  title?: string;
  /** Drill-down route, when one exists. */
  href?: string;
  /** Show the muted "acct" tag (account-level value in a project context). */
  acct?: boolean;
}

// ── Value helpers ────────────────────────────────────────────────────────────

const EMPTY = '—';

function numVal(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function findCard(
  rollup: ProjectRollup,
  dim: ScoreCardDimension,
): ScoreCard | undefined {
  return rollup.cards.find((c) => c.dimension === dim);
}

function supportingOf(card: ScoreCard | undefined): Record<string, unknown> {
  return (card?.supporting ?? {}) as Record<string, unknown>;
}

function formatPct(v: number): string {
  const rounded = Number.isInteger(v) ? v : Math.round(v * 10) / 10;
  return `${rounded}%`;
}

function formatCredits(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k cr`;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} cr`;
}

function formatStorage(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/** Compact "Xh ago"-style relative time; null when no/invalid timestamp. */
function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 0) return 'just now';
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// ── Per-dimension badge builders ─────────────────────────────────────────────

function buildDq(rollup: ProjectRollup): Badge {
  const card = findCard(rollup, 'dq');
  const v = numVal(card?.value);
  const isAcct = card?.scope === 'account';
  let tone: Tone = 'muted';
  if (v != null && !isAcct) tone = v >= 90 ? 'good' : v >= 70 ? 'warn' : 'bad';
  return {
    key: 'dq',
    icon: BadgeCheck,
    label: 'DQ',
    value: v == null ? EMPTY : formatPct(v),
    tone,
    acct: v != null && isAcct,
    href: DRILL.dq,
    title: isAcct
      ? 'Data quality — account-level coverage (no per-project source for this project)'
      : 'Data quality score for this project',
  };
}

function buildPerf(rollup: ProjectRollup): Badge {
  const card = findCard(rollup, 'perf');
  const v = numVal(card?.value);
  const notComputed = card?.status === 'not_computed' || v == null;
  // Mirror the backend reco thresholds: fail-rate > 25% bad, > 5% warn.
  const tone: Tone = notComputed ? 'muted' : v > 25 ? 'bad' : v > 5 ? 'warn' : 'good';
  return {
    key: 'perf',
    icon: Gauge,
    label: 'Perf',
    value: notComputed ? EMPTY : formatPct(v),
    tone,
    sub: notComputed ? undefined : 'fail',
    href: DRILL.perf,
    title: notComputed
      ? 'Performance — no runs recorded for this project yet'
      : 'Run failure rate for this project',
  };
}

function buildCost(rollup: ProjectRollup): Badge {
  const card = findCard(rollup, 'cost');
  const v = numVal(card?.value);
  const isProject = card?.scope === 'project';
  // Honesty: only show credits when attributed to THIS project. Account-level
  // cost is the account total — never present it as the project's spend.
  if (v == null) {
    return {
      key: 'cost',
      icon: Coins,
      label: 'Cost',
      value: EMPTY,
      tone: 'muted',
      href: DRILL.cost,
      title: 'Cost — not attributable to this project',
    };
  }
  if (isProject) {
    return {
      key: 'cost',
      icon: Coins,
      label: 'Cost',
      value: formatCredits(v),
      tone: 'neutral',
      href: DRILL.cost,
      title: 'Compute cost attributed to this project (credits)',
    };
  }
  return {
    key: 'cost',
    icon: Coins,
    label: 'Cost',
    value: 'acct',
    tone: 'muted',
    href: DRILL.cost,
    title: 'Cost is account-level — the warehouse has no per-project attribution',
  };
}

function buildGov(rollup: ProjectRollup): Badge {
  const card = findCard(rollup, 'gov');
  const sup = supportingOf(card);
  const contributors = numVal(sup.contributors);
  const rls = numVal(sup.active_rls_policies);
  let value = EMPTY;
  if (contributors != null) {
    value = `${contributors} contr`;
  } else if (rls != null) {
    value = `${rls} RLS`;
  }
  // contributors === 0 → orphaned project (bad); no active RLS → warn.
  let tone: Tone = 'muted';
  if (contributors === 0) tone = 'bad';
  else if (rls === 0) tone = 'warn';
  else if (contributors != null || rls != null) tone = 'good';
  const rlsLabel =
    rls == null ? 'n/a' : `${rls} active RLS polic${rls === 1 ? 'y' : 'ies'}`;
  return {
    key: 'gov',
    icon: ShieldCheck,
    label: 'Gov',
    value,
    tone,
    href: DRILL.gov,
    title: `Governance — ${contributors ?? '—'} contributor${contributors === 1 ? '' : 's'} · ${rlsLabel}`,
  };
}

function buildStorage(rollup: ProjectRollup): Badge {
  const card = findCard(rollup, 'storage');
  const sup = supportingOf(card);
  const mb = numVal(card?.value) ?? numVal(sup.storage_mb);
  const isAcct = card?.scope === 'account';
  let tone: Tone = 'muted';
  if (mb != null && !isAcct) tone = mb > 500 ? 'warn' : 'good';
  return {
    key: 'storage',
    icon: Database,
    label: 'Storage',
    value: mb == null ? EMPTY : formatStorage(mb),
    tone,
    acct: mb != null && isAcct,
    href: DRILL.storage,
    title: isAcct
      ? 'Storage — account-level (no per-project objects to attribute storage to)'
      : 'Storage footprint for this project',
  };
}

function buildRuns(rollup: ProjectRollup): Badge {
  // "total runs" lives in perf.supporting.total_runs (PROJECT_RUNS); last-run
  // recency uses the rollup's last_event_at (closest available signal).
  const perf = findCard(rollup, 'perf');
  const totalRuns = numVal(supportingOf(perf).total_runs);
  const rel = relativeTime(rollup.lastEventAt);
  const hasRuns = totalRuns != null && totalRuns > 0;
  const value = totalRuns == null ? EMPTY : `${totalRuns}`;
  const tone: Tone = hasRuns ? 'neutral' : 'muted';
  return {
    key: 'runs',
    icon: Activity,
    label: 'Runs',
    value,
    tone,
    // Only pair a recency with a positive run count: `last_event_at` is project
    // *activity*, not a run, so "0 runs · 19m ago" would imply a run that never
    // happened. Suppress it unless there is at least one run.
    sub: hasRuns ? (rel ?? undefined) : undefined,
    href: DRILL.runs,
    title: hasRuns
      ? `${value} run(s)${rel ? ` · last activity ${rel}` : ''}`
      : 'No runs recorded for this project yet',
  };
}

function buildRecos(rollup: ProjectRollup): Badge {
  const { open, critical } = rollup.recos;
  const tone: Tone = critical > 0 ? 'bad' : open > 0 ? 'warn' : 'good';
  return {
    key: 'recos',
    icon: Lightbulb,
    label: 'Recos',
    value: `${open}`,
    tone,
    sub: critical > 0 ? `${critical} crit` : undefined,
    href: DRILL.recos,
    title: `${open} open recommendation${open === 1 ? '' : 's'}${critical > 0 ? ` · ${critical} critical` : ''}`,
  };
}

const BUILDERS: Record<ProjectKpiKey, (r: ProjectRollup) => Badge> = {
  runs: buildRuns,
  cost: buildCost,
  perf: buildPerf,
  recos: buildRecos,
  dq: buildDq,
  gov: buildGov,
  storage: buildStorage,
};

// ── Presentation ─────────────────────────────────────────────────────────────

function ChipShell({
  badge,
  compact,
}: {
  badge: Badge;
  compact: boolean;
}) {
  const Icon = badge.icon;
  const base = cn(
    'inline-flex items-center gap-1 rounded-md border font-medium whitespace-nowrap',
    compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
    TONE_CLASS[badge.tone],
    badge.href &&
      'transition-colors hover:border-gray-300 hover:brightness-[0.98] dark:hover:border-gray-600',
  );
  const content = (
    <>
      <Icon className={cn('shrink-0 opacity-70', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} aria-hidden="true" />
      {!compact ? (
        <span className="opacity-70">{badge.label}</span>
      ) : (
        <span className="sr-only">{badge.label}</span>
      )}
      <span className="font-semibold tabular-nums">{badge.value}</span>
      {badge.sub ? <span className="opacity-60">{badge.sub}</span> : null}
      {badge.acct ? (
        <span className="ml-0.5 rounded bg-gray-100 px-1 text-[8px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          acct
        </span>
      ) : null}
    </>
  );
  if (badge.href) {
    return (
      <Link href={badge.href} title={badge.title} className={base}>
        {content}
      </Link>
    );
  }
  return (
    <span title={badge.title} className={base}>
      {content}
    </span>
  );
}

function SkeletonChip({ compact }: { compact: boolean }) {
  return (
    <span
      className={cn(
        'inline-block animate-pulse rounded-md bg-gray-100 dark:bg-gray-800',
        compact ? 'h-5 w-12' : 'h-6 w-16',
      )}
      aria-hidden="true"
    />
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ProjectKpiStrip({
  projectId,
  dimensions,
  compact = false,
  days,
  className,
}: ProjectKpiStripProps) {
  const { data, loading, error, unavailable, refetch } = useProjectRollup(
    projectId,
    days,
  );

  const wanted = dimensions ?? DEFAULT_ORDER;
  const rowClass = cn('flex flex-wrap items-center gap-1.5', className);

  // Not provisioned on this backend (404/501) → render nothing, never a banner.
  if (unavailable) return null;

  // Loading (first paint) → skeleton chips, one per requested dimension.
  if (loading && !data) {
    return (
      <div className={rowClass} aria-busy="true">
        {wanted.map((d) => (
          <SkeletonChip key={d} compact={compact} />
        ))}
      </div>
    );
  }

  // Genuine, retryable error → one muted inline retry chip (no scary banner).
  if (error || !data) {
    return (
      <button
        type="button"
        onClick={refetch}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border font-medium',
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
          TONE_CLASS.muted,
          'transition-colors hover:text-gray-600 dark:hover:text-gray-300',
        )}
        title="Couldn’t load project KPIs — click to retry"
      >
        <RefreshCw className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} aria-hidden="true" />
        <span>KPIs</span>
      </button>
    );
  }

  const badges = wanted.map((key) => BUILDERS[key](data));

  return (
    <div className={rowClass}>
      {badges.map((badge) => (
        <ChipShell key={badge.key} badge={badge} compact={compact} />
      ))}
    </div>
  );
}
