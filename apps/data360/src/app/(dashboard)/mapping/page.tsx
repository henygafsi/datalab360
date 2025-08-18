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
    source_table_key: string;
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

interface ForeignKey {
    column: string;
    referenced_table: string;
    referenced_column: string;
}

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
    foreign_keys?: {
        source: ForeignKey[];
        target: ForeignKey[];
    };
    column_attributes?: { [tableName: string]: { [columnName: string]: ColumnAttributes } };
}

// This order is crucial for navigation and state reconstruction
const WIZARD_STEPS_BACKEND_ORDER = [
    "CREATE_PROJECT",         // Index 0
    "ADD_PRIMARY_KEY",        // Index 1
    "ADD_REQUIRED_COLUMNS",   // Index 2
    "TABLES_RELATIONS",       // Index 3
    "ADD_ADDITIONAL_COLUMNS", // Index 4
    "DEPLOY_MODEL"            // Index 5
];

// --- Reusable UI Components ---

function Breadcrumb({ currentStep, projectId }: { currentStep: number, projectId: string | null }) {
    const stepNames = [
        "Project Management",
        "Primary Keys & Foreign Keys", 
        "Column Requirements",
        "Table Relations",
        "Additional Columns",
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
        primary_keys: { source: [], target: [] },
        foreign_keys: { source: [], target: [] },
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

     // --- CENTRALIZED STATE RECONSTRUCTION ---
    useEffect(() => {
        const loadProjectStateFromEvents = async () => {
            if (!projectId) return;

            setIsLoadingProjectData(true);
            console.log(`--- Loading all events for project: ${projectId} ---`);

            const events = await getProjectStepsEvents(projectId);
            if (events.length === 0) {
                setIsLoadingProjectData(false);
                setCurrentStep(1);
                return;
            }

            let tempMappingData: Partial<MappingDetail> = { project_id: projectId, column_attributes: {} };
            let allTablesInvolved: TableSelection[] = [];
            const pkMap = new Map<string, string[]>();

            for (const event of events) {
                const details = event.event_details;
                let tableInfo: TableSelection | null = null;

                switch (event.event_type) {
                    case "ADD_PRIMARY_KEY":
                        tableInfo = { database: details.database, schema: details.schema, table: details.table };
                        pkMap.set(`${tableInfo.database}.${tableInfo.schema}.${tableInfo.table}`, details.columns);
                        break;
                    
                    case "ADD_REQUIRED_COLUMNS":
                        tableInfo = { database: details.database_name, schema: details.schema_name, table: details.table_name };
                        const reqTableKey = `${tableInfo.database}.${tableInfo.schema}.${tableInfo.table}`;
                        if (!tempMappingData.column_attributes![reqTableKey]) {
                            tempMappingData.column_attributes![reqTableKey] = {};
                        }
                        (details.selected_columns || []).forEach((col: string) => {
                            if (!tempMappingData.column_attributes![reqTableKey][col]) {
                                tempMappingData.column_attributes![reqTableKey][col] = {} as ColumnAttributes;
                            }
                            tempMappingData.column_attributes![reqTableKey][col].is_required_for_mapping = true;
                        });
                        break;

                    case "TABLES_RELATIONS":
                        tempMappingData.column_mappings = details.columnMappings || [];
                        break;
                    
                    case "ADD_ADDITIONAL_COLUMNS":
                        tempMappingData.new_target_columns = details.newTargetColumns || [];
                        break;
                }
                
                // FIXED: Ensure any event with table info adds to the list of involved tables
                if (tableInfo && !allTablesInvolved.some(t => 
                    t.database === tableInfo!.database && t.schema === tableInfo!.schema && t.table === tableInfo!.table
                )) {
                    allTablesInvolved.push(tableInfo);
                }
            }

            const sourceTableKeysInMappings = new Set(tempMappingData.column_mappings?.map(m => m.source_table_key));
            let finalTargetTable: TableSelection | null = allTablesInvolved.find(t => 
                !sourceTableKeysInMappings.has(`${t.database}.${t.schema}.${t.table}`)
            ) || null;
            
            if (!finalTargetTable && allTablesInvolved.length > 0) {
                finalTargetTable = allTablesInvolved[allTablesInvolved.length - 1];
            }
            
            const finalSourceTables = allTablesInvolved.filter(t => t !== finalTargetTable);

            setSelectedSourceTables(finalSourceTables);
            setSelectedTargetTable(finalTargetTable);

            // FIXED: Populate primary keys with the new, more robust structure
            const sourcePks: { [tableKey: string]: string[] } = {};
            finalSourceTables.forEach(t => {
                const key = `${t.database}.${t.schema}.${t.table}`;
                if (pkMap.has(key)) {
                    sourcePks[key] = pkMap.get(key)!;
                }
            });
            let targetPks: string[] = [];
            if (finalTargetTable) {
                const key = `${finalTargetTable.database}.${finalTargetTable.schema}.${finalTargetTable.table}`;
                if (pkMap.has(key)) targetPks = pkMap.get(key) || [];
            }
            tempMappingData.primary_keys = { source: sourcePks, target: targetPks };
            
            setMappingData(prev => ({ ...prev, ...tempMappingData }));

            console.log("--- Project state reconstruction complete ---");
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

    // --- State Management and Navigation Callbacks ---
    const updateMappingData = useCallback((newData: Partial<MappingDetail>) => {
        setMappingData((prev) => ({ ...prev, ...newData }));
    }, []);

    const handleNext = useCallback(() => setCurrentStep((prev) => prev + 1), []);
    const handleBack = useCallback(() => setCurrentStep((prev) => prev - 1), []);

    const handleProjectSelected = useCallback(async (id: string, lastStep: string | null) => {
        setProjectId(id);
        
        const lastStepIndex = WIZARD_STEPS_BACKEND_ORDER.indexOf(lastStep || '');

        if (lastStep === "DEPLOY_MODEL") {
            // If deployed, go to the step *before* deployment for review
            setCurrentStep(WIZARD_STEPS_BACKEND_ORDER.indexOf("ADD_ADDITIONAL_COLUMNS"));
        } else if (lastStepIndex >= 0) {
            // Go directly to the last step that was completed to allow for edits
            setCurrentStep(lastStepIndex + 1); // Go to the *next* step
        } else {
            // For a new project or project with only CREATE_PROJECT event, go to the first real step
            setCurrentStep(1);
        }
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
            case 0:
                return <Step0ProjectManagement onProjectSelected={handleProjectSelected} />;
            case 1:
                if (!projectId || !username) return null;
                return (
                    <Step1PrimaryKeyFK
                        onNext={handleNext}
                        onBack={handleBack}
                        mappingData={mappingData}
                        updateMappingData={updateMappingData}
                        selectedSourceTables={selectedSourceTables}
                        setSelectedSourceTables={setSelectedSourceTables}
                        selectedTargetTable={selectedTargetTable}
                        setSelectedTargetTable={setSelectedTargetTable}
                        databases={databases}
                        targetSchemas={targetSchemas}
                        targetTables={targetTablesList}
                        isLoadingOptions={isLoadingOptions}
                        projectId={projectId}
                        username={username}
                    />
                );
            case 2:
                if (!projectId || !username) return null;
                return (
                    <Step2RequiredNull
                        onNext={handleNext}
                        onBack={handleBack}
                        mappingData={mappingData}
                        updateMappingData={updateMappingData}
                        // Step 2 seems to handle one source table at a time based on its props
                        selectedSourceTable={selectedSourceTables[0] || null}
                        selectedTargetTable={selectedTargetTable}
                        projectId={projectId}
                        username={username}
                    />
                );
            case 3:
                if (!projectId || !username) return null;
                return (
                    <Step3TablesRelations
                        onNext={handleNext}
                        onBack={handleBack}
                        mappingData={mappingData}
                        updateMappingData={updateMappingData}
                        selectedSourceTables={selectedSourceTables}
                        selectedTargetTable={selectedTargetTable}
                        projectId={projectId}
                        username={username}
                    />
                );
            case 4:
                if (!projectId || !username) return null;
                return (
                    <Step4AddColumns
                        onNext={handleNext}
                        onBack={handleBack}
                        mappingData={mappingData}
                        updateMappingData={updateMappingData}
                        selectedSourceTable={selectedSourceTables[0] || null}
                        selectedTargetTable={selectedTargetTable}
                        projectId={projectId}
                        username={username}
                    />
                );
            case 5:
                if (!projectId || !username) return null;
                return (
                    <Step5Deployment
                        onBack={handleBack}
                        mappingData={mappingData}
                        projectId={projectId}
                        username={username}
                    />
                );
            default:
                return <div>Unknown Step</div>;
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
                            {currentStep === 0 
                                ? "Manage your mapping projects and create new ones"
                                : `Step ${currentStep} of 5: Configure your data mapping workflow`
                            }
                        </p>
                        {projectId && (
                            <div className="flex items-center mt-3 space-x-3">
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 text-sm font-medium">
                                    Project: {projectId}
                                </Badge>
                                {username && (
                                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 text-sm font-medium">
                                        User: {username}
                                    </Badge>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <ModernCard className="p-10">
                {renderStep()}
            </ModernCard>
        </div>
    );
};

export default MappingWizardPage;
