'use client';

import React, { useState, useEffect, useCallback } from 'react';
import axios from "axios";
import { getSession } from "next-auth/react";
import { Loader2 } from 'lucide-react';

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

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


const MappingWizardPage = () => {
    const { toast } = useToast();
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
                toast({
                    title: 'Error',
                    description: 'Failed to load initial databases for selection.',
                    variant: 'destructive',
                });
            } finally {
                setIsLoadingOptions(false);
            }
        };
        fetchInitialData();
    }, [toast]);

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
                toast({
                    title: 'Error',
                    description: `Failed to fetch schemas for target database: ${error.message || 'An unexpected error occurred.'}`,
                    variant: 'destructive',
                });
            } finally {
                setIsLoadingOptions(false);
            }
        };
        fetchSchemasForTarget();
    }, [selectedTargetTable?.database, toast]);

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
                toast({
                    title: 'Error',
                    description: `Failed to fetch tables for target schema: ${error.message || 'An unexpected error occurred.'}`,
                    variant: 'destructive',
                });
            } finally {
                setIsLoadingOptions(false);
            }
        };
        fetchTargetTables();
    }, [selectedTargetTable?.database, selectedTargetTable?.schema, toast]);


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
                toast({
                    title: 'Error',
                    description: `Failed to load previous project data: ${error.message || 'An unexpected error occurred.'}`,
                    variant: 'destructive',
                });
            } finally {
                setIsLoadingProjectData(false);
            }
        };

        // Only load data if a project is selected
        if (projectId && username) {
            loadAllProjectData();
        }
    }, [projectId, username, toast]);


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
            toast({
                title: 'Project Deployed',
                description: 'This project has been deployed. Review the summary or redeploy.',
                variant: 'default',
            });
        }
        else if (lastStepIndex === -1) {
            setCurrentStep(1); // Default to Step 1 if lastStep is unknown (e.g., project just created)
        } else if (lastStepIndex + 1 < WIZARD_STEPS_BACKEND_ORDER.length) {
            setCurrentStep(lastStepIndex + 1); // Go to the next logical step
        } else {
            // This case should ideally be covered by the DEPLOY_MODEL check above, but as a fallback:
            setCurrentStep(WIZARD_STEPS_BACKEND_ORDER.length - 1); // Go to the last step (Deployment)
            toast({
                title: 'Project Completed',
                description: 'This project has completed all mapping steps. You can review or redeploy.',
                variant: 'default',
            });
        }
    }, [toast]);

    const renderStep = () => {
        if (isLoadingProjectData) {
            return (
                <div className="flex items-center justify-center p-8">
                    <Loader2 className="mr-2 h-8 w-8 animate-spin text-blue-500" />
                    <span className="text-lg text-gray-700">Loading project data...</span>
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
        <div className="container mx-auto p-4">
            <Card>
                <CardHeader>
                    <CardTitle>Data Mapping Wizard - Step {currentStep}</CardTitle>
                    <CardDescription>
                        {currentStep === 0
                            ? "Manage your mapping projects."
                            : `Follow these steps to define your data mapping and deploy it for Project ID: ${projectId} (User: ${username})`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {renderStep()}
                    <div className="my-4 border-t border-gray-200 dark:border-gray-800"></div>
                </CardContent>
            </Card>
        </div>
    );
};

export default MappingWizardPage;