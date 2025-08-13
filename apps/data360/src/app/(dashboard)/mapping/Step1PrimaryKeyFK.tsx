'use client';

import React, { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import {
    Button,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Badge,
} from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, XCircle } from 'lucide-react';

// Services
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTablesTarget } from '@/app/services/mapping/getTablesTarget';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import { manageTableStructure } from './addConstraints';
import { addPrimaryKey } from './addPrimaryKey';

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
        is_primary_key?: boolean;
        is_foreign_key?: boolean;
        referenced_table?: string;
        referenced_column?: string;
        source_table_key?: string;
    }>;
    primary_keys?: {
        source: string[];
        target: string[];
    };
    foreign_keys?: {
        source: ForeignKey[];
        target: ForeignKey[];
    };
}

interface Step1Props {
    onNext: () => void;
    updateMappingData: (newData: Partial<MappingData>) => void;
    selectedSourceTables: TableSelection[];
    setSelectedSourceTables: Dispatch<SetStateAction<TableSelection[]>>;
    selectedTargetTable: TableSelection | null;
    setSelectedTargetTable: Dispatch<SetStateAction<TableSelection | null>>;
    databases: string[];
    sourceSchemas: string[];
    targetSchemas: string[];
    sourceTables: string[];
    targetTables: string[];
    isLoadingOptions: boolean;
    projectId: string;
    username: string;
    mappingData: MappingData; // Ensure mappingData is passed and used
}

interface ManuallyDefinedPK {
    tableKey: string;
    columnName: string;
}

interface ManuallyDefinedFK {
    sourceTableKey: string;
    sourceColumn: string;
    referencedTableKey: string;
    referencedColumn: string;
}

