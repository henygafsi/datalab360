'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Label,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui';
import { Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import { storeSelectedColumns } from './storeSelectedColumns';

// --- Interface Definitions ---
interface TableSelection {
    database: string;
    schema: string;
    table: string;
}

interface ColumnAttributes {
    is_nullable: boolean;
    is_primary_key: boolean;
    is_foreign_key: boolean;
    is_required_for_mapping: boolean;
    data_type?: string;
    length?: number;
}

interface ColumnDetail extends ColumnAttributes {
    name: string;
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
        source_table_key: string;
    }>;
    new_target_columns: Array<{ name: string; type: string; nullable: boolean; length?: number; }>;
    primary_keys?: { source: { [key: string]: string[] }; target: string[] };
    column_attributes?: { [tableName: string]: { [columnName: string]: ColumnAttributes } };
}

interface Step2Props {
    onNext: () => void;
    onBack: () => void;
    updateMappingData: (newData: Partial<MappingData>) => void;
    selectedSourceTable: TableSelection | null;
    selectedTargetTable: TableSelection | null;
    projectId: string;
    username: string;
    mappingData: MappingData;
}

const Step2RequiredNull: React.FC<Step2Props> = ({
    onNext,
    onBack,
    updateMappingData,
    selectedSourceTable,
    selectedTargetTable,
    projectId,
    username,
    mappingData,
}) => {
    const { toast } = useToast();
    const [sourceColumns, setSourceColumns] = useState<ColumnDetail[]>([]);
    const [targetColumns, setTargetColumns] = useState<ColumnDetail[]>([]);
    const [loading, setLoading] = useState(true);
    const [internalColumnAttributes, setInternalColumnAttributes] = useState<{
        [tableName: string]: { [columnName: string]: ColumnAttributes };
    }>(mappingData.column_attributes || {});
    const [sourceSearch, setSourceSearch] = useState('');
    const [targetSearch, setTargetSearch] = useState('');
    const [selectAllSource, setSelectAllSource] = useState(false);
    const [selectAllTarget, setSelectAllTarget] = useState(false);

    const fetchAndInitializeColumns = useCallback(async () => {
        if (!selectedSourceTable || !selectedTargetTable) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const [sourceColsResult, targetColsResult] = await Promise.all([
                getTableColumns(selectedSourceTable.database, selectedSourceTable.schema, selectedSourceTable.table),
                getTableColumns(selectedTargetTable.database, selectedTargetTable.schema, selectedTargetTable.table),
            ]);
            
            const processColumns = (cols: any[], table: TableSelection): ColumnDetail[] => {
                const tableKey = table.table;
                return cols.map((col: any) => {
                    const colName = col.name || col.COLUMN_NAME;
                    const restoredAttrs = mappingData.column_attributes?.[tableKey]?.[colName] || {};
                    const isPrimaryKey = (table.table === selectedTargetTable.table) 
                        ? (mappingData.primary_keys?.target || []).includes(colName)
                        : (mappingData.primary_keys?.source[`${table.database}.${table.schema}.${table.table}`] || []).includes(colName);

                    return {
                        name: colName,
                        data_type: restoredAttrs.data_type || col.data_type || col.type || 'UNKNOWN',
                        is_nullable: restoredAttrs.is_nullable !== undefined ? restoredAttrs.is_nullable : (col.is_nullable || col.IS_NULLABLE === 'YES'),
                        is_primary_key: isPrimaryKey || false,
                        is_foreign_key: restoredAttrs.is_foreign_key || false,
                        is_required_for_mapping: restoredAttrs.is_required_for_mapping || isPrimaryKey || false,
                        length: restoredAttrs.length || col.length,
                    };
                });
            };

            const processedSourceCols = processColumns(sourceColsResult, selectedSourceTable);
            const processedTargetCols = processColumns(targetColsResult, selectedTargetTable);
            setSourceColumns(processedSourceCols);
            setTargetColumns(processedTargetCols);
            
            const newInternalAttributes = { ...(mappingData.column_attributes || {}) };
            if (!newInternalAttributes[selectedSourceTable.table]) newInternalAttributes[selectedSourceTable.table] = {};
            processedSourceCols.forEach(col => {
                newInternalAttributes[selectedSourceTable.table][col.name] = col;
            });
            if (!newInternalAttributes[selectedTargetTable.table]) newInternalAttributes[selectedTargetTable.table] = {};
            processedTargetCols.forEach(col => {
                newInternalAttributes[selectedTargetTable.table][col.name] = col;
            });
            setInternalColumnAttributes(newInternalAttributes);

        } catch (error: any) {
            toast({
                title: 'Error',
                description: `Failed to load column details: ${error.message}`,
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    }, [selectedSourceTable, selectedTargetTable, mappingData]);

    useEffect(() => {
        fetchAndInitializeColumns();
    }, [fetchAndInitializeColumns]);

    const handleRequiredToggle = useCallback((tableName: string, columnName: string, isRequired: boolean) => {
        setInternalColumnAttributes(prev => {
            const newAttributes = JSON.parse(JSON.stringify(prev));
            if (!newAttributes[tableName]) newAttributes[tableName] = {};
            if (!newAttributes[tableName][columnName]) newAttributes[tableName][columnName] = {} as ColumnAttributes;
            newAttributes[tableName][columnName].is_required_for_mapping = isRequired;
            return newAttributes;
        });
    }, []);

    const handleSelectAll = useCallback((table: TableSelection | null, columns: ColumnDetail[], select: boolean) => {
        if (!table) return;
        const tableName = table.table;
        setInternalColumnAttributes(prev => {
            const newAttrs = JSON.parse(JSON.stringify(prev));
            if (!newAttrs[tableName]) newAttrs[tableName] = {};
            columns.forEach(col => {
                if (!col.is_primary_key) {
                    if (!newAttrs[tableName][col.name]) newAttrs[tableName][col.name] = {} as ColumnAttributes;
                    newAttrs[tableName][col.name].is_required_for_mapping = select;
                }
            });
            return newAttrs;
        });
    }, []);
    
    const handleNextStep = useCallback(async () => {
        if (!projectId || !username || !selectedSourceTable || !selectedTargetTable) {
            toast({ title: 'Error', description: 'Project, user, or table selection missing.', variant: 'destructive' });
            return;
        }

        try {
            const getSelectedCols = (table: TableSelection) => {
                return Object.values(internalColumnAttributes[table.table] || {})
                    .filter(attr => attr.is_required_for_mapping)
                    .map(attr => (attr as ColumnDetail).name);
            };

            await storeSelectedColumns({
                project_id: projectId,
                database_name: selectedSourceTable.database,
                schema_name: selectedSourceTable.schema,
                table_name: selectedSourceTable.table,
                selected_columns: getSelectedCols(selectedSourceTable),
            });

            await storeSelectedColumns({
                project_id: projectId,
                database_name: selectedTargetTable.database,
                schema_name: selectedTargetTable.schema,
                table_name: selectedTargetTable.table,
                selected_columns: getSelectedCols(selectedTargetTable),
            });

            updateMappingData({ column_attributes: internalColumnAttributes });
            toast({ title: 'Required Columns Saved', description: 'Your selections have been saved.', variant: 'success' });
            onNext();
        } catch (error: any) {
            toast({
                title: 'Error Saving Selections',
                description: `Failed to save column requirements: ${error.message}`,
                variant: 'destructive',
            });
        }
    }, [
        projectId, username, selectedSourceTable, selectedTargetTable, internalColumnAttributes, 
        updateMappingData, toast, onNext
    ]);

    const filteredSourceColumns = sourceColumns.filter(col =>
        col.name.toLowerCase().includes(sourceSearch.toLowerCase())
    );

    const filteredTargetColumns = targetColumns.filter(col =>
        col.name.toLowerCase().includes(targetSearch.toLowerCase())
    );

    if (loading) {
        return (
            <Card className="p-4">
                <CardHeader><CardTitle>Step 2: Define Required Columns</CardTitle></CardHeader>
                <CardContent className="flex items-center justify-center py-10">
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                    <span>Loading column details...</span>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="p-4">
            <CardHeader>
                <CardTitle>Step 2: Define Required Columns</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Select which columns are required for mapping. Primary keys are required by default.
                </p>
            </CardHeader>
            <CardContent className="space-y-8">
                {selectedSourceTable && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">Source Table: {selectedSourceTable.table}</h3>
                            <div className="flex items-center gap-2">
                                <Input placeholder="Search columns..." value={sourceSearch} onChange={e => setSourceSearch(e.target.value)} className="w-48" />
                                <Button variant="outline" onClick={() => handleSelectAll(selectedSourceTable, sourceColumns, false)}>Deselect All</Button>
                                <Button onClick={() => handleSelectAll(selectedSourceTable, sourceColumns, true)}>Select All</Button>
                            </div>
                        </div>
                        <Table>
                            <TableHeader><TableRow><TableHead>Column</TableHead><TableHead>Data Type</TableHead><TableHead>Required for Mapping</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {filteredSourceColumns.map(col => (
                                    <TableRow key={col.name}>
                                        <TableCell>{col.name}</TableCell>
                                        <TableCell>{col.data_type}</TableCell>
                                        <TableCell>
                                            <Checkbox
                                                checked={internalColumnAttributes[selectedSourceTable.table]?.[col.name]?.is_required_for_mapping || false}
                                                onCheckedChange={checked => handleRequiredToggle(selectedSourceTable.table, col.name, !!checked)}
                                                disabled={col.is_primary_key}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
                {selectedTargetTable && (
                     <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">Target Table: {selectedTargetTable.table}</h3>
                            <div className="flex items-center gap-2">
                                <Input placeholder="Search columns..." value={targetSearch} onChange={e => setTargetSearch(e.target.value)} className="w-48" />
                                <Button variant="outline" onClick={() => handleSelectAll(selectedTargetTable, targetColumns, false)}>Deselect All</Button>
                                <Button onClick={() => handleSelectAll(selectedTargetTable, targetColumns, true)}>Select All</Button>
                            </div>
                        </div>
                        <Table>
                            <TableHeader><TableRow><TableHead>Column</TableHead><TableHead>Data Type</TableHead><TableHead>Required for Mapping</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {filteredTargetColumns.map(col => (
                                    <TableRow key={col.name}>
                                        <TableCell>{col.name}</TableCell>
                                        <TableCell>{col.data_type}</TableCell>
                                        <TableCell>
                                            <Checkbox
                                                checked={internalColumnAttributes[selectedTargetTable.table]?.[col.name]?.is_required_for_mapping || false}
                                                onCheckedChange={checked => handleRequiredToggle(selectedTargetTable.table, col.name, !!checked)}
                                                disabled={col.is_primary_key}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
                <div className="flex justify-between gap-2 mt-6">
                    <Button variant="outline" onClick={onBack} disabled={loading}>Back</Button>
                    <Button onClick={handleNextStep} disabled={loading}>Next</Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step2RequiredNull;
