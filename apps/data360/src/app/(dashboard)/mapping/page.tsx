'use client';

import React, { useState, useEffect, useCallback } from 'react';
import axios from "axios";
import { getSession } from "next-auth/react";
import { Loader2 } from 'lucide-react';
import { Button, Badge } from 'rizzui';
import { 
  HiOutlineMap, 
  HiOutlineArrowsRightLeft,
  HiOutlineDocumentText,
  HiOutlinePlusCircle,
  HiOutlineTrash,
  HiOutlineEye,
  HiOutlineArrowRight,
  HiOutlineCheck,
  HiOutlineXMark
} from 'react-icons/hi2';
import { Database } from 'lucide-react';

// Import all wizard steps
import Step0ProjectManagement from './Step0ProjectManagement';
import Step1PrimaryKeyFK from './Step1PrimaryKeyFK';
import Step2RequiredNull from './Step2RequiredNull';
import Step3TablesRelations from './Step3TablesRelations';
import Step4AddColumns from './Step4AddColumns';
import Step5Deployment from './Step5Deployment';

// Import your existing, working service functions
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTablesTarget } from '@/app/services/mapping/getTablesTarget';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import { getLatestStepEvent } from './getStepEventData'; // Import the service

// Define the shape of your mapping data (from previous examples)
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
        source: string[];
        target: string[];
    };
    foreign_keys?: {
        source: ForeignKey[];
        target: ForeignKey[];
    };
    column_attributes?: { [tableName: string]: { [columnName: string]: ColumnAttributes } };
}

// Backend's WIZARD_STEPS (ensure this matches your Python backend's WIZARD_STEPS)
// This is crucial for correctly loading the state.
const WIZARD_STEPS_BACKEND_ORDER = [
    "CREATE_PROJECT", // Index 0
    "ADD_PRIMARY_KEY", // Index 1
    "ADD_COLUMNS_REQUIRED", // Index 2
    "TABLES_RELATIONS", // Index 3
    "ADD_ADDITIONAL_COLUMNS", // Index 4
    "DEPLOY_MODEL" // Index 5
];

// Breadcrumb component
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
      
      {/* Step Progress Indicator */}
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

// Modern Card Component
function ModernCard({ children, className = '', ...props }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`bg-white/85 dark:bg-slate-800/85 backdrop-blur-md rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl shadow-slate-200/25 dark:shadow-slate-900/25 ${className}`} {...props}>
      {children}
    </div>
  );
}



