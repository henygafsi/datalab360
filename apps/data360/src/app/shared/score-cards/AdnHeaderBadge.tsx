'use client';

/**
 * AdnHeaderBadge — the ONE consolidated 5-axis ADN header badge.
 *
 * Replaces three near-duplicate forks (command-center/AdnBadge,
 * data-quality/AdnHeaderBadge, workflow/WorkflowAdnBadge) with a single
 * parameterized component. Renders a compact icon+score strip for the five
 * Data360 health axes — Qualité · Perf · Sécurité · Stockage · Usage — plus an
 * overall roll-up chip, fed by ONE per-project rollup (`useProjectRollup`).
 *
 * Honesty contract (no fake data):
 *   · Each axis without a real per-project source renders an honest gray "—"
 *     chip, NEVER a band-substituted number (a missing axis must not look "bad").
 *   · `unavailable` (404/501) or a hard error → the badge self-hides (renders
 *     nothing) rather than show a broken/empty header strip.
 *   · `!projectId` → nothing to score → renders nothing.
 *   · Loading → a neutral skeleton (no fabricated zeros).
 *
 * Each axis is a hover popover with three honest sections derived from the real
 * rollup numbers: what the axis measures (desc), an AI reading of the current
 * state (reading), and a recommended action (action). Copy is neutral — no
 * vendor names.
 *
 * Tailwind note: tone-dependent classes are LITERAL (TONE_CLS / PILL_CLS maps),
 * never `bg-${tone}-50`. The app safelist covers blue/violet/cyan/green/purple/
 * rose/orange/gray but NOT emerald or amber (two of the three ADN tones), so
 * dynamic interpolation would silently drop styles. Literal strings are always
 * statically scannable by the JIT.
 */
// ////dependency//// shared.score-cards → shared.score-cards.useProjectRollup, shared.command-center.AdnAxes
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useProjectRollup } from '@/app/shared/score-cards/useProjectRollup';
import { AXIS_ICON, adnTone, ratingLabel } from '@/app/shared/command-center/AdnAxes';
import type {
  ProjectRollup,
  ScoreCard,
  ScoreCardDimension,
} from '@/app/services/command-center/score-cards';
import { cn } from '@/lib/utils';

const EMPTY = '—';

/** Threshold band scores — identical to the rest of the ADN UI. */
const BAND = { good: 85, warn: 65, bad: 42 } as const;

type AxisKey = 'DQ' | 'PERF' | 'SEC' | 'STORAGE' | 'USAGE';
type Tone = 'emerald' | 'amber' | 'rose' | 'slate';

/**
 * Null-aware axis: `score === null` ⟺ no per-project source → render "—".
 * `desc` / `reading` / `action` feed the three popover sections and are always
 * populated (the null path explains *why it's unavailable + how to enable it*).
 */
interface NullableAxis {
  key: AxisKey;
  label: string;
  score: number | null;
  /** What this axis measures. */
  desc: string;
  /** AI reading of the current state (derived from real rollup numbers). */
  reading: string;
  /** Recommended next action. */
  action: string;
  /** Deep-link that raises THIS axis (honest mapping; undefined = no lift route). */
  actionHref?: string;
}

/**
 * Honest ADN axis → "raise this score" deep-link. Only axes with a real,
 * score-moving action get a link (per the explore-design ADN-CTA spec):
 *   DQ → data-quality (set up monitoring) · SEC → governance policies (add RLS)
 *   PERF → workflow run history (failing runs) · USAGE → data-products.
 * STORAGE is informational (no single lift action) → no link, plain text.
 * Masking/clustering are deliberately NOT surfaced (they move no axis).
 */
function adnActionHref(key: AxisKey, projectId: string | null | undefined): string | undefined {
  if (!projectId) return undefined;
  const p = `project=${encodeURIComponent(projectId)}`;
  switch (key) {
    case 'DQ': return `/data-quality?${p}&adn=dq`;
    case 'SEC': return `/governance/policies?${p}&adn=sec`;
    case 'PERF': return `/workflow?${p}&adn=perf`;
    case 'USAGE': return `/data-products?${p}&adn=usage`;
    case 'STORAGE': return undefined;
    default: return undefined;
  }
}

