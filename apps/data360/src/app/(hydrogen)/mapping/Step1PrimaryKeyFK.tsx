// components/mapping-wizard/Step1PrimaryKeyFK.tsx
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
  Badge
} from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { getSession } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

// Services
import { 
  getDatabases,
  getSchemas,
  getTables,
  getTablesTarget,
  autoMapKeys, 
  AutoMapRequestPayload, 
  SuggestedMapping, 
  AutoMapResponse,
  ForeignKey 
} from '@/app/services/mapping';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

interface TableSelection {
  database: string;
  schema: string;
  table: string;
}

interface MappingData {
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
  updateMappingData: (newData: MappingData) => void;
  selectedSourceTable: TableSelection | null;
  setSelectedSourceTable: Dispatch<SetStateAction<TableSelection | null>>;
  selectedTargetTable: TableSelection | null;
  setSelectedTargetTable: Dispatch<SetStateAction<TableSelection | null>>;
  databases: string[];
  sourceSchemas: string[];
  targetSchemas: string[];
  sourceTables: string[];
  targetTables: string[];
  isLoadingOptions: boolean;
}

const Step1PrimaryKeyFK: React.FC<Step1Props> = ({
  onNext,
  updateMappingData,
  selectedSourceTable,
  setSelectedSourceTable,
  selectedTargetTable,
  setSelectedTargetTable,
  databases,
  sourceSchemas,
  targetSchemas,
  sourceTables,
  targetTables,
  isLoadingOptions,
}) => {
  const { toast } = useToast();
  const [autoMapLoading, setAutoMapLoading] = useState(false);
  const [mappingResult, setMappingResult] = useState<AutoMapResponse | null>(null);

  const handleSourceDbChange = useCallback((db: string) => {
    setSelectedSourceTable({ database: db, schema: '', table: '' });
  }, [setSelectedSourceTable]);

  const handleSourceSchemaChange = useCallback((schema: string) => {
    setSelectedSourceTable((prev) => ({
      database: prev?.database || '',
      schema,
      table: ''
    }));
  }, [setSelectedSourceTable]);

  const handleSourceTableChange = useCallback((table: string) => {
    setSelectedSourceTable((prev) => ({
      database: prev?.database || '',
      schema: prev?.schema || '',
      table
    }));
  }, [setSelectedSourceTable]);

  const handleTargetDbChange = useCallback((db: string) => {
    setSelectedTargetTable({ database: db, schema: '', table: '' });
  }, [setSelectedTargetTable]);

  const handleTargetSchemaChange = useCallback((schema: string) => {
    setSelectedTargetTable((prev) => ({
      database: prev?.database || '',
      schema,
      table: ''
    }));
  }, [setSelectedTargetTable]);

  const handleTargetTableChange = useCallback((table: string) => {
    setSelectedTargetTable((prev) => ({
      database: prev?.database || '',
      schema: prev?.schema || '',
      table
    }));
  }, [setSelectedTargetTable]);

  const handleAutoMap = useCallback(async () => {
    if (!selectedSourceTable?.database || !selectedSourceTable?.schema || !selectedSourceTable?.table ||
        !selectedTargetTable?.database || !selectedTargetTable?.schema || !selectedTargetTable?.table) {
      toast({
        title: 'Validation Error',
        description: 'Please select both source and target tables for auto-mapping.',
        variant: 'destructive',
      });
      return;
    }

    setAutoMapLoading(true);
    setMappingResult(null);

    try {
      const session = await getSession();
      if (!session?.user?.access_token) {
        toast({
          title: 'Authentication Error',
          description: 'Authentication token not found. Please log in again.',
          variant: 'destructive',
        });
        return;
      }

      console.log('--- Step1 Debugging: Auto-mapping ---');
      console.log('Source:', selectedSourceTable);
      console.log('Target:', selectedTargetTable);
      console.log('Session:', session ? 'Valid' : 'Invalid');
      console.log('Attempting to call auto_map_keys from:', `${API_BASE_URL}/mapping/auto_map_keys/`);
      console.log('-----------------------------------');

      const payload: AutoMapRequestPayload = {
        source_database: selectedSourceTable.database,
        source_schema: selectedSourceTable.schema,
        source_table: selectedSourceTable.table,
        target_database: selectedTargetTable.database,
        target_schema: selectedTargetTable.schema,
        target_table: selectedTargetTable.table,
      };

      const data = await autoMapKeys(payload);
      console.log('Auto-mapping service result:', data);
      setMappingResult(data);

      if (!data.suggested_mappings || !Array.isArray(data.suggested_mappings)) {
        throw new Error('Invalid response format: missing suggested mappings');
      }

      const mappingData: MappingData = {
        source_database: selectedSourceTable.database,
        source_schema: selectedSourceTable.schema,
        source_table: selectedSourceTable.table,
        target_database: selectedTargetTable.database,
        target_schema: selectedTargetTable.schema,
        target_table: selectedTargetTable.table,
        column_mappings: data.suggested_mappings.map((m: SuggestedMapping) => ({
          source_column: m.source_column,
          target_column: m.target_column,
          data_type: m.data_type,
          is_primary_key: m.is_primary_key,
          is_foreign_key: m.is_foreign_key,
          referenced_table: m.referenced_table,
          referenced_column: m.referenced_column,
        })),
        primary_keys: data.primary_keys,
        foreign_keys: data.foreign_keys,
      };

      updateMappingData(mappingData);

      toast({
        title: 'Success',
        description: 'Auto-mapping completed successfully. Review suggested mappings.',
      });
      onNext();
    } catch (error: any) {
      console.error('Auto-mapping failed:', error);
      toast({
        title: 'Error',
        description: `Auto-mapping failed: ${error.message || 'An unexpected error occurred.'}`,
        variant: 'destructive',
      });
    } finally {
      setAutoMapLoading(false);
    }
  }, [selectedSourceTable, selectedTargetTable, updateMappingData, toast, onNext]);

  return (
    <Card className="p-4">
      <CardHeader>
        <CardTitle>Step 1: Primary/Foreign Key Management & Initial Mapping</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source Table Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="source-database">Source Database</Label>
            <Select onValueChange={handleSourceDbChange} value={selectedSourceTable?.database || ''} disabled={isLoadingOptions}>
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
            <Select onValueChange={handleSourceSchemaChange} value={selectedSourceTable?.schema || ''} disabled={isLoadingOptions || !selectedSourceTable?.database}>
              <SelectTrigger id="source-schema">
                <SelectValue placeholder="Select Source Schema" />
              </SelectTrigger>
              <SelectContent>
                {sourceSchemas.map((schema) => (
                  <SelectItem key={schema} value={schema}>
                    {schema}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="source-table">Source Table</Label>
            <Select onValueChange={handleSourceTableChange} value={selectedSourceTable?.table || ''} disabled={isLoadingOptions || !selectedSourceTable?.schema}>
              <SelectTrigger id="source-table">
                <SelectValue placeholder="Select Source Table" />
              </SelectTrigger>
              <SelectContent>
                {sourceTables.map((table) => (
                  <SelectItem key={table} value={table}>
                    {table}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Target Table Selection */}
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
            <Select onValueChange={handleTargetTableChange} value={selectedTargetTable?.table || ''} disabled={isLoadingOptions || !selectedTargetTable?.schema}>
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

        {/* Key Information Display */}
        {mappingResult && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Source Keys */}
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Source Table Keys</h3>
                {mappingResult.primary_keys?.source.length ? (
                  <div>
                    <Label>Primary Keys:</Label>
                    <div className="flex flex-wrap gap-2">
                      {mappingResult.primary_keys.source.map((pk: string) => (
                        <Badge key={pk} variant="default">{pk} (PK)</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {mappingResult.foreign_keys?.source.length ? (
                  <div>
                    <Label>Foreign Keys:</Label>
                    <div className="flex flex-wrap gap-2">
                      {mappingResult.foreign_keys.source.map((fk: ForeignKey) => (
                        <Badge key={fk.column} variant="secondary">
                          {fk.column} → {fk.referenced_table}.{fk.referenced_column}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Target Keys */}
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Target Table Keys</h3>
                {mappingResult.primary_keys?.target.length ? (
                  <div>
                    <Label>Primary Keys:</Label>
                    <div className="flex flex-wrap gap-2">
                      {mappingResult.primary_keys.target.map((pk: string) => (
                        <Badge key={pk} variant="default">{pk} (PK)</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {mappingResult.foreign_keys?.target.length ? (
                  <div>
                    <Label>Foreign Keys:</Label>
                    <div className="flex flex-wrap gap-2">
                      {mappingResult.foreign_keys.target.map((fk: ForeignKey) => (
                        <Badge key={fk.column} variant="secondary">
                          {fk.column} → {fk.referenced_table}.{fk.referenced_column}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
          <Button
            onClick={handleAutoMap}
            disabled={autoMapLoading || !selectedSourceTable?.table || !selectedTargetTable?.table}
          >
            {autoMapLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Auto-Mapping...
              </>
            ) : (
              'Auto-Map Keys'
            )}
          </Button>
          <Button onClick={onNext} disabled={!mappingResult}>Next</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Step1PrimaryKeyFK;