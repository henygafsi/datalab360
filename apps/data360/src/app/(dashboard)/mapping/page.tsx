'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getSession } from "next-auth/react";
import { Loader2 } from 'lucide-react';
import { Button, Badge } from 'rizzui';
import { 
    HiOutlineMap, 
    HiOutlineArrowRight,
    HiOutlineCheck,
} from 'react-icons/hi2';

// Import all wizard steps
import Step0ProjectManagement from './Step0ProjectManagement';
import Step1PrimaryKeyFK from './Step1PrimaryKeyFK';
import Step2RequiredNull from './Step2RequiredNull';
import Step3TablesRelations from './Step3TablesRelations';
import Step4AddColumns from './Step4AddColumns';
import Step5Deployment from './Step5Deployment';

// Import services
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTablesTarget } from '@/app/services/mapping/getTablesTarget';
// UPDATED: Import the new service to get all events
import { getProjectStepsEvents } from './getProjectStepsEvents';

// --- Type Definitions ---
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
    target_table_key?: string;
}

interface NewTargetColumn {
    name: string;
    type: string;
    nullable: boolean;
}

interface ColumnAttributes {
    is_nullable: boolean;
    is_primary_key: boolean;
    is_foreign_key: boolean;
    is_required_for_mapping: boolean;
    data_type?: string;
}

// ForeignKey handling removed

interface MappingDetail {
    project_id: string | null;
    source_database: string;
    source_schema: string;
    source_table: string;
    target_database: string;
    target_schema: string;
    target_table: string;
    column_mappings: ColumnMapping[];
    new_target_columns: NewTargetColumn[];
    primary_keys?: {
        source: { [tableKey: string]: string[] }; // MODIFIED: More robust structure
        target: string[];
    };
    column_attributes?: { [tableName: string]: { [columnName: string]: ColumnAttributes } };
    groups?: Array<{ sources: TableSelection[]; target: TableSelection | null }>;
}

// This order is crucial for navigation and state reconstruction
const WIZARD_STEPS_BACKEND_ORDER = [
    "CREATE_PROJECT",         // Index 0
    "ADD_PRIMARY_KEY",        // Index 1
    "ADD_REQUIRED_COLUMNS",   // Index 2
    "ADD_ADDITIONAL_COLUMNS", // Index 3 (moved before relations)
    "TABLES_RELATIONS",       // Index 4
    "DEPLOY_MODEL"            // Index 5
];

// --- Reusable UI Components ---