// ── Literal tone classes (JIT-safe; see header note) ─────────────────────────

const TONE_CLS: Record<Tone, { chip: string; icon: string; text: string }> = {
  emerald: {
    chip: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40',
    icon: 'text-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  amber: {
    chip: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40',
    icon: 'text-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
  },
  rose: {
    chip: 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40',
    icon: 'text-rose-500',
    text: 'text-rose-700 dark:text-rose-300',
  },
  slate: {
    chip: 'border border-dashed border-slate-200 dark:border-slate-700',
    icon: 'text-slate-400',
    text: 'text-slate-400 dark:text-slate-500',
  },
};

/** Pill / popover-header-chip styling (bg-100 · text-700). */
const PILL_CLS: Record<Tone, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

function toneOf(score: number | null): Tone {
  return score == null ? 'slate' : (adnTone(score) as Tone);
}

// ── Value helpers ────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function supportingOf(card?: ScoreCard): Record<string, unknown> {
  return (card?.supporting ?? {}) as Record<string, unknown>;
}
function cardOf(rollup: ProjectRollup, dim: ScoreCardDimension): ScoreCard | undefined {
  return rollup.cards.find((c) => c.dimension === dim);
}
function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}
function fmtPct(v: number): string {
  return `${Number.isInteger(v) ? v : Math.round(v * 10) / 10}%`;
}
function fmtStorage(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** Pick a value by score band — `null` score resolves to `none`. */
function pick<T>(score: number | null, opts: { good: T; warn: T; bad: T; none: T }): T {
  if (score == null) return opts.none;
  if (score >= 80) return opts.good;
  if (score >= 60) return opts.warn;
  return opts.bad;
}

// ── 5-axis ADN derivation (per-project, honest null) ─────────────────────────
//
// Mirrors the canonical per-project derivation but emits `score: null` wherever
// no real per-project source exists, so the axis honestly renders "—" instead
// of a misleading neutral band. Only DQ (coverage %) and PERF (100 − fail-rate)
// have a native 0-100 source; SEC/STORAGE/USAGE are threshold-banded from real
// per-project signals and stay null when no signal exists. Every reading/action
// references ONLY numbers actually present in the rollup.

function deriveAdn(rollup: ProjectRollup): NullableAxis[] {
  const dq = cardOf(rollup, 'dq');
  const perf = cardOf(rollup, 'perf');
  const gov = cardOf(rollup, 'gov');
  const storage = cardOf(rollup, 'storage');

  // ── Qualité — coverage % only when scored from this project's own objects ──
  const dqVal = num(dq?.value);
  const dqIsProject = dq?.scope === 'project';
  const dqScore = dqVal != null && dqIsProject ? Math.round(dqVal) : null;
  const dqAxis: NullableAxis = {
    key: 'DQ',
    label: 'Qualité',
    score: dqScore,
    desc:
      dqScore != null
        ? 'Couverture qualité des objets surveillés de ce projet.'
        : 'Pas de source qualité par-projet (objets non surveillés).',
    reading: pick(dqScore, {
      good: `Couverture qualité solide (${dqVal != null ? fmtPct(dqVal) : EMPTY}) sur les objets de ce projet.`,
      warn: `Couverture qualité partielle (${dqVal != null ? fmtPct(dqVal) : EMPTY}) — des objets restent non contrôlés.`,
      bad: `Couverture qualité faible (${dqVal != null ? fmtPct(dqVal) : EMPTY}) — beaucoup d'objets non conformes.`,
      none: "Aucun objet de ce projet n'est surveillé — la qualité ne peut pas être notée.",
    }),
    action: pick(dqScore, {
      good: 'Maintenir les contrôles et les étendre aux nouveaux objets.',
      warn: 'Ajouter des contrôles de qualité sur les objets non couverts.',
      bad: 'Prioriser le contrôle qualité des objets critiques du projet.',
      none: 'Activer le monitoring qualité sur les objets déployés.',
    }),
  };

  // ── Perf — score = 100 − fail-rate% when runs exist, else "—" ──
  const failRate = num(perf?.value);
  const totalRuns = num(supportingOf(perf).total_runs);
  const perfScore = failRate != null ? clamp100(100 - failRate) : null;
  const runsSuffix = totalRuns != null ? ` · ${totalRuns} run(s)` : '';
  const perfAxis: NullableAxis = {
    key: 'PERF',
    label: 'Perf',
    score: perfScore,
    desc:
      perfScore != null
        ? "Taux de réussite des exécutions sur la fenêtre."
        : 'Aucune exécution enregistrée pour ce projet.',
    reading: pick(perfScore, {
      good: `Exécutions fiables — taux d'échec ${failRate != null ? fmtPct(failRate) : EMPTY}${runsSuffix}.`,
      warn: `Quelques échecs à surveiller — taux d'échec ${failRate != null ? fmtPct(failRate) : EMPTY}${runsSuffix}.`,
      bad: `Échecs fréquents — taux d'échec ${failRate != null ? fmtPct(failRate) : EMPTY}${runsSuffix}.`,
      none: "Aucune exécution n'a encore tourné — la performance est inconnue.",
    }),
    action: pick(perfScore, {
      good: 'Aucune action requise ; poursuivre le suivi des exécutions.',
      warn: 'Inspecter les exécutions en échec récentes.',
      bad: 'Diagnostiquer et corriger les exécutions en échec.',
      none: "Lancer le pipeline pour collecter des métriques d'exécution.",
    }),
  };

  // ── Sécurité — banded from contributors + active RLS; no signal → "—" ──
  const contributors = num(supportingOf(gov).contributors);
  const rls = num(supportingOf(gov).active_rls_policies);
  let secScore: number | null = null;
  if (contributors === 0) secScore = BAND.bad;
  else if (rls === 0) secScore = BAND.warn;
  else if (contributors != null || rls != null) secScore = BAND.good;
  const secStats = `${contributors ?? EMPTY} contributeur(s) · ${rls ?? EMPTY} policy RLS active(s).`;
  const secAxis: NullableAxis = {
    key: 'SEC',
    label: 'Sécurité',
    score: secScore,
    desc:
      secScore != null
        ? 'Gouvernance des accès : contributeurs et policies de sécurité actives.'
        : 'Aucun signal de gouvernance attribuable à ce projet.',
    reading: pick(secScore, {
      good: `Gouvernance en place — ${secStats}`,
      warn: `Aucune policy de sécurité au niveau ligne — ${secStats}`,
      bad: `Aucun contributeur identifié — ${secStats}`,
      none: 'Aucun signal de sécurité — état inconnu pour ce projet.',
    }),
    action: pick(secScore, {
      good: "Programmer une revue d'accès périodique.",
      warn: 'Ajouter une row-access policy sur les données sensibles.',
      bad: 'Attribuer des rôles et des grants au projet.',
      none: 'Configurer les rôles et policies du projet.',
    }),
  };

  // ── Stockage — banded footprint (>500 MB warn) only when per-project ──
  const mb = num(storage?.value) ?? num(supportingOf(storage).storage_mb);
  const storageIsProject = storage?.scope === 'project';
  let storScore: number | null = null;
  if (mb != null && storageIsProject) storScore = mb > 500 ? BAND.warn : BAND.good;
  const storAxis: NullableAxis = {
    key: 'STORAGE',
    label: 'Stockage',
    score: storScore,
    desc:
      storScore != null
        ? 'Empreinte de stockage attribuée à ce projet.'
        : 'Aucune attribution de stockage par-projet.',
    reading: pick(storScore, {
      good: `Empreinte maîtrisée — ${mb != null ? fmtStorage(mb) : EMPTY} attribués à ce projet.`,
      warn: `Empreinte élevée (>500 MB) — ${mb != null ? fmtStorage(mb) : EMPTY} attribués à ce projet.`,
      bad: `Empreinte élevée — ${mb != null ? fmtStorage(mb) : EMPTY} attribués à ce projet.`,
      none: "Le stockage n'est mesuré qu'au niveau du compte aujourd'hui.",
    }),
    action: pick(storScore, {
      good: 'Aucune action requise.',
      warn: 'Réduire la rétention des données froides.',
      bad: 'Réduire la rétention des données froides.',
      none: "Activer l'attribution du stockage par projet.",
    }),
  };

  // ── Usage — adoption over the window (events). `eventCount30d` defaults to 0
  // upstream, so a bare 0 is ambiguous: 0 events AND no event ever recorded
  // (`lastEventAt == null`) → no telemetry → "—" (honest unknown). 0 events with
  // a prior event → genuine low in-window usage → banded bad. ──
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
      usageScore != null
        ? "Adoption réelle du projet sur la fenêtre."
        : "Aucune télémétrie d'usage pour ce projet.",
    reading: pick(usageScore, {
      good: `Bonne adoption — ${events ?? EMPTY} évènement(s) sur la fenêtre.`,
      warn: `Adoption modérée — ${events ?? EMPTY} évènement(s) sur la fenêtre.`,
      bad: `Aucune activité sur la fenêtre — ${events ?? EMPTY} évènement(s).`,
      none: 'Pas de télémétrie — usage inconnu pour ce projet.',
    }),
    action: pick(usageScore, {
      good: 'Capitaliser : exposer ce projet en produit ou API.',
      warn: "Promouvoir l'usage auprès des équipes concernées.",
      bad: "Relancer l'adoption du projet.",
      none: "Activer le suivi d'évènements sur le projet.",
    }),
  };

  return [dqAxis, perfAxis, secAxis, storAxis, usageAxis];
}

