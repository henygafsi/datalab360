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
import { Loader2, Search, TestTube, AlertCircle, CheckCircle, X } from 'lucide-react';
import { postMapping } from '@/app/services/mapping/postMapping';

// --- Interface Definitions ---
interface TableSelection { database: string; schema: string; table: string; }
interface ColumnDetail { name: string; data_type: string; is_primary_key?: boolean; is_required_for_mapping?: boolean; }
interface ColumnAttributes { is_nullable: boolean; is_primary_key: boolean; is_foreign_key: boolean; is_required_for_mapping: boolean; data_type?: string; }
interface ColumnMapping { source_column: string; target_column: string; data_type: string; source_table_key: string; target_table_key?: string; }
interface MappingDetail {
    project_id: string | null;
    source_database: string; source_schema: string; source_table: string;
    target_database: string; target_schema: string; target_table: string;
    column_mappings: ColumnMapping[];
    new_target_columns: Array<{ name: string; type: string; nullable: boolean }>;
    primary_keys?: { source: { [tableKey: string]: string[] }; target: string[] };
    column_attributes?: { [tableKey: string]: { [columnName: string]: ColumnAttributes } };
    groups?: Array<{ sources: TableSelection[]; target: TableSelection | null }>;
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
                            {isSource && <Handle type="source" position={Position.Right} id={col.name} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white !shadow-md hover:!bg-blue-600 !translate-x-1/2" />}
                            {!isSource && <Handle type="target" position={Position.Left} id={col.name} className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !shadow-md hover:!bg-green-600 !-translate-x-1/2" />}
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
    const [isTesting, setIsTesting] = useState(false);
    const [testResults, setTestResults] = useState<{ errors: string[]; details: any[] } | null>(null);
    const [showAlert, setShowAlert] = useState(false);
    const [alertSeverity, setAlertSeverity] = useState<'error' | 'success'>('error');
    const [alertMessage, setAlertMessage] = useState('');
    
    // Determine if the component has the necessary data to render the graph
    const isDataReady = React.useMemo(() => {
        const hasGroups = Array.isArray(mappingData.groups) && mappingData.groups.length > 0;
        if (hasGroups) {
            return !!mappingData.column_attributes;
        }
        if (!selectedTargetTable || !selectedSourceTables.length || !mappingData.column_attributes) {
            return false;
        }
        const requiredTableKeys = [
            ...selectedSourceTables.map(t => `${t.database}.${t.schema}.${t.table}`),
            `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`,
        ];
        const availableTableKeys = Object.keys(mappingData.column_attributes);
        return requiredTableKeys.every(key => availableTableKeys.includes(key));
    }, [mappingData, selectedSourceTables, selectedTargetTable]);


    useEffect(() => {
        // This effect will only build the graph if the data is actually ready.
        // It will re-run automatically when `isDataReady` becomes true.
        if (!isDataReady) {
            setNodes([]); // Clear nodes if data is not ready
            return;
        }

        const tempColumnsMap: Record<string, Record<string, ColumnDetail>> = {};
        const initialNodes: Node[] = [];

        const processTable = (table: TableSelection, isSource: boolean): { tableKey: string; columns: ColumnDetail[] } => {
            const tableKey = `${table.database}.${table.schema}.${table.table}`;
            const tableAttrs = mappingData.column_attributes?.[tableKey] || {};
            
            if (Object.keys(tableAttrs).length === 0) {
                return { tableKey, columns: [] };
            }

            const pkSourceAttrs = mappingData.primary_keys?.source || {};
            // Prefer per-target-table PKs stored under source map using the target table key.
            // Fallback to legacy global target list if present.
            const pkTargetForThisTable = pkSourceAttrs[tableKey] || (mappingData.primary_keys?.target || []);

            let columns: ColumnDetail[] = Object.entries(tableAttrs).map(([colName, attrs]) => {
                const isPrimaryKey = isSource 
                    ? (pkSourceAttrs[tableKey] || []).includes(colName) 
                    : pkTargetForThisTable.includes(colName);
                return { 
                    name: colName, 
                    data_type: attrs.data_type || 'unknown', 
                    is_primary_key: isPrimaryKey, 
                    is_required_for_mapping: attrs.is_required_for_mapping || isPrimaryKey 
                };
            });

            // Include newly added target columns on the target table node
            if (!isSource && Array.isArray(mappingData.new_target_columns)) {
                const existing = new Set(columns.map(c => c.name));
                mappingData.new_target_columns.forEach(col => {
                    if (!existing.has(col.name)) {
                        columns.push({
                            name: col.name,
                            data_type: col.type || 'unknown',
                            is_primary_key: false,
                            is_required_for_mapping: false,
                        });
                    }
                });
            }

            columns.forEach(c => {
                if (!tempColumnsMap[tableKey]) tempColumnsMap[tableKey] = {};
                tempColumnsMap[tableKey][c.name] = c;
            });

            return { tableKey, columns };
        };

        const groups = (mappingData.groups && mappingData.groups.length > 0)
            ? mappingData.groups
            : [{ sources: selectedSourceTables, target: selectedTargetTable }];
        let yOffset = 0;
        groups.forEach((g, gi) => {
            (g.sources || []).forEach((table, index) => {
                const { tableKey, columns } = processTable(table, true);
                if (columns.length > 0) {
                    initialNodes.push({ id: tableKey, type: 'customTableNode', position: { x: 50, y: yOffset + index * 350 }, data: { label: table.table, tableKey, columns, isSource: true } });
                }
            });
            if (g.target) {
                const { tableKey, columns } = processTable(g.target, false);
                if (columns.length > 0) {
                    initialNodes.push({ id: tableKey, type: 'customTableNode', position: { x: 600, y: yOffset }, data: { label: g.target.table, tableKey, columns, isSource: false } });
                }
            }
            yOffset += 500;
        });
        
        setAllColumnsDataMap(tempColumnsMap);
        setNodes(initialNodes);

        const initialEdges: Edge[] = (mappingData.column_mappings || [])
            .map((m: any, i) => {
                const tgtKey = m.target_table_key || (selectedTargetTable ? `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}` : '');
                if (!tgtKey) return null;
                // Ensure handles exist on both ends to avoid malformed lines
                const sourceHasHandle = !!tempColumnsMap[m.source_table_key]?.[m.source_column];
                const targetHasHandle = !!tempColumnsMap[tgtKey]?.[m.target_column];
                if (!sourceHasHandle || !targetHasHandle) return null;
                return ({ 
                    id: `edge-restored-${i}-${m.source_table_key}-${m.source_column}-${tgtKey}-${m.target_column}`, 
                    source: m.source_table_key, 
                    sourceHandle: m.source_column, 
                    target: tgtKey, 
                    targetHandle: m.target_column, 
                    type: ConnectionLineType.SmoothStep, 
                    deletable: true, 
                    style: { stroke: '#60a5fa', strokeWidth: 2 }, 
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#60a5fa' } 
                });
            })
            .filter(Boolean) as Edge[];

        // Auto-connect PKs by default: connect same-name PKs per group only
        const sourcePkMap = mappingData.primary_keys?.source || {};
        const existingEdgeKeys = new Set(initialEdges.map(e => `${e.source}|${e.sourceHandle}|${e.target}|${e.targetHandle}`));

        const pkAutoEdges: Edge[] = [];
        const pkAutoMappings: ColumnMapping[] = [];

        groups.forEach(g => {
            if (!g.target) return;
            const targetKey = `${g.target.database}.${g.target.schema}.${g.target.table}`;
            const targetPkListForThisTable = sourcePkMap[targetKey] || (mappingData.primary_keys?.target || []);
            (g.sources || []).forEach(src => {
                const srcKey = `${src.database}.${src.schema}.${src.table}`;
                const srcPkList = sourcePkMap[srcKey] || [];
                srcPkList.forEach(pkName => {
                    if (!targetPkListForThisTable.includes(pkName)) return;
                    if (!tempColumnsMap[srcKey]?.[pkName] || !tempColumnsMap[targetKey]?.[pkName]) return;
                            const comboKey = `${srcKey}|${pkName}|${targetKey}|${pkName}`;
                    if (existingEdgeKeys.has(comboKey)) return;
                                existingEdgeKeys.add(comboKey);
                    pkAutoEdges.push({ 
                        id: `edge-pk-auto-${pkAutoEdges.length}-${srcKey}-${pkName}-${targetKey}`, 
                        source: srcKey, 
                        sourceHandle: pkName, 
                        target: targetKey, 
                        targetHandle: pkName, 
                        type: ConnectionLineType.SmoothStep, 
                        deletable: true, 
                        style: { stroke: '#22c55e', strokeWidth: 2 }, 
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' } 
                    });
                                pkAutoMappings.push({ source_table_key: srcKey, source_column: pkName, target_column: pkName, data_type: tempColumnsMap[srcKey]?.[pkName]?.data_type || 'unknown', target_table_key: targetKey } as any);
                    });
                });
            });

        const combinedEdges = [...initialEdges, ...pkAutoEdges];
        // console.log('Step3: Setting edges:', {
            // initialEdges: initialEdges.length,
            // pkAutoEdges: pkAutoEdges.length,
            // combinedEdges: combinedEdges.length,
            // edges: combinedEdges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle }))
        // });
        setEdges(combinedEdges);

        // Sync auto-added PK mappings back to parent mappingData once
        if (pkAutoMappings.length > 0) {
            const existingMapKeys = new Set((mappingData.column_mappings || []).map(m => `${m.source_table_key}|${m.source_column}|${m.target_column}`));
            const newOnes = pkAutoMappings.filter(m => !existingMapKeys.has(`${m.source_table_key}|${m.source_column}|${m.target_column}`));
            if (newOnes.length > 0) {
                updateMappingData({ column_mappings: [...(mappingData.column_mappings || []), ...newOnes] });
            }
        }

    }, [isDataReady, mappingData, selectedSourceTables, selectedTargetTable, setEdges, setNodes, updateMappingData]); // Re-run when data readiness changes

    const onConnect = useCallback((connection: Connection) => {
        const { source, sourceHandle, target, targetHandle } = connection;
        // console.log('Step3: New connection attempt:', { source, sourceHandle, target, targetHandle });
        
        if (!source || !sourceHandle || !target || !targetHandle) {
            // console.log('Step3: Connection rejected - missing required fields');
            return;
        }

        const targetColumnInfo = allColumnsDataMap[target]?.[targetHandle];
        if (!targetColumnInfo) {
            // console.log('Step3: Connection rejected - target column not found in allColumnsDataMap');
            return;
        }

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

        const newMapping: any = {
            source_table_key: source,
            source_column: sourceHandle,
            target_column: targetHandle,
            data_type: sourceColumnInfo.data_type,
            target_table_key: target,
        };
        
        updateMappingData({ column_mappings: [...(mappingData.column_mappings || []), newMapping] });
        setEdges((eds) => addEdge({ 
            ...connection, 
            id: `edge-${Date.now()}-${connection.source}-${connection.target}`,
            type: ConnectionLineType.SmoothStep, 
            style: { stroke: '#60a5fa', strokeWidth: 2 }, 
            markerEnd: { type: MarkerType.ArrowClosed, color: '#60a5fa' },
            deletable: true
        }, eds));
    }, [edges, allColumnsDataMap, mappingData.column_mappings, updateMappingData, toast, setEdges]);

    const onEdgesDelete = useCallback((edgesToDelete: Edge[]) => {
        const updatedMappings = (mappingData.column_mappings || []).filter((mapping: any) => {
            return !edgesToDelete.some(edge => 
                edge.source === mapping.source_table_key &&
                edge.sourceHandle === mapping.source_column &&
                edge.target === (mapping.target_table_key || edge.target) &&
                edge.targetHandle === mapping.target_column
            );
        });
        updateMappingData({ column_mappings: updatedMappings });
    }, [mappingData.column_mappings, updateMappingData]);

    const onEdgeClick = useCallback((_: any, edge: Edge) => {
        // Remove the edge from the visual graph
        setEdges(prev => prev.filter(e => e.id !== edge.id));
        // Update the mapping data to remove the corresponding column mapping
        onEdgesDelete([edge]);
    }, [onEdgesDelete, setEdges]);

    const handleTestMapping = useCallback(async () => {
        if (!mappingData.column_mappings || mappingData.column_mappings.length === 0) {
            toast({
                title: "No Mappings",
                description: "Please create some column mappings before testing.",
                variant: "destructive",
            });
            return;
        }

        if (!mappingData.project_id) {
            toast({
                title: "Missing Project ID",
                description: "Project ID is required for testing mappings.",
                variant: "destructive",
            });
            return;
        }

        setIsTesting(true);
        setTestResults(null);

        try {
            // Group column mappings by table pairs and build the correct payload format
            const tableMappings = new Map<string, {
                source_database: string;
                source_schema: string;
                source_table: string;
                source_columns: string[];
                pk_source: string[];
                target_database: string;
                target_schema: string;
                target_table: string;
                target_columns: string[];
                pk_target: string[];
            }>();

            // Process group-based mappings (multiple source tables to one target table)
            if (mappingData.groups && mappingData.groups.length > 0) {
                // console.log('Step3: Processing group-based mappings:', mappingData.groups);
                
                for (const group of mappingData.groups) {
                    if (!group.target || !group.sources || group.sources.length === 0) {
                        console.warn('Step3: Skipping group with no target or source tables:', group);
                        continue;
                    }
                    
                    const targetKey = `${group.target.database}.${group.target.schema}.${group.target.table}`;
                    const targetPkList = mappingData.primary_keys?.source?.[targetKey] || mappingData.primary_keys?.target || [];
                    
                    // console.log('Step3: Processing group target:', {
                        // targetKey,
                        // targetPks: targetPkList,
                        // groupTarget: group.target
                    // });
                    
                    // Process each source table in this group
                    for (const sourceTable of group.sources) {
                        const sourceKey = `${sourceTable.database}.${sourceTable.schema}.${sourceTable.table}`;
                        const sourcePkList = mappingData.primary_keys?.source?.[sourceKey] || [];
                        const mappingKey = `${sourceKey}->${targetKey}`;
                        
                        // console.log('Step3: Processing source table:', {
                            // sourceKey,
                            // sourcePks: sourcePkList,
                            // sourceTable
                        // });
                        
                        // Get column mappings for this source->target pair
                        const sourceTargetMappings = mappingData.column_mappings?.filter(mapping => 
                            mapping.source_table_key === sourceKey && 
                            mapping.target_table_key === targetKey
                        ) || [];
                        
                        if (sourceTargetMappings.length === 0) {
                            console.warn(`Step3: No column mappings found for ${sourceKey} -> ${targetKey}`);
                            continue;
                        }
                        
                        // Verify columns exist and collect valid mappings
                        const validSourceColumns: string[] = [];
                        const validTargetColumns: string[] = [];
                        
                        for (const mapping of sourceTargetMappings) {
                            const sourceColumnExists = allColumnsDataMap[sourceKey]?.[mapping.source_column];
                            const targetColumnExists = allColumnsDataMap[targetKey]?.[mapping.target_column];
                            
                            if (sourceColumnExists && targetColumnExists) {
                                if (!validSourceColumns.includes(mapping.source_column)) {
                                    validSourceColumns.push(mapping.source_column);
                                }
                                if (!validTargetColumns.includes(mapping.target_column)) {
                                    validTargetColumns.push(mapping.target_column);
                                }
                            } else {
                                console.warn(`Step3: Skipping invalid mapping ${mapping.source_column}->${mapping.target_column} (columns don't exist)`);
                            }
                        }
                        
                        if (validSourceColumns.length === 0 || validTargetColumns.length === 0) {
                            console.warn(`Step3: No valid column mappings for ${sourceKey} -> ${targetKey}`);
                            continue;
                        }
                        
                        // Create mapping entry
                        tableMappings.set(mappingKey, {
                            source_database: sourceTable.database,
                            source_schema: sourceTable.schema,
                            source_table: sourceTable.table,
                            source_columns: validSourceColumns,
                            pk_source: [...sourcePkList],
                            target_database: group.target.database,
                            target_schema: group.target.schema,
                            target_table: group.target.table,
                            target_columns: validTargetColumns,
                            pk_target: [...targetPkList],
                        });
                        
                        // console.log('Step3: Group mapping created:', {
                        //     mappingKey,
                        //     sourceColumns: validSourceColumns,
                        //     targetColumns: validTargetColumns,
                        //     sourcePks: sourcePkList,
                        //     targetPks: targetPkList
                        // });
                    }
                }
            } else {
                // Fallback to old individual mapping processing
                // console.log('Step3: Processing individual column mappings (fallback)');
                
                for (const mapping of mappingData.column_mappings || []) {
                    const targetTableKey = mapping.target_table_key || 
                        `${mappingData.target_database}.${mappingData.target_schema}.${mappingData.target_table}`;
                    
                    const sourceKey = mapping.source_table_key;
                    const targetKey = targetTableKey;
                    const mappingKey = `${sourceKey}->${targetKey}`;

                    // Verify that both source and target columns exist in the column data
                    const sourceColumnExists = allColumnsDataMap[sourceKey]?.[mapping.source_column];
                    const targetColumnExists = allColumnsDataMap[targetKey]?.[mapping.target_column];
                    
                    if (!sourceColumnExists || !targetColumnExists) {
                        console.warn(`Step3: Skipping invalid mapping ${mapping.source_column}->${mapping.target_column} (columns don't exist)`);
                        continue;
                    }

                    if (!tableMappings.has(mappingKey)) {
                        // Get PKs from events like other steps do
                        const sourcePkList = mappingData.primary_keys?.source?.[sourceKey] || [];
                        
                        // For target PKs, try to get from the specific target table's PKs
                        let targetPkList = mappingData.primary_keys?.source?.[targetKey] || [];
                        
                        // If not found in source PKs, try the global target PKs as fallback
                        if (targetPkList.length === 0) {
                            targetPkList = mappingData.primary_keys?.target || [];
                        }
                        
                        // Initialize new table mapping with PKs
                        tableMappings.set(mappingKey, {
                            source_database: mapping.source_table_key.split('.')[0],
                            source_schema: mapping.source_table_key.split('.')[1],
                            source_table: mapping.source_table_key.split('.')[2],
                            source_columns: [],
                            pk_source: [...sourcePkList],
                            target_database: targetTableKey.split('.')[0],
                            target_schema: targetTableKey.split('.')[1],
                            target_table: targetTableKey.split('.')[2],
                            target_columns: [],
                            pk_target: [...targetPkList],
                        });
                    }

                    const tableMapping = tableMappings.get(mappingKey)!;
                    
                    // Add columns if not already present
                    if (!tableMapping.source_columns.includes(mapping.source_column)) {
                        tableMapping.source_columns.push(mapping.source_column);
                    }
                    if (!tableMapping.target_columns.includes(mapping.target_column)) {
                        tableMapping.target_columns.push(mapping.target_column);
                    }
                }
            }

            // Validate that all mappings have PKs and filter out invalid ones
            const finalMappings = Array.from(tableMappings.values())
                .filter(mapping => {
                    // Only include mappings that have both source and target columns
                    const hasValidColumns = mapping.source_columns.length > 0 && mapping.target_columns.length > 0;
                    if (!hasValidColumns) {
                        console.warn(`Step3: Skipping mapping with no columns: ${mapping.source_database}.${mapping.source_schema}.${mapping.source_table} -> ${mapping.target_database}.${mapping.target_schema}.${mapping.target_table}`);
                    }
                    return hasValidColumns;
                })
                .map(mapping => {
                    // Ensure pk_source and pk_target are never empty arrays
                    if (mapping.pk_source.length === 0) {
                        console.warn(`Step3: Empty pk_source for ${mapping.source_database}.${mapping.source_schema}.${mapping.source_table}`);
                    }
                    if (mapping.pk_target.length === 0) {
                        console.warn(`Step3: Empty pk_target for ${mapping.target_database}.${mapping.target_schema}.${mapping.target_table}`);
                    }
                    
                    return {
                        ...mapping,
                        pk_source: mapping.pk_source.length > 0 ? mapping.pk_source : ['NO_PK_DEFINED'],
                        pk_target: mapping.pk_target.length > 0 ? mapping.pk_target : ['NO_PK_DEFINED']
                    };
                });

            // Build the test payload in the old format (for API compatibility)
            // Convert group-based mappings back to individual source->target pairs
            const testPayload = {
                project_id: mappingData.project_id || '',
                mappings: finalMappings.map(mapping => ({
                    source_database: mapping.source_database,
                    source_schema: mapping.source_schema,
                    source_table: mapping.source_table,
                    source_columns: mapping.source_columns,
                    pk_source: mapping.pk_source,
                    target_database: mapping.target_database,
                    target_schema: mapping.target_schema,
                    target_table: mapping.target_table,
                    target_columns: mapping.target_columns,
                    pk_target: mapping.pk_target
                }))
            };

            // console.log('Step3: Available columns for each table:', 
                Object.keys(allColumnsDataMap).reduce((acc, tableKey) => {
                    acc[tableKey] = Object.keys(allColumnsDataMap[tableKey] || {});
                    return acc;
                }, {} as Record<string, string[]>)
            );
            
            // console.log('Step3: Available PKs from events:', {
                // sourcePks: mappingData.primary_keys?.source,
                // targetPks: mappingData.primary_keys?.target,
                // allPks: mappingData.primary_keys
            // });
            
            // console.log('Step3: Final test payload:', JSON.stringify(testPayload, null, 2));

            const result = await postMapping(testPayload);
            
            // Handle the response format from your backend
            if (result && typeof result === 'object' && 'detail' in result) {
                const detail = result.detail as any;
                
                if (detail.status === 'error') {
                    const errors = detail.errors || [];
                    
                    setTestResults({
                        errors: errors,
                        details: detail.details || []
                    });
                    
                    // Show Material-UI Alert with actual error messages
                    setAlertSeverity('error');
                    setAlertMessage(errors.join('; ')); // Show actual error messages
                    setShowAlert(true);
                    
                    // Auto-hide after 8 seconds (longer for reading errors)
                    setTimeout(() => setShowAlert(false), 8000);
                    
                    toast({
                        title: "Mapping Validation Failed",
                        description: `${errors.length} validation errors found`,
                        variant: "destructive",
                    });
                } else {
                    setTestResults({ errors: [], details: [] });
                    
                    // Show success alert
                    setAlertSeverity('success');
                    setAlertMessage('All mappings are valid and ready for deployment!');
                    setShowAlert(true);
                    
                    // Auto-hide after 4 seconds for success
                    setTimeout(() => setShowAlert(false), 8000);
                    
                    toast({
                        title: "Mapping Validation Passed",
                        description: "All mappings are valid and ready for deployment",
                    });
                }
            } else {
                // If the response format is different, assume success
                setTestResults({ errors: [], details: [] });
                toast({
                    title: "Mapping Test Completed",
                    description: "Mapping validation completed successfully",
                });
            }
        } catch (error: any) {
            console.error('Test mapping error:', error);
            console.error('Error response:', error.response?.data);
            
            // Handle different error types
            if (error.response?.status === 400) {
                // Bad Request - show the actual error from backend
                const errorData = error.response?.data;
                if (errorData?.detail?.status === 'error') {
                    const backendErrors = errorData.detail.errors || [];
                    setTestResults({
                        errors: backendErrors,
                        details: errorData.detail.details || []
                    });
                    
                    // Show Material-UI Alert with actual error messages
                    setAlertSeverity('error');
                    setAlertMessage(backendErrors.join('; ')); // Show actual error messages
                    setShowAlert(true);
                    
                    // Auto-hide after 8 seconds (longer for reading errors)
                    setTimeout(() => setShowAlert(false), 8000);
                    
                    toast({
                        title: "Mapping Validation Failed",
                        description: `${backendErrors.length} validation errors found`,
                        variant: "destructive",
                    });
                } else {
                    // Generic 400 error
                    const errorMessage = errorData?.detail?.message || errorData?.message || 'Bad Request - Invalid payload format';
                    setTestResults({
                        errors: [errorMessage],
                        details: []
                    });
                    
                    // Show Material-UI Alert
                    setAlertSeverity('error');
                    setAlertMessage(`Bad Request: ${errorMessage}`);
                    setShowAlert(true);
                    
                    toast({
                        title: "Bad Request",
                        description: errorMessage,
                        variant: "destructive",
                    });
                }
            } else if (error.response?.status === 422) {
                // Validation Error
                const errorData = error.response?.data;
                if (errorData?.detail?.status === 'error') {
                    const backendErrors = errorData.detail.errors || [];
                    setTestResults({
                        errors: backendErrors,
                        details: errorData.detail.details || []
                    });
                    toast({
                        title: "Mapping Validation Failed",
                        description: `${backendErrors.length} validation errors found`,
                        variant: "destructive",
                    });
                } else {
                    const validationErrors = errorData?.detail || [];
                    const errorMessages = Array.isArray(validationErrors) 
                        ? validationErrors.map((err: any) => err.msg || err.message || JSON.stringify(err))
                        : [validationErrors.message || validationErrors.msg || JSON.stringify(validationErrors)];
                    setTestResults({
                        errors: errorMessages,
                        details: []
                    });
                    toast({
                        title: "Validation Error",
                        description: `Request validation failed: ${errorMessages.join(', ')}`,
                        variant: "destructive",
                    });
                }
            } else {
                // Other errors
                const errorMessage = error.response?.data?.detail?.message || error.message || 'Unknown error occurred';
                setTestResults({
                    errors: [errorMessage],
                    details: []
                });
                toast({
                    title: "Test Failed",
                    description: errorMessage,
                    variant: "destructive",
                });
            }
        } finally {
            setIsTesting(false);
        }
    }, [mappingData.column_mappings, mappingData.primary_keys, mappingData.project_id, mappingData.target_database, mappingData.target_schema, mappingData.target_table, mappingData.groups, allColumnsDataMap, toast]);

    return (
        <Card className="p-4">
            <CardHeader>
                <CardTitle>Step 4: Interactive Column Mapping</CardTitle>
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
                                nodes={nodes} 
                                edges={edges} 
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange} 
                                onConnect={onConnect}
                                onEdgesDelete={onEdgesDelete}
                                onEdgeClick={onEdgeClick}
                                nodeTypes={nodeTypes} 
                                fitView
                                connectionLineType={ConnectionLineType.SmoothStep}
                                defaultEdgeOptions={{
                                    type: ConnectionLineType.SmoothStep,
                                    style: { stroke: '#60a5fa', strokeWidth: 2 },
                                    markerEnd: { type: MarkerType.ArrowClosed, color: '#60a5fa' }
                                }}
                                deleteKeyCode={['Backspace', 'Delete']}
                            >
                                <Controls showInteractive={false} />
                                <MiniMap pannable zoomable />
                                <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                            </ReactFlow>
                        </ReactFlowProvider>
                    )}
                </div>
                {/* Material-UI Style Alert */}
                {showAlert && (
                    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-4xl px-4">
                        <div className={`rounded-lg shadow-lg border-l-4 p-4 ${
                            alertSeverity === 'error' 
                                ? 'bg-red-50 border-red-400 text-red-800 dark:bg-red-950/20 dark:border-red-600 dark:text-red-200' 
                                : 'bg-green-50 border-green-400 text-green-800 dark:bg-green-950/20 dark:border-green-600 dark:text-green-200'
                        }`}>
                            <div className="flex items-start">
                                <div className="flex-shrink-0">
                                    {alertSeverity === 'error' ? (
                                        <AlertCircle className="h-5 w-5 text-red-400" />
                                    ) : (
                                        <CheckCircle className="h-5 w-5 text-green-400" />
                                    )}
                                </div>
                                <div className="ml-3 flex-1">
                                    <h3 className={`text-sm font-medium ${
                                        alertSeverity === 'error' ? 'text-red-800 dark:text-red-200' : 'text-green-800 dark:text-green-200'
                                    }`}>
                                        {alertSeverity === 'error' ? 'Validation Failed' : 'Validation Passed'}
                                    </h3>
                                    <div className={`mt-1 text-sm leading-relaxed ${
                                        alertSeverity === 'error' ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'
                                    }`}>
                                        {alertMessage}
                                    </div>
                                </div>
                                <div className="ml-auto pl-3">
                                    <div className="-mx-1.5 -my-1.5">
                                        <button
                                            onClick={() => setShowAlert(false)}
                                            className={`inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                                alertSeverity === 'error'
                                                    ? 'text-red-500 hover:bg-red-100 focus:ring-red-600 dark:text-red-400 dark:hover:bg-red-900/20'
                                                    : 'text-green-500 hover:bg-green-100 focus:ring-green-600 dark:text-green-400 dark:hover:bg-green-900/20'
                                            }`}
                                        >
                                            <span className="sr-only">Dismiss</span>
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}


                <div className="flex justify-between gap-2 mt-6">
                    <Button variant="outline" onClick={onBack}>Back</Button>
                    <div className="flex gap-2">
                        <Button 
                            variant="secondary" 
                            onClick={handleTestMapping} 
                            disabled={isTesting || !mappingData.column_mappings?.length}
                        >
                            {isTesting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Testing...
                                </>
                            ) : (
                                <>
                                    <TestTube className="mr-2 h-4 w-4" />
                                    Test Mapping
                                </>
                            )}
                        </Button>
                    <Button onClick={onNext}>Next</Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step3TablesRelations;

