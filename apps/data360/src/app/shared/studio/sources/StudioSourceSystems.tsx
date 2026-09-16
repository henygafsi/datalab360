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

import { useEffect, useState } from 'react';
import { Boxes, Gauge, Layers, ScanLine, Timer } from 'lucide-react';
import { getStudioSummary, type SourcesSummary } from '@/app/services/studio/summary';
import { ConnectorLogo } from '@/app/shared/studio/sources/ConnectorLogo';

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
