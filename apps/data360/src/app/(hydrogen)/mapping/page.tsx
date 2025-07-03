'use client';

import React, { useState, useEffect, useCallback } from 'react';
import axios from "axios";
import { getSession } from "next-auth/react";

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

// Import your existing, working service functions (ensure paths are correct)
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTablesTarget } from '@/app/services/mapping/getTablesTarget';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import { postMapping } from '@/app/services/mapping/postMapping';

// Define the shape of your mapping data
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

// Ordered list of wizard steps for navigation and status tracking
// This MUST match the WIZARD_STEPS in your backend's services/mapping.py
const WIZARD_STEPS_FRONTEND = [
    "CREATE_PROJECT",
    "ADD_PRIMARY_KEY",
    "ADD_COLUMNS_REQUIRED",
    "TABLES_RELATIONS",
    "ADD_ADDITIONAL_COLUMNS", // Changed to match backend's ADD_ADDITIONAL_COLUMNS
    "DEPLOY_MODEL"
];

const MappingWizardPage = () => {
    const { toast } = useToast();
    const [currentStep, setCurrentStep] = useState(0);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [lastCompletedStep, setLastCompletedStep] = useState<string | null>(null);
    const [username, setUsername] = useState<string | null>(null);

    const [mappingData, setMappingData] = useState<MappingDetail>({
        project_id: null,
        source_database: '',
        source_schema: '',
        source_table: '',
        target_database: '',
        target_schema: '',
        target_table: '',
        source_columns: [],
        target_columns: [],
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
    const [isLoadingOptions, setIsLoadingOptions] = useState(false);

    useEffect(() => {
        const fetchUserSession = async () => {
            const session = await getSession();
            if (session?.user?.username) {
                setUsername(session.user.username);
            }
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


    const handleNext = useCallback(() => {
        setCurrentStep((prev) => prev + 1);
    }, []);

    const handleBack = useCallback(() => {
        setCurrentStep((prev) => prev - 1);
    }, []);

    const updateMappingData = useCallback((newData: Partial<MappingDetail>) => {
        setMappingData((prev) => ({ ...prev, ...newData }));
    }, []);

    const handleProjectSelected = useCallback((id: string, lastStep: string | null) => {
        setProjectId(id);
        setMappingData(prev => ({ ...prev, project_id: id }));
        setLastCompletedStep(lastStep);

        const lastStepIndex = WIZARD_STEPS_FRONTEND.indexOf(lastStep || WIZARD_STEPS_FRONTEND[0]); // Default to first step if null/unknown
        if (lastStepIndex === -1) { // If lastStep is not found in the array (e.g., old/invalid step name)
            setCurrentStep(1); // Start from Step 1 (ADD_PRIMARY_KEY)
        } else if (lastStepIndex + 1 < WIZARD_STEPS_FRONTEND.length) {
            // Map backend step index to frontend UI step index (UI steps start from 1)
            setCurrentStep(lastStepIndex + 1);
        } else {
            setCurrentStep(WIZARD_STEPS_FRONTEND.length); // Go to the last step (Deployment)
            toast({
                title: 'Project Completed',
                description: 'This project has already completed all mapping steps. You can review or redeploy.',
                variant: 'default',
            });
        }
    }, [toast]);


    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return <Step0ProjectManagement onProjectSelected={handleProjectSelected} />;
            case 1: // ADD_PRIMARY_KEY
                if (!projectId || !username) return null;
                return (
                    <Step1PrimaryKeyFK
                        onNext={handleNext}
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
                        selectedSourceTable={selectedSourceTables[0] || null}
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
            case 4: // ADD_ADDITIONAL_COLUMNS (formerly ADD_COLUMNS_OPTIONAL)
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
