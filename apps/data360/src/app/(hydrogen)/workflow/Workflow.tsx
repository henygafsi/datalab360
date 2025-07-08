// app/workflow/page.tsx
'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  OnConnect,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { getSession } from "next-auth/react";
import toast, { Toaster } from 'react-hot-toast'; // Import toast and Toaster

let id = 0;
const getId = () => `node_${id++}`;

// --- Node Types (Moved outside the component for memoization) ---
const nodeTypes = {
  src: ({ data }: any) => (
    <div className="relative w-40 h-24 bg-blue-100 border-2 border-blue-500 text-blue-900 font-bold rounded-lg shadow-lg hover:shadow-xl transition cursor-pointer flex flex-col justify-center items-center text-xs text-center p-2 group">
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-700 rounded-full absolute top-1/2 -right-3" />
      <span className="text-sm font-semibold mb-1">📥 Source</span>
      {/* Hidden details, shown on hover */}
      <div className="absolute inset-0 bg-blue-50 text-blue-900 rounded-lg flex flex-col justify-center items-center text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div><b>DB:</b> {data.database || 'N/A'}</div>
        <div><b>Schema:</b> {data.schema || 'N/A'}</div>
        <div><b>Table:</b> {data.table || 'N/A'}</div>
        <div><b>Columns:</b> {data.columns || 'N/A'}</div>
      </div>
    </div>
  ),
  join: ({ data }: any) => (
    <div className="relative w-40 h-40 text-yellow-800 font-semibold group">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <polygon points="0,0 0,100 100,50" fill="#FEF3C7" stroke="#FACC15" strokeWidth="4" />
      </svg>
      <Handle type="target" position={Position.Left} id="input1" className="w-3 h-3 bg-yellow-700 absolute top-1/4 -left-3 rounded-full" />
      <Handle type="target" position={Position.Left} id="input2" className="w-3 h-3 bg-yellow-700 absolute top-3/4 -left-3 rounded-full" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-yellow-700 absolute top-1/2 -right-3 rounded-full" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none text-yellow-800 text-center">
        🔀 Join
        {/* Hidden details, shown on hover */}
        <div className="absolute inset-0 bg-yellow-50 text-yellow-800 rounded-lg flex flex-col justify-center items-center text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div><b>Type:</b> {data.join_type || 'N/A'}</div>
          <div><b>L-Key:</b> {data.left_key || 'N/A'}</div>
          <div><b>R-Key:</b> {data.right_key || 'N/A'}</div>
        </div>
      </div>
    </div>
  ),
  aggregate_kpi: ({ data }: any) => (
    <div className="relative w-40 h-24 bg-red-100 border-2 border-red-500 text-red-800 font-bold flex flex-col items-center justify-center rounded-xl shadow-lg hover:shadow-xl transition cursor-pointer p-2 group">
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-red-700 rounded-full" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-red-700 rounded-full" />
      <span className="text-sm">📊 Aggregate KPI</span>
      {/* Hidden details, shown on hover */}
      <div className="absolute inset-0 bg-red-50 text-red-800 rounded-xl flex flex-col justify-center items-center text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div><b>KPI:</b> {data.kpi_name || 'N/A'}</div>
        <div><b>Agg Type:</b> {data.agg_type || 'N/A'}</div>
        <div><b>Cols:</b> {data.columns ? data.columns.join(', ') : 'N/A'}</div>
      </div>
    </div>
  ),
  sort: ({ data }: any) => (
    <div className="relative w-20 h-20 bg-purple-100 border-2 border-purple-500 text-purple-800 font-bold flex items-center justify-center rounded-full shadow-lg hover:shadow-xl transition cursor-pointer p-2 group">
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-purple-700 rounded-full" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-purple-700 rounded-full" />
      <span className="text-sm text-center">⬆️⬇️ Sort</span>
      {/* Hidden details, shown on hover */}
      <div className="absolute inset-0 bg-purple-50 text-purple-800 rounded-full flex flex-col justify-center items-center text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div><b>Col:</b> {data.sort_column || 'N/A'}</div>
        <div><b>Order:</b> {data.sort_order || 'N/A'}</div>
      </div>
    </div>
  ),
  destination: ({ data }: any) => (
    <div className="relative w-40 h-24 bg-green-100 border-2 border-green-500 text-green-800 font-bold flex flex-col items-center justify-center rounded-xl shadow-lg hover:shadow-xl transition cursor-pointer p-2 group">
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-green-700 rounded-full" />
      <span className="text-sm">📤 Destination</span>
      {/* Hidden details, shown on hover */}
      <div className="absolute inset-0 bg-green-50 text-green-800 rounded-xl flex flex-col justify-center items-center text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div><b>DB:</b> {data.database || 'N/A'}</div>
        <div><b>Table:</b> {data.destination_table || 'N/A'}</div>
      </div>
    </div>
  ),
};

// --- Modals ---

