'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'rizzui';
import {
  Shield, Lock, Eye, Tag, Database, Users, RefreshCw,
  AlertTriangle, Info, ArrowRight, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useEventStore } from '../stores/event-store';
import {
  getTablePolicies,
  getPolicyGrantedRolesMap,
  type TablePoliciesResponse,
  type PolicyGrantedRolesMap,
} from '@/app/services/governance/policies';
import {
  getSecurityMatrix,
  type SecurityMatrixResponse,
} from '@/app/services/governance/security_matrix';
import {
  getTableGovernance,
  type TableGovernance,
} from '@/app/services/catalog/rightbar';

// ---------------------------------------------------------------------------
// Types — kept minimal & local (mirrors ContextRightBar's TableItem/ColumnInfo)
// ---------------------------------------------------------------------------

interface TableItem {
  id: string;
  database: string;
  schema: string;
  table: string;
  status?: string;
}

interface ColumnInfo {
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
  isSensitive?: boolean;
}

export interface GovernanceAccessPanelProps {
  table: TableItem | null;
  columns: ColumnInfo[];
  projectId: string | null;
  /**
   * Deep-link to the WRITE path. The dedupe contract keeps all apply/edit logic
   * in the Actions tab's Governance group (PoliciesCard/PolicyAssignmentPanel) —
   * this panel is read-only status, so its only CTA routes there.
   */
  onApplyPolicy?: () => void;
}

// ---------------------------------------------------------------------------
// Net session-queued policies (event spine) — mirrors ModelingCanvas logic.
// ---------------------------------------------------------------------------

interface QueuedPolicies {
  maskingByColumn: Map<string, string>; // column → policyName
  rls: string[];
  tags: string[];
  aggregation: string[];
}

function useQueuedPolicies(fqnKey: string | null, projectId: string | null): QueuedPolicies {
  const { events } = useEventStore(projectId);
  return useMemo<QueuedPolicies>(() => {
    const maskingByColumn = new Map<string, string>();
    const rls = new Set<string>();
    const tags = new Set<string>();
    const aggregation = new Set<string>();
    if (!fqnKey) return { maskingByColumn, rls: [], tags: [], aggregation: [] };

    events.forEach((e) => {
      const t = e.target;
      if (!t?.database || !t?.schema || !t?.table) return;
      if (`${t.database}.${t.schema}.${t.table}` !== fqnKey) return;
      switch (e.type) {
        case 'MASKING_POLICY_APPLIED': {
          // `payload.columns` is the GUARANTEED carrier (event-store.ts
          // isSignificantEvent rejects masking events lacking it); `target.column`
          // is optional/coincidental. Read payload.columns first, fall back to it.
          const cols: string[] = Array.isArray(e.payload?.columns) && e.payload.columns.length
            ? (e.payload.columns as string[]) : (t.column ? [t.column] : []);
          const name = e.payload?.policyName;
          if (name) cols.forEach((c) => maskingByColumn.set(c, name));
          break;
        }
        case 'MASKING_POLICY_REMOVED': {
          const cols: string[] = Array.isArray(e.payload?.columns) && e.payload.columns.length
            ? (e.payload.columns as string[]) : (t.column ? [t.column] : []);
          cols.forEach((c) => maskingByColumn.delete(c));
          break;
        }
        case 'RLS_POLICY_APPLIED': {
          const n = e.payload?.policyName;
          if (n) rls.add(n);
          break;
        }
        case 'RLS_POLICY_REMOVED': {
          const n = e.payload?.policyName;
          if (n) rls.delete(n);
          break;
        }
        case 'AGGREGATION_POLICY_APPLIED': {
          const n = e.payload?.policyName;
          if (n) aggregation.add(n);
          break;
        }
        case 'AGGREGATION_POLICY_REMOVED': {
          const n = e.payload?.policyName;
          if (n) aggregation.delete(n);
          break;
        }
        case 'TAG_APPLIED': {
          const n: string | undefined = e.payload?.tagName ?? e.payload?.tag;
          // SENSITIVE:-prefixed tags are the sensitive-column marker, not a real tag.
          if (n && !String(n).startsWith('SENSITIVE:')) tags.add(n);
          break;
        }
        case 'TAG_REMOVED': {
          const n: string | undefined = e.payload?.tagName ?? e.payload?.tag;
          if (n && !String(n).startsWith('SENSITIVE:')) tags.delete(n);
          break;
        }
      }
    });

    return {
      maskingByColumn,
      rls: Array.from(rls),
      tags: Array.from(tags),
      aggregation: Array.from(aggregation),
    };
  }, [events, fqnKey]);
}

