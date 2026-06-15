'use client';

/**
 * WorkflowAdnBadge — the R6 5-axis ADN header badge for the workflow module.
 *
 * Renders a compact icon+score strip (the AdnScoreCard `compact` look) in the
 * workflow page header, fed by THIS workflow's precomputed per-project rollup
 * (`useProjectRollup` → `GET /command-center/projects/{id}/rollup`; in the
 * unified projects model workflow_id === project_id).
 *
 * Why this isn't `<AdnScoreCard axes={…} compact />` directly
 * ────────────────────────────────────────────────────────────
 * `AdnScoreCard`/`ScoreAxis.score` is a REQUIRED `number`, and the canonical
 * `deriveProjectAdn` (private to `ProjectInspectorPanel`) substitutes
 * `BAND.neutral = 58` for any axis lacking a real per-project source. Because
 * `adnTone(58) = rose`, a *missing* axis would render as a red "58" — conflating
 * "unknown" with "bad". In the workflow module that bites hardest: STORAGE has
 * no per-project attribution (the sibling `ProjectScoreBadges` *always* shows
 * "—" for storage) and DQ is usually account-scoped, so two axes would be
 * fake-red. That violates the no-fake-0 / no-static-placeholder rule.
 *
 * So this is a local, null-aware variant: `deriveWorkflowAdn` mirrors
 * `deriveProjectAdn` exactly but emits `score: null` everywhere the original
 * falls back to neutral, and the strip renders a gray "—" chip for null axes
 * (the `TONE_EMPTY` pattern from `ProjectScoreBadges`). Measured-but-banded
 * axes keep their number; only truly-unprovisioned axes become "—". Visual
 * parity is preserved by reusing `AXIS_ICON` / `adnTone` / `ratingLabel` from
 * `AdnAxes` — the sole delta from AdnScoreCard compact is the null path.
 *
 * Follow-up (outside this module's ownership): extract the derivation + widen
 * `ScoreAxis` to `score: number | null` so `AdnScoreCard` can render "—" itself.
 */
// ////dependency//// workflow → shared.score-cards.useProjectRollup, shared.command-center.AdnAxes
import { useProjectRollup } from '@/app/shared/score-cards/useProjectRollup';
import { AXIS_ICON, adnTone, ratingLabel } from '@/app/shared/command-center/AdnAxes';
import type {
  ProjectRollup,
  ScoreCard,
  ScoreCardDimension,
} from '@/app/services/command-center/score-cards';

const EMPTY = '—';

/** Threshold band scores — identical to `deriveProjectAdn` (ProjectInspectorPanel). */
const BAND = { good: 85, warn: 65, bad: 42 } as const;

/** Null-aware axis: `score === null` ⟺ no per-project source → render "—". */
interface NullableAxis {
  key: string;
  label: string;
  score: number | null;
  desc?: string;
}

// ── Value helpers (local mirror of ProjectInspectorPanel's private helpers) ──

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function findCard(rollup: ProjectRollup, dim: ScoreCardDimension): ScoreCard | undefined {
  return rollup.cards.find((c) => c.dimension === dim);
}

function supportingOf(card: ScoreCard | undefined): Record<string, unknown> {
  return (card?.supporting ?? {}) as Record<string, unknown>;
}

function formatPct(v: number): string {
  return `${Number.isInteger(v) ? v : Math.round(v * 10) / 10}%`;
}

