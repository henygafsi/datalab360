'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  Background,
  BackgroundVariant,
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
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import toast, { Toaster } from 'react-hot-toast';

let id = 0;
const getId = () => `node_${id++}`;

// --- Node Types (Moved outside the component for memoization) ---
const nodeTypes = {
  src: ({ data }: any) => (
    <div className="relative w-40 h-24 font-bold flex flex-col justify-center items-center text-xs text-center p-2 group">
      <Handle type="source" position={Position.Right} className="w-5 h-5 bg-blue-700 rounded-full absolute top-1/2 -right-3" />
      <svg width="48px" height="48px" viewBox="0 0 24 24" role="img" xmlns="http://www.w3.org/2000/svg" aria-labelledby="databaseIconTitle" stroke="#000000" strokeWidth="1" strokeLinecap="square" strokeLinejoin="miter" fill="none" color="#000000"> <title id="databaseIconTitle">Database</title> <ellipse cx="12" cy="6" rx="8" ry="3"/> <path d="M4,6 C4,8.209139 7.581722,10 12,10 C16.418278,10 20,8.209139 20,6"/> <path d="M4,12 C4,14.209139 7.581722,16 12,16 C16.418278,16 20,14.209139 20,12"/> <path d="M4,18 C4,20.209139 7.581722,22 12,22 C16.418278,22 20,20.209139 20,18"/> <path d="M4 6L4 18"/> <path d="M20 6L20 18"/> </svg>
      <span className="text-sm font-semibold mb-1">Source</span>
      <div className="absolute inset-0 bg-transparent text-blue-900 rounded-lg flex flex-col justify-center items-center text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div><b>DB:</b> {data.database || 'N/A'}</div>
        <div><b>Schema:</b> {data.schema || 'N/A'}</div>
        <div><b>Table:</b> {data.table || 'N/A'}</div>
        <div><b>Columns:</b> {data.columns ? (Array.isArray(data.columns) ? data.columns.join(', ') : data.columns) : 'N/A'}</div>
      </div>
    </div>
  ),
  drop_nulls: ({ data }: any) => (
    <div className="relative w-32 h-20 p-2 flex flex-col justify-center items-center text-xs font-bold group">
      <Handle type="target" position={Position.Left} className="w-5 h-5 bg-orange-700 rounded-full" />
      <Handle type="source" position={Position.Right} className="w-5 h-5 bg-orange-700 rounded-full" />
      <span className="text-4xl">🗑️</span>
      <span>Drop Nulls</span>
      <div className="absolute inset-0 bg-transparent text-orange-800 text-[10px] rounded p-1 opacity-0 group-hover:opacity-100">
        <div><b>Column:</b> {data.null_column}</div>
      </div>
    </div>
  ),
  drop_duplicates: ({ data }: any) => (
    <div className="relative w-32 h-20 p-2 flex flex-col justify-center items-center text-xs font-bold group">
      <Handle type="target" position={Position.Left} className="w-5 h-5 bg-pink-700 rounded-full" />
      <Handle type="source" position={Position.Right} className="w-5 h-5 bg-pink-700 rounded-full" />
      <span className="text-4xl">✂️</span>
      <span>Drop Duplicates</span>
      <div className="absolute inset-0 bg-transparent text-pink-800 text-[10px] rounded p-1 opacity-0 group-hover:opacity-100">
        <div><b>Order Col:</b> {data.order_column || 'N/A'}</div>
        <div><b>Dedup Cols:</b> {data.dedup_columns ? (Array.isArray(data.dedup_columns) ? data.dedup_columns.join(', ') : data.dedup_columns) : 'N/A'}</div>
      </div>
    </div>
  ),
  normalize: ({ data }: any) => (
    <div className="relative w-32 h-20 p-2 flex flex-col justify-center items-center text-xs font-bold group">
      <Handle type="target" position={Position.Left} className="w-5 h-5 bg-cyan-700 rounded-full" />
      <Handle type="source" position={Position.Right} className="w-5 h-5 bg-cyan-700 rounded-full" />
      <span className="text-4xl">⚖️</span>
      <span>Normalize ({data.normalize_type})</span>
      <div className="absolute inset-0 bg-transparent text-cyan-800 text-[10px] rounded p-1 opacity-0 group-hover:opacity-100">
        <div><b>Target:</b> {data.normalize_type === 'zscore' ? data.zscore_column : data.minmax_column}</div>
        <div><b>Output:</b> {data.normalize_type === 'zscore' ? data.zscore_column_normalized : data.minmax_column_normalized}</div>
      </div>
    </div>
  ),

  join: ({ data }: any) => (
    <div className="relative w-40 h-40 font-semibold group">
      <Handle type="target" position={Position.Left} id="input1" className="w-5 h-5 bg-yellow-700 absolute top-1/4 -left-3 rounded-full" />
      <Handle type="target" position={Position.Left} id="input2" className="w-5 h-5 bg-yellow-700 absolute top-3/4 -left-3 rounded-full" />
      <Handle type="source" position={Position.Right} className="w-5 h-5 bg-yellow-700 rounded-full absolute top-1/2 -right-3 rounded-full" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none text-yellow-800 text-center">
      <span className="text-4xl">🔀</span>
      <span>Join</span>
        <div className="absolute inset-0 bg-transparent text-yellow-800 rounded-lg flex flex-col justify-center items-center text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div><b>Type:</b> {data.join_type || 'N/A'}</div>
          <div><b>L-Key:</b> {data.left_key || 'N/A'}</div>
          <div><b>R-Key:</b> {data.right_key || 'N/A'}</div>
          <div><b>L-Cols:</b> {data.left_columns ? (Array.isArray(data.left_columns) ? data.left_columns.join(', ') : data.left_columns) : 'N/A'}</div>
          <div><b>R-Cols:</b> {data.right_columns ? (Array.isArray(data.right_columns) ? data.right_columns.join(', ') : data.right_columns) : 'N/A'}</div>
        </div>
      </div>
    </div>
  ),
  aggregate_kpi: ({ data }: any) => (
    <div className="relative w-40 h-24 font-bold flex flex-col items-center justify-center p-2 group">
      <Handle type="target" position={Position.Left} className="w-5 h-5 bg-red-700 rounded-full" />
      <Handle type="source" position={Position.Right} className="w-5 h-5 bg-red-700 rounded-full" />
      <span className="text-4xl">📊</span>
      <span className="text-sm">Aggregate KPI</span>
      <div className="absolute inset-0 bg-transparent text-red-800 rounded-xl flex flex-col justify-center items-center text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div><b>KPI:</b> {data.kpi_name || 'N/A'}</div>
        <div><b>Agg Type:</b> {data.agg_type || 'N/A'}</div>
        <div><b>Cols:</b> {data.columns ? (Array.isArray(data.columns) ? data.columns.join(', ') : data.columns) : 'N/A'}</div>
      </div>
    </div>
  ),
  sort: ({ data }: any) => (
    <div className="relative w-20 h-20 font-bold flex items-center justify-center p-2 group">
      <Handle type="target" position={Position.Left} className="w-5 h-5 bg-purple-700 rounded-full" />
      <Handle type="source" position={Position.Right} className="w-5 h-5 bg-purple-700 rounded-full" />
      <svg fill="#000000" height="48" viewBox="0 0 24 24" width="48" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
    </svg>
      <span className="text-sm text-center">Sort</span>
      <div className="absolute inset-0 bg-transparent text-purple-800 rounded-full flex flex-col justify-center items-center text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div><b>Col:</b> {data.sort_column || 'N/A'}</div>
        <div><b>Order:</b> {data.sort_order || 'N/A'}</div>
      </div>
    </div>
  ),
  destination: ({ data }: any) => (
    <div className="relative w-40 h-24 font-bold flex flex-col items-center justify-center p-2 group">
      <Handle type="target" position={Position.Left} className="w-5 h-5 bg-green-700 rounded-full" />
      <svg width="48px" height="48px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 21C15.3137 17.6863 18 14.7912 18 10.5C18 6.35786 15.3137 3 12 3C8.68629 3 6 6.35786 6 10.5C6 14.7912 8.68629 17.6863 12 21Z" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 13C13.6569 13 15 11.6569 15 10C15 8.34315 13.6569 7 12 7C10.3431 7 9 8.34315 9 10C9 11.6569 10.3431 13 12 13Z" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
      <span className="text-sm">Destination</span>
      <div className="absolute inset-0 bg-transparent text-green-800 rounded-xl flex flex-col justify-center items-center text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div><b>DB:</b> {data.database || 'N/A'}</div>
        <div><b>Table:</b> {data.destination_table || 'N/A'}</div>
        <div><b>Columns:</b> {data.columns ? (Array.isArray(data.columns) ? data.columns.join(', ') : data.columns) : 'N/A'}</div>
      </div>
    </div>
  ),
  export_excel: ({ data }: any) => (
    <div className="relative w-40 h-24 font-bold flex flex-col items-center justify-center p-2 group">
      <Handle type="target" position={Position.Left} className="w-5 h-5 bg-emerald-700 rounded-full" />
      <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
      <span className="text-sm">Export Excel</span>
    </div>
  ),
};

