'use client';

import { useState, useEffect, useCallback } from 'react';
import { Text, Badge } from 'rizzui';
import {
  PiShieldCheckDuotone,
  PiKeyDuotone,
  PiTagDuotone,
  PiUsersDuotone,
  PiWarningCircleDuotone,
  PiLockKeyDuotone,
  PiRowsDuotone,
} from 'react-icons/pi';
import MetricHelp from '@/components/ui/MetricHelp';
import {
  getGovernanceOverview,
  getGrantsOverview,
} from '@/app/services/org-accounts/hooks';
import { extractApiError, formatNumber } from '@/app/services/org-accounts/utils';
import type {
  GovernanceOverviewResponse,
  GrantsOverviewResponse,
} from '@/app/services/org-accounts/types';

/**
 * A section is "degraded" when the backend lists its source token in the
 * response's degrade array. The two governance endpoints disagree on the key
 * name — governance-overview uses `degraded_sources`, grants-overview uses
 * `degraded_sections` — so we check both. Crucially this is driven off ARRAY
 * MEMBERSHIP, not emptiness: an empty section that is NOT listed is a genuine
 * "no data" (honest empty state), whereas a listed section is still warming
 * ("Computing…"). Never conflate the two.
 */
function isDegraded(
  resp: { degraded_sources?: string[]; degraded_sections?: string[] } | null,
  token: string,
): boolean {
  if (!resp) return false;
  const tokens = [...(resp.degraded_sources ?? []), ...(resp.degraded_sections ?? [])];
  return tokens.includes(token);
}

interface GovernanceTabProps {
  refreshKey: number;
}

const COMPUTING_LABEL = 'Computing… (large grant history)';

/** Small "still warming" affordance shown in place of a fake zero. */
function ComputingState({ title, definition }: { title: string; definition: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        {COMPUTING_LABEL}
      </span>
      <MetricHelp title={title} definition={definition} source="Grant history" />
    </span>
  );
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  help?: { definition: string; source?: string };
  accent: string;
}

