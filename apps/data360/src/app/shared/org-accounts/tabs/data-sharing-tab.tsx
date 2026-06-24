'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Text, Badge } from 'rizzui';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import cn from '@core/utils/class-names';
import {
  PiShareNetworkDuotone,
  PiUsersDuotone,
  PiCloudArrowUpDuotone,
  PiWarningCircleDuotone,
} from 'react-icons/pi';
import {
  getReaderAccounts,
  getShares,
  getReplication,
  getShareDetail,
  createReaderAccount,
  deleteReaderAccount,
} from '@/app/services/org-accounts/hooks';
import { ActionRail } from '@/app/shared/action-rail';
import { ConfirmDestructiveDialog } from '@/components/ui/confirm-dialog';
import { formatDate, formatBytes, formatCredits, extractApiError } from '@/app/services/org-accounts/utils';
import { toServiceError } from '@/app/services/_errors';
import { useCanPerform } from '@/hooks/useCanPerform';
import type {
  ReaderAccount,
  Share,
  ReplicationEntry,
  DateRange,
  ShareDetailResponse,
} from '@/app/services/org-accounts/types';

interface DataSharingTabProps {
  refreshKey: number;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

export default function DataSharingTab({ refreshKey }: DataSharingTabProps) {
  const [readerAccounts, setReaderAccounts] = useState<ReaderAccount[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [replication, setReplication] = useState<ReplicationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  // Local refetch trigger so reader create/drop refresh the table without
  // depending on the parent-owned `refreshKey`.
  const [localRefresh, setLocalRefresh] = useState(0);

  // ── Reader-account lifecycle UI state ──────────────────────────────────
  // Create lives in a non-blocking <ActionRail>; drop is a destructive modal.
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', admin_name: '', admin_password: '', comment: '' });
  const [dropTarget, setDropTarget] = useState<ReaderAccount | null>(null);
  const [dropBusy, setDropBusy] = useState(false);

  // ── Share-detail drill-in (consumers + shared objects) ─────────────────
  const [shareDetailName, setShareDetailName] = useState<string | null>(null);
  const [shareDetail, setShareDetail] = useState<ShareDetailResponse | null>(null);
  const [shareDetailLoading, setShareDetailLoading] = useState(false);
  const [shareDetailError, setShareDetailError] = useState<string | null>(null);

  const openShareDetail = async (name: string) => {
    setShareDetailName(name);
    setShareDetail(null);
    setShareDetailError(null);
    setShareDetailLoading(true);
    try {
      const data = await getShareDetail(name);
      setShareDetail(data);
    } catch (e) {
      setShareDetailError(extractApiError(e, 'Failed to load share detail'));
    } finally {
      setShareDetailLoading(false);
    }
  };

  // ── Action-RBAC gating ─────────────────────────────────────────────────
  // Reader create/drop are real org_accounts mutations (createReaderAccount /
  // deleteReaderAccount). The action-registry module key is `org_accounts`
  // (underscore) — NOT the route slug "org-accounts". Keep the buttons enabled
  // while the allow-set loads (fail-open) so there's no flash of a disabled CTA.
  const { allowed: canCreate, loading: createPermLoading } = useCanPerform('org_accounts', 'create');
  const { allowed: canDrop, loading: dropPermLoading } = useCanPerform('org_accounts', 'delete');
  const createDenied = !canCreate && !createPermLoading;
  const dropDenied = !canDrop && !dropPermLoading;

  useEffect(() => {
    setLoading(true);
    setError(null);
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;
    let firstError: string | null = null;
    const guard = <T,>(p: Promise<T>): Promise<T | null> =>
      p.catch((e) => { firstError = firstError ?? extractApiError(e, 'Failed to load data sharing'); return null; });

    Promise.all([
      guard(getReaderAccounts()),
      guard(getShares()),
      guard(getReplication(days)),
    ]).then(([readerData, sharesData, replData]) => {
      if (readerData) setReaderAccounts(Array.isArray(readerData.reader_accounts) ? readerData.reader_accounts : []);
      if (sharesData) setShares(Array.isArray(sharesData.shares) ? sharesData.shares : []);
      if (replData) setReplication(Array.isArray(replData.replication) ? replData.replication : []);
      setError(firstError);
    }).finally(() => setLoading(false));
  }, [refreshKey, dateRange, localRefresh]);

  const resetCreateForm = () => {
    setForm({ name: '', admin_name: '', admin_password: '', comment: '' });
    setCreateError(null);
  };

  const handleCreateReader = async () => {
    setCreateBusy(true);
    setCreateError(null);
    try {
      await createReaderAccount({
        name: form.name.trim(),
        admin_name: form.admin_name.trim(),
        admin_password: form.admin_password,
        comment: form.comment.trim() || undefined,
      });
      toast.success(`Reader account ${form.name.trim()} created`);
      setCreateOpen(false);
      resetCreateForm();
      setLocalRefresh((v) => v + 1);
    } catch (e) {
      // POST /reader-accounts is not yet on the backend — degrade to an inline
      // error inside the rail rather than crashing or faking success.
      setCreateError(toServiceError(e, 'Failed to create reader account').message);
    } finally {
      setCreateBusy(false);
    }
  };

  const handleDropReader = async () => {
    if (!dropTarget) return;
    setDropBusy(true);
    try {
      await deleteReaderAccount(dropTarget.name);
      toast.success(`Reader account ${dropTarget.name} dropped`);
      setDropTarget(null);
      setLocalRefresh((v) => v + 1);
    } catch (e) {
      toast.error(extractApiError(e, 'Failed to drop reader account'));
    } finally {
      setDropBusy(false);
    }
  };

  const createFormValid =
    form.name.trim().length > 0 &&
    form.admin_name.trim().length > 0 &&
    // Backend requires an admin password of at least 8 characters — surface the
    // rule client-side instead of waiting for a server-side rejection.
    form.admin_password.length >= 8;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
          <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <Text className="text-sm font-medium text-red-700 dark:text-red-300">Some data sharing info could not be loaded</Text>
            <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiShareNetworkDuotone className="h-5 w-5 text-teal-600" />
          <Text className="font-semibold text-gray-900 dark:text-white">Data Sharing & Replication</Text>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {(['7d', '30d', '90d'] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                dateRange === r
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              )}
            >
              {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-sm text-gray-500 mb-2">Data Shares</Text>
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">{shares.length}</Text>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 dark:bg-teal-900/20">
              <PiShareNetworkDuotone className="h-5 w-5 text-teal-600" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-sm text-gray-500 mb-2">Reader Accounts</Text>
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">{readerAccounts.length}</Text>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <PiUsersDuotone className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-sm text-gray-500 mb-2">Replication Credits</Text>
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCredits(replication.reduce((s, r) => s + r.total_credits, 0))}
              </Text>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/20">
              <PiCloudArrowUpDuotone className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Shares + Reader Accounts side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Data Shares */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <Text className="font-semibold text-gray-900 dark:text-white">Data Shares</Text>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Database</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Kind</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {shares.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No shares</td></tr>
                ) : shares.map((s) => (
                  <tr key={s.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => openShareDetail(s.name)}
                        className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                        title="View consumers and shared objects"
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{s.database_name}</Text></td>
                    <td className="px-4 py-2"><Badge variant="flat" color={s.kind === 'OUTBOUND' ? 'success' : 'info'} className="text-xs">{s.kind}</Badge></td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{formatDate(s.created_on)}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reader Accounts */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <Text className="font-semibold text-gray-900 dark:text-white">Reader Accounts</Text>
            <button
              type="button"
              disabled={createDenied}
              title={createDenied ? 'You lack the "create" permission on Client Accounts. Ask an administrator to grant it.' : undefined}
              onClick={() => { if (createDenied) return; resetCreateForm(); setCreateOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
            >
              <Plus className="h-3.5 w-3.5" /> New reader
            </button>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Cloud</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Region</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {readerAccounts.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No reader accounts</td></tr>
                ) : readerAccounts.map((r) => (
                  <tr key={r.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2"><Text className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</Text></td>
                    <td className="px-4 py-2"><Badge variant="flat" color="info" className="text-xs">{r.cloud}</Badge></td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{r.region}</Text></td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{formatDate(r.created_on)}</Text></td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        disabled={dropDenied}
                        onClick={() => { if (dropDenied) return; setDropTarget(r); }}
                        aria-label={`Drop reader account ${r.name}`}
                        title={dropDenied ? 'You lack the "delete" permission on Client Accounts. Ask an administrator to grant it.' : undefined}
                        className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Drop
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Replication */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <PiCloudArrowUpDuotone className="h-5 w-5 text-purple-500" />
            <Text className="font-semibold text-gray-900 dark:text-white">Replication Usage</Text>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Credits</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Bytes Transferred</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {replication.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No replication data</td></tr>
              ) : replication.map((r) => (
                <tr key={r.account_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3"><Text className="font-medium text-gray-900 dark:text-white">{r.account_name}</Text></td>
                  <td className="px-4 py-3 text-right"><Text className="font-medium text-purple-600">{formatCredits(r.total_credits)}</Text></td>
                  <td className="px-4 py-3 text-right"><Text className="text-gray-600 dark:text-gray-300">{formatBytes(r.total_bytes_transferred)}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Share detail drill-in (consumers + shared objects) ───────────── */}
      <ActionRail
        isOpen={shareDetailName !== null}
        onClose={() => { setShareDetailName(null); setShareDetail(null); setShareDetailError(null); }}
        title={shareDetailName ? `Share: ${shareDetailName}` : 'Share detail'}
        description="Consumers and objects exposed by this data share."
        accentClassName="bg-teal-500"
      >
        {shareDetailLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : shareDetailError ? (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
            <PiWarningCircleDuotone className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{shareDetailError}</span>
          </div>
        ) : shareDetail ? (
          <div className="space-y-5">
            {/* Share summary */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <Text className="text-slate-500 dark:text-slate-400">Database</Text>
                <Text className="font-medium text-slate-900 dark:text-white">{shareDetail.share?.database_name || '—'}</Text>
              </div>
              <div>
                <Text className="text-slate-500 dark:text-slate-400">Kind</Text>
                <Text className="font-medium text-slate-900 dark:text-white">{shareDetail.share?.kind || '—'}</Text>
              </div>
            </div>

            {/* Consumers */}
            <div>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Consumers ({shareDetail.consumers?.length ?? 0})
              </Text>
              {(shareDetail.consumers?.length ?? 0) === 0 ? (
                <Text className="text-sm text-slate-400">No consumers</Text>
              ) : (
                <ul className="space-y-1.5">
                  {shareDetail.consumers.map((c, i) => (
                    <li key={`${c.consumer_account}-${i}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/40">
                      <span className="font-medium text-slate-900 dark:text-white">{c.consumer_name || c.consumer_account || '—'}</span>
                      <span className="ml-2 text-slate-500 dark:text-slate-400">{c.consumer_region || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Shared objects */}
            <div>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Shared objects ({shareDetail.objects?.length ?? 0})
              </Text>
              {(shareDetail.objects?.length ?? 0) === 0 ? (
                <Text className="text-sm text-slate-400">No objects exposed</Text>
              ) : (
                <ul className="space-y-1">
                  {shareDetail.objects.map((o, i) => (
                    <li key={`${o}-${i}`} className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {o}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </ActionRail>

      {/* ── Create reader account (non-blocking ActionRail) ───────────────── */}
      <ActionRail
        isOpen={createOpen}
        onClose={() => { if (!createBusy) { setCreateOpen(false); resetCreateForm(); } }}
        title="New reader account"
        description="Provision a managed reader account for outbound data sharing."
        accentClassName="bg-blue-500"
        footer={
          <>
            <button
              type="button"
              onClick={() => { if (!createBusy) { setCreateOpen(false); resetCreateForm(); } }}
              disabled={createBusy}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateReader}
              disabled={createBusy || !createFormValid}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {createBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create reader
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="reader-name" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Reader account name
            </label>
            <input
              id="reader-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))}
              placeholder="READER_ACME"
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reader-admin" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Admin username
            </label>
            <input
              id="reader-admin"
              value={form.admin_name}
              onChange={(e) => setForm((f) => ({ ...f, admin_name: e.target.value }))}
              placeholder="reader_admin"
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reader-pwd" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Admin password <span className="text-slate-400">(min 8 characters)</span>
            </label>
            <input
              id="reader-pwd"
              type="password"
              value={form.admin_password}
              onChange={(e) => setForm((f) => ({ ...f, admin_password: e.target.value }))}
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reader-comment" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Comment (optional)
            </label>
            <textarea
              id="reader-comment"
              rows={2}
              value={form.comment}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              className="block w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          {createError && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              <PiWarningCircleDuotone className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{createError}</span>
            </div>
          )}
        </div>
      </ActionRail>

      {/* ── Drop reader account (destructive confirm — modal) ─────────────── */}
      <ConfirmDestructiveDialog
        open={dropTarget !== null}
        onOpenChange={(next) => { if (!next && !dropBusy) setDropTarget(null); }}
        tier="hard"
        resourceLabel="reader account"
        resourceName={dropTarget?.name ?? ''}
        title={dropTarget ? `Drop reader account ${dropTarget.name}?` : 'Drop reader account?'}
        body={
          <span>
            This drops the managed reader account and revokes its access to any
            shared data. Consumers using this reader will lose access immediately.
          </span>
        }
        irreversibleNote="The reader account and its local objects are removed. This cannot be undone."
        confirmLabel="Drop reader"
        loading={dropBusy}
        onConfirm={handleDropReader}
      />
    </div>
  );
}
