'use client';

/**
 * AdnBadge — the compact "ADN" KPI rating in the page header (top-right, every
 * tab). Each axis is a hover button: mousing over it opens a popover with the
 * axis description + an AI reading of the score + recommended action. The
 * overall chip opens a roll-up popover.
 */

import { Sparkles } from 'lucide-react';
import { ACCOUNT_ADN, adnTone, adnOverall, ratingLabel, type AdnAxis } from './AdnAxes';

function Popover({ axis, overall }: { axis?: AdnAxis; overall?: { score: number } }) {
  const score = axis ? axis.score : overall!.score;
  const t = adnTone(score);
  return (
    <div className="invisible absolute right-0 top-full z-50 mt-1.5 w-72 translate-y-1 rounded-xl border border-gray-200 bg-white p-3 text-left opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-1.5 flex items-center gap-2">
        {axis && <axis.Icon className={`h-4 w-4 text-${t}-500`} />}
        <span className="text-xs font-semibold text-gray-900 dark:text-white">
          {axis ? axis.label : 'Note ADN globale'}
        </span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold bg-${t}-100 text-${t}-700 dark:bg-${t}-900/30 dark:text-${t}-300`}>
          {score}/100 · {ratingLabel(score)}
        </span>
      </div>
      {axis ? (
        <>
          {axis.desc && <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{axis.desc}</p>}
          <div className="rounded-lg bg-violet-50 p-2 dark:bg-violet-900/15">
            <p className="mb-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
              <Sparkles className="h-3 w-3" /> Analyse IA
            </p>
            <p className="text-[11px] leading-snug text-gray-700 dark:text-gray-200">{axis.analysis}</p>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Score composite des 5 axes (Qualité · Perf · Sécurité · Stockage · Usage). Survolez chaque axe pour le détail et l’analyse IA.
        </p>
      )}
    </div>
  );
}

export default function AdnBadge() {
  const overall = adnOverall(ACCOUNT_ADN);
  const to = adnTone(overall);
  return (
    <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">ADN</span>
      {ACCOUNT_ADN.map((a) => {
        const at = adnTone(a.score);
        return (
          <div key={a.key} className="group relative">
            <button
              type="button"
              aria-label={`${a.label} ${a.score} sur 100`}
              className={`flex items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors bg-${at}-50 hover:bg-${at}-100 dark:bg-${at}-900/20 dark:hover:bg-${at}-900/40`}
            >
              <a.Icon className={`h-3.5 w-3.5 text-${at}-500`} />
              <span className={`text-[10px] font-semibold text-${at}-700 dark:text-${at}-300`}>{a.score}</span>
            </button>
            <Popover axis={a} />
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
        <Popover overall={{ score: overall }} />
      </div>
    </div>
  );
}