// ── Presentation ─────────────────────────────────────────────────────────────

interface OverallInfo {
  /** Composite score, or null when no axis is measurable. */
  score: number | null;
  /** How many of the 5 axes are measured (for the composite reading). */
  measured: number;
}

function Popover({ axis, overall }: { axis?: NullableAxis; overall?: OverallInfo }) {
  const score = axis ? axis.score : overall!.score;
  const tone = toneOf(score);
  const Icon = axis ? AXIS_ICON[axis.key] : undefined;
  const label = axis ? axis.label : 'Note ADN globale';
  return (
    <div className="invisible absolute right-0 top-full z-50 mt-1.5 w-72 translate-y-1 rounded-xl border border-gray-200 bg-white p-3 text-left opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-1.5 flex items-center gap-2">
        {Icon && <Icon className={cn('h-4 w-4', TONE_CLS[tone].icon)} />}
        <span className="text-xs font-semibold text-gray-900 dark:text-white">{label}</span>
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
            PILL_CLS[tone],
          )}
        >
          {score != null ? `${score}/100 · ${ratingLabel(score)}` : `${EMPTY} · non disponible`}
        </span>
      </div>

      {axis ? (
        <>
          <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{axis.desc}</p>
          <div className="mb-1.5 rounded-lg bg-violet-50 p-2 dark:bg-violet-900/15">
            <p className="mb-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
              <Sparkles className="h-3 w-3" /> Analyse IA
            </p>
            <p className="text-[11px] leading-snug text-gray-700 dark:text-gray-200">{axis.reading}</p>
          </div>
          <div className="flex items-start gap-1 text-[11px] leading-snug text-gray-600 dark:text-gray-300">
            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
            <span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">Action&nbsp;: </span>
              {axis.actionHref ? (
                <Link
                  href={axis.actionHref}
                  className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-300"
                >
                  {axis.action}
                </Link>
              ) : (
                axis.action
              )}
            </span>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {overall!.score != null
            ? `Moyenne de ${overall!.measured}/5 axes disponibles (Qualité · Perf · Sécurité · Stockage · Usage). Les axes sans source par-projet affichent « — ».`
            : "Aucun axe par-projet n'est disponible pour ce projet — chaque axe affiche « — » plutôt qu'un score fabriqué."}
        </p>
      )}
    </div>
  );
}

