'use client';

/**
 * SecurityMap — interactive React Flow visualisation of APPLIED security across
 * the account: users → roles → objects, plus a governance band of real policies
 * (masking / row-access / network).
 *
 * HONEST DATA — every edge is sourced from an API relationship that actually
 * exists; nothing is fabricated:
 *   • users → roles  ── GET /command-center/security-audit  (access_grants, by name)
 *   • roles → objects ── GET /command-center/object-enrichment (roles accessing, by name)
 *   • policies        ── GET /command-center/security-audit  (policy_coverage counts
 *                        + network_policies by name)
 *   • roles (+counts) ── GET /command-center/role-hierarchy (SHOW ROLES, user_count)
 *
 * The API exposes policy COUNTS/NAMES but never which policy sits on which object,
 * so we deliberately DO NOT draw per-object→policy edges. Masking/row-access are
 * shown via a single aggregate "Governed tables" node; network policies gate login
 * and live in their own left-hand cluster (not downstream of objects).
 *
 * Resilient: the three sources are fetched independently — a failed/slow source
 * degrades only its layer. All three empty → a clearly-labelled SAMPLE graph so
 * the view is never blank. Top-N capping per column keeps the graph legible.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import {
  getObjectEnrichment,
  getRoleHierarchy,
  type ObjectEnrichmentRow,
} from '@/app/services/command-center';

// ── Caps (keep the graph legible against 243 objects / 100 grants) ────────────
const CAP_USERS = 12;
const CAP_ROLES = 14;
const CAP_OBJECTS = 18;
const CAP_NETWORK = 6;

// ── Node kind palette ─────────────────────────────────────────────────────────
type Kind =
  | 'user'
  | 'user-nomfa'
  | 'role'
  | 'object'
  | 'masking'
  | 'rls'
  | 'network'
  | 'coverage'
  | 'header'
  | 'sample';

const KIND_STYLE: Record<Kind, React.CSSProperties> = {
  user: { background: '#eff6ff', border: '1px solid #3b82f6', color: '#1e3a8a' },
  'user-nomfa': { background: '#fff7ed', border: '1px solid #f59e0b', color: '#9a3412' },
  role: { background: '#eef2ff', border: '2px solid #6366f1', color: '#3730a3', fontWeight: 600 },
  object: { background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46' },
  masking: { background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e' },
  rls: { background: '#fff1f2', border: '1px solid #f43f5e', color: '#9f1239' },
  network: { background: '#ecfeff', border: '1px solid #06b6d4', color: '#155e75' },
  coverage: { background: '#f8fafc', border: '1px dashed #94a3b8', color: '#334155' },
  header: { background: 'transparent', border: 'none', color: '#64748b', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' },
  sample: { background: '#f1f5f9', border: '1px dashed #cbd5e1', color: '#475569' },
};

const MINIMAP_COLOR: Record<string, string> = {
  user: '#3b82f6',
  'user-nomfa': '#f59e0b',
  role: '#6366f1',
  object: '#10b981',
  masking: '#f59e0b',
  rls: '#f43f5e',
  network: '#06b6d4',
  coverage: '#94a3b8',
  header: '#e2e8f0',
  sample: '#cbd5e1',
};

const base: React.CSSProperties = { borderRadius: 8, padding: '6px 9px', fontSize: 11, width: 184, lineHeight: 1.25 };

// ── Column geometry ───────────────────────────────────────────────────────────
const COL = { network: -360, users: 0, roles: 320, objects: 660, coverage: 1000, policies: 1300 } as const;
const ROW_GAP = 64;
const TOP = 24;

// ── Local response shapes (FE SecurityAuditResponse omits network_policies /
//    users_without_mfa, so we call security-audit via apiClient + a local type) ─
interface SecAuditGrant { user?: string; role?: string }
interface SecAuditPolicyCoverage {
  masking_policies?: number;
  rls_policies?: number;
  total_tables?: number;
  tables_with_policies?: number;
  coverage_pct?: number;
}
interface SecAuditNetworkPolicy {
  name?: string;
  entries_in_allowlist?: number;
  entries_in_blocklist?: number;
}
interface SecAuditResponse {
  access_grants?: SecAuditGrant[];
  policy_coverage?: SecAuditPolicyCoverage;
  network_policies?: SecAuditNetworkPolicy[];
  users_without_mfa?: { user?: string }[];
}

interface RoleHierarchyRow {
  role_name?: string;
  user_count?: number | null;
}

type SourceState = 'ok' | 'empty' | 'error';

interface BuiltGraph {
  nodes: Node[];
  edges: Edge[];
  caps: { users: [number, number]; roles: [number, number]; objects: [number, number] };
  grantsTruncated: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mkNode(id: string, kind: Kind, x: number, y: number, label: ReactNode, width = 184): Node {
  return {
    id,
    position: { x, y },
    data: { label, kind },
    style: { ...base, width, ...KIND_STYLE[kind] },
    draggable: kind !== 'header',
    selectable: kind !== 'header',
  };
}

function nodeLabel(title: string, sub?: string): ReactNode {
  return (
    <div>
      <div className="truncate font-medium" title={title}>{title}</div>
      {sub ? <div className="truncate text-[9px] opacity-70">{sub}</div> : null}
    </div>
  );
}

function colHeader(id: string, x: number, text: string): Node {
  return mkNode(id, 'header', x, -36, text, 184);
}

// ── Live graph builder ────────────────────────────────────────────────────────
function buildLiveGraph(
  roleRows: RoleHierarchyRow[],
  objects: ObjectEnrichmentRow[],
  sec: SecAuditResponse | null,
): BuiltGraph {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeIds = new Set<string>();

  const addEdge = (id: string, source: string, target: string, color: string, dashed = false, animated = false) => {
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({
      id,
      source,
      target,
      animated,
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: { stroke: color, strokeWidth: 1.25, strokeDasharray: dashed ? '4 3' : undefined },
    });
  };

  const grants = (sec?.access_grants ?? []).filter((g) => g.user && g.role);
  const grantsTruncated = grants.length >= 100; // backend LIMIT 100, most-recent sample
  const noMfa = new Set((sec?.users_without_mfa ?? []).map((u) => (u.user ?? '').toUpperCase()).filter(Boolean));

  // ---- Roles: union of grant-roles, enrichment-roles, role-hierarchy ----------
  const roleUserCount = new Map<string, number>();
  roleRows.forEach((r) => {
    if (r.role_name) roleUserCount.set(r.role_name.toUpperCase(), Number(r.user_count) || 0);
  });
  const roleAccessHits = new Map<string, number>(); // how many rendered objects a role touches
  const roleGrantHits = new Map<string, number>();

  // ---- Users: rank by #grants ------------------------------------------------
  const userGrantCount = new Map<string, number>();
  grants.forEach((g) => {
    const u = (g.user as string).toUpperCase();
    userGrantCount.set(u, (userGrantCount.get(u) ?? 0) + 1);
    const r = (g.role as string).toUpperCase();
    roleGrantHits.set(r, (roleGrantHits.get(r) ?? 0) + 1);
  });
  const totalUsers = userGrantCount.size;
  const topUsers = [...userGrantCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, CAP_USERS);
  const userSet = new Set(topUsers.map(([u]) => u));

  // ---- Objects: rank by access_count -----------------------------------------
  const objWithAccess = objects.filter((o) => o.table_name);
  const totalObjects = objWithAccess.length;
  const topObjects = [...objWithAccess]
    .sort((a, b) => (Number(b.access_count) || 0) - (Number(a.access_count) || 0))
    .slice(0, CAP_OBJECTS);

  // Tally role→object access for the rendered objects so we can rank roles.
  topObjects.forEach((o) => {
    (o.roles ?? []).forEach((rn) => {
      if (!rn) return;
      const r = rn.toUpperCase();
      roleAccessHits.set(r, (roleAccessHits.get(r) ?? 0) + 1);
    });
  });

  // Candidate roles = anything we've seen anywhere; rank: access + grant signal,
  // then declared user_count.
  const roleCandidates = new Set<string>([
    ...roleAccessHits.keys(),
    ...roleGrantHits.keys(),
    ...roleUserCount.keys(),
  ]);
  const totalRoles = roleCandidates.size;
  const topRoles = [...roleCandidates]
    .sort((a, b) => {
      const sa = (roleAccessHits.get(a) ?? 0) * 2 + (roleGrantHits.get(a) ?? 0) + (roleUserCount.get(a) ?? 0) * 0.01;
      const sb = (roleAccessHits.get(b) ?? 0) * 2 + (roleGrantHits.get(b) ?? 0) + (roleUserCount.get(b) ?? 0) * 0.01;
      return sb - sa;
    })
    .slice(0, CAP_ROLES);
  const roleSet = new Set(topRoles);

  // ---- Emit nodes ------------------------------------------------------------
  if (userSet.size) nodes.push(colHeader('h-users', COL.users, 'Users'));
  topUsers.forEach(([u, n], i) => {
    const kind: Kind = noMfa.has(u) ? 'user-nomfa' : 'user';
    nodes.push(mkNode(`u:${u}`, kind, COL.users, TOP + i * ROW_GAP, nodeLabel(u, noMfa.has(u) ? `${n} grant${n === 1 ? '' : 's'} · no MFA` : `${n} grant${n === 1 ? '' : 's'}`)));
  });

  if (roleSet.size) nodes.push(colHeader('h-roles', COL.roles, 'Roles'));
  topRoles.forEach((r, i) => {
    const uc = roleUserCount.get(r);
    const sub = uc != null ? `${uc} user${uc === 1 ? '' : 's'}` : 'role';
    nodes.push(mkNode(`r:${r}`, 'role', COL.roles, TOP + i * ROW_GAP, nodeLabel(r, sub)));
  });

  if (topObjects.length) nodes.push(colHeader('h-objects', COL.objects, 'Objects'));
  topObjects.forEach((o, i) => {
    const fqn = `${o.database_name}.${o.schema_name}.${o.table_name}`;
    const ac = Number(o.access_count) || 0;
    nodes.push(
      mkNode(
        `o:${fqn}`,
        'object',
        COL.objects,
        TOP + i * ROW_GAP,
        nodeLabel(o.table_name, `${o.schema_name} · ${ac.toLocaleString()} access`),
      ),
    );
  });

  // ---- Edges: user → role (grants) -------------------------------------------
  grants.forEach((g) => {
    const u = (g.user as string).toUpperCase();
    const r = (g.role as string).toUpperCase();
    if (!userSet.has(u) || !roleSet.has(r)) return;
    addEdge(`g:${u}->${r}`, `u:${u}`, `r:${r}`, '#3b82f6');
  });

  // ---- Edges: role → object (enrichment) -------------------------------------
  topObjects.forEach((o) => {
    const fqn = `${o.database_name}.${o.schema_name}.${o.table_name}`;
    (o.roles ?? []).forEach((rn) => {
      if (!rn) return;
      const r = rn.toUpperCase();
      if (!roleSet.has(r)) return;
      addEdge(`a:${r}->${fqn}`, `r:${r}`, `o:${fqn}`, '#6366f1');
    });
  });

  // ---- Governance band: aggregate policy nodes (NO fabricated per-object edges)
  const pc = sec?.policy_coverage;
  const masking = Number(pc?.masking_policies) || 0;
  const rls = Number(pc?.rls_policies) || 0;
  const withPol = Number(pc?.tables_with_policies) || 0;
  const totalT = Number(pc?.total_tables) || 0;
  const covPct = pc?.coverage_pct != null ? pc.coverage_pct : (totalT ? Math.round((withPol / totalT) * 1000) / 10 : null);

  const hasPolicyData = pc != null && (masking > 0 || rls > 0 || totalT > 0);
  if (hasPolicyData) {
    nodes.push(colHeader('h-gov', COL.coverage, 'Governed data'));
    nodes.push(
      mkNode(
        'cov:tables',
        'coverage',
        COL.coverage,
        TOP,
        nodeLabel(
          'Governed tables',
          covPct != null ? `${withPol.toLocaleString()}/${totalT.toLocaleString()} · ${covPct}%` : `${withPol.toLocaleString()} tables`,
        ),
        176,
      ),
    );
    if (masking > 0) {
      nodes.push(mkNode('p:masking', 'masking', COL.policies, TOP, nodeLabel('Masking policies', `${masking} applied`), 168));
      addEdge('cov->masking', 'cov:tables', 'p:masking', '#f59e0b', true);
    }
    if (rls > 0) {
      nodes.push(mkNode('p:rls', 'rls', COL.policies, TOP + ROW_GAP, nodeLabel('Row-access policies', `${rls} applied`), 168));
      addEdge('cov->rls', 'cov:tables', 'p:rls', '#f43f5e', true);
    }
  }

  // ---- Network policies: left-hand login-gating cluster (account-level) -------
  const nets = (sec?.network_policies ?? []).filter((n) => n.name).slice(0, CAP_NETWORK);
  if (nets.length) {
    nodes.push(colHeader('h-net', COL.network, 'Network · login gating'));
    nets.forEach((n, i) => {
      const allow = Number(n.entries_in_allowlist) || 0;
      const block = Number(n.entries_in_blocklist) || 0;
      nodes.push(
        mkNode(
          `n:${n.name}`,
          'network',
          COL.network,
          TOP + i * ROW_GAP,
          nodeLabel(n.name as string, `${allow} allow · ${block} block`),
          176,
        ),
      );
    });
  }

  return {
    nodes,
    edges,
    caps: {
      users: [Math.min(CAP_USERS, totalUsers), totalUsers],
      roles: [Math.min(CAP_ROLES, totalRoles), totalRoles],
      objects: [Math.min(CAP_OBJECTS, totalObjects), totalObjects],
    },
    grantsTruncated,
  };
}

// ── Sample graph (only when ALL live sources are unavailable) ─────────────────
function buildSampleGraph(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const users = ['ANALYST_A', 'ENGINEER_B', 'STEWARD_C'];
  const roles = ['REPORTING', 'ENGINEERING', 'GOVERNANCE'];
  const objects = ['CUSTOMERS', 'ORDERS', 'PAYMENTS'];

  nodes.push(colHeader('s-h-users', COL.users, 'Users'));
  users.forEach((u, i) => nodes.push(mkNode(`su:${u}`, 'sample', COL.users, TOP + i * ROW_GAP, nodeLabel(u, 'sample'))));
  nodes.push(colHeader('s-h-roles', COL.roles, 'Roles'));
  roles.forEach((r, i) => nodes.push(mkNode(`sr:${r}`, 'sample', COL.roles, TOP + i * ROW_GAP, nodeLabel(r, 'sample'))));
  nodes.push(colHeader('s-h-obj', COL.objects, 'Objects'));
  objects.forEach((o, i) => nodes.push(mkNode(`so:${o}`, 'sample', COL.objects, TOP + i * ROW_GAP, nodeLabel(o, 'sample'))));
  nodes.push(colHeader('s-h-gov', COL.coverage, 'Governed data'));
  nodes.push(mkNode('scov', 'coverage', COL.coverage, TOP, nodeLabel('Governed tables', 'sample')));
  nodes.push(mkNode('sp:m', 'masking', COL.policies, TOP, nodeLabel('Masking policies', 'sample'), 168));
  nodes.push(mkNode('sp:r', 'rls', COL.policies, TOP + ROW_GAP, nodeLabel('Row-access policies', 'sample'), 168));

  const edge = (id: string, s: string, t: string, color: string, dashed = false): Edge => ({
    id, source: s, target: t, markerEnd: { type: MarkerType.ArrowClosed, color }, style: { stroke: color, strokeDasharray: dashed ? '4 3' : undefined, strokeWidth: 1.25 },
  });
  edges.push(edge('se1', 'su:ANALYST_A', 'sr:REPORTING', '#94a3b8'));
  edges.push(edge('se2', 'su:ENGINEER_B', 'sr:ENGINEERING', '#94a3b8'));
  edges.push(edge('se3', 'su:STEWARD_C', 'sr:GOVERNANCE', '#94a3b8'));
  edges.push(edge('se4', 'sr:REPORTING', 'so:CUSTOMERS', '#94a3b8'));
  edges.push(edge('se5', 'sr:ENGINEERING', 'so:ORDERS', '#94a3b8'));
  edges.push(edge('se6', 'sr:GOVERNANCE', 'so:PAYMENTS', '#94a3b8'));
  edges.push(edge('se7', 'scov', 'sp:m', '#94a3b8', true));
  edges.push(edge('se8', 'scov', 'sp:r', '#94a3b8', true));
  return { nodes, edges };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SecurityMap({ days = 30 }: { days?: number }) {
  const [loading, setLoading] = useState(true);
  const [roleRows, setRoleRows] = useState<RoleHierarchyRow[]>([]);
  const [objects, setObjects] = useState<ObjectEnrichmentRow[]>([]);
  const [sec, setSec] = useState<SecAuditResponse | null>(null);
  const [src, setSrc] = useState<{ roles: SourceState; objects: SourceState; security: SourceState }>({
    roles: 'empty',
    objects: 'empty',
    security: 'empty',
  });

  useEffect(() => {
    let active = true;
    setLoading(true);

    const pRoles = getRoleHierarchy()
      .then((r) => ({ ok: true, data: (r?.data ?? []) as RoleHierarchyRow[] }))
      .catch(() => ({ ok: false, data: [] as RoleHierarchyRow[] }));

    const pObjects = getObjectEnrichment(90, 3.0)
      .then((r) => ({ ok: !r?.degraded, data: (r?.data ?? []) as ObjectEnrichmentRow[] }))
      .catch(() => ({ ok: false, data: [] as ObjectEnrichmentRow[] }));

    const pSec = apiClient
      .get<SecAuditResponse>(API.commandCenter.securityAudit(days))
      .then((r) => ({ ok: true, data: r.data ?? null }))
      .catch(() => ({ ok: false, data: null as SecAuditResponse | null }));

    Promise.all([pRoles, pObjects, pSec]).then(([rR, rO, rS]) => {
      if (!active) return;
      setRoleRows(rR.data);
      setObjects(rO.data);
      setSec(rS.data);
      setSrc({
        roles: !rR.ok ? 'error' : rR.data.length ? 'ok' : 'empty',
        objects: !rO.ok ? 'error' : rO.data.length ? 'ok' : 'empty',
        security: !rS.ok ? 'error' : rS.data && (rS.data.access_grants?.length || rS.data.policy_coverage) ? 'ok' : 'empty',
      });
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [days]);

  const live = useMemo(() => buildLiveGraph(roleRows, objects, sec), [roleRows, objects, sec]);

  // A live graph is "real" if it has at least one spine relationship to show.
  const hasLive = live.nodes.some((n) => (n.data as { kind?: Kind })?.kind !== 'header');
  const sample = useMemo(() => (hasLive ? null : buildSampleGraph()), [hasLive]);
  const isSample = !hasLive;

  const nodes = isSample ? sample!.nodes : live.nodes;
  const edges = isSample ? sample!.edges : live.edges;

  // Degraded banner: which live sources fell over.
  const securityDown = src.security === 'error';
  const objectsDown = src.objects === 'error';

  return (
    <div>
      {/* Legend + status */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500 dark:text-gray-400">
        <Legend color="#3b82f6" label="User" />
        <Legend color="#f59e0b" label="No-MFA / masking" />
        <Legend color="#6366f1" label="Role" />
        <Legend color="#10b981" label="Object" />
        <Legend color="#f43f5e" label="Row-access" />
        <Legend color="#06b6d4" label="Network policy" />
        <span className="ml-1 inline-flex items-center gap-1">
          <span className="h-px w-4 bg-blue-500" /> grant
          <span className="ml-2 h-px w-4 bg-indigo-500" /> access
          <span className="ml-2 h-px w-4 border-t border-dashed border-slate-400" /> coverage
        </span>
        {!isSample && (
          <span className="ml-auto inline-flex flex-wrap items-center gap-1.5">
            {!loading && (
              <>
                <Pill tone="slate">
                  {`users ${live.caps.users[0]}/${live.caps.users[1]} · roles ${live.caps.roles[0]}/${live.caps.roles[1]} · objects ${live.caps.objects[0]}/${live.caps.objects[1]}`}
                </Pill>
                {live.grantsTruncated && <Pill tone="amber">grants: 100 most-recent</Pill>}
                {securityDown && <Pill tone="amber">grants & policies unavailable</Pill>}
                {objectsDown && <Pill tone="amber">object usage unavailable</Pill>}
              </>
            )}
          </span>
        )}
        {isSample && !loading && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            Sample data — live security sources unavailable
          </span>
        )}
      </div>

      <div className="h-[460px] w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">Mapping applied security…</div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background gap={16} color="#e2e8f0" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              className="!hidden md:!block"
              nodeColor={(n) => MINIMAP_COLOR[(n.data as { kind?: string })?.kind ?? 'object'] ?? '#cbd5e1'}
            />
          </ReactFlow>
        )}
      </div>

      <p className="mt-1.5 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
        Edges reflect only relationships the API exposes by name: user→role grants and role→object access.
        Masking / row-access policies are shown as an aggregate (the API does not map a policy to a specific table);
        network policies gate account login and are shown as a separate cluster.
      </p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function Pill({ tone, children }: { tone: 'slate' | 'amber'; children: ReactNode }) {
  const cls =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${cls}`}>{children}</span>;
}
