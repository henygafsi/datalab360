'use client';

import { useState, useEffect, useCallback, Component, type ReactNode } from 'react';
import Link from 'next/link';
import { PiWarningCircleBold } from 'react-icons/pi';
import { Inbox, Loader2, AlertTriangle, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import CommandCenterDashboard from '@/app/shared/command-center';
import OnboardingTour from '@/app/shared/onboarding-tour';
import ProblemsInsightStrip from './components/ProblemsInsightStrip';
import Breadcrumb from '@/components/ui/Breadcrumb';
import EmptyState from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useCanPerform } from '@/hooks/useCanPerform';
import {
  getInbox,
  getMyRequests,
  getAllRequests,
  approveRequest,
  denyRequest,
  type AccessRequest,
} from '@/app/services/access-requests';

interface ErrorBoundaryProps {
  children: ReactNode;
  onError: (error: string) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class AccountOverviewErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message || 'An unexpected error occurred');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-800 m-4 p-8">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Something went wrong</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
            An error occurred while loading this page. This is usually temporary.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Access Requests compact widget ───────────────────────────────────────────
// Self-contained: catches its own errors, never surfaces them to the parent.
// Admin users see the full inbox (pending queue) + all-requests audit table.
// Non-admins see their own submissions.

const ADMIN_ROLES = ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN'];

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'short' });
  } catch {
    return iso.slice(0, 10);
  }
}

