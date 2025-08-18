'use client';

import React, { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import {
    Button, Label, Select, SelectContent, SelectItem, SelectTrigger,
    SelectValue, Card, CardContent, CardHeader, CardTitle, Badge,
} from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, XCircle } from 'lucide-react';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import { addPrimaryKey } from './addPrimaryKey';

// --- Interface Definitions ---
interface ColumnDetail { 
    name: string; 
    data_type: string; 
}

interface TableSelection { 
    database: string; 
    schema: string; 
    table: string; 
}

interface ForeignKey { 
    column: string; 
    referenced_table: string; 
    referenced_column: string; 
}

interface MappingData {
    project_id: string | null;
    source_database: string;
    source_schema: string;
    source_table: string;
    target_database: string;
    target_schema: string;
    target_table: string;
    column_mappings: Array<{ 
        source_column: string; 
        target_column: string; 
        data_type: string; 
        source_table_key?: string; 
    }>;
    primary_keys?: {
        source: { [tableKey: string]: string[] };
        target: string[];
    };
    foreign_keys?: { 
        source: ForeignKey[]; 
        target: ForeignKey[]; 
    };
}

interface Step1Props {
    onNext: () => void;
    onBack: () => void;
    updateMappingData: (newData: Partial<MappingData>) => void;
    selectedSourceTables: TableSelection[];
    setSelectedSourceTables: Dispatch<SetStateAction<TableSelection[]>>;
    selectedTargetTable: TableSelection | null;
    setSelectedTargetTable: Dispatch<SetStateAction<TableSelection | null>>;
    databases: string[];
    targetSchemas: string[];
    targetTables: string[];
    isLoadingOptions: boolean;
    projectId: string;
    username: string;
    mappingData: MappingData;
}

interface ManuallyDefinedPK { 
    tableKey: string; 
    columnName: string; 
}

