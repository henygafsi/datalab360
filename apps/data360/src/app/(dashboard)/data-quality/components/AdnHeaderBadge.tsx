'use client';

/**
 * AdnHeaderBadge — compact 5-axis ADN strip (R6) for the Data Quality header.
 *
 * Mirrors the AdnScoreCard `compact` look (icon+score chips + an overall roll-up
 * chip) but is *null-aware*: any axis without a real per-project source renders
 * an honest gray "—" chip instead of a band-substituted number. AdnScoreCard
 * cannot express "—" (its `score` is a required number, and adnTone(58) reads
 * rose, i.e. a missing axis would look *bad*), so a faithful no-fake-0 R6 badge
 * needs this in-module variant. Glyphs/tone reuse the shared AdnAxes set so the
 * strip stays visually consistent with the other module headers.
 *
 * Data path (forward-compatible): useProjectContext('data_quality') → projectId
 * → useProjectRollup → 5 axes. Data Quality has no project selector today, so
 * `lastProjectId` is ~always null and the badge renders its honest empty state
 * (all "—" + an explanatory tooltip). It lights up automatically if/when this
 * module gains project scoping or a per-project DQ source ships on the backend.
 */

import { useProjectContext } from '@/hooks/useProjectContext';
import { useProjectRollup } from '@/app/shared/score-cards/useProjectRollup';
import { AXIS_ICON, adnTone } from '@/app/shared/command-center/AdnAxes';
import type { ProjectRollup, ScoreCard } from '@/app/services/command-center/score-cards';
import { cn } from '@/lib/utils';

type AxisKey = 'DQ' | 'PERF' | 'SEC' | 'STORAGE' | 'USAGE';

interface NullableAxis {
  key: AxisKey;
  label: string;
  /** null = no real per-project source → renders "—" (never a fake 0). */
  score: number | null;
  desc: string;
}

