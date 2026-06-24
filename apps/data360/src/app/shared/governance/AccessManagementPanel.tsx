'use client';

/**
 * AccessManagementPanel — reusable cross-page "Manage access" panel.
 *
 * Lists which ROLES have access to a given page (grouped from the validated
 * `/api/platform/grants` surface), lets a super-admin grant/revoke a role, and
 * manages user->role bindings (Members). Reads + post-mutation refresh use
 * GET /grants (fresh after a revoke), never /grants/role/{role} (stale).
 *
 * Writes are gated to super-admin Snowflake roles (ACCOUNTADMIN / ORGADMIN /
 * SECURITYADMIN). Non-admins see a read-only view with an explanatory tooltip;
 * the backend 403 is the real guard and surfaces honestly on any write attempt.
 *
 * Mirrors the AccessManagementSlot pattern (inline-confirm rows, react-hot-toast,
 * getApiErrorMessage, loading/empty/error states). Light theme, no reskin.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Tooltip } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  Shield, ShieldCheck, UserPlus, Users, Plus, Trash2, X, Check,
  Loader2, RefreshCw, Lock, KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import {
  listGrants,
  grantPage,
  revokePage,
  listUserGrants,
  bindUser,
  unbindUser,
  canManageGrants,
  getApiErrorMessage,
  type PageGrant,
  type UserRoleBinding,
} from '@/app/services/platform/grants';

export interface AccessManagementPanelProps {
  /** Action-registry module key (e.g. 'data-products', 'explore-design'). */
  module: string;
  /** Page key the grants are scoped to (usually same family as module). */
  page: string;
  /** Optional object identifier (reserved for future per-object scoping). */
  objectName?: string;
  /** Optional human label shown in the panel header. */
  objectLabel?: string;
}

// One role's grant on this page (collapsed from possibly several tab rows).
interface RoleAccess {
  role: string;
  tabs: string[];
  grantedAt: string | null;
}