const Step1PrimaryKeyFK: React.FC<Step1Props> = ({
    onNext, onBack, updateMappingData, selectedSourceTables, setSelectedSourceTables,
    selectedTargetTable, setSelectedTargetTable, databases, targetSchemas,
    targetTables, isLoadingOptions, projectId, username, mappingData,
}) => {
    const { toast } = useToast();
    const [currentSourceSelection, setCurrentSourceSelection] = useState<TableSelection>({ database: '', schema: '', table: '' });
    const [allSourceColumnsData, setAllSourceColumnsData] = useState<{ [key: string]: ColumnDetail[] }>({});
    const [targetColumnsData, setTargetColumnsData] = useState<ColumnDetail[]>([]);
    const [isFetchingColumns, setIsFetchingColumns] = useState(false);
    const [currentSourceSchemas, setCurrentSourceSchemas] = useState<string[]>([]);
    const [currentSourceTables, setCurrentSourceTables] = useState<string[]>([]);
    const [isSourceOptionsLoading, setIsSourceOptionsLoading] = useState(false);
    const [manuallyDefinedPKs, setManuallyDefinedPKs] = useState<ManuallyDefinedPK[]>([]);

    useEffect(() => {
        if (!currentSourceSelection.database) return;
        const fetchSchemas = async () => {
            setIsSourceOptionsLoading(true);
            try {
                const schemas = await getSchemas(currentSourceSelection.database);
                setCurrentSourceSchemas(schemas);
            } catch (error) {
                toast({ title: "Error", description: "Failed to fetch source schemas.", variant: "destructive" });
            } finally {
                setIsSourceOptionsLoading(false);
            }
        };
        fetchSchemas();
    }, [currentSourceSelection.database, toast]);

    useEffect(() => {
        if (!currentSourceSelection.schema) return;
        const fetchTables = async () => {
            setIsSourceOptionsLoading(true);
            try {
                const tables = await getTables(currentSourceSelection.database, currentSourceSelection.schema);
                setCurrentSourceTables(tables);
            } catch (error) {
                toast({ title: "Error", description: "Failed to fetch source tables.", variant: "destructive" });
            } finally {
                setIsSourceOptionsLoading(false);
            }
        };
        fetchTables();
    }, [currentSourceSelection.schema, currentSourceSelection.database, toast]);

    useEffect(() => {
        const fetchAllColumns = async () => {
            setIsFetchingColumns(true);
            const newAllSourceColumnsData: { [key: string]: ColumnDetail[] } = {};
            const allTables = [...selectedSourceTables, selectedTargetTable].filter(Boolean) as TableSelection[];

            for (const tableSel of allTables) {
                const tableKey = `${tableSel.database}.${tableSel.schema}.${tableSel.table}`;
                try {
                    const columns = await getTableColumns(tableSel.database, tableSel.schema, tableSel.table);
                    const formattedColumns = columns.map(col => ({
                        name: col.name || col.COLUMN_NAME || '',
                        data_type: col.type || col.DATA_TYPE || '',
                    }));

                    if (selectedSourceTables.some(st => `${st.database}.${st.schema}.${st.table}` === tableKey)) {
                        newAllSourceColumnsData[tableKey] = formattedColumns;
                    } else {
                        setTargetColumnsData(formattedColumns);
                    }
                } catch (error) {
                    console.error(`Error loading columns for ${tableKey}:`, error);
                }
            }
            setAllSourceColumnsData(newAllSourceColumnsData);
            setIsFetchingColumns(false);
        };

        if (selectedSourceTables.length > 0 || selectedTargetTable) {
            fetchAllColumns();
        }
        
         const pksFromProps: ManuallyDefinedPK[] = [];
        if (mappingData.primary_keys?.source) {
            for (const tableKey in mappingData.primary_keys.source) {
                mappingData.primary_keys.source[tableKey].forEach(columnName => pksFromProps.push({ tableKey, columnName }));
            }
        }
        if (mappingData.primary_keys?.target && selectedTargetTable) {
            const targetTableKey = `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`;
            mappingData.primary_keys.target.forEach(columnName => pksFromProps.push({ tableKey: targetTableKey, columnName }));
        }
        setManuallyDefinedPKs(pksFromProps);
    }, [mappingData, selectedSourceTables, selectedTargetTable]);

    const handleAddSourceTable = useCallback(async () => {
        if (!currentSourceSelection.table) return;
        const isAlreadyAdded = selectedSourceTables.some(t => 
            t.database === currentSourceSelection.database &&
            t.schema === currentSourceSelection.schema &&
            t.table === currentSourceSelection.table
        );
        if (isAlreadyAdded) {
            toast({ title: "Info", description: "This source table is already added.", variant: "default" });
            return;
        }
        setSelectedSourceTables(prev => [...prev, currentSourceSelection]);
        setCurrentSourceSelection({ database: '', schema: '', table: '' });
    }, [currentSourceSelection, selectedSourceTables, setSelectedSourceTables, toast]);

    const handleRemoveSourceTable = useCallback((tableToRemove: TableSelection) => {
        setSelectedSourceTables(prev => prev.filter(t => 
            !(t.database === tableToRemove.database && t.schema === tableToRemove.schema && t.table === tableToRemove.table)
        ));
        const tableKeyToRemove = `${tableToRemove.database}.${tableToRemove.schema}.${tableToRemove.table}`;
        setAllSourceColumnsData(prev => {
            const newState = { ...prev };
            delete newState[tableKeyToRemove];
            return newState;
        });
        setManuallyDefinedPKs(prev => prev.filter(pk => pk.tableKey !== tableKeyToRemove));
    }, [setSelectedSourceTables]);

    const handleTogglePrimaryKey = useCallback((tableKey: string, columnName: string) => {
        const isCurrentlyPk = manuallyDefinedPKs.some(pk => pk.tableKey === tableKey && pk.columnName === columnName);
        const [database_name, schema_name, table_name] = tableKey.split('.');

        if (!isCurrentlyPk) {
            addPrimaryKey({ project_id: projectId, database_name, schema_name, table_name, column_names: [columnName] })
                .then(response => {
                    toast({ title: "Primary Key", description: response.message, variant: "success" });
                    setManuallyDefinedPKs(prev => [...prev, { tableKey, columnName }]);
                })
                .catch(error => {
                    toast({ title: "Error", description: `Failed to set primary key: ${error.message}`, variant: "destructive" });
                });
        } else {
            // NOTE: Add a 'removePrimaryKey' service if your API supports it.
            // For now, we just remove it from the local state.
            setManuallyDefinedPKs(prev => prev.filter(pk => !(pk.tableKey === tableKey && pk.columnName === columnName)));
            toast({ title: "Primary Key", description: "Primary key removed from local selection.", variant: "info" });
        }
    }, [manuallyDefinedPKs, projectId, toast]);

    const handleNextClick = useCallback(async () => {
        const primaryKeysForMapping: { source: { [key: string]: string[] }; target: string[] } = { source: {}, target: [] };
        const targetTableKey = selectedTargetTable ? `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}` : '';

        manuallyDefinedPKs.forEach(pk => {
            if (pk.tableKey === targetTableKey) {
                primaryKeysForMapping.target.push(pk.columnName);
            } else {
                if (!primaryKeysForMapping.source[pk.tableKey]) {
                    primaryKeysForMapping.source[pk.tableKey] = [];
                }
                primaryKeysForMapping.source[pk.tableKey].push(pk.columnName);
            }
        });

        updateMappingData({
            primary_keys: primaryKeysForMapping,
            source_database: selectedSourceTables[0]?.database || mappingData.source_database,
            source_schema: selectedSourceTables[0]?.schema || mappingData.source_schema,
            source_table: selectedSourceTables[0]?.table || mappingData.source_table,
            target_database: selectedTargetTable?.database || mappingData.target_database,
            target_schema: selectedTargetTable?.schema || mappingData.target_schema,
            target_table: selectedTargetTable?.table || mappingData.target_table,
        });
        onNext();
    }, [selectedSourceTables, selectedTargetTable, manuallyDefinedPKs, updateMappingData, onNext, toast, projectId, username, mappingData]);
    
    return (
        <Card className="p-4">
            <CardHeader>
                <CardTitle>Step 1: Primary Key Management</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Select source and target tables, then define the Primary Keys for each.
                </p>
            </CardHeader>
            <CardContent className="space-y-8">
                {/* Source Table Selection */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Select Source Tables</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                            <Label htmlFor="source-database">Source Database</Label>
                            <Select onValueChange={(db) => setCurrentSourceSelection({ database: db, schema: '', table: '' })} value={currentSourceSelection.database}>
                                <SelectTrigger><SelectValue placeholder="Select Database" /></SelectTrigger>
                                <SelectContent>
                                    {databases.map(db => <SelectItem key={db} value={db}>{db}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="source-schema">Source Schema</Label>
                            <Select onValueChange={(schema) => setCurrentSourceSelection(prev => ({ ...prev, schema, table: '' }))} value={currentSourceSelection.schema} disabled={!currentSourceSelection.database}>
                                <SelectTrigger><SelectValue placeholder="Select Schema" /></SelectTrigger>
                                <SelectContent>
                                    {currentSourceSchemas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="source-table">Source Table</Label>
                            <Select onValueChange={(table) => setCurrentSourceSelection(prev => ({ ...prev, table }))} value={currentSourceSelection.table} disabled={!currentSourceSelection.schema}>
                                <SelectTrigger><SelectValue placeholder="Select Table" /></SelectTrigger>
                                <SelectContent>
                                    {currentSourceTables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleAddSourceTable} disabled={!currentSourceSelection.table}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Source
                        </Button>
                    </div>
                    {selectedSourceTables.length > 0 && (
                        <div className="border p-3 rounded-md mt-4">
                            <h4 className="text-md font-semibold mb-2">Selected Source Tables:</h4>
                            <div className="flex flex-wrap gap-2">
                                {selectedSourceTables.map(t => (
                                    <Badge key={`${t.database}.${t.schema}.${t.table}`} variant="secondary" className="pr-1">
                                        {`${t.database}.${t.schema}.${t.table}`}
                                        <XCircle className="ml-2 h-4 w-4 cursor-pointer" onClick={() => handleRemoveSourceTable(t)} />
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Target Table Selection */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Select Target Table</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label htmlFor="target-database">Target Database</Label>
                            <Select onValueChange={(db) => setSelectedTargetTable({ database: db, schema: '', table: '' })} value={selectedTargetTable?.database || ''}>
                                <SelectTrigger><SelectValue placeholder="Select Database" /></SelectTrigger>
                                <SelectContent>
                                    {databases.map(db => <SelectItem key={db} value={db}>{db}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="target-schema">Target Schema</Label>
                            <Select onValueChange={(schema) => setSelectedTargetTable(prev => ({ ...prev!, schema, table: '' }))} value={selectedTargetTable?.schema || ''} disabled={!selectedTargetTable?.database}>
                                <SelectTrigger><SelectValue placeholder="Select Schema" /></SelectTrigger>
                                <SelectContent>
                                    {targetSchemas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="target-table">Target Table</Label>
                            <Select onValueChange={(table) => setSelectedTargetTable(prev => ({ ...prev!, table }))} value={selectedTargetTable?.table || ''} disabled={!selectedTargetTable?.schema}>
                                <SelectTrigger><SelectValue placeholder="Select Table" /></SelectTrigger>
                                <SelectContent>
                                    {targetTables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Column Display and PK Selection */}
                {(Object.keys(allSourceColumnsData).length > 0 || targetColumnsData.length > 0) && (
                    <div className="space-y-6 mt-6">
                        <h3 className="text-lg font-semibold">Define Primary Keys</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {Object.entries(allSourceColumnsData).map(([tableKey, columns]) => (
                                <Card key={tableKey}>
                                    <CardHeader><CardTitle>Source: {tableKey.split('.').pop()}</CardTitle></CardHeader>
                                    <CardContent className="max-h-60 overflow-y-auto">
                                        <ul className="space-y-1">
                                            {columns.map(col => {
                                                const isPk = manuallyDefinedPKs.some(pk => pk.tableKey === tableKey && pk.columnName === col.name);
                                                return (
                                                    <li key={`${tableKey}-${col.name}`} className="flex items-center gap-2">
                                                        <input type="checkbox" id={`pk-${tableKey}-${col.name}`} checked={isPk} onChange={() => handleTogglePrimaryKey(tableKey, col.name)} />
                                                        <Label htmlFor={`pk-${tableKey}-${col.name}`}>{col.name} <span className="text-muted-foreground">({col.data_type})</span></Label>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </CardContent>
                                </Card>
                            ))}
                            {selectedTargetTable && targetColumnsData.length > 0 && (
                                <Card>
                                    <CardHeader><CardTitle>Target: {selectedTargetTable.table}</CardTitle></CardHeader>
                                    <CardContent className="max-h-60 overflow-y-auto">
                                        <ul className="space-y-1">
                                            {targetColumnsData.map(col => {
                                                const targetTableKey = `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`;
                                                const isPk = manuallyDefinedPKs.some(pk => pk.tableKey === targetTableKey && pk.columnName === col.name);
                                                return (
                                                    <li key={`target-${col.name}`} className="flex items-center gap-2">
                                                        <input type="checkbox" id={`pk-target-${col.name}`} checked={isPk} onChange={() => handleTogglePrimaryKey(targetTableKey, col.name)} />
                                                        <Label htmlFor={`pk-target-${col.name}`}>{col.name} <span className="text-muted-foreground">({col.data_type})</span></Label>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex justify-between gap-2 mt-8">
                    <Button variant="outline" onClick={onBack}>Back</Button>
                    <Button onClick={handleNextClick}>Next</Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step1PrimaryKeyFK;
