'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Badge } from 'rizzui';
import {
  HiOutlineFolder,
  HiOutlineKey,
  HiOutlineLockClosed,
  HiOutlineArrowRight,
  HiOutlineArrowPath,
  HiOutlinePlusCircle,
} from 'react-icons/hi2';
import { ShieldPlus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  listSnowflakeStages,
  getStageGrants,
} from '@/app/(dashboard)/data-source-connection/connectionServices';
import { grantPermission, revokePermission } from '@/app/services/governance/fetch_grants';
import { getRoles } from '@/app/services/governance/fetch_roles';
import { useCanPerform } from '@/hooks/useCanPerform';
import InsightActionButton from '@/app/shared/insights/InsightActionButton';

type GrantRow = {
  privilege?: string;
  granted_to?: string;
  grantee_name?: string;
  PRIVILEGE?: string;
  GRANTED_TO?: string;
  GRANTEE_NAME?: string;
};

function norm(key: keyof GrantRow, row: GrantRow): string {
  const v = row[key] ?? row[key.toUpperCase() as keyof GrantRow];
  return typeof v === 'string' ? v : '';
}

// Stage privileges mapped to the card's promise: read / write / own.
// Values are the literal privileges the data warehouse accepts on a stage object.
const STAGE_PRIVILEGES = [
  { value: 'USAGE', label: 'Read — list & load files (USAGE)' },
  { value: 'WRITE', label: 'Write — upload & remove files (WRITE)' },
  { value: 'OWNERSHIP', label: 'Own — full control (OWNERSHIP)' },
] as const;

const HIGH_RISK = new Set(['OWNERSHIP']);

function privLabel(priv: string): string {
  const found = STAGE_PRIVILEGES.find((p) => p.value === priv);
  if (found) return found.label.split(' — ')[0];
  return priv;
}