function Breadcrumb({ currentStep, projectId }: { currentStep: number, projectId: string | null }) {
    const stepNames = [
        "Project Management",
        "Primary Keys",
        "Column Requirements",
        "Additional Columns",
        "Table Relations",
        "Deployment"
    ];

    return (
        <nav className="mb-8">
            <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400 mb-6">
                <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Home</span>
                <span>/</span>
                <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Data Processing</span>
                <span>/</span>
                <span className="text-slate-900 dark:text-slate-200 font-medium">Data Mapping Wizard</span>
                {projectId && (
                    <>
                        <span>/</span>
                        <span className="text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-lg">{projectId}</span>
                    </>
                )}
            </div>
            
            <div className="flex items-center justify-center">
                <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/60 shadow-lg">
                    <div className="flex items-center space-x-3">
                        {stepNames.map((stepName, index) => (
                            <React.Fragment key={index}>
                                <div className={`flex items-center space-x-3 px-4 py-2 rounded-xl transition-all duration-300 ${
                                    index === currentStep 
                                        ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 scale-105'
                                        : index < currentStep 
                                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md shadow-green-500/20'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                }`}>
                                    <div className={`w-3 h-3 rounded-full flex items-center justify-center ${
                                        index === currentStep
                                            ? 'bg-white/30 animate-pulse'
                                            : index < currentStep
                                                ? 'bg-white/30'
                                                : 'bg-slate-400 dark:bg-slate-500'
                                    }`}>
                                        {index < currentStep && (
                                            <HiOutlineCheck className="w-2 h-2 text-white" />
                                        )}
                                    </div>
                                    <span className="text-sm font-semibold">{stepName}</span>
                                </div>
                                {index < stepNames.length - 1 && (
                                    <HiOutlineArrowRight className={`w-4 h-4 transition-colors duration-300 ${
                                        index < currentStep ? 'text-green-500' : 'text-slate-400'
                                    }`} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>
        </nav>
    );
}

function ModernCard({ children, className = '', ...props }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={`bg-white/85 dark:bg-slate-800/85 backdrop-blur-md rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl shadow-slate-200/25 dark:shadow-slate-900/25 ${className}`} {...props}>
            {children}
        </div>
    );
}


// --- Helpers ---
const mapEventTypeToStepIndex = (eventType?: string | null): number => {
    const t = (eventType || '').toUpperCase();
    if (!t) return 1;
    if (t.includes('DEPLOY')) return 5;
    if (t.includes('RELATION')) return 4;
    if (t.includes('ADD') && t.includes('COLUMN')) return 3;
    if (t.includes('REQUIRED') || t.includes('NULL')) return 2;
    if (t.includes('PRIMARY') || t.includes('FOREIGN') || t.includes('KEY')) return 1;
    return 1;
};

// --- Main Wizard Component ---
const MappingWizardPage = () => {
    const [currentStep, setCurrentStep] = useState(0);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [isLoadingProjectData, setIsLoadingProjectData] = useState(false);

    // Central state for all mapping data
    const [mappingData, setMappingData] = useState<MappingDetail>({
        project_id: null,
        source_database: '', source_schema: '', source_table: '',
        target_database: '', target_schema: '', target_table: '',
        column_mappings: [], new_target_columns: [],
        primary_keys: { source: {}, target: [] },
        column_attributes: {},
    });

    // State for table selections, which drives other data fetching
    const [selectedSourceTables, setSelectedSourceTables] = useState<TableSelection[]>([]);
    const [selectedTargetTable, setSelectedTargetTable] = useState<TableSelection | null>(null);

    // State for dropdown options
    const [databases, setDatabases] = useState<string[]>([]);
    const [targetSchemas, setTargetSchemas] = useState<string[]>([]);
    const [targetTablesList, setTargetTablesList] = useState<string[]>([]);
    const [isLoadingOptions, setIsLoadingOptions] = useState(false);

    // In your MappingWizardPage component...

    useEffect(() => {
        const loadProjectStateFromEvents = async () => {
            if (!projectId) return;

            setIsLoadingProjectData(true);
            const rawEvents: any = await getProjectStepsEvents(projectId);
            // Normalize backend response into an array of { event_type, event_details }
            let events: Array<{ event_type: string; event_details: any }> = [];
            if (Array.isArray(rawEvents)) {
                events = rawEvents as any[];
            } else if (rawEvents && typeof rawEvents === 'object') {
                try {
                    const latest = rawEvents.latest_event?.latest_event || rawEvents.latest_event || rawEvents;
                    if (latest?.CREATE_PROJECT) {
                        events.push({ event_type: 'CREATE_PROJECT', event_details: latest.CREATE_PROJECT.event_details || {} });
                    }
                    if (Array.isArray(latest?.ADD_PRIMARY_KEY)) {
                        latest.ADD_PRIMARY_KEY.forEach((e: any) => {
                            events.push({ event_type: e.event_type || 'ADD_PRIMARY_KEY', event_details: e.event_details || {} });
                        });
                    }
                    if (Array.isArray(latest?.DEPLOY_MODEL)) {
                        latest.DEPLOY_MODEL.forEach((e: any) => {
                            events.push({ event_type: e.event_type || 'DEPLOY_MODEL', event_details: e.event_details || {} });
                        });
                    }
                    if (Array.isArray(latest?.TEST_MAPPING)) {
                        latest.TEST_MAPPING.forEach((e: any) => {
                            events.push({ event_type: e.event_type || 'TEST_MAPPING', event_details: e.event_details || {} });
                        });
                    }
                    if (Array.isArray(latest?.ADD_GROUP)) {
                        latest.ADD_GROUP.forEach((e: any) => {
                            events.push({ event_type: e.event_type || 'ADD_GROUP', event_details: e.event_details || {} });
                        });
                    }
                } catch (e) {
                    // Silent error handling
                }
            }
            if (!events || events.length === 0) {
                setIsLoadingProjectData(false);
                setCurrentStep(1); // Go to step 1 for a new project
                return;
            }

            // --- FIXED: Reliable State Reconstruction Logic ---
            let tempMappingData: Partial<MappingDetail> = { project_id: projectId, column_attributes: {} };
            let finalSourceTables: TableSelection[] = [];
            let finalTargetTable: TableSelection | null = null;
            
            const pkMap = new Map<string, string[]>();
            const allTablesMentioned = new Map<string, TableSelection>(); // Use a Map to store unique tables with full info

            // 1. Iterate through all events to gather atomic information first
            for (const event of events) {
                const details = event.event_details;
                
                // Helper to register a table and return its unique key
                const registerTable = (db?: string, sch?: string, tbl?: string): string | null => {
                    if (!db || !sch || !tbl) return null;
                    const key = `${db}.${sch}.${tbl}`;
                    if (!allTablesMentioned.has(key)) {
                        allTablesMentioned.set(key, { database: db, schema: sch, table: tbl });
                    }
                    return key;
                };

                switch (event.event_type) {
                    case 'ADD_PRIMARY_KEY':
                        const pkTableKey = registerTable(details.database, details.schema, details.table);
                        if (pkTableKey) {
                            pkMap.set(pkTableKey, details.columns);
                        }
                        break;
                    case 'ADD_REQUIRED_COLUMNS':
                        registerTable(details.database_name, details.schema_name, details.table_name);
                        // The child component (Step2) expects the simple table name as the key.
                        const simpleTableKey = details.table_name; 
                        if (!tempMappingData.column_attributes![simpleTableKey]) {
                            tempMappingData.column_attributes![simpleTableKey] = {};
                        }
                        (details.selected_columns || []).forEach((col: string) => {
                            if (!tempMappingData.column_attributes![simpleTableKey][col]) {
                                tempMappingData.column_attributes![simpleTableKey][col] = {} as ColumnAttributes;
                            }
                            tempMappingData.column_attributes![simpleTableKey][col].is_required_for_mapping = true;
                        });
                        break;
                    case 'ADD_GROUP':
                        // Register tables from group definition
                        if (details.sources && Array.isArray(details.sources)) {
                            details.sources.forEach((src: any) => {
                                registerTable(src.database, src.schema, src.table);
                            });
                        }
                        if (details.target) {
                            registerTable(details.target.database, details.target.schema, details.target.table);
                        }
                        break;
                    // Also register tables mentioned in deployment events to ensure they are known
                    case 'DEPLOY_MODEL':
                    case 'TEST_MAPPING':
                         if (details.mappings && details.mappings[0]) {
                            const mapping = details.mappings[0];
                            registerTable(mapping.source_database, mapping.source_schema, mapping.source_table);
                            registerTable(mapping.target_database, mapping.target_schema, mapping.target_table);
                         }
                         break;
                    case 'TABLES_RELATIONS':
                        // Handle individual column mappings from TABLES_RELATIONS events
                        if (details.column_mappings && Array.isArray(details.column_mappings)) {
                            details.column_mappings.forEach((mapping: any) => {
                                if (mapping.source_table_key) {
                                    const [db, sch, tbl] = mapping.source_table_key.split('.');
                                    registerTable(db, sch, tbl);
                                }
                                if (mapping.target_table_key) {
                                    const [db, sch, tbl] = mapping.target_table_key.split('.');
                                    registerTable(db, sch, tbl);
                                }
                            });
                         }
                         break;
                }
            }

            // 2. Find the last deployment event, as it's the best source of truth for table roles and mappings.
            const lastStateEvent = events.slice().reverse().find(e => (e.event_type === 'DEPLOY_MODEL' || e.event_type === 'TEST_MAPPING') && e.event_details.mappings);
            
            // Also look for TABLES_RELATIONS events that contain individual column mappings
            const lastRelationsEvent = events.slice().reverse().find(e => e.event_type === 'TABLES_RELATIONS' && e.event_details.column_mappings);

            let sourcePks: { [key: string]: string[] } = {};
            let targetPks: string[] = [];
            let columnMappings: ColumnMapping[] = [];

            // First, try to get column mappings from TABLES_RELATIONS event (most recent individual mappings)
            if (lastRelationsEvent) {
                const relationsMappings = lastRelationsEvent.event_details.column_mappings || [];
                columnMappings = relationsMappings.map((mapping: any) => ({
                    source_column: mapping.source_column,
                    target_column: mapping.target_column,
                    source_table_key: mapping.source_table_key,
                    target_table_key: mapping.target_table_key,
                    data_type: mapping.data_type || 'unknown',
                }));
            }

            if (lastStateEvent) {
                const allMappings = lastStateEvent.event_details.mappings || [];

                // Build groups from all mappings by target table, merging sources by target
                const groupsByTarget = new Map<string, { target: TableSelection, sources: Map<string, TableSelection> }>();

                for (const m of allMappings) {
                    const src: TableSelection = { database: m.source_database, schema: m.source_schema, table: m.source_table };
                    const tgt: TableSelection = { database: m.target_database, schema: m.target_schema, table: m.target_table };
                    const srcKey = `${src.database}.${src.schema}.${src.table}`;
                    const tgtKey = `${tgt.database}.${tgt.schema}.${tgt.table}`;

                    if (!groupsByTarget.has(tgtKey)) {
                        groupsByTarget.set(tgtKey, { target: tgt, sources: new Map<string, TableSelection>() });
                    }
                    groupsByTarget.get(tgtKey)!.sources.set(srcKey, src);

                    // Build column mappings for this pair (only if we don't already have them from TABLES_RELATIONS)
                    if (columnMappings.length === 0) {
                        const sourceColumns: string[] = m.source_columns || [];
                        const targetColumns: string[] = m.target_columns || [];
                        for (let i = 0; i < Math.min(sourceColumns.length, targetColumns.length); i++) {
                            columnMappings.push({
                                source_column: sourceColumns[i],
                                target_column: targetColumns[i],
                                source_table_key: srcKey,
                                target_table_key: tgtKey,
                                data_type: 'unknown',
                            });
                        }
                    }

                    // Capture source PKs per table
                    const pkSrc: string[] = m.pk_source || [];
                    if (pkSrc.length > 0) {
                        sourcePks[srcKey] = pkSrc;
                    }

                    // Note: target PKs are global in our current shape; if multiple targets exist,
                    // we keep the most recent one or leave empty. This will still allow PK UI rendering per group.
                    targetPks = m.pk_target || targetPks;
                }

                // Choose a default source/target for top-level convenience (first group)
                const firstGroup = Array.from(groupsByTarget.values())[0];
                if (firstGroup) {
                    finalTargetTable = firstGroup.target;
                    finalSourceTables = Array.from(firstGroup.sources.values());
                }

                // Persist groups onto mapping data for Step 1 rehydration
                const groupsArr = Array.from(groupsByTarget.values()).map(g => ({
                    sources: Array.from(g.sources.values()),
                    target: g.target,
                }));
                tempMappingData.groups = groupsArr;

            } else {
                // Check if we have ADD_GROUP events to reconstruct groups
                const groupEvents = events.filter(e => e.event_type === 'ADD_GROUP');
                if (groupEvents.length > 0) {
                    // Reconstruct groups from ADD_GROUP events
                    const groupsMap = new Map<number, { sources: TableSelection[]; target: TableSelection | null }>();
                    
                    groupEvents.forEach(event => {
                        const details = event.event_details;
                        const groupIndex = details.group_index || 0;
                        
                        if (!groupsMap.has(groupIndex)) {
                            groupsMap.set(groupIndex, { sources: [], target: null });
                        }
                        
                        const group = groupsMap.get(groupIndex)!;
                        if (details.sources && Array.isArray(details.sources)) {
                            group.sources = details.sources;
                        }
                        if (details.target) {
                            group.target = details.target;
                        }
                    });
                    
                    // Convert map to array and set groups
                    const groupsArr = Array.from(groupsMap.values()).filter(g => g.sources.length > 0 && g.target);
                    if (groupsArr.length > 0) {
                        tempMappingData.groups = groupsArr;
                        // Choose the first group for top-level selections
                        finalTargetTable = groupsArr[0].target!;
                        finalSourceTables = groupsArr[0].sources;
                        
                        // Set primary keys from the groups
                        finalSourceTables.forEach(t => {
                            const key = `${t.database}.${t.schema}.${t.table}`;
                            if (pkMap.has(key)) sourcePks[key] = pkMap.get(key)!;
                        });
                        if (finalTargetTable) {
                            const key = `${finalTargetTable.database}.${finalTargetTable.schema}.${finalTargetTable.table}`;
                            targetPks = pkMap.get(key) || [];
                        }
                    }
                }
                
                // Fallback: If no deployment event and no groups, infer tables from all events gathered.
                const allTableArray = Array.from(allTablesMentioned.values());
                if (allTableArray.length > 0) {
                    // A common pattern is that the last table added/mentioned is the target.
                    finalTargetTable = allTableArray.pop()!; 
                    finalSourceTables = allTableArray; // The rest are sources.
                }

                // Assemble Primary Keys from the `pkMap` we built earlier.
                finalSourceTables.forEach(t => {
                    const key = `${t.database}.${t.schema}.${t.table}`;
                    if (pkMap.has(key)) sourcePks[key] = pkMap.get(key)!;
                });
                if (finalTargetTable) {
                    const key = `${finalTargetTable.database}.${finalTargetTable.schema}.${finalTargetTable.table}`;
                    targetPks = pkMap.get(key) || [];
                }

                // Build groups from ADD_PRIMARY_KEY events by pairing targets in RETAIL_DW with non-RETAIL_DW sources
                const normalizeName = (name: string) => name.replace(/^(DIM_|FACT_)/i, '').toUpperCase();
                const entries = Array.from(pkMap.entries());
                const targets = entries
                    .map(([k, cols]) => {
                        const [db, sch, tbl] = k.split('.');
                        return { key: k, db, sch, tbl, cols };
                    })
                    .filter(e => e.sch === 'RETAIL_DW');
                const sources = entries
                    .map(([k, cols]) => {
                        const [db, sch, tbl] = k.split('.');
                        return { key: k, db, sch, tbl, cols };
                    })
                    .filter(e => e.sch !== 'RETAIL_DW');

                const groupsArr: Array<{ sources: TableSelection[]; target: TableSelection | null }> = [];
                for (const tgt of targets) {
                    const tgtBase = normalizeName(tgt.tbl);
                    const matched = sources.filter(src => {
                        const srcBase = src.tbl.toUpperCase();
                        const baseMatch = srcBase === tgtBase || srcBase === `${tgtBase}S` || `${srcBase}S` === tgtBase;
                        const pkOverlap = (src.cols || []).some((c: string) => (tgt.cols || []).includes(c));
                        return baseMatch || pkOverlap;
                    });
                    const groupSources: TableSelection[] = matched.map(m => ({ database: m.db, schema: m.sch, table: m.tbl }));
                    const groupTarget: TableSelection = { database: tgt.db, schema: tgt.sch, table: tgt.tbl };
                    if (groupSources.length > 0) groupsArr.push({ sources: groupSources, target: groupTarget });
                }

                if (groupsArr.length > 0) {
                    tempMappingData.groups = groupsArr;
                    // Choose the first group for top-level selections
                    finalTargetTable = groupsArr[0].target!;
                    finalSourceTables = groupsArr[0].sources;
                }
            }
            
            // 3. Set the final state by combining all reconstructed parts.
            console.log('Step3: Final PK state before setting:', {
                sourcePks,
                targetPks,
                columnMappings: columnMappings.length,
                groups: tempMappingData.groups?.length || 0
            });
            
            setSelectedSourceTables(finalSourceTables);
            setSelectedTargetTable(finalTargetTable);
            setMappingData(prev => ({
                ...prev,
                ...tempMappingData, // This contains the crucial `column_attributes`.
                project_id: projectId,
                source_database: finalSourceTables[0]?.database || '',
                source_schema: finalSourceTables[0]?.schema || '',
                source_table: finalSourceTables[0]?.table || '',
                target_database: finalTargetTable?.database || '',
                target_schema: finalTargetTable?.schema || '',
                target_table: finalTargetTable?.table || '',
                column_mappings: columnMappings,
                primary_keys: {
                    source: sourcePks,
                    target: targetPks
                },
            }));

            setIsLoadingProjectData(false);
        };

        loadProjectStateFromEvents();
    }, [projectId]);



    // --- General Setup & Data Fetching for Dropdowns ---
    useEffect(() => {
        const fetchUserSession = async () => {
            const session = await getSession();
            if (session?.user?.username) setUsername(session.user.username);
        };
        fetchUserSession();
    }, []);

    useEffect(() => {
        const fetchInitialData = async () => {
            setIsLoadingOptions(true);
            try {
                const dbList = await getDatabases();
                setDatabases(dbList);
            } catch (error) {
                console.error('Error fetching initial databases:', error);
            } finally {
                setIsLoadingOptions(false);
            }
        };
        fetchInitialData();
    }, []);
    
    useEffect(() => {
        if (!selectedTargetTable?.database) {
            setTargetSchemas([]);
            setTargetTablesList([]);
            return;
        }
        const fetchSchemasForTarget = async () => {
            const schemasData = await getSchemas(selectedTargetTable.database);
            setTargetSchemas(schemasData);
        };
        fetchSchemasForTarget();
    }, [selectedTargetTable?.database]);

    useEffect(() => {
        if (!selectedTargetTable?.database || !selectedTargetTable?.schema) {
            setTargetTablesList([]);
            return;
        }
        const fetchTargetTables = async () => {
            const tablesData = await getTablesTarget(selectedTargetTable.database, selectedTargetTable.schema);
            setTargetTablesList(tablesData);
        };
        fetchTargetTables();
    }, [selectedTargetTable?.database, selectedTargetTable?.schema]);

    const updateMappingData = useCallback((newData: Partial<MappingDetail>) => { setMappingData(prev => ({ ...prev, ...newData })); }, []);
    const handleNext = useCallback(() => setCurrentStep((prev) => prev + 1), []);
    const handleBack = useCallback(() => setCurrentStep((prev) => prev - 1), []);
  const handleProjectSelected = useCallback((id: string, lastCompletedStep: string | null) => {
    setProjectId(id);
    setCurrentStep(mapEventTypeToStepIndex(lastCompletedStep));
}, []);

    const renderStep = () => {
        if (isLoadingProjectData) {
            return (
                <div className="flex items-center justify-center p-12">
                    <div className="text-center">
                        <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-500 mb-4" />
                        <p className="text-lg text-slate-700 dark:text-slate-300 font-medium">Loading project data...</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Please wait while we restore your project settings</p>
                    </div>
                </div>
            );
        }

        switch (currentStep) {
            case 0: return <Step0ProjectManagement onProjectSelected={handleProjectSelected} />;
            case 1: return <Step1PrimaryKeyFK onNext={handleNext} onBack={handleBack} mappingData={mappingData} updateMappingData={updateMappingData} selectedSourceTables={selectedSourceTables} setSelectedSourceTables={setSelectedSourceTables} selectedTargetTable={selectedTargetTable} setSelectedTargetTable={setSelectedTargetTable} databases={databases} targetSchemas={targetSchemas} targetTables={targetTablesList} isLoadingOptions={isLoadingOptions} projectId={projectId!} username={username!} />;
            case 2: return <Step2RequiredNull onNext={handleNext} onBack={handleBack} mappingData={mappingData as any} updateMappingData={(nd: any) => updateMappingData(nd)} selectedSourceTable={selectedSourceTables[0] || null} selectedTargetTable={selectedTargetTable} projectId={projectId!} username={username!} />;
            case 3: return <Step4AddColumns onNext={handleNext} onBack={handleBack} mappingData={mappingData as any} updateMappingData={(nd: any) => updateMappingData(nd)} selectedSourceTable={selectedSourceTables[0] || null} selectedTargetTable={selectedTargetTable} projectId={projectId!} username={username!} />;
            case 4: return <Step3TablesRelations onNext={handleNext} onBack={handleBack} mappingData={mappingData as any} updateMappingData={(nd: any) => updateMappingData(nd)} selectedSourceTables={selectedSourceTables} selectedTargetTable={selectedTargetTable} projectId={projectId!} username={username!} />;
            case 5: return <Step5Deployment onBack={handleBack} mappingData={mappingData as any} projectId={projectId!} username={username!} />;
            default: return <div>Unknown Step</div>;
        }
    };
    
    return (
        <div className="space-y-8">
            <Breadcrumb currentStep={currentStep} projectId={projectId} />
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 flex items-center justify-center shadow-2xl shadow-purple-500/25">
                        <HiOutlineMap className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                            Data Mapping Wizard
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 text-lg">
                            {currentStep === 0 ? "Manage your mapping projects" : `Step ${currentStep} of 5: Configure your data mapping workflow`}
                        </p>
                        {projectId && (
                            <div className="flex items-center mt-3 space-x-3">
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 text-sm font-medium">Project: {projectId}</Badge>
                                {username && <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 text-sm font-medium">User: {username}</Badge>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <ModernCard className="p-10">{renderStep()}</ModernCard>
        </div>
    );
};

export default MappingWizardPage;