const MappingWizardPage = () => {
    const [currentStep, setCurrentStep] = useState(0); // Start at Step 0 (Project Management)
    const [projectId, setProjectId] = useState<string | null>(null);
    const [lastCompletedStep, setLastCompletedStep] = useState<string | null>(null); // From Project API
    const [username, setUsername] = useState<string | null>(null);
    const [isLoadingProjectData, setIsLoadingProjectData] = useState(false); // Loading historical data for project

    const [mappingData, setMappingData] = useState<MappingDetail>({
        project_id: null,
        source_database: '',
        source_schema: '',
        source_table: '',
        target_database: '',
        target_schema: '',
        target_table: '',
        column_mappings: [],
        new_target_columns: [],
        primary_keys: { source: [], target: [] },
        foreign_keys: { source: [], target: [] },
        column_attributes: {},
    });

    const [selectedSourceTables, setSelectedSourceTables] = useState<TableSelection[]>([]);
    const [selectedTargetTable, setSelectedTargetTable] = useState<TableSelection | null>(null);

    const [databases, setDatabases] = useState<string[]>([]);
    const [sourceSchemas, setSourceSchemas] = useState<string[]>([]);
    const [targetSchemas, setTargetSchemas] = useState<string[]>([]);
    const [sourceTablesList, setSourceTablesList] = useState<string[]>([]);
    const [targetTablesList, setTargetTablesList] = useState<string[]>([]);
    const [isLoadingOptions, setIsLoadingOptions] = useState(false); // For dropdown options

    useEffect(() => {
        const fetchUserSession = async () => {
            const session = await getSession();
            if (session?.user?.username) {
                setUsername(session.user.username);
            }
        };
        fetchUserSession();
    }, []);

    // Fetch initial database options
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

    // Fetch schemas for target database
    useEffect(() => {
        if (!selectedTargetTable?.database) {
            setTargetSchemas([]);
            setTargetTablesList([]);
            return;
        }
        const fetchSchemasForTarget = async () => {
            setIsLoadingOptions(true);
            try {
                const schemasData = await getSchemas(selectedTargetTable.database);
                setTargetSchemas(schemasData);
            } catch (error: any) {
                console.error(`Error fetching schemas for ${selectedTargetTable.database}:`, error);
            } finally {
                setIsLoadingOptions(false);
            }
        };
        fetchSchemasForTarget();
    }, [selectedTargetTable?.database]);

    // Fetch tables for target schema
    useEffect(() => {
        if (!selectedTargetTable?.database || !selectedTargetTable?.schema) {
            setTargetTablesList([]);
            return;
        }
        const fetchTargetTables = async () => {
            setIsLoadingOptions(true);
            try {
                const tablesData = await getTablesTarget(selectedTargetTable.database, selectedTargetTable.schema);
                setTargetTablesList(tablesData);
            } catch (error) {
                console.error(`Error fetching tables for ${selectedTargetTable.database}.${selectedTargetTable.schema}:`, error);
            } finally {
                setIsLoadingOptions(false);
            }
        };
        fetchTargetTables();
    }, [selectedTargetTable?.database, selectedTargetTable?.schema]);

    // --- CRITICAL: Load all project data based on historical events from the new endpoint ---
    useEffect(() => {
        const loadAllProjectData = async () => {
            if (!projectId || !username) return;

            setIsLoadingProjectData(true);
            console.log(`MappingWizardPage: Loading all historical project data for project ${projectId}.`);

            // Reset mappingData and selections to default before loading new project data
            const initialMappingData: MappingDetail = {
                project_id: projectId,
                source_database: '', source_schema: '', source_table: '',
                target_database: '', target_schema: '', target_table: '',
                column_mappings: [], new_target_columns: [],
                primary_keys: { source: [], target: [] },
                foreign_keys: { source: [], target: [] },
                column_attributes: {},
            };
            let tempSelectedSourceTables: TableSelection[] = [];
            let tempSelectedTargetTable: TableSelection | null = null;

            try {
                // Fetch events for each step and reconstruct the mappingData state
                for (const stepType of WIZARD_STEPS_BACKEND_ORDER) {
                    const event = await getLatestStepEvent(projectId, stepType);
                    
                    if (event && event.event_details) {
                        console.log(`MappingWizardPage: Loaded event details for ${stepType}:`, event.event_details);

                        switch (stepType) {
                            case "CREATE_PROJECT":
                                // This event primarily confirms project existence, no complex data to prefill here
                                break;
                            case "ADD_PRIMARY_KEY":
                                // This event contains source/target table selections and PK/FKs
                                const pkDetails = event.event_details;
                                
                                // Reconstruct source table selection
                                if (pkDetails.selectedSourceTables && Array.isArray(pkDetails.selectedSourceTables) && pkDetails.selectedSourceTables.length > 0) {
                                    tempSelectedSourceTables = pkDetails.selectedSourceTables.map((sTableKey: string) => {
                                        const parts = sTableKey.split('.');
                                        return { database: parts[0], schema: parts[1], table: parts[2] };
                                    });
                                    if (tempSelectedSourceTables.length > 0) {
                                        initialMappingData.source_database = tempSelectedSourceTables[0].database;
                                        initialMappingData.source_schema = tempSelectedSourceTables[0].schema;
                                        initialMappingData.source_table = tempSelectedSourceTables[0].table;
                                    }
                                }
                                
                                // Reconstruct target table selection
                                if (pkDetails.selectedTargetTable) {
                                    const parts = pkDetails.selectedTargetTable.split('.');
                                    tempSelectedTargetTable = { database: parts[0], schema: parts[1], table: parts[2] };
                                    initialMappingData.target_database = tempSelectedTargetTable.database;
                                    initialMappingData.target_schema = tempSelectedTargetTable.schema;
                                    initialMappingData.target_table = tempSelectedTargetTable.table;
                                }

                                // Load defined primary keys
                                if (pkDetails.primary_keys && typeof pkDetails.primary_keys === 'object') {
                                    initialMappingData.primary_keys = {
                                        source: pkDetails.primary_keys.source || [],
                                        target: pkDetails.primary_keys.target || []
                                    };
                                }
                                
                                // Load defined foreign keys
                                if (pkDetails.foreign_keys && typeof pkDetails.foreign_keys === 'object') {
                                    initialMappingData.foreign_keys = {
                                        source: pkDetails.foreign_keys.source || [],
                                        target: pkDetails.foreign_keys.target || []
                                    };
                                }
                                break;
                            case "ADD_COLUMNS_REQUIRED":
                                initialMappingData.column_attributes = event.event_details.columnAttributes || {};
                                break;
                            case "TABLES_RELATIONS":
                                initialMappingData.column_mappings = event.event_details.columnMappings || [];
                                break;
                            case "ADD_ADDITIONAL_COLUMNS":
                                initialMappingData.new_target_columns = event.event_details.newTargetColumns || []; // Use 'newTargetColumns' based on your previous logs
                                break;
                            case "DEPLOY_MODEL":
                                // For DEPLOY_MODEL, we explicitly load the mapping details to display in Step 5
                                initialMappingData.column_mappings = event.event_details.mappings?.[0]?.column_mappings || [];
                                // If you want to load the other details (source/target tables) again from here,
                                // you'd extract them from event.event_details.mappings[0]
                                // For now, we assume these are already set by ADD_PRIMARY_KEY
                                break;
                            default:
                                console.warn(`MappingWizardPage: Unhandled event type for prefilling: ${stepType}`);
                        }
                    }
                }
                // Apply all loaded data to states
                setMappingData(initialMappingData);
                setSelectedSourceTables(tempSelectedSourceTables);
                setSelectedTargetTable(tempSelectedTargetTable);
                console.log('MappingWizardPage: All project data loaded and state updated.');

            } catch (error) {
                console.error(`MappingWizardPage: Failed to load all project data:`, error);
            } finally {
                setIsLoadingProjectData(false);
            }
        };

        // Only load data if a project is selected
        if (projectId && username) {
            loadAllProjectData();
        }
    }, [projectId, username]);

    // This unified update function will be passed to child components
    // It now only handles state updates. Logging is done within each component's API calls.
    const updateMappingData = useCallback((newData: Partial<MappingDetail>) => {
        setMappingData((prev) => {
            const updated = { ...prev, ...newData };
            // Ensure selectedSourceTables and selectedTargetTable are updated if they are part of newData
            if (newData.source_table && newData.source_database && newData.source_schema) {
                setSelectedSourceTables([{
                    database: newData.source_database,
                    schema: newData.source_schema,
                    table: newData.source_table
                }]);
            }
            if (newData.target_table && newData.target_database && newData.target_schema) {
                setSelectedTargetTable({
                    database: newData.target_database,
                    schema: newData.target_schema,
                    table: newData.target_table
                });
            }
            return updated;
        });
        console.log(`MappingWizardPage: State updated from child component.`);
    }, []);

    const handleNext = useCallback(() => {
        setCurrentStep((prev) => prev + 1);
    }, []);

    const handleBack = useCallback(() => {
        setCurrentStep((prev) => prev - 1);
    }, []);

    const handleProjectSelected = useCallback(async (id: string, lastStep: string | null) => {
        setProjectId(id);
        // Set initial mappingData project_id immediately
        setMappingData(prev => ({ ...prev, project_id: id }));
        setLastCompletedStep(lastStep); // Store last completed step from project API

        // Determine which step to navigate to based on lastCompletedStep
        const lastStepIndex = WIZARD_STEPS_BACKEND_ORDER.indexOf(lastStep || WIZARD_STEPS_BACKEND_ORDER[0]);
        // If the last step was DEPLOY_MODEL, jump to that step (Step 5) to show summary
        if (lastStep === "DEPLOY_MODEL") {
            setCurrentStep(WIZARD_STEPS_BACKEND_ORDER.indexOf("DEPLOY_MODEL"));
        }
        else if (lastStepIndex === -1) {
            setCurrentStep(1); // Default to Step 1 if lastStep is unknown (e.g., project just created)
        } else if (lastStepIndex + 1 < WIZARD_STEPS_BACKEND_ORDER.length) {
            setCurrentStep(lastStepIndex + 1); // Go to the next logical step
        } else {
            // This case should ideally be covered by the DEPLOY_MODEL check above, but as a fallback:
            setCurrentStep(WIZARD_STEPS_BACKEND_ORDER.length - 1); // Go to the last step (Deployment)
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
            case 1: // ADD_PRIMARY_KEY
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
                        sourceSchemas={sourceSchemas}
                        targetSchemas={targetSchemas}
                        sourceTables={sourceTablesList}
                        targetTables={targetTablesList}
                        isLoadingOptions={isLoadingOptions}
                        projectId={projectId}
                        username={username}
                    />
                );
            case 2: // ADD_COLUMNS_REQUIRED
                if (!projectId || !username) return null;
                return (
                    <Step2RequiredNull
                        onNext={handleNext}
                        onBack={handleBack}
                        mappingData={mappingData}
                        updateMappingData={updateMappingData}
                        selectedSourceTable={selectedSourceTables[0] || null} // Assuming single source table for now
                        selectedTargetTable={selectedTargetTable}
                        projectId={projectId}
                        username={username}
                    />
                );
            case 3: // TABLES_RELATIONS
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
            case 4: // ADD_ADDITIONAL_COLUMNS
                if (!projectId || !username) return null;
                return (
                    <Step4AddColumns
                        onNext={handleNext}
                        onBack={handleBack}
                        mappingData={mappingData}
                        updateMappingData={updateMappingData}
                        selectedSourceTable={selectedSourceTables[0] || null} // Assuming single source table for now
                        selectedTargetTable={selectedTargetTable}
                        projectId={projectId}
                        username={username}
                    />
                );
            case 5: // DEPLOY_MODEL
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
            
            {/* Header */}
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
                                : `Step ${currentStep + 1} of 6: Configure your data mapping workflow`
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

            {/* Main Wizard Content */}
            <ModernCard className="p-10">
                {renderStep()}
            </ModernCard>
        </div>
    );
};

export default MappingWizardPage;