export default function StageGrantsTable() {
  const router = useRouter();
  const { allowed: canGrant, loading: permLoading } = useCanPerform('gouvernance', 'grant');

  const [stages, setStages] = useState<{ name: string }[]>([]);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [loadingStages, setLoadingStages] = useState(true);
  const [loadingGrants, setLoadingGrants] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grant-composer state
  const [roles, setRoles] = useState<string[]>([]);
  const [grantRole, setGrantRole] = useState<string>('');
  const [grantPriv, setGrantPriv] = useState<string>('USAGE');
  // Tracks the last successful mutation so the next-step CTA strip stays honest.
  const [lastAction, setLastAction] = useState<
    { kind: 'grant' | 'revoke'; priv: string; role: string; stage: string } | null
  >(null);

  const loadStages = useCallback(async () => {
    setLoadingStages(true);
    setError(null);
    try {
      const res = await listSnowflakeStages();
      const list = Array.isArray(res?.stages) ? res.stages : Array.isArray(res?.data) ? res.data : [];
      setStages(list);
      if (list.length > 0) {
        setSelectedStage((prev) => prev || list[0].name);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load stages');
      toast.error(e?.message || 'Failed to load stages');
      setStages([]);
    } finally {
      setLoadingStages(false);
    }
  }, []);

  useEffect(() => {
    loadStages();
  }, [loadStages]);

  // Roles power the role-picker (no free text) — only fetched if the user can grant.
  useEffect(() => {
    if (!canGrant) return;
    let cancelled = false;
    getRoles()
      .then((list) => {
        if (cancelled) return;
        const names = list.map((r) => r.role).filter(Boolean).sort();
        setRoles(names);
        setGrantRole((prev) => prev || names[0] || '');
      })
      .catch(() => {
        /* role-picker stays empty; the grant button validates before firing */
      });
    return () => {
      cancelled = true;
    };
  }, [canGrant]);

  const loadGrants = useCallback((stage: string | null) => {
    if (!stage) {
      setGrants([]);
      return Promise.resolve();
    }
    setLoadingGrants(true);
    setError(null);
    return getStageGrants(stage)
      .then((data) => {
        setGrants(Array.isArray(data?.grants) ? (data.grants as GrantRow[]) : []);
      })
      .catch((e: any) => {
        setError(e?.message || 'Failed to load grants');
        toast.error(e?.message || 'Failed to load grants');
        setGrants([]);
      })
      .finally(() => {
        setLoadingGrants(false);
      });
  }, []);

  // Guard against a stale fetch winning a race when the user switches stages fast.
  useEffect(() => {
    if (!selectedStage) {
      setGrants([]);
      return;
    }
    let cancelled = false;
    setLoadingGrants(true);
    setError(null);
    getStageGrants(selectedStage)
      .then((data) => {
        if (!cancelled) setGrants(Array.isArray(data?.grants) ? (data.grants as GrantRow[]) : []);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || 'Failed to load grants');
        toast.error(e?.message || 'Failed to load grants');
        setGrants([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingGrants(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStage]);

  // Computed "to-do" label so the button states what it will do before the click.
  const grantLabel = useMemo(() => {
    if (!grantRole || !selectedStage) return 'Grant stage access';
    return `Grant ${privLabel(grantPriv)} on ${selectedStage} to ${grantRole}`;
  }, [grantPriv, grantRole, selectedStage]);

  if (loadingStages) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">
        Loading stages…
      </div>
    );
  }

  if (error && stages.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        <p className="font-medium">Cannot load stages</p>
        <p className="text-sm mt-1">{error}</p>
        <p className="text-sm mt-2 text-slate-600 dark:text-slate-400">
          Ensure a data warehouse connection is configured in Data Source Connection and that you have
          access to list stages.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <HiOutlineFolder className="h-4 w-4" />
          Stage
        </label>
        <select
          value={selectedStage ?? ''}
          onChange={(e) => {
            setSelectedStage(e.target.value || null);
            setLastAction(null);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        >
          <option value="">Select a stage</option>
          {stages.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        {selectedStage && (
          <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            <HiOutlineKey className="w-3 h-3 mr-1 inline" />
            {grants.length} grant{grants.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* ── Grant composer (role-picker → privilege → gated apply) ───────────── */}
      {selectedStage && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="mb-3 flex items-center gap-2">
            <ShieldPlus className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Grant stage access</h3>
          </div>

          {permLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Checking your permissions…</p>
          ) : !canGrant ? (
            <div
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              title="You don't have permission to grant stage access"
            >
              <HiOutlineLockClosed className="h-4 w-4 shrink-0" aria-hidden />
              You don&apos;t have permission to grant stage access. Ask an administrator for the
              Governance grant action.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Role
                  </label>
                  <select
                    value={grantRole}
                    onChange={(e) => setGrantRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  >
                    {roles.length === 0 && <option value="">No roles available</option>}
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Access level
                  </label>
                  <select
                    value={grantPriv}
                    onChange={(e) => setGrantPriv(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  >
                    {STAGE_PRIVILEGES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <InsightActionButton
                    label={grantLabel}
                    icon={HiOutlinePlusCircle as any}
                    size="md"
                    variant={HIGH_RISK.has(grantPriv) ? 'danger' : 'primary'}
                    successToast={`Granted ${privLabel(grantPriv)} on ${selectedStage} to ${grantRole}`}
                    pingBell
                    confirm={
                      HIGH_RISK.has(grantPriv)
                        ? {
                            title: 'Grant ownership of this stage?',
                            body: (
                              <span>
                                OWNERSHIP gives <strong>{grantRole}</strong> full control of{' '}
                                <strong>{selectedStage}</strong>, including the ability to drop it and
                                manage its grants. This is a high-risk change.
                              </span>
                            ),
                            confirmLabel: 'Grant ownership',
                            variant: 'warning',
                          }
                        : undefined
                    }
                    onAction={async () => {
                      if (!grantRole) throw new Error('Select a role first');
                      return grantPermission([grantPriv], 'STAGE', selectedStage, grantRole);
                    }}
                    onDone={() => {
                      setLastAction({ kind: 'grant', priv: grantPriv, role: grantRole, stage: selectedStage });
                      void loadGrants(selectedStage);
                    }}
                    unavailableHint="Stage grants are not available on this backend yet"
                    className="w-full justify-center"
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                {grantRole
                  ? `This will let ${grantRole} ${privLabel(grantPriv).toLowerCase()} files on the ${selectedStage} stage.`
                  : 'Pick a role to grant stage access.'}
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Next-step CTA strip (interactive redirection after an action) ────── */}
      {lastAction && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-sm dark:border-teal-900/50 dark:bg-teal-950/30"
        >
          <span className="font-medium text-teal-800 dark:text-teal-200">
            {lastAction.kind === 'grant' ? 'Access granted.' : 'Access revoked.'}
          </span>
          <span className="text-teal-700 dark:text-teal-300">What next?</span>
          <button
            type="button"
            onClick={() => loadGrants(selectedStage)}
            className="inline-flex items-center gap-1 rounded-md border border-teal-300 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-900/40"
          >
            <HiOutlineArrowPath className="h-3.5 w-3.5" aria-hidden />
            Refresh grants
          </button>
          <button
            type="button"
            onClick={() => setLastAction(null)}
            className="inline-flex items-center gap-1 rounded-md border border-teal-300 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-900/40"
          >
            <HiOutlinePlusCircle className="h-3.5 w-3.5" aria-hidden />
            Grant another
          </button>
          <button
            type="button"
            onClick={() => router.push('/governance/roles')}
            className="inline-flex items-center gap-1 rounded-md border border-teal-300 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-900/40"
          >
            Review role
            <HiOutlineArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => router.push('/governance/policies')}
            className="inline-flex items-center gap-1 rounded-md border border-teal-300 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-900/40"
          >
            View in policies
            <HiOutlineArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      {loadingGrants ? (
        <div className="flex items-center justify-center py-8 text-slate-500">
          Loading grants…
        </div>
      ) : selectedStage && grants.length === 0 && !error ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          No grants found for stage <strong>{selectedStage}</strong>.
        </div>
      ) : selectedStage && grants.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                  Privilege
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                  Granted To
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                  Grantee
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {grants.map((row, i) => {
                const priv = norm('privilege', row);
                const grantee = norm('grantee_name', row);
                return (
                  <tr
                    key={i}
                    className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <td className="px-4 py-2 text-slate-800 dark:text-slate-200">{priv}</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                      {norm('granted_to', row)}
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{grantee}</td>
                    <td className="px-4 py-2 text-right">
                      {permLoading ? (
                        <span className="text-[11px] text-slate-400">…</span>
                      ) : !canGrant ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500"
                          title="You don't have permission to revoke stage access"
                        >
                          <HiOutlineLockClosed className="h-3 w-3" aria-hidden />
                          Revoke
                        </span>
                      ) : (
                        <div className="flex justify-end">
                          <InsightActionButton
                            label={`Revoke ${priv} from ${grantee}`}
                            icon={Trash2}
                            variant="danger"
                            pingBell
                            successToast={`Revoked ${priv} on ${selectedStage} from ${grantee}`}
                            confirm={{
                              title: 'Revoke this stage grant?',
                              body: (
                                <span>
                                  This removes <strong>{priv}</strong> on{' '}
                                  <strong>{selectedStage}</strong> from <strong>{grantee}</strong>.
                                  The role loses this access immediately.
                                </span>
                              ),
                              confirmLabel: 'Revoke access',
                              variant: 'warning',
                            }}
                            onAction={async () => {
                              if (!priv || !grantee) throw new Error('Missing grant details to revoke');
                              return revokePermission([priv], 'STAGE', selectedStage, grantee);
                            }}
                            onDone={() => {
                              setLastAction({
                                kind: 'revoke',
                                priv,
                                role: grantee,
                                stage: selectedStage,
                              });
                              void loadGrants(selectedStage);
                            }}
                            unavailableHint="Stage revoke is not available on this backend yet"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
