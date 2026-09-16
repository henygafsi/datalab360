'use client';

/**
 * StudioDetectionsPanel — the application's detection registry, as the
 * loop it really is: Detect → Explain → Recommend → Act → Verify.
 *
 * One row per detector, most severe first (server order): the signal, its
 * explanation, the evidence, the affected object, its TRUTH status and an
 * activation state that never lies — `requires_observation` names the
 * route that would observe, instead of pretending. Acting is dry-run by
 * default; only bounded reads execute here — anything costly answers
 * `manual{do}` (the existing route and its own gate), and a real act
 * comes back with its VERIFY (resolved, before → after).
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  actOnDetection,
  getDetections,
  type DetectionActResult,
  type DetectionsView,
  type Detector,
} from '@/app/services/studio/context';
import { QuietAction } from '@/app/shared/studio/PlainKit';
import TruthChip from '@/app/shared/studio/TruthChip';
import { readFailure } from '@/app/shared/studio/studio-errors';

const SEV_CLS: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  warning: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  info: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const ACTIVATION_WORDS: Record<string, string> = {
  on_demand: 'on demand',
  scheduled: 'scheduled',
  inactive: 'inactive',
  requires_observation: 'needs an observation first',
};

function affectedWords(a: Detector['affected']): string {
  if (a == null) return '—';
  if (typeof a === 'string') return a;
  const o = a as Record<string, unknown>;
  return (
    [o.fqn, o.ref, o.name, o.job_id, o.target_id, o.kind]
      .filter((v) => typeof v === 'string' && v)
      .slice(0, 2)
      .join(' · ') || '—'
  );
}

export default function StudioDetectionsPanel({ draftId }: { draftId: string }) {
  const [view, setView] = useState<DetectionsView | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [acts, setActs] = useState<Record<string, DetectionActResult>>({});

  const load = useCallback(async () => {
    try {
      setView(await getDetections(draftId));
    } catch {
      setView('error');
    }
  }, [draftId]);

  useEffect(() => {
    setView('loading');
    void load();
  }, [load]);

  const act = useCallback(
    async (d: Detector, confirm: boolean) => {
      if (busy) return;
      setBusy(d.detector_id);
      setError(null);
      try {
        const r = await actOnDetection(draftId, d.detector_id, confirm);
        setActs((a) => ({ ...a, [d.detector_id]: r }));
        // Keep the row ARMED after the dry-run so the next click can confirm;
        // clear it only once the confirmed action has run (or on error). The
        // old `finally { setArmed(null) }` cleared it after the arming dry-run
        // too, so confirm was unreachable — the action could never execute.
        if (confirm) {
          await load();
          setArmed(null);
        }
      } catch (e) {
        const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
        setError(readFailure(detail ?? e).text);
        setArmed(null);
      } finally {
        setBusy(null);
      }
    },
    [busy, draftId, load],
  );

  if (view === 'loading')
    return (
      <div role="status" className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800">
        <span className="sr-only">Reading the detectors…</span>
      </div>
    );
  if (view === 'error')
    return (
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        The detection registry could not be read.{' '}
        <QuietAction label="Try again" icon={RefreshCw} onClick={() => { setView('loading'); void load(); }} />
      </p>
    );

  const detectors = view.detectors;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Detection & alerts
        </h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {(view.loop ?? ['detect', 'explain', 'recommend', 'act', 'verify']).join(' → ')}
        </span>
        {view.by_severity && (
          // the served tally as REAL KPI chips, colour + word (never hue alone)
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {Object.entries(view.by_severity).map(([k, v]) => (
              <span
                key={k}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${SEV_CLS[k] ?? SEV_CLS.info}`}
              >
                {v} {k}
              </span>
            ))}
          </span>
        )}
      </div>

      {detectors.length === 0 ? (
        <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
          No detector for this application yet — they derive from quality, sources, jobs and
          workflows as those exist.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">Severity</th>
                <th className="px-2 py-1.5 font-medium">Signal</th>
                <th className="px-2 py-1.5 font-medium">Affected</th>
                <th className="px-2 py-1.5 font-medium">Truth</th>
                <th className="px-2 py-1.5 font-medium">Activation</th>
                <th className="px-2 py-1.5 font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {detectors.map((d) => {
                const ra = d.recommended_action;
                const res = acts[d.detector_id];
                return (
                  <tr key={d.detector_id} className="align-top text-[13px]">
                    <td className="whitespace-nowrap px-2 py-2">
                      <span className={`rounded-full px-1.5 py-px text-xs ${SEV_CLS[d.severity ?? 'info'] ?? SEV_CLS.info}`}>
                        {d.severity ?? 'info'}
                      </span>
                    </td>
                    <td className="max-w-[420px] px-2 py-2">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{d.signal ?? d.kind ?? d.detector_id}</p>
                      {d.explain && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{d.explain}</p>}
                      {res?.acted?.verify && (
                        <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400" role="status">
                          verified: {res.acted.verify.resolved ? 'resolved' : 'NOT resolved'}
                          {res.acted.verify.before != null &&
                            ` · before ${String(res.acted.verify.before)} → after ${String(res.acted.verify.after)}`}
                        </p>
                      )}
                      {res?.manual?.do && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400" role="status">
                          To act: {res.manual.do}
                        </p>
                      )}
                      {res?.dry_run && !res.acted && !res.manual && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400" role="status">
                          Dry run — nothing executed; confirm to run the bounded action.
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {affectedWords(d.affected)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <TruthChip truth={d.truth} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
                      {ACTIVATION_WORDS[d.activation_state ?? ''] ?? d.activation_state ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      {ra?.executable_here ? (
                        <button
                          type="button"
                          disabled={busy != null}
                          onClick={() => {
                            if (armed !== d.detector_id) {
                              setArmed(d.detector_id);
                              void act(d, false); // dry-run first, always
                              return;
                            }
                            void act(d, true);
                          }}
                          title={ra.label}
                          className={`rounded-lg px-2.5 py-1 text-xs disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                            armed === d.detector_id
                              ? 'bg-accent-600 font-medium text-white hover:bg-accent-700'
                              : 'border border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {busy === d.detector_id
                            ? 'Acting…'
                            : armed === d.detector_id
                              ? 'Confirm — runs the bounded action'
                              : (ra.label ?? 'Act')}
                        </button>
                      ) : ra ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500" title={ra.route ? `${ra.method ?? ''} ${ra.route}` : undefined}>
                          {ra.label ?? 'manual action'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}
