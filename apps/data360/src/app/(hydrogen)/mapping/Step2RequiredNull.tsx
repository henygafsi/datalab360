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
} from '@/components/ui';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import logWizardEvent from './page';
import { storeSelectedColumns } from './storeSelectedColumns'; // NEW: Import storeSelectedColumns
import { describeSelectedColumns } from './describeSelectedColumns'; // NEW: Import describeSelectedColumns

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
    new_target_columns: Array<{ name: string; type: string; nullable: boolean }>;
    primary_keys?: { source: string[]; target: string[] };
    foreign_keys?: { source: Array<{ column: string; referenced_table: string; referenced_column: string }>; target: Array<{ column: string; referenced_table: string; referenced_column: string }>; };
    column_attributes?: { [tableName: string]: { [columnName: string]: ColumnAttributes } };
}

interface Step2Props {
    onNext: () => void;
    onBack: () => void;
    mappingData: MappingData;
    updateMappingData: (newData: Partial<MappingData>) => void;
    selectedSourceTable: TableSelection | null;
    selectedTargetTable: TableSelection | null;
    projectId: string;
    username: string;
}

const Step2RequiredNull: React.FC<Step2Props> = ({
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
    const [sourceColumns, setSourceColumns] = useState<ColumnDetail[]>([]);
    const [targetColumns, setTargetColumns] = useState<ColumnDetail[]>([]);
    const [loading, setLoading] = useState(true);

    const [internalColumnAttributes, setInternalColumnAttributes] = useState<
        { [tableName: string]: { [columnName: string]: ColumnAttributes } }
    >(mappingData.column_attributes || {});

    useEffect(() => {
        const fetchColumns = async () => {
            if (!selectedSourceTable || !selectedTargetTable) {
                toast({
                    title: 'Error',
                    description: 'Source or target table not selected. Please go back to Step 1.',
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

                // Helper to map fetched columns and apply existing attributes
                const mapFetchedColumns = (cols: any[], tableType: 'source' | 'target') => {
                    const tableName = tableType === 'source' ? selectedSourceTable!.table : selectedTargetTable!.table;
                    return cols.map((col: any) => {
                        const existingAttrs = internalColumnAttributes[tableName]?.[col.name] || {};
                        return {
                            name: col.name || col.COLUMN_NAME,
                            data_type: col.data_type || col.type,
                            is_nullable: existingAttrs.is_nullable !== undefined ? existingAttrs.is_nullable : (col.is_nullable || col.IS_NULLABLE === 'YES'),
                            is_primary_key: existingAttrs.is_primary_key !== undefined ? existingAttrs.is_primary_key : (col.is_primary_key || col.CONSTRAINT_TYPE === 'PRIMARY KEY'),
                            is_foreign_key: existingAttrs.is_foreign_key !== undefined ? existingAttrs.is_foreign_key : (col.is_foreign_key || col.CONSTRAINT_TYPE === 'FOREIGN KEY'),
                            is_required_for_mapping: existingAttrs.is_required_for_mapping !== undefined ? existingAttrs.is_required_for_mapping : false,
                        };
                    });
                };

                setSourceColumns(mapFetchedColumns(sourceColsResult, 'source'));
                setTargetColumns(mapFetchedColumns(targetColsResult, 'target'));

                // NEW: Fetch previously selected required columns if project_id exists
                if (projectId && selectedSourceTable) {
                    try {
                        const describeResult = await describeSelectedColumns(
                            projectId,
                            selectedSourceTable.database,
                            selectedSourceTable.schema,
                            selectedSourceTable.table
                        );

                        if (describeResult.describe_filtered && describeResult.describe_filtered.length > 0) {
                            const previouslyRequiredColumnNames = new Set(describeResult.describe_filtered.map(row => row[0])); // row[0] is column name

                            setInternalColumnAttributes(prev => {
                                const newAttrs = { ...prev };
                                if (!newAttrs[selectedSourceTable.table]) {
                                    newAttrs[selectedSourceTable.table] = {};
                                }
                                // Update existing source columns based on fetched required columns
                                sourceColsResult.forEach((col: any) => {
                                    const colName = col.name || col.COLUMN_NAME;
                                    newAttrs[selectedSourceTable.table][colName] = {
                                        ...newAttrs[selectedSourceTable.table][colName],
                                        is_required_for_mapping: previouslyRequiredColumnNames.has(colName),
                                    };
                                });
                                return newAttrs;
                            });
                        }
                    } catch (fetchError: any) {
                        console.warn("Could not fetch previously selected columns:", fetchError.message);
                        // This is a soft error, don't block the UI, just log it.
                    }
                }


            } catch (error: any) {
                console.error('Error fetching columns:', error);
                toast({
                    title: 'Error',
                    description: `Failed to load column details: ${error.message}`,
                    variant: 'destructive',
                });
                await logWizardEvent({
                    project_id: projectId,
                    event_type: "ADD_COLUMNS_REQUIRED",
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
    }, [selectedSourceTable, selectedTargetTable, toast, projectId, username]); // Removed internalColumnAttributes from deps to prevent infinite loop

    const handleRequiredToggle = useCallback((tableName: string, columnName: string, isRequired: boolean) => {
        setInternalColumnAttributes(prev => {
            const newAttributes = { ...prev };
            if (!newAttributes[tableName]) {
                newAttributes[tableName] = {};
            }
            newAttributes[tableName][columnName] = {
                ...newAttributes[tableName][columnName],
                is_required_for_mapping: isRequired,
            };
            return newAttributes;
        });
    }, []);

    const handleNullableToggle = useCallback((tableName: string, columnName: string, isNullable: boolean) => {
        setInternalColumnAttributes(prev => {
            const newAttributes = { ...prev };
            if (!newAttributes[tableName]) {
                newAttributes[tableName] = {};
            }
            newAttributes[tableName][columnName] = {
                ...newAttributes[tableName][columnName],
                is_nullable: isNullable,
            };
            return newAttributes;
        });
    }, []);

    const handleNextStep = useCallback(async () => {
        if (!projectId || !username || !selectedSourceTable) {
            toast({ title: 'Error', description: 'Project, user, or source table not available.', variant: 'destructive' });
            return;
        }

        const sourceTableAttrs = internalColumnAttributes[selectedSourceTable.table] || {};
        const selectedRequiredColumns = Object.entries(sourceTableAttrs)
            .filter(([, attrs]) => attrs.is_required_for_mapping)
            .map(([colName,]) => colName);

        try {
            // NEW: Store selected columns in the backend
            await storeSelectedColumns({
                project_id: projectId,
                selected_columns: selectedRequiredColumns,
                source_table: selectedSourceTable.table,
            });
            toast({ title: 'Columns Saved', description: 'Required columns configuration saved.', variant: 'success' });

            // Log SUCCESS event before proceeding
            await logWizardEvent({
                project_id: projectId,
                event_type: "ADD_COLUMNS_REQUIRED",
                status: "SUCCESS",
                username: username,
                details: {
                    columnAttributes: internalColumnAttributes,
                    sourceTable: selectedSourceTable,
                    targetTable: selectedTargetTable,
                },
            });

            updateMappingData({
                project_id: projectId,
                column_attributes: internalColumnAttributes,
            });
            onNext();
        } catch (error: any) {
            console.error("Error saving columns or logging event:", error);
            toast({
                title: 'Error',
                description: `Failed to save column configuration: ${error.message}`,
                variant: 'destructive',
            });
            // Log FAILED event
            await logWizardEvent({
                project_id: projectId,
                event_type: "ADD_COLUMNS_REQUIRED",
                status: "FAILED",
                username: username,
                details: {
                    columnAttributes: internalColumnAttributes,
                    sourceTable: selectedSourceTable,
                    targetTable: selectedTargetTable,
                },
                error: error.message,
            });
        }
    }, [updateMappingData, internalColumnAttributes, onNext, projectId, username, selectedSourceTable, selectedTargetTable, toast]);

    if (loading) {
        return (
            <Card className="p-4">
                <CardHeader><CardTitle>Step 2: Define Column Requirements</CardTitle></CardHeader>
                <CardContent>Loading column data...</CardContent>
            </Card>
        );
    }

    return (
        <Card className="p-4">
            <CardHeader>
                <CardTitle>Step 2: Define Column Requirements</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Mark columns as 'Required for Mapping' if they must be included in the final data flow.
                    Adjust 'Nullable' for target columns as needed.
                </p>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Source Table Columns */}
                {selectedSourceTable && sourceColumns.length > 0 && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Source Table: {selectedSourceTable.table}</h3>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Column Name</TableHead>
                                    <TableHead>Data Type</TableHead>
                                    <TableHead>DB Nullable</TableHead>
                                    <TableHead>Required for Mapping</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sourceColumns.map((col) => (
                                    <TableRow key={col.name}>
                                        <TableCell className="font-medium">{col.name}</TableCell>
                                        <TableCell>{col.data_type}</TableCell>
                                        <TableCell>{col.is_nullable ? 'Yes' : 'No'}</TableCell>
                                        <TableCell>
                                            <Checkbox
                                                checked={internalColumnAttributes[selectedSourceTable.table]?.[col.name]?.is_required_for_mapping || false}
                                                onCheckedChange={(checked: boolean) =>
                                                    handleRequiredToggle(selectedSourceTable.table, col.name, checked)
                                                }
                                                id={`source-req-${col.name}`}
                                            />
                                            <Label htmlFor={`source-req-${col.name}`} className="ml-2">
                                                Required
                                            </Label>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* Target Table Columns */}
                {selectedTargetTable && targetColumns.length > 0 && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Target Table: {selectedTargetTable.table}</h3>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Column Name</TableHead>
                                    <TableHead>Data Type</TableHead>
                                    <TableHead>DB Nullable</TableHead>
                                    <TableHead>Required for Mapping</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {targetColumns.map((col) => (
                                    <TableRow key={col.name}>
                                        <TableCell className="font-medium">{col.name}</TableCell>
                                        <TableCell>{col.data_type}</TableCell>
                                        <TableCell>
                                            <Checkbox
                                                checked={internalColumnAttributes[selectedTargetTable.table]?.[col.name]?.is_nullable || false}
                                                onCheckedChange={(checked: boolean) =>
                                                    handleNullableToggle(selectedTargetTable.table, col.name, checked)
                                                }
                                                id={`target-null-${col.name}`}
                                            />
                                            <Label htmlFor={`target-null-${col.name}`} className="ml-2">
                                                Nullable
                                            </Label>
                                        </TableCell>
                                        <TableCell>
                                            <Checkbox
                                                checked={internalColumnAttributes[selectedTargetTable.table]?.[col.name]?.is_required_for_mapping || false}
                                                onCheckedChange={(checked: boolean) =>
                                                    handleRequiredToggle(selectedTargetTable.table, col.name, checked)
                                                }
                                                id={`target-req-${col.name}`}
                                            />
                                            <Label htmlFor={`target-req-${col.name}`} className="ml-2">
                                                Required
                                            </Label>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-6">
                    <Button variant="outline" onClick={onBack}>Back</Button>
                    <Button onClick={handleNextStep}>Next</Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step2RequiredNull;