function groupByRole(items: PageGrant[]): RoleAccess[] {
  const map = new Map<string, RoleAccess>();
  for (const g of items) {
    if (g.revoked_at) continue; // only active grants
    const existing = map.get(g.role);
    if (existing) {
      if (g.tab) existing.tabs.push(g.tab);
    } else {
      map.set(g.role, {
        role: g.role,
        tabs: g.tab ? [g.tab] : [],
        grantedAt: g.granted_at ?? null,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.role.localeCompare(b.role));
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return formatDistanceToNow(d, { addSuffix: true });
}

const AccessManagementPanel: React.FC<AccessManagementPanelProps> = ({
  module,
  page,
  objectLabel,
}) => {
  const { role: sessionRole } = useAuth();
  const canManage = canManageGrants(sessionRole);
  const NO_WRITE_TIP =
    'Managing access requires a super-admin role (ACCOUNTADMIN, ORGADMIN or SECURITYADMIN).';

  // ── Role-grants state ──
  const [grants, setGrants] = useState<PageGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Grant form
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [granting, setGranting] = useState(false);

  // Revoke confirm
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  // ── Members state ──
  const [members, setMembers] = useState<UserRoleBinding[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [showBindForm, setShowBindForm] = useState(false);
  const [bindUsername, setBindUsername] = useState('');
  const [bindRole, setBindRole] = useState('');
  const [binding, setBinding] = useState(false);
  const [confirmUnbind, setConfirmUnbind] = useState<string | null>(null);
  const [unbinding, setUnbinding] = useState(false);

  const roleAccess = useMemo(() => groupByRole(grants), [grants]);

  // ── Fetchers ──
  const fetchGrants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listGrants({ page, module });
      setGrants(res.items);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, module]);

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const rows = await listUserGrants();
      setMembers(rows);
    } catch (err) {
      setMembersError(getApiErrorMessage(err));
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGrants();
    void fetchMembers();
  }, [fetchGrants, fetchMembers]);

  // ── Handlers ──
  const handleGrant = async () => {
    const role = newRole.trim().toUpperCase();
    if (!role) {
      toast.error('Enter a role name');
      return;
    }
    if (roleAccess.some((r) => r.role === role)) {
      toast.error(`${role} already has access`);
      return;
    }
    setGranting(true);
    try {
      await grantPage({ role, page, module });
      toast.success(`Granted ${role} access to this page`);
      setNewRole('');
      setShowGrantForm(false);
      await fetchGrants(); // refetch via /grants (fresh)
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (role: string) => {
    setRevoking(true);
    try {
      // Always scope to this page so we don't revoke the role's whole module.
      const res = await revokePage({ role, module, page });
      if (!res.revoked) {
        toast.error('Nothing was revoked');
      } else {
        toast.success(`Revoked ${role} access to this page`);
      }
      setConfirmRevoke(null);
      await fetchGrants();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setRevoking(false);
    }
  };

  const handleBind = async () => {
    const username = bindUsername.trim();
    const role = bindRole.trim().toUpperCase();
    if (!username || !role) {
      toast.error('Enter a username and a role');
      return;
    }
    setBinding(true);
    try {
      await bindUser({ username, role });
      toast.success(`Bound ${username} to ${role}`);
      setBindUsername('');
      setBindRole('');
      setShowBindForm(false);
      await fetchMembers();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setBinding(false);
    }
  };

  const handleUnbind = async (m: UserRoleBinding) => {
    setUnbinding(true);
    try {
      await unbindUser({ username: m.username, role: m.role });
      toast.success(`Unbound ${m.username} from ${m.role}`);
      setConfirmUnbind(null);
      await fetchMembers();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setUnbinding(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Manage access</h2>
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {objectLabel ? `${objectLabel} - ` : ''}
          Roles and members with access to this page.
        </p>
        {!canManage && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            <Lock className="h-3 w-3 shrink-0" />
            Read-only - {NO_WRITE_TIP}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {/* ── Roles with access ── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
              <Shield className="h-4 w-4 text-slate-400" />
              Roles with access
            </div>
            <div className="flex items-center gap-1">
              <Tooltip content={canManage ? 'Grant a role access' : NO_WRITE_TIP} placement="left">
                <span>
                  <Button
                    size="sm"
                    variant={showGrantForm ? 'solid' : 'outline'}
                    className={cn('h-7 gap-1 px-2 text-xs', showGrantForm && 'bg-blue-600 text-white hover:bg-blue-700')}
                    onClick={() => { setShowGrantForm((v) => !v); setNewRole(''); }}
                    disabled={!canManage}
                  >
                    {showGrantForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    Grant
                  </Button>
                </span>
              </Tooltip>
              <Tooltip content="Refresh" placement="left">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => void fetchGrants()}>
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* Grant form */}
          {showGrantForm && canManage && (
            <div className="mb-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800/50 dark:bg-blue-900/10">
              <Input
                size="sm"
                placeholder="Role name (e.g. ANALYST_ROLE)"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                disabled={granting}
                onKeyDown={(e) => { if (e.key === 'Enter' && newRole.trim()) void handleGrant(); }}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-7 gap-1 bg-blue-600 text-xs text-white hover:bg-blue-700"
                  onClick={() => void handleGrant()}
                  disabled={granting || !newRole.trim()}
                >
                  {granting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Grant access
                </Button>
              </div>
            </div>
          )}

          {/* Roles list */}
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading grants...
            </div>
          ) : error ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => void fetchGrants()}>
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : roleAccess.length === 0 ? (
            <div className="py-6 text-center">
              <Shield className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No role grants on this page yet.
              </p>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">—</p>
            </div>
          ) : (
            <div className="space-y-1">
              {roleAccess.map((r) =>
                confirmRevoke === r.role ? (
                  <div
                    key={r.role}
                    className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800/50 dark:bg-red-900/15"
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    <span className="flex-1 truncate text-sm text-red-700 dark:text-red-300">
                      Revoke <strong>{r.role}</strong>?
                    </span>
                    <Button
                      size="sm"
                      className="h-6 bg-red-600 px-2 text-xs text-white hover:bg-red-700"
                      onClick={() => void handleRevoke(r.role)}
                      disabled={revoking}
                    >
                      {revoking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                      Yes
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setConfirmRevoke(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div
                    key={r.role}
                    className="group flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-sm">
                      <Shield className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {r.role}
                      </span>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                        {r.tabs.length > 0 ? <span>{r.tabs.length} tab{r.tabs.length !== 1 ? 's' : ''}</span> : <span>page access</span>}
                        {relTime(r.grantedAt) && <span>granted {relTime(r.grantedAt)}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <Tooltip content={`Revoke ${r.role}`} placement="left">
                        <button
                          onClick={() => setConfirmRevoke(r.role)}
                          className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </section>

        {/* ── Members (user -> role bindings) ── */}
        <section className="border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
              <Users className="h-4 w-4 text-slate-400" />
              Members
            </div>
            <div className="flex items-center gap-1">
              <Tooltip content={canManage ? 'Bind a user to a role' : NO_WRITE_TIP} placement="left">
                <span>
                  <Button
                    size="sm"
                    variant={showBindForm ? 'solid' : 'outline'}
                    className={cn('h-7 gap-1 px-2 text-xs', showBindForm && 'bg-blue-600 text-white hover:bg-blue-700')}
                    onClick={() => { setShowBindForm((v) => !v); setBindUsername(''); setBindRole(''); }}
                    disabled={!canManage}
                  >
                    {showBindForm ? <X className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Bind
                  </Button>
                </span>
              </Tooltip>
              <Tooltip content="Refresh" placement="left">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => void fetchMembers()}>
                  <RefreshCw className={cn('h-3.5 w-3.5', membersLoading && 'animate-spin')} />
                </Button>
              </Tooltip>
            </div>
          </div>

          {showBindForm && canManage && (
            <div className="mb-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800/50 dark:bg-blue-900/10">
              <Input
                size="sm"
                placeholder="Username"
                value={bindUsername}
                onChange={(e) => setBindUsername(e.target.value)}
                disabled={binding}
              />
              <Input
                size="sm"
                placeholder="Role (e.g. ANALYST_ROLE)"
                value={bindRole}
                onChange={(e) => setBindRole(e.target.value)}
                disabled={binding}
                onKeyDown={(e) => { if (e.key === 'Enter' && bindUsername.trim() && bindRole.trim()) void handleBind(); }}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-7 gap-1 bg-blue-600 text-xs text-white hover:bg-blue-700"
                  onClick={() => void handleBind()}
                  disabled={binding || !bindUsername.trim() || !bindRole.trim()}
                >
                  {binding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Bind user
                </Button>
              </div>
            </div>
          )}

          {membersLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading members...
            </div>
          ) : membersError ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                <p className="text-sm text-red-700 dark:text-red-300">{membersError}</p>
              </div>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => void fetchMembers()}>
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : members.length === 0 ? (
            <div className="py-6 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400">No user-role bindings.</p>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">—</p>
            </div>
          ) : (
            <div className="space-y-1">
              {members.map((m) => {
                const key = `${m.username}:${m.role}`;
                return confirmUnbind === key ? (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800/50 dark:bg-red-900/15"
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    <span className="flex-1 truncate text-sm text-red-700 dark:text-red-300">
                      Unbind <strong>{m.username}</strong> from {m.role}?
                    </span>
                    <Button
                      size="sm"
                      className="h-6 bg-red-600 px-2 text-xs text-white hover:bg-red-700"
                      onClick={() => void handleUnbind(m)}
                      disabled={unbinding}
                    >
                      {unbinding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                      Yes
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setConfirmUnbind(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div
                    key={key}
                    className="group flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-gray-500 text-white shadow-sm">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {m.username}
                      </span>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                        <span>{m.role}</span>
                        {relTime(m.granted_at) && <span>{relTime(m.granted_at)}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <Tooltip content={`Unbind ${m.username}`} placement="left">
                        <button
                          onClick={() => setConfirmUnbind(key)}
                          className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AccessManagementPanel;
