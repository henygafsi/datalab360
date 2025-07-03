'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, MinusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getAuthToken } from '@/lib/auth';
import { Checkbox } from '@/components/ui/checkbox';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import { addColumnsToTable } from './addColumnsToTable';
import logWizardEvent from './page';

interface TableSelection {
    database: string;
    schema: string;
    table: string;
}

interface ColumnDetail {
    name: string;
    data_type: string;
    is_nullable: boolean;
    is_primary_key: boolean;
    is_foreign_key: boolean;
    is_required_for_mapping?: boolean;
}

interface ColumnMapping {
    source_column: string;
    target_column: string;
    data_type: string;
    source_table_key: string;
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
    primary_keys?: { source: string[]; target: string[] };
    foreign_keys?: { source: Array<{ column: string; referenced_table: string; referenced_column: string }>; target: Array<{ column: string; referenced_table: string; referenced_column: string }>; };
    column_attributes?: { [tableName: string]: { [columnName: string]: ColumnDetail } };
}

interface Step4Props {
    onNext: () => void;
    onBack: () => void;
    mappingData: MappingData;
    updateMappingData: (newData: Partial<MappingData>) => void;
    selectedSourceTable: TableSelection | null;
    selectedTargetTable: TableSelection | null;
    projectId: string;
    username: string;
}

