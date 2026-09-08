'use client';

/**
 * ActivationStep — the last onboarding step: "here is exactly what would run,
 * what it costs in credits, and who funds it." Everything on this page is
 * VERBATIM from GET /studio/activation/{draft_id} — verdicts are never
 * defaulted to "healthy", money is never derived, unknowns render '—'.
 *
 * The only mutation (POST /studio/activation/request, scope test_run) fires
 * exclusively on the user's click — never on mount. A 409 surfaces the
 * backend's blockers verbatim.
 */

import { useCallback, useEffect, useState } from 'react';
import { FileWarning, RotateCw } from 'lucide-react';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import EmptyState from '@/components/ui/EmptyState';
import {
  extractActivationBlockers,
  getActivation,
  requestActivation,
  type ActivationConnector,
  type ActivationStatusResponse,
} from '@/app/services/studio/activation';
import type { JourneyDraft } from './journey';

/* ── helpers ───────────────────────────────────────────────────────── */

/** '—' for unknowns, never 0 (Lite rule). */
function fmtCredits(v: number | null | undefined): string {
  return typeof v === 'number' ? v.toLocaleString() : '—';
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { response?: { data?: { detail?: unknown } }; message?: string };
    const detail = anyE.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (detail && typeof detail === 'object') {
      const m = (detail as { message?: unknown }).message;
      if (typeof m === 'string' && m) return m;
    }
    if (anyE.message) return anyE.message;
  }
  return 'The activation status could not be loaded.';
}

/** dq_gate verdict → text tone. Anything unknown stays slate — never green by default. */
const VERDICT_TONE: Record<string, string> = {
  pass: 'text-emerald-600 dark:text-emerald-400',
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  blocked: 'text-red-600 dark:text-red-400',
};

function verdictTone(v: string | undefined): string {
  return (v && VERDICT_TONE[v]) || 'text-slate-500 dark:text-slate-400';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <div className="mt-2 space-y-1.5">{children}</div>
    </section>
  );
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ActivationStatusResponse }
  | { kind: 'failed'; message: string };

type ReqState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; status: string }
  | { kind: 'blocked'; blockers: string[] }
  | { kind: 'error'; message: string };

/* ── component ─────────────────────────────────────────────────────── */

