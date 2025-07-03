// src/app/(hydrogen)/mapping/Step3TablesRelations.tsx
'use client';

import React, { useEffect, useState, useCallback, memo } from 'react';
import ReactFlow, {
    ReactFlowProvider,
    Background,
    BackgroundVariant,
    MiniMap,
    Controls,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    Handle,
    Position,
    ConnectionLineType,
    MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css'; // Essential React Flow styles

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

import { getTableColumns } from '@/app/services/mapping/fetch_tables';

// Helper to get table short name (e.g., "CLIENTS" from "DB.SCHEMA.CLIENTS")
const getTableShortName = (tableKey: string | null | undefined): string => {
    if (typeof tableKey !== 'string' || !tableKey) {
        return '';
    }
    return tableKey.split('.').pop() || '';
};

// NEW HELPER: Parse full table key into database, schema, table
const parseTableKey = (tableKey: string) => {
    const parts = tableKey.split('.');
    if (parts.length === 3) {
        return {
            database: parts[0],
            schema: parts[1],
            table: parts[2],
        };
    }
    console.warn(`Unexpected tableKey format: ${tableKey}. Expected 'database.schema.table'`);
    // Fallback for potentially malformed keys (adjust as per your actual key formats)
    return {
        database: parts[0] || '',
        schema: parts[1] || '',
        table: parts[2] || parts[1] || parts[0] || '',
    };
};

// --- Interfaces (consistent with MappingWizardPage and other steps) ---
interface TableSelection {
    database: string;
    schema: string;
    table: string;
}

interface ColumnDetail {
    name: string;
    data_type: string;
    is_nullable?: boolean;
    is_primary_key?: boolean;
    is_foreign_key?: boolean;
    is_required_for_mapping?: boolean;
}

interface ColumnAttributes {
    is_nullable: boolean;
    is_primary_key: boolean;
    is_foreign_key: boolean;
    is_required_for_mapping: boolean;
    data_type?: string;
}

interface ColumnMapping {
    source_column: string;
    target_column: string;
    data_type: string;
    source_table_key: string; // e.g., "DB.SCHEMA.TABLE"
}

interface ForeignKey {
    column: string;
    referenced_table: string;
    referenced_column: string;
}

interface MappingDetail {
    project_id: string | null; // Added project_id
    source_database: string;
    source_schema: string;
    source_table: string;
    target_database: string;
    target_schema: string;
    target_table: string;
    column_mappings: ColumnMapping[];
    new_target_columns: Array<{ name: string; type: string; nullable: boolean }>;
    primary_keys?: { source: string[]; target: string[] };
    foreign_keys?: { source: Array<{ column: string; referenced_table: string; referenced_column: string }>; target: Array<{ column: string; referenced_table: string; referenced_column: string }>; };
    column_attributes?: { [tableName: string]: { [columnName: string]: ColumnAttributes } };
}

interface Step3Props {
    onNext: () => void; // This might need to change to onNext(finalData: YourFinalFormat)
    onBack: () => void;
    mappingData: MappingDetail;
    updateMappingData: (newData: Partial<MappingDetail>) => void;
    selectedSourceTables: TableSelection[];
    selectedTargetTable: TableSelection | null;
    projectId: string; // Receive projectId
}

// Define interfaces for TableNodeData here if not already defined globally or imported
interface TableNodeData {
    label: string;
    tableKey: string;
    columns: ColumnDetail[];
    isSource: boolean;
}

const TableNode: React.FC<{ data: TableNodeData }> = memo(({ data }) => {
    const { label: tableName, tableKey, columns, isSource } = data;

    const getColumnDisplayBadges = useCallback((col: ColumnDetail) => {
        const badges = [];
        if (col.is_primary_key) badges.push(<Badge key="pk" variant="default" className="ml-1 px-1 py-0.5 text-xs">PK</Badge>);
        if (col.is_foreign_key) badges.push(<Badge key="fk" variant="outline" className="ml-1 px-1 py-0.5 text-xs bg-green-100">FK</Badge>);
        if (col.is_required_for_mapping) badges.push(<Badge key="req" variant="secondary" className="ml-1 px-1 py-0.5 text-xs">Required</Badge>);
        else if (col.is_nullable) badges.push(<Badge key="null" variant="outline" className="ml-1 px-1 py-0.5 text-xs">Nullable</Badge>);
        return <>{badges}</>;
    }, []);

    return (
        <Card className={`w-80 shadow-xl rounded-lg overflow-hidden ${isSource ? 'border-gray-300' : 'border-blue-400 bg-blue-50'}`}>
            <CardHeader className={`p-3 border-b ${isSource ? 'bg-gray-100' : 'bg-blue-100'}`}>
                <CardTitle className="text-md font-semibold truncate">
                    {isSource ? 'Source: ' : 'Target: '} {tableName}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-3 max-h-64 overflow-y-auto custom-scrollbar">
                <ul className="space-y-1">
                    {columns.length > 0 ? (
                        columns.map((col) => (
                            <li key={col.name} className="relative flex items-center justify-between py-1.5 px-2 rounded-sm hover:bg-gray-50 transition-colors">
                                {isSource && <Handle type="source" position={Position.Right} id={col.name} className="w-4 h-4 bg-purple-500 border-none rounded-full" />}
                                {!isSource && <Handle type="target" position={Position.Left} id={col.name} className="w-4 h-4 bg-purple-500 border-none rounded-full" />}

                                <Label htmlFor={`${tableKey}-${col.name}`} className="flex-grow flex items-center justify-between cursor-default">
                                    <span className="font-medium text-gray-800 text-sm truncate">{col.name}</span>
                                    <span className="text-xs text-muted-foreground ml-2">({col.data_type})</span>
                                </Label>
                                <div className="flex-shrink-0 ml-1">
                                    {getColumnDisplayBadges(col)}
                                </div>
                            </li>
                        ))
                    ) : (
                        <p className="text-sm text-gray-500">No columns.</p>
                    )}
                </ul>
            </CardContent>
        </Card>
    );
});
TableNode.displayName = 'TableNode';

// ... (TableNode and nodeTypes are unchanged) ...
const nodeTypes = { customTableNode: TableNode };

const Step3TablesRelations: React.FC<Step3Props> = ({
    onNext,
    onBack,
    mappingData,
    updateMappingData,
    selectedSourceTables,
    selectedTargetTable,
    projectId, // Receive projectId
}) => {
    const { toast } = useToast();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);
    const [allColumnsDataMap, setAllColumnsDataMap] = useState<Record<string, Record<string, ColumnDetail>>>({});

    const areTypesCompatible = useCallback((sourceDataType: string, targetDataType: string): { compatible: boolean; reason?: string } => {
        const normalizeType = (type: string) => type.split('(')[0].toUpperCase();

        const normalizedSourceType = normalizeType(sourceDataType);
        const normalizedTargetType = normalizeType(targetDataType);

        if (normalizedSourceType === normalizedTargetType) {
            return { compatible: true };
        }

        if ((normalizedSourceType === 'NUMBER' && normalizedTargetType === 'INT') || (normalizedSourceType === 'INT' && normalizedTargetType === 'NUMBER')) {
            return { compatible: true };
        }
        if ((normalizedSourceType.includes('VARCHAR') || normalizedSourceType.includes('TEXT')) &&
            (normalizedTargetType.includes('VARCHAR') || normalizedTargetType.includes('TEXT'))) {
            return { compatible: true };
        }
        if (normalizedSourceType.includes('DATE') && normalizedTargetType.includes('DATE')) {
            return { compatible: true };
        }
        if (normalizedSourceType.includes('TIMESTAMP') && normalizedTargetType.includes('TIMESTAMP')) {
            return { compatible: true };
        }

        return { compatible: false, reason: `Type mismatch: ${sourceDataType} vs ${targetDataType}` };
    }, []);

    const initializeReactFlowGraph = useCallback(async () => {
        if (selectedSourceTables.length === 0 || !selectedTargetTable) {
            toast({
                title: 'Selection Required',
                description: 'Please select at least one source table and one target table in Step 1.',
                variant: 'destructive',
            });
            setLoading(false);
            return;
        }

        setLoading(true);
        const initialNodes: Node[] = [];
        const initialEdges: Edge[] = [];
        let yPosSource = 50;
        let yPosTarget = 50;

        const tempAllColumnsDataMap: Record<string, Record<string, ColumnDetail>> = {};

        try {
            for (const tableSelection of selectedSourceTables) {
                const tableKey = `${tableSelection.database}.${tableSelection.schema}.${tableSelection.table}`;
                const fetchedColumns = await getTableColumns(tableSelection.database, tableSelection.schema, tableSelection.table);

                const columnsForNode: ColumnDetail[] = fetchedColumns.map((col: any) => {
                    const attrs = mappingData.column_attributes?.[tableSelection.table]?.[col.name] || {};
                    const columnDetail: ColumnDetail = {
                        name: col.name,
                        data_type: col.data_type || col.type,
                        is_nullable: attrs.is_nullable,
                        is_primary_key: attrs.is_primary_key,
                        is_foreign_key: attrs.is_foreign_key,
                        is_required_for_mapping: attrs.is_required_for_mapping,
                    };
                    return columnDetail;
                });

                tempAllColumnsDataMap[tableKey] = {};
                columnsForNode.forEach(col => {
                    tempAllColumnsDataMap[tableKey][col.name] = col;
                });

                initialNodes.push({
                    id: tableKey,
                    type: 'customTableNode',
                    position: { x: 50, y: yPosSource },
                    data: {
                        label: tableSelection.table,
                        tableKey: tableKey,
                        columns: columnsForNode,
                        isSource: true,
                    },
                });
                yPosSource += 300;
            }

            const targetTableKey = `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`;
            const fetchedTargetColumns = await getTableColumns(selectedTargetTable.database, selectedTargetTable.schema, selectedTargetTable.table);

            const targetColumnsForNode: ColumnDetail[] = fetchedTargetColumns.map((col: any) => {
                const attrs = mappingData.column_attributes?.[selectedTargetTable.table]?.[col.name] || {};
                const columnDetail: ColumnDetail = {
                    name: col.name,
                    data_type: col.data_type || col.type,
                    is_nullable: attrs.is_nullable,
                    is_primary_key: attrs.is_primary_key,
                    is_foreign_key: attrs.is_foreign_key,
                    is_required_for_mapping: attrs.is_required_for_mapping,
                };
                return columnDetail;
            });

            tempAllColumnsDataMap[targetTableKey] = {};
            targetColumnsForNode.forEach(col => {
                tempAllColumnsDataMap[targetTableKey][col.name] = col;
            });

            initialNodes.push({
                id: targetTableKey,
                type: 'customTableNode',
                position: { x: 400, y: yPosTarget },
                data: {
                    label: selectedTargetTable.table,
                    tableKey: targetTableKey,
                    columns: targetColumnsForNode,
                    isSource: false,
                },
            });

            // Add existing column mappings as edges
            if (mappingData.column_mappings && mappingData.column_mappings.length > 0) {
                mappingData.column_mappings.forEach((mapping, idx) => {
                    const srcNodeId = mapping.source_table_key; // Use the stored source_table_key

                    if (srcNodeId && initialNodes.some(n => n.id === srcNodeId)) {
                        initialEdges.push({
                            id: `mapping-${srcNodeId}-${mapping.source_column}-${targetTableKey}-${mapping.target_column}-${idx}`,
                            source: srcNodeId,
                            sourceHandle: mapping.source_column,
                            target: targetTableKey,
                            targetHandle: mapping.target_column,
                            type: ConnectionLineType.SmoothStep,
                            label: mapping.data_type,
                            style: { stroke: '#8B5CF6', strokeWidth: 2 },
                            markerEnd: { type: MarkerType.ArrowClosed, color: '#8B5CF6' },
                        });
                    }
                });
            }

            setAllColumnsDataMap(tempAllColumnsDataMap);
            setNodes(initialNodes);
            setEdges(initialEdges);

        } catch (error: any) {
            console.error('Error initializing React Flow graph:', error);
            toast({
                title: 'Error',
                description: `Failed to initialize visualization: ${error.message}`,
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    }, [selectedSourceTables, selectedTargetTable, mappingData.column_attributes, mappingData.column_mappings, toast]);

    useEffect(() => {
        initializeReactFlowGraph();
    }, [initializeReactFlowGraph]);


    const onConnect = useCallback(
        (connection: Connection) => {
            console.log("New connection (edge) created:", connection); // Your requested log

            const { source: sourceNodeId, sourceHandle: sourceColumnName, target: targetNodeId, targetHandle: targetColumnName } = connection;

            if (!sourceNodeId || !targetNodeId || !sourceColumnName || !targetColumnName) {
                toast({ title: 'Invalid Connection', description: 'Please connect a source column to a target column.', variant: 'destructive' });
                return;
            }

            const sourceNode = nodes.find(n => n.id === sourceNodeId);
            const targetNode = nodes.find(n => n.id === targetNodeId);

            if (!sourceNode?.data.isSource || targetNode?.data.isSource) {
                toast({ title: 'Invalid Connection', description: 'Please drag from a source table column to a target table column.', variant: 'destructive' });
                return;
            }

            const sourceColDetail = allColumnsDataMap[sourceNodeId]?.[sourceColumnName];
            const targetColDetail = allColumnsDataMap[targetNodeId]?.[targetColumnName];

            if (!sourceColDetail || !targetColDetail) {
                toast({ title: 'Column Data Missing', description: 'Could not retrieve data types for selected columns.', variant: 'destructive' });
                return;
            }

            const compatibility = areTypesCompatible(sourceColDetail.data_type, targetColDetail.data_type);

            if (!compatibility.compatible) {
                toast({
                    title: 'Type Mismatch',
                    description: `Cannot map incompatible types: ${sourceColDetail.data_type} and ${targetColDetail.data_type}. ${compatibility.reason || ''}`,
                    variant: 'destructive',
                    duration: 5000,
                });
                return;
            }

            const dataType = sourceColDetail.data_type;

            const newMapping: ColumnMapping = {
                source_column: sourceColumnName,
                target_column: targetColumnName,
                data_type: dataType,
                source_table_key: sourceNodeId, // Store the full table key
            };

            const isDuplicate = mappingData.column_mappings.some(
                (m) => m.source_column === newMapping.source_column && m.target_column === newMapping.target_column && m.source_table_key === newMapping.source_table_key
            );

            if (isDuplicate) {
                toast({ title: 'Duplicate Mapping', description: `Column '${getTableShortName(sourceNodeId)}.${sourceColumnName}' is already mapped to '${targetColumnName}'.`, variant: 'info' });
                return;
            }

            setEdges((eds) => addEdge({
                ...connection,
                type: ConnectionLineType.SmoothStep,
                label: dataType,
                style: { stroke: '#8B5CF6', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#8B5CF6' },
            }, eds));

            updateMappingData({
                project_id: projectId, // Ensure projectId is passed
                column_mappings: [...mappingData.column_mappings, newMapping],
                // These are probably already set from step 1, but good to ensure
                source_database: selectedSourceTables[0]?.database || '',
                source_schema: selectedSourceTables[0]?.schema || '',
                source_table: selectedSourceTables[0]?.table || '',
                target_database: selectedTargetTable?.database || '',
                target_schema: selectedTargetTable?.schema || '',
                target_table: selectedTargetTable?.table || '',
            });

            toast({ title: 'Mapping Added', description: `Mapped '${getTableShortName(sourceNodeId)}.${sourceColumnName}' to '${targetColumnName}'.`, variant: 'success' });
        },
        [nodes, mappingData.column_mappings, updateMappingData, selectedSourceTables, selectedTargetTable, toast, setEdges, allColumnsDataMap, areTypesCompatible, projectId]
    );

    const onEdgesDelete = useCallback(
        (edgesToRemove: Edge[]) => {
            const updatedMappings = mappingData.column_mappings.filter(m => {
                return !edgesToRemove.some(edge =>
                    edge.sourceHandle === m.source_column && edge.targetHandle === m.target_column && edge.source === m.source_table_key
                );
            });
            updateMappingData({ column_mappings: updatedMappings, project_id: projectId }); // Pass projectId
            setEdges((eds) => eds.filter(edge => !edgesToRemove.includes(edge)));
            toast({ title: 'Mapping Removed', description: 'Selected mapping(s) removed.', variant: 'info' });
        },
        [mappingData.column_mappings, updateMappingData, toast, setEdges, projectId]
    );

    // NEW TRANSFORMATION FUNCTION:
    const transformToFinalMappingsFormat = useCallback(
        (columnMappings: ColumnMapping[], selectedTargetTable: TableSelection | null) => {
            if (!selectedTargetTable) {
                return [];
            }

            // Group mappings by unique source_table_key
            const groupedMappings = new Map<string, Array<{ source_column: string; target_column: string }>>();

            columnMappings.forEach(colMap => {
                const { source_table_key, source_column, target_column } = colMap;

                if (!groupedMappings.has(source_table_key)) {
                    groupedMappings.set(source_table_key, []);
                }
                groupedMappings.get(source_table_key)?.push({ source_column, target_column });
            });

            const finalMappingsArray = Array.from(groupedMappings.entries()).flatMap(([sourceTableKey, columnPairs]) => {
                const sourceTableParts = parseTableKey(sourceTableKey);
                const targetTableParts = selectedTargetTable; // Target table is constant for this entire mapping wizard flow

                // For each source table, create a mapping object.
                // The source_columns and target_columns arrays will be populated by iterating through the columnPairs
                // mapped from this specific source table.
                const newFormatEntry = {
                    source_database: sourceTableParts.database,
                    source_schema: sourceTableParts.schema,
                    source_table: sourceTableParts.table,
                    target_database: targetTableParts.database,
                    target_schema: targetTableParts.schema,
                    target_table: targetTableParts.table,
                    source_columns: columnPairs.map(pair => pair.source_column),
                    target_columns: columnPairs.map(pair => pair.target_column),
                };

                // The crucial part: If a source column can map to MULTIPLE target columns (e.g., from different drag operations),
                // or a target column can receive from multiple source columns, this structure handles it
                // by adding each individual connection as a parallel entry in the source_columns and target_columns arrays.
                //
                // Example:
                // If you map SourceA.Col1 to Target.ColX, and then SourceA.Col1 to Target.ColY:
                // Your `columnMappings` might have:
                // [{ source_table_key: "SourceA", source_column: "Col1", target_column: "ColX", ... },
                //  { source_table_key: "SourceA", source_column: "Col1", target_column: "ColY", ... }]
                //
                // The `transformToFinalMappingsFormat` will then produce:
                // {
                //    ...,
                //    "source_table": "SourceA",
                //    "source_columns": ["Col1", "Col1"], // 'Col1' appears twice
                //    "target_columns": ["ColX", "ColY"]    // 'ColX' and 'ColY' are linked to 'Col1' in order
                // }
                // This means source_columns[0] maps to target_columns[0], source_columns[1] maps to target_columns[1], etc.

                return newFormatEntry;
            });

            return finalMappingsArray;
        },
        [selectedTargetTable] // Dependency for useCallback
    );


    const handleNextClick = useCallback(() => {
        if (!projectId) {
            toast({
                title: 'Project Not Selected',
                description: 'Please select or create a project in the first step.',
                variant: 'destructive',
            });
            return;
        }

        const requiredSourceColumns = selectedSourceTables.flatMap(table => {
            const tableAttrs = mappingData.column_attributes?.[table.table] || {};
            return Object.entries(tableAttrs).filter(([, attrs]) => attrs.is_required_for_mapping).map(([colName,]) => ({ tableKey: `${table.database}.${table.schema}.${table.table}`, colName }));
        });

        const currentMappedSourceColumnsWithKeys = new Set(mappingData.column_mappings.map(m => `${m.source_table_key}::${m.source_column}`));
        const unmappedRequiredSource = requiredSourceColumns.filter(reqCol => !currentMappedSourceColumnsWithKeys.has(`${reqCol.tableKey}::${reqCol.colName}`));

        if (unmappedRequiredSource.length > 0) {
            const unmappedList = unmappedRequiredSource.map(rc => `${getTableShortName(rc.tableKey)}.${rc.colName}`).join(', ');
            toast({ title: 'Mapping Validation Required', description: `The following source columns are marked as 'Required for Mapping' but are not yet mapped: ${unmappedList}. Please map them or go back to Step 2 to unmark them.`, variant: 'destructive', duration: 9000 });
            return;
        }

        const requiredTargetColumns = selectedTargetTable ? Object.entries(mappingData.column_attributes?.[selectedTargetTable.table] || {}).filter(([, attrs]) => attrs.is_required_for_mapping).map(([colName,]) => colName) : [];
        const currentMappedTargetColumnNames = new Set(mappingData.column_mappings.map(m => m.target_column));
        const unmappedRequiredTarget = requiredTargetColumns.filter(colName => !currentMappedTargetColumnNames.has(colName));

        if (unmappedRequiredTarget.length > 0) {
            toast({ title: 'Mapping Validation Required', description: `The following target columns are marked as 'Required for Mapping' but do not have a source mapped to them: ${unmappedRequiredTarget.join(', ')}. Please map a source column to them or go back to Step 2 to unmark them.`, variant: 'destructive', duration: 9000 });
            return;
        }

        // Generate the final output format before proceeding
        const finalMappingsForSubmission = transformToFinalMappingsFormat(
            mappingData.column_mappings,
            selectedTargetTable
        );

        console.log("Final Mappings for Project Submission:", {
            project_id: projectId, // Use the actual project ID here
            mappings: finalMappingsForSubmission
        });

        updateMappingData({
            project_id: projectId, // Ensure projectId is passed
            column_mappings: mappingData.column_mappings, // Keep the current format for display in Step4
            // The `source_columns` and `target_columns` in the parent mappingData
            // are now derived from the `column_mappings` in the final format.
            // For now, we'll keep them as simple arrays for the next step's expected interface.
            source_columns: mappingData.column_mappings.map(m => m.source_column),
            target_columns: mappingData.column_mappings.map(m => m.target_column),
        });

        onNext(); // Proceed to the next step
    }, [selectedSourceTables, selectedTargetTable, mappingData.column_attributes, mappingData.column_mappings, projectId, toast, onNext, transformToFinalMappingsFormat, updateMappingData]);

    if (loading) {
        return (
            <Card className="p-4">
                <CardHeader><CardTitle>Step 3: Interactive Column Mapping</CardTitle></CardHeader>
                <CardContent>Loading tables and columns for visualization...</CardContent>
            </Card>
        );
    }

    return (
        <Card className="p-4">
            <CardHeader>
                <CardTitle>Step 3: Interactive Column Mapping</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Drag from a **source column's handle** (purple circle on the right side of a source table) to a **target column's handle** (purple circle on the left side of the target table) to create new mappings.
                    Select an existing mapping line and press the 'Delete' key to remove it.
                </p>
            </CardHeader>
            <CardContent>
                <div style={{ width: '100%', height: '700px', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
                    <ReactFlowProvider>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onEdgesDelete={onEdgesDelete}
                            nodeTypes={nodeTypes}
                            fitView
                            attributionPosition="bottom-left"
                            connectionLineType={ConnectionLineType.SmoothStep}
                            snapToGrid={true}
                            snapGrid={[15, 15]}
                        >
                            <MiniMap position="bottom-right" style={{ height: 100, width: 150 }} />
                            <Controls position="top-right" />
                            <Background id="dots" variant={BackgroundVariant.Dots} gap={12} size={1} color="#aaa" />
                            <Background id="lines" variant={BackgroundVariant.Lines} gap={96} color="#ccc" lineWidth={1} />
                        </ReactFlow>
                    </ReactFlowProvider>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <Button variant="outline" onClick={onBack}>Back</Button>
                    <Button onClick={handleNextClick}>Next</Button>
                </div>
            </CardContent>
        </Card>
    );
};


export default Step3TablesRelations;
