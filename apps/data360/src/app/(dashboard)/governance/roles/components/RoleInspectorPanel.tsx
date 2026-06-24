'use client';

/**
 * RoleInspectorPanel — docked right-tab inspector for a single role.
 *
 * Replaces the modal/popup pattern for role object-grant transparency and role
 * hierarchy editing with the Data360 docked RightTabPanel. Three sections:
 *
 *   1. Object grants — SHOW GRANTS TO ROLE (read-only, honest empty/error).
 *   2. Role hierarchy — the access roles granted INTO this role, each with a
 *      governed Detach; plus an Attach form (grant another role into this one).
 *   3. Mint access role — reverse-provision a reusable access (technical) role
 *      from a set of object grants (from-objects).
 *
 * Direction invariant (see role_grants.ts): the inspected role R is always the
 * recipient (`to_role`); the other role is always the path param. Attach/detach
 * therefore move in the same direction as SHOW GRANTS TO ROLE R, so the
 * object-grants list reflects every mutation after a refetch.
 *
 * Writes are gated with useCanPerform('gouvernance', …); the backend 403 is the
 * real guard and is surfaced honestly via toast. Light theme, no reskin.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  ShieldCheck, GitBranch, Boxes, Loader2, RefreshCw, Plus, Trash2, Layers, AlertTriangle,
} from 'lucide-react';
import RightTabPanel, { type RightTabSection } from '@/app/shared/governance/right-tab-panel';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useCanPerform } from '@/hooks/useCanPerform';
import {
  getRoleObjectGrants,
  attachRole,
  detachRole,
  mintAccessRoleFromObjects,
  isRoleGrant,
  getApiErrorMessage,
  type RoleObjectGrant,
} from '@/app/services/governance/role_grants';

export interface RoleInspectorPanelProps {
  /** The role to inspect. When null the panel renders nothing. */
  role: string | null;
  onClose: () => void;
  /** Optional list of candidate roles (for the Attach picker datalist). */
  candidateRoles?: string[];
  /** Called after a successful attach/detach/mint so the host can refetch. */
  onMutated?: () => void;
}

type SectionId = 'grants' | 'hierarchy' | 'mint';