// ---------------------------------------------------------------------------
// Async-block primitives (loading skeleton / honest empty / error+retry)
// ---------------------------------------------------------------------------

type AsyncState = 'loading' | 'ready' | 'error';

function SkeletonRows({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-1.5" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-6 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ))}
    </div>
  );
}

function BlockError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2.5">
        <p className="text-[11px] text-red-700 dark:text-red-300">Couldn’t load this section.</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5 h-7 text-[11px]">
        <RefreshCw className="h-3 w-3" />
        Retry
      </Button>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-slate-400 dark:text-slate-500">{children}</p>;
}

function SectionCard({
  icon: Icon, title, subtitle, children,
}: {
  icon: React.ElementType; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 space-y-2.5">
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">{title}</h4>
          {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function PolicyRow({
  icon: Icon, name, detail, roles, tone = 'slate',
}: {
  icon: React.ElementType;
  name: string;
  detail?: string;
  roles?: string[] | null;
  tone?: 'slate' | 'queued' | 'live';
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5">
      <div className="flex items-start gap-1.5 min-w-0">
        <Icon className="h-3 w-3 text-slate-400 mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate" title={name}>{name}</p>
          {detail && <p className="text-[10px] text-slate-400 truncate">{detail}</p>}
          {roles !== undefined && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              roles:{' '}
              {roles && roles.length > 0
                ? <span className="text-slate-700 dark:text-slate-300">{roles.join(', ')}</span>
                : <span className="text-slate-400">—</span>}
            </p>
          )}
        </div>
      </div>
      {tone !== 'slate' && (
        <span
          className={cn(
            'flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold',
            tone === 'queued'
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
          )}
        >
          {tone === 'queued' ? 'Queued' : 'Live'}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function GovernanceAccessPanel({
  table, columns, projectId, onApplyPolicy,
}: GovernanceAccessPanelProps) {
  const fqnKey = table ? `${table.database}.${table.schema}.${table.table}` : null;
  const queued = useQueuedPolicies(fqnKey, projectId);

  // Read-only panel; the one CTA (deep-link to the Actions Governance group) is
  // gated. Fail-open while the allow-set resolves (allowed || loading).
  const canApply = useCanPerform('explore_design', 'create', projectId);
  const showApplyCta = canApply.allowed || canApply.loading;

  // --- Table-INDEPENDENT: granted-roles map (1 GET) + security matrix. Loaded
  //     once per mount; re-pulled only on explicit retry. ---
  const [roleMap, setRoleMap] = useState<PolicyGrantedRolesMap | null>(null);
  const [roleMapState, setRoleMapState] = useState<AsyncState>('loading');

  const loadRoleMap = useCallback(() => {
    setRoleMapState('loading');
    getPolicyGrantedRolesMap()
      .then((m) => { setRoleMap(m); setRoleMapState('ready'); })
      .catch(() => { setRoleMap(null); setRoleMapState('error'); });
  }, []);

  const [matrix, setMatrix] = useState<SecurityMatrixResponse | null>(null);
  const [matrixState, setMatrixState] = useState<AsyncState>('loading');

  const loadMatrix = useCallback(() => {
    setMatrixState('loading');
    getSecurityMatrix()
      .then((m) => { setMatrix(m); setMatrixState('ready'); })
      .catch(() => { setMatrix(null); setMatrixState('error'); });
  }, []);

  useEffect(() => { loadRoleMap(); }, [loadRoleMap]);
  useEffect(() => { loadMatrix(); }, [loadMatrix]);

  // --- Table-DEPENDENT: live policies on the object (+ optional enrich). Re-pulled
  //     on FQN change. For a from-scratch (not-yet-deployed) table this is empty. ---
  const [tablePolicies, setTablePolicies] = useState<TablePoliciesResponse | null>(null);
  const [tpState, setTpState] = useState<AsyncState>('loading');
  const [governance, setGovernance] = useState<TableGovernance | null>(null);

  const loadLive = useCallback(() => {
    if (!table) return;
    const { database, schema, table: t } = table;
    setTpState('loading');
    setGovernance(null);
    getTablePolicies(database, schema, t)
      .then(async (tp) => {
        setTablePolicies(tp);
        setTpState('ready');
        // Enrich ONLY when the object is actually deployed/governed — avoids a
        // guaranteed 404 on the catalog endpoint for a from-scratch table.
        if (tp?.has_governance) {
          const gov = await getTableGovernance(database, schema, t).catch(() => null);
          setGovernance(gov);
        }
      })
      .catch(() => { setTablePolicies(null); setTpState('error'); });
  }, [table]);

  useEffect(() => { loadLive(); }, [loadLive]);

  // Roles affected — distinct queued + live policy names (computed before any early
  // return so hook order stays stable). Tags carry no granted_roles → excluded.
  const allAffectedNames = useMemo(() => {
    const s = new Set<string>();
    queued.maskingByColumn.forEach((name) => s.add(name));
    queued.rls.forEach((n) => s.add(n));
    queued.aggregation.forEach((n) => s.add(n));
    if (tablePolicies) {
      tablePolicies.policies.masking.forEach((p) => p.policy_name && s.add(p.policy_name));
      tablePolicies.policies.row_access.forEach((p) => p.policy_name && s.add(p.policy_name));
      tablePolicies.policies.aggregation.forEach((p) => p.policy_name && s.add(p.policy_name));
    }
    return Array.from(s);
  }, [queued, tablePolicies]);

  if (!table) return null;

  const sensitiveColumns = columns.filter((c) => c.isSensitive);
  const hasQueued =
    queued.maskingByColumn.size > 0 || queued.rls.length > 0 ||
    queued.tags.length > 0 || queued.aggregation.length > 0;

  const liveTotal = tablePolicies?.total_policies ?? 0;
  const isDeployed = !!tablePolicies?.has_governance && liveTotal > 0;

  // For each queued/live policy, look up granted_roles in the single-call map.
  const rolesByName = roleMap?.byName ?? {};

  return (
    <div className="p-4 space-y-3">
      {/* ── 1. Data policies queued this session (event spine) ── */}
      <SectionCard
        icon={Shield}
        title="Data policies"
        subtitle="Queued this session — applies on deploy"
      >
        {!hasQueued ? (
          <EmptyLine>No policies queued for this table yet.</EmptyLine>
        ) : (
          <div className="space-y-1.5">
            {Array.from(queued.maskingByColumn.entries()).map(([col, name]) => (
              <PolicyRow key={`m-${col}`} icon={Lock} name={name} detail={`Masking · ${col}`} tone="queued" />
            ))}
            {queued.rls.map((name) => (
              <PolicyRow key={`r-${name}`} icon={Eye} name={name} detail="Row-level security" tone="queued" />
            ))}
            {queued.aggregation.map((name) => (
              <PolicyRow key={`a-${name}`} icon={Database} name={name} detail="Aggregation" tone="queued" />
            ))}
            {queued.tags.map((name) => (
              <PolicyRow key={`t-${name}`} icon={Tag} name={name} detail="Tag" tone="queued" />
            ))}
          </div>
        )}
        {sensitiveColumns.length > 0 && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {sensitiveColumns.length} sensitive column{sensitiveColumns.length > 1 ? 's' : ''} flagged — consider masking
          </p>
        )}
      </SectionCard>

      {/* ── 2. Live policies on the object ── */}
      <SectionCard icon={CheckCircle2} title="Live policies on object" subtitle="What is applied on the deployed object">
        {tpState === 'loading' ? (
          <SkeletonRows rows={2} />
        ) : tpState === 'error' ? (
          <BlockError onRetry={loadLive} />
        ) : !isDeployed ? (
          <EmptyLine>Not deployed yet — no live policies.</EmptyLine>
        ) : (
          <div className="space-y-1.5">
            {governance?.gov_rate != null && (
              <p className="text-[10px] text-slate-500">
                Governance coverage: <span className="font-semibold text-slate-700 dark:text-slate-300">{Math.round(governance.gov_rate)}%</span>
              </p>
            )}
            {tablePolicies?.policies.masking.map((p, i) => (
              <PolicyRow key={`lm-${i}`} icon={Lock} name={p.policy_name} detail={p.column ? `Masking · ${p.column}` : 'Masking'} tone="live" />
            ))}
            {tablePolicies?.policies.row_access.map((p, i) => (
              <PolicyRow key={`lr-${i}`} icon={Eye} name={p.policy_name} detail="Row-level security" tone="live" />
            ))}
            {tablePolicies?.policies.aggregation.map((p, i) => (
              <PolicyRow key={`la-${i}`} icon={Database} name={p.policy_name} detail="Aggregation" tone="live" />
            ))}
            {tablePolicies?.policies.tags.map((p, i) => (
              <PolicyRow key={`lt-${i}`} icon={Tag} name={p.policy_name} detail="Tag" tone="live" />
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── 3. Roles affected by these policies (the showable RBAC) ── */}
      <SectionCard icon={Users} title="Roles affected by these policies" subtitle="Roles each policy grants — “—” when none">
        {roleMapState === 'loading' ? (
          <SkeletonRows rows={2} />
        ) : roleMapState === 'error' ? (
          <BlockError onRetry={loadRoleMap} />
        ) : allAffectedNames.length === 0 ? (
          <EmptyLine>No policies to evaluate yet.</EmptyLine>
        ) : (
          <div className="space-y-1.5">
            {allAffectedNames.map((name) => (
              <PolicyRow key={`af-${name}`} icon={Shield} name={name} roles={rolesByName[name] ?? []} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── 4. Object access (RBAC) — org access model + honest object-grant note ── */}
      <SectionCard icon={Database} title="Object access (RBAC)" subtitle="Org access model — object SELECT grants are created at deploy">
        {matrixState === 'loading' ? (
          <SkeletonRows rows={3} />
        ) : matrixState === 'error' ? (
          <BlockError onRetry={loadMatrix} />
        ) : !matrix || matrix.entries.length === 0 ? (
          <EmptyLine>No org access model configured.</EmptyLine>
        ) : (
          <div className="space-y-1.5">
            {matrix.entries.slice(0, 8).map((row) => {
              const segments = [row.region_id, row.store_id, row.department_id, row.product_category, row.customer_segment]
                .filter(Boolean) as string[];
              return (
                <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate" title={row.role_name}>{row.role_name}</p>
                    {segments.length > 0 && (
                      <p className="text-[10px] text-slate-400 truncate">{segments.join(' · ')}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    {row.access_level}
                  </span>
                </div>
              );
            })}
            {matrix.entries.length > 8 && (
              <p className="text-[10px] text-slate-400">+{matrix.entries.length - 8} more roles in the access model</p>
            )}
          </div>
        )}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 flex items-start gap-1.5">
          <Info className="h-3 w-3 text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            Object SELECT grants: <span className="text-slate-400">—, created at deploy</span> (inherits schema role defaults).
          </p>
        </div>
      </SectionCard>

      {/* ── Read-only CTA → routes to the Actions tab Governance group ── */}
      {showApplyCta && onApplyPolicy && (
        <button
          onClick={onApplyPolicy}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 px-3 py-2 text-[11px] font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
        >
          Apply / edit policy
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
