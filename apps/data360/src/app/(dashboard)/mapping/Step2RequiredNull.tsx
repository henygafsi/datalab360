'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import axios from 'axios';
import { getAuthSession } from '@/lib/auth';
import { getSession } from 'next-auth/react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

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
    length_text?: string;
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
    column_attributes?: { [tableKey: string]: { [columnName: string]: ColumnAttributes } };
    groups?: Array<{ sources: TableSelection[]; target: TableSelection | null }>;
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
        [tableKey: string]: { [columnName: string]: ColumnAttributes };
    }>(mappingData.column_attributes || {});
    const [sourceSearch, setSourceSearch] = useState('');
    const [targetSearch, setTargetSearch] = useState('');
    const [selectAllSource, setSelectAllSource] = useState(false);
    const [selectAllTarget, setSelectAllTarget] = useState(false);
    // Snapshot original per-table attributes to detect changed columns on save
    const originalAttributesRef = useRef<{ [tableKey: string]: { [col: string]: { data_type?: string; length_text?: string } } }>({});

    // Common SQL data types list for selection. Includes frequently used types.
    const AVAILABLE_TYPES = [
        'VARCHAR',
        'NUMBER',
        'FLOAT',
        'DOUBLE',
        'BOOLEAN',
        'DATE',
        'TIMESTAMP'
    ];

    const getLengthModeForType = useCallback((typeName?: string): 'none' | 'numeric' | 'precisionScale' => {
        const t = (typeName || '').toUpperCase();
        if (!t) return 'none';
        if (['VARCHAR', 'CHAR', 'NCHAR', 'NVARCHAR', 'VARBINARY'].includes(t)) return 'numeric';
        if (['NUMBER', 'DECIMAL', 'NUMERIC'].includes(t)) return 'precisionScale';
        return 'none';
    }, []);

    const isValidLengthForType = useCallback((typeName?: string, value?: string): boolean => {
        const mode = getLengthModeForType(typeName);
        if (!value) return true;
        if (mode === 'numeric') return /^\d+$/.test(value.trim());
        if (mode === 'precisionScale') return /^\d+(,\d+)?$/.test(value.trim());
        return false;
    }, [getLengthModeForType]);

    const handleLengthChange = useCallback((tableKey: string, columnName: string, value: string) => {
        const trimmed = value.trim();
        const onlyDigits = /^\d+$/.test(trimmed);
        setInternalColumnAttributes(prev => {
            const next = JSON.parse(JSON.stringify(prev)) as typeof prev;
            if (!next[tableKey]) next[tableKey] = {};
            if (!next[tableKey][columnName]) next[tableKey][columnName] = {} as ColumnAttributes;
            next[tableKey][columnName].length_text = trimmed || undefined;
            // Keep numeric length for simple cases like VARCHAR(255)
            if (onlyDigits) next[tableKey][columnName].length = Number(trimmed);
            else delete next[tableKey][columnName].length;
            return next;
        });
    }, []);

    const handleSaveLengths = useCallback(async (table: TableSelection) => {
        if (!table) return;
        try {
            const session = await getSession();
            if (!session?.user?.access_token) throw new Error('No access token available');
            const token = session.user.access_token;
            const tableKey = `${table.database}.${table.schema}.${table.table}`;
            const attrs = internalColumnAttributes[tableKey] || {};
            const new_lengths: Record<string, number> = {};
            Object.entries(attrs).forEach(([col, a]) => {
                const len = (a as ColumnAttributes).length as number | undefined;
                if (typeof len === 'number' && Number.isFinite(len)) {
                    new_lengths[col] = len;
                }
            });
            const payload = { database: table.database, schema: table.schema, table: table.table, new_lengths } as any;
            await axios.post(`${API_BASE_URL}/explore-design/guided/update_column_length/`, payload, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            updateMappingData({ column_attributes: internalColumnAttributes });
            toast({ title: 'Lengths Updated', description: `${table.table}: column lengths saved.` });
        } catch (error: any) {
            toast({ title: 'Error', description: error.response?.data?.detail || error.message || 'Failed to update lengths.', variant: 'destructive' });
        }
    }, [internalColumnAttributes, updateMappingData, toast]);

    const handleTypeChange = useCallback((tableKey: string, columnName: string, newType: string) => {
        setInternalColumnAttributes(prev => {
            const next = JSON.parse(JSON.stringify(prev)) as typeof prev;
            if (!next[tableKey]) next[tableKey] = {} as { [columnName: string]: ColumnAttributes };
            if (!next[tableKey][columnName]) next[tableKey][columnName] = {} as ColumnAttributes;
            const current = next[tableKey][columnName] as ColumnAttributes;
            current.data_type = newType;
            // Determine appropriate handling of length for new type
            const mode = getLengthModeForType(newType);
            if (mode === 'numeric') {
                // Try to infer a sensible default from previous precision; else fallback 255
                const prior = (current.length_text || '').trim();
                let inferred = '';
                if (/^\d+(,\d+)?$/.test(prior)) {
                    inferred = prior.split(',')[0];
                }
                if (!/^\d+$/.test(inferred)) inferred = '255';
                current.length_text = inferred;
                current.length = /^\d+$/.test(inferred) ? Number(inferred) : undefined;
            } else if (mode === 'precisionScale') {
                // Keep existing precision,scale if valid; otherwise default to 38,0
                const prior = (current.length_text || '').trim();
                const valid = /^\d+(,\d+)?$/.test(prior);
                current.length_text = valid ? prior : '38,0';
                // numeric convenience only when single number
                if (/^\d+$/.test(current.length_text || '')) current.length = Number(current.length_text);
                else delete current.length;
            } else {
                // Types without length
                delete current.length;
                delete current.length_text;
            }
            return next;
        });
    }, [getLengthModeForType]);


    const handleSaveTypes = useCallback(async (table: TableSelection) => {
        if (!table) return;
        try {
            const session = await getSession();
            if (!session?.user?.access_token) throw new Error('No access token available');
            const token = session.user.access_token;
            const tableKey = `${table.database}.${table.schema}.${table.table}`;
            const attrs = internalColumnAttributes[tableKey] || {};
            const original = originalAttributesRef.current[tableKey] || {};
            const normalize = (v?: string) => (v === '' ? undefined : v);
            const changes = Object.entries(attrs)
                .map(([col, a]) => {
                    const ca = a as ColumnAttributes;
                    const currentType = ca.data_type || 'UNKNOWN';
                    const currentLen = normalize(ca.length_text ?? (typeof ca.length === 'number' ? String(ca.length) : undefined));
                    const orig = original[col] || {};
                    const origType = orig.data_type || 'UNKNOWN';
                    const origLen = normalize(orig.length_text);
                    const typeChanged = (currentType !== origType);
                    const lenChanged = (currentLen !== origLen);
                    // Allow only length-only or both (reject type-only changes)
                    if (!(lenChanged || (lenChanged && typeChanged))) return null;
                    if (!currentType || currentType === 'UNKNOWN') return null;
                    const typeWithLength = currentLen ? `${currentType}(${currentLen})` : currentType;
                    return { name: col, type: typeWithLength };
                })
                .filter(Boolean) as { name: string; type: string }[];

            if (changes.length === 0) {
                toast({ title: 'No Changes', description: 'No data type changes to save.', variant: 'default' });
                return;
            }

            await Promise.all(
                changes.map(c =>
                    axios.post(
                        `${API_BASE_URL}/explore-design/guided/manage_table`,
                        null,
                        {
                            params: {
                                SOURCE_TABLE: `${table.database}.${table.schema}.${table.table}`,
                                CONSTRAINT_TYPE: 'CHANGE_TYPE',
                                COLUMN_NAME: c.name,
                                COLUMN_TYPE: c.type,
                            },
                            headers: { Authorization: `Bearer ${token}` },
                        }
                    )
                )
            );

            // Update the mapping data without refreshing the page
            updateMappingData({ column_attributes: internalColumnAttributes });
            
            // Update original snapshot for the saved columns to reflect the new state
            const nextOriginal = { ...originalAttributesRef.current } as any;
            if (!nextOriginal[tableKey]) nextOriginal[tableKey] = {};
            changes.forEach(c => {
                const m = c.type.match(/^([A-Z_]+)(?:\(([^)]+)\))?$/i);
                const newType = m ? m[1] : c.type;
                const newLen = m && m[2] ? m[2] : undefined;
                nextOriginal[tableKey][c.name] = { data_type: newType, length_text: newLen };
            });
            originalAttributesRef.current = nextOriginal;
            
            toast({ title: 'Types Updated', description: `${table.table}: ${changes.length} column(s) updated.` });
        } catch (error: any) {
            toast({ title: 'Error', description: error.response?.data?.detail || error.message || 'Failed to update data types.', variant: 'destructive' });
        }
    }, [internalColumnAttributes, updateMappingData, toast]);

    const fetchAndInitializeColumns = useCallback(async () => {
        // Don't fetch if we already have column attributes
        if (mappingData.column_attributes && Object.keys(mappingData.column_attributes).length > 0) {
            return;
        }
        
        setLoading(true);
        try {
            const groups = (mappingData.groups && mappingData.groups.length > 0)
                ? mappingData.groups
                : [
                    {
                        sources: selectedSourceTable
                            ? [selectedSourceTable]
                            : (mappingData.source_database && mappingData.source_schema && mappingData.source_table
                                ? [{ database: mappingData.source_database, schema: mappingData.source_schema, table: mappingData.source_table }]
                                : []),
                        target: selectedTargetTable
                            ? selectedTargetTable
                            : (mappingData.target_database && mappingData.target_schema && mappingData.target_table
                                ? { database: mappingData.target_database, schema: mappingData.target_schema, table: mappingData.target_table }
                                : null),
                    },
                ];

            if (groups.length === 0 || groups.every(g => (!g.target && (g.sources || []).length === 0))) {
                setLoading(false);
                return;
            }

            const sourcePkMap = (mappingData.primary_keys?.source) || {} as { [k: string]: string[] };
            const processColumns = (cols: any[], table: TableSelection, targetOfGroup: TableSelection | null): ColumnDetail[] => {
                const tableKey = `${table.database}.${table.schema}.${table.table}`;
                const isTargetTable = !!targetOfGroup && table.database === targetOfGroup.database && table.schema === targetOfGroup.schema && table.table === targetOfGroup.table;
                return cols.map((col: any) => {
                    const colName = col.name || col.COLUMN_NAME;
                    const restoredAttrs = (mappingData.column_attributes?.[tableKey]?.[colName] as ColumnAttributes) || ({} as ColumnAttributes);
                    const rawType = String(col.data_type || col.type || '').toUpperCase();
                    let baseType = rawType || 'UNKNOWN';
                    let lenText: string | undefined = undefined;
                    const match = rawType.match(/^([A-Z_]+)\s*\(([^)]+)\)/);
                    if (match) {
                        baseType = match[1];
                        lenText = match[2];
                    }
                    // Determine PK with per-table preference for targets
                    const targetPkForThisTable = sourcePkMap[tableKey] || (mappingData.primary_keys?.target || []);
                    const isPrimaryKey = isTargetTable
                        ? targetPkForThisTable.includes(colName)
                        : (sourcePkMap[tableKey] || []).includes(colName);
                    return {
                        name: colName,
                        data_type: restoredAttrs.data_type || baseType || 'UNKNOWN',
                        is_nullable: restoredAttrs.is_nullable !== undefined ? restoredAttrs.is_nullable : (col.is_nullable || col.IS_NULLABLE === 'YES'),
                        is_primary_key: isPrimaryKey || false,
                        is_foreign_key: restoredAttrs.is_foreign_key || false,
                        is_required_for_mapping: restoredAttrs.is_required_for_mapping || isPrimaryKey || false,
                        length: restoredAttrs.length !== undefined
                            ? restoredAttrs.length
                            : (/^\d+$/.test(lenText || '') ? parseInt(lenText as string, 10) : undefined),
                        length_text: restoredAttrs.length_text || lenText,
                    };
                });
            };

            const newInternalAttributes: { [tableKey: string]: { [columnName: string]: ColumnAttributes } } = { ...(mappingData.column_attributes || {}) };

            // Load all groups
            for (const g of groups) {
                for (const src of (g.sources || [])) {
                    const srcCols = await getTableColumns(src.database, src.schema, src.table);
                    const processedSrc = processColumns(srcCols, src, g.target || null);
                    const sKey = `${src.database}.${src.schema}.${src.table}`;
                    if (!newInternalAttributes[sKey]) newInternalAttributes[sKey] = {};
                    processedSrc.forEach(col => { newInternalAttributes[sKey][col.name] = col; });
                }
                if (g.target) {
                    const t = g.target;
                    const tgtCols = await getTableColumns(t.database, t.schema, t.table);
                    const processedTgt = processColumns(tgtCols, t, t);
                    const tKey = `${t.database}.${t.schema}.${t.table}`;
                    if (!newInternalAttributes[tKey]) newInternalAttributes[tKey] = {};
                    processedTgt.forEach(col => { newInternalAttributes[tKey][col.name] = col; });
                }
            }

            setInternalColumnAttributes(newInternalAttributes);
            // build original snapshot for diffing on save
            const snapshot: { [tableKey: string]: { [col: string]: { data_type?: string; length_text?: string } } } = {};
            Object.entries(newInternalAttributes).forEach(([tKey, cols]) => {
                snapshot[tKey] = {};
                Object.entries(cols).forEach(([cName, attr]) => {
                    const ca = attr as ColumnAttributes;
                    snapshot[tKey][cName] = {
                        data_type: ca.data_type,
                        length_text: (ca.length_text ?? (typeof ca.length === 'number' ? String(ca.length) : undefined))
                    };
                });
            });
            originalAttributesRef.current = snapshot;
        } catch (error: any) {
            toast({ title: 'Error', description: `Failed to load column details: ${error.message}`, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [selectedSourceTable, selectedTargetTable, mappingData, toast]);

    useEffect(() => {
        // Only fetch if we don't have internal column attributes and they haven't been loaded before
        if (mappingData.project_id && Object.keys(internalColumnAttributes).length === 0) {
            // Check if we have stored column attributes to restore from
            if (mappingData.column_attributes && Object.keys(mappingData.column_attributes).length > 0) {
                // Initialize from stored attributes without fetching
                setInternalColumnAttributes(mappingData.column_attributes);
                setLoading(false); // Set loading to false when restoring from stored attributes
            } else {
                // Only fetch if we truly have no data
                fetchAndInitializeColumns();
            }
        } else if (mappingData.project_id && Object.keys(internalColumnAttributes).length > 0) {
            // We already have data, ensure loading is false
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mappingData.project_id]);

    const handleRequiredToggle = useCallback((tableName: string, columnName: string, isRequired: boolean) => {
        setInternalColumnAttributes(prev => {
            const newAttributes = JSON.parse(JSON.stringify(prev)) as typeof prev;
            if (!newAttributes[tableName]) newAttributes[tableName] = {};
            if (!newAttributes[tableName][columnName]) newAttributes[tableName][columnName] = {} as ColumnAttributes;
            newAttributes[tableName][columnName].is_required_for_mapping = isRequired;
            return newAttributes;
        });
    }, []);

    const handleSelectAll = useCallback((table: TableSelection | null, columns: ColumnDetail[], select: boolean) => {
        if (!table) return;
        // Use the fully qualified table name (database.schema.table)
        const tableName = `${table.database}.${table.schema}.${table.table}`;
        setInternalColumnAttributes(prev => {
            const newAttrs = JSON.parse(JSON.stringify(prev)) as typeof prev;
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
        if (!projectId || !username) {
            toast({ title: 'Error', description: 'Project or user missing.', variant: 'destructive' });
            return;
        }
        const groups = (mappingData.groups && mappingData.groups.length > 0)
            ? mappingData.groups
            : [
                {
                    sources: selectedSourceTable
                        ? [selectedSourceTable]
                        : (mappingData.source_database && mappingData.source_schema && mappingData.source_table
                            ? [{ database: mappingData.source_database, schema: mappingData.source_schema, table: mappingData.source_table }]
                            : []),
                    target: selectedTargetTable
                        ? selectedTargetTable
                        : (mappingData.target_database && mappingData.target_schema && mappingData.target_table
                            ? { database: mappingData.target_database, schema: mappingData.target_schema, table: mappingData.target_table }
                            : null),
                },
            ];

        try {
            const getSelectedColumnsPayload = (table: TableSelection) => {
                const tableKey = `${table.database}.${table.schema}.${table.table}`;
                const entries = Object.entries(internalColumnAttributes[tableKey] || {}) as [string, ColumnAttributes][];
                return entries
                    .filter(([, attr]) => !!attr.is_required_for_mapping)
                    .map(([name]) => name);
            };

            for (const g of groups) {
                for (const src of (g.sources || [])) {
                    await storeSelectedColumns({
                        project_id: projectId,
                        database_name: src.database,
                        schema_name: src.schema,
                        table_name: src.table,
                        selected_columns: getSelectedColumnsPayload(src),
                    });
                }
                if (g.target) {
                    await storeSelectedColumns({
                        project_id: projectId,
                        database_name: g.target.database,
                        schema_name: g.target.schema,
                        table_name: g.target.table,
                        selected_columns: getSelectedColumnsPayload(g.target),
                    });
                }
            }

            updateMappingData({ column_attributes: internalColumnAttributes });
            toast({ title: 'Required Columns Saved', description: 'Your selections have been saved.' });
            onNext();
        } catch (error: any) {
            toast({ title: 'Error Saving Selections', description: `Failed to save column requirements: ${error.message}`, variant: 'destructive' });
        }
    }, [
        projectId, username, selectedSourceTable, selectedTargetTable, internalColumnAttributes, mappingData,
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
                {(mappingData.groups && mappingData.groups.length > 0
                    ? mappingData.groups
                    : [
                        {
                            sources: selectedSourceTable
                                ? [selectedSourceTable]
                                : (mappingData.source_database && mappingData.source_schema && mappingData.source_table
                                    ? [{ database: mappingData.source_database, schema: mappingData.source_schema, table: mappingData.source_table }]
                                    : []),
                            target: selectedTargetTable
                                ? selectedTargetTable
                                : (mappingData.target_database && mappingData.target_schema && mappingData.target_table
                                    ? { database: mappingData.target_database, schema: mappingData.target_schema, table: mappingData.target_table }
                                    : null),
                        },
                    ]
                ).map((g, gi) => (
                    <details key={`grp-${gi}`} className="rounded-md border p-2 space-y-4" open>
                        <summary className="cursor-pointer select-none font-medium">Group {gi + 1}{g.target ? ` — Target: ${g.target.database}.${g.target.schema}.${g.target.table}` : ' (no target yet)'}</summary>
                        <h3 className="text-lg font-semibold">Group {gi + 1}{g.target ? ` — Target: ${g.target.database}.${g.target.schema}.${g.target.table}` : ''}</h3>

                        {/* Side-by-Side Layout: Source Tables (Left) | Target Table (Right) */}
                        <div className="grid grid-cols-2 gap-6">
                            {/* LEFT COLUMN: Source Tables */}
                            <div className="border-r pr-4">
                                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                    <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 px-2 py-1 rounded text-xs font-medium">SOURCE</span>
                                    {(g.sources || []).length > 1 && <span className="text-xs text-slate-500">({(g.sources || []).length} tables)</span>}
                                </h3>
                                {(g.sources || []).map((src, si) => {
                                    const sKey = `${src.database}.${src.schema}.${src.table}`;
                                    const srcEntries = Object.entries(internalColumnAttributes[sKey] || {}) as [string, ColumnAttributes][];
                                    const cols = srcEntries.map(([name, attr]) => ({
                                        name,
                                        data_type: attr.data_type || 'UNKNOWN',
                                        is_primary_key: attr.is_primary_key || false,
                                        is_nullable: attr.is_nullable,
                                        is_foreign_key: attr.is_foreign_key,
                                        is_required_for_mapping: attr.is_required_for_mapping,
                                        length: attr.length,
                                        length_text: attr.length_text,
                                    })) as ColumnDetail[];
                                    const filtered = cols.filter(col => col.name.toLowerCase().includes(sourceSearch.toLowerCase()));
                                    return (
                                        <div key={`src-${gi}-${si}`} className="mb-6">
                                            <div className="mb-3">
                                                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 truncate" title={`${src.database}.${src.schema}.${src.table}`}>
                                                    {src.database}.{src.schema}.{src.table}
                                                </div>

                                                {/* Search - Fixed at top */}
                                                <Input
                                                    placeholder="Search columns..."
                                                    value={sourceSearch}
                                                    onChange={e => setSourceSearch(e.target.value)}
                                                    className="w-full h-8 text-xs mb-2"
                                                />

                                                {/* Select All Buttons - Prominent */}
                                                <div className="flex gap-2 mb-2">
                                                    <Button size="sm" variant="outline" onClick={() => handleSelectAll(src, filtered, true)} className="flex-1 h-7 text-xs">
                                                        Select All ({filtered.length})
                                                    </Button>
                                                    <Button size="sm" variant="outline" onClick={() => handleSelectAll(src, filtered, false)} className="flex-1 h-7 text-xs">
                                                        Deselect All
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Scrollable Table Container */}
                                            <div className="border rounded-lg overflow-hidden">
                                                <div className="max-h-[500px] overflow-y-auto">
                                                    <Table>
                                                        <TableHeader className="sticky top-0 bg-white dark:bg-slate-900 z-10 shadow-sm">
                                                            <TableRow>
                                                                <TableHead className="text-xs">Column</TableHead>
                                                                <TableHead className="text-xs">Data Type</TableHead>
                                                                <TableHead className="text-xs">Length</TableHead>
                                                                <TableHead className="text-xs">Required</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {filtered.map(col => (
                                                                <TableRow key={col.name} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                                                                    <TableCell className="text-xs font-mono">{col.name}</TableCell>
                                                                    <TableCell>
                                                                        <Select
                                                                            value={internalColumnAttributes[sKey]?.[col.name]?.data_type || 'UNKNOWN'}
                                                                            onValueChange={(v) => {
                                                                                handleTypeChange(sKey, col.name, v);
                                                                            }}
                                                                        >
                                                                            <SelectTrigger className="h-7 w-36 text-xs">
                                                                                <SelectValue placeholder="Select type" />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {/* Ensure current type appears even if not in default list */}
                                                                                {(() => {
                                                                                    const current = internalColumnAttributes[sKey]?.[col.name]?.data_type || 'UNKNOWN';
                                                                                    const list = new Set([current, ...AVAILABLE_TYPES]);
                                                                                    return Array.from(list).map(t => (
                                                                                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                                                                    ));
                                                                                })()}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Input
                                                                            type="text"
                                                                            placeholder="255"
                                                                            className="h-7 w-20 text-xs"
                                                                            value={internalColumnAttributes[sKey]?.[col.name]?.length_text ?? internalColumnAttributes[sKey]?.[col.name]?.length ?? ''}
                                                                            onChange={e => handleLengthChange(sKey, col.name, e.target.value)}
                                                                            disabled={getLengthModeForType(internalColumnAttributes[sKey]?.[col.name]?.data_type) === 'none'}
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Checkbox
                                                                            checked={internalColumnAttributes[sKey]?.[col.name]?.is_required_for_mapping || false}
                                                                            onCheckedChange={checked => handleRequiredToggle(sKey, col.name, !!checked)}
                                                                            disabled={col.is_primary_key}
                                                                        />
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>

                                            <div className="flex justify-end mt-2">
                                                <Button size="sm" onClick={() => handleSaveTypes(src)} className="h-7 text-xs">
                                                    Save Changes
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* RIGHT COLUMN: Target Table */}
                            <div className="pl-4">
                                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                    <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 px-2 py-1 rounded text-xs font-medium">TARGET</span>
                                </h3>
                                {g.target && (() => {
                                    const t = g.target!;
                                    const tKey = `${t.database}.${t.schema}.${t.table}`;
                                    const tgtEntries = Object.entries(internalColumnAttributes[tKey] || {}) as [string, ColumnAttributes][];
                                    const cols = tgtEntries.map(([name, attr]) => ({
                                        name,
                                        data_type: attr.data_type || 'UNKNOWN',
                                        is_primary_key: attr.is_primary_key || false,
                                        is_nullable: attr.is_nullable,
                                        is_foreign_key: attr.is_foreign_key,
                                        is_required_for_mapping: attr.is_required_for_mapping,
                                        length: attr.length,
                                        length_text: attr.length_text,
                                    })) as ColumnDetail[];
                                    const filtered = cols.filter(col => col.name.toLowerCase().includes(targetSearch.toLowerCase()));
                                    return (
                                        <div>
                                            <div className="mb-3">
                                                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 truncate" title={`${t.database}.${t.schema}.${t.table}`}>
                                                    {t.database}.{t.schema}.{t.table}
                                                </div>

                                                {/* Search - Fixed at top */}
                                                <Input
                                                    placeholder="Search columns..."
                                                    value={targetSearch}
                                                    onChange={e => setTargetSearch(e.target.value)}
                                                    className="w-full h-8 text-xs mb-2"
                                                />

                                                {/* Select All Buttons - Prominent */}
                                                <div className="flex gap-2 mb-2">
                                                    <Button size="sm" variant="outline" onClick={() => handleSelectAll(t, filtered, true)} className="flex-1 h-7 text-xs">
                                                        Select All ({filtered.length})
                                                    </Button>
                                                    <Button size="sm" variant="outline" onClick={() => handleSelectAll(t, filtered, false)} className="flex-1 h-7 text-xs">
                                                        Deselect All
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Scrollable Table Container */}
                                            <div className="border rounded-lg overflow-hidden">
                                                <div className="max-h-[500px] overflow-y-auto">
                                                    <Table>
                                                        <TableHeader className="sticky top-0 bg-white dark:bg-slate-900 z-10 shadow-sm">
                                                            <TableRow>
                                                                <TableHead className="text-xs">Column</TableHead>
                                                                <TableHead className="text-xs">Data Type</TableHead>
                                                                <TableHead className="text-xs">Length</TableHead>
                                                                <TableHead className="text-xs">Required</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {filtered.map(col => (
                                                                <TableRow key={col.name} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                                                                    <TableCell className="text-xs font-mono">{col.name}</TableCell>
                                                                    <TableCell>
                                                                        <Select
                                                                            value={internalColumnAttributes[tKey]?.[col.name]?.data_type || 'UNKNOWN'}
                                                                            onValueChange={(v) => {
                                                                                handleTypeChange(tKey, col.name, v);
                                                                            }}
                                                                        >
                                                                            <SelectTrigger className="h-7 w-36 text-xs">
                                                                                <SelectValue placeholder="Select type" />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {(() => {
                                                                                    const current = internalColumnAttributes[tKey]?.[col.name]?.data_type || 'UNKNOWN';
                                                                                    const list = new Set([current, ...AVAILABLE_TYPES]);
                                                                                    return Array.from(list).map(t => (
                                                                                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                                                                    ));
                                                                                })()}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Input
                                                                            type="text"
                                                                            placeholder="255"
                                                                            className="h-7 w-20 text-xs"
                                                                            value={internalColumnAttributes[tKey]?.[col.name]?.length_text ?? internalColumnAttributes[tKey]?.[col.name]?.length ?? ''}
                                                                            onChange={e => handleLengthChange(tKey, col.name, e.target.value)}
                                                                            disabled={getLengthModeForType(internalColumnAttributes[tKey]?.[col.name]?.data_type) === 'none'}
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Checkbox
                                                                            checked={internalColumnAttributes[tKey]?.[col.name]?.is_required_for_mapping || false}
                                                                            onCheckedChange={checked => handleRequiredToggle(tKey, col.name, !!checked)}
                                                                            disabled={col.is_primary_key}
                                                                        />
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>

                                            <div className="flex justify-end mt-2">
                                                <Button size="sm" onClick={() => handleSaveTypes(t)} className="h-7 text-xs">
                                                    Save Changes
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </details>
                ))}
                <div className="flex justify-between gap-2 mt-6">
                    <Button variant="outline" onClick={onBack} disabled={loading}>Back</Button>
                    <Button onClick={handleNextStep} disabled={loading}>Next</Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step2RequiredNull;
