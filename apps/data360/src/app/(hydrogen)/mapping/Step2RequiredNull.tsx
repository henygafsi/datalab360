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
import { logWizardEvent } from './logWizardEvent';
import { storeSelectedColumns } from './storeSelectedColumns'; // Import the service

interface TableSelection {
    database: string;
    schema: string;
    table: string;
}

interface ColumnAttributes {
    is_nullable: boolean;
    is_primary_key: boolean;
    is_foreign_key: boolean;
    is_required_for_mapping: boolean; // User controls this
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
    updateMappingData: (newData: Partial<MappingData>) => void;
    selectedSourceTable: TableSelection | null;
    selectedTargetTable: TableSelection | null;
    projectId: string;
    username: string;
    mappingData: MappingData; // Ensure mappingData is passed to initialize
}

const Step2RequiredNull: React.FC<Step2Props> = ({
    onNext,
    onBack,
    updateMappingData,
    selectedSourceTable,
    selectedTargetTable,
    projectId,
    username,
    mappingData, // Destructure mappingData
}) => {
    const { toast } = useToast();
    const [sourceColumns, setSourceColumns] = useState<ColumnDetail[]>([]);
    const [targetColumns, setTargetColumns] = useState<ColumnDetail[]>([]);
    const [loading, setLoading] = useState(true);

    // internalColumnAttributes state will manage user changes (required for mapping)
    // and hold other attributes from fetched data/mappingData
    const [internalColumnAttributes, setInternalColumnAttributes] = useState<
        { [tableName: string]: { [columnName: string]: ColumnAttributes } }
    >(mappingData.column_attributes || {});


    // Effect to fetch columns and initialize internalColumnAttributes when tables or project data changes
    useEffect(() => {
        console.log('Step2: Component mounted or relevant props changed. Fetching columns...');
        const fetchAndInitializeColumns = async () => {
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
                console.log(`Step2: Fetching columns for source: ${selectedSourceTable.table} and target: ${selectedTargetTable.table}`);
                const [sourceColsResult, targetColsResult] = await Promise.all([
                    getTableColumns(selectedSourceTable.database, selectedSourceTable.schema, selectedSourceTable.table),
                    getTableColumns(selectedTargetTable.database, selectedTargetTable.schema, selectedTargetTable.table),
                ]);
                console.log('Step2: Fetched columns. Source:', sourceColsResult, 'Target:', targetColsResult);

                const newInternalAttributes: { [tableName: string]: { [columnName: string]: ColumnAttributes } } = {};

                const processColumns = (cols: any[], tableType: 'source' | 'target') => {
                    const tableName = tableType === 'source' ? selectedSourceTable!.table : selectedTargetTable!.table;
                    newInternalAttributes[tableName] = {};

                    return cols.map((col: any) => {
                        // Prioritize attributes from mappingData.column_attributes (loaded from backend)
                        // otherwise, fall back to DB metadata
                        const existingAttrs = mappingData.column_attributes?.[tableName]?.[col.name] || {};
                        
                        const columnDetail: ColumnDetail = {
                            name: col.name || col.COLUMN_NAME,
                            data_type: col.data_type || col.type,
                            // is_nullable and is_primary_key/foreign_key are derived from DB or loaded state
                            is_nullable: existingAttrs.is_nullable !== undefined ? existingAttrs.is_nullable : (col.is_nullable || col.IS_NULLABLE === 'YES'),
                            is_primary_key: existingAttrs.is_primary_key !== undefined ? existingAttrs.is_primary_key : (col.is_primary_key || col.CONSTRAINT_TYPE === 'PRIMARY KEY'),
                            is_foreign_key: existingAttrs.is_foreign_key !== undefined ? existingAttrs.is_foreign_key : (col.is_foreign_key || col.CONSTRAINT_TYPE === 'FOREIGN KEY'),
                            // is_required_for_mapping is controllable by user on this screen, so prioritize loaded state
                            is_required_for_mapping: existingAttrs.is_required_for_mapping !== undefined ? existingAttrs.is_required_for_mapping : false,
                        };
                        newInternalAttributes[tableName][columnDetail.name] = columnDetail;
                        return columnDetail;
                    });
                };

                setSourceColumns(processColumns(sourceColsResult, 'source'));
                setTargetColumns(processColumns(targetColsResult, 'target'));
                setInternalColumnAttributes(newInternalAttributes); // Update internal state with loaded/initial attributes
                console.log('Step2: Columns and initial internal attributes set:', newInternalAttributes);

            } catch (error: any) {
                console.error('Step2: Error fetching columns:', error);
                toast({
                    title: 'Error',
                    description: `Failed to load column details: ${error.message}`,
                    variant: 'destructive',
                });
            } finally {
                setLoading(false);
                console.log('Step2: Finished fetching columns. Loading state:', false);
            }
        };

        fetchAndInitializeColumns();
    }, [selectedSourceTable, selectedTargetTable, toast, mappingData.column_attributes]); // Re-run if these props change

    // Propagate changes from parent's mappingData to internal state if mappingData changes
    useEffect(() => {
        if (mappingData.column_attributes) {
            setInternalColumnAttributes(mappingData.column_attributes);
        }
    }, [mappingData.column_attributes]);


    const handleRequiredToggle = useCallback((tableName: string, columnName: string, isRequired: boolean) => {
        console.log(`Step2: Toggling 'Required for Mapping' for ${tableName}.${columnName} to ${isRequired}`);
        setInternalColumnAttributes(prev => {
            const newAttributes = { ...prev };
            if (!newAttributes[tableName]) {
                newAttributes[tableName] = {};
            }
            newAttributes[tableName][columnName] = {
                ...newAttributes[tableName][columnName],
                is_required_for_mapping: isRequired,
            };
            console.log('Step2: Updated internalColumnAttributes (Required):', newAttributes);
            return newAttributes;
        });
    }, []);

    const handleNextStep = useCallback(async () => {
        console.log('Step2: Proceeding to next step (handleNextStep).');
        
        if (!projectId || !username || !selectedSourceTable || !selectedTargetTable) {
            toast({ title: 'Error', description: 'Project, user, or table selection missing.', variant: 'destructive' });
            console.warn('Step2: Cannot proceed. Missing essential data.');
            return;
        }

        // --- Prepare payload for storeSelectedColumns API ---
        // This endpoint expects 'selected_columns' as an array of STRINGS (column names)
        // representing only the columns marked as 'required for mapping'.
        const selectedSourceColumnNames: string[] = sourceColumns
            .filter(col => internalColumnAttributes[selectedSourceTable.table]?.[col.name]?.is_required_for_mapping)
            .map(col => col.name);

        const selectedTargetColumnNames: string[] = targetColumns
            .filter(col => internalColumnAttributes[selectedTargetTable.table]?.[col.name]?.is_required_for_mapping)
            .map(col => col.name);

        try {
            console.log('Step2: Calling storeSelectedColumns for source table...');
            await storeSelectedColumns({
                project_id: projectId,
                database_name: selectedSourceTable.database,
                schema_name: selectedSourceTable.schema,
                table_name: selectedSourceTable.table,
                selected_columns: selectedSourceColumnNames, // CORRECTED: Use selected_columns (array of strings)
            });

            console.log('Step2: Calling storeSelectedColumns for target table...');
            await storeSelectedColumns({
                project_id: projectId,
                database_name: selectedTargetTable.database,
                schema_name: selectedTargetTable.schema,
                table_name: selectedTargetTable.table,
                selected_columns: selectedTargetColumnNames, // CORRECTED: Use selected_columns (array of strings)
            });

            toast({ title: 'Required Columns Saved', description: 'Column requirements saved successfully!', variant: 'success' });
            console.log('Step2: Column requirements saved to backend successfully.');

            // Update parent mappingData with the collected column attributes
            // This is vital for subsequent steps to have the latest attributes
            const updatedMappingDataPayload = {
                project_id: projectId,
                column_attributes: internalColumnAttributes,
            };
            updateMappingData(updatedMappingDataPayload);
            console.log('Step2: Parent mappingData updated with column attributes.');

            // Log wizard event for completing this step
            await logWizardEvent({
                project_id: projectId,
                event_type: "ADD_COLUMNS_REQUIRED",
                status: "SUCCESS",
                username: username,
                details: {
                    sourceTable: selectedSourceTable,
                    targetTable: selectedTargetTable,
                    selectedSourceColumnNames: selectedSourceColumnNames, // Log just names for this API
                    selectedTargetColumnNames: selectedTargetColumnNames, // Log just names for this API
                    columnAttributes: internalColumnAttributes, // Log the full attributes structure for detailed tracking
                },
            });
            console.log('Step2: Wizard event ADD_COLUMNS_REQUIRED logged successfully.');

            onNext();
            console.log('Step2: Proceeding to next step.');

        } catch (error: any) {
            console.error('Step2: Failed to save column requirements:', error);
            toast({
                title: 'Error Saving Columns',
                description: `Failed to save column requirements: ${error.message}`,
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
                    error: error.message || String(error),
                },
            });
            console.log('Step2: Wizard event ADD_COLUMNS_REQUIRED logged as FAILED.');
        }
    }, [projectId, username, selectedSourceTable, selectedTargetTable, sourceColumns, targetColumns, internalColumnAttributes, updateMappingData, toast, onNext]);


    const handleBackStep = useCallback(async () => {
        console.log('Step2: Going back (handleBackStep).');
        await logWizardEvent({
            project_id: projectId,
            event_type: "NAVIGATE_BACK",
            status: "SUCCESS",
            username: username,
            details: {
                fromStep: "ADD_COLUMNS_REQUIRED",
                toStep: "ADD_PRIMARY_KEY",
            },
        });
        console.log('Step2: Wizard event NAVIGATE_BACK logged successfully.');
        onBack();
        console.log('Step2: Navigating back.');
    }, [onBack, projectId, username]);


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
                                    <TableHead>DB Nullable</TableHead> {/* Still display original DB nullable */}
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
                                    <TableHead>DB Nullable</TableHead> {/* Still display original DB nullable */}
                                    <TableHead>Required for Mapping</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {targetColumns.map((col) => (
                                    <TableRow key={col.name}>
                                        <TableCell className="font-medium">{col.name}</TableCell>
                                        <TableCell>{col.data_type}</TableCell>
                                        <TableCell>
                                            {/* Removed user-editable Nullable checkbox */}
                                            {col.is_nullable ? 'Yes' : 'No'}
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
                    <Button variant="outline" onClick={handleBackStep}>Back</Button>
                    <Button onClick={handleNextStep}>Next</Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step2RequiredNull;