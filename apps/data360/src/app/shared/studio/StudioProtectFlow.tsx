'use client';

/**
 * StudioProtectFlow — protect ONE sensitive column where it is seen, without
 * leaving the model. The proven contract: dry-run (exact SQL + a privilege
 * preflight that predicts a failing confirm) → armed confirm (executes under
 * the caller's warehouse session) → undo by run_id.
 *
 * Honesty rules:
 *  • Nothing runs on mount. The dry-run is an explicit click; the confirm is
 *    a SECOND, armed click that says what it does.
 *  • The SQL shown is the backend's verbatim statements — never a paraphrase.
 *  • The policy is created in the governed home (CP_DATA360.GOUVERNANCE) and
 *    only ATTACHED to the table — one governed place for every app's
 *    policies, no per-schema grants.
 *  • preflight.warning renders as-is; it is a warning, not a silent block.
 *  • After apply, the undo stays in view — a protection you cannot reverse
 *    from where you made it is a trap, not a feature.
 */

import { useState } from 'react';
import { RefreshCw, ShieldCheck, Undo2 } from 'lucide-react';
import {
  applyProtection,
  undoAccessRun,
  type ProtectionApplyResult,
} from '@/app/services/studio/studio-api';

const POLICY_HOME = 'CP_DATA360.GOUVERNANCE';

function sqlLines(v: string[] | string | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default function StudioProtectFlow({
  draftId,
  fqn,
  column,
  standard,
  standardLabel,
  onChanged,
}: {
  draftId: string;
  fqn: string;
  column: string;
  /** the classification's proposed standard for this column (e.g. MASK_EMAIL) */
  standard: string;
  standardLabel?: string;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'dry' | 'confirm' | 'undo' | null>(null);
  const [dry, setDry] = useState<ProtectionApplyResult | null>(null);
  const [applied, setApplied] = useState<{ runId: string } | null>(null);
  const [undone, setUndone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const body = {
    columns: [{ fqn, column }],
    policy: { standard },
    policy_schema: POLICY_HOME,
  };

  const runDry = async () => {
    setBusy('dry');
    setErr(null);
    try {
      setDry(await applyProtection(draftId, body));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The dry run could not be read.');
    } finally {
      setBusy(null);
    }
  };

  const runConfirm = async () => {
    setBusy('confirm');
    setErr(null);
    try {
      const r = await applyProtection(draftId, { ...body, confirm: true });
      const runId = r.apply?.run_id ?? r.run_id;
      if (r.status === 'applied' && runId) {
        setApplied({ runId });
        setUndone(false);
        onChanged?.();
      } else {
        const firstErr = (r.mutations ?? []).find((m) => m.error)?.error;
        setErr(firstErr?.message ?? r.note ?? `The apply answered « ${r.status ?? 'unknown'} ».`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The apply failed.');
    } finally {
      setBusy(null);
    }
  };

  const runUndo = async () => {
    if (!applied) return;
    setBusy('undo');
    setErr(null);
    try {
      const r = await undoAccessRun(draftId, applied.runId, true);
      if (r.status === 'undone' || r.status === 'nothing_undone') {
        setUndone(true);
        setApplied(null);
        setDry(null);
        onChanged?.();
      } else {
        setErr(`The undo answered « ${r.status ?? 'unknown'} ».`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The undo failed.');
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-accent-700 hover:underline dark:text-accent-400"
        title={`Apply ${standardLabel ?? standard} on ${column} here — dry run first, exact SQL shown, undo kept`}
      >
        protect now
      </button>
    );
  }

  return (
    <div className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800/40">
      <p className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
        <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
        Protect {column} — {standardLabel ?? standard}
      </p>
      <p className="mt-0.5 text-slate-500 dark:text-slate-400">
        The policy is created in the governed home ({POLICY_HOME.split('.').slice(-1)[0]}) and
        attached to this column. Admin &amp; approve keep reading in clear.
      </p>

      {applied ? (
        <div className="mt-2 space-y-1.5">
          <p className="rounded bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            Applied — the column is masked for every non-exempt role.
          </p>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void runUndo()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {busy === 'undo' ? (
              <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />
            ) : (
              <Undo2 aria-hidden className="h-3 w-3" />
            )}
            Undo this protection
          </button>
        </div>
      ) : dry ? (
        <div className="mt-2 space-y-1.5">
          {(dry.mutations ?? []).map((m, i) => (
            <pre
              key={m.mutation_id ?? i}
              className="overflow-x-auto rounded bg-white px-2 py-1 font-mono text-[11px] leading-relaxed text-slate-600 dark:bg-slate-900 dark:text-slate-300"
            >
              {sqlLines(m.sql).join('\n')}
            </pre>
          ))}
          {dry.preflight?.warning && (
            <p className="rounded bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {dry.preflight.warning}
            </p>
          )}
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void runConfirm()}
            className="rounded-lg bg-accent-600 px-2.5 py-1 font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {busy === 'confirm' ? 'Applying…' : 'Confirm — applies the mask now'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void runDry()}
          className="mt-2 rounded-lg border border-accent-600 px-2.5 py-1 font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50 dark:text-accent-400 dark:hover:bg-accent-950/30"
        >
          {busy === 'dry' ? 'Reading the exact SQL…' : 'Dry run — show the exact SQL, execute nothing'}
        </button>
      )}

      {undone && !applied && (
        <p className="mt-1.5 rounded bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Undone — the column reads as before.
        </p>
      )}
      {err && (
        <p className="mt-1.5 rounded bg-rose-50 px-2 py-1 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {err}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-1.5 text-[11px] text-slate-400 hover:underline dark:text-slate-500"
      >
        close
      </button>
    </div>
  );
}