function formatStorage(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

// ── 5-axis ADN derivation (per-project, honest null) ─────────────────────────
//
// Mirrors `deriveProjectAdn` 1:1 — but where that function falls back to
// `BAND.neutral`, this emits `null` so the axis honestly renders "—" instead of
// a misleading rose-58. Only DQ (coverage %) and PERF (100 − fail-rate) have a
// native 0-100 source; SEC/STORAGE/USAGE are threshold-banded with the SAME
// good/warn/bad thresholds the rest of the UI uses.

function deriveWorkflowAdn(rollup: ProjectRollup): NullableAxis[] {
  const dq = findCard(rollup, 'dq');
  const perf = findCard(rollup, 'perf');
  const gov = findCard(rollup, 'gov');
  const storage = findCard(rollup, 'storage');

  // ── DQ (Qualité) — coverage % only when scored per-project, else "—" ──
  const dqVal = num(dq?.value);
  const dqIsProject = dq?.scope === 'project';
  const dqAxis: NullableAxis = {
    key: 'DQ',
    label: 'Qualité',
    score: dqVal != null && dqIsProject ? Math.round(dqVal) : null,
    desc:
      dqVal != null && dqIsProject
        ? `Couverture qualité ${formatPct(dqVal)} sur les objets de ce projet.`
        : 'Pas de source qualité par-projet (objets non monitorés DMF).',
  };

  // ── PERF — score = 100 − fail-rate% when runs exist, else "—" ──
  const failRate = num(perf?.value);
  const totalRuns = num(supportingOf(perf).total_runs);
  const perfAxis: NullableAxis = {
    key: 'PERF',
    label: 'Perf',
    score: failRate != null ? Math.max(0, Math.min(100, Math.round(100 - failRate))) : null,
    desc:
      failRate != null
        ? `Taux d'échec ${formatPct(failRate)}${totalRuns != null ? ` · ${totalRuns} run(s)` : ''}.`
        : 'Aucun run enregistré pour ce projet.',
  };

  // ── SEC (Sécurité/Gov) — banded from contributors + active RLS; no signal → "—" ──
  const contributors = num(supportingOf(gov).contributors);
  const rls = num(supportingOf(gov).active_rls_policies);
  let secScore: number | null = null;
  if (contributors === 0) secScore = BAND.bad;
  else if (rls === 0) secScore = BAND.warn;
  else if (contributors != null || rls != null) secScore = BAND.good;
  const secAxis: NullableAxis = {
    key: 'SEC',
    label: 'Sécurité',
    score: secScore,
    desc:
      secScore != null
        ? `${contributors ?? EMPTY} contributeur(s) · ${rls ?? EMPTY} policy RLS active(s).`
        : 'Aucun signal de gouvernance attribuable à ce projet.',
  };

  // ── STORAGE — banded footprint (>500 MB warn) only when per-project; else "—" ──
  const mb = num(storage?.value) ?? num(supportingOf(storage).storage_mb);
  const storageIsProject = storage?.scope === 'project';
  let storScore: number | null = null;
  if (mb != null && storageIsProject) storScore = mb > 500 ? BAND.warn : BAND.good;
  const storAxis: NullableAxis = {
    key: 'STORAGE',
    label: 'Stockage',
    score: storScore,
    desc:
      mb != null
        ? `${formatStorage(mb)}${storageIsProject ? '' : ' (niveau compte — pas d’attribution par-projet).'}`
        : 'Aucun objet de stockage attribuable à ce projet.',
  };

  // ── USAGE — adoption/activity over the window (events + runs) ──
  // `eventCount30d` is defaulted to 0 upstream, so a bare "0" is ambiguous. We
  // disambiguate with `lastEventAt`: 0 events AND no event ever recorded → no
  // telemetry → "—" (honest unknown, NOT a fake-bad rose 0). 0 events but a
  // prior event exists → genuine low in-window usage → banded bad.
  const events = num(rollup.eventCount30d);
  const hasEverHadEvent = rollup.lastEventAt != null;
  let usageScore: number | null = null;
  if (events != null && (events > 0 || hasEverHadEvent)) {
    usageScore = events === 0 ? BAND.bad : events >= 20 ? BAND.good : BAND.warn;
  }
  const usageAxis: NullableAxis = {
    key: 'USAGE',
    label: 'Usage',
    score: usageScore,
    desc:
      usageScore == null
        ? 'Aucune télémétrie d’usage pour ce projet.'
        : `${events ?? EMPTY} évènement(s) sur la fenêtre${totalRuns != null ? ` · ${totalRuns} run(s)` : ''}.`,
  };

  return [dqAxis, perfAxis, secAxis, storAxis, usageAxis];
}

// ── Presentation ─────────────────────────────────────────────────────────────

function Popover({ axis, overall }: { axis?: NullableAxis; overall?: number | null }) {
  const score = axis ? axis.score : overall ?? null;
  const t = score != null ? adnTone(score) : null;
  const Icon = axis ? AXIS_ICON[axis.key] : undefined;
  const label = axis ? axis.label : 'Note ADN globale';
  return (
    <div className="invisible absolute right-0 top-full z-50 mt-1.5 w-64 translate-y-1 rounded-xl border border-gray-200 bg-white p-3 text-left opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-1.5 flex items-center gap-2">
        {Icon && <Icon className={t ? `h-4 w-4 text-${t}-500` : 'h-4 w-4 text-slate-400'} />}
        <span className="text-xs font-semibold text-gray-900 dark:text-white">{label}</span>
        <span
          className={
            t
              ? `ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold bg-${t}-100 text-${t}-700 dark:bg-${t}-900/30 dark:text-${t}-300`
              : 'ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          }
        >
          {score != null ? `${score}/100 · ${ratingLabel(score)}` : '— · non disponible'}
        </span>
      </div>
      {axis ? (
        axis.desc && <p className="text-[11px] text-gray-500 dark:text-gray-400">{axis.desc}</p>
      ) : (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Score composite des axes mesurables (Qualité · Perf · Sécurité · Stockage · Usage). Les
          axes sans source par-projet affichent «&nbsp;—&nbsp;» plutôt qu’un score fabriqué.
        </p>
      )}
    </div>
  );
}

function AxisChip({ axis }: { axis: NullableAxis }) {
  const Icon = AXIS_ICON[axis.key];

  if (axis.score == null) {
    return (
      <div className="group relative">
        <button
          type="button"
          aria-label={`${axis.label} : non disponible`}
          className="flex items-center gap-0.5 rounded-md border border-dashed border-slate-200 px-1 py-0.5 text-slate-400 dark:border-slate-700 dark:text-slate-500"
        >
          {Icon && <Icon className="h-3.5 w-3.5" />}
          <span className="text-[10px] font-semibold">{EMPTY}</span>
        </button>
        <Popover axis={axis} />
      </div>
    );
  }

  const t = adnTone(axis.score);
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={`${axis.label} ${axis.score} sur 100`}
        className={`flex items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors bg-${t}-50 hover:bg-${t}-100 dark:bg-${t}-900/20 dark:hover:bg-${t}-900/40`}
      >
        {Icon && <Icon className={`h-3.5 w-3.5 text-${t}-500`} />}
        <span className={`text-[10px] font-semibold text-${t}-700 dark:text-${t}-300`}>
          {axis.score}
        </span>
      </button>
      <Popover axis={axis} />
    </div>
  );
}

function Skeleton() {
  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-900"
      aria-hidden="true"
    >
      <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">ADN</span>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="h-4 w-7 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
      ))}
      <span className="ml-0.5 h-4 w-6 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

