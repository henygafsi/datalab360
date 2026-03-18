'use client';

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { Badge, Button, Input, Loader } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  PiDatabase,
  PiTable,
  PiUser,
  PiUsersThree,
  PiLockKey,
  PiFlowArrowDuotone,
  PiTreeStructureDuotone,
  PiGitBranch,
  PiArrowUp,
  PiArrowDown,
  PiMagnifyingGlass,
  PiColumns,
  PiEye,
  PiShieldCheck,
} from 'react-icons/pi';
import { HiOutlineRefresh } from 'react-icons/hi';

// ── Dagre auto-layout ──
const NODE_WIDTH = 280;
const NODE_HEIGHT = 120;

function getLayoutedElements(
  nodes: any[],
  edges: any[],
  direction: 'TB' | 'LR' = 'LR'
) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 120, edgesep: 30 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// ── Domain colors ──
const DOMAIN_COLORS: Record<string, { bg: string; border: string; text: string; darkBg: string; darkBorder: string }> = {
  TABLE: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', darkBg: 'dark:bg-blue-950/40', darkBorder: 'dark:border-blue-700' },
  VIEW: { bg: 'bg-cyan-50', border: 'border-cyan-300', text: 'text-cyan-700', darkBg: 'dark:bg-cyan-950/40', darkBorder: 'dark:border-cyan-700' },
  DATABASE: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', darkBg: 'dark:bg-purple-950/40', darkBorder: 'dark:border-purple-700' },
  SCHEMA: { bg: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-700', darkBg: 'dark:bg-indigo-950/40', darkBorder: 'dark:border-indigo-700' },
  FUNCTION: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', darkBg: 'dark:bg-amber-950/40', darkBorder: 'dark:border-amber-700' },
  PROCEDURE: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', darkBg: 'dark:bg-orange-950/40', darkBorder: 'dark:border-orange-700' },
  STAGE: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', darkBg: 'dark:bg-green-950/40', darkBorder: 'dark:border-green-700' },
  USER: { bg: 'bg-pink-50', border: 'border-pink-300', text: 'text-pink-700', darkBg: 'dark:bg-pink-950/40', darkBorder: 'dark:border-pink-700' },
  ROLE: { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-700', darkBg: 'dark:bg-rose-950/40', darkBorder: 'dark:border-rose-700' },
  PROJECT: { bg: 'bg-indigo-50', border: 'border-indigo-400', text: 'text-indigo-700', darkBg: 'dark:bg-indigo-950/40', darkBorder: 'dark:border-indigo-600' },
  MODULE: { bg: 'bg-fuchsia-50', border: 'border-fuchsia-300', text: 'text-fuchsia-700', darkBg: 'dark:bg-fuchsia-950/40', darkBorder: 'dark:border-fuchsia-700' },
  POLICY: { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700', darkBg: 'dark:bg-amber-950/40', darkBorder: 'dark:border-amber-600' },
  SOURCE: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', darkBg: 'dark:bg-emerald-950/40', darkBorder: 'dark:border-emerald-700' },
  TARGET: { bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-700', darkBg: 'dark:bg-violet-950/40', darkBorder: 'dark:border-violet-700' },
};

const getDomainStyle = (domain: string) =>
  DOMAIN_COLORS[domain?.toUpperCase()] || { bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-700', darkBg: 'dark:bg-slate-800', darkBorder: 'dark:border-slate-600' };

function DomainIcon({ domain, className }: { domain: string; className?: string }) {
  const d = String(domain || '').toUpperCase();
  if (d === 'TABLE' || d === 'VIEW') return <PiTable className={className} />;
  if (d === 'USER' || d === 'ROLE') return <PiUser className={className} />;
  if (d === 'DATABASE' || d === 'SCHEMA') return <PiDatabase className={className} />;
  if (d === 'COLUMN' || d === 'STAGE' || d === 'SOURCE') return <PiColumns className={className} />;
  if (d === 'PROJECT') return <PiTreeStructureDuotone className={className} />;
  if (d === 'MODULE') return <PiFlowArrowDuotone className={className} />;
  if (d === 'POLICY') return <PiLockKey className={className} />;
  return <PiGitBranch className={className} />;
}

// ── Custom Object Node ──
const ObjectNode = memo(({ data }: { data: any }) => {
  const style = getDomainStyle(data.domain);
  return (
    <div className={cn(
      'rounded-xl border-2 shadow-sm min-w-[240px] max-w-[300px] transition-shadow hover:shadow-md',
      style.bg, style.border, style.darkBg, style.darkBorder
    )}>
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-indigo-500 !border-white dark:!border-gray-900" />
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-blue-500 !border-white dark:!border-gray-900" />
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-inherit">
        <DomainIcon domain={data.domain} className={cn('w-4 h-4 shrink-0', style.text)} />
        <span className={cn('text-[11px] font-bold uppercase tracking-wide', style.text)}>{data.domain || 'OBJECT'}</span>
        {data.upstream_count > 0 && (
          <span className="ml-auto flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
            <PiArrowUp className="w-3 h-3" />{data.upstream_count}
          </span>
        )}
        {data.downstream_count > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400">
            <PiArrowDown className="w-3 h-3" />{data.downstream_count}
          </span>
        )}
      </div>
      {/* Body */}
      <div className="px-3 py-2 space-y-1">
        <div className="font-mono text-xs text-gray-900 dark:text-white font-semibold truncate" title={data.fullName}>
          {data.label}
        </div>
        {data.schema && (
          <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
            {data.database}.{data.schema}
          </div>
        )}
        {/* Badges row */}
        <div className="flex gap-1 flex-wrap pt-0.5">
          {data.roles_count > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
              <PiUsersThree className="w-2.5 h-2.5" /> {data.roles_count}
            </span>
          )}
          {data.policies_count > 0 ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <PiShieldCheck className="w-2.5 h-2.5" /> {data.policies_count}
            </span>
          ) : data.domain === 'TABLE' || data.domain === 'VIEW' ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              no policy
            </span>
          ) : null}
          {data.users_count > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              <PiUser className="w-2.5 h-2.5" /> {data.users_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
ObjectNode.displayName = 'ObjectNode';

// ── Custom Lineage Node (Source/Target) ──
const LineageNode = memo(({ data }: { data: any }) => {
  const style = getDomainStyle(data.domain);
  return (
    <div className={cn(
      'rounded-xl border-2 shadow-sm min-w-[220px] max-w-[280px] transition-shadow hover:shadow-md',
      style.bg, style.border, style.darkBg, style.darkBorder
    )}>
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-green-500 !border-white dark:!border-gray-900" />
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-violet-500 !border-white dark:!border-gray-900" />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-inherit">
        <DomainIcon domain={data.domain} className={cn('w-4 h-4 shrink-0', style.text)} />
        <span className={cn('text-[11px] font-bold uppercase tracking-wide', style.text)}>{data.domain || 'OBJECT'}</span>
        {data.access_count && (
          <span className="ml-auto text-[10px] text-gray-500 dark:text-gray-400 font-medium">
            {Number(data.access_count).toLocaleString()} hits
          </span>
        )}
      </div>
      <div className="px-3 py-2 space-y-1">
        <div className="font-mono text-xs text-gray-900 dark:text-white font-semibold truncate" title={data.fullName}>
          {data.label}
        </div>
        {data.users && (
          <div className="text-[10px] text-gray-500 dark:text-gray-400">
            <PiUser className="w-3 h-3 inline mr-0.5" /> {data.users}
          </div>
        )}
        {data.query_id && (
          <div className="text-[10px] text-gray-400 font-mono truncate">
            Q: {data.query_id}
          </div>
        )}
      </div>
    </div>
  );
});
LineageNode.displayName = 'LineageNode';

const nodeTypes = {
  objectNode: ObjectNode,
  lineageNode: LineageNode,
};

// ── Edge style ──
const defaultEdgeOptions = {
  style: { strokeWidth: 2, stroke: '#6366f1' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1', width: 16, height: 16 },
  animated: true,
};

// ============================================================================
// VIEW 1: Dependency Flow (from cross-module lineage data — nodes/edges)
// ============================================================================
interface DependencyFlowProps {
  data: any;
  loading: boolean;
}

function DependencyFlowInner({ data, loading }: DependencyFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [dbFilter, setDbFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [nodeLimit, setNodeLimit] = useState(50);

  const buildGraph = useCallback(() => {
    if (!data?.nodes?.length) return;

    const rawNodes: any[] = data.nodes || [];
    const rawEdges: any[] = data.edges || [];

    // Apply filters
    let filteredNodes = rawNodes;
    if (dbFilter) {
      filteredNodes = filteredNodes.filter((n: any) =>
        n.database?.toLowerCase().includes(dbFilter.toLowerCase())
      );
    }
    if (domainFilter) {
      filteredNodes = filteredNodes.filter((n: any) =>
        n.domain?.toLowerCase() === domainFilter.toLowerCase()
      );
    }

    // Paginated node loading for performance
    const nodeSlice = filteredNodes.slice(0, nodeLimit);
    const nodeIds = new Set(nodeSlice.map((n: any) => n.id));

    // Build React Flow nodes
    const rfNodes = nodeSlice.map((n: any) => ({
      id: n.id,
      type: 'objectNode',
      data: {
        label: n.name,
        fullName: `${n.database}.${n.schema}.${n.name}`,
        domain: n.domain,
        database: n.database,
        schema: n.schema,
        upstream_count: n.upstream?.length || 0,
        downstream_count: n.downstream?.length || 0,
        roles_count: n.roles?.length || 0,
        policies_count: n.policies?.length || 0,
        users_count: n.users?.length || 0,
      },
      position: { x: 0, y: 0 },
    }));

    // Build edges (only where both source & target exist)
    const rfEdges = rawEdges
      .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e: any, i: number) => ({
        id: `dep-${i}`,
        source: e.source,
        target: e.target,
        ...defaultEdgeOptions,
      }));

    // Auto-layout
    const { nodes: laid, edges: laidEdges } = getLayoutedElements(rfNodes, rfEdges, 'LR');
    setNodes(laid);
    setEdges(laidEdges);
  }, [data, dbFilter, domainFilter, nodeLimit, setNodes, setEdges]);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  // Collect unique domains for filter
  const domains = useMemo(() => {
    const set = new Set<string>();
    (data?.nodes || []).forEach((n: any) => { if (n.domain) set.add(n.domain); });
    return Array.from(set).sort();
  }, [data]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader size="lg" /></div>;
  }

  if (!data?.nodes?.length) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400">
        <PiGitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>No dependency data available. Load cross-module lineage first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <Input
          label="Database"
          placeholder="Filter by database..."
          value={dbFilter}
          onChange={(e) => setDbFilter(e.target.value)}
          className="w-48"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Domain</label>
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 text-sm"
          >
            <option value="">All domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={buildGraph} className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700 h-10">
          <HiOutlineRefresh className="w-3.5 h-3.5" /> Re-layout
        </Button>
        <div className="ml-auto flex gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Badge size="sm" className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
            {nodes.length} nodes
          </Badge>
          <Badge size="sm" className="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
            {edges.length} edges
          </Badge>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="relative h-[650px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e2e8f0" gap={20} className="dark:!bg-gray-900" />
          <Controls className="!bg-white dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700 !shadow-md [&>button]:!bg-white [&>button]:dark:!bg-gray-800 [&>button]:!border-gray-200 [&>button]:dark:!border-gray-700 [&>button]:!text-gray-700 [&>button]:dark:!text-gray-300" />
          <MiniMap
            nodeColor={(node) => {
              const d = node.data?.domain?.toUpperCase();
              const map: Record<string, string> = {
                TABLE: '#3b82f6', VIEW: '#06b6d4', DATABASE: '#8b5cf6',
                SCHEMA: '#6366f1', FUNCTION: '#f59e0b', PROCEDURE: '#f97316',
                STAGE: '#22c55e', ROLE: '#f43f5e',
              };
              return map[d] || '#64748b';
            }}
            className="!bg-gray-50 dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700"
          />
          <Panel position="top-right">
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 text-[10px] space-y-1">
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Legend</div>
              {['TABLE', 'VIEW', 'FUNCTION', 'STAGE', 'PROCEDURE'].map((d) => {
                const s = getDomainStyle(d);
                return (
                  <div key={d} className="flex items-center gap-1.5">
                    <DomainIcon domain={d} className={cn('w-3 h-3', s.text)} />
                    <span className="text-gray-600 dark:text-gray-400">{d}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </ReactFlow>
        {(data?.nodes?.length || 0) > nodeLimit && (
          <button
            onClick={() => setNodeLimit((prev) => prev + 50)}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white shadow-lg hover:bg-blue-700 transition-colors"
          >
            Load More ({(data?.nodes?.length || 0) - nodeLimit} remaining)
          </button>
        )}
      </div>
    </div>
  );
}

export function DependencyFlowView(props: DependencyFlowProps) {
  return (
    <ReactFlowProvider>
      <DependencyFlowInner {...props} />
    </ReactFlowProvider>
  );
}

// ============================================================================
// VIEW 2: Lineage Flow (from data lineage — source → target access history)
// ============================================================================
interface LineageFlowProps {
  lineageData: any[];
  accessPatterns: any[];
  loading: boolean;
  onLoadLineage: (params: { database?: string; table?: string; days: number }) => Promise<void>;
  onLoadAccess: (days: number) => Promise<void>;
}

function LineageFlowInner({ lineageData, accessPatterns, loading, onLoadLineage, onLoadAccess }: LineageFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchDb, setSearchDb] = useState('');
  const [searchTable, setSearchTable] = useState('');
  const [days, setDays] = useState('30');
  const [viewMode, setViewMode] = useState<'lineage' | 'access'>('lineage');

  // Build lineage flow from lineage data
  const buildLineageFlow = useCallback(() => {
    if (!lineageData?.length) { setNodes([]); setEdges([]); return; }

    const nodeMap = new Map<string, any>();
    const rfEdges: any[] = [];

    lineageData.slice(0, 100).forEach((row: any, i: number) => {
      const source = row.source_object || row.SOURCE_OBJECT || row.direct_objects_accessed || '';
      const target = row.target_object || row.TARGET_OBJECT || row.objects_modified || '';
      const user = row.user_name || row.USER_NAME || '';

      if (source && !nodeMap.has(source)) {
        nodeMap.set(source, {
          id: `src-${source}`,
          type: 'lineageNode',
          data: { label: source.split('.').pop() || source, fullName: source, domain: 'SOURCE', users: user },
          position: { x: 0, y: 0 },
        });
      }
      if (target && !nodeMap.has(target)) {
        nodeMap.set(target, {
          id: `tgt-${target}`,
          type: 'lineageNode',
          data: { label: target.split('.').pop() || target, fullName: target, domain: 'TARGET', users: user },
          position: { x: 0, y: 0 },
        });
      }
      if (source && target) {
        rfEdges.push({
          id: `lin-${i}`,
          source: `src-${source}`,
          target: `tgt-${target}`,
          style: { strokeWidth: 2, stroke: '#8b5cf6' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6', width: 14, height: 14 },
          animated: true,
          label: user ? `by ${user}` : undefined,
          labelStyle: { fontSize: 9, fill: '#6b7280' },
        });
      }
    });

    const rfNodes = Array.from(nodeMap.values());
    const { nodes: laid, edges: laidEdges } = getLayoutedElements(rfNodes, rfEdges, 'LR');
    setNodes(laid);
    setEdges(laidEdges);
  }, [lineageData, setNodes, setEdges]);

  // Build access pattern flow
  const buildAccessFlow = useCallback(() => {
    if (!accessPatterns?.length) { setNodes([]); setEdges([]); return; }

    // Group by table, create nodes per table with access stats
    const rfNodes: any[] = [];
    const rfEdges: any[] = [];

    // Create a central "ACCESS" hub node
    rfNodes.push({
      id: 'hub-access',
      type: 'lineageNode',
      data: { label: 'Data Access Hub', domain: 'DATABASE', access_count: accessPatterns.length + ' tables' },
      position: { x: 0, y: 0 },
    });

    accessPatterns.slice(0, 60).forEach((row: any, i: number) => {
      const tableName = row.table_name || row.TABLE_NAME || `table-${i}`;
      const accessCount = row.access_count || row.ACCESS_COUNT || 0;
      const uniqueUsers = row.unique_users || row.UNIQUE_USERS || 0;

      rfNodes.push({
        id: `acc-${i}`,
        type: 'lineageNode',
        data: {
          label: tableName.split('.').pop() || tableName,
          fullName: tableName,
          domain: 'TABLE',
          access_count: accessCount,
          users: `${uniqueUsers} users`,
        },
        position: { x: 0, y: 0 },
      });

      rfEdges.push({
        id: `acc-edge-${i}`,
        source: 'hub-access',
        target: `acc-${i}`,
        style: { strokeWidth: Math.max(1, Math.min(4, Math.log10(Number(accessCount) + 1) * 1.5)), stroke: '#10b981' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981', width: 12, height: 12 },
        animated: Number(accessCount) > 100,
        label: `${Number(accessCount).toLocaleString()}`,
        labelStyle: { fontSize: 9, fill: '#6b7280' },
      });
    });

    const { nodes: laid, edges: laidEdges } = getLayoutedElements(rfNodes, rfEdges, 'LR');
    setNodes(laid);
    setEdges(laidEdges);
  }, [accessPatterns, setNodes, setEdges]);

  useEffect(() => {
    if (viewMode === 'lineage') buildLineageFlow();
    else buildAccessFlow();
  }, [viewMode, buildLineageFlow, buildAccessFlow]);

  return (
    <div className="space-y-3">
      {/* Sub-view toggle + filters */}
      <div className="flex gap-2 flex-wrap items-end">
        <Button
          variant={viewMode === 'lineage' ? 'solid' : 'outline'}
          onClick={() => setViewMode('lineage')}
          className={cn('gap-1.5', viewMode === 'lineage' ? 'bg-indigo-600 text-white' : '')}
          size="sm"
        >
          <PiFlowArrowDuotone className="w-4 h-4" /> Data Lineage
        </Button>
        <Button
          variant={viewMode === 'access' ? 'solid' : 'outline'}
          onClick={() => setViewMode('access')}
          className={cn('gap-1.5', viewMode === 'access' ? 'bg-indigo-600 text-white' : '')}
          size="sm"
        >
          <PiEye className="w-4 h-4" /> Access Patterns
        </Button>

        <div className="border-l border-gray-300 dark:border-gray-600 h-6 mx-1" />

        {viewMode === 'lineage' && (
          <>
            <Input placeholder="Database" value={searchDb} onChange={(e) => setSearchDb(e.target.value)} className="w-36" />
            <Input placeholder="Table (optional)" value={searchTable} onChange={(e) => setSearchTable(e.target.value)} className="w-44" />
          </>
        )}
        <Input type="number" placeholder="30" value={days} onChange={(e) => setDays(e.target.value)} className="w-20" />
        <Button
          onClick={async () => {
            if (viewMode === 'lineage') {
              await onLoadLineage({ database: searchDb || undefined, table: searchTable || undefined, days: parseInt(days) || 30 });
            } else {
              await onLoadAccess(parseInt(days) || 30);
            }
          }}
          disabled={loading}
          size="sm"
          className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700 h-10"
        >
          {loading ? <Loader variant="spinner" size="sm" /> : <PiMagnifyingGlass className="w-4 h-4" />}
          Load
        </Button>

        <div className="ml-auto">
          <Badge size="sm" className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
            {nodes.length} nodes / {edges.length} edges
          </Badge>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="h-[650px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {nodes.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
            <PiFlowArrowDuotone className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-sm">
              {viewMode === 'lineage'
                ? 'Click "Load" to fetch data lineage from ACCESS_HISTORY'
                : 'Click "Load" to fetch table access patterns'}
            </p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#e2e8f0" gap={20} className="dark:!bg-gray-900" />
            <Controls className="!bg-white dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700 !shadow-md [&>button]:!bg-white [&>button]:dark:!bg-gray-800 [&>button]:!border-gray-200 [&>button]:dark:!border-gray-700 [&>button]:!text-gray-700 [&>button]:dark:!text-gray-300" />
            <MiniMap
              nodeColor={(node) => {
                const d = node.data?.domain?.toUpperCase();
                if (d === 'SOURCE') return '#22c55e';
                if (d === 'TARGET') return '#8b5cf6';
                return '#3b82f6';
              }}
              className="!bg-gray-50 dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700"
            />
            <Panel position="top-right">
              <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 text-[10px] space-y-1">
                <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {viewMode === 'lineage' ? 'Lineage Flow' : 'Access Patterns'}
                </div>
                {viewMode === 'lineage' ? (
                  <>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Source</div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500" /> Target</div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500" /> Hub</div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Table</div>
                    <div className="text-gray-400">Edge width = access freq.</div>
                  </>
                )}
              </div>
            </Panel>
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

export function LineageFlowView(props: LineageFlowProps) {
  return (
    <ReactFlowProvider>
      <LineageFlowInner {...props} />
    </ReactFlowProvider>
  );
}
