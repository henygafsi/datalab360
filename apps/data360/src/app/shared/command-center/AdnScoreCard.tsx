'use client';

/**
 * AdnScoreCard — a compact, reusable ADN score card that generalizes AdnBadge
 * (single-row icon+score strip) and AxesRatingCard (per-axis rows) into one
 * per-tab component. Unlike AdnBadge (hardcoded ACCOUNT_ADN, no props) it takes
 * its `axes` from props so every Account-Overview tab can feed a pure
 * `deriveAxes(tabData) → 5 axes` instead of the global sample.
 *
 *   compact=true  → a single-row icon+score strip with hover popover (like AdnBadge)
 *   compact=false → icon+label+score rows + an overall roll-up chip
 *
 * Icons are resolved per-axis from the custom AXIS_ICON set (falls back to a
 * supplied `Icon`), so callers may pass icon-less axes (`{key,label,score}`).
 */

import { Sparkles } from 'lucide-react';
import { ACCOUNT_ADN, AXIS_ICON, adnTone, adnOverall, ratingLabel, type AdnAxis } from './AdnAxes';

/** Loosened axis shape: `Icon` is optional (resolved from AXIS_ICON by key). */
export type ScoreAxis = Omit<AdnAxis, 'Icon'> & { Icon?: AdnAxis['Icon'] };

function axisIcon(a: ScoreAxis) {
  return a.Icon ?? AXIS_ICON[a.key];
}

function Popover({ axis, overall }: { axis?: ScoreAxis; overall?: number }) {
  const Icon = axis ? axisIcon(axis) : undefined;
  const score = axis ? axis.score : overall!;
  const t = adnTone(score);
  return (
    <div className="invisible absolute right-0 top-full z-50 mt-1.5 w-72 translate-y-1 rounded-xl border border-gray-200 bg-white p-3 text-left opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-1.5 flex items-center gap-2">
        {Icon && <Icon className={`h-4 w-4 text-${t}-500`} />}
        <span className="text-xs font-semibold text-gray-900 dark:text-white">
          {axis ? axis.label : 'Note ADN globale'}
        </span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold bg-${t}-100 text-${t}-700 dark:bg-${t}-900/30 dark:text-${t}-300`}
        >
          {score}/100 · {ratingLabel(score)}
        </span>
      </div>
      {axis ? (
        <>
          {axis.desc && <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{axis.desc}</p>}
          {axis.analysis && (
            <div className="rounded-lg bg-violet-50 p-2 dark:bg-violet-900/15">
              <p className="mb-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                <Sparkles className="h-3 w-3" /> Analyse IA
              </p>
              <p className="text-[11px] leading-snug text-gray-700 dark:text-gray-200">{axis.analysis}</p>
            </div>
          )}
        </>
      ) : (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Score composite des axes (Qualité · Perf · Sécurité · Stockage · Usage). Survolez chaque axe pour le détail.
        </p>
      )}
    </div>
  );
}

export default function AdnScoreCard({
  axes = ACCOUNT_ADN,
  title = 'ADN',
  compact = false,
}: {
  axes?: ScoreAxis[];
  title?: string;
  compact?: boolean;
}) {
  const overall = adnOverall(axes);
  const to = adnTone(overall);

  // Single-row strip (like AdnBadge) — for tab header rows.
  if (compact) {
    return (
      <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">{title}</span>
        {axes.map((a) => {
          const Icon = axisIcon(a);
          const at = adnTone(a.score);
          return (
            <div key={a.key} className="group relative">
              <button
                type="button"
                aria-label={`${a.label} ${a.score} sur 100`}
                className={`flex items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors bg-${at}-50 hover:bg-${at}-100 dark:bg-${at}-900/20 dark:hover:bg-${at}-900/40`}
              >
                {Icon && <Icon className={`h-3.5 w-3.5 text-${at}-500`} />}
                <span className={`text-[10px] font-semibold text-${at}-700 dark:text-${at}-300`}>{a.score}</span>
              </button>
              {(a.analysis || a.desc) && <Popover axis={a} />}
            </div>
          );
        })}
        <div className="group relative">
          <button
            type="button"
            aria-label={`Note ADN globale ${overall} sur 100`}
            className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-${to}-100 text-${to}-700 hover:brightness-95 dark:bg-${to}-900/30 dark:text-${to}-300`}
          >
            {overall}
          </button>
          <Popover overall={overall} />
        </div>
      </div>
    );
  }

  // Per-axis rows (lighter than AxesRatingCard — no radar) + overall chip.
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{title}</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold bg-${to}-100 text-${to}-700 dark:bg-${to}-900/30 dark:text-${to}-300`}
        >
          {overall}/100 · {ratingLabel(overall)}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {axes.map((a) => {
          const Icon = axisIcon(a);
          const t = adnTone(a.score);
          return (
            <div
              key={a.key}
              className="flex items-center justify-between rounded-lg border border-gray-100 px-2 py-1 dark:border-gray-800"
            >
              <span className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                {Icon && <Icon className={`h-3.5 w-3.5 text-${t}-500`} />}
                {a.label}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold bg-${t}-100 text-${t}-700 dark:bg-${t}-900/30 dark:text-${t}-300`}
              >
                {a.score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
