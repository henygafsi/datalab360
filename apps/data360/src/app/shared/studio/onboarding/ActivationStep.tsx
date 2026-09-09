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
  dqResolveRefusal,
  extractActivationBlockers,
  getActivation,
  requestActivation,
  resolveDqCheck,
  undoDqResolve,
  type ActivationConnector,
  type ActivationStatusResponse,
  type DqActionKind,
  type DqGateCheck,
} from '@/app/services/studio/activation';
import { runDqGate } from '@/app/services/studio/studio-api';
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

const DQ_ACTION_LABEL: Record<DqActionKind, string> = {
  auto_fix: 'Auto-fix',
  quarantine_dlq: 'Route violations to DLQ',
  waive: 'Waive',
};

/**
 * DqCheckCard — one failing (or handled) DQ rule with its standardized
 * resolution. The engine's recommended action leads; the source data is
 * never touched (a fix stages a dedup/quarantine rule at design time, the
 * DLQ fills only when the job runs), a waiver needs an ACCOUNTADMIN reason,
 * and everything is undoable. Actions the model can't express yet come back
 * `available:false` with the reason said in place.
 */
function DqCheckCard({
  draftId,
  check,
  onChanged,
}: {
  draftId: string;
  check: DqGateCheck;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<DqActionKind | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [reason, setReason] = useState('');

  const apply = async (action: DqActionKind, r?: string) => {
    if (busy) return;
    setBusy(action);
    setRefusal(null);
    setNote(null);
    try {
      const res = await resolveDqCheck(draftId, { check_id: check.id, action, reason: r });
      const runJob = res.next?.run_job;
      setNote(
        action === 'waive'
          ? 'Waived — the original verdict stays visible as evidence; the source data is untouched.'
          : runJob
            ? 'Handled — staged in the model; the DLQ fills only when the job runs (credits, explicit).'
            : 'Handled — staged in the model; the source data is untouched.',
      );
      onChanged();
    } catch (e) {
      setRefusal(dqResolveRefusal(e)?.message ?? 'The action was refused.');
    } finally {
      setBusy(null);
    }
  };

  const undo = async () => {
    const runId = check.resolution?.run_id;
    if (!runId || busy) return;
    setBusy('auto_fix');
    setRefusal(null);
    try {
      await undoDqResolve(draftId, runId);
      onChanged();
    } catch (e) {
      setRefusal(dqResolveRefusal(e)?.message ?? 'Undo was refused.');
    } finally {
      setBusy(null);
    }
  };

  // the engine's suggested action leads
  const actions = [...(check.actions ?? [])].sort((a, b) => {
    const sug = check.suggested_action;
    return a.kind === sug ? -1 : b.kind === sug ? 1 : 0;
  });

  return (
    <li className="rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-800">
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="font-mono font-medium text-slate-700 dark:text-slate-200">{check.id ?? check.rule}</span>
        {check.object && <span className="font-mono text-slate-400 dark:text-slate-500">{check.object}</span>}
        {check.handled ? (
          <span className="rounded-full bg-amber-50 px-1.5 py-px text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            handled{check.resolution?.state === 'waived' ? ' · waived' : ''}
          </span>
        ) : (
          <span className="rounded-full bg-red-50 px-1.5 py-px text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {check.verdict ?? 'fail'}
          </span>
        )}
      </div>
      {check.message && <p className="mt-0.5 text-slate-500 dark:text-slate-400">{check.message}</p>}

      {check.handled ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-slate-500 dark:text-slate-400">
          <span>
            {check.resolution?.state === 'waived' ? 'Waived' : 'Handled'}
            {check.resolution?.action ? ` · ${check.resolution.action}` : ''}
          </span>
          {check.resolution?.run_id && (
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void undo()}
              className="rounded px-1.5 py-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-500 dark:hover:text-slate-200"
            >
              Undo
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {actions.map((a) => {
              const suggested = a.kind === check.suggested_action;
              const label = a.label || DQ_ACTION_LABEL[a.kind];
              if (a.kind === 'waive') {
                return (
                  <button
                    key={a.kind}
                    type="button"
                    disabled={busy != null || a.available === false}
                    title={a.available === false ? a.reason : 'Accept the defect with a recorded reason (ACCOUNTADMIN).'}
                    onClick={() => setWaiveOpen((v) => !v)}
                    className="rounded-lg border border-slate-200 px-2 py-0.5 text-slate-600 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
                  >
                    {label}…
                  </button>
                );
              }
              return (
                <button
                  key={a.kind}
                  type="button"
                  disabled={busy != null || a.available === false}
                  title={a.available === false ? a.reason : a.detail}
                  onClick={() => void apply(a.kind)}
                  className={
                    a.available === false
                      ? 'cursor-not-allowed rounded-lg border border-dashed border-slate-200 px-2 py-0.5 text-slate-400 dark:border-slate-700 dark:text-slate-500'
                      : suggested
                        ? 'inline-flex items-center gap-1 rounded-lg bg-accent-600 px-2 py-0.5 font-medium text-white hover:bg-accent-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
                        : 'rounded-lg border border-slate-200 px-2 py-0.5 text-slate-600 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300'
                  }
                >
                  {busy === a.kind ? 'Applying…' : label}
                  {suggested && a.available !== false ? ' · recommended' : ''}
                </button>
              );
            })}
            {actions.length === 0 && (
              <span className="text-slate-400 dark:text-slate-500">Propose the model first to enable a fix.</span>
            )}
          </div>
          {waiveOpen && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this acceptable? (≥ 10 characters)"
                aria-label="Waiver reason"
                className="h-7 w-64 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              <button
                type="button"
                disabled={busy != null || reason.trim().length < 10}
                onClick={() => void apply('waive', reason.trim())}
                className="rounded-lg bg-slate-700 px-2 py-0.5 font-medium text-white hover:bg-slate-800 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:bg-slate-600"
              >
                {busy === 'waive' ? 'Waiving…' : 'Confirm waiver'}
              </button>
            </div>
          )}
        </>
      )}
      {note && <p role="status" className="mt-1 text-emerald-700 dark:text-emerald-400">{note}</p>}
      {refusal && <p role="alert" className="mt-1 text-amber-700 dark:text-amber-300">{refusal}</p>}
    </li>
  );
}

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
  const [gate, setGate] = useState<'idle' | 'running' | 'error'>('idle');

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

  /** Re-evaluate the data-quality gate in place. After the standardized DQ
   *  resolution elsewhere — routing violating rows to the DLQ (a job rule's
   *  quarantine behaviour) or fixing them under Quality — this re-runs the
   *  gate so a resolved application can turn green without leaving. */
  const reRunGate = useCallback(async () => {
    if (!draftId || gate === 'running') return;
    setGate('running');
    try {
      await runDqGate(draftId);
      await load();
      setGate('idle');
    } catch {
      setGate('error');
    }
  }, [draftId, gate, load]);

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
  // the structured checks (each with its per-rule resolution actions); when
  // the backend serves them we render the Resolve controls, else we fall back
  // to the legacy flat blocker strings. Two shapes exist: some gates serve the
  // whole `checks[]` (fails among them, verdict 'fail'); a draft evaluated
  // compactly serves only `blockers_detail[]` (unhandled blockers) + `handled[]`
  // with an empty `checks`. Handle both, and drive off `verdict==='fail'`
  // (the `blocking` flag has been unreliable on persisted gates).
  const dqAllChecks =
    (dq?.checks?.length ?? 0) > 0
      ? dq!.checks!
      : [...(dq?.blockers_detail ?? []), ...(dq?.handled ?? [])];
  const dqUnhandled = dqAllChecks.filter((c) => !c.handled && c.verdict === 'fail');
  const dqHandled = (dq?.handled?.length ?? 0) > 0 ? dq!.handled! : dqAllChecks.filter((c) => c.handled);
  const dqStructured =
    dqAllChecks.length > 0 ||
    (dq?.blockers_detail?.length ?? 0) > 0 ||
    (dq?.handled?.length ?? 0) > 0;
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
          {dqStructured ? (
            <>
              {dqUnhandled.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Each failing rule carries the standardized action the engine recommends — apply
                    it (a dedup or a quarantine rule; the source data is never changed and the DLQ
                    fills only when the job runs) or waive it with a reason. The gate turns{' '}
                    <span className="font-medium">warn</span>, not a false green, once every defect
                    is handled — the original verdict stays visible as evidence.
                  </p>
                  <ul className="space-y-1.5">
                    {dqUnhandled.map((c) => (
                      <DqCheckCard key={c.id} draftId={draftId} check={c} onChanged={() => void load()} />
                    ))}
                  </ul>
                </div>
              )}
              {dqHandled.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:text-slate-200">
                    {dqHandled.length} handled — the application manages the defect
                  </summary>
                  <ul className="mt-1 space-y-1.5">
                    {dqHandled.map((c) => (
                      <DqCheckCard key={c.id} draftId={draftId} check={c} onChanged={() => void load()} />
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={gate === 'running'}
                  onClick={() => void reRunGate()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                >
                  <RotateCw aria-hidden className={`h-3 w-3 ${gate === 'running' ? 'animate-spin' : ''}`} />
                  {gate === 'running' ? 'Re-evaluating…' : 'Re-run the data-quality gate'}
                </button>
                {gate === 'error' && (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    The gate did not re-run — try again.
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              {(dq?.blockers?.length ?? 0) > 0 && (
                <ul className="space-y-0.5">
                  {dq!.blockers!.map((b, i) => (
                    <li key={i} className="text-xs text-red-600 dark:text-red-400">
                      {typeof b === 'string' ? b : b.message ?? JSON.stringify(b)}
                    </li>
                  ))}
                </ul>
              )}
              {dq?.overall === 'blocked' && (
                <div className="mt-1 rounded-lg border border-red-100 bg-red-50/60 p-2 dark:border-red-900/40 dark:bg-red-950/30">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Resolve each failing rule under <span className="font-medium">Quality</span> —
                    fix the rows, or route the violating records to the DLQ (a job rule&apos;s
                    « quarantine » behaviour). Then re-run the gate here to re-evaluate.
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={gate === 'running'}
                      onClick={() => void reRunGate()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                    >
                      <RotateCw aria-hidden className={`h-3 w-3 ${gate === 'running' ? 'animate-spin' : ''}`} />
                      {gate === 'running' ? 'Re-evaluating…' : 'Re-run the data-quality gate'}
                    </button>
                    {gate === 'error' && (
                      <span className="text-xs text-red-600 dark:text-red-400">
                        The gate did not re-run — try again.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
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