export interface WorkflowAdnBadgeProps {
  /** Active workflow id (== project id). Falsy → renders nothing. */
  projectId: string | null;
  /** Optional lookback window in days (backend default: 30). */
  days?: number;
}

/**
 * Compact 5-axis ADN strip for the workflow header. Loading → skeleton;
 * route unprovisioned (404/501) or a hard error → renders nothing (matching the
 * sibling components' availability contract — never a broken header badge).
 */
export default function WorkflowAdnBadge({ projectId, days }: WorkflowAdnBadgeProps) {
  // Hook is always called (it no-ops on a falsy id) so hook order is stable.
  const { data, loading, error, unavailable } = useProjectRollup(projectId, days);

  if (!projectId) return null;
  if (unavailable || error) return null;
  if (loading || !data) return <Skeleton />;

  const axes = deriveWorkflowAdn(data);
  const measured = axes.map((a) => a.score).filter((s): s is number => s != null);
  const overall = measured.length
    ? Math.round(measured.reduce((s, v) => s + v, 0) / measured.length)
    : null;
  const to = overall != null ? adnTone(overall) : null;

  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-900"
      data-testid="workflow-adn-badge"
    >
      <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">ADN</span>
      {axes.map((a) => (
        <AxisChip key={a.key} axis={a} />
      ))}
      <div className="group relative">
        <button
          type="button"
          aria-label={
            overall != null ? `Note ADN globale ${overall} sur 100` : 'Note ADN globale : non disponible'
          }
          className={
            to
              ? `ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-${to}-100 text-${to}-700 hover:brightness-95 dark:bg-${to}-900/30 dark:text-${to}-300`
              : 'ml-0.5 rounded-full border border-dashed border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 dark:border-slate-700 dark:text-slate-500'
          }
        >
          {overall != null ? overall : EMPTY}
        </button>
        <Popover overall={overall} />
      </div>
    </div>
  );
}
