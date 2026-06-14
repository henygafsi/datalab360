'use client';

/**
 * AxesRatingCard — a small "Data360 ADN" rating: the account's score across the
 * 6 migration axes (Qualité / Perf / Gouvernance / Stockage / Usage / Accès)
 * shown as a custom hexagon radar (the invented Data360 chart) + per-axis badges
 * + an overall score. Replaces the old Cost & Metering footer.
 *
 * UI-first: sample scores until wired to /command-center/kpis (dq/gov/perf/cost)
 * + storage/usage axes — pass `axes` to override.
 */

import { Radar } from 'lucide-react';
import { ACCOUNT_ADN, adnTone as tone, type AdnAxis } from './AdnAxes';

export default function AxesRatingCard({
  axes = ACCOUNT_ADN,
  title = 'Note ADN du compte',
  sample = true,
}: {
  axes?: AdnAxis[];
  title?: string;
  sample?: boolean;
}) {
  const cx = 80;
  const cy = 78;
  const R = 60;
  const n = axes.length;
  const point = (i: number, scale: number): [number, number] => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(ang) * R * scale, cy + Math.sin(ang) * R * scale];
  };
  const ring = (scale: number) => axes.map((_, i) => point(i, scale).join(',')).join(' ');
  const dataPoly = axes.map((a, i) => point(i, Math.max(0.05, a.score / 100)).join(',')).join(' ');
  const overall = Math.round(axes.reduce((s, a) => s + a.score, 0) / axes.length);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
          <Radar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold bg-${tone(overall)}-100 text-${tone(overall)}-700 dark:bg-${tone(overall)}-900/30 dark:text-${tone(overall)}-300`}
        >
          {overall}/100
        </span>
        {sample && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-gray-400 dark:bg-gray-800">
            échantillon
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row">
        {/* hexagon radar — the invented Data360 chart */}
        <svg viewBox="0 0 160 156" className="h-40 w-40 shrink-0">
          {[0.25, 0.5, 0.75, 1].map((s) => (
            <polygon
              key={s}
              points={ring(s)}
              className="fill-none stroke-gray-200 dark:stroke-gray-700"
              strokeWidth="1"
            />
          ))}
          {axes.map((_, i) => {
            const [x, y] = point(i, 1);
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="1" />;
          })}
          <polygon points={dataPoly} className="fill-indigo-500/20 stroke-indigo-500" strokeWidth="2" />
          {axes.map((a, i) => {
            const [x, y] = point(i, Math.max(0.05, a.score / 100));
            return <circle key={a.key} cx={x} cy={y} r="2.5" className={`fill-${tone(a.score)}-500`} />;
          })}
        </svg>

        {/* per-axis badges */}
        <div className="grid w-full grid-cols-2 gap-1.5">
          {axes.map((a) => {
            const t = tone(a.score);
            return (
              <div
                key={a.key}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-2 py-1 dark:border-gray-800"
              >
                <span className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                  <a.Icon className={`h-3.5 w-3.5 text-${t}-500`} />
                  {a.label}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold bg-${t}-100 text-${t}-700 dark:bg-${t}-900/30 dark:text-${t}-300`}>
                  {a.score}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