// --- Modals (remain in WorkflowBuilder for direct access to ReactFlow state) ---
const Modal = ({ isOpen, onClose, children, onDelete, nodeId }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-96 shadow-lg space-y-4">
        {children}
        <div className="flex justify-between items-center mt-4">
          {onDelete && (
            <button
              onClick={() => onDelete(nodeId)}
              className="px-4 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition"
            >
              Delete Node
            </button>
          )}
          <div className="flex space-x-2">
            <button onClick={onClose} className="px-4 py-1 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DropNullsConfigModal = ({ isOpen, onClose, onSave, initialData, availableInputColumns, onDelete, nodeId }: any) => {
  const [nullColumn, setNullColumn] = useState(initialData?.null_column || '');
  useEffect(() => { if (isOpen && initialData) setNullColumn(initialData.null_column || ''); }, [isOpen, initialData]);
  const handleSave = () => { onSave({ null_column: nullColumn }); onClose(); };
  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Drop Nulls</h2>
      <div><label className="block text-sm font-medium text-gray-700">Column to check for null</label><select className="w-full border px-3 py-2 rounded" value={nullColumn} onChange={(e) => setNullColumn(e.target.value)}><option value="">Select Column</option>{availableInputColumns.map((col: string) => (<option key={col} value={col}>{col}</option>))}</select></div>
      <div className="flex justify-end mt-4"><button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button></div>
    </Modal>
  );
};

