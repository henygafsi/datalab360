'use client';

/**
 * StudioSourceSystems — the SYSTEMS lead the Data view, not the file scan.
 *
 * User directive: « highlight the data sources logos and kpis highlights
 * rather than source-files-oriented scan — show, like Google, only the needed
 * to know ». One hero card per connected system (its logo, its business name,
 * its KPI highlights as chips), read from the served sources summary — the
 * object-by-object detail stays one fold below in the objects table.
 *
 * Honesty: every figure is the served one ("—" when not evaluated); the
 * warehouse is named neutrally (brand rule); with several systems each gets
 * its own card, with none the strip says so instead of pretending.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Boxes, Gauge, Layers, ScanLine, Timer } from 'lucide-react';
import { routes } from '@/config/routes';
import {
  getStudioSummary,
  type SourcesSummary,
  type SystemDetail,
} from '@/app/services/studio/summary';
import { ConnectorLogo } from '@/app/shared/studio/sources/ConnectorLogo';

/* per-system health said in words + tone (never hue alone) */
const HEALTH_CLS: Record<string, string> = {
  ok: 'border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300',
  warn: 'border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300',
  fail: 'border-rose-200 text-rose-700 dark:border-rose-800 dark:text-rose-300',
};

function healthWords(h?: SystemDetail['health']): { words: string; cls: string; title?: string } {
  const st = h?.state;
  if (!st || st === 'not_evaluated')
    return { words: 'health —', cls: 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400', title: 'not evaluated yet' };
  const counts = h?.counts
    ? Object.entries(h.counts)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
        .join(' · ')
    : '';
  return {
    words: `health ${st}`,
    cls: HEALTH_CLS[st] ?? HEALTH_CLS.warn,
    title: [counts, h?.method].filter(Boolean).join(' — ') || undefined,
  };
}

/** a system id → its display identity (never a vendor name in customer copy) */
function systemWords(id: string): { label: string; family: string; connectorId: string } {
  const s = id.toLowerCase();
  if (s.startsWith('sf:')) return { label: 'Data warehouse — your session', family: 'warehouse', connectorId: id };
  if (s.startsWith('conn:')) return { label: id.replace(/^conn:/, ''), family: 'database', connectorId: id };
  return { label: id, family: 'database', connectorId: id };
}

export default function StudioSourceSystems({ draftId }: { draftId: string }) {
  const [s, setS] = useState<SourcesSummary | null>(null);

  useEffect(() => {
    let alive = true;
    void getStudioSummary(draftId, ['sources'])
      .then((r) => alive && setS(r.sources ?? {}))
      .catch(() => alive && setS({}));
    return () => {
      alive = false;
    };
  }, [draftId]);

  if (s === null)
    return <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;

  const systems = (s.systems ?? []).map(String);
  const chips: Array<{ icon: typeof Boxes; words: string; title?: string } | null> = [
    { icon: Layers, words: `${s.objects ?? '—'} active object${(s.objects ?? 0) === 1 ? '' : 's'}` },
    {
      icon: ScanLine,
      words: `${s.rows_scanned != null ? s.rows_scanned.toLocaleString() : '—'} rows scanned`,
    },
    {
      icon: Gauge,
      words: `health ${s.source_health_score ?? '—'}`,
      title: 'source health score, served',
    },
    s.functional_domains_detected != null
      ? { icon: Boxes, words: `${s.functional_domains_detected} functional domain${s.functional_domains_detected === 1 ? '' : 's'}`, title: 'detected by AI' }
      : null,
    {
      icon: Timer,
      words: `freshness ${s.freshness_avg_days != null ? `${s.freshness_avg_days} d` : '—'}`,
      title: 'average, served — "—" is not evaluated, never zero',
    },
  ];

  // Per-system figures (2026-09-16): when the backend serves systems_detail,
  // each card carries ITS OWN numbers — the app-wide chips were honest with
  // one system but a lie painted onto every card with several.
  const detail = s.systems_detail ?? [];
  if (detail.length > 0) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {detail.map((d) => {
          const id = String(d.id ?? '');
          const w = systemWords(id);
          const declared = d.truth === 'confirmed';
          const h = healthWords(d.health);
          const sysChips: Array<{ icon: typeof Boxes; words: string; title?: string; cls?: string } | null> = [
            {
              icon: Layers,
              words:
                d.objects != null
                  ? `${d.objects} object${d.objects === 1 ? '' : 's'}${d.analysed != null ? ` · ${d.analysed} analysed` : ''}`
                  : 'objects —',
            },
            !declared
              ? {
                  icon: ScanLine,
                  words: `${d.rows_scanned != null ? d.rows_scanned.toLocaleString() : '—'} rows scanned`,
                }
              : null,
            !declared ? { icon: Gauge, words: h.words, title: h.title, cls: h.cls } : null,
            d.domains && d.domains.length > 0
              ? { icon: Boxes, words: d.domains.slice(0, 3).join(' · '), title: d.domains.join(', ') }
              : null,
            d.freshness_at
              ? { icon: Timer, words: `fresh at ${d.freshness_at.slice(0, 10)}`, title: d.freshness_at }
              : null,
          ];
          return (
            <section
              key={id}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                <ConnectorLogo label={w.label} connectorId={w.connectorId} family={w.family} className="h-7 w-7" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {w.label}
                  </span>
                  {declared && (
                    <span
                      className="rounded-full bg-slate-100 px-1.5 py-px text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      title={d.note ?? 'declared by a source contract — not yet observed'}
                    >
                      declared by contract
                    </span>
                  )}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {sysChips.filter(Boolean).map((c, i) => {
                    const C = c!.icon;
                    return (
                      <span
                        key={i}
                        title={c!.title}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums ${c!.cls ?? 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
                      >
                        <C aria-hidden className="h-3 w-3 opacity-70" />
                        {c!.words}
                      </span>
                    );
                  })}
                </span>
                {declared && d.note && (
                  <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">{d.note}</span>
                )}
                {/* the store→model door: understood objects exist to FEED the
                    model — one click forward on the spine */}
                {!declared && d.analysed != null && d.analysed > 0 && (
                  <Link
                    href={`${routes.studioApp(draftId)}?view=model`}
                    className="mt-1 inline-block rounded text-xs text-accent-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
                  >
                    see what they feed in the model →
                  </Link>
                )}
              </span>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {systems.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No connected system is served for this application yet.
        </p>
      ) : (
        systems.map((id) => {
          const w = systemWords(id);
          return (
            <section
              key={id}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                <ConnectorLogo label={w.label} connectorId={w.connectorId} family={w.family} className="h-7 w-7" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {w.label}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {chips.filter(Boolean).map((c, i) => {
                    const C = c!.icon;
                    return (
                      <span
                        key={i}
                        title={c!.title}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300"
                      >
                        <C aria-hidden className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                        {c!.words}
                      </span>
                    );
                  })}
                </span>
              </span>
            </section>
          );
        })
      )}
    </div>
  );
}
