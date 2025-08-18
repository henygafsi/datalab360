'use client';

import React, { useEffect, useState, useCallback, memo } from 'react';
import ReactFlow, {
    ReactFlowProvider, Background, BackgroundVariant, MiniMap, Controls,
    useNodesState, useEdgesState, addEdge, Connection, Edge, Node,
    Handle, Position, ConnectionLineType, MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';

// --- Interface Definitions ---
interface TableSelection { database: string; schema: string; table: string; }
interface ColumnDetail { name: string; data_type: string; is_primary_key?: boolean; is_required_for_mapping?: boolean; }
interface ColumnAttributes { is_nullable: boolean; is_primary_key: boolean; is_foreign_key: boolean; is_required_for_mapping: boolean; data_type?: string; }
interface ColumnMapping { source_column: string; target_column: string; data_type: string; source_table_key: string; }
interface MappingDetail {
    project_id: string | null;
    source_database: string; source_schema: string; source_table: string;
    target_database: string; target_schema: string; target_table: string;
    column_mappings: ColumnMapping[];
    new_target_columns: Array<{ name: string; type: string; nullable: boolean }>;
    primary_keys?: { source: { [tableKey: string]: string[] }; target: string[] };
    column_attributes?: { [tableName: string]: { [columnName: string]: ColumnAttributes } };
}
interface Step3Props {
    onNext: () => void; onBack: () => void; mappingData: MappingDetail;
    updateMappingData: (newData: Partial<MappingDetail>) => void;
    selectedSourceTables: TableSelection[]; selectedTargetTable: TableSelection | null;
    projectId: string; username: string;
}
interface TableNodeData { label: string; tableKey: string; columns: ColumnDetail[]; isSource: boolean; }

// --- Custom Node Component (No changes needed here) ---
const TableNode: React.FC<{ data: TableNodeData }> = memo(({ data }) => {
    const { label: tableName, columns, isSource } = data;
    const [searchTerm, setSearchTerm] = useState('');
    const [searchVisible, setSearchVisible] = useState(false);

    const filteredColumns = columns.filter(col =>
        col.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Card className="w-96 shadow-xl rounded-lg overflow-hidden border-2 border-slate-300 bg-slate-50">
            <CardHeader className="p-2 border-b bg-slate-100 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold truncate">
                    <Badge variant={isSource ? "secondary" : "default"}>{isSource ? 'Source' : 'Target'}</Badge> {tableName}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setSearchVisible(!searchVisible)} className="h-7 w-7">
                    <Search className="h-4 w-4" />
                </Button>
            </CardHeader>
            {searchVisible && (
                <div className="p-2 border-b">
                    <Input
                        placeholder="Search columns..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-8"
                    />
                </div>
            )}
            <CardContent className="p-1 max-h-96 overflow-y-auto">
                <ul className="space-y-1 p-1">
                    {filteredColumns.map((col) => (
                        <li key={col.name} className="relative flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-slate-200/50 transition-colors">
                            {isSource && <Handle type="source" position={Position.Right} id={col.name} className="!bg-blue-500" />}
                            {!isSource && <Handle type="target" position={Position.Left} id={col.name} className="!bg-green-500" />}
                            <Label className="flex-grow flex items-center justify-between cursor-default">
                                <span className="font-medium text-slate-800 text-sm truncate">{col.name}</span>
                                <span className="text-xs text-slate-500 ml-2">({col.data_type})</span>
                            </Label>
                            <div className="flex-shrink-0 ml-2 flex items-center gap-1">
                                {col.is_primary_key && <Badge variant="destructive" className="px-1 py-0.5 text-xs">PK</Badge>}
                                {col.is_required_for_mapping && !col.is_primary_key && <Badge variant="outline" className="px-1 py-0.5 text-xs">Req</Badge>}
                            </div>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
});
TableNode.displayName = 'TableNode';

const nodeTypes = { customTableNode: TableNode };

// --- Main Step 3 Component ---
const Step3TablesRelations: React.FC<Step3Props> = ({
    onNext, onBack, mappingData, updateMappingData,
    selectedSourceTables, selectedTargetTable,
}) => {
    const { toast } = useToast();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [allColumnsDataMap, setAllColumnsDataMap] = useState<Record<string, Record<string, ColumnDetail>>>({});
    
    // Determine if the component has the necessary data to render the graph
    const isDataReady = React.useMemo(() => {
        if (!selectedTargetTable || !selectedSourceTables.length || !mappingData.column_attributes) {
            return false;
        }
        const requiredTableNames = [...selectedSourceTables.map(t => t.table), selectedTargetTable.table];
        const availableTableNames = Object.keys(mappingData.column_attributes);
        return requiredTableNames.every(name => availableTableNames.includes(name));
    }, [mappingData, selectedSourceTables, selectedTargetTable]);


    useEffect(() => {
        // This effect will only build the graph if the data is actually ready.
        // It will re-run automatically when `isDataReady` becomes true.
        if (!isDataReady) {
            setNodes([]); // Clear nodes if data is not ready
            return;
        }

        console.log("Step3: All necessary data is available. Building graph.");
        const tempColumnsMap: Record<string, Record<string, ColumnDetail>> = {};
        const initialNodes: Node[] = [];

        const processTable = (table: TableSelection, isSource: boolean): { tableKey: string; columns: ColumnDetail[] } => {
            const tableKey = `${table.database}.${table.schema}.${table.table}`;
            const tableAttrs = mappingData.column_attributes?.[table.table] || {};
            
            if (Object.keys(tableAttrs).length === 0) {
                console.error(`No column attributes found for table: ${table.table}`);
                return { tableKey, columns: [] };
            }

            const pkSourceAttrs = mappingData.primary_keys?.source || {};
            const pkTargetAttrs = mappingData.primary_keys?.target || [];

            const columns: ColumnDetail[] = Object.entries(tableAttrs).map(([colName, attrs]) => {
                const isPrimaryKey = isSource 
                    ? (pkSourceAttrs[tableKey] || []).includes(colName) 
                    : pkTargetAttrs.includes(colName);
                return { 
                    name: colName, 
                    data_type: attrs.data_type || 'unknown', 
                    is_primary_key: isPrimaryKey, 
                    is_required_for_mapping: attrs.is_required_for_mapping || isPrimaryKey 
                };
            });

            columns.forEach(c => {
                if (!tempColumnsMap[tableKey]) tempColumnsMap[tableKey] = {};
                tempColumnsMap[tableKey][c.name] = c;
            });

            return { tableKey, columns };
        };

        selectedSourceTables.forEach((table, index) => {
            const { tableKey, columns } = processTable(table, true);
            if (columns.length > 0) {
                initialNodes.push({ id: tableKey, type: 'customTableNode', position: { x: 50, y: index * 450 }, data: { label: table.table, tableKey, columns, isSource: true } });
            }
        });

        if (selectedTargetTable) {
            const { tableKey, columns } = processTable(selectedTargetTable, false);
            if (columns.length > 0) {
                initialNodes.push({ id: tableKey, type: 'customTableNode', position: { x: 600, y: 50 }, data: { label: selectedTargetTable.table, tableKey, columns, isSource: false } });
            }
        }
        
        setAllColumnsDataMap(tempColumnsMap);
        setNodes(initialNodes);

        const initialEdges: Edge[] = (mappingData.column_mappings || []).map((m, i) => ({
            id: `edge-${i}`, source: m.source_table_key, sourceHandle: m.source_column,
            target: selectedTargetTable ? `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}` : '',
            targetHandle: m.target_column, type: ConnectionLineType.SmoothStep,
            style: { stroke: '#60a5fa', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#60a5fa' },
        }));
        setEdges(initialEdges);

    }, [isDataReady, mappingData, selectedSourceTables, selectedTargetTable]); // Re-run when data readiness changes

    const onConnect = useCallback((connection: Connection) => {
        const { source, sourceHandle, target, targetHandle } = connection;
        if (!source || !sourceHandle || !target || !targetHandle) return;

        const targetColumnInfo = allColumnsDataMap[target]?.[targetHandle];
        if (!targetColumnInfo) return;

        const isTargetPK = targetColumnInfo.is_primary_key;
        const isTargetAlreadyMapped = edges.some(edge => edge.target === target && edge.targetHandle === targetHandle);

        if (isTargetAlreadyMapped && !isTargetPK) {
            toast({
                title: "Invalid Mapping",
                description: "A target column that is not a Primary Key can only be mapped once.",
                variant: "destructive",
            });
            return;
        }

        const sourceColumnInfo = allColumnsDataMap[source]?.[sourceHandle];
        if (!sourceColumnInfo) return;

        const newMapping: ColumnMapping = {
            source_table_key: source,
            source_column: sourceHandle,
            target_column: targetHandle,
            data_type: sourceColumnInfo.data_type,
        };
        
        updateMappingData({ column_mappings: [...(mappingData.column_mappings || []), newMapping] });
        setEdges((eds) => addEdge({ ...connection, type: ConnectionLineType.SmoothStep, style: { stroke: '#60a5fa', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#60a5fa' } }, eds));
    }, [edges, allColumnsDataMap, mappingData.column_mappings, updateMappingData, toast]);

    const onEdgesDelete = useCallback((edgesToDelete: Edge[]) => {
        const updatedMappings = (mappingData.column_mappings || []).filter(mapping => {
            return !edgesToDelete.some(edge => 
                edge.source === mapping.source_table_key &&
                edge.sourceHandle === mapping.source_column &&
                edge.targetHandle === mapping.target_column
            );
        });
        updateMappingData({ column_mappings: updatedMappings });
    }, [mappingData.column_mappings, updateMappingData]);

    return (
        <Card className="p-4">
            <CardHeader>
                <CardTitle>Step 3: Interactive Column Mapping</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Drag from a source column to a target column to create a mapping.
                </p>
            </CardHeader>
            <CardContent>
                <div style={{ width: '100%', height: '700px', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
                    {!isDataReady ? (
                        <div className="flex items-center justify-center h-full text-slate-500">
                            <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                            <span>Waiting for column data from previous step...</span>
                        </div>
                    ) : (
                        <ReactFlowProvider>
                            <ReactFlow
                                nodes={nodes} edges={edges} onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange} onConnect={onConnect}
                                onEdgesDelete={onEdgesDelete}
                                nodeTypes={nodeTypes} fitView
                            >
                                <Controls />
                                <MiniMap />
                                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                            </ReactFlow>
                        </ReactFlowProvider>
                    )}
                </div>
                <div className="flex justify-between gap-2 mt-6">
                    <Button variant="outline" onClick={onBack}>Back</Button>
                    <Button onClick={onNext}>Next</Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step3TablesRelations;