export default function RoleInspectorPanel({
  role,
  onClose,
  candidateRoles = [],
  onMutated,
}: RoleInspectorPanelProps) {
  const [section, setSection] = useState<SectionId>('grants');

  // ── object-grants fetch state (honest loading / empty / error) ──
  const [grants, setGrants] = useState<RoleObjectGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!role) return;
    setLoading(true);
    setLoadError(null);
    try {
      setGrants(await getRoleObjectGrants(role));
    } catch (e) {
      setLoadError(getApiErrorMessage(e));
      setGrants([]);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    if (role) load();
  }, [role, load]);

  // role-to-role grants (the hierarchy view) vs object grants
  const roleGrants = useMemo(() => grants.filter(isRoleGrant), [grants]);
  const objectGrants = useMemo(() => grants.filter((g) => !isRoleGrant(g)), [grants]);

  // ── permissions ──
  const { allowed: canGrant } = useCanPerform('gouvernance', 'grant');
  const { allowed: canRevoke } = useCanPerform('gouvernance', 'revoke');
  const { allowed: canCreate } = useCanPerform('gouvernance', 'create');

  // ── attach state ──
  const [attachName, setAttachName] = useState('');
  const [attaching, setAttaching] = useState(false);

  const handleAttach = useCallback(async () => {
    const a = attachName.trim();
    if (!role || !a) return;
    setAttaching(true);
    try {
      // attach access role `a` INTO functional role `role` (role is recipient)
      await attachRole(a, role);
      toast.success(`Granted ${a} to ${role}`);
      setAttachName('');
      await load();
      onMutated?.();
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setAttaching(false);
    }
  }, [attachName, role, load, onMutated]);

  // ── detach state (confirm) ──
  const [detachTarget, setDetachTarget] = useState<string | null>(null);
  const [detaching, setDetaching] = useState(false);

  const handleDetach = useCallback(async () => {
    if (!role || !detachTarget) return;
    setDetaching(true);
    try {
      await detachRole(detachTarget, role);
      toast.success(`Revoked ${detachTarget} from ${role}`);
      setDetachTarget(null);
      await load();
      onMutated?.();
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setDetaching(false);
    }
  }, [role, detachTarget, load, onMutated]);

  // ── mint-from-objects state ──
  const [mintName, setMintName] = useState('');
  const [mintDb, setMintDb] = useState('');
  const [mintSchema, setMintSchema] = useState('');
  const [mintTable, setMintTable] = useState('');
  const [mintPrivs, setMintPrivs] = useState('SELECT');
  const [minting, setMinting] = useState(false);

  const mintReady = mintDb.trim() && mintSchema.trim() && mintTable.trim() && mintPrivs.trim();

  const handleMint = useCallback(async () => {
    if (!mintReady) return;
    const privileges = mintPrivs
      .split(',')
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean);
    setMinting(true);
    try {
      const res = await mintAccessRoleFromObjects({
        role_name: mintName.trim() || undefined,
        grants: [
          {
            database: mintDb.trim(),
            schema: mintSchema.trim(),
            table: mintTable.trim(),
            privileges,
          },
        ],
      });
      toast.success(
        res.role_name ? `Minted access role ${res.role_name}` : 'Access role minted',
      );
      setMintName('');
      setMintDb('');
      setMintSchema('');
      setMintTable('');
      setMintPrivs('SELECT');
      onMutated?.();
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setMinting(false);
    }
  }, [mintReady, mintName, mintDb, mintSchema, mintTable, mintPrivs, onMutated]);

  if (!role) return null;

  // ── shared honest-state primitives ──
  const StateBlock = ({ children }: { children: React.ReactNode }) => (
    <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">{children}</div>
  );

  const grantsBody = () => {
    if (loading) {
      return (
        <StateBlock>
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
          Loading grants…
        </StateBlock>
      );
    }
    if (loadError) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Could not load grants
          </div>
          {loadError}
          <button onClick={load} className="mt-2 block text-red-700 underline dark:text-red-300">
            Retry
          </button>
        </div>
      );
    }
    if (objectGrants.length === 0) {
      return <StateBlock>No object grants on this role.</StateBlock>;
    }
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-2.5 py-1.5 font-medium">Privilege</th>
              <th className="px-2.5 py-1.5 font-medium">On</th>
              <th className="px-2.5 py-1.5 font-medium">Object</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {objectGrants.map((g, i) => (
              <tr key={`${g.name ?? 'obj'}-${g.privilege ?? ''}-${i}`}>
                <td className="px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200">
                  {g.privilege ?? '—'}
                </td>
                <td className="px-2.5 py-1.5 text-slate-500 dark:text-slate-400">
                  {g.granted_on ?? '—'}
                </td>
                <td className="px-2.5 py-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {g.name ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const hierarchyBody = () => (
    <div className="space-y-4">
      {/* attach */}
      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <p className="mb-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          Grant a role into <span className="font-mono">{role}</span>
        </p>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              size="sm"
              placeholder="ACCESS_ROLE_NAME"
              value={attachName}
              onChange={(e) => setAttachName(e.target.value.toUpperCase())}
              list="role-inspector-candidates"
              disabled={!canGrant || attaching}
            />
            <datalist id="role-inspector-candidates">
              {candidateRoles
                .filter((r) => r !== role)
                .map((r) => (
                  <option key={r} value={r} />
                ))}
            </datalist>
          </div>
          <Button
            size="sm"
            onClick={handleAttach}
            isLoading={attaching}
            disabled={!canGrant || !attachName.trim()}
            className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-3.5 w-3.5" /> Attach
          </Button>
        </div>
        {!canGrant && (
          <p className="mt-1.5 text-[10px] text-slate-400">
            You do not have permission to grant roles.
          </p>
        )}
      </div>

      {/* current role-to-role grants */}
      <div>
        <p className="mb-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          Roles granted into this role
        </p>
        {loading ? (
          <StateBlock>
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          </StateBlock>
        ) : roleGrants.length === 0 ? (
          <StateBlock>No roles are granted into this role.</StateBlock>
        ) : (
          <ul className="space-y-1.5">
            {roleGrants.map((g, i) => (
              <li
                key={`${g.name ?? 'role'}-${i}`}
                className="flex items-center justify-between rounded-md border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-800"
              >
                <span className="flex items-center gap-1.5 font-mono text-slate-700 dark:text-slate-200">
                  <Layers className="h-3.5 w-3.5 text-slate-400" />
                  {g.name ?? '—'}
                </span>
                <button
                  type="button"
                  onClick={() => g.name && setDetachTarget(g.name)}
                  disabled={!canRevoke || !g.name}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/40"
                  title={canRevoke ? 'Detach this role' : 'No permission to revoke'}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Detach
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const mintBody = () => (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Mint a reusable access (technical) role carrying object grants. Leave the name
        blank to auto-derive AR_&lt;DB&gt;_&lt;SCHEMA&gt;.
      </p>
      <Input
        size="sm"
        label="Access role name (optional)"
        placeholder="AR_SALES_PUBLIC"
        value={mintName}
        onChange={(e) => setMintName(e.target.value.toUpperCase())}
        disabled={!canCreate || minting}
      />
      <div className="grid grid-cols-3 gap-2">
        <Input
          size="sm"
          label="Database"
          placeholder="DB"
          value={mintDb}
          onChange={(e) => setMintDb(e.target.value.toUpperCase())}
          disabled={!canCreate || minting}
        />
        <Input
          size="sm"
          label="Schema"
          placeholder="SCHEMA"
          value={mintSchema}
          onChange={(e) => setMintSchema(e.target.value.toUpperCase())}
          disabled={!canCreate || minting}
        />
        <Input
          size="sm"
          label="Table"
          placeholder="TABLE"
          value={mintTable}
          onChange={(e) => setMintTable(e.target.value.toUpperCase())}
          disabled={!canCreate || minting}
        />
      </div>
      <Input
        size="sm"
        label="Privileges (comma-separated)"
        placeholder="SELECT, INSERT"
        value={mintPrivs}
        onChange={(e) => setMintPrivs(e.target.value)}
        disabled={!canCreate || minting}
      />
      <Button
        size="sm"
        onClick={handleMint}
        isLoading={minting}
        disabled={!canCreate || !mintReady}
        className="w-full gap-1 bg-violet-600 text-white hover:bg-violet-700"
      >
        <Boxes className="h-3.5 w-3.5" /> Mint access role
      </Button>
      {!canCreate && (
        <p className="text-[10px] text-slate-400">
          You do not have permission to create roles.
        </p>
      )}
    </div>
  );

  const sections: RightTabSection[] = [
    {
      id: 'grants',
      icon: ShieldCheck,
      label: 'Object grants',
      description: 'Every object privilege this role carries (SHOW GRANTS TO ROLE).',
      render: grantsBody,
    },
    {
      id: 'hierarchy',
      icon: GitBranch,
      label: 'Role hierarchy',
      description: 'Roles granted into this role — attach or detach access roles.',
      render: hierarchyBody,
    },
    {
      id: 'mint',
      icon: Boxes,
      label: 'Mint access role',
      description: 'Reverse-provision a reusable access role from object grants.',
      render: mintBody,
    },
  ];

  return (
    <>
      <RightTabPanel
        title={role}
        subtitle="Role inspector"
        sections={sections}
        activeSection={section}
        onSectionChange={(id) => setSection(id as SectionId)}
        onClose={onClose}
        storageKey="data360.gov.roleInspector.section.v1"
        accentClassName="bg-emerald-500"
        statusPill={{
          label: loadError ? 'error' : loading ? 'loading' : `${grants.length} grants`,
          tone: loadError ? 'error' : 'ok',
        }}
        footer={
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Refresh
          </Button>
        }
      />
      <ConfirmDialog
        open={!!detachTarget}
        title="Detach role"
        message={`Revoke ${detachTarget ?? ''} from ${role}? Users of ${role} will lose any privileges inherited through it.`}
        confirmLabel={detaching ? 'Detaching…' : 'Detach'}
        destructive
        onConfirm={handleDetach}
        onCancel={() => (detaching ? undefined : setDetachTarget(null))}
      />
    </>
  );
}