const DropDuplicatesConfigModal = ({ isOpen, onClose, onSave, initialData, availableInputColumns, onDelete, nodeId }: any) => {
  const [dedupColumns, setDedupColumns] = useState(initialData?.dedup_columns || []);
  const [orderColumn, setOrderColumn] = useState(initialData?.order_column || '');
  useEffect(() => { if (isOpen && initialData) { setDedupColumns(initialData.dedup_columns || []); setOrderColumn(initialData.order_column || ''); } }, [isOpen, initialData]);
  const handleSave = () => { onSave({ dedup_columns: dedupColumns, order_column: orderColumn, }); onClose(); };
  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Drop Duplicates</h2>
      <div><label className="block text-sm font-medium text-gray-700">Columns to Deduplicate</label><select multiple className="w-full border px-3 py-2 rounded h-24" value={dedupColumns} onChange={(e) => setDedupColumns(Array.from(e.target.selectedOptions, o => o.value))}><option value="">Select Columns (multi-select)</option>{availableInputColumns.map((col: string) => (<option key={col} value={col}>{col}</option>))}</select></div>
      <div><label className="block text-sm font-medium text-gray-700">Order Column</label><select className="w-full border px-3 py-2 rounded" value={orderColumn} onChange={(e) => setOrderColumn(e.target.value)}><option value="">Select Order Column</option>{availableInputColumns.map((col: string) => (<option key={col} value={col}>{col}</option>))}</select></div>
      <div className="flex justify-end mt-4"><button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button></div>
    </Modal>
  );
};

const NormalizeConfigModal = ({ isOpen, onClose, onSave, initialData, availableInputColumns, onDelete, nodeId }: any) => {
  const [normalizeType, setNormalizeType] = useState(initialData?.normalize_type || 'zscore');
  const [targetColumn, setTargetColumn] = useState(initialData?.zscore_column || initialData?.minmax_column || '');
  const [outputColumn, setOutputColumn] = useState(initialData?.zscore_column_normalized || initialData?.minmax_column_normalized || '');
  useEffect(() => { if (isOpen && initialData) { setNormalizeType(initialData.normalize_type || 'zscore'); setTargetColumn(initialData?.zscore_column || initialData?.minmax_column || ''); setOutputColumn(initialData?.zscore_column_normalized || initialData?.minmax_column_normalized || ''); } }, [isOpen, initialData]);
  const handleSave = () => { const payload: any = { normalize_type: normalizeType, }; if (normalizeType === 'zscore') { payload.zscore_column = targetColumn; payload.zscore_column_normalized = outputColumn; } else { payload.minmax_column = targetColumn; payload.minmax_column_normalized = outputColumn; } onSave(payload); onClose(); };
  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Normalization</h2>
      <div><label className="block text-sm font-medium text-gray-700">Normalization Type</label><select className="w-full border px-3 py-2 rounded" value={normalizeType} onChange={(e) => setNormalizeType(e.target.value)}><option value="zscore">Z-Score</option><option value="minmax">Min-Max</option></select></div>
      <div><label className="block text-sm font-medium text-gray-700">Target Column</label><select className="w-full border px-3 py-2 rounded" value={targetColumn} onChange={(e) => setTargetColumn(e.target.value)}><option value="">Select Column</option>{availableInputColumns.map((col: string) => (<option key={col} value={col}>{col}</option>))}</select></div>
      <div><label className="block text-sm font-medium text-gray-700">Output Column</label><input type="text" className="w-full border px-3 py-2 rounded" value={outputColumn} onChange={(e) => setOutputColumn(e.target.value)} placeholder="e.g. total_amount_zscore" /></div>
      <div className="flex justify-end mt-4"><button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button></div>
    </Modal>
  );
};

