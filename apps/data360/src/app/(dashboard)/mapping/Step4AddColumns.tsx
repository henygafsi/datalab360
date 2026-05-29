'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, XCircle } from 'lucide-react';
import { getAuthSession } from '@/lib/auth';
import { getSession } from 'next-auth/react';
import axios from 'axios';
// Removed: import { getStepEventData } from './getStepEventData'; // Removed
import { getTableColumns } from '@/app/services/mapping/fetch_tables';

interface TableSelection {
    database: string;
    schema: string;
    table: string;
}

interface ColumnMapping {
    source_column: string;
    target_column: string;
    data_type: string;
    source_table_key?: string;
}

interface NewTargetColumn {
    name: string;
    type: string;
    nullable: boolean;
}

interface MappingData {
    project_id: string | null;
    source_database: string;
    source_schema: string;
    source_table: string;
    target_database: string;
    target_schema: string;
    target_table: string;
    column_mappings: ColumnMapping[];
    new_target_columns: NewTargetColumn[];
    new_target_columns_by_table?: { [tableKey: string]: NewTargetColumn[] };
    primary_keys?: { source: string[]; target: string[] };
    groups?: Array<{ sources: TableSelection[]; target: TableSelection | null }>;
}

interface Step4Props {
    onNext: () => void;
    onBack: () => void;
    mappingData: MappingData;
    updateMappingData: (newData: Partial<MappingData>, eventType: string, eventDetails: any) => void; // Updated signature
    selectedSourceTable: TableSelection | null;
    selectedTargetTable: TableSelection | null;
    projectId: string;
    username: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://www.api.datalab360.io:8443';

const Step4AddColumns: React.FC<Step4Props> = ({
    onNext,
    onBack,
    mappingData,
    updateMappingData,
    selectedSourceTable,
    selectedTargetTable,
    projectId,
    username,
}) => {
    const { toast } = useToast();
    // Initialize newColumns from mappingData.new_target_columns
    const [newColumns, setNewColumns] = useState<NewTargetColumn[]>(mappingData.new_target_columns || []);
    const [newColumnsByTarget, setNewColumnsByTarget] = useState<{ [tableKey: string]: NewTargetColumn[] }>(mappingData.new_target_columns_by_table || {});
    const [newColumnNameByTarget, setNewColumnNameByTarget] = useState<{ [tableKey: string]: string }>({});
    const [newColumnTypeByTarget, setNewColumnTypeByTarget] = useState<{ [tableKey: string]: string }>({});
    const [newColumnNullableByTarget, setNewColumnNullableByTarget] = useState<{ [tableKey: string]: boolean }>({});
    const [newColumnName, setNewColumnName] = useState('');
    const [newColumnType, setNewColumnType] = useState('VARCHAR(255)');
    const [newColumnNullable, setNewColumnNullable] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [targetColumns, setTargetColumns] = useState<string[]>([]); // Stores names of existing target columns
    const [targetColumnsByTable, setTargetColumnsByTable] = useState<{ [tableKey: string]: string[] }>({});

    const dataTypes = [
        'VARCHAR(255)',
        'NUMBER(38,0)',
        'FLOAT',
        'DATE',
        'TIMESTAMP',
        'BOOLEAN',
        'TEXT',
    ];

    // Update local state when parent mappingData.new_target_columns changes
    useEffect(() => {
        if (mappingData.new_target_columns) {
            setNewColumns(mappingData.new_target_columns);
        }
        if (mappingData.new_target_columns_by_table) {
            setNewColumnsByTarget(mappingData.new_target_columns_by_table);
        }
    }, [mappingData.new_target_columns, mappingData.new_target_columns_by_table]);

    // Fetch existing target table columns to prevent duplicates
    useEffect(() => {
        const fetchTargetColumns = async () => {
            const groups = (mappingData.groups && mappingData.groups.length > 0) ? mappingData.groups : [{ target: selectedTargetTable, sources: [] }];
            const map: { [k: string]: string[] } = {};
            for (const g of groups) {
                if (g.target) {
                    try {
                        const columns = await getTableColumns(
                            g.target.database,
                            g.target.schema,
                            g.target.table
                        );
                        map[`${g.target.database}.${g.target.schema}.${g.target.table}`] = columns.map(col => col.name || (col as any).COLUMN_NAME);
                    } catch (error: any) {
                        console.error('Error fetching target table columns:', error);
                        toast({ title: 'Error', description: `Failed to fetch existing target table columns: ${error.message || 'An unexpected error occurred.'}`, variant: 'destructive' });
                    }
                }
            }
            setTargetColumnsByTable(map);
            if (selectedTargetTable) {
                const key = `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`;
                setTargetColumns(map[key] || []);
            }
        };
        fetchTargetColumns();
    }, [selectedTargetTable, toast, mappingData.groups]);

    const handleAddColumn = useCallback((tKey?: string) => {
        if (!newColumnName.trim()) {
            toast({
                title: 'Validation Error',
                description: 'Column name is required.',
                variant: 'destructive',
            });
            return;
        }
        const newCol: NewTargetColumn = {
            name: newColumnName.trim(),
            type: newColumnType,
            nullable: newColumnNullable,
        };
        if (tKey) {
            const exists = new Set([...(targetColumnsByTable[tKey] || []).map(n => n.toLowerCase()), ...((newColumnsByTarget[tKey] || []).map(c => c.name.toLowerCase()))]);
            if (exists.has(newCol.name.toLowerCase())) {
                toast({ title: 'Validation Error', description: `Column name '${newCol.name}' already exists in the target table or in the list of new columns.`, variant: 'destructive' });
                return;
            }
            setNewColumnsByTarget(prev => ({ ...prev, [tKey]: [ ...(prev[tKey] || []), newCol ] }));
            setNewColumnNameByTarget(prev => ({ ...prev, [tKey]: '' }));
            setNewColumnTypeByTarget(prev => ({ ...prev, [tKey]: 'VARCHAR(255)' }));
            setNewColumnNullableByTarget(prev => ({ ...prev, [tKey]: true }));
        } else {
            const allExistingColumnNames = new Set([...newColumns.map(col => col.name.toLowerCase()), ...targetColumns.map(name => name.toLowerCase())]);
            if (allExistingColumnNames.has(newColumnName.toLowerCase())) {
                toast({ title: 'Validation Error', description: `Column name '${newColumnName}' already exists in the target table or in the list of new columns.`, variant: 'destructive' });
                return;
            }
            setNewColumns(prev => [...prev, newCol]);
            setNewColumnName('');
            setNewColumnType('VARCHAR(255)');
            setNewColumnNullable(true);
        }
    }, [newColumnName, newColumnType, newColumnNullable, newColumns, targetColumns, toast, targetColumnsByTable, newColumnsByTarget]);

    const handleRemoveColumn = useCallback((name: string, tKey?: string) => {
        if (tKey) {
            setNewColumnsByTarget(prev => ({ ...prev, [tKey]: (prev[tKey] || []).filter(c => c.name !== name) }));
        } else {
            setNewColumns(prev => prev.filter(col => col.name !== name));
        }
    }, []);

    const handleSaveAndProceed = useCallback(async () => {
        if (!projectId) {
            toast({
                title: 'Validation Error',
                description: 'Project ID is required to save columns.',
                variant: 'destructive',
            });
            return;
        }

        setIsLoading(true);
        try {
            const session = await getSession();
            if (!session?.user?.access_token) {
                throw new Error('No access token available');
            }
            const token = session.user.access_token;

            const groups = (mappingData.groups && mappingData.groups.length > 0) ? mappingData.groups : [{ target: selectedTargetTable, sources: [] }];
            if (mappingData.groups && mappingData.groups.length > 0) {
                for (const g of groups) {
                    if (!g.target) continue;
                    const tKey = `${g.target.database}.${g.target.schema}.${g.target.table}`;
                    const cols = newColumnsByTarget[tKey] || [];
                    if (cols.length === 0) continue;
                    const addColumnsPayload = {
                        project_id: projectId,
                        database_name: g.target.database,
                        schema_name: g.target.schema,
                        table_name: g.target.table,
                        columns: cols.map(col => ({ name: col.name, type: col.type, default: '', comment: '' })),
                    };
                    // TODO(backend): POST /explore-design/guided/add-columns — endpoint not in API; wire it or remove this call
                    const addColumnsResponse = await axios.post(
                        `${API_BASE_URL}/explore-design/guided/add-columns`,
                        addColumnsPayload,
                        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
                    );
                    if (addColumnsResponse.data.status !== 'success') {
                        throw new Error(addColumnsResponse.data.detail || 'Failed to add columns to database.');
                    }
                }
            } else if (newColumns.length > 0 && selectedTargetTable) {
                const addColumnsPayload = {
                    project_id: projectId,
                    database_name: selectedTargetTable.database,
                    schema_name: selectedTargetTable.schema,
                    table_name: selectedTargetTable.table,
                    columns: newColumns.map(col => ({
                        name: col.name,
                        type: col.type,
                        // Provide default and comment as empty strings to match backend schema
                        default: '',
                        comment: '',
                        // Note: `nullable` is a frontend concept for DDL generation.
                        // The backend's `add_columns` function only uses `name` and `type`
                        // to build `ALTER TABLE ... ADD COLUMN name TYPE`.
                        // If `NULL`/`NOT NULL` needs to be part of the DDL,
                        // the backend's `add_columns` function needs to be updated to handle `nullable`
                        // and append `NULL` or `NOT NULL` to the column definition string.
                        // For now, we are just sending `name` and `type` to the backend's `add_columns`
                        // which is what it currently uses for SQL generation.
                    })),
                };

                // TODO(backend): POST /explore-design/guided/add-columns — endpoint not in API; wire it or remove this call
                const addColumnsResponse = await axios.post(
                    `${API_BASE_URL}/explore-design/guided/add-columns`,
                    addColumnsPayload,
                    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
                );

                if (addColumnsResponse.data.status !== 'success') {
                    throw new Error(addColumnsResponse.data.detail || 'Failed to add columns to database.');
                }

                toast({
                    title: 'Columns Added',
                    description: 'Additional columns successfully added to target table in database.',
                });
            } else {
                toast({
                    title: 'No New Columns',
                    description: 'No additional columns to add. Proceeding to deployment step.',
                });
            }

            // Update parent's mappingData, which will trigger backend logging
            await updateMappingData({ new_target_columns: newColumns, new_target_columns_by_table: newColumnsByTarget }, "ADD_ADDITIONAL_COLUMNS", { columns: newColumns, by_table: newColumnsByTarget });

            onNext(); // Move to Step 5
        } catch (error: any) {
            console.error('Error saving columns:', error);
            toast({
                title: 'Error',
                description: `Failed to save or add columns: ${error.response?.data?.detail || error.message || 'An unexpected error occurred.'}`,
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    }, [projectId, selectedTargetTable, newColumns, updateMappingData, toast, onNext]);


    return (
        <Card className="p-6">
            <CardHeader>
                <CardTitle>Step 3: Add Optional Columns</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Define and add optional columns to the target table before final deployment.
                </p>
            </CardHeader>
            <CardContent className="space-y-6">
                {(mappingData.groups && mappingData.groups.length > 0) ? (
                    <div className="space-y-6">
                        {mappingData.groups.map((g, idx) => g.target && (
                            <details key={`grp-${idx}`} className="rounded-md border p-2 space-y-4" open>
                                <summary className="cursor-pointer select-none font-medium">Group {idx + 1} — Target: {g.target.database}.{g.target.schema}.{g.target.table}</summary>
                                {(() => {
                                    const tKey = `${g.target!.database}.${g.target!.schema}.${g.target!.table}`;
                                    const nameVal = newColumnNameByTarget[tKey] ?? '';
                                    const typeVal = newColumnTypeByTarget[tKey] ?? 'VARCHAR(255)';
                                    const nullableVal = newColumnNullableByTarget[tKey] ?? true;
                                    const pending = newColumnsByTarget[tKey] || [];
                                    const existing = targetColumnsByTable[tKey] || [];
                                    return (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                                <div>
                                                    <Label>Column Name</Label>
                                                    <Input value={nameVal} onChange={(e) => setNewColumnNameByTarget(prev => ({ ...prev, [tKey]: e.target.value }))} placeholder="Enter column name" />
                                                </div>
                                                <div>
                                                    <Label>Data Type</Label>
                                                    <Select value={typeVal} onValueChange={(v) => setNewColumnTypeByTarget(prev => ({ ...prev, [tKey]: v }))}>
                                                        <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                                                        <SelectContent>
                                                            {dataTypes.map(dt => <SelectItem key={dt} value={dt}>{dt}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div>
                                                    <Label>Nullable</Label>
                                                    <Select value={nullableVal ? 'true' : 'false'} onValueChange={(v) => setNewColumnNullableByTarget(prev => ({ ...prev, [tKey]: v === 'true' }))}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="true">True</SelectItem>
                                                            <SelectItem value="false">False</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <Button onClick={() => { setNewColumnName(nameVal); setNewColumnType(typeVal); setNewColumnNullable(nullableVal); handleAddColumn(tKey); }}>
                                                    <PlusCircle className="mr-2 h-4 w-4" /> Add Column
                                                </Button>
                                            </div>
                                            <p className="text-xs text-muted-foreground">Existing: {existing.join(', ') || 'none'}</p>
                                            {pending.length > 0 && (
                                                <div className="border p-4 rounded-md">
                                                    <h4 className="text-md font-semibold mb-2">Pending Columns</h4>
                                                    <ul className="flex flex-wrap gap-2">
                                                        {pending.map(col => (
                                                            <li key={`${tKey}-${col.name}`} className="flex items-center gap-2 border rounded px-2 py-1 bg-muted/30">
                                                                <span>{col.name} <span className="text-muted-foreground">({col.type})</span> {col.nullable ? '' : '• NOT NULL'}</span>
                                                                <XCircle className="h-4 w-4 cursor-pointer" onClick={() => handleRemoveColumn(col.name, tKey)} />
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </details>
                        ))}
                        <div className="flex justify-between gap-2 mt-6">
                            <Button variant="outline" onClick={onBack}>Back</Button>
                            <Button onClick={handleSaveAndProceed} disabled={isLoading}>{isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Next'}</Button>
                        </div>
                    </div>
                ) : selectedTargetTable ? (
                    <>
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Add New Columns to Target Table</h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <div>
                                    <Label htmlFor="new-column-name">Column Name</Label>
                                    <Input
                                        id="new-column-name"
                                        value={newColumnName}
                                        onChange={(e) => setNewColumnName(e.target.value)}
                                        placeholder="Enter column name"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="new-column-type">Data Type</Label>
                                    <Select value={newColumnType} onValueChange={setNewColumnType}>
                                        <SelectTrigger id="new-column-type">
                                            <SelectValue placeholder="Select data type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {dataTypes.map((type) => (
                                                <SelectItem key={type} value={type}>
                                                    {type}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="new-column-nullable">Nullable</Label>
                                    <Select
                                        value={newColumnNullable ? 'YES' : 'NO'}
                                        onValueChange={(val) => setNewColumnNullable(val === 'YES')}
                                    >
                                        <SelectTrigger id="new-column-nullable">
                                            <SelectValue placeholder="Nullable?" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="YES">Yes</SelectItem>
                                            <SelectItem value="NO">No</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button onClick={() => handleAddColumn()} disabled={isLoading || !newColumnName.trim()}>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Add Column
                                </Button>
                            </div>
                        </div>

                        {newColumns.length > 0 && (
                            <div className="border p-4 rounded-md">
                                <h4 className="text-md font-semibold mb-2">New Columns to be Added:</h4>
                                <div className="space-y-2">
                                    {newColumns.map((col) => (
                                        <div key={col.name} className="flex items-center justify-between bg-gray-100 p-2 rounded">
                                            <span>
                                                {col.name} ({col.type}, {col.nullable ? 'Nullable' : 'Not Nullable'})
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveColumn(col.name)}
                                            >
                                                <XCircle className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex justify-between gap-2 mt-6">
                            <Button variant="outline" onClick={onBack} disabled={isLoading}>
                                Back
                            </Button>
                            <Button
                                onClick={handleSaveAndProceed}
                                disabled={isLoading || !projectId}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving & Proceeding...
                                    </>
                                ) : (
                                    'Save Columns & Proceed'
                                )}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground">Please select a target table in previous steps to add columns.</p>
                        <div className="flex justify-between gap-2 mt-6">
                            <Button variant="outline" onClick={onBack} disabled={isLoading}>
                                Back
                            </Button>
                            <Button
                                onClick={handleSaveAndProceed}
                                disabled={isLoading || !selectedTargetTable || !projectId}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving & Proceeding...
                                    </>
                                ) : (
                                    'Save Columns & Proceed'
                                )}
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
};

export default Step4AddColumns;
