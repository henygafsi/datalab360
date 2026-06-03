'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Node, Edge, useNodesState, useEdgesState, Handle, Position,
  ReactFlowProvider, MiniMap, Controls, Background, BackgroundVariant,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Badge } from 'rizzui';
import {
  Database, Layers, Table2, Eye, ChevronRight, ChevronDown,
  BarChart3, Shield, Key, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
// Canonical table shape — shared with the page state + VirtualizedTableList so
// the onSelectTable callback returns a value assignable to setSelectedTable.
import type { TableItem } from '../../mapping/components/VirtualizedTableList';

interface SourceMindMapProps {
  databases: string[];
  schemas: string[];
  tables: TableItem[];
  selectedDatabase: string;
  onSelectTable: (table: TableItem) => void;
}

function DatabaseNode({ data }: NodeProps) {
  return (
    <div className="px-4 py-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/40 min-w-[160px]">
      <Handle type="source" position={Position.Right} className="!bg-blue-300 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5" />
        <div>
          <p className="text-xs font-bold">{data.label}</p>
          <p className="text-[10px] opacity-80">{data.schemaCount} schemas · {data.tableCount} tables</p>
        </div>
      </div>
    </div>
  );
}

function SchemaNode({ data }: NodeProps) {
  return (
    <div className={cn(
      "px-3.5 py-2.5 rounded-lg border-2 shadow-md min-w-[140px] transition-all",
      "bg-white dark:bg-slate-800 border-purple-200 dark:border-purple-800 hover:border-purple-400 hover:shadow-lg"
    )}>
      <Handle type="target" position={Position.Left} className="!bg-purple-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-purple-400 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-purple-500" />
        <div>
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{data.label}</p>
          <p className="text-[10px] text-slate-500">{data.tableCount} tables</p>
        </div>
      </div>
    </div>
  );
}

function TableNode({ data }: NodeProps) {
  const statusColor = data.status === 'configured'
    ? 'border-green-200 dark:border-green-800'
    : data.status === 'warning'
      ? 'border-amber-200 dark:border-amber-800'
      : 'border-slate-200 dark:border-slate-700';

  return (
    <div
      className={cn(
        "px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer transition-all min-w-[130px]",
        statusColor
      )}
      onClick={() => data.onSelect?.(data.tableItem)}
    >
      <Handle type="target" position={Position.Left} className="!bg-emerald-400 !w-2 !h-2" />
      <div className="flex items-center gap-1.5">
        <Table2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]">{data.label}</span>
      </div>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-[9px] text-slate-400">{data.columnCount} cols</span>
        {data.hasPrimaryKey && <Key className="h-2.5 w-2.5 text-amber-400" />}
        {data.sensitiveColumns > 0 && <Shield className="h-2.5 w-2.5 text-red-400" />}
        <span className={cn(
          "ml-auto px-1 py-0 rounded text-[8px] font-semibold",
          data.status === 'configured' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        )}>
          {data.status}
        </span>
      </div>
    </div>
  );
}

const nodeTypes = {
  database: DatabaseNode,
  schema: SchemaNode,
  table: TableNode,
};

function buildMindMapLayout(
  databases: string[],
  schemas: string[],
  tables: TableItem[],
  selectedDatabase: string,
  onSelectTable: (t: TableItem) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const dbsToShow = selectedDatabase ? [selectedDatabase] : databases.slice(0, 3);
  const startX = 0;
  let globalY = 0;

  dbsToShow.forEach((db, dbIdx) => {
    const dbId = `db-${db}`;
    const dbTables = tables.filter((t) => t.database === db);
    const dbSchemas = [...new Set(dbTables.map((t) => t.schema))];
    if (dbSchemas.length === 0 && schemas.length > 0) {
      dbSchemas.push(...schemas);
    }

    const dbY = globalY;
    nodes.push({
      id: dbId,
      type: 'database',
      position: { x: startX, y: dbY },
      data: { label: db, schemaCount: dbSchemas.length, tableCount: dbTables.length },
    });

    dbSchemas.forEach((schema, schIdx) => {
      const schemaId = `schema-${db}-${schema}`;
      const schemaTables = dbTables.filter((t) => t.schema === schema);
      const schemaY = dbY + schIdx * 180;

      nodes.push({
        id: schemaId,
        type: 'schema',
        position: { x: startX + 250, y: schemaY },
        data: { label: schema, tableCount: schemaTables.length },
      });

      edges.push({
        id: `e-${dbId}-${schemaId}`,
        source: dbId,
        target: schemaId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#a78bfa', strokeWidth: 2 },
      });

      schemaTables.forEach((tbl, tblIdx) => {
        const tableId = `table-${tbl.id}`;
        const cols = Math.min(3, Math.ceil(schemaTables.length / 3));
        const col = tblIdx % cols;
        const row = Math.floor(tblIdx / cols);
        const tableX = startX + 480 + col * 170;
        const tableY = schemaY - 30 + row * 58;

        nodes.push({
          id: tableId,
          type: 'table',
          position: { x: tableX, y: tableY },
          data: {
            label: tbl.table,
            columnCount: tbl.columnCount,
            hasPrimaryKey: tbl.hasPrimaryKey,
            sensitiveColumns: tbl.sensitiveColumns || 0,
            status: tbl.status,
            tableItem: tbl,
            onSelect: onSelectTable,
          },
        });

        edges.push({
          id: `e-${schemaId}-${tableId}`,
          source: schemaId,
          target: tableId,
          type: 'smoothstep',
          style: { stroke: '#94a3b8', strokeWidth: 1 },
        });
      });

      const maxTableRows = Math.ceil(schemaTables.length / 3);
      globalY = Math.max(globalY, schemaY + maxTableRows * 58 + 40);
    });

    globalY += 60;
  });

  return { nodes, edges };
}

function SourceMindMapInner({ databases, schemas, tables, selectedDatabase, onSelectTable }: SourceMindMapProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildMindMapLayout(databases, schemas, tables, selectedDatabase, onSelectTable),
    [databases, schemas, tables, selectedDatabase, onSelectTable],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.05}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls className="!bg-white/90 dark:!bg-slate-800/90 !border-slate-200 dark:!border-slate-700 !shadow-lg !rounded-lg" />
        <MiniMap
          nodeStrokeColor="#94a3b8"
          nodeColor={(n) =>
            n.type === 'database' ? '#3b82f6'
              : n.type === 'schema' ? '#a855f7'
                : '#10b981'
          }
          className="!bg-white/80 dark:!bg-slate-800/80 !border-slate-200 dark:!border-slate-700 !rounded-lg !shadow"
        />
      </ReactFlow>
    </div>
  );
}

export default function SourceMindMap(props: SourceMindMapProps) {
  return (
    <ReactFlowProvider>
      <SourceMindMapInner {...props} />
    </ReactFlowProvider>
  );
}