const SourceConfigModal = ({ isOpen, onClose, onSave, initialData, accessToken, onDelete, nodeId }: any) => {
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [columnsList, setColumnsList] = useState<string[]>([]);
  const [database, setDatabase] = useState(initialData?.database || '');
  const [schema, setSchema] = useState(initialData?.schema || '');
  const [table, setTable] = useState(initialData?.table || '');
  const [columns, setColumns] = useState<string[]>(initialData?.columns || []); 

  const fetchOptions = useCallback(
    async (url: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
      if (!accessToken) { console.warn("fetchOptions: No access token provided."); return; }
      try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', }, });
        if (!response.ok) { const errorText = await response.text(); throw new Error(`HTTP error! Status: ${response.status}. Message: ${errorText}`); }
        const result = await response.json() as any;
        let processedData: string[] = [];
        if (url.includes('/explore-design/guided/databases') || url.includes('/explore-design/guided/schemas/') || url.includes('/explore-design/guided/tables/')) {
          const key = url.includes('/explore-design/guided/databases') ? 'databases' : url.includes('/explore-design/guided/schemas/') ? 'schemas' : 'tables';
          const raw = result[key] || result;
          processedData = Array.isArray(raw) ? raw.map((item: any) => typeof item === 'string' ? item : item.name) : [];
        } else if (url.includes('/explore-design/guided/get_table_columns')) {
          const raw = result.columns || result;
          processedData = Array.isArray(raw) ? raw.map((item: any) => typeof item === 'string' ? item : item.name) : [];
        } else { processedData = Array.isArray(result) ? result.map((item: any) => typeof item === 'string' ? item : item.name) : []; }
        setter(processedData);
      } catch (error) { console.error(`fetchOptions: Error fetching from ${url}`, error); toast.error(`Error loading data from API.\n${error instanceof Error ? error.message : String(error)}`); }
    },
    [accessToken]
  );
  useEffect(() => { if (isOpen && accessToken) { setDatabases([]); fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/databases`, setDatabases); } }, [isOpen, accessToken, fetchOptions]);
  useEffect(() => { if (database && accessToken) { setSchemas([]); setSchema(''); fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/schemas/${database}`, setSchemas); } }, [database, accessToken, fetchOptions]);
  useEffect(() => { if (database && schema && accessToken) { setTables([]); setTable(''); fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/tables/${database}/${schema}`, setTables); } }, [database, schema, accessToken, fetchOptions]);
  useEffect(() => { if (database && schema && table && accessToken) { setColumnsList([]); setColumns(initialData?.columns || []); fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/get_table_columns/?database_name=${database}&schema_name=${schema}&table_name=${table}`, setColumnsList); } }, [database, schema, table, accessToken, fetchOptions, initialData]);
  const handleSave = () => { onSave({ database, schema, table, columns: columns.join(', ') }); onClose(); };
  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Source</h2>
      <select className="w-full border px-3 py-2 rounded" value={database} onChange={(e) => setDatabase(e.target.value)}><option value="">Select Database</option>{databases.map(db => <option key={db} value={db}>{db}</option>)}</select>
      <select className="w-full border px-3 py-2 rounded" value={schema} onChange={(e) => setSchema(e.target.value)}><option value="">Select Schema</option>{schemas.map(s => <option key={s} value={s}>{s}</option>)}</select>
      <select className="w-full border px-3 py-2 rounded" value={table} onChange={(e) => setTable(e.target.value)}><option value="">Select Table</option>{tables.map(t => <option key={t} value={t}>{t}</option>)}</select>
      <label className="block text-sm font-medium text-gray-700 mt-2">Select Columns (Hold Ctrl/Cmd to select multiple)</label>
      <select multiple className="w-full border px-3 py-2 rounded h-24" value={columns} onChange={(e) => setColumns(Array.from(e.target.selectedOptions, o => o.value))}>{columnsList.map(col => <option key={col} value={col}>{col}</option>)}</select>
      <div className="flex justify-end mt-4"><button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button></div>
    </Modal>
  );
};

const JoinConfigModal = ({ isOpen, onClose, onSave, initialData, availableNodes, edges, onDelete, nodeId, getAllOutputColumnsOfNode, accessToken }: any) => {
  const [leftStep, setLeftStep] = useState(initialData?.left_step || '');
  const [rightStep, setRightStep] = useState(initialData?.right_step || '');
  const [leftKey, setLeftKey] = useState(initialData?.left_key || '');
  const [rightKey, setRightKey] = useState(initialData?.right_key || '');
  const [joinType, setJoinType] = useState(initialData?.join_type || 'INNER');
  const [leftColumns, setLeftColumns] = useState<string[]>(initialData?.left_columns || []);
  const [rightColumns, setRightColumns] = useState<string[]>(initialData?.right_columns || []);
  const [leftInputCols, setLeftInputCols] = useState<string[]>([]);
  const [rightInputCols, setRightInputCols] = useState<string[]>([]);
  useEffect(() => {
    if (isOpen && initialData.nodeId) {
      const incomingEdges = edges.filter((edge: Edge) => edge.target === initialData.nodeId);
      const leftEdge = incomingEdges.find((edge: Edge) => edge.targetHandle === 'input1');
      const rightEdge = incomingEdges.find((edge: Edge) => edge.targetHandle === 'input2');
      const nodeIdToStepMap = new Map<string, number>();
      availableNodes.forEach((node: Node, idx: number) => nodeIdToStepMap.set(node.id, idx + 1));
      setLeftInputCols(getAllOutputColumnsOfNode(availableNodes.find((n: Node) => n.id === leftEdge?.source), availableNodes, edges));
      setRightInputCols(getAllOutputColumnsOfNode(availableNodes.find((n: Node) => n.id === rightEdge?.source), availableNodes, edges));
      if (leftEdge) setLeftStep(nodeIdToStepMap.get(leftEdge.source));
      if (rightEdge) setRightStep(nodeIdToStepMap.get(rightEdge.source));
    }
  }, [isOpen, initialData, availableNodes, edges, getAllOutputColumnsOfNode]);
  useEffect(() => { if (isOpen && initialData) { setLeftKey(initialData.left_key || ''); setRightKey(initialData.right_key || ''); setJoinType(initialData.join_type || 'INNER'); setLeftColumns(initialData.left_columns || []); setRightColumns(initialData.right_columns || []); } }, [isOpen, initialData]);
  const handleSave = () => { onSave({ left_step: leftStep, right_step: rightStep, left_key: leftKey, right_key: rightKey, join_type: joinType, left_columns: leftColumns, right_columns: rightColumns }); onClose(); };
  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Join</h2>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-sm font-medium text-gray-700">Left Key (from connected source)</label><select className="w-full border px-3 py-2 rounded" value={leftKey} onChange={(e) => setLeftKey(e.target.value)}><option value="">Select Left Key</option>{leftInputCols.map(col => <option key={col} value={col}>{col}</option>)}</select></div>
        <div><label className="block text-sm font-medium text-gray-700">Right Key (from connected source)</label><select className="w-full border px-3 py-2 rounded" value={rightKey} onChange={(e) => setRightKey(e.target.value)}><option value="">Select Right Key</option>{rightInputCols.map(col => <option key={col} value={col}>{col}</option>)}</select></div>
      </div>
      <div><label className="block text-sm font-medium text-gray-700">Join Type</label><select className="w-full border px-3 py-2 rounded" value={joinType} onChange={(e) => setJoinType(e.target.value)}><option value="INNER">INNER</option><option value="LEFT">LEFT</option><option value="RIGHT">RIGHT</option><option value="FULL">FULL</option></select></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-sm font-medium text-gray-700">Left Columns (to output)</label><select multiple className="w-full border px-3 py-2 rounded h-24" value={leftColumns} onChange={(e) => setLeftColumns(Array.from(e.target.selectedOptions, o => o.value))}>{leftInputCols.map(col => <option key={col} value={col}>{col}</option>)}</select></div>
        <div><label className="block text-sm font-medium text-gray-700">Right Columns (to output)</label><select multiple className="w-full border px-3 py-2 rounded h-24" value={rightColumns} onChange={(e) => setRightColumns(Array.from(e.target.selectedOptions, o => o.value))}>{rightInputCols.map(col => <option key={col} value={col}>{col}</option>)}</select></div>
      </div>
      <div className="flex justify-end mt-4"><button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button></div>
    </Modal>
  );
};