export default function ActivationStep({
  draft,
  draftId: draftIdProp,
  onBack,
}: {
  /** journey mount — the panel derives the application id from the draft */
  draft?: JourneyDraft;
  /** workspace mount — the SAME panel, addressed by application id (the
   *  convergence rule: one activation surface, not one per module) */
  draftId?: string | null;
  onPatch?: (p: Partial<JourneyDraft>) => void;
  onNext?: () => void;
  onBack?: () => void;
}) {
  const draftId =
    draftIdProp ?? (draft ? (draft.preview.reportDraftId ?? draft.draftId) : null) ?? null;
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [req, setReq] = useState<ReqState>({ kind: 'idle' });

  const load = useCallback(async () => {
    if (!draftId) return;
    setPhase({ kind: 'loading' });
    try {
      const data = await getActivation(draftId);
      setPhase({ kind: 'ready', data });
    } catch (e) {
      setPhase({ kind: 'failed', message: errMsg(e) });
    }
  }, [draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRequest = useCallback(async () => {
    if (!draftId) return;
    setReq({ kind: 'sending' });
    try {
      const res = await requestActivation({ draft_id: draftId, scope: 'test_run' });
      setReq({ kind: 'done', status: res.activation?.status ?? 'requested' });
      // Refresh the read-only panel so activation/can_request stay honest.
      try {
        setPhase({ kind: 'ready', data: await getActivation(draftId) });
      } catch {
        /* the banner already reflects the request — keep the panel as-is */
      }
    } catch (e) {
      const blockers = extractActivationBlockers(e);
      if (blockers) setReq({ kind: 'blocked', blockers });
      else setReq({ kind: 'error', message: errMsg(e) });
    }
  }, [draftId]);

  /* ── honest "no draft" leg ─────────────────────────────────────── */

  if (!draftId) {
    return (
      <EmptyState
        compact
        icon={FileWarning}
        title="This journey has no saved draft yet"
        description="Activation reads the saved draft — the earlier steps have not persisted one. Go back a step so the journey can save, then return here."
        action={
          onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
            >
              Back
            </button>
          ) : undefined
        }
      />
    );
  }

  if (phase.kind === 'loading') {
    return (
      <div className="space-y-3">
        <PlainQuestionHeader
          question="Ready to activate?"
          detail="Checking what would run, what it costs, and who funds it."
        />
        <div className="grid gap-2 md:grid-cols-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60"
            />
          ))}
        </div>
      </div>
    );
  }

  if (phase.kind === 'failed') {
    return (
      <div className="space-y-3">
        <PlainQuestionHeader
          question="The activation status could not be loaded"
          detail="Nothing was requested or charged."
        />
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {phase.message}
        </p>
        <div className="flex items-center gap-3">
          <QuietAction label="Retry" icon={RotateCw} onClick={() => void load()} />
          {onBack && <QuietAction label="Back" onClick={onBack} />}
        </div>
      </div>
    );
  }

  const a = phase.data;
  const sources = a.scope?.sources ?? [];
  const entities = a.scope?.entities ?? [];
  const automations = a.scope?.automations ?? [];
  const connectors = Object.entries(a.dependencies?.connectors ?? {});
  const dq = a.tests?.dq_gate ?? null;
  const report = a.tests?.report ?? null;
  const simCount = a.tests?.automation_simulations?.length ?? 0;
  const est = a.estimate;
  const lines = est?.lines ?? [];
  const money = est?.money; // ABSENT for non-ACCOUNTADMIN — a normal state
  const funding = a.funding;
  const blockers = a.blockers ?? [];
  const canRequest = a.can_request === true;
  const activationStatus = a.activation?.status;

  const requestDisabled =
    !canRequest || req.kind === 'sending' || req.kind === 'done';

  return (
    <div className="space-y-3">
      <PlainQuestionHeader
        question="Ready to activate?"
        detail="Everything below is read from your draft — nothing starts until you request it and an ACCOUNTADMIN agrees."
      />

      <div className="grid gap-2 md:grid-cols-2">
        {/* (1) What will run */}
        <Section title="What will run">
          {sources.length > 0 ? (
            <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
              {sources.map((s) => (
                <span
                  key={s.fqn}
                  className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs leading-4 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  title={s.fqn}
                >
                  {s.fqn}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">No sources in scope.</p>
          )}
          <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {entities.length} entit{entities.length === 1 ? 'y' : 'ies'} ·{' '}
            {automations.length} automation{automations.length === 1 ? '' : 's'} in scope
          </p>
          {connectors.length > 0 ? (
            <div className="flex flex-wrap gap-1" aria-label="Connector dependencies">
              {connectors.map(([name, c]) => {
                const status =
                  typeof c === 'string' ? c : (c as ActivationConnector | null)?.status ?? '—';
                return (
                  <span
                    key={name}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-xs leading-4 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    {name} · {status}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No connector dependencies.
            </p>
          )}
        </Section>

        {/* (2) Checks */}
        <Section title="Checks">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Data quality gate —{' '}
            <span className={`font-medium ${verdictTone(dq?.overall)}`}>
              {dq?.overall ?? 'not_evaluated'}
            </span>
            {dq?.evaluated_at ? (
              <span className="text-slate-400 dark:text-slate-500"> · evaluated {fmtDate(dq.evaluated_at)}</span>
            ) : null}
          </p>
          {(dq?.blockers?.length ?? 0) > 0 && (
            <ul className="space-y-0.5">
              {dq!.blockers!.map((b, i) => (
                <li key={i} className="text-xs text-red-600 dark:text-red-400">
                  {typeof b === 'string' ? b : b.message ?? JSON.stringify(b)}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Report —{' '}
            <span
              className={`font-medium ${
                report?.status === 'ok' || report?.status === 'ready'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {report?.status ?? '—'}
            </span>
            <span className="tabular-nums text-slate-400 dark:text-slate-500">
              {' '}· {report?.kpis ?? '—'} KPI{report?.kpis === 1 ? '' : 's'} · {report?.charts ?? '—'} chart{report?.charts === 1 ? '' : 's'}
            </span>
          </p>
          <p className="text-xs tabular-nums text-slate-600 dark:text-slate-300">
            Automation simulations —{' '}
            {simCount > 0 ? (
              <span className="font-medium">{simCount} recorded</span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500">none recorded</span>
            )}
          </p>
        </Section>

        {/* (3) Cost */}
        <Section title="Cost">
          {lines.length > 0 ? (
            <div className="max-h-28 overflow-y-auto">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lines.map((l, i) => (
                    <tr key={l.rule_id ?? i}>
                      <td
                        className="py-1 pr-2 text-slate-600 dark:text-slate-300"
                        title={l.why ?? undefined}
                      >
                        {l.label}
                      </td>
                      <td className="py-1 text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {fmtCredits(l.credits)}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1 pr-2 font-medium text-slate-700 dark:text-slate-200">
                      Total
                    </td>
                    <td className="py-1 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {fmtCredits(est?.total_credits)} credits
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No estimate lines — {fmtCredits(est?.total_credits)} credits total.
            </p>
          )}
          {est?.free_preview?.credits === 0 && (
            <p
              className="text-xs text-emerald-600 dark:text-emerald-400"
              title={est.free_preview.note ?? undefined}
            >
              Preview stayed free — 0 credits
            </p>
          )}
          {money === undefined ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Financial details are visible to this account&apos;s ACCOUNTADMIN only.
            </p>
          ) : money?.state === 'unconfigured' || money?.amount == null ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Money value: not valued yet — pricing policy unset.
            </p>
          ) : (
            <p className="text-xs tabular-nums text-slate-600 dark:text-slate-300">
              Money value: {money.amount.toLocaleString()} {money.currency ?? ''}
              {money.estimated ? ' (estimated)' : ''}
            </p>
          )}
        </Section>

        {/* (4) Funding */}
        <Section title="Funding">
          {funding?.status === 'not_required' ? (
            <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              No funding needed for this scope
            </p>
          ) : funding?.status === 'requires_accountadmin' ? (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <span>{funding.next_step ?? 'An ACCOUNTADMIN must fund credits before this can run.'}</span>
            </p>
          ) : funding?.status === 'authorisation_by_accountadmin' ? (
            <p className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
              <span>
                Runs are authorised by an ACCOUNTADMIN.
                {funding.next_step ? ` ${funding.next_step}` : ''}
              </span>
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {funding?.status ?? '—'}
            </p>
          )}
          {activationStatus && activationStatus !== 'not_requested' && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Activation status: {activationStatus}
            </p>
          )}
        </Section>
      </div>

      {/* (5) blockers */}
      {blockers.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30"
        >
          <p className="text-xs font-medium text-red-700 dark:text-red-300">
            Blocking before activation
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {blockers.map((b) => (
              <li key={b} className="text-xs text-red-600 dark:text-red-400">
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* request outcome banners */}
      {req.kind === 'done' && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
        >
          {req.status === 'authorised'
            ? "Authorised — the budgeted test run awaits the admin's go."
            : 'Requested — an ACCOUNTADMIN has been notified.'}
        </p>
      )}
      {req.kind === 'blocked' && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30"
        >
          <p className="text-xs font-medium text-red-700 dark:text-red-300">
            The request was blocked
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {(req.blockers.length > 0 ? req.blockers : ['Activation is blocked.']).map((b) => (
              <li key={b} className="text-xs text-red-600 dark:text-red-400">
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
      {req.kind === 'error' && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {req.message}
        </p>
      )}

      {/* (6) CTA — fires ONLY on the user's click */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={requestDisabled}
          onClick={() => void onRequest()}
          title={!canRequest && blockers.length > 0 ? blockers.join(' · ') : undefined}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {req.kind === 'sending' ? 'Requesting…' : 'Request activation (test run)'}
        </button>
        <QuietAction label="Refresh" icon={RotateCw} onClick={() => void load()} />
        {onBack && <QuietAction label="Back" onClick={onBack} />}
      </div>
    </div>
  );
}