// Literal class strings (not `bg-${tone}-50`) so Tailwind's JIT always emits
// them — dynamic interpolation can't be statically scanned.
const TONE_CLS: Record<string, { chip: string; icon: string; text: string }> = {
  emerald: { chip: 'bg-emerald-50 dark:bg-emerald-900/20', icon: 'text-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  amber: { chip: 'bg-amber-50 dark:bg-amber-900/20', icon: 'text-amber-500', text: 'text-amber-700 dark:text-amber-300' },
  rose: { chip: 'bg-rose-50 dark:bg-rose-900/20', icon: 'text-rose-500', text: 'text-rose-700 dark:text-rose-300' },
  slate: { chip: 'bg-slate-100/70 dark:bg-slate-800/50', icon: 'text-slate-400', text: 'text-slate-400 dark:text-slate-500' },
};
const OVERALL_CLS: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

function toneOf(score: number | null): string {
  return score == null ? 'slate' : adnTone(score);
}

/** Neutral English rating word (AdnAxes.ratingLabel is French). */
function rating(score: number): string {
  return score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Low';
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function supportingOf(card?: ScoreCard): Record<string, unknown> {
  return (card?.supporting ?? {}) as Record<string, unknown>;
}
function cardOf(rollup: ProjectRollup, dim: string): ScoreCard | undefined {
  return rollup.cards.find((c) => c.dimension === dim);
}

/** Axis order + labels (neutral copy — no vendor names). */
const AXIS_META: { key: AxisKey; label: string }[] = [
  { key: 'DQ', label: 'Quality' },
  { key: 'PERF', label: 'Perf' },
  { key: 'SEC', label: 'Security' },
  { key: 'STORAGE', label: 'Storage' },
  { key: 'USAGE', label: 'Usage' },
];

/** All-"—" axes sharing one reason tooltip — the honest default state. */
function emptyAxes(reason: string): NullableAxis[] {
  return AXIS_META.map((m) => ({ key: m.key, label: m.label, score: null, desc: reason }));
}

/**
 * Null-aware ADN derivation. Unlike deriveProjectAdn (ProjectInspectorPanel),
 * an absent per-project source yields `null` ("—"), never a substituted 58.
 * DQ/PERF have native 0-100 sources; SEC/STORAGE/USAGE are threshold-banded
 * from real per-project signals, and stay null when no signal exists.
 */
function deriveNullableAdn(rollup: ProjectRollup): NullableAxis[] {
  const dq = cardOf(rollup, 'dq');
  const perf = cardOf(rollup, 'perf');
  const gov = cardOf(rollup, 'gov');
  const storage = cardOf(rollup, 'storage');

  // DQ — coverage % only when scored from this project's own objects.
  const dqVal = num(dq?.value);
  const dqProject = dq?.scope === 'project';
  const dqScore = dqVal != null && dqProject ? Math.round(dqVal) : null;

  // PERF — 100 − fail-rate% (needs runs).
  const failRate = num(perf?.value);
  const perfScore = failRate != null ? Math.max(0, Math.min(100, Math.round(100 - failRate))) : null;

  // SEC — banded from contributors + active RLS; null when no gov signal.
  const contributors = num(supportingOf(gov).contributors);
  const rls = num(supportingOf(gov).active_rls_policies);
  const secScore =
    contributors == null && rls == null ? null : contributors === 0 ? 42 : rls === 0 ? 65 : 85;

  // STORAGE — banded footprint, only when attributable to the project.
  const mb = num(storage?.value) ?? num(supportingOf(storage).storage_mb);
  const storageProject = storage?.scope === 'project';
  const storScore = mb != null && storageProject ? (mb > 500 ? 65 : 85) : null;

  // USAGE — adoption over the window (the rollup always returns an event count).
  const events = num(rollup.eventCount30d);
  const usageScore = events == null ? null : events === 0 ? 42 : events >= 20 ? 85 : 65;

  return [
    {
      key: 'DQ',
      label: 'Quality',
      score: dqScore,
      desc: dqScore != null ? "Quality coverage on this project's monitored objects." : 'No per-project quality source (objects not monitored).',
    },
    {
      key: 'PERF',
      label: 'Perf',
      score: perfScore,
      desc: perfScore != null ? 'Run success rate over the window.' : 'No runs recorded for this project.',
    },
    {
      key: 'SEC',
      label: 'Security',
      score: secScore,
      desc: secScore != null ? `${contributors ?? 0} contributor(s) · ${rls ?? 0} active RLS policy(ies).` : 'No governance signal for this project.',
    },
    {
      key: 'STORAGE',
      label: 'Storage',
      score: storScore,
      desc: storScore != null ? 'Storage footprint attributed to this project.' : 'No per-project storage attribution yet.',
    },
    {
      key: 'USAGE',
      label: 'Usage',
      score: usageScore,
      desc: usageScore != null ? `${events ?? 0} event(s) over the window.` : 'No usage signal for this project.',
    },
  ];
}

export default function AdnHeaderBadge() {
  // Per-module project only — never the shared cross-module activeProject atom
  // (that would surface another module's project under an account-wide DQ page).
  const { lastProjectId } = useProjectContext('data_quality');
  const { data, loading, unavailable } = useProjectRollup(lastProjectId);

  let axes: NullableAxis[];
  if (!lastProjectId) {
    axes = emptyAxes('Per-project ADN — no project is scoped to Data Quality yet.');
  } else if (unavailable) {
    axes = emptyAxes('Per-project ADN scoring is not provisioned on this backend yet.');
  } else if (data) {
    axes = deriveNullableAdn(data);
  } else {
    // loading or a transient error → still honest "—", never a fabricated 0.
    axes = emptyAxes(loading ? 'Computing per-project ADN…' : 'Per-project ADN is currently unavailable.');
  }

  const real = axes.map((a) => a.score).filter((s): s is number => s != null);
  const overall = real.length ? Math.round(real.reduce((a, b) => a + b, 0) / real.length) : null;
  const overallTone = toneOf(overall);
  const showPulse = !!lastProjectId && loading;

  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white/95 px-2 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-900/95"
      aria-label="Project ADN — 5-axis health"
      data-testid="dq-adn-badge"
    >
      <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">ADN</span>
      {axes.map((a) => {
        const Icon = AXIS_ICON[a.key];
        const cls = TONE_CLS[toneOf(a.score)];
        return (
          <span
            key={a.key}
            title={`${a.label}: ${a.score == null ? '—' : `${a.score}/100 · ${rating(a.score)}`} — ${a.desc}`}
            className={cn('flex items-center gap-0.5 rounded-md px-1 py-0.5', cls.chip, showPulse && 'animate-pulse')}
          >
            {Icon && <Icon className={cn('h-3.5 w-3.5', cls.icon)} />}
            <span className={cn('text-[10px] font-semibold tabular-nums', cls.text)}>
              {a.score == null ? '—' : a.score}
            </span>
          </span>
        );
      })}
      <span
        title={overall == null ? 'Overall ADN — not computed (no per-project axis available yet)' : `Overall ADN ${overall}/100 · ${rating(overall)}`}
        className={cn('ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums', OVERALL_CLS[overallTone])}
      >
        {overall == null ? '—' : overall}
      </span>
    </div>
  );
}