const AggregateKpiConfigModal = ({ isOpen, onClose, onSave, initialData, availableInputColumns, onDelete, nodeId }: any) => {
  const [columns, setColumns] = useState<string[]>(initialData?.columns || []); // Columns TO AGGREGATE
  const [aggType, setAggType] = useState(initialData?.agg_type || 'SUM');
  const [kpiName, setKpiName] = useState(initialData?.kpi_name || '');
  useEffect(() => { if (isOpen && initialData) { setColumns(initialData.columns || []); setAggType(initialData.agg_type || 'SUM'); setKpiName(initialData.kpi_name || ''); } }, [isOpen, initialData]);
  const handleSave = () => { onSave({ columns, agg_type: aggType, kpi_name: kpiName }); onClose(); };
  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Aggregate KPI</h2>
      <div><label className="block text-sm font-medium text-gray-700">Columns to Aggregate</label><select multiple className="w-full border px-3 py-2 rounded h-24" value={columns} onChange={(e) => setColumns(Array.from(e.target.selectedOptions, o => o.value))}>{availableInputColumns.map((col: string) => <option key={col} value={col}>{col}</option>)}</select></div>
      <div><label className="block text-sm font-medium text-gray-700">Aggregation Type</label><select className="w-full border px-3 py-2 rounded" value={aggType} onChange={(e) => setAggType(e.target.value)}><option value="SUM">SUM</option><option value="AVG">AVG</option><option value="COUNT">COUNT</option><option value="MIN">MIN</option><option value="MAX">MAX</option></select></div>
      <div><label className="block text-sm font-medium text-gray-700">New KPI Name</label><input type="text" className="w-full border px-3 py-2 rounded" value={kpiName} onChange={(e) => setKpiName(e.target.value)} /></div>
      <div className="flex justify-end mt-4"><button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button></div>
    </Modal>
  );
};

const SortConfigModal = ({ isOpen, onClose, onSave, initialData, availableInputColumns, onDelete, nodeId }: any) => {
  const [sortColumn, setSortColumn] = useState(initialData?.sort_column || '');
  const [sortOrder, setSortOrder] = useState(initialData?.sort_order || 'ASC');
  useEffect(() => { if (isOpen && initialData) { setSortColumn(initialData.sort_column || ''); setSortOrder(initialData.sort_order || 'ASC'); } }, [isOpen, initialData]);
  const handleSave = () => { onSave({ sort_column: sortColumn, sort_order: sortOrder }); onClose(); };
  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Sort</h2>
      <div><label className="block text-sm font-medium text-gray-700">Sort Column</label><select className="w-full border px-3 py-2 rounded" value={sortColumn} onChange={(e) => setSortColumn(e.target.value)}><option value="">Select Column</option>{availableInputColumns.map((col: string) => <option key={col} value={col}>{col}</option>)}</select></div>
      <div><label className="block text-sm font-medium text-gray-700">Sort Order</label><select className="w-full border px-3 py-2 rounded" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}><option value="ASC">ASC</option><option value="DESC">DESC</option></select></div>
      <div className="flex justify-end mt-4"><button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button></div>
    </Modal>
  );
};