// Generic Modal Container now accepts an onDelete callback and nodeId
const Modal = ({ isOpen, onClose, children, onDelete, nodeId }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-96 shadow-lg space-y-4">
        {children}
        <div className="flex justify-between items-center mt-4"> {/* Align items for better spacing */}
          {onDelete && ( // Only show delete button if onDelete prop is provided
            <button
              onClick={() => onDelete(nodeId)}
              className="px-4 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition"
            >
              Delete Node
            </button>
          )}
          <div className="flex space-x-2">
            {/* The save button is now rendered inside each specific modal, not here */}
            <button onClick={onClose} className="px-4 py-1 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Source Configuration Modal
const SourceConfigModal = ({ isOpen, onClose, onSave, initialData, accessToken, onDelete, nodeId }: any) => {
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [columnsList, setColumnsList] = useState<string[]>([]);

  const [database, setDatabase] = useState(initialData?.database || '');
  const [schema, setSchema] = useState(initialData?.schema || '');
  const [table, setTable] = useState(initialData?.table || '');
  const [columns, setColumns] = useState<string[]>(initialData?.columns?.split(', ') || []);

  const fetchOptions = useCallback(
    async (url: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
      if (!accessToken) {
        console.warn("fetchOptions: No access token provided.");
        return;
      }

      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! Status: ${response.status}. Message: ${errorText}`);
        }

        const result = await response.json();
        let processedData: string[] = [];

        if (url.includes('/mapping/databases') || url.includes('/mapping/schemas/') || url.includes('/mapping/tables/')) {
          const key = url.includes('/mapping/databases') ? 'databases' : url.includes('/mapping/schemas/') ? 'schemas' : 'tables';
          const raw = result[key] || result;
          processedData = Array.isArray(raw)
            ? raw.map((item: any) => typeof item === 'string' ? item : item.name)
            : [];
        } else if (url.includes('/mapping/get_table_columns')) {
          const raw = result.columns || result;
          processedData = Array.isArray(raw)
            ? raw.map((item: any) => typeof item === 'string' ? item : item.name)
            : [];
        } else {
          processedData = Array.isArray(result)
            ? result.map((item: any) => typeof item === 'string' ? item : item.name)
            : [];
        }

        setter(processedData);
      } catch (error) {
        console.error(`fetchOptions: Error fetching from ${url}`, error);
        toast.error(`Error loading data from API.\n${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [accessToken]
  );


  useEffect(() => {
    if (isOpen && accessToken) {
      setDatabases([]);
      fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/mapping/databases`, setDatabases);
    }
  }, [isOpen, accessToken, fetchOptions]);

  useEffect(() => {
    if (database && accessToken) {
      setSchemas([]);
      setSchema('');
      fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/mapping/schemas/${database}`, setSchemas);
    }
  }, [database, accessToken, fetchOptions]);

  useEffect(() => {
    if (database && schema && accessToken) {
      setTables([]);
      setTable('');
      fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/mapping/tables/${database}/${schema}`, setTables);
    }
  }, [database, schema, accessToken, fetchOptions]);

  useEffect(() => {
    if (database && schema && table && accessToken) {
      setColumnsList([]);
      setColumns([]);
      fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/mapping/get_table_columns/?database_name=${database}&schema_name=${schema}&table_name=${table}`, setColumnsList);
    }
  }, [database, schema, table, accessToken, fetchOptions]);

  const handleSave = () => {
    onSave({ database, schema, table, columns: columns.join(', ') });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Source</h2>
      <select className="w-full border px-3 py-2 rounded" value={database} onChange={(e) => setDatabase(e.target.value)}>
        <option value="">Select Database</option>
        {databases.map(db => <option key={db} value={db}>{db}</option>)}
      </select>
      <select className="w-full border px-3 py-2 rounded" value={schema} onChange={(e) => setSchema(e.target.value)}>
        <option value="">Select Schema</option>
        {schemas.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="w-full border px-3 py-2 rounded" value={table} onChange={(e) => setTable(e.target.value)}>
        <option value="">Select Table</option>
        {tables.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <label className="block text-sm font-medium text-gray-700 mt-2">Select Columns (Hold Ctrl/Cmd to select multiple)</label>
      <select multiple className="w-full border px-3 py-2 rounded h-24" value={columns} onChange={(e) => setColumns(Array.from(e.target.selectedOptions, o => o.value))}>
        {columnsList.map(col => <option key={col} value={col}>{col}</option>)}
      </select>
      <div className="flex justify-end mt-4">
        <button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button>
      </div>
    </Modal>
  );
};

// Join Configuration Modal
const JoinConfigModal = ({ isOpen, onClose, onSave, initialData, availableNodes, edges, onDelete, nodeId }: any) => {
  const [leftStep, setLeftStep] = useState(initialData?.left_step || '');
  const [rightStep, setRightStep] = useState(initialData?.right_step || '');
  const [leftKey, setLeftKey] = useState(initialData?.left_key || '');
  const [rightKey, setRightKey] = useState(initialData?.right_key || '');
  const [joinType, setJoinType] = useState(initialData?.join_type || 'INNER');
  const [leftColumns, setLeftColumns] = useState<string[]>(initialData?.left_columns || []);
  const [rightColumns, setRightColumns] = useState<string[]>(initialData?.right_columns || []);

  const [leftInputCols, setLeftInputCols] = useState<string[]>([]);
  const [rightInputCols, setRightInputCols] = useState<string[]>([]);

  const getDynamicInputColumns = useCallback((nodeId: string | undefined, allNodes: Node[], allEdges: Edge[]): string[] => {
      if (!nodeId) return [];
      const node = allNodes.find(n => n.id === nodeId);
      if (!node) return [];

      switch(node.type) {
          case 'src':
              return typeof node.data.columns === 'string'
                  ? node.data.columns.split(', ').map((col: string) => col.trim())
                  : (node.data.columns || []);
          case 'join':
              const lc = Array.isArray(node.data.left_columns) ? node.data.left_columns : [];
              const rc = Array.isArray(node.data.right_columns) ? node.data.right_columns : [];
              return Array.from(new Set([...lc, ...rc]));
          case 'aggregate_kpi':
              const incomingEdgeToAgg = allEdges.find(e => e.target === node.id);
              let inputColsBeforeAgg: string[] = [];
              if (incomingEdgeToAgg) {
                  const sourceNodeBeforeAgg = allNodes.find(n => n.id === incomingEdgeToAgg.source);
                  inputColsBeforeAgg = getDynamicInputColumns(sourceNodeBeforeAgg?.id, allNodes, allEdges);
              }
              const aggregated = Array.isArray(node.data.columns) ? node.data.columns : [];
              const kpi = node.data.kpi_name ? [node.data.kpi_name] : [];
              const nonAggregated = inputColsBeforeAgg.filter(col => !aggregated.includes(col));
              return Array.from(new Set([...nonAggregated, ...kpi]));
          case 'sort':
              const sortInputEdge = allEdges.find(e => e.target === node.id);
              if (sortInputEdge) {
                  const sortInputNode = allNodes.find(n => n.id === sortInputEdge.source);
                  return getDynamicInputColumns(sortInputNode?.id, allNodes, allEdges);
              }
              return [];
          default:
              return [];
      }
  }, []);

  useEffect(() => {
    if (isOpen && initialData.nodeId) {
      const incomingEdges = edges.filter((edge: Edge) => edge.target === initialData.nodeId);
      const leftEdge = incomingEdges.find((edge: Edge) => edge.targetHandle === 'input1');
      const rightEdge = incomingEdges.find((edge: Edge) => edge.targetHandle === 'input2');

      const nodeIdToStepMap = new Map<string, number>();
      availableNodes.forEach((node: Node, idx: number) => nodeIdToStepMap.set(node.id, idx + 1));

      setLeftInputCols(getDynamicInputColumns(leftEdge?.source, availableNodes, edges));
      setRightInputCols(getDynamicInputColumns(rightEdge?.source, availableNodes, edges));

      if (leftEdge) setLeftStep(nodeIdToStepMap.get(leftEdge.source));
      if (rightEdge) setRightStep(nodeIdToStepMap.get(rightEdge.source));
    }
  }, [isOpen, initialData, availableNodes, edges, getDynamicInputColumns]);


  useEffect(() => {
    if (isOpen && initialData) {
      setLeftKey(initialData.left_key || '');
      setRightKey(initialData.right_key || '');
      setJoinType(initialData.join_type || 'INNER');
      setLeftColumns(initialData.left_columns || []);
      setRightColumns(initialData.right_columns || []);
    }
  }, [isOpen, initialData]);


  const handleSave = () => {
    onSave({ left_step: leftStep, right_step: rightStep, left_key: leftKey, right_key: rightKey, join_type: joinType, left_columns: leftColumns, right_columns: rightColumns });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Join</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Left Key (from connected source)</label>
          <select className="w-full border px-3 py-2 rounded" value={leftKey} onChange={(e) => setLeftKey(e.target.value)}>
            <option value="">Select Left Key</option>
            {leftInputCols.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Right Key (from connected source)</label>
          <select className="w-full border px-3 py-2 rounded" value={rightKey} onChange={(e) => setRightKey(e.target.value)}>
            <option value="">Select Right Key</option>
            {rightInputCols.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Join Type</label>
        <select className="w-full border px-3 py-2 rounded" value={joinType} onChange={(e) => setJoinType(e.target.value)}>
          <option value="INNER">INNER</option>
          <option value="LEFT">LEFT</option>
          <option value="RIGHT">RIGHT</option>
          <option value="FULL">FULL</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Left Columns (to output)</label>
          <select multiple className="w-full border px-3 py-2 rounded h-24" value={leftColumns} onChange={(e) => setLeftColumns(Array.from(e.target.selectedOptions, o => o.value))}>
            {leftInputCols.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Right Columns (to output)</label>
          <select multiple className="w-full border px-3 py-2 rounded h-24" value={rightColumns} onChange={(e) => setRightColumns(Array.from(e.target.selectedOptions, o => o.value))}>
            {rightInputCols.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button>
      </div>
    </Modal>
  );
};

// Aggregate KPI Configuration Modal
const AggregateKpiConfigModal = ({ isOpen, onClose, onSave, initialData, availableInputColumns, onDelete, nodeId }: any) => {
  const [columns, setColumns] = useState<string[]>(initialData?.columns || []); // Columns TO AGGREGATE
  const [aggType, setAggType] = useState(initialData?.agg_type || 'SUM');
  const [kpiName, setKpiName] = useState(initialData?.kpi_name || '');

  useEffect(() => {
    if (isOpen && initialData) {
      setColumns(initialData.columns || []);
      setAggType(initialData.agg_type || 'SUM');
      setKpiName(initialData.kpi_name || '');
    }
  }, [isOpen, initialData]);

  const handleSave = () => {
    onSave({ columns, agg_type: aggType, kpi_name: kpiName });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Aggregate KPI</h2>
      <div>
        <label className="block text-sm font-medium text-gray-700">Columns to Aggregate</label>
        <select multiple className="w-full border px-3 py-2 rounded h-24" value={columns} onChange={(e) => setColumns(Array.from(e.target.selectedOptions, o => o.value))}>
          {availableInputColumns.map((col: string) => <option key={col} value={col}>{col}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Aggregation Type</label>
        <select className="w-full border px-3 py-2 rounded" value={aggType} onChange={(e) => setAggType(e.target.value)}>
          <option value="SUM">SUM</option>
          <option value="AVG">AVG</option>
          <option value="COUNT">COUNT</option>
          <option value="MIN">MIN</option>
          <option value="MAX">MAX</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">New KPI Name</label>
        <input type="text" className="w-full border px-3 py-2 rounded" value={kpiName} onChange={(e) => setKpiName(e.target.value)} />
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button>
      </div>
    </Modal>
  );
};

// Sort Configuration Modal
const SortConfigModal = ({ isOpen, onClose, onSave, initialData, availableInputColumns, onDelete, nodeId }: any) => {
  const [sortColumn, setSortColumn] = useState(initialData?.sort_column || '');
  const [sortOrder, setSortOrder] = useState(initialData?.sort_order || 'ASC');

  useEffect(() => {
    if (isOpen && initialData) {
      setSortColumn(initialData.sort_column || '');
      setSortOrder(initialData.sort_order || 'ASC');
    }
  }, [isOpen, initialData]);

  const handleSave = () => {
    onSave({ sort_column: sortColumn, sort_order: sortOrder });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Sort</h2>
      <div>
        <label className="block text-sm font-medium text-gray-700">Sort Column</label>
        <select className="w-full border px-3 py-2 rounded" value={sortColumn} onChange={(e) => setSortColumn(e.target.value)}>
          <option value="">Select Column</option>
          {availableInputColumns.map((col: string) => <option key={col} value={col}>{col}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Sort Order</label>
        <select className="w-full border px-3 py-2 rounded" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
          <option value="ASC">ASC</option>
          <option value="DESC">DESC</option>
        </select>
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button>
      </div>
    </Modal>
  );
};

// Destination Configuration Modal
const DestinationConfigModal = ({ isOpen, onClose, onSave, initialData, availableInputColumns, accessToken, onDelete, nodeId }: any) => {
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [database, setDatabase] = useState(initialData?.database || '');
  const [schema, setSchema] = useState(initialData?.schema || '');
  const [destinationTable, setDestinationTable] = useState(initialData?.destination_table || '');
  const [destinationColumns, setDestinationColumns] = useState<string[]>(initialData?.columns || []);

  const fetchOptions = useCallback(async (url: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (!accessToken) {
      console.warn("DestinationConfigModal: No access token available for API calls. Please log in.");
      return;
    }
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status}. Message: ${errorText}`);
      }
      const result = await response.json();

      let processedData: string[] = [];
      if (url.includes('/mapping/databases') || url.includes('/mapping/schemas/') || url.includes('/mapping/tables/')) {
        const key = url.includes('/mapping/databases') ? 'databases' : url.includes('/mapping/schemas/') ? 'schemas' : 'tables';
        const raw = result[key] || result;
        processedData = Array.isArray(raw)
          ? raw.map((item: any) => typeof item === 'string' ? item : item.name)
          : [];
      } else if (url.includes('/mapping/get_table_columns')) {
        const raw = result.columns || result;
        processedData = Array.isArray(raw)
          ? raw.map((item: any) => typeof item === 'string' ? item : item.name)
          : [];
      } else {
        processedData = Array.isArray(result) ? result : [];
      }

      setter(processedData);
    } catch (error) {
      console.error(`DestinationConfigModal: Error fetching data from ${url}:`, error);
      toast.error(`Destination Configuration Error: Failed to load data. Check console for details. Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isOpen && accessToken) {
      setDatabases([]);
      fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/mapping/databases`, setDatabases);
    }
  }, [isOpen, accessToken, fetchOptions]);

  useEffect(() => {
    if (database && accessToken) {
      setSchemas([]);
      setSchema('');
      fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/mapping/schemas/${database}`, setSchemas);
    }
  }, [database, accessToken, fetchOptions]);

  useEffect(() => {
    if (database && schema && accessToken) {
      setTables([]);
      setDestinationTable('');
      fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/mapping/tables/${database}/${schema}`, setTables);
    }
  }, [database, schema, accessToken, fetchOptions]);

  useEffect(() => {
    if (isOpen && initialData) {
      setDatabase(initialData.database || '');
      setSchema(initialData.schema || '');
      setDestinationTable(initialData.destination_table || '');
      setDestinationColumns(initialData.columns || []);
    }
  }, [isOpen, initialData]);

  const handleSave = () => {
    onSave({ database, schema, destination_table: destinationTable, columns: destinationColumns });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Destination</h2>
      <select className="w-full border px-3 py-2 rounded" value={database} onChange={(e) => setDatabase(e.target.value)}>
        <option value="">Select Database</option>
        {databases.map(db => <option key={db} value={db}>{db}</option>)}
      </select>
      <select className="w-full border px-3 py-2 rounded" value={schema} onChange={(e) => setSchema(e.target.value)}>
        <option value="">Select Schema</option>
        {schemas.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="w-full border px-3 py-2 rounded" value={destinationTable} onChange={(e) => setDestinationTable(e.target.value)}>
        <option value="">Select Table</option>
        {tables.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <label className="block text-sm font-medium text-gray-700 mt-2">Destination Columns (Select from available)</label>
      <select multiple className="w-full border px-3 py-2 rounded h-24" value={destinationColumns} onChange={(e) => setDestinationColumns(Array.from(e.target.selectedOptions, o => o.value))}>
        {availableInputColumns.map((col: string) => <option key={col} value={col}>{col}</option>)}
      </select>
      <div className="flex justify-end mt-4">
        <button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button>
      </div>
    </Modal>
  );
};


export default function WorkflowBuilder() {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState<string>('MyDynamicWorkflow');
  const [isWorkflowSaved, setIsWorkflowSaved] = useState<boolean>(false);

  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showAggregateKpiModal, setShowAggregateKpiModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [availableInputColumns, setAvailableInputColumns] = useState<string[]>([]);

  useEffect(() => {
    const fetchUserSession = async () => {
      const session = await getSession();
      if (session?.user?.access_token) {
        setAccessToken(session.user.access_token as string);
      } else {
        console.error("WorkflowBuilder: No access token found in session.user.access_token. API calls will likely fail. Please ensure your NextAuth.js configuration (pages/api/auth/[...nextauth].ts) correctly exposes the access_token within the 'user' object of the session.");
      }
    };
    fetchUserSession();
  }, []);

  const onConnect: OnConnect = useCallback(
    (params: Edge | Connection) => {
      setIsWorkflowSaved(false);
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );

  const handleDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');

      if (!type || !reactFlowInstance) {
        console.warn("Drag/Drop failed: Type or ReactFlow instance not available.");
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setNodes((nds) =>
        nds.concat({
          id: getId(),
          type: type,
          position,
          data: {},
        })
      );
      setIsWorkflowSaved(false);
    },
    [reactFlowInstance]
  );

  // Helper function to get all output columns from a node, considering its type
  const getAllOutputColumnsOfNode = useCallback((node: Node | undefined, currentNodes: Node[] = nodes, currentEdges: Edge[] = edges): string[] => {
    if (!node) return [];

    switch (node.type) {
      case 'src':
        return typeof node.data.columns === 'string'
          ? node.data.columns.split(', ').map((col: string) => col.trim())
          : (node.data.columns || []);
      case 'join':
        const leftCols = Array.isArray(node.data.left_columns) ? node.data.left_columns : [];
        const rightCols = Array.isArray(node.data.right_columns) ? node.data.right_columns : [];
        return Array.from(new Set([...leftCols, ...rightCols]));
      case 'aggregate_kpi':
        const incomingEdgeToAgg = currentEdges.find(edge => edge.target === node.id);
        let inputColumnsBeforeAgg: string[] = [];
        if (incomingEdgeToAgg) {
          const sourceNodeBeforeAgg = currentNodes.find(n => n.id === incomingEdgeToAgg.source);
          inputColumnsBeforeAgg = getAllOutputColumnsOfNode(sourceNodeBeforeAgg, currentNodes, currentEdges);
        }

        const aggregatedColumns = Array.isArray(node.data.columns) ? node.data.columns : [];
        const kpiName = node.data.kpi_name ? [node.data.kpi_name] : [];

        const nonAggregatedColumns = inputColumnsBeforeAgg.filter(col => !aggregatedColumns.includes(col));

        return Array.from(new Set([...nonAggregatedColumns, ...kpiName]));

      case 'sort':
        const incomingEdgeToSort = currentEdges.find(edge => edge.target === node.id);
        if (incomingEdgeToSort) {
          const sourceNodeToSort = currentNodes.find(n => n.id === incomingEdgeToSort.source);
          return getAllOutputColumnsOfNode(sourceNodeToSort, currentNodes, currentEdges);
        }
        return [];
      case 'destination':
        return [];
      default:
        return [];
    }
  }, [nodes, edges]);

  const getOutputColumnsOfPreviousStep = useCallback((targetNodeId: string) => {
    const incomingEdges = edges.filter(edge => edge.target === targetNodeId);
    if (incomingEdges.length === 0) return [];

    let combinedColumns: string[] = [];

    if (nodes.find(n => n.id === targetNodeId)?.type === 'join') {
      const leftEdge = incomingEdges.find(edge => edge.targetHandle === 'input1');
      const rightEdge = incomingEdges.find(edge => edge.targetHandle === 'input2');

      if (leftEdge) {
        const leftSourceNode = nodes.find(n => n.id === leftEdge.source);
        combinedColumns = [...combinedColumns, ...getAllOutputColumnsOfNode(leftSourceNode)];
      }
      if (rightEdge) {
        const rightSourceNode = nodes.find(n => n.id === rightEdge.source);
        combinedColumns = [...combinedColumns, ...getAllOutputColumnsOfNode(rightSourceNode)];
      }
      return Array.from(new Set(combinedColumns));
    } else {
      const sourceNode = nodes.find(n => n.id === incomingEdges[0].source);
      return getAllOutputColumnsOfNode(sourceNode);
    }
  }, [nodes, edges, getAllOutputColumnsOfNode]);


  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);

    let inputCols: string[] = [];
    if (node.type === 'join') {
      inputCols = [];
    } else {
      inputCols = getOutputColumnsOfPreviousStep(node.id);
    }
    setAvailableInputColumns(inputCols);

    switch (node.type) {
      case 'src':
        setShowSourceModal(true);
        break;
      case 'join':
        setShowJoinModal(true);
        break;
      case 'aggregate_kpi':
        setShowAggregateKpiModal(true);
        break;
      case 'sort':
        setShowSortModal(true);
        break;
      case 'destination':
        setShowDestinationModal(true);
        break;
      default:
        break;
    }
  }, [getOutputColumnsOfPreviousStep]);

  const updateNodeData = (data: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...data } } : n))
    );
    setIsWorkflowSaved(false);
    handleCloseModals();
  };

  const handleDeleteNode = useCallback((nodeIdToDelete: string) => {
    if (window.confirm("Are you sure you want to delete this node and its connections?")) {
      setNodes((nds) => nds.filter((node) => node.id !== nodeIdToDelete));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeIdToDelete && edge.target !== nodeIdToDelete));
      setIsWorkflowSaved(false);
      handleCloseModals();
      toast.success("Node and its connections deleted successfully!");
    }
  }, [setNodes, setEdges]);


  const handleCloseModals = () => {
    setShowSourceModal(false);
    setShowJoinModal(false);
    setShowAggregateKpiModal(false);
    setShowSortModal(false);
    setShowDestinationModal(false);
    setSelectedNode(null);
    setAvailableInputColumns([]);
  };

  const saveWorkflow = async () => {
    if (!workflowName) {
      toast.error("Please enter a workflow name before saving.");
      return;
    }

    const orderedSteps: any[] = [];
    const nodeIdToStepOrderMap = new Map<string, number>();

    const sources = nodes.filter(node => node.type === 'src');
    const joins = nodes.filter(node => node.type === 'join');
    const aggregates = nodes.filter(node => node.type === 'aggregate_kpi');
    const sorts = nodes.filter(node => node.type === 'sort');
    const destinations = nodes.filter(node => node.type === 'destination');

    const getUpstreamNodesForOrdering = (node: Node, currentNodes: Node[], currentEdges: Edge[], visited: Set<string> = new Set()): Node[] => {
      if (visited.has(node.id)) return [];
      visited.add(node.id);

      let upstream: Node[] = [];
      const incomingEdges = currentEdges.filter(edge => edge.target === node.id);

      incomingEdges.forEach(edge => {
        const sourceNode = currentNodes.find(n => n.id === edge.source);
        if (sourceNode) {
          upstream = [...upstream, ...getUpstreamNodesForOrdering(sourceNode, currentNodes, currentEdges, visited)];
        }
      });
      return [...upstream, node];
    };

    let allOrderedNodes: Node[] = [];
    let processedNodeIds = new Set<string>();

    const processNodesInOrderCategory = (nodeList: Node[]) => {
      const sortedCurrentNodes = [...nodeList].sort((a, b) => {
        const aDependenciesMet = edges.filter(e => e.target === a.id).every(e => processedNodeIds.has(e.source));
        const bDependenciesMet = edges.filter(e => e.target === b.id).every(e => processedNodeIds.has(e.source));

        if (aDependenciesMet && !bDependenciesMet) return -1;
        if (!aDependenciesMet && bDependenciesMet) return 1;
        return a.position.y - b.position.y || a.position.x - b.position.x;
      });


      sortedCurrentNodes.forEach(node => {
        if (!processedNodeIds.has(node.id)) {
          const upstreamNodesForThisNode = getUpstreamNodesForOrdering(node, nodes, edges);
          upstreamNodesForThisNode.forEach(uNode => {
            if (!processedNodeIds.has(uNode.id)) {
              allOrderedNodes.push(uNode);
              processedNodeIds.add(uNode.id);
            }
          });
        }
      });
    };

    processNodesInOrderCategory(sources);
    processNodesInOrderCategory(joins);
    processNodesInOrderCategory(aggregates);
    processNodesInOrderCategory(sorts);
    processNodesInOrderCategory(destinations);

    nodes.forEach(node => {
      if (!processedNodeIds.has(node.id)) {
        allOrderedNodes.push(node);
        processedNodeIds.add(node.id);
      }
    });

    allOrderedNodes.sort((a, b) => {
      const typeOrder: { [key: string]: number } = {
        'src': 1, 'join': 2, 'aggregate_kpi': 3, 'sort': 4, 'destination': 5
      };
      const orderA = typeOrder[a.type] || 99;
      const orderB = typeOrder[b.type] || 99;

      if (orderA !== orderB) return orderA - orderB;
      return a.position.y - b.position.y || a.position.x - b.position.x;
    });

    allOrderedNodes.forEach((node, index) => {
      nodeIdToStepOrderMap.set(node.id, index + 1);
    });

    allOrderedNodes.forEach(node => {
      const step: any = {
        step_order: nodeIdToStepOrderMap.get(node.id),
        action_type: node.type === 'join' ? 'join_tables' : node.type,
        payload: { ...node.data },
      };

      const incomingEdges = edges.filter(edge => edge.target === node.id);

      switch (node.type) {
        case 'join':
          const leftEdge = incomingEdges.find(edge => edge.targetHandle === 'input1');
          const rightEdge = incomingEdges.find(edge => edge.targetHandle === 'input2');

          if (leftEdge) {
            step.payload.left_step = nodeIdToStepOrderMap.get(leftEdge.source);
          }
          if (rightEdge) {
            step.payload.right_step = nodeIdToStepOrderMap.get(rightEdge.source);
          }
          if (typeof step.payload.left_columns === 'string') {
            step.payload.left_columns = step.payload.left_columns.split(',').map((c: string) => c.trim());
          } else if (!Array.isArray(step.payload.left_columns)) {
            step.payload.left_columns = [];
          }
          if (typeof step.payload.right_columns === 'string') {
            step.payload.right_columns = step.payload.right_columns.split(',').map((c: string) => c.trim());
          } else if (!Array.isArray(step.payload.right_columns)) {
            step.payload.right_columns = [];
          }
          break;
        case 'aggregate_kpi':
          if (incomingEdges.length > 0) {
            step.payload.input_step = nodeIdToStepOrderMap.get(incomingEdges[0].source);
          }
          if (step.payload.columns && typeof step.payload.columns === 'string') {
            step.payload.columns = step.payload.columns.split(',').map((c: string) => c.trim());
          } else if (!Array.isArray(step.payload.columns)) {
            step.payload.columns = [];
          }
          break;
        case 'sort':
          if (incomingEdges.length > 0) {
            step.payload.input_step = nodeIdToStepOrderMap.get(incomingEdges[0].source);
          }
          // Remove 'columns' from sort payload as per requirement
          if (step.payload.columns) {
            delete step.payload.columns;
          }
          break;
        case 'destination':
          if (incomingEdges.length > 0) {
            step.payload.input_step = nodeIdToStepOrderMap.get(incomingEdges[0].source);
          }
          if (step.payload.columns && typeof step.payload.columns === 'string') {
            step.payload.columns = step.payload.columns.split(',').map((c: string) => c.trim());
          } else if (!Array.isArray(step.payload.columns)) {
            step.payload.columns = [];
          }
          delete step.payload.destination_columns_str;
          break;
        case 'src':
          if (step.payload.columns && Array.isArray(step.payload.columns)) {
            step.payload.columns = step.payload.columns.join(', ');
          }
          break;
        default:
          break;
      }
      orderedSteps.push(step);
    });

    const workflowJson = {
      workflow_name: workflowName,
      steps: orderedSteps,
    };

    console.log("Generated Workflow JSON:", JSON.stringify(workflowJson, null, 2));

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/API_WORKFLOW/create_workflow/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(workflowJson),
      });

      if (response.ok) {
        toast.success('Workflow saved successfully!'); // Use toast here
        setIsWorkflowSaved(true);
      } else {
        const errorData = await response.json();
        toast.error(`Failed to save workflow: ${JSON.stringify(errorData)}`); // Use toast here
        setIsWorkflowSaved(false);
      }
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast.error('An error occurred while saving the workflow.'); // Use toast here
      setIsWorkflowSaved(false);
    }
  };

  const executeWorkflow = async () => {
    if (!workflowName) {
      toast.error("Workflow name is missing. Please save the workflow first."); // Use toast here
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/API_WORKFLOW/execute_workflow/?workflow_name=${encodeURIComponent(workflowName)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Workflow execution initiated: ${result}`); // Use toast here
      } else {
        const errorData = await response.json();
        toast.error(`Failed to execute workflow: ${JSON.stringify(errorData)}`); // Use toast here
      }
    } catch (error) {
      console.error('Error executing workflow:', error);
      toast.error('An error occurred while executing the workflow.'); // Use toast here
    }
  };

  const PaletteItem = ({
    label,
    type,
    shape,
    className,
    tooltip,
  }: {
    label: string;
    type: string;
    shape: React.ReactNode;
    className?: string;
    tooltip?: string;
  }) => (
    <div
      className={`flex items-center space-x-2 mb-3 p-2 rounded-lg cursor-move border shadow-sm bg-white hover:bg-gray-100 transition ${className}`}
      draggable
      onDragStart={(e) => handleDragStart(e, type)}
      title={tooltip || label}
    >
      <div className="w-10 h-10 flex items-center justify-center">{shape}</div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </div>
  );

  return (
    <ReactFlowProvider>
      <div className="flex h-screen">
        <div className="w-64 bg-gray-50 p-4 border-r border-gray-300 overflow-y-auto">
          <h3 className="text-xl font-bold text-gray-800 mb-4">🧩 ETL Blocks</h3>
          <PaletteItem label="Source" type="src" shape={<div className="w-6 h-6 bg-blue-400 rounded" />} tooltip="Input data source (e.g., DB)" />
          <PaletteItem label="Join" type="join" shape={<div className="w-0 h-0 border-l-[12px] border-r-[12px] border-b-[20px] border-transparent border-b-yellow-400" />} tooltip="Join 2 sources" />
          <PaletteItem label="Aggregate KPI" type="aggregate_kpi" shape={<div className="w-6 h-6 bg-red-400 rounded-full" />} tooltip="Aggregate key performance indicator" />
          <PaletteItem label="Sort" type="sort" shape={<div className="w-6 h-6 bg-purple-300 rounded-full" />} tooltip="Sort dataset" />
          <PaletteItem label="Destination" type="destination" shape={<div className="w-6 h-6 bg-green-400 rounded" />} tooltip="Output target" />

          <div className="mt-6">
            <label htmlFor="workflowName" className="block text-sm font-medium text-gray-700 mb-1">Workflow Name</label>
            <input
              type="text"
              id="workflowName"
              className="w-full border px-3 py-2 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              value={workflowName}
              onChange={(e) => {
                setWorkflowName(e.target.value);
                setIsWorkflowSaved(false);
              }}
              placeholder="Enter workflow name"
            />
          </div>

          <button onClick={saveWorkflow} className="mt-4 w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition">
            Save Workflow
          </button>

          <button
            onClick={executeWorkflow}
            disabled={!isWorkflowSaved}
            className={`mt-3 w-full py-2 rounded-lg font-semibold transition ${
              isWorkflowSaved
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Execute Workflow
          </button>
        </div>

        <div className="flex-1 relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onNodeClick={onNodeClick}
            fitView
            nodeTypes={nodeTypes}
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>

          {/* Modals */}
          <SourceConfigModal
            isOpen={showSourceModal}
            onClose={handleCloseModals}
            onSave={updateNodeData}
            initialData={selectedNode?.data}
            accessToken={accessToken}
            onDelete={handleDeleteNode}
            nodeId={selectedNode?.id}
          />
          <JoinConfigModal
            isOpen={showJoinModal}
            onClose={handleCloseModals}
            onSave={updateNodeData}
            initialData={{ ...selectedNode?.data, nodeId: selectedNode?.id }}
            availableNodes={nodes}
            edges={edges}
            onDelete={handleDeleteNode}
            nodeId={selectedNode?.id}
          />
          <AggregateKpiConfigModal
            isOpen={showAggregateKpiModal}
            onClose={handleCloseModals}
            onSave={updateNodeData}
            initialData={selectedNode?.data}
            availableInputColumns={availableInputColumns}
            onDelete={handleDeleteNode}
            nodeId={selectedNode?.id}
          />
          <SortConfigModal
            isOpen={showSortModal}
            onClose={handleCloseModals}
            onSave={updateNodeData}
            initialData={selectedNode?.data}
            availableInputColumns={availableInputColumns}
            onDelete={handleDeleteNode}
            nodeId={selectedNode?.id}
          />
          <DestinationConfigModal
            isOpen={showDestinationModal}
            onClose={handleCloseModals}
            onSave={updateNodeData}
            initialData={selectedNode?.data}
            availableInputColumns={availableInputColumns}
            accessToken={accessToken}
            onDelete={handleDeleteNode}
            nodeId={selectedNode?.id}
          />
        </div>
      </div>
      <Toaster /> {/* Add the Toaster component here */}
    </ReactFlowProvider>
  );
}