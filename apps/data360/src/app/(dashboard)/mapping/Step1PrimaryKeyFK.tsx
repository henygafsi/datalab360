'use client';

import React, { useState, useEffect, useCallback, Dispatch, SetStateAction, useMemo, useRef } from 'react';
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
import { addGroupEvent, GroupData } from '@/app/services/mapping/saveGroups';

// --- Interface Definitions ---
interface ColumnDetail {
    name: string;
    data_type: string;
    is_primary_key?: boolean;
}

interface TableSelection { 
    database: string; 
    schema: string; 
    table: string; 
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
    groups?: Array<{ sources: TableSelection[]; target: TableSelection | null }>;
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

interface ExtraGroup {
    id: string;
    currentSourceSelection: TableSelection;
    currentSourceSchemas: string[];
    currentSourceTables: string[];
    isSourceOptionsLoading: boolean;
    selectedSourceTables: TableSelection[];
    target: TableSelection | null;
    targetColumns: ColumnDetail[];
    targetSchemas: string[];
    targetTables: string[];
    isTargetOptionsLoading?: boolean;
    allSourceColumns: { [key: string]: ColumnDetail[] };
}


const Step1PrimaryKeyFK: React.FC<Step1Props> = ({
    onNext, onBack, updateMappingData, selectedSourceTables, setSelectedSourceTables,
    selectedTargetTable, setSelectedTargetTable, databases, targetSchemas,
    targetTables, isLoadingOptions, projectId, username, mappingData,
}) => {
    const { toast } = useToast();
    const TARGET_DB = 'CP_DATA360';
    const TARGET_SCHEMA = 'RETAIL_DW';
    const [currentSourceSelection, setCurrentSourceSelection] = useState<TableSelection>({ database: '', schema: '', table: '' });
    const [allSourceColumnsData, setAllSourceColumnsData] = useState<{ [key: string]: ColumnDetail[] }>({});
    const [targetColumnsData, setTargetColumnsData] = useState<ColumnDetail[]>([]);
    const [isFetchingColumns, setIsFetchingColumns] = useState(false);
    const [currentSourceSchemas, setCurrentSourceSchemas] = useState<string[]>([]);
    const [currentSourceTables, setCurrentSourceTables] = useState<string[]>([]);
    const [isSourceOptionsLoading, setIsSourceOptionsLoading] = useState(false);
    const [manuallyDefinedPKs, setManuallyDefinedPKs] = useState<ManuallyDefinedPK[]>([]);
    const [extraGroups, setExtraGroups] = useState<ExtraGroup[]>([]);
    const [groupCounter, setGroupCounter] = useState(1);
    const fetchingColumnsRef = useRef<Set<string>>(new Set());
    const processedGroupsRef = useRef<Set<string>>(new Set());
    const prevGroupsLengthRef = useRef<number>(0);
    
    // Memoize PK lookup for performance with debouncing
    const pkLookup = useMemo(() => {
        const lookup = new Set<string>();
        manuallyDefinedPKs.forEach(pk => {
            lookup.add(`${pk.tableKey}|${pk.columnName}`);
        });
        return lookup;
    }, [manuallyDefinedPKs]);
    
    const isColumnPK = useCallback((tableKey: string, columnName: string) => {
        return pkLookup.has(`${tableKey}|${columnName}`);
    }, [pkLookup]);
    

    const updateGroup = useCallback((id: string, patch: Partial<ExtraGroup>) => {
        setExtraGroups(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
    }, []);

    const createNewGroup = useCallback((): ExtraGroup => ({
        id: `g${Date.now()}_${groupCounter}`,
        currentSourceSelection: { database: '', schema: '', table: '' },
        currentSourceSchemas: [],
        currentSourceTables: [],
        isSourceOptionsLoading: false,
        selectedSourceTables: [],
        target: null,
        targetColumns: [],
        targetSchemas: [],
        targetTables: [],
        allSourceColumns: {},
    }), [groupCounter]);

    const handleAddGroup = useCallback(() => {
        const newGroup = createNewGroup();
        setExtraGroups(prev => [...prev, newGroup]);
        setGroupCounter(c => c + 1);
    }, [createNewGroup]);

    const handleRemoveGroup = useCallback((id: string) => {
        setExtraGroups(prev => prev.filter(g => g.id !== id));
    }, []);

    const fetchAndStoreColumns = useCallback(async (database: string, schema: string, table: string) => {
        // Validate inputs before making API call
        if (!database || !schema || !table || table.trim() === '') {
            console.warn('fetchAndStoreColumns called with invalid parameters:', { database, schema, table });
            return [];
        }
        
        const cols = await getTableColumns(database, schema, table);
        const formatted: ColumnDetail[] = cols.map((col: any) => ({
            name: col.name || col.COLUMN_NAME || '',
            data_type: col.type || col.DATA_TYPE || '',
            is_primary_key: Boolean(col.is_primary_key) || col.CONSTRAINT_TYPE === 'PRIMARY KEY',
        }));
        return formatted;
    }, []);

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

    // Rehydrate groups from mappingData whenever it changes (e.g., when resuming a project)
    useEffect(() => {
        const rehydrate = async () => {
            const existingGroups = mappingData?.groups || [];

            // If groups are not stored, infer them from actions (column_mappings grouped by target)
            let groupsToUse = existingGroups;
            if (!groupsToUse || groupsToUse.length === 0) {
                const mappings = Array.isArray(mappingData?.column_mappings) ? mappingData!.column_mappings : [] as any[];
                const groupsByTarget = new Map<string, { sources: TableSelection[]; target: TableSelection | null }>();

                const parseKey = (key: string): TableSelection | null => {
                    if (!key || typeof key !== 'string') return null;
                    const parts = key.split('.');
                    if (parts.length !== 3) return null;
                    return { database: parts[0], schema: parts[1], table: parts[2] };
                };

                mappings.forEach((m: any) => {
                    const tgtKey = m.target_table_key || (mappingData?.target_database && mappingData?.target_schema && mappingData?.target_table
                        ? `${mappingData.target_database}.${mappingData.target_schema}.${mappingData.target_table}`
                        : '');
                    const srcKey = m.source_table_key;
                    if (!tgtKey || !srcKey) return;

                    const targetSel = parseKey(tgtKey);
                    const sourceSel = parseKey(srcKey);
                    if (!targetSel || !sourceSel) return;

                    const existing = groupsByTarget.get(tgtKey) || { sources: [], target: targetSel };
                    const hasSource = existing.sources.some(s => s.database === sourceSel.database && s.schema === sourceSel.schema && s.table === sourceSel.table);
                    if (!hasSource) existing.sources.push(sourceSel);
                    groupsByTarget.set(tgtKey, existing);
                });

                // Fallback: if still empty, use single target from mappingData if present
                if (groupsByTarget.size === 0 && mappingData?.target_database && mappingData?.target_schema && mappingData?.target_table) {
                    const tgt: TableSelection = { database: mappingData.target_database, schema: mappingData.target_schema, table: mappingData.target_table };
                    const src: TableSelection[] = (mappingData.source_database && mappingData.source_schema && mappingData.source_table)
                        ? [{ database: mappingData.source_database, schema: mappingData.source_schema, table: mappingData.source_table }]
                        : [];
                    groupsByTarget.set(`${tgt.database}.${tgt.schema}.${tgt.table}`, { sources: src, target: tgt });
                }

                groupsToUse = Array.from(groupsByTarget.values()).map(g => ({ sources: g.sources, target: g.target }));
            }

            if (!groupsToUse || groupsToUse.length === 0) {
                return;
            }

            const rebuilt: ExtraGroup[] = [];
            for (let i = 0; i < groupsToUse.length; i++) {
                const g = groupsToUse[i];
                const id = `rehydrated_${i}_${Date.now()}`;
                const group: ExtraGroup = {
                    id,
                    currentSourceSelection: { database: '', schema: '', table: '' },
                    currentSourceSchemas: [],
                    currentSourceTables: [],
                    isSourceOptionsLoading: false,
                    selectedSourceTables: g.sources || [],
                    target: g.target || null,
                    targetColumns: [],
                    targetSchemas: [],
                    targetTables: [],
                    allSourceColumns: {},
                };
                rebuilt.push(group);
            }
            setExtraGroups(rebuilt);
        };
        rehydrate();
    }, [mappingData?.groups, mappingData]);


    // Extra groups: fetch helpers for schemas and tables on demand
    const fetchGroupSchemas = useCallback(async (id: string, database: string) => {
        updateGroup(id, { isSourceOptionsLoading: true });
        try {
            const schemas = await getSchemas(database);
            updateGroup(id, { currentSourceSchemas: schemas });
        } catch (error) {
            toast({ title: "Error", description: "Failed to fetch source schemas.", variant: "destructive" });
        } finally {
            updateGroup(id, { isSourceOptionsLoading: false });
        }
    }, [toast, updateGroup]);

    const fetchGroupTables = useCallback(async (id: string, database: string, schema: string) => {
        updateGroup(id, { isSourceOptionsLoading: true });
        try {
            const tables = await getTables(database, schema);
            updateGroup(id, { currentSourceTables: tables });
        } catch (error) {
            toast({ title: "Error", description: "Failed to fetch source tables.", variant: "destructive" });
        } finally {
            updateGroup(id, { isSourceOptionsLoading: false });
        }
    }, [toast, updateGroup]);

    // Ensure source columns are fetched for rehydrated groups even if UI hasn't added sources interactively
    useEffect(() => {
        const ensureGroupSourceColumns = async () => {
            const columnPromises: Promise<void>[] = [];
            
            for (const g of extraGroups) {
                let selectedSources = g.selectedSourceTables;
                // Fallback: infer sources from column_mappings when missing
                if ((!selectedSources || selectedSources.length === 0) && g.target) {
                    const tgtKey = `${g.target.database}.${g.target.schema}.${g.target.table}`;
                    const uniqueSrcKeys = Array.from(new Set((mappingData.column_mappings || [])
                        .filter((m: any) => (m.target_table_key ? m.target_table_key === tgtKey : true))
                        .map((m: any) => m.source_table_key)
                        .filter(Boolean)));
                    const parsed: TableSelection[] = uniqueSrcKeys.map(k => {
                        const [db, sch, tbl] = k.split('.');
                        return { database: db, schema: sch, table: tbl };
                    });
                    if (parsed.length > 0) {
                        updateGroup(g.id, { selectedSourceTables: parsed });
                        selectedSources = parsed;
                    } else {
                        // Fallback 2: infer from primary_keys.source by schema rule (non RETAIL_DW are sources)
                        const pkSourceMap = mappingData.primary_keys?.source || {};
                        const pkSourceKeys = Object.keys(pkSourceMap);
                        const nonRetailSources = pkSourceKeys
                            .map(k => {
                                const [db, sch, tbl] = k.split('.');
                                return { database: db, schema: sch, table: tbl } as TableSelection;
                            })
                            .filter(sel => sel.schema !== 'RETAIL_DW');
                        // Heuristic: prefer sources whose table matches target after stripping DIM_/FACT_
                        const normalize = (name: string) => name.replace(/^(DIM_|FACT_)/, '');
                        const tgtBase = normalize(g.target.table);
                        const prioritized = nonRetailSources.filter(s => {
                            const sb = s.table.toUpperCase();
                            const tb = tgtBase.toUpperCase();
                            return sb === tb || sb === tb + 'S' || sb + 'S' === tb;
                        });
                        const chosen = prioritized.length > 0 ? prioritized : nonRetailSources;
                        if (chosen.length > 0) {
                            updateGroup(g.id, { selectedSourceTables: chosen });
                            selectedSources = chosen;
                        }
                    }
                }
                
                // Collect all column fetch promises for parallel execution
                for (const sel of selectedSources) {
                    const key = `${sel.database}.${sel.schema}.${sel.table}`;
                    if (!g.allSourceColumns[key] && !fetchingColumnsRef.current.has(key)) {
                        fetchingColumnsRef.current.add(key);
                        columnPromises.push(
                            fetchAndStoreColumns(sel.database, sel.schema, sel.table)
                                .then(cols => {
                                    updateGroup(g.id, { allSourceColumns: { ...g.allSourceColumns, [key]: cols } });
                                    fetchingColumnsRef.current.delete(key);
                                })
                                .catch(() => {
                                    fetchingColumnsRef.current.delete(key);
                                })
                        );
                    }
                }
                
                // Fetch target columns if missing and target table is selected
                if (g.target && g.target.table && g.target.table.trim() !== '' && g.targetColumns.length === 0) {
                    const targetKey = `${g.target.database}.${g.target.schema}.${g.target.table}`;
                    if (!fetchingColumnsRef.current.has(targetKey)) {
                        fetchingColumnsRef.current.add(targetKey);
                        columnPromises.push(
                            fetchAndStoreColumns(g.target.database, g.target.schema, g.target.table)
                                .then(cols => {
                                    updateGroup(g.id, { targetColumns: cols });
                                    fetchingColumnsRef.current.delete(targetKey);
                                })
                                .catch(() => {
                                    fetchingColumnsRef.current.delete(targetKey);
                                })
                        );
                    }
                }
            }
            
            // Execute all column fetches in parallel
            if (columnPromises.length > 0) {
                await Promise.all(columnPromises);
            }
        };
        
        if (extraGroups.length > 0) {
            ensureGroupSourceColumns();
        }
    }, [extraGroups, mappingData.column_mappings, mappingData.primary_keys?.source, fetchAndStoreColumns, updateGroup]);

    // Target-side fetchers per group
    const fetchGroupTargetSchemas = useCallback(async (id: string, database: string) => {
        updateGroup(id, { isTargetOptionsLoading: true });
        try {
            const schemas = await getSchemas(database);
            updateGroup(id, { targetSchemas: schemas });
        } catch (error) {
            toast({ title: "Error", description: "Failed to fetch target schemas.", variant: "destructive" });
        } finally {
            updateGroup(id, { isTargetOptionsLoading: false });
        }
    }, [toast, updateGroup]);

    const fetchGroupTargetTables = useCallback(async (id: string, database: string, schema: string) => {
        updateGroup(id, { isTargetOptionsLoading: true });
        try {
            const tables = await getTables(database, schema);
            updateGroup(id, { targetTables: tables });
        } catch (error) {
            toast({ title: "Error", description: "Failed to fetch target tables.", variant: "destructive" });
        } finally {
            updateGroup(id, { isTargetOptionsLoading: false });
        }
    }, [toast, updateGroup]);


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

    // Build PKs list from mappingData - separate effect to avoid re-fetching columns
    useEffect(() => {
        const pksFromProps: ManuallyDefinedPK[] = [];
        if (mappingData.primary_keys?.source) {
            for (const tableKey in mappingData.primary_keys.source) {
                mappingData.primary_keys.source[tableKey].forEach(columnName => pksFromProps.push({ tableKey, columnName }));
            }
        }
        // console.log('Building PKs from mappingData:', {
            // pksFromProps: pksFromProps.length,
            // currentManuallyDefinedPKs: manuallyDefinedPKs.length,
            // mappingDataPKs: mappingData.primary_keys?.source
        // });
        setManuallyDefinedPKs(pksFromProps);
    }, [mappingData.primary_keys?.source]); // Removed extraGroups and selectedTargetTable from deps

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

    // Extra group handlers
    const addGroupSourceTable = useCallback(async (id: string) => {
        const grp = extraGroups.find(g => g.id === id);
        if (!grp) return;
        const sel = grp.currentSourceSelection;
        if (!sel.table) return;
        const isAlreadyAdded = grp.selectedSourceTables.some(t => t.database === sel.database && t.schema === sel.schema && t.table === sel.table);
        if (isAlreadyAdded) {
            toast({ title: "Info", description: "This source table is already added.", variant: "default" });
            return;
        }
        const tableKey = `${sel.database}.${sel.schema}.${sel.table}`;
        try {
            const cols = await fetchAndStoreColumns(sel.database, sel.schema, sel.table);
            updateGroup(id, {
                selectedSourceTables: [...grp.selectedSourceTables, sel],
                currentSourceSelection: { database: '', schema: '', table: '' },
                allSourceColumns: { ...grp.allSourceColumns, [tableKey]: cols },
            });
        } catch (e: any) {
            toast({ title: "Error", description: `Failed to fetch columns for ${sel.table}.`, variant: "destructive" });
        }
    }, [extraGroups, fetchAndStoreColumns, toast, updateGroup]);

    const removeGroupSourceTable = useCallback((id: string, tableToRemove: TableSelection) => {
        const grp = extraGroups.find(g => g.id === id);
        if (!grp) return;
        const filtered = grp.selectedSourceTables.filter(t => !(t.database === tableToRemove.database && t.schema === tableToRemove.schema && t.table === tableToRemove.table));
        const tableKeyToRemove = `${tableToRemove.database}.${tableToRemove.schema}.${tableToRemove.table}`;
        const newAll = { ...grp.allSourceColumns };
        delete newAll[tableKeyToRemove];
        setManuallyDefinedPKs(prev => prev.filter(pk => pk.tableKey !== tableKeyToRemove));
        updateGroup(id, { selectedSourceTables: filtered, allSourceColumns: newAll });
    }, [extraGroups, updateGroup]);

    const setGroupTargetTable = useCallback(async (id: string, table: string) => {
        const grp = extraGroups.find(g => g.id === id);
        if (!grp || !grp.target?.schema || !grp.target?.database) return;
        
        // Only proceed if table name is not empty
        if (!table || table.trim() === '') {
            updateGroup(id, { target: { ...grp.target, database: TARGET_DB, schema: TARGET_SCHEMA, table: '' }, targetColumns: [] });
            return;
        }
        
        const updatedTarget = { ...grp.target, database: TARGET_DB, schema: TARGET_SCHEMA, table };
        try {
            const cols = await fetchAndStoreColumns(updatedTarget.database, updatedTarget.schema, updatedTarget.table);
            updateGroup(id, { target: updatedTarget, targetColumns: cols });
        } catch (e: any) {
            toast({ title: "Error", description: `Failed to fetch target columns for ${table}.`, variant: "destructive" });
        }
    }, [extraGroups, fetchAndStoreColumns, toast, updateGroup]);

    // Toggling now only updates local selection; applying/saving is explicit
    const handleTogglePrimaryKey = useCallback((tableKey: string, columnName: string) => {
        const isCurrentlyPk = isColumnPK(tableKey, columnName);
        const otherTablesPks = manuallyDefinedPKs.filter(pk => !(pk.tableKey === tableKey && pk.columnName === columnName));
        const nextState = isCurrentlyPk
            ? otherTablesPks
            : [...manuallyDefinedPKs, { tableKey, columnName }];
        
        // console.log('Toggling PK:', {
            // tableKey,
            // columnName,
            // isCurrentlyPk,
            // currentPKs: manuallyDefinedPKs.length,
            // nextPKs: nextState.length,
            // action: isCurrentlyPk ? 'REMOVING' : 'ADDING'
        // });
        
        setManuallyDefinedPKs(nextState);
    }, [manuallyDefinedPKs, isColumnPK]);

    // Apply/save PKs for a specific table: sends full set for that table
    const handleApplyTablePKs = useCallback(async (tableKey: string) => {
        try {
        const [database_name, schema_name, table_name] = tableKey.split('.');
            const cols = manuallyDefinedPKs.filter(pk => pk.tableKey === tableKey).map(pk => pk.columnName);
            
            await addPrimaryKey({ project_id: projectId, database_name, schema_name, table_name, column_names: cols });

            // Update parent mappingData.primary_keys from local state
            const updatedSource: { [key: string]: string[] } = { ...(mappingData.primary_keys?.source || {}) };
            const updatedTargetList = mappingData.primary_keys?.target || [];
            
            // Check if this is a target table (RETAIL_DW schema)
            const isTargetTable = tableKey.includes('.RETAIL_DW.');
            if (isTargetTable) {
                // Store target PKs per-target-table to avoid conflicts across multiple targets
                // We keep the global target list unchanged for backward compatibility and
                // save the per-target list under the keyed map as well.
                const unique = Array.from(new Set(cols));
                updatedSource[tableKey] = unique;
                updateMappingData({ primary_keys: { source: updatedSource, target: updatedTargetList } });
            } else {
                updatedSource[tableKey] = cols;
                updateMappingData({ primary_keys: { source: updatedSource, target: updatedTargetList } });
            }

            toast({ title: 'Primary Keys Saved', description: `PKs saved for ${table_name}.` });
        } catch (e: any) {
            const message = typeof e?.message === 'string' ? e.message : 'Unknown error';
            toast({ title: 'Error', description: `Failed to save primary keys: ${message}`, variant: 'destructive' });
        }
    }, [manuallyDefinedPKs, mappingData.primary_keys, projectId, updateMappingData, toast]);

    const handleSaveGroups = useCallback(async () => {
        if (!projectId || extraGroups.length === 0) {
            toast({ title: "Info", description: "No groups to save.", variant: "default" });
            return;
        }

        const groupsToSave: GroupData[] = extraGroups.map(group => ({
            sources: group.selectedSourceTables,
            target: group.target
        }));

        try {
            await addGroupEvent({
                project_id: projectId,
                groups: groupsToSave
            });

            toast({ title: "Success", description: "Groups saved successfully.", variant: "default" });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to save groups';
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    }, [projectId, extraGroups, toast]);


    const handleNextClick = useCallback(async () => {
        if (extraGroups.length === 0) {
            toast({ title: 'Missing Group', description: 'Please add a group and configure sources/target.', variant: 'destructive' });
            return;
        }
        const g = extraGroups[0];
        if (!g.selectedSourceTables.length) {
            toast({ title: 'Missing Sources', description: 'Please add at least one source table in the first group.', variant: 'destructive' });
            return;
        }
        if (!g.target || !g.target.database || !g.target.schema || !g.target.table) {
            toast({ title: 'Missing Target', description: 'Please select a target table in the first group.', variant: 'destructive' });
            return;
        }

        // Auto-save groups and PKs before proceeding to next step
        try {
            await handleSaveGroups();
        } catch (error) {
            console.warn('Failed to save groups:', error);
        }

        const primaryKeysForMapping: { source: { [key: string]: string[] }; target: string[] } = { source: {}, target: [] };
        const targetPkSet = new Set<string>();

        // Debug: Log current state before processing
        // console.log('=== DEBUG: Before PK Collection ===');
        // console.log('Total groups:', extraGroups.length);
        // console.log('Manually defined PKs:', manuallyDefinedPKs);
        // console.log('Groups details:', extraGroups.map(g => ({
            // id: g.id,
            // sources: g.selectedSourceTables.length,
            // target: g.target?.table || 'none',
            // sourceTables: g.selectedSourceTables.map(t => `${t.database}.${t.schema}.${t.table}`)
        // })));

        // Collect source and target PKs across ALL groups
        for (const group of extraGroups) {
            // console.log(`Processing group ${group.id}:`, {
                // sources: group.selectedSourceTables.length,
                // target: group.target?.table || 'none'
            // });
            
            // Collect source PKs for this group's sources
            for (const sourceTable of group.selectedSourceTables) {
                const tableKey = `${sourceTable.database}.${sourceTable.schema}.${sourceTable.table}`;
                const sourcePKs = manuallyDefinedPKs.filter(pk => pk.tableKey === tableKey);
                
                // console.log(`  Processing source table ${tableKey}:`, {
                    // foundPKs: sourcePKs.length,
                    // pkDetails: sourcePKs
                // });
                
                if (sourcePKs.length > 0) {
                    if (!primaryKeysForMapping.source[tableKey]) {
                        primaryKeysForMapping.source[tableKey] = [];
                    }
                    sourcePKs.forEach(pk => {
                        if (!primaryKeysForMapping.source[tableKey].includes(pk.columnName)) {
                            primaryKeysForMapping.source[tableKey].push(pk.columnName);
                        }
                    });
                }
            }
            
            // Collect target PKs for this group's target
            if (group.target) {
                const tKey = `${group.target.database}.${group.target.schema}.${group.target.table}`;
                const targetPKs = manuallyDefinedPKs.filter(pk => pk.tableKey === tKey);
                
                // console.log(`  Processing target table ${tKey}:`, {
                    // foundPKs: targetPKs.length,
                    // pkDetails: targetPKs
                // });
                
                targetPKs.forEach(pk => targetPkSet.add(pk.columnName));
            }
        }
        primaryKeysForMapping.target = Array.from(targetPkSet);

        // Debug logging to verify all groups are processed
        // console.log('Processing PKs for all groups:', {
            // totalGroups: extraGroups.length,
            // sourcePKs: Object.keys(primaryKeysForMapping.source).length,
            // targetPKs: primaryKeysForMapping.target.length,
            // sourcePKDetails: primaryKeysForMapping.source,
            // targetPKDetails: primaryKeysForMapping.target,
            // allManuallyDefinedPKs: manuallyDefinedPKs.length,
            // manuallyDefinedPKDetails: manuallyDefinedPKs
        // });

        // Validate that we have PKs for all groups
        const groupsWithSources = extraGroups.filter(g => g.selectedSourceTables.length > 0);
        const groupsWithTargets = extraGroups.filter(g => g.target && g.target.table);
        
        // console.log('Group validation:', {
            // groupsWithSources: groupsWithSources.length,
            // groupsWithTargets: groupsWithTargets.length,
            // totalSourceTables: groupsWithSources.reduce((sum, g) => sum + g.selectedSourceTables.length, 0)
        // });

        const firstSrc = g.selectedSourceTables[0];
        // Persist every group's PKs (call addPrimaryKey for each table with selected PKs)
        try {
            const savePkCalls: Promise<any>[] = [];
            const nextSourcePkMap: { [key: string]: string[] } = {};
            const nextTargetPkSet = new Set<string>(primaryKeysForMapping.target);

            // Save source PKs per table
            for (const [tableKey, cols] of Object.entries(primaryKeysForMapping.source)) {
                const [db, sch, tbl] = tableKey.split('.');
                const unique = Array.from(new Set(cols));
                nextSourcePkMap[tableKey] = unique;
                savePkCalls.push(addPrimaryKey({ project_id: projectId, database_name: db, schema_name: sch, table_name: tbl, column_names: unique }));
            }

            // Save target PKs per each group's target table
            for (const group of extraGroups) {
                if (!group.target) continue;
                const tKey = `${group.target.database}.${group.target.schema}.${group.target.table}`;
                const tCols = manuallyDefinedPKs.filter(pk => pk.tableKey === tKey).map(pk => pk.columnName);
                const unique = Array.from(new Set(tCols));
                if (unique.length) {
                    nextSourcePkMap[tKey] = unique; // store per-target under keyed map
                    unique.forEach(c => nextTargetPkSet.add(c)); // keep legacy global list for compatibility
                    savePkCalls.push(addPrimaryKey({ project_id: projectId, database_name: group.target.database, schema_name: group.target.schema, table_name: group.target.table, column_names: unique }));
                }
            }

            await Promise.all(savePkCalls);

        updateMappingData({
                primary_keys: { source: nextSourcePkMap, target: Array.from(nextTargetPkSet) },
            source_database: firstSrc?.database || mappingData.source_database,
            source_schema: firstSrc?.schema || mappingData.source_schema,
            source_table: firstSrc?.table || mappingData.source_table,
            target_database: g.target.database || mappingData.target_database,
            target_schema: g.target.schema || mappingData.target_schema,
            target_table: g.target.table || mappingData.target_table,
            groups: extraGroups.map(eg => ({ sources: eg.selectedSourceTables, target: eg.target }))
        });
        } catch {}
        // sync parent step state to keep Step 2 inputs populated
        try {
            setSelectedSourceTables(g.selectedSourceTables);
        // eslint-disable-next-line no-empty
        } catch {}
        try {
            setSelectedTargetTable(g.target);
        // eslint-disable-next-line no-empty
        } catch {}
        onNext();
    }, [extraGroups, manuallyDefinedPKs, updateMappingData, onNext, mappingData, toast, setSelectedSourceTables, setSelectedTargetTable, projectId, handleSaveGroups]);

    // Handle target initialization for all groups (new and rehydrated)
    useEffect(() => {
        if (extraGroups.length === 0) return;
        
        // Only process if the number of groups has changed (new groups added)
        if (extraGroups.length <= prevGroupsLengthRef.current) return;
        
        // Process only new groups that haven't been processed yet
        const newGroups = extraGroups.filter(g => !processedGroupsRef.current.has(g.id));
        
        if (newGroups.length === 0) return;
        
        newGroups.forEach(g => {
            // Mark as processed to avoid reprocessing
            processedGroupsRef.current.add(g.id);
            
            // Set target to static values
            updateGroup(g.id, { 
                target: { database: TARGET_DB, schema: TARGET_SCHEMA, table: g.target?.table || '' }
            });
            
            // Fetch tables
            (async () => {
                try {
                    await fetchGroupTargetSchemas(g.id, TARGET_DB);
                    await fetchGroupTargetTables(g.id, TARGET_DB, TARGET_SCHEMA);
                } catch (error) {
                    console.warn('Failed to fetch target tables for group', g.id, error);
                }
            })();
        });
        
        // Update the previous length
        prevGroupsLengthRef.current = extraGroups.length;
    }, [extraGroups.length, updateGroup, fetchGroupTargetSchemas, fetchGroupTargetTables, TARGET_DB, TARGET_SCHEMA]); // eslint-disable-line react-hooks/exhaustive-deps

    // Ensure target tables are fetched for any group with empty targetTables (handles rehydrated groups on navigation back)
    useEffect(() => {
        if (extraGroups.length === 0) return;

        // Find groups that have empty targetTables and haven't been processed for target table fetch
        const groupsNeedingTargetTables = extraGroups.filter(g =>
            g.targetTables.length === 0 && !processedGroupsRef.current.has(g.id)
        );

        if (groupsNeedingTargetTables.length === 0) return;

        groupsNeedingTargetTables.forEach(g => {
            // Mark as processed to avoid repeated fetches
            processedGroupsRef.current.add(g.id);

            // Set target database/schema and fetch tables
            updateGroup(g.id, {
                target: { database: TARGET_DB, schema: TARGET_SCHEMA, table: g.target?.table || '' }
            });

            (async () => {
                try {
                    await fetchGroupTargetSchemas(g.id, TARGET_DB);
                    await fetchGroupTargetTables(g.id, TARGET_DB, TARGET_SCHEMA);
                } catch (error) {
                    console.warn('Failed to fetch target tables for rehydrated group', g.id, error);
                }
            })();
        });

        // Update the previous length to current
        prevGroupsLengthRef.current = extraGroups.length;
    }, [extraGroups, updateGroup, fetchGroupTargetSchemas, fetchGroupTargetTables]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Card className="p-4">
            <CardHeader>
                <CardTitle>Step 1: Primary Key Management</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Select source and target tables, then define Primary Keys for both.
                </p>
            </CardHeader>
            <CardContent className="space-y-8">
                {/* Additional PK Groups */}
                <div className="mt-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Additional PK Groups</h3>
                        <Button onClick={handleAddGroup} variant="secondary"><PlusCircle className="mr-2 h-4 w-4" /> Add Group</Button>
                    </div>

                    {extraGroups.map((g, idx) => (
                        <details key={g.id} className="rounded-md border p-2 space-y-6">
                            <summary className="cursor-pointer select-none font-medium">
                                PK Group {idx + 1} {g.target?.table ? `— Target: ${g.target.table}` : '(no target yet)'}
                                <XCircle className="inline ml-2 h-4 w-4 cursor-pointer" onClick={(e) => { e.preventDefault(); handleRemoveGroup(g.id); }} />
                            </summary>

                            {/* Selection controls stacked (not side-by-side) */}
                            <div className="space-y-6">
                            <div className="space-y-4">
                                <h4 className="text-md font-semibold">Select Source Tables</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    <div>
                                        <Label>Source Database</Label>
                                        <Select onValueChange={async (db) => { updateGroup(g.id, { currentSourceSelection: { database: db, schema: '', table: '' } }); await fetchGroupSchemas(g.id, db); }} value={g.currentSourceSelection.database}>
                                            <SelectTrigger><SelectValue placeholder="Select Database" /></SelectTrigger>
                                            <SelectContent>
                                                {databases.map(db => <SelectItem key={db} value={db}>{db}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Source Schema</Label>
                                        <Select onValueChange={async (schema) => { updateGroup(g.id, { currentSourceSelection: { ...g.currentSourceSelection, schema, table: '' } }); await fetchGroupTables(g.id, g.currentSourceSelection.database, schema); }} value={g.currentSourceSelection.schema} disabled={!g.currentSourceSelection.database}>
                                            <SelectTrigger><SelectValue placeholder="Select Schema" /></SelectTrigger>
                                            <SelectContent>
                                                {g.currentSourceSchemas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Source Table</Label>
                                        <Select onValueChange={(table) => updateGroup(g.id, { currentSourceSelection: { ...g.currentSourceSelection, table } })} value={g.currentSourceSelection.table} disabled={!g.currentSourceSelection.schema}>
                                            <SelectTrigger><SelectValue placeholder="Select Table" /></SelectTrigger>
                                            <SelectContent>
                                                {g.currentSourceTables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button onClick={() => addGroupSourceTable(g.id)} disabled={!g.currentSourceSelection.table}>
                                        <PlusCircle className="mr-2 h-4 w-4" /> Add Source
                                    </Button>
                                </div>
                                {g.selectedSourceTables.length > 0 && (
                                    <div className="border p-3 rounded-md mt-4">
                                        <h4 className="text-md font-semibold mb-2">Selected Source Tables:</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {g.selectedSourceTables.map(t => (
                                                <Badge key={`${t.database}.${t.schema}.${t.table}`} variant="secondary" className="pr-1">
                                                    {`${t.database}.${t.schema}.${t.table}`}
                                                    <XCircle className="ml-2 h-4 w-4 cursor-pointer" onClick={() => removeGroupSourceTable(g.id, t)} />
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Target selection for group */}
                            <div className="space-y-4">
                                <h4 className="text-md font-semibold">Select Target Table</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <Label>Target Database</Label>
                                        <Select onValueChange={async () => { updateGroup(g.id, { target: { database: TARGET_DB, schema: '', table: '' }, targetSchemas: [], targetTables: [], targetColumns: [] }); await fetchGroupTargetSchemas(g.id, TARGET_DB); }} value={TARGET_DB} disabled>
                                            <SelectTrigger><SelectValue placeholder="Select Database" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={TARGET_DB}>{TARGET_DB}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Target Schema</Label>
                                        <Select onValueChange={async () => { updateGroup(g.id, { target: { ...g.target!, database: TARGET_DB, schema: TARGET_SCHEMA, table: '' }, targetTables: [], targetColumns: [] }); await fetchGroupTargetTables(g.id, TARGET_DB, TARGET_SCHEMA); }} value={TARGET_SCHEMA} disabled>
                                            <SelectTrigger><SelectValue placeholder="Select Schema" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={TARGET_SCHEMA}>{TARGET_SCHEMA}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Target Table</Label>
                                        <Select onValueChange={(table) => setGroupTargetTable(g.id, table)} value={g.target?.table || ''} disabled={!TARGET_SCHEMA}>
                                            <SelectTrigger><SelectValue placeholder="Select Table" /></SelectTrigger>
                                            <SelectContent>
                                                {g.targetTables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                            </div>

                            {/* Columns for group */}
                            {(g.selectedSourceTables.length > 0 || (g.target?.table && g.target.table.trim() !== '')) ? (
                                <div className="space-y-6 mt-6">
                                    <h4 className="text-md font-semibold">Define Primary Keys</h4>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {g.selectedSourceTables.map(src => {
                                            const tableKey = `${src.database}.${src.schema}.${src.table}`;
                                            const columns = g.allSourceColumns[tableKey] || [];
                                            return (
                                            <Card key={tableKey}>
                                                    <CardHeader><CardTitle>Source: {src.table}</CardTitle></CardHeader>
                                                <CardContent className="max-h-60 overflow-y-auto">
                                                    {columns.length === 0 ? (
                                                        <p className="text-sm text-muted-foreground">Loading columns for {src.table}...</p>
                                                    ) : (
                                                        <>
                                                    <ul className="space-y-1">
                                                        {columns.map(col => {
                                                                    const isPk = isColumnPK(tableKey, col.name);
                                                            return (
                                                                <li key={`${tableKey}-${col.name}`} className="flex items-center gap-2">
                                                                    <input type="checkbox" id={`pk-${tableKey}-${col.name}`} checked={isPk} onChange={() => handleTogglePrimaryKey(tableKey, col.name)} />
                                                                    <Label htmlFor={`pk-${tableKey}-${col.name}`}>{col.name} <span className="text-muted-foreground">({col.data_type})</span></Label>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                        </>
                                                    )}
                                                </CardContent>
                                            </Card>
                                            );
                                        })}
                                        {g.target?.table && g.target.table.trim() !== '' && (
                                            <Card>
                                                <CardHeader><CardTitle>Target: {g.target?.table}</CardTitle></CardHeader>
                                                <CardContent className="max-h-60 overflow-y-auto">
                                                {(g.targetColumns.length > 0 ? g.targetColumns : []).length > 0 ? (
                                                    <>
                                                    <ul className="space-y-1">
                                                        {g.targetColumns.map(col => {
                                                            const tableKey = `${g.target?.database}.${g.target?.schema}.${g.target?.table}`;
                                                                const isPk = isColumnPK(tableKey, col.name);
                                                            return (
                                                                <li key={`target-${col.name}`} className="flex items-center gap-2">
                                                                    <input type="checkbox" id={`pk-${tableKey}-${col.name}`} checked={isPk} onChange={() => handleTogglePrimaryKey(tableKey, col.name)} />
                                                                    <Label htmlFor={`pk-${tableKey}-${col.name}`}>{col.name} <span className="text-muted-foreground">({col.data_type})</span></Label>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                    </>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">Loading columns for {g.target.table}...</p>
                                                )}
                                                </CardContent>
                                            </Card>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-muted-foreground mt-4">Add at least one source and select a target to define primary keys.</p>
                            )}
                        </details>
                    ))}
                </div>
                {/* Removed legacy selectors outside groups */}

                {/* Column Display and PK Selection */}
                {false && ( // legacy default PK area hidden; use groups instead
                    <div className="space-y-6 mt-6">
                        <h3 className="text-lg font-semibold">Define Primary Keys</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {Object.entries(allSourceColumnsData).map(([tableKey, columns]) => (
                                <Card key={tableKey}>
                                    <CardHeader><CardTitle>Source: {tableKey.split('.').pop()}</CardTitle></CardHeader>
                                    <CardContent className="max-h-60 overflow-y-auto">
                                        <ul className="space-y-1">
                                            {columns.map(col => {
                                                const isPk = isColumnPK(tableKey, col.name);
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
                                    <CardHeader><CardTitle>Target: {selectedTargetTable?.table || ''}</CardTitle></CardHeader>
                                    <CardContent className="max-h-60 overflow-y-auto">
                                        <ul className="space-y-1">
                                            {targetColumnsData.map(col => (
                                                <li key={`target-${col.name}`} className="flex items-center gap-2">
                                                    <span className="h-4 w-4 inline-block rounded border border-muted-foreground/30 bg-muted/20" aria-hidden />
                                                    <Label>
                                                        {col.name} <span className="text-muted-foreground">({col.data_type})</span>
                                                        {col.is_primary_key && <span className="ml-2 text-xs font-medium text-green-600">PK</span>}
                                                    </Label>
                                                </li>
                                            ))}
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