const DestinationConfigModal = ({ isOpen, onClose, onSave, initialData, availableInputColumns, accessToken, onDelete, nodeId }: any) => {
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [database, setDatabase] = useState(initialData?.database || '');
  const [schema, setSchema] = useState(initialData?.schema || '');
  const [destinationTable, setDestinationTable] = useState(initialData?.destination_table || '');
  const [destinationColumns, setDestinationColumns] = useState<string[]>(initialData?.columns || []);
  const fetchOptions = useCallback(async (url: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (!accessToken) { console.warn("DestinationConfigModal: No access token available for API calls. Please log in."); return; }
    try {
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', }, });
      if (!response.ok) { const errorText = await response.text(); throw new Error(`HTTP error! Status: ${response.status}. Message: ${errorText}`); }
      const result = await response.json() as any;
      let processedData: string[] = [];
      if (url.includes('/explore-design/guided/databases') || url.includes('/explore-design/guided/schemas/') || url.includes('/explore-design/guided/tables/')) {
        const key = url.includes('/explore-design/guided/databases') ? 'databases' : url.includes('/explore-design/guided/schemas/') ? 'schemas' : 'tables';
        const raw = result[key] || result;
        processedData = Array.isArray(raw) ? raw.map((item: any) => typeof item === 'string' ? item : item.name) : [];
      } else if (url.includes('/explore-design/guided/get_table_columns')) {
        const raw = result.columns || result;
        processedData = Array.isArray(raw) ? raw.map((item: any) => typeof item === 'string' ? item : item.name) : [];
      } else { processedData = Array.isArray(result) ? result.map((item: any) => String(item)) : []; }
      setter(processedData);
    } catch (error) { console.error(`DestinationConfigModal: Error fetching data from ${url}:`, error); toast.error(`Destination Configuration Error: Failed to load data. Check console for details. Error: ${error instanceof Error ? error.message : String(error)}`); }
  }, [accessToken]);
  useEffect(() => { if (isOpen && accessToken) { setDatabases([]); fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/databases`, setDatabases); } }, [isOpen, accessToken, fetchOptions]);
  useEffect(() => { if (database && accessToken) { setSchemas([]); setSchema(''); fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/schemas/${database}`, setSchemas); } }, [database, accessToken, fetchOptions]);
  useEffect(() => { if (database && schema && accessToken) { setTables([]); setDestinationTable(''); fetchOptions(`${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/tables/${database}/${schema}`, setTables); } }, [database, schema, accessToken, fetchOptions]);
  useEffect(() => {
    if (isOpen && initialData) {
      setDatabase(initialData.database || '');
      setSchema(initialData.schema || '');
      setDestinationTable(initialData.destination_table || '');
      const initCols = Array.isArray(initialData.columns) ? initialData.columns : [];
      setDestinationColumns(initCols);
    }
  }, [isOpen, initialData]);
  // If no columns selected yet, default to all available input columns
  useEffect(() => {
    if (isOpen) {
      const current = Array.isArray(initialData?.columns) ? initialData.columns : [];
      if ((!current || current.length === 0) && Array.isArray(availableInputColumns)) {
        setDestinationColumns(availableInputColumns as string[]);
      }
    }
  }, [isOpen, availableInputColumns, initialData]);
  const handleSave = () => { onSave({ database, schema, destination_table: destinationTable, columns: destinationColumns }); onClose(); };
  return (
    <Modal isOpen={isOpen} onClose={onClose} onDelete={onDelete} nodeId={nodeId}>
      <h2 className="text-lg font-bold">Configure Destination</h2>
      <select className="w-full border px-3 py-2 rounded" value={database} onChange={(e) => setDatabase(e.target.value)}><option value="">Select Database</option>{databases.map(db => <option key={db} value={db}>{db}</option>)}</select>
      <select className="w-full border px-3 py-2 rounded" value={schema} onChange={(e) => setSchema(e.target.value)}><option value="">Select Schema</option>{schemas.map(s => <option key={s} value={s}>{s}</option>)}</select>
      <div>
        <label className="block text-sm font-medium text-gray-700">table_name</label>
        <input
          type="text"
          className="w-full border px-3 py-2 rounded"
          value={destinationTable}
          onChange={(e) => setDestinationTable(e.target.value)}
          placeholder="Enter table name"
        />
      </div>
      <label className="block text-sm font-medium text-gray-700 mt-2">Destination Columns (Select from available)</label>
      <select multiple className="w-full border px-3 py-2 rounded h-24" value={destinationColumns} onChange={(e) => setDestinationColumns(Array.from(e.target.selectedOptions, o => o.value))}>{availableInputColumns.map((col: string) => <option key={col} value={col}>{col}</option>)}</select>
      <div className="flex justify-end mt-4"><button onClick={handleSave} className="px-4 py-1 bg-blue-600 text-white rounded">Save</button></div>
    </Modal>
  );
};


interface WorkflowBuilderProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  initialWorkflowName: string;
  // onWorkflowNameChange: (name: string) => void; // Removed, managed by HomePage
  initialSelectedCronSchedule: string;
  accessToken: string | null;
  refreshWorkflows: () => void;
  initialIdCounter: number; 
  onSetIdCounter: (count: number) => void; 
  setIsWorkflowSaved: React.Dispatch<React.SetStateAction<boolean>>;
  // Sync internal graph up to parent so Save can see it
  setParentNodes?: (nodes: Node[]) => void;
  setParentEdges?: (edges: Edge[]) => void;
}