function AxisChip({ axis }: { axis: NullableAxis }) {
  const Icon = AXIS_ICON[axis.key];
  const tone = toneOf(axis.score);
  const cls = TONE_CLS[tone];
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={
          axis.score == null
            ? `${axis.label} : non disponible`
            : `${axis.label} ${axis.score} sur 100`
        }
        className={cn('flex items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors', cls.chip)}
      >
        {Icon && <Icon className={cn('h-3.5 w-3.5', cls.icon)} />}
        <span className={cn('text-[10px] font-semibold tabular-nums', cls.text)}>
          {axis.score == null ? EMPTY : axis.score}
        </span>
      </button>
      <Popover axis={axis} />
    </div>
  );
}

function Skeleton({ compact, className }: { compact: boolean; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-900',
        className,
      )}
      aria-hidden="true"
    >
      {!compact && (
        <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">ADN</span>
      )}
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="h-4 w-7 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
      ))}
      <span className="ml-0.5 h-4 w-6 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

export interface AdnHeaderBadgeProps {
  /**
   * Project (== workflow id in the unified projects model) to score. Falsy →
   * nothing to score → renders nothing.
   */
  projectId: string | null | undefined;
  /**
   * Denser variant: drops the leading "ADN" label + tightens the gap for cramped
   * headers. Still renders all 5 axes + the overall chip.
   */
  compact?: boolean;
  className?: string;
}