function AccessRequestsWidget() {
  const { role: authRole } = useAuth();
  const isAdmin = ADMIN_ROLES.includes((authRole ?? '').toUpperCase());

  // Approve/Deny reuse the SAME governance gate the Access Center inbox uses
  // (approve → grant, deny → revoke) — a gate admins provably hold since that
  // inbox runs with it. Fail-open while the allow-set loads so the controls
  // never flash disabled for an admin.
  const { allowed: canApprove } = useCanPerform('gouvernance', 'grant');
  const { allowed: canDeny } = useCanPerform('gouvernance', 'revoke');
  const canDecide = isAdmin && (canApprove || canDeny);

  const [kpiCount, setKpiCount] = useState<number | null>(null);
  const [rows, setRows] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  // REQUEST_ID of the row whose approve/deny is currently in flight.
  const [actingId, setActingId] = useState<string | null>(null);
  // 'unavailable' = the route is structurally absent or forbidden for this role
  // (403/404/501 — e.g. getAllRequests is account-admin-only): degrade silently,
  // matching the platform's "unprovisioned route is invisible" convention.
  // 'error' = a transient failure (network / timeout / 5xx): show a retry affordance.
  const [status, setStatus] = useState<'ok' | 'unavailable' | 'error'>('ok');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setStatus('ok');
    try {
      // KPI: admin = inbox count (pending queue); non-admin = my submissions count
      const kpiFetch = isAdmin ? getInbox() : getMyRequests();
      // Table: admin = /all (last 10); non-admin = /mine (last 10)
      const tableFetch = isAdmin ? getAllRequests() : getMyRequests();

      const [kpiRes, tableRes] = await Promise.all([kpiFetch, tableFetch]);
      setKpiCount(kpiRes.count ?? (kpiRes.requests?.length ?? null));
      const sorted = (tableRes.requests ?? []).slice().sort((a, b) =>
        (b.CREATED_AT ?? '').localeCompare(a.CREATED_AT ?? ''),
      );
      setRows(sorted.slice(0, 10));
    } catch (e) {
      const code = (e as { status?: number } | undefined)?.status;
      const structurallyUnavailable =
        code != null && (code === 501 || (code >= 400 && code < 500));
      setStatus(structurallyUnavailable ? 'unavailable' : 'error');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);

  // Approve / deny a pending request inline. Optimistic: the row's status flips
  // and the pending KPI drops immediately, then we reconcile silently against
  // the server (which also reverts the row on failure — no manual rollback).
  const handleDecision = useCallback(
    async (req: AccessRequest, decision: 'approve' | 'deny') => {
      setActingId(req.REQUEST_ID);
      const nextStatus = decision === 'approve' ? 'APPROVED' : 'DENIED';
      setRows((rs) =>
        rs.map((r) =>
          r.REQUEST_ID === req.REQUEST_ID ? { ...r, STATUS: nextStatus } : r,
        ),
      );
      setKpiCount((c) => (c != null && c > 0 ? c - 1 : c));
      try {
        if (decision === 'approve') await approveRequest(req.REQUEST_ID);
        else await denyRequest(req.REQUEST_ID);
        toast.success(decision === 'approve' ? 'Request approved' : 'Request denied');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setActingId(null);
        await load(true); // silent reconcile — keeps the optimistic feel
      }
    },
    [load],
  );

  // Structurally-unavailable routes vanish (never crash, never nag); transient
  // failures fall through and render an inline retry below.
  if (status === 'unavailable' && !loading) return null;

  return (
    <section className="mx-4 mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/50">
      {/* Section header + KPI */}
      <div className="mb-3 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-[hsl(var(--primary))]" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          {isAdmin ? 'Access Requests — Pending Inbox' : 'Access Requests — My Requests'}
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {loading ? (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-slate-400"
              aria-label="Loading access requests"
            />
          ) : status === 'error' ? null : (
            <span
              className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              title={isAdmin ? 'Pending requests awaiting approval' : 'Total submissions'}
            >
              {kpiCount != null ? kpiCount.toLocaleString() : '—'} pending
            </span>
          )}
          {isAdmin && (
            <Link
              href="/administration/access-center"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Manage in Access Center
            </Link>
          )}
        </div>
      </div>

      {/* Recent requests table */}
      {loading ? (
        <div className="space-y-2 py-2" role="status" aria-label="Loading access requests">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`ar-skeleton-${i}`}
              className="h-5 animate-pulse rounded bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : status === 'error' ? (
        <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
          <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Couldn’t load access requests right now.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Retry loading access requests"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          icon={Inbox}
          title={isAdmin ? 'No pending access requests' : 'No access requests yet'}
          description={
            isAdmin
              ? 'New requests awaiting approval will appear here.'
              : 'Requests you submit for data assets will appear here.'
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                {isAdmin && <th className="pb-1.5 pr-3">Requester</th>}
                <th className="pb-1.5 pr-3">Asset</th>
                <th className="pb-1.5 pr-3">Privilege</th>
                <th className="pb-1.5 pr-3">Status</th>
                <th className={canDecide ? 'pb-1.5 pr-3' : 'pb-1.5'}>Date</th>
                {canDecide && <th className="pb-1.5">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.REQUEST_ID}
                  className="border-b border-slate-50 text-slate-700 dark:border-slate-800/50 dark:text-slate-300"
                >
                  {isAdmin && (
                    <td className="py-1.5 pr-3 font-medium">
                      {r.REQUESTER ?? '—'}
                    </td>
                  )}
                  <td
                    className="max-w-[200px] truncate py-1.5 pr-3 font-mono text-[10px] text-slate-600 dark:text-slate-400"
                    title={r.ASSET_FQN ?? undefined}
                  >
                    {r.ASSET_FQN ?? '—'}
                  </td>
                  <td className="py-1.5 pr-3 font-semibold">{r.PRIVILEGE ?? '—'}</td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={
                        r.STATUS?.toLowerCase() === 'approved'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : r.STATUS?.toLowerCase() === 'denied'
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                      }
                    >
                      {r.STATUS ?? '—'}
                    </span>
                  </td>
                  <td className={canDecide ? 'py-1.5 pr-3 text-slate-400' : 'py-1.5 text-slate-400'}>
                    {fmtDateShort(r.CREATED_AT)}
                  </td>
                  {canDecide && (
                    <td className="py-1.5">
                      {r.STATUS?.toUpperCase() === 'PENDING' ? (
                        <span className="inline-flex items-center gap-1">
                          {canApprove && (
                            <button
                              type="button"
                              onClick={() => void handleDecision(r, 'approve')}
                              disabled={actingId === r.REQUEST_ID}
                              aria-label={`Approve access request from ${r.REQUESTER ?? 'requester'}`}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300"
                            >
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              Approve
                            </button>
                          )}
                          {canDeny && (
                            <button
                              type="button"
                              onClick={() => void handleDecision(r, 'deny')}
                              disabled={actingId === r.REQUEST_ID}
                              aria-label={`Deny access request from ${r.REQUESTER ?? 'requester'}`}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                            >
                              <XCircle className="h-3 w-3" aria-hidden="true" />
                              Deny
                            </button>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AccountOverviewPage() {
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <div className="@container">
        <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900/50 p-4">
          <PiWarningCircleBold className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <AccountOverviewErrorBoundary onError={(msg) => setError(msg)}>
      <div className="px-4 pt-3">
        <Breadcrumb items={[{ label: 'Account Overview', href: '/account-overview' }]} />
      </div>
      {/* What is failing right now, and why — above the fold, before the tabs. */}
      <div className="px-4 pb-3">
        <ProblemsInsightStrip />
      </div>
      <CommandCenterDashboard />
      {/* Cross-tab "Cost & Metering" + "Explore related" footer removed — it was
          empty for this org and repeated under every tab. The account ADN axes
          rating now lives in the Snowflake Objects overview where it belongs. */}
      <AccessRequestsWidget />
      <OnboardingTour />
    </AccountOverviewErrorBoundary>
  );
}
