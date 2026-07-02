/**
 * AdnAxes — the 5 ADN migration axes + hand-authored, standardized icons.
 *
 * One custom SVG glyph per axis (same 24-grid, 1.8 stroke, round caps) so the
 * KPI badges read as a coherent Data360 icon set:
 *   Qualité (badge-check) · Perf (gauge) · Sécurité (shield) ·
 *   Stockage (database) · Usage (activity pulse).
 * "Accès" was renamed to "Sécurité" and governance is folded into it → 5 axes.
 */

import type { SVGProps, ReactNode } from 'react';

function Glyph({ children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      {children}
    </svg>
  );
}

export function IconQuality(p: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.3 12 2.6 2.6L15.7 9" />
    </Glyph>
  );
}
export function IconPerf(p: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...p}>
      <path d="M3.5 17a8.5 8.5 0 0 1 17 0" />
      <path d="M12 17 16 11" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </Glyph>
  );
}
export function IconSecurity(p: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...p}>
      <path d="M12 3 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" />
      <path d="m9.3 12 1.9 1.9 3.6-4" />
    </Glyph>
  );
}
export function IconStorage(p: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...p}>
      <ellipse cx="12" cy="6" rx="7" ry="2.8" />
      <path d="M5 6v12c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8V6" />
      <path d="M5 12c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8" />
    </Glyph>
  );
}
export function IconUsage(p: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...p}>
      <path d="M2.5 13h3.5l2.5 6 4-14 2.5 8h3.5" />
    </Glyph>
  );
}

export interface AdnAxis {
  key: string;
  label: string;
  score: number;
  Icon: (p: SVGProps<SVGSVGElement>) => JSX.Element;
  /** What this axis measures. */
  desc?: string;
  /** AI reading of the current score + recommended action (UI-first sample). */
  analysis?: string;
}

export function ratingLabel(s: number) {
  return s >= 80 ? 'Bon' : s >= 60 ? 'Moyen' : 'Faible';
}

/** Icon lookup by axis key — used to attach a glyph to any computed axis. */
export const AXIS_ICON: Record<string, (p: SVGProps<SVGSVGElement>) => JSX.Element> = {
  DQ: IconQuality,
  PERF: IconPerf,
  SEC: IconSecurity,
  STORAGE: IconStorage,
  USAGE: IconUsage,
};

// NOTE: the old exported ACCOUNT_ADN sample (hardcoded scores + invented "AI"
// analyses like "~$18.4k/mois") was removed — zero-fabrication rule. Callers
// must derive axes from their own real data and pass them explicitly (see
// AdnScoreCard's required `axes` prop).

export function adnTone(s: number) {
  return s >= 80 ? 'emerald' : s >= 60 ? 'amber' : 'rose';
}
export function adnOverall(axes: { score: number }[]) {
  return axes.length ? Math.round(axes.reduce((s, a) => s + a.score, 0) / axes.length) : 0;
}
