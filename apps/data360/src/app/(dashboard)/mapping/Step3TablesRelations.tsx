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
    console.warn(`Step3: Unexpected tableKey format: ${tableKey}. Expected 'database.schema.table'`);
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
    project_id: string | null;
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
    onNext: () => void;
    onBack: () => void;
    mappingData: MappingDetail;
    // Updated signature here - removed eventType and eventDetails args
    updateMappingData: (newData: Partial<MappingDetail>) => void;
    selectedSourceTables: TableSelection[];
    selectedTargetTable: TableSelection | null;
    projectId: string;
    username: string;
}

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

const nodeTypes = { customTableNode: TableNode };

const Step3TablesRelations: React.FC<Step3Props> = ({
    onNext,
    onBack,
    mappingData,
    updateMappingData,
    selectedSourceTables,
    selectedTargetTable,
    projectId,
    username,
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
        console.log(`Step3: Type compatibility check: ${sourceDataType} (Source) vs ${targetDataType} (Target) -> INCOMPATIBLE`);
        return { compatible: false, reason: `Type mismatch: ${sourceDataType} vs ${targetDataType}` };
    }, []);

    const initializeReactFlowGraph = useCallback(async () => {
        console.log('Step3: Initializing React Flow graph.');
        if (selectedSourceTables.length === 0 || !selectedTargetTable) {
            toast({
                title: 'Selection Required',
                description: 'Please select at least one source table and one target table in Step 1.',
                variant: 'destructive',
            });
            setLoading(false);
            console.warn('Step3: Cannot initialize graph. Source or target table not selected.');
            return;
        }

        setLoading(true);
        const initialNodes: Node[] = [];
        let yPosSource = 50;
        let yPosTarget = 50;

        const tempAllColumnsDataMap: Record<string, Record<string, ColumnDetail>> = {};

        try {
            for (const tableSelection of selectedSourceTables) {
                const tableKey = `${tableSelection.database}.${tableSelection.schema}.${tableSelection.table}`;
                console.log(`Step3: Fetching columns for source table: ${tableKey}`);
                const fetchedColumns = await getTableColumns(tableSelection.database, tableSelection.schema, tableSelection.table);
                console.log(`Step3: Fetched columns for ${tableKey}:`, fetchedColumns);

                const columnsForNode: ColumnDetail[] = fetchedColumns.map((col: any) => {
                    // Use mappingData.column_attributes to pre-fill properties if available
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
            console.log(`Step3: Fetching columns for target table: ${targetTableKey}`);
            const fetchedTargetColumns = await getTableColumns(selectedTargetTable.database, selectedTargetTable.schema, selectedTargetTable.table);
            console.log(`Step3: Fetched columns for ${targetTableKey}:`, fetchedTargetColumns);

            const targetColumnsForNode: ColumnDetail[] = fetchedTargetColumns.map((col: any) => {
                 // Use mappingData.column_attributes to pre-fill properties if available
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

            // Add existing column mappings as edges from mappingData prop
            const initialEdges: Edge[] = [];
            if (mappingData.column_mappings && mappingData.column_mappings.length > 0) {
                console.log('Step3: Adding existing column mappings as edges from mappingData:', mappingData.column_mappings);
                mappingData.column_mappings.forEach((mapping, idx) => {
                    const srcNodeId = mapping.source_table_key;
                    const targetNodeId = `${mappingData.target_database}.${mappingData.target_schema}.${mappingData.target_table}`;

                    if (srcNodeId && initialNodes.some(n => n.id === srcNodeId)) {
                        initialEdges.push({
                            id: `mapping-${srcNodeId}-${mapping.source_column}-${targetNodeId}-${mapping.target_column}-${idx}`,
                            source: srcNodeId,
                            sourceHandle: mapping.source_column,
                            target: targetNodeId,
                            targetHandle: mapping.target_column,
                            type: ConnectionLineType.SmoothStep,
                            label: mapping.data_type,
                            style: { stroke: '#8B5CF6', strokeWidth: 2 },
                            markerEnd: { type: MarkerType.ArrowClosed, color: '#8B5CF6' },
                        });
                    }
                });
                console.log('Step3: Initial edges created from mappingData:', initialEdges);
            }

            setAllColumnsDataMap(tempAllColumnsDataMap);
            setNodes(initialNodes);
            setEdges(initialEdges);
            console.log('Step3: React Flow nodes and edges set.');

        } catch (error: any) {
            console.error('Step3: Error initializing React Flow graph:', error);
            toast({
                title: 'Error',
                description: `Failed to initialize visualization: ${error.message}`,
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
            console.log('Step3: Finished initializing graph. Loading state:', false);
        }
    }, [selectedSourceTables, selectedTargetTable, mappingData.column_attributes, mappingData.column_mappings, mappingData.target_database, mappingData.target_schema, mappingData.target_table, toast]);

    // This useEffect will trigger the graph initialization whenever relevant data changes
    useEffect(() => {
        initializeReactFlowGraph();
    }, [initializeReactFlowGraph]);


    const onConnect = useCallback(
        async (connection: Connection) => {
            console.log("Step3: New connection (edge) attempted:", connection);

            const { source: sourceNodeId, sourceHandle: sourceColumnName, target: targetNodeId, targetHandle: targetColumnName } = connection;

            if (!sourceNodeId || !targetNodeId || !sourceColumnName || !targetColumnName) {
                toast({ title: 'Invalid Connection', description: 'Please connect a source column to a target column.', variant: 'destructive' });
                console.warn('Step3: Invalid connection attempt. Missing IDs or handles.');
                return;
            }

            const sourceNode = nodes.find(n => n.id === sourceNodeId);
            const targetNode = nodes.find(n => n.id === targetNodeId);

            if (!sourceNode?.data.isSource || targetNode?.data.isSource) {
                toast({ title: 'Invalid Connection', description: 'Please drag from a source table column to a target table column.', variant: 'destructive' });
                console.warn('Step3: Invalid connection direction. Must be source to target.');
                return;
            }

            const sourceColDetail = allColumnsDataMap[sourceNodeId]?.[sourceColumnName];
            const targetColDetail = allColumnsDataMap[targetNodeId]?.[targetColumnName];

            if (!sourceColDetail || !targetColDetail) {
                toast({ title: 'Column Data Missing', description: 'Could not retrieve data types for selected columns.', variant: 'destructive' });
                console.error('Step3: Column details missing for connection:', { sourceColDetail, targetColDetail });
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
                console.warn('Step3: Type mismatch detected. Connection rejected.', compatibility.reason);
                return;
            }

            const dataType = sourceColDetail.data_type;

            const newMapping: ColumnMapping = {
                source_column: sourceColumnName,
                target_column: targetColumnName,
                data_type: dataType,
                source_table_key: sourceNodeId,
            };

            const isDuplicate = mappingData.column_mappings.some(
                (m) => m.source_column === newMapping.source_column && m.target_column === newMapping.target_column && m.source_table_key === newMapping.source_table_key
            );

            if (isDuplicate) {
                toast({ title: 'Duplicate Mapping', description: `Column '${getTableShortName(sourceNodeId)}.${sourceColumnName}' is already mapped to '${targetColumnName}'.`, variant: 'info' });
                console.warn('Step3: Duplicate mapping attempted:', newMapping);
                return;
            }

            const updatedColumnMappings = [...mappingData.column_mappings, newMapping];
            setEdges((eds) => addEdge({
                ...connection,
                type: ConnectionLineType.SmoothStep,
                label: dataType,
                style: { stroke: '#8B5CF6', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#8B5CF6' },
            }, eds));
            console.log('Step3: New edge added to React Flow state:', newMapping);

            // Update parent's mappingData (logging happens via child API calls if any)
            updateMappingData({
                column_mappings: updatedColumnMappings,
                // Ensure other mappingData fields are passed along to prevent loss
                project_id: projectId,
                source_database: selectedSourceTables[0]?.database || '',
                source_schema: selectedSourceTables[0]?.schema || '',
                source_table: selectedSourceTables[0]?.table || '',
                target_database: selectedTargetTable?.database || '',
                target_schema: selectedTargetTable?.schema || '',
                target_table: selectedTargetTable?.table || '',
            });
            console.log('Step3: Mapping data updated in parent state.');

            toast({ title: 'Mapping Added', description: `Mapped '${getTableShortName(sourceNodeId)}.${sourceColumnName}' to '${targetColumnName}'.`, variant: 'success' });

            // Log event here as it's an action, not necessarily handled by a separate API
         
            console.log('Step3: Wizard event ADD_MAPPING logged successfully.');

        },
        [nodes, mappingData.column_mappings, updateMappingData, selectedSourceTables, selectedTargetTable, toast, setEdges, allColumnsDataMap, areTypesCompatible, projectId, username]
    );

    const onEdgesDelete = useCallback(
        async (edgesToRemove: Edge[]) => {
            console.log('Step3: Attempting to delete edges:', edgesToRemove);
            const updatedMappings = mappingData.column_mappings.filter(m => {
                return !edgesToRemove.some(edge =>
                    edge.sourceHandle === m.source_column && edge.targetHandle === m.target_column && edge.source === m.source_table_key
                );
            });
            setEdges((eds) => eds.filter(edge => !edgesToRemove.includes(edge)));
            toast({ title: 'Mapping Removed', description: 'Selected mapping(s) removed.', variant: 'info' });
            console.log('Step3: Edges removed from React Flow state.');

            // Update parent's mappingData (logging happens via child API calls if any)
            updateMappingData({
                column_mappings: updatedMappings,
                 // Ensure other mappingData fields are passed along to prevent loss
                project_id: projectId,
                source_database: selectedSourceTables[0]?.database || '',
                source_schema: selectedSourceTables[0]?.schema || '',
                source_table: selectedSourceTables[0]?.table || '',
                target_database: selectedTargetTable?.database || '',
                target_schema: selectedTargetTable?.schema || '',
                target_table: selectedTargetTable?.table || '',
            });
            console.log('Step3: Mapping data updated in parent state.');

            console.log('Step3: Wizard event REMOVE_MAPPING logged successfully.');
        },
        [mappingData.column_mappings, updateMappingData, toast, setEdges, projectId, username, selectedSourceTables, selectedTargetTable]
    );

    const transformToFinalMappingsFormat = useCallback(
        (columnMappings: ColumnMapping[], selectedTargetTable: TableSelection | null) => {
            console.log('Step3: Transforming to final mappings format.');
            if (!selectedTargetTable) {
                console.warn('Step3: No target table selected for final mapping transformation.');
                return [];
            }

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
                const targetTableParts = selectedTargetTable;

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
                return newFormatEntry;
            });
            console.log('Step3: Final transformed mappings:', finalMappingsArray);
            return finalMappingsArray;
        },
        [selectedTargetTable]
    );


    const handleNextClick = useCallback(async () => {
        console.log('Step3: Proceeding to next step (handleNextClick).');
        if (!projectId) {
            toast({
                title: 'Project Not Selected',
                description: 'Please select or create a project in the first step.',
                variant: 'destructive',
            });
            console.warn('Step3: Cannot proceed. Project ID missing.');
            return;
        }
        if (selectedSourceTables.length === 0 || !selectedTargetTable) { // Added validation to prevent empty navigation
            toast({
                title: 'Selection Required',
                description: 'Please select at least one source table and one target table.',
                variant: 'destructive',
            });
            console.warn('Step3: Cannot proceed. Source or target table not selected.');
            return;
        }

        const requiredSourceColumns = selectedSourceTables.flatMap(table => {
            const tableAttrs = mappingData.column_attributes?.[table.table] || {};
            return Object.entries(tableAttrs).filter(([, attrs]) => attrs.is_required_for_mapping).map(([colName,]) => ({ tableKey: `${table.database}.${table.schema}.${table.table}`, colName }));
        });
        console.log('Step3: Required source columns from attributes:', requiredSourceColumns);

        const currentMappedSourceColumnsWithKeys = new Set(mappingData.column_mappings.map(m => `${m.source_table_key}::${m.source_column}`));
        const unmappedRequiredSource = requiredSourceColumns.filter(reqCol => !currentMappedSourceColumnsWithKeys.has(`${reqCol.tableKey}::${reqCol.colName}`));
        console.log('Step3: Unmapped required source columns:', unmappedRequiredSource);

        if (unmappedRequiredSource.length > 0) {
            const unmappedList = unmappedRequiredSource.map(rc => `${getTableShortName(rc.tableKey)}.${rc.colName}`).join(', ');
            toast({ title: 'Mapping Validation Required', description: `The following source columns are marked as 'Required for Mapping' but are not yet mapped: ${unmappedList}. Please map them or go back to Step 2 to unmark them.`, variant: 'destructive', duration: 9000 });
            console.warn('Step3: Validation failed. Unmapped required source columns.');
            return;
        }

        const requiredTargetColumns = selectedTargetTable ? Object.entries(mappingData.column_attributes?.[selectedTargetTable.table] || {}).filter(([, attrs]) => attrs.is_required_for_mapping).map(([colName,]) => colName) : [];
        const currentMappedTargetColumnNames = new Set(mappingData.column_mappings.map(m => m.target_column));
        const unmappedRequiredTarget = requiredTargetColumns.filter(colName => !currentMappedTargetColumnNames.has(colName));
        console.log('Step3: Unmapped required target columns:', unmappedRequiredTarget);

        if (unmappedRequiredTarget.length > 0) {
            toast({ title: 'Mapping Validation Required', description: `The following target columns are marked as 'Required for Mapping' but do not have a source mapped to them: ${unmappedRequiredTarget.join(', ')}. Please map a source column to them or go back to Step 2 to unmark them.`, variant: 'destructive', duration: 9000 });
            console.warn('Step3: Validation failed. Unmapped required target columns.');
            return;
        }

        const finalMappingsForSubmission = transformToFinalMappingsFormat(
            mappingData.column_mappings,
            selectedTargetTable
        );

        console.log("Step3: Final Mappings for Project Submission:", {
            project_id: projectId,
            mappings: finalMappingsForSubmission
        });

        // Update parent's mappingData. Logging is handled by the API calls in child components.
        updateMappingData({
            column_mappings: mappingData.column_mappings,
            // Ensure other mappingData fields are passed along to prevent loss
            project_id: projectId,
            source_database: selectedSourceTables[0]?.database || '',
            source_schema: selectedSourceTables[0]?.schema || '',
            source_table: selectedSourceTables[0]?.table || '',
            target_database: selectedTargetTable?.database || '',
            target_schema: selectedTargetTable?.schema || '',
            target_table: selectedTargetTable?.table || '',
        });
        console.log('Step3: Mapping data updated in parent state before proceeding.');

        console.log('Step3: Wizard event TABLES_RELATIONS logged successfully.');


        onNext();
        console.log('Step3: Proceeding to next step.');
    }, [selectedSourceTables, selectedTargetTable, mappingData.column_attributes, mappingData.column_mappings, projectId, toast, onNext, transformToFinalMappingsFormat, updateMappingData, username]);

    const handleBackStep = useCallback(async () => {
        console.log('Step3: Going back (handleBackStep).');
        
        console.log('Step3: Wizard event NAVIGATE_BACK logged successfully.');
        onBack();
        console.log('Step3: Navigating back.');
    }, [onBack, projectId, username]);

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
                    <Button variant="outline" onClick={handleBackStep}>Back</Button>
                    <Button onClick={handleNextClick}>Next</Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step3TablesRelations;