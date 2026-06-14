'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  PiUserCheck,
  PiWrench,
  PiShieldCheck,
  PiInfo,
} from 'react-icons/pi';
import {
  getMyScopePolicies,
  formatPolicyError,
  type MyScopePolicy,
  type MyScopePoliciesResult,
} from '@/app/services/governance/policies';

// Neutral, customer-safe labels per policy family (no vendor names).
const TYPE_LABEL: Record<string, string> = {
  MASKING: 'Masking',
  ROW_ACCESS: 'Row access',
  AGGREGATION: 'Aggregation',
};

const TYPE_ACCENT: Record<string, string> = {
  MASKING: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  ROW_ACCESS: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  AGGREGATION: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
};

/**
 * Tri-state cell. `true` → badge; `false` → muted "No"; `null`/`undefined` →
 * "—" (unknown — never a fake No). Honest by construction (no `?? false`).
 */
function TriStateCell({
  value,
  trueLabel,
  trueClass,
  icon: Icon,
}: {
  value: boolean | null | undefined;
  trueLabel: string;
  trueClass: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  if (value === true) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${trueClass}`}>
        <Icon className="h-3.5 w-3.5" />
        {trueLabel}
      </span>
    );
  }
  if (value === false) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">No</span>;
  }
  // null / undefined → undeterminable
  return (
    <span className="text-xs text-slate-400 dark:text-slate-500" title="Could not be determined">
      —
    </span>
  );
}

export default function MyRolePoliciesContent() {
  const [data, setData] = useState<MyScopePoliciesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyScopePolicies();
      setData(res);
    } catch (e: any) {
      setError(formatPolicyError(e, 'Failed to load policies for your role.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Loading ----
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60"
          />
        ))}
      </div>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/40 dark:bg-red-900/20">
        <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
        <button
          onClick={load}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  const role = data?.role || '—';
  const policies = data?.policies ?? [];

  return (
    <div className="space-y-4">
      {/* Header strip: role + count + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
            <PiShieldCheck className="h-4 w-4" />
            Active role: {role}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {policies.length} {policies.length === 1 ? 'policy' : 'policies'} in scope
          </span>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Honest disclaimer about flag precision */}
      {data?.note && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          <PiInfo className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>{data.note}</span>
        </div>
      )}

      {/* Empty */}
      {policies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-10 text-center dark:border-slate-700 dark:bg-slate-800/30">
          <PiShieldCheck className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            No policies in scope for role “{role}”
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            No masking, row-access, or aggregation policy is owned by, granted to, or references your active role.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3">Policy</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Applies to your role</th>
                  <th className="px-4 py-3">Manageable by you</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {policies.map((p: MyScopePolicy) => (
                  <tr
                    key={`${p.policy_type}:${p.database_name ?? ''}.${p.schema_name ?? ''}.${p.name}`}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{p.name || '—'}</div>
                      {p.comment ? (
                        <div className="mt-0.5 max-w-md truncate text-xs text-slate-500 dark:text-slate-400">
                          {p.comment}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          TYPE_ACCENT[p.policy_type] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {TYPE_LABEL[p.policy_type] ?? p.policy_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {p.owner || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <TriStateCell
                        value={p.references_my_role}
                        trueLabel="Applies to your role"
                        trueClass="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        icon={PiUserCheck}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <TriStateCell
                        value={p.manageable_by_me}
                        trueLabel="Manageable by you"
                        trueClass="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        icon={PiWrench}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
