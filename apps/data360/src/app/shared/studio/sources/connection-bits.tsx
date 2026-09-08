'use client';

/**
 * connection-bits — shared rendering for the connections domain: the
 * distinct-checks diagnostic (never one green light), refusal rendering
 * (a 409/422 is a product answer, shown in place with its structure),
 * and the overall/status chips.
 */

import type {
  ConnectionTestCheck,
  ConnectionTestResult,
  Refusal,
} from '@/app/services/studio/connections';
import { fmtDateTime } from '@/app/shared/studio/sources/sources-kit';

export const OVERALL_CLS: Record<string, string> = {
  pass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  degraded: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  fail: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  inconclusive: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export const CHECK_STATUS_CLS: Record<string, string> = {
  pass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  fail: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  skipped: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  not_tested: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const CHECK_WORDS: Record<string, string> = {
  network: 'network / resolution',
  auth: 'authentication',
  execution_context: 'execution context',
  metadata_discovery: 'metadata discovery',
  read_selected_objects: 'read of the selected objects',
  write: 'write access',
};

export function checkWords(c: ConnectionTestCheck): string {
  return CHECK_WORDS[c.check ?? ''] ?? (c.check ?? '');
}

/** `detail` arrives as words OR as a structured payload ({user, role,
 *  account} on auth, {databases_seen, method} on discovery…) — flatten it
 *  to a sentence; a raw object in JSX is the historic React #31 crash. */
export function detailWords(detail: ConnectionTestCheck['detail']): string {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  return Object.entries(detail)
    .filter(([, v]) => v != null)
    .map(([k, v]) =>
      typeof v === 'object' ? `${k.replace(/_/g, ' ')}: ${JSON.stringify(v)}` : `${k.replace(/_/g, ' ')}: ${String(v)}`,
    )
    .join(' · ');
}

/** One diagnostic, rendered check by check — the identity actually tested
 *  and the config version are part of the proof, and `write` never turns
 *  green here. */
export function TestResultView({ result }: { result: ConnectionTestResult }) {
  const idw = result.identity
    ? Object.entries(result.identity)
        .filter(([k, v]) => k !== 'svc_proof' && v != null && typeof v !== 'object')
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(' · ')
    : null;
  return (
    <div className="text-[13px]">
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <span className={`rounded-full px-1.5 py-px font-medium ${OVERALL_CLS[result.overall ?? 'inconclusive'] ?? OVERALL_CLS.inconclusive}`}>
          {result.overall ?? 'inconclusive'}
        </span>
        {result.at && <span>ran {fmtDateTime(result.at)}</span>}
        {result.config_version != null && <span>· config v{result.config_version}</span>}
        {result.stale && (
          <span className="rounded-full bg-amber-50 px-1.5 py-px text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            stale — the configuration changed since this proof
          </span>
        )}
      </p>
      {idw && (
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          identity tested: {idw}
          {result.identity?.svc_proof === false ? ' · your own identity, no service fallback' : ''}
        </p>
      )}
      <ul className="mt-1 space-y-0.5">
        {(result.checks ?? []).map((c, i) => (
          <li key={c.check ?? i} className="flex flex-wrap items-baseline gap-1.5">
            <span className={`shrink-0 rounded-full px-1.5 py-px text-xs ${CHECK_STATUS_CLS[c.status ?? 'not_tested'] ?? CHECK_STATUS_CLS.not_tested}`}>
              {(c.status ?? 'not tested').replace('_', ' ')}
            </span>
            <span className="text-slate-700 dark:text-slate-200">
              <span className="font-medium">{checkWords(c)}</span>
              {c.ms != null && <span className="text-slate-400 dark:text-slate-500"> · {c.ms} ms</span>}
              {detailWords(c.detail) && <span> — {detailWords(c.detail)}</span>}
              {c.error_class && (
                <span className="ml-1 font-mono text-xs text-slate-400 dark:text-slate-500">
                  [{c.error_class}]
                </span>
              )}
            </span>
            {c.fix && (
              <span className="basis-full pl-1 text-xs text-slate-500 dark:text-slate-400">
                fix: {c.fix}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A refusal shown in place — code + message + what the payload names
 *  (dependencies, options, impact) without dumping raw JSON. */
export function RefusalView({ refusal }: { refusal: Refusal }) {
  const d = refusal.detail ?? {};
  const deps = d.dependencies as
    | {
        applications?: Array<{ name?: string; title?: string; draft_id?: string }>;
        hidden_applications?: number;
        jobs?: number;
        objects?: number;
      }
    | undefined;
  const options = d.options as string[] | undefined;
  return (
    <div role="alert" className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[13px] text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
      <p>
        {refusal.code && <span className="font-mono text-xs">{refusal.code} — </span>}
        {refusal.message ?? 'The action was refused.'}
      </p>
      {deps && (
        <p className="mt-0.5 text-xs">
          Depends on it:{' '}
          {(deps.applications ?? []).map((a) => a.title ?? a.name ?? a.draft_id).filter(Boolean).join(', ') || '—'}
          {deps.hidden_applications ? ` · ${deps.hidden_applications} application(s) you cannot see` : ''}
          {deps.jobs != null ? ` · ${deps.jobs} job(s)` : ''}
          {deps.objects != null ? ` · ${deps.objects} object(s)` : ''}
        </p>
      )}
      {options && options.length > 0 && (
        <p className="mt-0.5 text-xs">options: {options.join(' · ')}</p>
      )}
    </div>
  );
}