const Step1PrimaryKeyFK: React.FC<Step1Props> = ({
    onNext,
    updateMappingData,
    selectedSourceTables,
    setSelectedSourceTables,
    selectedTargetTable,
    setSelectedTargetTable,
    databases,
    targetSchemas,
    targetTables,
    isLoadingOptions,
    projectId,
    username,
    mappingData, // Destructure mappingData here
}) => {
    const { toast } = useToast();
    const [currentSourceSelection, setCurrentSourceSelection] = useState<TableSelection>(
        selectedSourceTables[0] || { database: '', schema: '', table: '' } // Initialize from prop
    );
    const [targetColumnsData, setTargetColumnsData] = useState<ColumnDetail[]>([]);
    const [allSourceColumnsData, setAllSourceColumnsData] = useState<{ [key: string]: ColumnDetail[] }>({});
    const [isFetchingColumns, setIsFetchingColumns] = useState(false);

    const [currentSourceSchemas, setCurrentSourceSchemas] = useState<string[]>([]);
    const [currentSourceTables, setCurrentSourceTables] = useState<string[]>([]);
    const [isSourceOptionsLoading, setIsSourceOptionsLoading] = useState(false);

    // Initialize PKs/FKs from mappingData prop using a function for useState
    const [manuallyDefinedPKs, setManuallyDefinedPKs] = useState<ManuallyDefinedPK[]>(() => {
        const pks: ManuallyDefinedPK[] = [];
        (mappingData.primary_keys?.source || []).forEach(colName => {
            if (mappingData.source_database && mappingData.source_schema && mappingData.source_table) {
                pks.push({ tableKey: `${mappingData.source_database}.${mappingData.source_schema}.${mappingData.source_table}`, columnName: colName });
            }
        });
        (mappingData.primary_keys?.target || []).forEach(colName => {
            if (mappingData.target_database && mappingData.target_schema && mappingData.target_table) {
                pks.push({ tableKey: `${mappingData.target_database}.${mappingData.target_schema}.${mappingData.target_table}`, columnName: colName });
            }
        });
        return pks;
    });

    const [manuallyDefinedFKs, setManuallyDefinedFKs] = useState<ManuallyDefinedFK[]>(() => {
        const fks: ManuallyDefinedFK[] = [];
        (mappingData.foreign_keys?.source || []).forEach(fk => {
             if (mappingData.source_database && mappingData.source_schema && mappingData.source_table) {
                fks.push({
                    sourceTableKey: `${mappingData.source_database}.${mappingData.source_schema}.${mappingData.source_table}`,
                    sourceColumn: fk.column,
                    referencedTableKey: `${mappingData.source_database}.${mappingData.source_schema}.${fk.referenced_table}`, // Assuming same schema/db for source FKs
                    referencedColumn: fk.referenced_column,
                });
            }
        });
        (mappingData.foreign_keys?.target || []).forEach(fk => {
            if (mappingData.target_database && mappingData.target_schema && mappingData.target_table) {
                fks.push({
                    sourceTableKey: `${mappingData.target_database}.${mappingData.target_schema}.${mappingData.target_table}`,
                    sourceColumn: fk.column,
                    referencedTableKey: `${mappingData.target_database}.${mappingData.target_schema}.${fk.referenced_table}`, // Assuming same schema/db for target FKs
                    referencedColumn: fk.referenced_column,
                });
            }
        });
        return fks;
    });

    const [fkSourceTableKey, setFkSourceTableKey] = useState<string>('');
    const [fkSourceColumn, setFkSourceColumn] = useState<string>('');
    const [fkReferencedTableKey, setFkReferencedTableKey] = useState<string>('');
    const [fkReferencedColumn, setFkReferencedColumn] = useState<string>('');

    // Effect to update local component state when relevant props change
    // This runs AFTER MappingWizardPage has loaded data and updated its states
    useEffect(() => {
        console.log('Step1: Prop `selectedSourceTables` or `selectedTargetTable` or `mappingData` changed.');

        // Re-initialize currentSourceSelection if the first source table changes
        if (selectedSourceTables[0] && JSON.stringify(currentSourceSelection) !== JSON.stringify(selectedSourceTables[0])) {
            setCurrentSourceSelection(selectedSourceTables[0]);
        }

        // Re-fetch columns for all currently selected source tables
        const loadAllSourceCols = async () => {
            const newAllSourceColumnsData: { [key: string]: ColumnDetail[] } = {};
            for (const tableSel of selectedSourceTables) {
                const tableKey = `${tableSel.database}.${tableSel.schema}.${tableSel.table}`;
                try {
                    const columns = await getTableColumns(tableSel.database, tableSel.schema, tableSel.table);
                    newAllSourceColumnsData[tableKey] = columns.map(col => ({
                        name: col.name || col.COLUMN_NAME || '',
                        data_type: col.type || col.DATA_TYPE || '',
                    }));
                } catch (error) {
                    console.error(`Error loading columns for pre-selected source table ${tableKey}:`, error);
                }
            }
            setAllSourceColumnsData(newAllSourceColumnsData);
        };
        loadAllSourceCols();

        // Re-fetch columns for the currently selected target table
        if (selectedTargetTable) {
            const loadTargetCols = async () => {
                try {
                    const columns = await getTableColumns(selectedTargetTable.database, selectedTargetTable.schema, selectedTargetTable.table);
                    setTargetColumnsData(columns.map(col => ({
                        name: col.name || col.COLUMN_NAME || '',
                        data_type: col.type || col.DATA_TYPE || '',
                    })));
                } catch (error) {
                    console.error(`Error loading columns for pre-selected target table ${selectedTargetTable.table}:`, error);
                }
            };
            loadTargetCols();
        }

        // Re-initialize PK/FK states from the mappingData prop
        setManuallyDefinedPKs(() => {
            const pks: ManuallyDefinedPK[] = [];
            (mappingData.primary_keys?.source || []).forEach(colName => {
                if (mappingData.source_database && mappingData.source_schema && mappingData.source_table) {
                    pks.push({ tableKey: `${mappingData.source_database}.${mappingData.source_schema}.${mappingData.source_table}`, columnName: colName });
                }
            });
            (mappingData.primary_keys?.target || []).forEach(colName => {
                if (mappingData.target_database && mappingData.target_schema && mappingData.target_table) {
                    pks.push({ tableKey: `${mappingData.target_database}.${mappingData.target_schema}.${mappingData.target_table}`, columnName: colName });
                }
            });
            return pks;
        });
        setManuallyDefinedFKs(() => {
            const fks: ManuallyDefinedFK[] = [];
            (mappingData.foreign_keys?.source || []).forEach(fk => {
                 if (mappingData.source_database && mappingData.source_schema && mappingData.source_table) {
                    fks.push({
                        sourceTableKey: `${mappingData.source_database}.${mappingData.source_schema}.${mappingData.source_table}`,
                        sourceColumn: fk.column,
                        referencedTableKey: `${mappingData.source_database}.${mappingData.source_schema}.${fk.referenced_table}`,
                        referencedColumn: fk.referenced_column,
                    });
                }
            });
            (mappingData.foreign_keys?.target || []).forEach(fk => {
                if (mappingData.target_database && mappingData.target_schema && mappingData.target_table) {
                    fks.push({
                        sourceTableKey: `${mappingData.target_database}.${mappingData.target_schema}.${mappingData.target_table}`,
                        sourceColumn: fk.column,
                        referencedTableKey: `${mappingData.target_database}.${mappingData.target_schema}.${fk.referenced_table}`,
                        referencedColumn: fk.referenced_column,
                    });
                }
            });
            return fks;
        });

    }, [selectedSourceTables, selectedTargetTable, mappingData]); // Dependencies for this effect

    useEffect(() => {
        console.log('Step1: currentSourceSelection.database changed:', currentSourceSelection.database);
        if (!currentSourceSelection.database) {
            setCurrentSourceSchemas([]);
            setCurrentSourceTables([]);
            return;
        }
        const fetchSchemas = async () => {
            setIsSourceOptionsLoading(true);
            try {
                console.log(`Step1: Fetching schemas for database: ${currentSourceSelection.database}`);
                const schemasData = await getSchemas(currentSourceSelection.database);
                setCurrentSourceSchemas(schemasData);
                console.log(`Step1: Fetched schemas for ${currentSourceSelection.database}:`, schemasData);
            } catch (error: any) {
                console.error(`Step1: Error fetching schemas for ${currentSourceSelection.database}:`, error);
                toast({
                    title: 'Error',
                    description: `Failed to fetch source schemas: ${error.message || 'An unexpected error occurred.'}`,
                    variant: 'destructive',
                });
            } finally {
                setIsSourceOptionsLoading(false);
                console.log('Step1: Finished fetching schemas. Source options loading state:', false);
            }
        };
        fetchSchemas();
    }, [currentSourceSelection.database, toast]);

    useEffect(() => {
        console.log('Step1: currentSourceSelection.schema changed:', currentSourceSelection.schema);
        if (!currentSourceSelection.database || !currentSourceSelection.schema) {
            setCurrentSourceTables([]);
            return;
        }
        const fetchTables = async () => {
            setIsSourceOptionsLoading(true);
            try {
                console.log(`Step1: Fetching tables for ${currentSourceSelection.database}.${currentSourceSelection.schema}`);
                const tablesData = await getTables(currentSourceSelection.database, currentSourceSelection.schema);
                setCurrentSourceTables(tablesData);
                console.log(`Step1: Fetched tables for ${currentSourceSelection.database}.${currentSourceSelection.schema}:`, tablesData);
            }
            catch (error: any) {
                console.error(`Step1: Error fetching tables for ${currentSourceSelection.database}.${currentSourceSelection.schema}:`, error);
                toast({
                    title: 'Error',
                    description: `Failed to fetch source tables: ${error.message || 'An unexpected error occurred.'}`,
                    variant: 'destructive',
                });
            } finally {
                setIsSourceOptionsLoading(false);
                console.log('Step1: Finished fetching tables. Source options loading state:', false);
            }
        };
        fetchTables();
    }, [currentSourceSelection.database, currentSourceSelection.schema, toast]);

    const handleCurrentSourceDbChange = useCallback((db: string) => {
        console.log('Step1: Source DB changed to:', db);
        setCurrentSourceSelection((prev) => ({ ...prev, database: db, schema: '', table: '' }));
    }, []);

    const handleCurrentSourceSchemaChange = useCallback((schema: string) => {
        console.log('Step1: Source Schema changed to:', schema);
        setCurrentSourceSelection((prev) => ({ ...prev, schema, table: '' }));
    }, []);

    const handleCurrentSourceTableChange = useCallback((table: string) => {
        console.log('Step1: Source Table changed to:', table);
        setCurrentSourceSelection((prev) => ({ ...prev, table }));
    }, []);

    const handleAddSourceTable = useCallback(async () => {
        console.log('Step1: Attempting to add source table:', currentSourceSelection);
        if (!currentSourceSelection.database || !currentSourceSelection.schema || !currentSourceSelection.table) {
            toast({
                title: 'Validation Error',
                description: 'Please select a database, schema, and table for the source.',
                variant: 'destructive',
            });
            console.warn('Step1: Validation failed for adding source table. Missing fields.');
            return;
        }

        const tableKey = `${currentSourceSelection.database}.${currentSourceSelection.schema}.${currentSourceSelection.table}`;

        const isAlreadyAdded = selectedSourceTables.some(
            (t) => `${t.database}.${t.schema}.${t.table}` === tableKey
        );

        if (isAlreadyAdded) {
            toast({
                title: 'Duplicate Table',
                description: 'This source table has already been added.',
                variant: 'info',
            });
            console.warn('Step1: Source table already added:', tableKey);
            return;
        }

        setIsFetchingColumns(true);
        try {
            console.log(`Step1: Fetching columns for new source table: ${tableKey}`);
            const columns = await getTableColumns(
                currentSourceSelection.database,
                currentSourceSelection.schema,
                currentSourceSelection.table
            );
            setSelectedSourceTables((prev) => [...prev, currentSourceSelection]);
            setAllSourceColumnsData((prev) => ({
                ...prev,
                [tableKey]: columns.map(col => ({
                    name: col.name || col.COLUMN_NAME || '',
                    data_type: col.type || col.DATA_TYPE || '',
                }))
            }));
            setCurrentSourceSelection({ database: '', schema: '', table: '' });
            toast({
                title: 'Source Table Added',
                description: `Columns for ${currentSourceSelection.table} fetched successfully.`,
            });
            console.log('Step1: Source table added and columns fetched:', tableKey, 'Columns:', columns);
        } catch (error: any) {
            console.error('Step1: Failed to add source table or fetch columns:', error);
            toast({
                title: 'Error',
                description: `Failed to add source table: ${error.message || 'An unexpected error occurred.'}`,
                variant: 'destructive',
            });
        } finally {
            setIsFetchingColumns(false);
            console.log('Step1: Finished fetching columns for new source table. Fetching state:', false);
        }
    }, [currentSourceSelection, selectedSourceTables, setSelectedSourceTables, toast]);

    const handleRemoveSourceTable = useCallback((tableToRemove: TableSelection) => {
        console.log('Step1: Attempting to remove source table:', tableToRemove);
        setSelectedSourceTables((prev) =>
            prev.filter(
                (t) =>
                    !(
                        t.database === tableToRemove.database &&
                        t.schema === tableToRemove.schema &&
                        t.table === tableToRemove.table
                    )
            )
        );
        const tableKeyToRemove = `${tableToRemove.database}.${tableToRemove.schema}.${tableToRemove.table}`;
        setAllSourceColumnsData((prev) => {
            const newColumnsData = { ...prev };
            delete newColumnsData[tableKeyToRemove];
            return newColumnsData;
        });
        setManuallyDefinedPKs(prev => prev.filter(pk => pk.tableKey !== tableKeyToRemove));
        setManuallyDefinedFKs(prev => prev.filter(fk => fk.sourceTableKey !== tableKeyToRemove && fk.referencedTableKey !== tableKeyToRemove));
        console.log('Step1: Source table removed:', tableToRemove);
    }, [setSelectedSourceTables]);

    const handleTargetDbChange = useCallback((db: string) => {
        console.log('Step1: Target DB changed to:', db);
        setSelectedTargetTable({ database: db, schema: '', table: '' });
    }, [setSelectedTargetTable]);

    const handleTargetSchemaChange = useCallback((schema: string) => {
        console.log('Step1: Target Schema changed to:', schema);
        setSelectedTargetTable((prev) => ({
            database: prev?.database || '',
            schema,
            table: ''
        }));
    }, [setSelectedTargetTable]);

    const handleTargetTableChange = useCallback(async (table: string) => {
        console.log('Step1: Target Table changed to:', table);
        const newTargetSelection = {
            database: selectedTargetTable?.database || '',
            schema: selectedTargetTable?.schema || '',
            table,
        };
        setSelectedTargetTable(newTargetSelection);

        setIsFetchingColumns(true);
        try {
            console.log(`Step1: Fetching columns for new target table: ${newTargetSelection.database}.${newTargetSelection.schema}.${newTargetSelection.table}`);
            const columns = await getTableColumns(
                newTargetSelection.database,
                newTargetSelection.schema,
                newTargetSelection.table
            );
            setTargetColumnsData(columns.map(col => ({
                name: col.name || col.COLUMN_NAME || '',
                data_type: col.type || col.DATA_TYPE || '',
            })));
            toast({
                title: 'Target Table Selected',
                description: `Columns for ${newTargetSelection.table} fetched successfully.`,
            });
            console.log('Step1: Target table selected and columns fetched:', newTargetSelection, 'Columns:', columns);
        } catch (error: any) {
            console.error('Step1: Failed to fetch target table columns:', error);
            toast({
                title: 'Error',
                description: `Failed to fetch target table columns: ${error.message || 'An unexpected error occurred.'}`,
                variant: 'destructive',
            });
        } finally {
            setIsFetchingColumns(false);
            console.log('Step1: Finished fetching columns for new target table. Fetching state:', false);
        }
    }, [selectedTargetTable, setSelectedTargetTable, toast]);

    const handleTogglePrimaryKey = useCallback(async (tableKey: string, columnName: string) => {
        console.log(`Step1: Toggling PK for ${tableKey}.${columnName}`);
        if (!projectId || !username) {
            toast({ title: 'Error', description: 'Project or user not available.', variant: 'destructive' });
            console.warn('Step1: PK toggle failed. Project or username missing.');
            return;
        }

        const [db, schema, table] = tableKey.split('.');
        if (!db || !schema || !table) {
            toast({ title: 'Error', description: 'Invalid table key for PK operation.', variant: 'destructive' });
            console.error('Step1: Invalid table key for PK operation:', tableKey);
            return;
        }

        setManuallyDefinedPKs(prevPKs => {
            const existingPKIndex = prevPKs.findIndex(pk => pk.tableKey === tableKey && pk.columnName === columnName);
            if (existingPKIndex > -1) {
                console.log(`Step1: Removing PK from frontend state for ${tableKey}.${columnName}`);
                return prevPKs.filter((_, index) => index !== existingPKIndex);
            } else {
                const payload = {
                    project_id: projectId,
                    database_name: db,
                    schema_name: schema,
                    table_name: table,
                    column_names: [columnName],
                };
                console.log('Step1: Adding PK. Payload to addPrimaryKey service:', payload);
                addPrimaryKey(payload)
                    .then(response => {
                        console.log('Step1: addPrimaryKey service response:', response);
                        if (response.status === 'success' || response.status === 'info') {
                            toast({ title: 'Primary Key Status', description: response.message, variant: 'default' });
                        } else {
                            toast({ title: 'Primary Key Error', description: response.message, variant: 'destructive' });
                        }
                    })
                    .catch(error => {
                        console.error("Step1: Error adding PK via API:", error);
                        toast({ title: 'API Error', description: `Failed to add primary key: ${error.message}`, variant: 'destructive' });
                    });
                console.log(`Step1: Adding PK to frontend state for ${tableKey}.${columnName}`);
                return [...prevPKs, { tableKey, columnName }];
            }
        });
    }, [projectId, username, toast]);

    const handleAddForeignKey = useCallback(async () => {
        console.log('Step1: Attempting to add Foreign Key.');
        if (!fkSourceTableKey || !fkSourceColumn || !fkReferencedTableKey || !fkReferencedColumn) {
            toast({
                title: 'Validation Error',
                description: 'Please select all fields for the Foreign Key.',
                variant: 'destructive',
            });
            console.warn('Step1: FK validation failed. Missing fields.');
            return;
        }

        if (fkSourceTableKey === fkReferencedTableKey && fkSourceColumn === fkReferencedColumn) {
            toast({
                title: 'Validation Error',
                description: 'Source and referenced columns cannot be the same if from the same table.',
                variant: 'destructive',
            });
            console.warn('Step1: FK validation failed. Source and referenced columns are identical.');
            return;
        }

        const newFK: ManuallyDefinedFK = {
            sourceTableKey: fkSourceTableKey,
            sourceColumn: fkSourceColumn,
            referencedTableKey: fkReferencedTableKey,
            referencedColumn: fkReferencedColumn,
        };

        const isDuplicate = manuallyDefinedFKs.some(
            (fk) =>
                fk.sourceTableKey === newFK.sourceTableKey &&
                fk.sourceColumn === newFK.sourceColumn &&
                fk.referencedTableKey === newFK.referencedTableKey &&
                fk.referencedColumn === newFK.referencedColumn
        );

        if (isDuplicate) {
            toast({
                title: 'Duplicate FK',
                description: 'This Foreign Key relationship already exists.',
                variant: 'info',
            });
            console.warn('Step1: Duplicate FK found:', newFK);
            return;
        }

        const [sourceDb, sourceSchema, sourceTable] = fkSourceTableKey.split('.');
        const [refDb, refSchema, refTable] = fkReferencedTableKey.split('.');

        if (!sourceDb || !sourceSchema || !sourceTable || !refDb || !refSchema || !refTable) {
            toast({ title: 'Error', description: 'Invalid table key for FK operation.', variant: 'destructive' });
            console.error('Step1: Invalid table key for FK operation. Source:', fkSourceTableKey, 'Referenced:', fkReferencedTableKey);
            return;
        }

        const payload = {
            SOURCE_TABLE: `"${sourceDb}"."${sourceSchema}"."${sourceTable}"`,
            COLUMN_NAME: newFK.sourceColumn,
            CONSTRAINT_TYPE: 'ADD_FK',
            TABLE_REF: `"${refDb}"."${refSchema}"."${refTable}"`,
            COLUMN_REF: newFK.referencedColumn,
        };
        console.log('Step1: Adding FK. Payload to manageTableStructure service:', payload);

        try {
            const response = await manageTableStructure(payload);
            console.log('Step1: manageTableStructure service response (ADD_FK):', response);

            if (response.status === 'success' || response.status === 'info') {
                setManuallyDefinedFKs((prevFKs) => [...prevFKs, newFK]);
                toast({
                    title: 'Foreign Key Added',
                    description: response.message,
                });
                setFkSourceTableKey('');
                setFkSourceColumn('');
                setFkReferencedTableKey('');
                setFkReferencedColumn('');
                console.log('Step1: Foreign Key added to frontend state and form reset.');
            } else {
                toast({
                    title: 'Foreign Key Error',
                    description: response.message,
                    variant: 'destructive',
                });
                console.error('Step1: Backend reported FK error:', response.message);
            }
        } catch (error: any) {
            console.error("Step1: Error adding FK via API:", error);
            toast({
                title: 'API Error',
                description: `Failed to add foreign key: ${error.message}`,
                variant: 'destructive',
            });
        }
    }, [fkSourceTableKey, fkSourceColumn, fkReferencedTableKey, fkReferencedColumn, manuallyDefinedFKs, toast]);

    const handleRemoveForeignKey = useCallback((fkToRemove: ManuallyDefinedFK) => {
        console.log('Step1: Attempting to remove Foreign Key from frontend state:', fkToRemove);
        setManuallyDefinedFKs(prevFKs => prevPKs.filter(fk =>
            !(fk.sourceTableKey === fkToRemove.sourceTableKey &&
                fk.sourceColumn === fkToRemove.sourceColumn &&
                fk.referencedTableKey === fkToRemove.referencedTableKey &&
                fk.referencedColumn === fkToRemove.referencedColumn)
        ));
        toast({
            title: 'Foreign Key Removed',
            description: 'Foreign Key removed from local configuration. (Note: Actual removal from DB requires separate DDL if already applied).',
            variant: 'info',
        });
        console.log('Step1: Foreign Key removed from frontend state.');
    }, [toast]);

    const handleNextClick = useCallback(async () => {
        console.log('Step1: Proceeding to next step (handleNextClick).');
        if (selectedSourceTables.length === 0 || !selectedTargetTable) {
            toast({
                title: 'Selection Required',
                description: 'Please select at least one source table and one target table.',
                variant: 'destructive',
            });
            console.warn('Step1: Cannot proceed. Source or target table not selected.');
            return;
        }
        if (!projectId || !username) {
            toast({
                title: 'Project Not Selected',
                description: 'Please select or create a project in the previous step.',
                variant: 'destructive',
            });
            console.warn('Step1: Cannot proceed. Project ID or username missing.');
            return;
        }

        const primaryKeysForMapping: { source: string[]; target: string[] } = { source: [], target: [] };
        const foreignKeysForMapping: { source: ForeignKey[]; target: ForeignKey[] } = { source: [], target: [] };
        const columnMappings: any[] = []; // This will be populated by Step 3

        manuallyDefinedPKs.forEach(pk => {
            if (selectedTargetTable && pk.tableKey === `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`) {
                primaryKeysForMapping.target.push(pk.columnName);
            } else {
                // Ensure source PKs are associated with their specific source table
                const sourceTable = selectedSourceTables.find(st => `${st.database}.${st.schema}.${st.table}` === pk.tableKey);
                if (sourceTable) {
                    primaryKeysForMapping.source.push(pk.columnName);
                }
            }
        });

        manuallyDefinedFKs.forEach(fk => {
            const foreignKey: ForeignKey = {
                column: fk.sourceColumn,
                referenced_table: fk.referencedTableKey.split('.').pop() || '',
                referenced_column: fk.referencedColumn,
            };
            if (selectedTargetTable && fk.sourceTableKey === `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`) {
                foreignKeysForMapping.target.push(foreignKey);
            } else {
                // Ensure source FKs are associated with their specific source table
                const sourceTable = selectedSourceTables.find(st => `${st.database}.${st.schema}.${st.table}` === fk.sourceTableKey);
                if (sourceTable) {
                    foreignKeysForMapping.source.push(foreignKey);
                }
            }
        });

        const finalMappingData: Partial<MappingData> = {
            project_id: projectId,
            source_database: selectedSourceTables[0]?.database || '',
            source_schema: selectedSourceTables[0]?.schema || '',
            source_table: selectedSourceTables[0]?.table || '',
            target_database: selectedTargetTable.database,
            target_schema: selectedTargetTable.schema,
            target_table: selectedTargetTable.table,
            column_mappings: columnMappings, // Passed empty, will be filled in Step3
            primary_keys: { source: primaryKeysForMapping.source, target: primaryKeysForMapping.target },
            foreign_keys: { source: foreignKeysForMapping.source, target: foreignKeysForMapping.target },
        };

        console.log("Step1: PK/FK Data for Next Step:", JSON.stringify(finalMappingData.primary_keys, null, 2));
        console.log("Step1: FK Data for Next Step:", JSON.stringify(finalMappingData.foreign_keys, null, 2));

        // Update parent's mappingData. Log event happens in parent's updateMappingData or child API calls.
        // For Step 1, the primary_keys and foreign_keys are determined here, so we log them.
     

        updateMappingData(finalMappingData);

        onNext();
        console.log('Step1: Data updated and proceeding to next step.');
    }, [selectedSourceTables, selectedTargetTable, manuallyDefinedPKs, manuallyDefinedFKs, updateMappingData, onNext, toast, projectId, username]);

    const getAllAvailableColumns = useCallback(() => {
        const allCols: { tableKey: string; columnName: string; data_type: string }[] = [];
        Object.entries(allSourceColumnsData).forEach(([tableKey, columns]) => {
            columns.forEach(col => allCols.push({ tableKey, columnName: col.name, data_type: col.data_type }));
        });
        if (selectedTargetTable && targetColumnsData.length > 0) {
            const targetTableKey = `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`;
            targetColumnsData.forEach(col => allCols.push({ tableKey: targetTableKey, columnName: col.name, data_type: col.data_type }));
        }
        return allCols;
    }, [allSourceColumnsData, targetColumnsData, selectedTargetTable]);

    const allColumnsForFK = getAllAvailableColumns();

    return (
        <Card className="p-4">
            <CardHeader>
                <CardTitle>Step 1: Primary/Foreign Key Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Source Table Selection (Multiple) */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Select Source Tables</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                            <Label htmlFor="source-database">Source Database</Label>
                            <Select onValueChange={handleCurrentSourceDbChange} value={currentSourceSelection.database || ''} disabled={isLoadingOptions || isSourceOptionsLoading}>
                                <SelectTrigger id="source-database">
                                    <SelectValue placeholder="Select Source Database" />
                                </SelectTrigger>
                                <SelectContent>
                                    {databases.map((db) => (
                                        <SelectItem key={db} value={db}>
                                            {db}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="source-schema">Source Schema</Label>
                            <Select onValueChange={handleCurrentSourceSchemaChange} value={currentSourceSelection.schema || ''} disabled={isLoadingOptions || isSourceOptionsLoading || !currentSourceSelection.database}>
                                <SelectTrigger id="source-schema">
                                    <SelectValue placeholder="Select Source Schema" />
                                </SelectTrigger>
                                <SelectContent>
                                    {currentSourceSchemas.map((schema) => (
                                        <SelectItem key={schema} value={schema}>
                                            {schema}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="source-table">Source Table</Label>
                            <Select onValueChange={handleCurrentSourceTableChange} value={currentSourceSelection.table || ''} disabled={isLoadingOptions || isSourceOptionsLoading || !currentSourceSelection.schema}>
                                <SelectTrigger id="source-table">
                                    <SelectValue placeholder="Select Source Table" />
                                </SelectTrigger>
                                <SelectContent>
                                    {currentSourceTables.map((table) => (
                                        <SelectItem key={table} value={table}>
                                            {table}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            onClick={handleAddSourceTable}
                            disabled={isLoadingOptions || !currentSourceSelection.table || isFetchingColumns || isSourceOptionsLoading}
                            className="mt-auto"
                        >
                            {(isFetchingColumns || isSourceOptionsLoading) ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Loading...
                                </>
                            ) : (
                                <>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Add Source Table
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Display Selected Source Tables */}
                    {selectedSourceTables.length > 0 && (
                        <div className="mt-4 border p-3 rounded-md">
                            <h3 className="text-md font-semibold mb-2">Selected Source Tables:</h3>
                            <div className="flex flex-wrap gap-2">
                                {selectedSourceTables.map((tableSelection) => (
                                    <Badge key={`${tableSelection.database}.${tableSelection.schema}.${tableSelection.table}`} variant="secondary" className="pr-1">
                                        {`${tableSelection.database}.${tableSelection.schema}.${tableSelection.table}`}
                                        <XCircle className="ml-1 h-3 w-3 cursor-pointer" onClick={() => handleRemoveSourceTable(tableSelection)} />
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Target Table Selection (Single) */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Select Target Table</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label htmlFor="target-database">Target Database</Label>
                            <Select onValueChange={handleTargetDbChange} value={selectedTargetTable?.database || ''} disabled={isLoadingOptions}>
                                <SelectTrigger id="target-database">
                                    <SelectValue placeholder="Select Target Database" />
                                </SelectTrigger>
                                <SelectContent>
                                    {databases.map((db) => (
                                        <SelectItem key={db} value={db}>
                                            {db}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="target-schema">Target Schema</Label>
                            <Select onValueChange={handleTargetSchemaChange} value={selectedTargetTable?.schema || ''} disabled={isLoadingOptions || !selectedTargetTable?.database}>
                                <SelectTrigger id="target-schema">
                                    <SelectValue placeholder="Select Target Schema" />
                                </SelectTrigger>
                                <SelectContent>
                                    {targetSchemas.map((schema) => (
                                        <SelectItem key={schema} value={schema}>
                                            {schema}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="target-table">Target Table</Label>
                            <Select onValueChange={handleTargetTableChange} value={selectedTargetTable?.table || ''} disabled={isLoadingOptions || !selectedTargetTable?.schema || isFetchingColumns}>
                                <SelectTrigger id="target-table">
                                    <SelectValue placeholder="Select Target Table" />
                                </SelectTrigger>
                                <SelectContent>
                                    {targetTables.map((table) => (
                                        <SelectItem key={table} value={table}>
                                            {table}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* PK/FK Definition UI */}
                {(Object.keys(allSourceColumnsData).length > 0 || targetColumnsData.length > 0) && (
                    <div className="space-y-6 mt-6">
                        <h2 className="text-xl font-semibold">Define Keys & Relationships</h2>

                        {/* Display Columns with PK Toggle */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {Object.entries(allSourceColumnsData).map(([tableKey, columns]) => {
                                const tableName = tableKey.split('.').pop();
                                return (
                                    <Card key={tableKey} className="p-4 bg-gray-50 border">
                                        <CardHeader className="p-0 pb-2">
                                            <CardTitle className="text-md flex items-center gap-2">
                                                <Badge variant="outline">Source</Badge>
                                                Table: {tableName}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-0">
                                            <div className="max-h-60 overflow-y-auto pr-2">
                                                {columns.length > 0 ? (
                                                    <ul className="space-y-1">
                                                        {columns.map((col) => {
                                                            const isPk = manuallyDefinedPKs.some(pk => pk.tableKey === tableKey && pk.columnName === col.name);
                                                            return (
                                                                <li key={`${tableKey}-${col.name}`} className="flex items-center text-sm gap-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        id={`pk-${tableKey}-${col.name}`}
                                                                        checked={isPk}
                                                                        onChange={() => handleTogglePrimaryKey(tableKey, col.name)}
                                                                        className="h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary"
                                                                    />
                                                                    <Label htmlFor={`pk-${tableKey}-${col.name}`} className="flex-grow flex justify-between items-center cursor-pointer">
                                                                        <span>
                                                                            <strong className="font-semibold">{col.name}</strong> ({col.data_type})
                                                                        </span>
                                                                        {isPk && <Badge variant="default" className="ml-2">PK</Badge>}
                                                                    </Label>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                ) : (
                                                    <p className="text-sm text-gray-500">No columns found for this source table.</p>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}

                            {targetColumnsData.length > 0 && selectedTargetTable && (
                                <Card className="p-4 bg-blue-50 border border-blue-200">
                                    <CardHeader className="p-0 pb-2">
                                        <CardTitle className="text-md flex items-center gap-2">
                                            <Badge variant="outline">Target</Badge>
                                            Table: {selectedTargetTable.table}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="max-h-60 overflow-y-auto pr-2">
                                            {targetColumnsData.length > 0 ? (
                                                <ul className="space-y-1">
                                                    {targetColumnsData.map((col) => {
                                                        const targetTableKey = `${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`;
                                                        const isPk = manuallyDefinedPKs.some(pk => pk.tableKey === targetTableKey && pk.columnName === col.name);
                                                        return (
                                                            <li key={`target-${col.name}`} className="flex items-center text-sm gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    id={`pk-${targetTableKey}-${col.name}`}
                                                                    checked={isPk}
                                                                    onChange={() => handleTogglePrimaryKey(targetTableKey, col.name)}
                                                                    className="h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary"
                                                                />
                                                                <Label htmlFor={`pk-${targetTableKey}-${col.name}`} className="flex-grow flex justify-between items-center cursor-pointer">
                                                                    <span>
                                                                        <strong className="font-semibold">{col.name}</strong> ({col.data_type})
                                                                    </span>
                                                                    {isPk && <Badge variant="default" className="ml-2">PK</Badge>}
                                                                </Label>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            ) : (
                                                <p className="text-sm text-gray-500">No columns found for the target table.</p>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        {/* Foreign Key Definition Section */}
                        <div className="mt-8 space-y-4">
                            <h3 className="text-lg font-semibold">Define Foreign Key Relationships</h3>
                            <Card className="p-4">
                                <CardContent className="p-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                                    {/* FK Source Table Select */}
                                    <div>
                                        <Label htmlFor="fk-source-table">Source Table (FK Column In)</Label>
                                        <Select onValueChange={(val) => { setFkSourceTableKey(val); setFkSourceColumn(''); }} value={fkSourceTableKey}>
                                            <SelectTrigger id="fk-source-table">
                                                <SelectValue placeholder="Select Table" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {selectedSourceTables.map((sTable) => {
                                                    const tableKey = `${sTable.database}.${sTable.schema}.${sTable.table}`;
                                                    return (
                                                        <SelectItem key={tableKey} value={tableKey}>
                                                            {sTable.table} ({sTable.database}.{sTable.schema})
                                                        </SelectItem>
                                                    );
                                                })}
                                                {selectedTargetTable && (
                                                    <SelectItem
                                                        key={`${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`}
                                                        value={`${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`}>
                                                        {selectedTargetTable.table} (Target)
                                                    </SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {/* FK Source Column Select */}
                                    <div>
                                        <Label htmlFor="fk-source-column">FK Column</Label>
                                        <Select value={fkSourceColumn} onValueChange={setFkSourceColumn} disabled={!fkSourceTableKey}>
                                            <SelectTrigger id="fk-source-column">
                                                <SelectValue placeholder="Select Column" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {allColumnsForFK
                                                    .filter(col => col.tableKey === fkSourceTableKey)
                                                    .map(col => (
                                                        <SelectItem key={`${col.tableKey}-${col.columnName}`} value={col.columnName}>
                                                            {col.columnName}
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {/* FK Referenced Table Select */}
                                    <div>
                                        <Label htmlFor="fk-referenced-table">Referenced Table</Label>
                                        <Select value={fkReferencedTableKey} onValueChange={(val) => { setFkReferencedTableKey(val); setFkReferencedColumn(''); }}>
                                            <SelectTrigger id="fk-referenced-table">
                                                <SelectValue placeholder="Select Referenced Table" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {selectedSourceTables.map((sTable) => {
                                                    const tableKey = `${sTable.database}.${sTable.schema}.${sTable.table}`;
                                                    return (
                                                        <SelectItem key={`ref-${tableKey}`} value={tableKey}>
                                                            {sTable.table} ({sTable.database}.{sTable.schema})
                                                        </SelectItem>
                                                    );
                                                })}
                                                {selectedTargetTable && (
                                                    <SelectItem
                                                        key={`ref-${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`}
                                                        value={`${selectedTargetTable.database}.${selectedTargetTable.schema}.${selectedTargetTable.table}`}>
                                                        {selectedTargetTable.table} (Target)
                                                    </SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {/* FK Referenced Column Select */}
                                    <div>
                                        <Label htmlFor="fk-referenced-column">Referenced Column</Label>
                                        <Select value={fkReferencedColumn} onValueChange={setFkReferencedColumn} disabled={!fkReferencedTableKey}>
                                            <SelectTrigger id="fk-referenced-column">
                                                <SelectValue placeholder="Select Column" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {allColumnsForFK
                                                    .filter(col => col.tableKey === fkReferencedTableKey)
                                                    .map(col => (
                                                        <SelectItem key={`ref-col-${col.tableKey}-${col.columnName}`} value={col.columnName}>
                                                            {col.columnName}
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button
                                        onClick={handleAddForeignKey}
                                        disabled={!fkSourceTableKey || !fkSourceColumn || !fkReferencedTableKey || !fkReferencedColumn}
                                        className="mt-auto"
                                    >
                                        Add Foreign Key
                                    </Button>
                                </CardContent>
                            </Card>

                            {/* Display Defined Foreign Keys */}
                            {manuallyDefinedFKs.length > 0 && (
                                <div className="mt-4 border p-3 rounded-md">
                                    <h4 className="text-md font-semibold mb-2">Defined Foreign Keys:</h4>
                                    <div className="space-y-2">
                                        {manuallyDefinedFKs.map((fk, index) => (
                                            <Badge key={index} variant="outline" className="pr-1 text-sm bg-purple-50">
                                                <span className="font-semibold">{fk.sourceTableKey.split('.').pop()}</span>.{fk.sourceColumn} &rarr;{' '}
                                                <span className="font-semibold">{fk.referencedTableKey.split('.').pop()}</span>.{fk.referencedColumn}
                                                <XCircle className="ml-1 h-3 w-3 cursor-pointer" onClick={() => handleRemoveForeignKey(fk)} />
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 mt-6">
                    <Button
                        onClick={handleNextClick}
                        disabled={isLoadingOptions || !projectId || selectedSourceTables.length === 0 || !selectedTargetTable}
                    >
                        {'Next'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step1PrimaryKeyFK;