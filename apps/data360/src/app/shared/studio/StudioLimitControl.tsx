'use client';

/**
 * StudioLimitControl — raise the free-preview limit, where you hit it.
 *
 * The scan stops at "10 of 10 free scans per application" and the reader
 * asks, reasonably, "where do I change that?". The honest answer used to
 * be "you can't from here". Now an ACCOUNTADMIN can, in place — the backend
 * exposes it as a per-account override, gated to the Data360 ACCOUNTADMIN
 * product role, recorded with who/when/why.
 *
 * It is a SPENDING decision, and the control says so: the compute the
 * higher limit unlocks stays on the account's bill. A non-admin sees the
 * limit and who set it, and the plain statement that an administrator
 * raises it — never a dead button.
 */

import { useEffect, useState } from 'react';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import { isAdminRole } from '@/config/constants';
import { useAuth } from '@/hooks/useAuth';
import {
  getPreviewPolicy,
  setPreviewPolicy,
  type PreviewPolicy,
} from '@/app/services/studio/studio-api';

export default function StudioLimitControl({
  limitKey = 'objects_per_draft',
  label = 'free table scans per application',
  onChanged,
}: {
  limitKey?: 'objects_per_draft' | 'ai_calls_per_draft' | 'ai_calls_per_hour';
  label?: string;
  onChanged?: () => void;
}) {
  const { role } = useAuth();
  const admin = isAdminRole(role);
  const [policy, setPolicy] = useState<PreviewPolicy | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void getPreviewPolicy()
      .then((p) => alive && setPolicy(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!policy) return null;
  const current = policy.limits?.[limitKey];
  const bounds = policy.adjustable?.bounds?.[limitKey];
  const ov = policy.account_override;

  const save = async () => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    setBusy(true);
    setMsg(null);
    try {
      const next = await setPreviewPolicy({ [limitKey]: n, reason: reason.trim() || undefined } as never);
      setPolicy(next);
      setMsg({ ok: true, text: `Raised to ${next.limits?.[limitKey]} — recorded as a spending decision.` });
      setOpen(false);
      onChanged?.();
    } catch (e) {
      const d = (e as { response?: { data?: { detail?: { message?: string; error_code?: string; min?: number; max?: number } } } })
        ?.response?.data?.detail;
      const bound = d?.min != null || d?.max != null ? ` (allowed ${d?.min}–${d?.max})` : '';
      setMsg({
        ok: false,
        text:
          d?.error_code === 'APPROVAL_REQUIRED'
            ? 'Only a Data360 account administrator can change this limit.'
            : (d?.message ?? 'The limit could not be changed.') + bound,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 text-xs">
      <p className="text-slate-500 dark:text-slate-400">
        The limit is {current ?? '—'} {label}.
        {ov?.by && (
          <>
            {' '}
            Set to {ov.limits?.[limitKey] ?? current} by {ov.by}
            {ov.reason ? ` — “${ov.reason}”` : ''}.
          </>
        )}
      </p>
      {admin ? (
        open ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <input
              type="number"
              value={value}
              min={bounds?.min}
              max={bounds?.max}
              aria-label={`New limit for ${label}`}
              onChange={(e) => setValue(e.target.value)}
              className="h-7 w-20 rounded-lg border border-slate-200 bg-white px-1.5 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            <input
              value={reason}
              placeholder="why (recorded)"
              aria-label="Reason for the change"
              onChange={(e) => setReason(e.target.value)}
              className="h-7 w-52 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            <button
              type="button"
              disabled={busy || value === ''}
              onClick={() => void save()}
              className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              {busy && <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />}
              Save
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
            >
              Cancel
            </button>
            {bounds && (
              <span className="text-slate-400 dark:text-slate-500">
                allowed {bounds.min}–{bounds.max}
              </span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setValue(String(current ?? ''));
              setOpen(true);
            }}
            className="mt-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
          >
            <SlidersHorizontal aria-hidden className="h-3 w-3" />
            Raise it — this is a spending decision
          </button>
        )
      ) : (
        <p className="mt-0.5 text-slate-400 dark:text-slate-500">
          An account administrator can raise it — the compute it unlocks stays on the account’s bill.
        </p>
      )}
      {msg && (
        <p
          role="status"
          className={`mt-1 ${msg.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
