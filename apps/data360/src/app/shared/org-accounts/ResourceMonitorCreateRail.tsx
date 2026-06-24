'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { PiWarningCircleDuotone } from 'react-icons/pi';
import { ActionRail } from '@/app/shared/action-rail';
import { createResourceMonitor } from '@/app/services/org-accounts/hooks';
import { extractApiError } from '@/app/services/org-accounts/utils';

/**
 * ResourceMonitorCreateRail — reusable, presentation-only create form for a
 * Snowflake account resource monitor (the canonical spend-cap / budget control).
 *
 * Wraps the validated `POST /org-accounts/resource-monitors` endpoint in a
 * non-blocking ActionRail. It is intentionally NOT permission-aware: the parent
 * owns `useCanPerform('org_accounts', 'create')` and gates its own trigger
 * button (mirroring how overview-tab already does it), so this rail only does
 * form + submit + toast + `onCreated` callback.
 *
 * There is NO backend DELETE for resource monitors, so no drop control is
 * offered anywhere — create only.
 */
export interface ResourceMonitorCreateRailProps {
  isOpen: boolean;
  onClose: () => void;
  /** Fired after a successful create so the parent can re-fetch its monitor list. */
  onCreated: () => void;
  /**
   * Optional pre-filled credit quota (e.g. a forecast's projected 30d total) to
   * seed the "set a spending cap" flow. The field stays user-editable.
   */
  defaultQuota?: number;
  /** Optional pre-filled monitor name suggestion. */
  defaultName?: string;
}

const FREQUENCIES = ['MONTHLY', 'DAILY', 'WEEKLY', 'YEARLY', 'NEVER'] as const;

export default function ResourceMonitorCreateRail({
  isOpen,
  onClose,
  onCreated,
  defaultQuota,
  defaultName,
}: ResourceMonitorCreateRailProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    credit_quota: '',
    frequency: 'MONTHLY',
    suspend_at_pct: '100',
  });

  // Seed the form from the optional defaults each time the rail opens. Done in
  // an effect (not initial state) so a parent that re-opens with new defaults
  // (e.g. a different forecast value) gets fresh values rather than stale ones.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setForm({
      name: defaultName ? defaultName.toUpperCase() : '',
      credit_quota: defaultQuota != null && defaultQuota > 0 ? String(Math.ceil(defaultQuota)) : '',
      frequency: 'MONTHLY',
      suspend_at_pct: '100',
    });
  }, [isOpen, defaultName, defaultQuota]);

  const valid =
    form.name.trim().length > 0 &&
    Number(form.credit_quota) > 0 &&
    Number(form.suspend_at_pct) > 0 &&
    Number(form.suspend_at_pct) <= 100;

  const close = () => {
    if (busy) return;
    onClose();
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await createResourceMonitor({
        name: form.name.trim(),
        credit_quota: Number(form.credit_quota),
        frequency: form.frequency,
        suspend_at_pct: Number(form.suspend_at_pct),
      });
      toast.success(`Resource monitor ${form.name.trim()} created`);
      onClose();
      onCreated();
    } catch (e) {
      setError(extractApiError(e, 'Failed to create resource monitor'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionRail
      isOpen={isOpen}
      onClose={close}
      title="New resource monitor"
      description="Cap credit consumption and auto-suspend warehouses at a threshold."
      accentClassName="bg-blue-500"
      footer={
        <>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy || !valid}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create monitor
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="rmc-name" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Monitor name
          </label>
          <input
            id="rmc-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))}
            placeholder="MONTHLY_BUDGET"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="rmc-quota" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Credit quota
          </label>
          <input
            id="rmc-quota"
            type="number"
            min={1}
            step={1}
            value={form.credit_quota}
            onChange={(e) => setForm((f) => ({ ...f, credit_quota: e.target.value }))}
            placeholder="1000"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          {defaultQuota != null && defaultQuota > 0 && (
            <p className="text-xs text-slate-400">Suggested from forecast: {Math.ceil(defaultQuota).toLocaleString()} credits</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="rmc-frequency" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Frequency
            </label>
            <select
              id="rmc-frequency"
              value={form.frequency}
              onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>{f.charAt(0) + f.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rmc-pct" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Suspend at (%)
            </label>
            <input
              id="rmc-pct"
              type="number"
              min={1}
              max={100}
              step={1}
              value={form.suspend_at_pct}
              onChange={(e) => setForm((f) => ({ ...f, suspend_at_pct: e.target.value }))}
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          When usage reaches the suspend threshold, Snowflake suspends warehouses tied to this monitor to stop
          further credit spend. Account-level monitors apply to the whole account.
        </p>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
            <PiWarningCircleDuotone className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </ActionRail>
  );
}
