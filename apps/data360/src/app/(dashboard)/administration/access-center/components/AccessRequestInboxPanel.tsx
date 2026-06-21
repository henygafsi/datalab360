'use client';

/**
 * AccessRequestInboxPanel — approval inbox for the Access Control Center.
 *
 * Fetches GET /access-requests/inbox on mount (returns pending requests the
 * caller can approve; for admin roles this is the full pending queue).
 * Renders a compact table with one approve + one deny action per row.
 *
 * Approve → GovernedActionButton (module='gouvernance', action='grant').
 * Deny    → GovernedActionButton (module='gouvernance', action='revoke').
 *
 * After each decision the inbox is refreshed and a toast is shown.
 * Degrades honestly: "—" for empty fields, empty-state when no pending requests,
 * quiet retry on load failure — never crashes, never fabricates data.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Inbox, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import { GlassPanel } from '@/app/shared/glass';
import GovernedActionButton from '@/app/shared/insights/GovernedActionButton';
import {
  getInbox,
  approveRequest,
  denyRequest,
  type AccessRequest,
} from '@/app/services/access-requests';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Format an ISO string as a short datetime, or "—" for null/undefined. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

function dash(v: string | null | undefined): string {
  return v && v.trim() ? v : '—';
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  const cls =
    s === 'approved'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : s === 'denied'
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
        cls,
      )}
    >
      {status.toLowerCase()}
    </span>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AccessRequestInboxPanel() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInbox();
      setRequests(res.requests ?? []);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── per-row approve / deny callbacks ─────────────────────────────────────

  const makeApproveAction = (req: AccessRequest) => async () => {
    const result = await approveRequest(req.REQUEST_ID);
    toast({
      title: 'Request approved',
      description: `Access granted to ${result.to_role} for ${result.asset_fqn}.`,
    });
    await load();
    return result;
  };

  const makeDenyAction = (req: AccessRequest) => async () => {
    const result = await denyRequest(req.REQUEST_ID);
    toast({ title: 'Request denied' });
    await load();
    return result;
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <GlassPanel depth={1} radius="xl" className="space-y-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-[hsl(var(--primary))]" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Access Request Inbox
          </h2>
          {!loading && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {requests.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
          aria-label="Refresh inbox"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error} —{' '}
          <button
            type="button"
            onClick={() => void load()}
            className="underline"
          >
            retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && requests.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400 dark:text-slate-500">
          <Inbox className="h-7 w-7 opacity-40" />
          <p className="text-[12px]">No pending access requests.</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && requests.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="pb-2 pr-3">Requester</th>
                <th className="pb-2 pr-3">Asset</th>
                <th className="pb-2 pr-3">Privilege</th>
                <th className="pb-2 pr-3">Reason</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Requested</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => {
                const isPending = req.STATUS?.toUpperCase() === 'PENDING';
                return (
                  <tr
                    key={req.REQUEST_ID}
                    className="border-b border-slate-50 text-slate-700 hover:bg-slate-50/50 dark:border-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800/20"
                  >
                    <td className="py-2 pr-3 align-top font-medium">
                      {dash(req.REQUESTER)}
                      {req.REQUESTER_ROLE && (
                        <span className="ml-1 text-[9px] text-slate-400 dark:text-slate-500">
                          ({req.REQUESTER_ROLE})
                        </span>
                      )}
                    </td>
                    <td
                      className="max-w-[180px] truncate py-2 pr-3 align-top font-mono text-[10px]"
                      title={req.ASSET_FQN}
                    >
                      {dash(req.ASSET_FQN)}
                      {req.ASSET_TYPE && (
                        <span className="ml-1 text-[9px] text-slate-400 dark:text-slate-500">
                          [{req.ASSET_TYPE}]
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 align-top font-semibold">
                      {dash(req.PRIVILEGE)}
                    </td>
                    <td
                      className="max-w-[140px] truncate py-2 pr-3 align-top text-slate-500 dark:text-slate-400"
                      title={req.REASON ?? undefined}
                    >
                      {dash(req.REASON)}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      {statusBadge(req.STATUS ?? 'unknown')}
                    </td>
                    <td className="py-2 pr-3 align-top text-slate-400 dark:text-slate-500">
                      {fmtDate(req.CREATED_AT)}
                    </td>
                    <td className="py-2 align-top">
                      {isPending ? (
                        <span className="inline-flex items-center gap-1">
                          <GovernedActionButton
                            module="gouvernance"
                            action="grant"
                            label="Approve"
                            icon={CheckCircle2}
                            variant="subtle"
                            size="sm"
                            successToast={`Approved request ${req.REQUEST_ID}`}
                            onAction={makeApproveAction(req)}
                            denyMode="hide"
                          />
                          <GovernedActionButton
                            module="gouvernance"
                            action="revoke"
                            label="Deny"
                            icon={XCircle}
                            variant="danger"
                            size="sm"
                            successToast={`Denied request ${req.REQUEST_ID}`}
                            onAction={makeDenyAction(req)}
                            denyMode="hide"
                          />
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          {dash(req.DECIDED_BY)}
                          {req.DECIDED_AT && (
                            <span className="ml-1 text-slate-300 dark:text-slate-600">
                              · {fmtDate(req.DECIDED_AT)}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </GlassPanel>
  );
}
