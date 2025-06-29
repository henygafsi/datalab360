// src/app/(hydrogen)/mapping/MappingWizardPage.tsx (Your main wizard page)
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Step1PrimaryKeyFK from './Step1PrimaryKeyFK';
import Step2RequiredNull from './Step2RequiredNull';
import Step3TablesRelations from './Step3TablesRelations';
import Step4AddColumns from './Step4AddColumns';
import Step5Deployment from './Step5Deployment';

// Import your existing, working service functions
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables'; // For source tables
import { getTablesTarget } from '@/app/services/mapping/getTablesTarget'; // For target tables
import { getTableColumns, getTableColumns2 } from '@/app/services/mapping/fetch_tables'; // For column details
import { postMapping } from '@/app/services/mapping/postMapping'; // Assuming you use this for deployment

// Define the shape of your mapping data
interface ColumnMapping {
  source_column: string;
  target_column: string;
  data_type: string;
}

interface NewTargetColumn {
  name: string;
  type: string;
  nullable: boolean;
}

interface MappingDetail {
  source_database: string;
  source_schema: string;
  source_table: string;
  target_database: string;
  target_schema: string;
  target_table: string;
  source_columns: string[];
  target_columns: string[];
  column_mappings: ColumnMapping[];
  new_target_columns: NewTargetColumn[];
  primary_keys?: { [tableName: string]: string[] };
  foreign_keys?: { [tableName: string]: { column: string; referencesTable: string; referencesColumn: string }[] };
  column_attributes?: { [tableName: string]: { [columnName: string]: { is_nullable: boolean; is_primary_key: boolean; is_foreign_key: boolean } } };
}

export default function MappingWizardPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [mappingData, setMappingData] = useState<MappingDetail>({
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
    primary_keys: {},
    foreign_keys: {},
    column_attributes: {},
  });

  const [selectedSourceTable, setSelectedSourceTable] = useState<{ database: string; schema: string; table: string } | null>(null);
  const [selectedTargetTable, setSelectedTargetTable] = useState<{ database: string; schema: string; table: string } | null>(null);

  // States to hold dropdown options, fetched from API services
  const [databases, setDatabases] = useState<string[]>([]);
  const [sourceSchemas, setSourceSchemas] = useState<string[]>([]);
  const [targetSchemas, setTargetSchemas] = useState<string[]>([]);
  const [sourceTablesList, setSourceTablesList] = useState<string[]>([]); // Renamed to avoid conflict
  const [targetTablesList, setTargetTablesList] = useState<string[]>([]); // Renamed to avoid conflict
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  // --- Fetch Initial Databases on Mount ---
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

  // --- Fetch Source Schemas when Source DB changes ---
  useEffect(() => {
    if (!selectedSourceTable?.database) {
      setSourceSchemas([]);
      setSourceTablesList([]);
      return;
    }
    const fetchSchemasForSource = async () => {
      setIsLoadingOptions(true);
      try {
        const schemasData = await getSchemas(selectedSourceTable.database);
        setSourceSchemas(schemasData);
      } catch (error) {
        console.error(`Error fetching schemas for ${selectedSourceTable.database}:`, error);
      } finally {
        setIsLoadingOptions(false);
      }
    };
    fetchSchemasForSource();
  }, [selectedSourceTable?.database]);

  // --- Fetch Target Schemas when Target DB changes ---
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
      } catch (error) {
        console.error(`Error fetching schemas for ${selectedTargetTable.database}:`, error);
      } finally {
        setIsLoadingOptions(false);
      }
    };
    fetchSchemasForTarget();
  }, [selectedTargetTable?.database]);

  // --- Fetch Source Tables when Source DB/Schema changes ---
  useEffect(() => {
    if (!selectedSourceTable?.database || !selectedSourceTable?.schema) {
      setSourceTablesList([]);
      return;
    }
    const fetchSourceTables = async () => {
      setIsLoadingOptions(true);
      try {
        // getTables now returns string[]
        const tablesData = await getTables(selectedSourceTable.database, selectedSourceTable.schema);
        setSourceTablesList(tablesData);
      } catch (error) {
        console.error(`Error fetching tables for ${selectedSourceTable.database}.${selectedSourceTable.schema}:`, error);
      } finally {
        setIsLoadingOptions(false);
      }
    };
    fetchSourceTables();
  }, [selectedSourceTable?.database, selectedSourceTable?.schema]);

  // --- Fetch Target Tables when Target DB/Schema changes ---
  useEffect(() => {
    if (!selectedTargetTable?.database || !selectedTargetTable?.schema) {
      setTargetTablesList([]);
      return;
    }
    const fetchTargetTables = async () => {
      setIsLoadingOptions(true);
      try {
        // getTablesTarget now returns string[]
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

  const handleNext = () => {
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const updateMappingData = useCallback((newData: Partial<MappingDetail>) => {
    setMappingData((prev) => ({ ...prev, ...newData }));
  }, []);

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1PrimaryKeyFK
            onNext={handleNext}
            updateMappingData={updateMappingData}
            selectedSourceTable={selectedSourceTable}
            setSelectedSourceTable={setSelectedSourceTable}
            selectedTargetTable={selectedTargetTable}
            setSelectedTargetTable={setSelectedTargetTable}
            // Pass down fetched data and loading state
            databases={databases}
            sourceSchemas={sourceSchemas}
            targetSchemas={targetSchemas}
            sourceTables={sourceTablesList}
            targetTables={targetTablesList}
            isLoadingOptions={isLoadingOptions}
          />
        );
      case 2:
        return (
          <Step2RequiredNull
            onNext={handleNext}
            onBack={handleBack}
            mappingData={mappingData}
            updateMappingData={updateMappingData}
            selectedSourceTable={selectedSourceTable}
            selectedTargetTable={selectedTargetTable}
          />
        );
      case 3:
        return (
          <Step3TablesRelations
            onNext={handleNext}
            onBack={handleBack}
            mappingData={mappingData}
            updateMappingData={updateMappingData}
            selectedSourceTable={selectedSourceTable}
            selectedTargetTable={selectedTargetTable}
          />
        );
      case 4:
        return (
          <Step4AddColumns
            onNext={handleNext}
            onBack={handleBack}
            mappingData={mappingData}
            updateMappingData={updateMappingData}
            selectedSourceTable={selectedSourceTable}
            selectedTargetTable={selectedTargetTable}
          />
        );
      case 5:
        return (
          <Step5Deployment
            onBack={handleBack}
            mappingData={mappingData}
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
            Follow these steps to define your data mapping and deploy it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderStep()}
          <div className="my-4 border-t border-gray-200 dark:border-gray-800"></div>
          <div className="flex justify-between">
            {currentStep > 1 && (
              <Button onClick={handleBack} variant="outline">
                Back
              </Button>
            )}
            {currentStep < 5 && (
              <Button onClick={handleNext} className="ml-auto">
                Next
              </Button>
            )}
            {currentStep === 5 && (
              <Button className="ml-auto" disabled={true}>
                Finish
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}