const Step4AddColumns: React.FC<Step4Props> = ({ onNext, onBack, mappingData, updateMappingData, selectedSourceTable, selectedTargetTable, projectId, username }) => {
    const [currentColumnMappings, setCurrentColumnMappings] = useState<ColumnMapping[]>(mappingData.column_mappings || []);
    const [sourceColumns, setSourceColumns] = useState<ColumnDetail[]>([]);
    const [targetColumns, setTargetColumns] = useState<ColumnDetail[]>([]);
    const [newTargetColumns, setNewTargetColumns] = useState<NewTargetColumn[]>(mappingData.new_target_columns || []);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const fetchColumns = async () => {
            if (!selectedSourceTable || !selectedTargetTable) {
                toast({
                    title: 'Error',
                    description: 'Source or target table not selected.',
                    variant: 'destructive',
                });
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const [sourceColsResult, targetColsResult] = await Promise.all([
                    getTableColumns(selectedSourceTable.database, selectedSourceTable.schema, selectedSourceTable.table),
                    getTableColumns(selectedTargetTable.database, selectedTargetTable.schema, selectedTargetTable.table),
                ]);

                const mapFetchedColumns = (cols: any[], tableType: 'source' | 'target') => {
                    const tableName = tableType === 'source' ? selectedSourceTable!.table : selectedTargetTable!.table;
                    return cols.map((col: any) => {
                        const existingAttrs = mappingData.column_attributes?.[tableName]?.[col.name] || {};
                        return {
                            name: col.name || col.COLUMN_NAME,
                            data_type: col.data_type || col.TYPE, // Use TYPE if DATA_TYPE is not present
                            is_nullable: existingAttrs.is_nullable !== undefined ? existingAttrs.is_nullable : (col.is_nullable || col.IS_NULLABLE === 'YES'),
                            is_primary_key: existingAttrs.is_primary_key !== undefined ? existingAttrs.is_primary_key : (col.is_primary_key || col.CONSTRAINT_TYPE === 'PRIMARY KEY'),
                            is_foreign_key: existingAttrs.is_foreign_key !== undefined ? existingAttrs.is_foreign_key : (col.is_foreign_key || col.CONSTRAINT_TYPE === 'FOREIGN KEY'),
                            is_required_for_mapping: existingAttrs.is_required_for_mapping !== undefined ? existingAttrs.is_required_for_mapping : false,
                        };
                    });
                };

                setSourceColumns(mapFetchedColumns(sourceColsResult, 'source'));
                setTargetColumns(mapFetchedColumns(targetColsResult, 'target'));

            } catch (error: any) {
                console.error('Error fetching columns:', error);
                toast({
                    title: 'Error',
                    description: `Failed to load column details: ${error.message}`,
                    variant: 'destructive',
                });
                await logWizardEvent({
                    project_id: projectId,
                    event_type: "ADD_ADDITIONAL_COLUMNS", // Log FAILED event for this step
                    status: "FAILED",
                    username: username,
                    details: {
                        sourceTable: selectedSourceTable,
                        targetTable: selectedTargetTable,
                    },
                    error: error.message,
                });
            } finally {
                setLoading(false);
            }
        };

        fetchColumns();
    }, [selectedSourceTable, selectedTargetTable, toast, mappingData.column_attributes, projectId, username]);

    useEffect(() => {
        setCurrentColumnMappings(mappingData.column_mappings || []);
        setNewTargetColumns(mappingData.new_target_columns || []);
    }, [mappingData.column_mappings, mappingData.new_target_columns]);


    const handleSourceColumnChange = (index: number, newSourceColumn: string) => {
        const updatedMappings = [...currentColumnMappings];
        const sourceColDetail = sourceColumns.find(col => col.name === newSourceColumn);
        if (sourceColDetail) {
            updatedMappings[index] = {
                ...updatedMappings[index],
                source_column: newSourceColumn,
                data_type: sourceColDetail.data_type,
            };
            setCurrentColumnMappings(updatedMappings);
        }
    };

    const handleTargetColumnChange = (index: number, newTargetColumn: string) => {
        const updatedMappings = [...currentColumnMappings];
        updatedMappings[index] = { ...updatedMappings[index], target_column: newTargetColumn };
        setCurrentColumnMappings(updatedMappings);
    };

    const addMappingRow = () => {
        setCurrentColumnMappings([...currentColumnMappings, { source_column: '', target_column: '', data_type: '', source_table_key: mappingData.source_table_key || '' }]);
    };

    const removeMappingRow = (index: number) => {
        const updatedMappings = currentColumnMappings.filter((_, i) => i !== index);
        setCurrentColumnMappings(updatedMappings);
    };

    const handleAddNewTargetColumn = () => {
        setNewTargetColumns([...newTargetColumns, { name: '', type: 'VARCHAR', nullable: true }]);
    };

    const handleNewTargetColumnChange = (index: number, field: string, value: string | boolean) => {
        const updatedNewColumns = [...newTargetColumns];
        (updatedNewColumns[index] as any)[field] = value;
        setNewTargetColumns(updatedNewColumns);
    };

    const removeNewTargetColumn = (index: number) => {
        const updatedNewColumns = newTargetColumns.filter((_, i) => i !== index);
        setNewTargetColumns(updatedNewColumns);
    };

    const handleNextStep = async () => {
        if (!projectId || !username) {
            toast({
                title: 'Project Not Selected',
                description: 'Please select or create a project in the first step.',
                variant: 'destructive',
            });
            return;
        }

        for (const mapping of currentColumnMappings) {
            if (!mapping.source_column || !mapping.target_column) {
                toast({
                    title: 'Validation Error',
                    description: 'All mapped columns must have both source and target specified.',
                    variant: 'destructive',
                });
                return;
            }
        }

        for (const newCol of newTargetColumns) {
            if (!newCol.name.trim()) {
                toast({
                    title: 'Validation Error',
                    description: 'All new target columns must have a name.',
                    variant: 'destructive',
                });
                return;
            }
        }

        setLoading(true);
        try {
            if (newTargetColumns.length > 0) {
                const addColumnsPayload = {
                    project_id: projectId,
                    database_name: selectedTargetTable!.database,
                    schema_name: selectedTargetTable!.schema,
                    table_name: selectedTargetTable!.table,
                    columns: newTargetColumns.map(col => ({
                        name: col.name,
                        type: col.type,
                        nullable: col.nullable,
                    })),
                };
                const addColsResponse = await addColumnsToTable(addColumnsPayload, 'additional');
                if (addColsResponse.status !== 'success') {
                    throw new Error(addColsResponse.message || 'Failed to add new columns.');
                }
                toast({
                    title: 'New Columns Added',
                    description: addColsResponse.message || 'New columns successfully added to target table.',
                    variant: 'success',
                });
            }

            const mappingsForValidation = [{
                source_database: mappingData.source_database,
                source_schema: mappingData.source_schema,
                source_table: mappingData.source_table,
                source_columns: currentColumnMappings.map(m => m.source_column),
                target_database: selectedTargetTable!.database,
                target_schema: selectedTargetTable!.schema,
                target_table: selectedTargetTable!.table,
                target_columns: currentColumnMappings.map(m => m.target_column),
            }];

            const token = getAuthToken();
            const response = await fetch('/api/mapping/test_mapping/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ mappings: mappingsForValidation }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Column mapping validation failed.');
            }

            toast({
                title: 'Success',
                description: 'Column mappings are compatible!',
            });

            // Log SUCCESS event
            await logWizardEvent({
                project_id: projectId,
                event_type: "ADD_ADDITIONAL_COLUMNS", // Changed event type here
                status: "SUCCESS",
                username: username,
                details: {
                    columnMappings: currentColumnMappings,
                    newTargetColumns: newTargetColumns,
                },
            });

            updateMappingData({
                project_id: projectId,
                column_mappings: currentColumnMappings,
                new_target_columns: newTargetColumns,
                source_columns: currentColumnMappings.map(m => m.source_column),
                target_columns: currentColumnMappings.map(m => m.target_column),
            });

            onNext();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: `Operation failed: ${error.message}`,
                variant: 'destructive',
            });
            // Log FAILED event
            await logWizardEvent({
                project_id: projectId,
                event_type: "ADD_ADDITIONAL_COLUMNS", // Changed event type here
                status: "FAILED",
                username: username,
                details: {
                    columnMappings: currentColumnMappings,
                    newTargetColumns: newTargetColumns,
                },
                error: error.message,
            });
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Card className="p-4">
                <CardHeader><CardTitle>Step 4: Refine Mappings & Add Columns</CardTitle></CardHeader>
                <CardContent>Loading column data...</CardContent>
            </Card>
        );
    }

    return (
        <Card className="p-4">
            <CardHeader>
                <CardTitle>Step 4: Refine Mappings & Add Columns</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Review and refine your column mappings. You can also add new columns that will be created in the target table during deployment.
                </p>
            </CardHeader>
            <CardContent className="space-y-6">
                <h3 className="text-lg font-semibold mb-2">Column Mapping:</h3>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Source Column</TableHead>
                            <TableHead>Target Column</TableHead>
                            <TableHead>Data Type (Source)</TableHead>
                            <TableHead>Required for Mapping?</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {currentColumnMappings.map((mapping, index) => {
                            const sourceColInfo = sourceColumns.find(col => col.name === mapping.source_column);
                            return (
                                <TableRow key={index}>
                                    <TableCell>
                                        <Select
                                            value={mapping.source_column}
                                            onValueChange={(value) => handleSourceColumnChange(index, value)}
                                        >
                                            <SelectTrigger className="w-[180px]">
                                                <SelectValue placeholder="Select Source Column" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {sourceColumns.map((col) => (
                                                    <SelectItem key={col.name} value={col.name}>
                                                        {col.name} ({col.data_type})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={mapping.target_column}
                                            onValueChange={(value) => handleTargetColumnChange(index, value)}
                                        >
                                            <SelectTrigger className="w-[180px]">
                                                <SelectValue placeholder="Select Target Column" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {targetColumns.map((col) => (
                                                    <SelectItem key={col.name} value={col.name}>
                                                        {col.name} ({col.data_type})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>{sourceColInfo?.data_type || 'N/A'}</TableCell>
                                    <TableCell>
                                        {mappingData.column_attributes?.[selectedSourceTable?.table || '']?.[mapping.source_column]?.is_required_for_mapping ? 'Yes' : 'No'}
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => removeMappingRow(index)}>
                                            <MinusCircle className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
                <Button onClick={addMappingRow} variant="outline" className="mt-2">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Mapping Row
                </Button>

                <h3 className="text-lg font-semibold mt-6 mb-2">Add New Columns to Target Table:</h3>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Column Name</TableHead>
                            <TableHead>Data Type</TableHead>
                            <TableHead>Nullable</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {newTargetColumns.map((col, index) => (
                            <TableRow key={index}>
                                <TableCell>
                                    <Input
                                        value={col.name}
                                        onChange={(e) => handleNewTargetColumnChange(index, 'name', e.target.value)}
                                        placeholder="New Column Name"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Select
                                        value={col.type}
                                        onValueChange={(value) => handleNewTargetColumnChange(index, 'type', value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="VARCHAR">VARCHAR</SelectItem>
                                            <SelectItem value="NUMBER">NUMBER</SelectItem>
                                            <SelectItem value="BOOLEAN">BOOLEAN</SelectItem>
                                            <SelectItem value="DATE">DATE</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell>
                                    <Checkbox
                                        checked={col.nullable}
                                        onCheckedChange={(checked: boolean) => handleNewTargetColumnChange(index, 'nullable', checked)}
                                        id={`new-col-nullable-${index}`}
                                    />
                                    <Label htmlFor={`new-col-nullable-${index}`} className="ml-2">
                                        Nullable
                                    </Label>
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="icon" onClick={() => removeNewTargetColumn(index)}>
                                        <MinusCircle className="h-4 w-4 text-red-500" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Button onClick={handleAddNewTargetColumn} variant="outline" className="mt-2">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add New Target Column
                </Button>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onBack}>Back</Button>
                    <Button onClick={handleNextStep} disabled={loading}>
                        {loading ? 'Validating...' : 'Validate & Proceed to Deployment'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step4AddColumns;