/**
 * The consolidated 5-axis ADN header badge. Fed by `useProjectRollup(projectId)`
 * (→ `GET /command-center/projects/{id}/rollup`). Loading → skeleton; route
 * unprovisioned (404/501) or a hard error → renders nothing (never a broken
 * header badge); each missing axis → honest "—".
 */
export default function AdnHeaderBadge({ projectId, compact = false, className }: AdnHeaderBadgeProps) {
  // Hook is always called (it no-ops on a falsy id) so hook order stays stable.
  const { data, loading, error, unavailable } = useProjectRollup(projectId);

  // Self-hide: nothing to score, route not provisioned, or a hard failure. A
  // blank/all-"—" badge in these cases would conflate "no data source" with
  // "fetch failed" — the dishonest signal the no-fake-data rule forbids.
  if (!projectId) return null;
  if (unavailable || error) return null;
  if (loading || !data) return <Skeleton compact={compact} className={className} />;

  const axes = deriveAdn(data).map((a) => ({ ...a, actionHref: adnActionHref(a.key, projectId) }));
  const measured = axes.map((a) => a.score).filter((s): s is number => s != null);
  const overallScore = measured.length
    ? Math.round(measured.reduce((s, v) => s + v, 0) / measured.length)
    : null;
  const overallTone = toneOf(overallScore);
  const overall: OverallInfo = { score: overallScore, measured: measured.length };

  return (
    <div
      className={cn(
        'flex items-center rounded-xl border border-gray-200 bg-white px-2 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-900',
        compact ? 'gap-0.5' : 'gap-1',
        className,
      )}
      aria-label="Note ADN du projet — 5 axes de santé"
      data-testid="adn-header-badge"
    >
      {!compact && (
        <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">ADN</span>
      )}
      {axes.map((a) => (
        <AxisChip key={a.key} axis={a} />
      ))}
      <div className="group relative">
        <button
          type="button"
          aria-label={
            overallScore != null
              ? `Note ADN globale ${overallScore} sur 100`
              : 'Note ADN globale : non disponible'
          }
          className={cn(
            'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
            PILL_CLS[overallTone],
            overallTone !== 'slate' && 'hover:brightness-95',
          )}
        >
          {overallScore != null ? overallScore : EMPTY}
        </button>
        <Popover overall={overall} />
      </div>
    </div>
  );
}