function KpiCard({ icon, label, value, help, accent }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-center gap-2">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
          {icon}
        </div>
        <div className="flex items-center gap-1">
          <Text className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
          </Text>
          {help ? (
            <MetricHelp title={label} definition={help.definition} source={help.source} />
          ) : null}
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

export default function GovernanceTab({ refreshKey }: GovernanceTabProps) {
  const [gov, setGov] = useState<GovernanceOverviewResponse | null>(null);
  const [govLoading, setGovLoading] = useState(true);
  const [govError, setGovError] = useState<string | null>(null);

  const [grants, setGrants] = useState<GrantsOverviewResponse | null>(null);
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [grantsError, setGrantsError] = useState<string | null>(null);

  const load = useCallback(() => {
    setGovLoading(true);
    setGovError(null);
    getGovernanceOverview()
      .then((data) => setGov(data))
      .catch((e) => setGovError(extractApiError(e, 'Failed to load governance overview')))
      .finally(() => setGovLoading(false));

    setGrantsLoading(true);
    setGrantsError(null);
    getGrantsOverview()
      .then((data) => setGrants(data))
      .catch((e) => setGrantsError(extractApiError(e, 'Failed to load grants overview')))
      .finally(() => setGrantsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const masking = gov?.policy_coverage?.find((p) => p.policy_kind === 'MASKING');
  const rowAccess = gov?.policy_coverage?.find((p) => p.policy_kind === 'ROW_ACCESS');
  const tagUsage = gov?.tag_usage ?? [];
  const grantSummary = gov?.grant_summary ?? [];
  const grantSummaryDegraded = isDegraded(gov, 'gov_grant_summary');

  const privDist = grants?.privilege_distribution ?? [];
  const privDistDegraded = isDegraded(grants, 'grants_by_priv');
  const totalsDegraded = isDegraded(grants, 'grants_totals');
  const userRoleMappings = grants?.user_role_mappings ?? [];

  return (
    <div className="space-y-6">
      {/* Partial-data banner — at least one section is still warming. */}
      {gov?.partial || grants?.partial ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
        >
          <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <span>
            {grants?.note ??
              'Some grant-history sections are still being computed and may be incomplete — values that depend on them show “Computing…”. Refresh shortly.'}
          </span>
        </div>
      ) : null}

      {/* ── Policy coverage + counts (always real — never degraded) ── */}
      <div>
        <Text className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Governance posture</Text>
        {govError ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
            <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
            <div>
              <Text className="text-sm font-medium text-red-700 dark:text-red-300">Could not load governance overview</Text>
              <Text className="text-xs text-red-600 dark:text-red-400">{govError}</Text>
            </div>
          </div>
        ) : govLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={<PiLockKeyDuotone className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
              accent="bg-blue-50 dark:bg-blue-900/20"
              label="Masking policies"
              value={formatNumber(masking?.policy_count ?? 0)}
              help={{ definition: 'Column-masking policies protecting sensitive fields.', source: `${masking?.objects_covered ?? 0} objects covered` }}
            />
            <KpiCard
              icon={<PiRowsDuotone className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
              accent="bg-indigo-50 dark:bg-indigo-900/20"
              label="Row-access policies"
              value={formatNumber(rowAccess?.policy_count ?? 0)}
              help={{ definition: 'Row-level access policies restricting which rows a role can see.', source: `${rowAccess?.objects_covered ?? 0} objects covered` }}
            />
            <KpiCard
              icon={<PiUsersDuotone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
              accent="bg-emerald-50 dark:bg-emerald-900/20"
              label="Roles"
              value={formatNumber(gov?.role_count ?? 0)}
              help={{ definition: 'Total roles defined in the account.' }}
            />
            <KpiCard
              icon={<PiTagDuotone className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
              accent="bg-amber-50 dark:bg-amber-900/20"
              label="Tags in use"
              value={formatNumber(tagUsage.length)}
              help={{ definition: 'Distinct classification tags applied to objects.' }}
            />
          </div>
        )}
      </div>

      {/* ── Users with roles + privilege count (users_with_roles is NOT degraded) ── */}
      <div>
        <Text className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Access &amp; grants</Text>
        {grantsError ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
            <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
            <div>
              <Text className="text-sm font-medium text-red-700 dark:text-red-300">Could not load grants overview</Text>
              <Text className="text-xs text-red-600 dark:text-red-400">{grantsError}</Text>
            </div>
          </div>
        ) : grantsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              icon={<PiUsersDuotone className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
              accent="bg-blue-50 dark:bg-blue-900/20"
              label="Users with roles"
              value={formatNumber(grants?.summary?.users_with_roles ?? 0)}
              help={{ definition: 'Distinct users that have at least one role granted.' }}
            />
            <KpiCard
              icon={<PiKeyDuotone className="h-5 w-5 text-violet-600 dark:text-violet-400" />}
              accent="bg-violet-50 dark:bg-violet-900/20"
              label="User-role mappings"
              value={formatNumber(grants?.summary?.total_user_role_mappings ?? 0)}
              help={{ definition: 'Total user → role assignments.' }}
            />
            <KpiCard
              icon={<PiShieldCheckDuotone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
              accent="bg-emerald-50 dark:bg-emerald-900/20"
              label="Unique privileges"
              value={
                totalsDegraded ? (
                  <span className="text-base font-normal">—</span>
                ) : (
                  formatNumber(grants?.summary?.unique_privileges ?? 0)
                )
              }
              help={
                totalsDegraded
                  ? { definition: `${COMPUTING_LABEL}. The privilege totals are still being computed from the grant history.` }
                  : { definition: 'Distinct privileges granted across roles.' }
              }
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Grant summary (DEGRADABLE: gov_grant_summary) ── */}
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-700">
            <PiKeyDuotone className="h-5 w-5 text-blue-500" />
            <Text className="font-semibold text-gray-900 dark:text-white">Grant summary</Text>
            {grantSummary.length > 0 && !grantSummaryDegraded ? (
              <Badge variant="flat" color="info" className="ml-auto text-xs">{grantSummary.length}</Badge>
            ) : null}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {govLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                ))}
              </div>
            ) : grantSummaryDegraded ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-3 inline-flex items-center justify-center">
                  <ComputingState
                    title="Grant summary"
                    definition="Grant counts by privilege are computed from a potentially large grant history. They’re still warming — refresh shortly. This is not zero."
                  />
                </div>
                <Text className="text-xs text-gray-400">No fake zero is shown while the section computes.</Text>
              </div>
            ) : grantSummary.length === 0 ? (
              <div className="p-8 text-center">
                <PiKeyDuotone className="mx-auto mb-2 h-10 w-10 text-gray-300 dark:text-gray-600" />
                <Text className="text-sm text-gray-500 dark:text-gray-400">No grants found</Text>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Privilege</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">On</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {grantSummary.map((g, i) => (
                    <tr key={`${g.privilege}-${g.granted_on}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{g.privilege || '—'}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{g.granted_on || '—'}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-gray-900 dark:text-white">{formatNumber(g.grant_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Privilege distribution (DEGRADABLE: grants_by_priv) ── */}
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-700">
            <PiShieldCheckDuotone className="h-5 w-5 text-emerald-500" />
            <Text className="font-semibold text-gray-900 dark:text-white">Privilege distribution</Text>
            {privDist.length > 0 && !privDistDegraded ? (
              <Badge variant="flat" color="success" className="ml-auto text-xs">{privDist.length}</Badge>
            ) : null}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {grantsLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                ))}
              </div>
            ) : privDistDegraded ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-3 inline-flex items-center justify-center">
                  <ComputingState
                    title="Privilege distribution"
                    definition="Per-privilege grant counts are computed from a potentially large grant history. They’re still warming — refresh shortly. This is not zero."
                  />
                </div>
                <Text className="text-xs text-gray-400">No fake zero is shown while the section computes.</Text>
              </div>
            ) : privDist.length === 0 ? (
              <div className="p-8 text-center">
                <PiShieldCheckDuotone className="mx-auto mb-2 h-10 w-10 text-gray-300 dark:text-gray-600" />
                <Text className="text-sm text-gray-500 dark:text-gray-400">No privilege data</Text>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Privilege</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Object</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Grants</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {privDist.map((p, i) => (
                    <tr key={`${p.privilege}-${p.object_type}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{p.privilege || '—'}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{p.object_type || '—'}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-gray-900 dark:text-white">{formatNumber(p.grant_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Tag usage (real) ── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-700">
          <PiTagDuotone className="h-5 w-5 text-amber-500" />
          <Text className="font-semibold text-gray-900 dark:text-white">Tag usage</Text>
          {tagUsage.length > 0 ? (
            <Badge variant="flat" color="warning" className="ml-auto text-xs">{tagUsage.length}</Badge>
          ) : null}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {govLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              ))}
            </div>
          ) : tagUsage.length === 0 ? (
            <div className="p-8 text-center">
              <PiTagDuotone className="mx-auto mb-2 h-10 w-10 text-gray-300 dark:text-gray-600" />
              <Text className="text-sm text-gray-500 dark:text-gray-400">No tags applied to objects</Text>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Tag</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Schema</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Object type</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Uses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {tagUsage.map((t, i) => (
                  <tr key={`${t.tag_database}.${t.tag_schema}.${t.tag_name}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">{t.tag_name || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{t.tag_database}.{t.tag_schema}</td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{t.object_type || '—'}</td>
                    <td className="px-4 py-2 text-right text-sm font-medium text-gray-900 dark:text-white">{formatNumber(t.tag_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── User-role mappings (not currently returned by the endpoint → honest empty) ── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-700">
          <PiUsersDuotone className="h-5 w-5 text-blue-500" />
          <Text className="font-semibold text-gray-900 dark:text-white">User → role mappings</Text>
          {userRoleMappings.length > 0 ? (
            <Badge variant="flat" color="info" className="ml-auto text-xs">{userRoleMappings.length}</Badge>
          ) : null}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {grantsLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              ))}
            </div>
          ) : userRoleMappings.length === 0 ? (
            <div className="p-8 text-center">
              <PiUsersDuotone className="mx-auto mb-2 h-10 w-10 text-gray-300 dark:text-gray-600" />
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {grants?.summary?.total_user_role_mappings
                  ? `${formatNumber(grants.summary.total_user_role_mappings)} mappings exist; the detailed list is not exposed by this endpoint.`
                  : 'No user-role mappings to display'}
              </Text>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">User</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Role</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Granted by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {userRoleMappings.map((m, i) => (
                  <tr key={`${m.user_name}-${m.role_name}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">{m.user_name || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{m.role_name || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{m.granted_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