export default function WorkflowBuilder({
  initialNodes = [], 
  initialEdges = [], 
  // initialWorkflowName, // Not directly used in Workflow.tsx's JSX anymore
  // onWorkflowNameChange, // Not directly used in Workflow.tsx's JSX anymore
  // initialSelectedCronSchedule, // Not directly used in Workflow.tsx's JSX anymore
  accessToken, // Still used for modals
  // refreshWorkflows, // Not directly used in Workflow.tsx's JSX anymore
  initialIdCounter, 
  onSetIdCounter, 
  setIsWorkflowSaved, // Still used for setting save status
  setParentNodes,
  setParentEdges,
}: WorkflowBuilderProps) {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesState] = useEdgesState(initialEdges);

  const [showDropNullsModal, setShowDropNullsModal] = useState(false);
  const [showDropDuplicatesModal, setShowDropDuplicatesModal] = useState(false);
  const [showNormalizeModal, setShowNormalizeModal] = useState(false);
  
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null); 
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const [showScheduleDropdown, setShowScheduleDropdown] = useState(false); // Can likely remove this state, not used in Workflow.tsx directly

  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showAggregateKpiModal, setShowAggregateKpiModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [availableInputColumns, setAvailableInputColumns] = useState<string[]>([]);

  // Removed useReactFlow() from here. fitView is used via reactFlowInstance in useEffect.


  // This useEffect initializes the local 'id' counter and informs the parent.
  useEffect(() => {
    id = initialIdCounter; 
    if (onSetIdCounter) { 
        onSetIdCounter(id); 
    }
  }, [initialIdCounter, onSetIdCounter]);


  // Refs to avoid ping-pong updates when syncing with parent
  const suppressNodePropagationRef = useRef(false);
  const suppressEdgePropagationRef = useRef(false);
  const prevInitialNodesRef = useRef<Node[] | null>(null);
  const prevInitialEdgesRef = useRef<Edge[] | null>(null);

  // Update nodes when parent-provided initialNodes reference changes
  useEffect(() => {
    if (prevInitialNodesRef.current !== initialNodes) {
      suppressNodePropagationRef.current = true;
      setNodes(initialNodes);
      prevInitialNodesRef.current = initialNodes;
      // Fit view after applying new nodes
      if (reactFlowInstance && initialNodes.length > 0) {
        const timeoutId = setTimeout(() => {
          reactFlowInstance.fitView({ padding: 0.2 });
        }, 50);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [initialNodes, setNodes, reactFlowInstance]);

  // Update edges when parent-provided initialEdges reference changes
  useEffect(() => {
    if (prevInitialEdgesRef.current !== initialEdges) {
      suppressEdgePropagationRef.current = true;
      setEdges(initialEdges);
      prevInitialEdgesRef.current = initialEdges;
    }
  }, [initialEdges, setEdges]);

  // Propagate current nodes to parent, avoiding echo from props-driven updates
  useEffect(() => {
    if (suppressNodePropagationRef.current) {
      suppressNodePropagationRef.current = false;
      return;
    }
    if (setParentNodes) setParentNodes(nodes);
  }, [nodes, setParentNodes]);

  useEffect(() => {
    if (suppressEdgePropagationRef.current) {
      suppressEdgePropagationRef.current = false;
      return;
    }
    if (setParentEdges) setParentEdges(edges);
  }, [edges, setParentEdges]);


  const onConnect: OnConnect = useCallback(
    (params: Edge | Connection) => {
      setIsWorkflowSaved(false); // Prop setter
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges, setIsWorkflowSaved]
  );

  const handleDragStart = (event: React.DragEvent, nodeType: string) => {
    // This handleDragStart is for the ReactFlow canvas itself, not the palette
    // The palette now lives in WorkflowHomePage and handles its own dragStart
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

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
      setIsWorkflowSaved(false); // Prop setter
    },
    [reactFlowInstance, setNodes, setIsWorkflowSaved]
  );

  const getAllOutputColumnsOfNode = useCallback((node: Node | undefined, currentNodes: Node[] = nodes, currentEdges: Edge[] = edges): string[] => {
    if (!node) return [];

    switch (node.type) {
      case 'src':
        return Array.isArray(node.data.columns)
          ? node.data.columns
          : (typeof node.data.columns === 'string'
              ? node.data.columns.split(', ').map((col: string) => col.trim())
              : []);
      case 'join':
        const lc = Array.isArray(node.data.left_columns) ? node.data.left_columns : [];
        const rc = Array.isArray(node.data.right_columns) ? node.data.right_columns : [];
        return Array.from(new Set([...lc, ...rc]));

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
        return Array.from(new Set([...nonAggregatedColumns, ...kpiName].filter(Boolean)));
      case 'sort':
      case 'drop_nulls':
      case 'drop_duplicates':
        const incomingEdgeForPassthrough = currentEdges.find(edge => edge.target === node.id);
        if (incomingEdgeForPassthrough) {
          const sourceNodeForPassthrough = currentNodes.find(n => n.id === incomingEdgeForPassthrough.source);
          return getAllOutputColumnsOfNode(sourceNodeForPassthrough, currentNodes, currentEdges);
        }
        return [];
      case 'normalize':
        const incomingEdgeForNormalize = currentEdges.find(edge => edge.target === node.id);
        let inputColumnsForNormalize: string[] = [];
        if (incomingEdgeForNormalize) {
          const sourceNodeForNormalize = currentNodes.find(n => n.id === incomingEdgeForNormalize.source);
          inputColumnsForNormalize = getAllOutputColumnsOfNode(sourceNodeForNormalize, currentNodes, currentEdges);
        }
        const normalizedOutputColumn = node.data.normalize_type === 'zscore'
          ? node.data.zscore_column_normalized
          : node.data.minmax_column_normalized;
        const targetColumn = node.data.normalize_type === 'zscore' ? node.data.zscore_column : node.data.minmax_column;
        const columnsAfterNormalize = inputColumnsForNormalize.filter(col => col !== targetColumn);
        return Array.from(new Set([...columnsAfterNormalize, normalizedOutputColumn].filter(Boolean)));
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

    const targetNode = nodes.find(n => n.id === targetNodeId);

    if (targetNode?.type === 'join') {
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
    if (node.type === 'src') {
      inputCols = [];
    } else {
      inputCols = getOutputColumnsOfPreviousStep(node.id);
    }
    setAvailableInputColumns(inputCols);

    switch (node.type) {
      case 'src': setShowSourceModal(true); break;
      case 'join':
        setShowJoinModal(true); break;
      case 'aggregate_kpi': setShowAggregateKpiModal(true); break;
      case 'sort': setShowSortModal(true); break;
      case 'destination': setShowDestinationModal(true); break;
      case 'drop_nulls': setShowDropNullsModal(true); break;
      case 'drop_duplicates': setShowDropDuplicatesModal(true); break;
      case 'normalize': setShowNormalizeModal(true); break;
      default: break;
    }
  }, [getOutputColumnsOfPreviousStep]);

  const updateNodeData = (data: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...data } } : n))
    );
    setIsWorkflowSaved(false); // Prop setter
    handleCloseModals();
  };

  const handleDeleteNode = useCallback((nodeIdToDelete: string) => {
    if (window.confirm("Are you sure you want to delete this node and its connections?")) {
      setNodes((nds) => nds.filter((node) => node.id !== nodeIdToDelete));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeIdToDelete && edge.target !== nodeIdToDelete));
      setIsWorkflowSaved(false); // Prop setter
      handleCloseModals();
      toast.success("Node and its connections deleted successfully!");
    }
  }, [setNodes, setEdges, setIsWorkflowSaved]);


  const handleCloseModals = () => {
    setShowSourceModal(false);
    setShowJoinModal(false);
    setShowAggregateKpiModal(false);
    setShowSortModal(false);
    setShowDestinationModal(false);
    setShowDropNullsModal(false);
    setShowDropDuplicatesModal(false);
    setShowNormalizeModal(false);
    setSelectedNode(null);
    setAvailableInputColumns([]);
    // setShowScheduleDropdown(false); // This state is no longer managed in Workflow.tsx
  };

  return (
    <ReactFlowProvider>
      {/* ReactFlow canvas itself */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesState}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        className="react-flow-canvas"
        onNodeClick={onNodeClick}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls />
        <MiniMap />
      </ReactFlow>

      {/* Configuration Modals (remain in WorkflowBuilder because they depend on selectedNode state) */}
      {showSourceModal && selectedNode && (
        <SourceConfigModal
          isOpen={showSourceModal}
          onClose={handleCloseModals}
          onSave={updateNodeData}
          initialData={selectedNode.data}
          accessToken={accessToken}
          onDelete={handleDeleteNode}
          nodeId={selectedNode.id}
        />
      )}
      {showJoinModal && selectedNode && (
        <JoinConfigModal
          isOpen={showJoinModal}
          onClose={handleCloseModals}
          onSave={updateNodeData}
          initialData={{ ...selectedNode.data, nodeId: selectedNode.id }}
          availableNodes={nodes}
          edges={edges}
          onDelete={handleDeleteNode}
          nodeId={selectedNode.id}
          getAllOutputColumnsOfNode={getAllOutputColumnsOfNode}
          accessToken={accessToken}
        />
      )}
      {showAggregateKpiModal && selectedNode && (
        <AggregateKpiConfigModal
          isOpen={showAggregateKpiModal}
          onClose={handleCloseModals}
          onSave={updateNodeData}
          initialData={selectedNode.data}
          availableInputColumns={availableInputColumns}
          onDelete={handleDeleteNode}
          nodeId={selectedNode.id}
        />
      )}
      {showSortModal && selectedNode && (
        <SortConfigModal
          isOpen={showSortModal}
          onClose={handleCloseModals}
          onSave={updateNodeData}
          initialData={selectedNode.data}
          availableInputColumns={availableInputColumns}
          onDelete={handleDeleteNode}
          nodeId={selectedNode.id}
        />
      )}
      {showDestinationModal && selectedNode && (
        <DestinationConfigModal
          isOpen={showDestinationModal}
          onClose={handleCloseModals}
          onSave={updateNodeData}
          initialData={selectedNode.data}
          availableInputColumns={availableInputColumns}
          accessToken={accessToken}
          onDelete={handleDeleteNode}
          nodeId={selectedNode.id}
        />
      )}
      {showDropNullsModal && selectedNode && (
        <DropNullsConfigModal
          isOpen={showDropNullsModal}
          onClose={handleCloseModals}
          onSave={updateNodeData}
          initialData={selectedNode.data}
          availableInputColumns={availableInputColumns}
          onDelete={handleDeleteNode}
          nodeId={selectedNode.id}
        />
      )}
      {showNormalizeModal && selectedNode && (
        <NormalizeConfigModal
          isOpen={showNormalizeModal}
          onClose={handleCloseModals}
          onSave={updateNodeData}
          initialData={selectedNode.data}
          availableInputColumns={availableInputColumns}
          onDelete={handleDeleteNode}
          nodeId={selectedNode.id}
        />
      )}
      <Toaster />
    </ReactFlowProvider>
  );
}
