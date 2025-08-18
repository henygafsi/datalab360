'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { getSession } from 'next-auth/react';
import axios from 'axios';
import { getProjectLatestEvents } from './getProjectLatestEvents';

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
}

interface ColumnDetail extends ColumnAttributes {
  name: string;
}

interface NewTargetColumn {
  name: string;
  type: string;
  nullable: boolean;
  length?: number;
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
  new_target_columns: NewTargetColumn[];
  primary_keys?: { source: string[]; target: string[] };
  foreign_keys?: {
    source: Array<{ column: string; referenced_table: string; referenced_column: string }>;
    target: Array<{ column: string; referenced_table: string; referenced_column: string }>;
  };
  column_attributes?: { [tableName: string]: { [columnName: string]: ColumnAttributes } };
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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://www.api.datalab360.io:8443';

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
  const [addingColumn, setAddingColumn] = useState(false);
  const [internalColumnAttributes, setInternalColumnAttributes] = useState<{
    [tableName: string]: { [columnName: string]: ColumnAttributes };
  }>(mappingData.column_attributes || {});
  const [newColumnName, setNewColumnName] = useState<string>('');
  const [newColumnType, setNewColumnType] = useState<string>('VARCHAR');
  const [newColumnLength, setNewColumnLength] = useState<number | undefined>(undefined);
  const [newColumnNullable, setNewColumnNullable] = useState<boolean>(true);
  const [newTargetColumns, setNewTargetColumns] = useState<NewTargetColumn[]>(
    mappingData.new_target_columns || []
  );
  const [selectAllSource, setSelectAllSource] = useState(false);
  const [selectAllTarget, setSelectAllTarget] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');

  const dataTypes = ['VARCHAR', 'INTEGER', 'FLOAT', 'DATE', 'TIMESTAMP', 'BOOLEAN', 'TEXT'];

  const fetchAndInitializeColumns = useCallback(async () => {
    if (!selectedSourceTable || !selectedTargetTable) {
      toast({
        title: 'Error',
        description: 'Source or target table not selected. Please go back to Step 1.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      console.log(`Step2: Fetching columns for source: ${selectedSourceTable.table} and target: ${selectedTargetTable.table}`);
      const [sourceColsResult, targetColsResult, events] = await Promise.all([
        getTableColumns(selectedSourceTable.database, selectedSourceTable.schema, selectedSourceTable.table),
        getTableColumns(selectedTargetTable.database, selectedTargetTable.schema, selectedTargetTable.table),
        getProjectLatestEvents(projectId),
      ]);
      console.log('Step2: Fetched columns. Source:', sourceColsResult, 'Target:', targetColsResult, 'Events:', events);

      const requiredColumns: { [tableKey: string]: string[] } = {};
      events.forEach((event) => {
        if (event.event_type === 'ADD_REQUIRED_COLUMNS') {
          const tableKey = `${event.event_details.database_name}.${event.event_details.schema_name}.${event.event_details.table_name}`;
          requiredColumns[tableKey] = event.event_details.selected_columns || [];
        }
      });

      const newInternalAttributes: { [tableName: string]: { [columnName: string]: ColumnAttributes } } = {
        ...mappingData.column_attributes,
      };

      const processColumns = (cols: any[], tableType: 'source' | 'target') => {
        const tableSelection = tableType === 'source' ? selectedSourceTable! : selectedTargetTable!;
        const tableName = tableSelection.table;
        const tableKey = `${tableSelection.database}.${tableSelection.schema}.${tableName}`;
        if (!newInternalAttributes[tableName]) {
          newInternalAttributes[tableName] = {};
        }
        return cols.map((col: any) => {
          const existingAttrs = mappingData.column_attributes?.[tableName]?.[col.name] || {};
          const isRequiredFromEvent = requiredColumns[tableKey]?.includes(col.name) || false;
          const columnDetail: ColumnDetail = {
            name: col.name || col.COLUMN_NAME,
            data_type: existingAttrs.data_type || col.data_type || col.type || 'UNKNOWN',
            is_nullable: existingAttrs.is_nullable !== undefined ? existingAttrs.is_nullable : (col.is_nullable || col.IS_NULLABLE === 'YES'),
            is_primary_key: existingAttrs.is_primary_key !== undefined ? existingAttrs.is_primary_key : (col.is_primary_key || col.CONSTRAINT_TYPE === 'PRIMARY KEY'),
            is_foreign_key: existingAttrs.is_foreign_key !== undefined ? existingAttrs.is_foreign_key : (col.is_foreign_key || col.CONSTRAINT_TYPE === 'FOREIGN KEY'),
            is_required_for_mapping: existingAttrs.is_required_for_mapping !== undefined
              ? existingAttrs.is_required_for_mapping
              : isRequiredFromEvent,
            length: existingAttrs.length || col.length || (col.data_type?.includes('VARCHAR') ? parseInt(col.data_type.match(/\d+/)?.[0] || '255') : undefined),
          };
          newInternalAttributes[tableName][columnDetail.name] = {
            is_nullable: columnDetail.is_nullable,
            is_primary_key: columnDetail.is_primary_key,
            is_foreign_key: columnDetail.is_foreign_key,
            is_required_for_mapping: columnDetail.is_required_for_mapping,
            data_type: columnDetail.data_type,
            length: columnDetail.length,
          };
          return columnDetail;
        });
      };

      const sourceCols = processColumns(sourceColsResult, 'source');
      const targetCols = processColumns(targetColsResult, 'target');
      setSourceColumns(sourceCols);
      setTargetColumns(targetCols);
      setInternalColumnAttributes(newInternalAttributes);
      console.log('Step2: Columns and internal attributes set:', newInternalAttributes);

      if (selectedSourceTable && newInternalAttributes[selectedSourceTable.table]) {
        const allSourceRequired = Object.values(newInternalAttributes[selectedSourceTable.table]).every(
          attr => attr.is_required_for_mapping
        );
        setSelectAllSource(allSourceRequired);
      }
      if (selectedTargetTable && newInternalAttributes[selectedTargetTable.table]) {
        const allTargetRequired = Object.values(newInternalAttributes[selectedTargetTable.table]).every(
          attr => attr.is_required_for_mapping
        );
        setSelectAllTarget(allTargetRequired);
      }
    } catch (error: any) {
      console.error('Step2: Error fetching columns:', error);
      toast({
        title: 'Error',
        description: `Failed to load column details: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      console.log('Step2: Finished fetching columns. Loading state:', false);
    }
  }, [selectedSourceTable, selectedTargetTable, toast, projectId, mappingData.column_attributes]);

  useEffect(() => {
    if (sourceColumns.length === 0 && targetColumns.length === 0 && selectedSourceTable && selectedTargetTable) {
      console.log('Step2: Initializing columns on mount or table change.');
      fetchAndInitializeColumns();
    }
  }, [fetchAndInitializeColumns, sourceColumns.length, targetColumns.length, selectedSourceTable, selectedTargetTable]);

  useEffect(() => {
    if (selectedSourceTable && internalColumnAttributes[selectedSourceTable.table]) {
      const allRequired = Object.values(internalColumnAttributes[selectedSourceTable.table]).every(
        attr => attr.is_required_for_mapping
      );
      setSelectAllSource(allRequired);
    }
  }, [internalColumnAttributes, selectedSourceTable]);

  useEffect(() => {
    if (selectedTargetTable && internalColumnAttributes[selectedTargetTable.table]) {
      const allRequired = Object.values(internalColumnAttributes[selectedTargetTable.table]).every(
        attr => attr.is_required_for_mapping
      );
      setSelectAllTarget(allRequired);
    }
  }, [internalColumnAttributes, selectedTargetTable]);

  useEffect(() => {
    if (selectAllSource && selectedSourceTable) {
      setInternalColumnAttributes(prev => {
        const newAttributes = { ...prev };
        if (newAttributes[selectedSourceTable.table]) {
          Object.keys(newAttributes[selectedSourceTable.table]).forEach(colName => {
            newAttributes[selectedSourceTable.table][colName].is_required_for_mapping = true;
          });
        }
        return newAttributes;
      });
    }
  }, [selectAllSource, selectedSourceTable]);

  useEffect(() => {
    if (selectAllTarget && selectedTargetTable) {
      setInternalColumnAttributes(prev => {
        const newAttributes = { ...prev };
        if (newAttributes[selectedTargetTable.table]) {
          Object.keys(newAttributes[selectedTargetTable.table]).forEach(colName => {
            newAttributes[selectedTargetTable.table][colName].is_required_for_mapping = true;
          });
        }
        return newAttributes;
      });
    }
  }, [selectAllTarget, selectedTargetTable]);

  const handleRequiredToggle = useCallback((tableName: string, columnName: string, isRequired: boolean) => {
    console.log(`Step2: Toggling 'Required for Mapping' for ${tableName}.${columnName} to ${isRequired}`);
    setInternalColumnAttributes(prev => {
      const newAttributes = { ...prev };
      if (!newAttributes[tableName]) newAttributes[tableName] = {};
      newAttributes[tableName][columnName] = { ...newAttributes[tableName][columnName], is_required_for_mapping: isRequired };
      return newAttributes;
    });
  }, []);

  const handleNullableToggle = useCallback((tableName: string, columnName: string, isNullable: boolean) => {
    console.log(`Step2: Toggling 'Nullable' for ${tableName}.${columnName} to ${isNullable}`);
    setInternalColumnAttributes(prev => {
      const newAttributes = { ...prev };
      if (!newAttributes[tableName]) newAttributes[tableName] = {};
      newAttributes[tableName][columnName] = { ...newAttributes[tableName][columnName], is_nullable: isNullable };
      return newAttributes;
    });
  }, []);

  const handleTypeChange = useCallback((tableName: string, columnName: string, newType: string) => {
    console.log(`Step2: Changing data type for ${tableName}.${columnName} to ${newType}`);
    setInternalColumnAttributes(prev => {
      const newAttributes = { ...prev };
      if (!newAttributes[tableName]) newAttributes[tableName] = {};
      newAttributes[tableName][columnName] = {
        ...newAttributes[tableName][columnName],
        data_type: newType,
        length: newType === 'VARCHAR' ? (newAttributes[tableName][columnName]?.length || 255) : undefined,
      };
      return newAttributes;
    });
  }, []);

  const handleLengthChange = useCallback((tableName: string, columnName: string, newLength: number | undefined) => {
    console.log(`Step2: Changing length for ${tableName}.${columnName} to ${newLength || 'undefined'}`);
    setInternalColumnAttributes(prev => {
      const newAttributes = { ...prev };
      if (!newAttributes[tableName]) newAttributes[tableName] = {};
      newAttributes[tableName][columnName] = { ...newAttributes[tableName][columnName], length: newLength };
      return newAttributes;
    });
  }, []);

  const handleDeselectAllSource = useCallback(() => {
    if (selectedSourceTable) {
      setInternalColumnAttributes(prev => {
        const newAttributes = { ...prev };
        if (newAttributes[selectedSourceTable.table]) {
          Object.keys(newAttributes[selectedSourceTable.table]).forEach(colName => {
            newAttributes[selectedSourceTable.table][colName].is_required_for_mapping = false;
          });
        }
        return newAttributes;
      });
      setSelectAllSource(false);
    }
  }, [selectedSourceTable]);

  const handleDeselectAllTarget = useCallback(() => {
    if (selectedTargetTable) {
      setInternalColumnAttributes(prev => {
        const newAttributes = { ...prev };
        if (newAttributes[selectedTargetTable.table]) {
          Object.keys(newAttributes[selectedTargetTable.table]).forEach(colName => {
            newAttributes[selectedTargetTable.table][colName].is_required_for_mapping = false;
          });
        }
        return newAttributes;
      });
      setSelectAllTarget(false);
    }
  }, [selectedTargetTable]);

  const handleAddNewColumn = useCallback(async () => {
    if (!newColumnName.trim()) {
      toast({ title: 'Error', description: 'Column name is required.', variant: 'destructive' });
      return;
    }
    if (!selectedTargetTable) return;

    const tableName = selectedTargetTable.table;
    const allExistingColumnNames = new Set([
      ...targetColumns.map(col => col.name.toLowerCase()),
      ...newTargetColumns.map(col => col.name.toLowerCase()),
    ]);
    if (allExistingColumnNames.has(newColumnName.toLowerCase())) {
      toast({
        title: 'Validation Error',
        description: `Column name '${newColumnName}' already exists in the target table or in the list of new columns.`,
        variant: 'destructive',
      });
      return;
    }

    setAddingColumn(true);
    try {
      const session = await getSession();
      if (!session?.user?.access_token) throw new Error('No access token available');
      const token = session.user.access_token;

      const columnTypeString = newColumnLength && newColumnType === 'VARCHAR' ? `${newColumnType}(${newColumnLength})` : newColumnType;

      const addColumnsPayload = {
        project_id: projectId,
        database_name: selectedTargetTable.database,
        schema_name: selectedTargetTable.schema,
        table_name: tableName,
        columns: [{ name: newColumnName, type: columnTypeString, default: '', comment: '' }],
      };

      const addColumnsResponse = await axios.post(
        `${API_BASE_URL}/mapping/add-columns`,
        addColumnsPayload,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );

      if (addColumnsResponse.data.status !== 'success') {
        throw new Error(addColumnsResponse.data.detail || 'Failed to add columns to database.');
      }

      const updatedTargetCols = await getTableColumns(
        selectedTargetTable.database,
        selectedTargetTable.schema,
        tableName
      );

      const newInternalAttributes = { ...internalColumnAttributes };
      if (!newInternalAttributes[tableName]) newInternalAttributes[tableName] = {};

      const newTargetCol: NewTargetColumn = {
        name: newColumnName,
        type: columnTypeString,
        nullable: newColumnNullable,
        length: newColumnLength,
      };

      newInternalAttributes[tableName][newColumnName] = {
        is_nullable: newColumnNullable,
        is_primary_key: false,
        is_foreign_key: false,
        is_required_for_mapping: false,
        data_type: newColumnType,
        length: newColumnLength,
      };

      setTargetColumns(
        updatedTargetCols.map((col: any) => {
          const existingAttrs = newInternalAttributes[tableName][col.name] || {};
          return {
            name: col.name || col.COLUMN_NAME,
            data_type: existingAttrs.data_type || col.data_type || col.type || 'UNKNOWN',
            is_nullable: existingAttrs.is_nullable !== undefined ? existingAttrs.is_nullable : (col.is_nullable || col.IS_NULLABLE === 'YES'),
            is_primary_key: existingAttrs.is_primary_key !== undefined ? existingAttrs.is_primary_key : (col.is_primary_key || col.CONSTRAINT_TYPE === 'PRIMARY KEY'),
            is_foreign_key: existingAttrs.is_foreign_key !== undefined ? existingAttrs.is_foreign_key : (col.is_foreign_key || col.CONSTRAINT_TYPE === 'FOREIGN KEY'),
            is_required_for_mapping: existingAttrs.is_required_for_mapping !== undefined
              ? existingAttrs.is_required_for_mapping
              : false,
            length: existingAttrs.length || col.length || (col.data_type?.includes('VARCHAR') ? parseInt(col.data_type.match(/\d+/)?.[0] || '255') : undefined),
          };
        })
      );

      setInternalColumnAttributes(newInternalAttributes);
      setNewTargetColumns(prev => [...prev, newTargetCol]);
      updateMappingData({ new_target_columns: [...newTargetColumns, newTargetCol], column_attributes: newInternalAttributes });

      toast({
        title: 'Column Added',
        description: `Column '${newColumnName}' successfully added to target table.`,
        variant: 'success',
      });

      setNewColumnName('');
      setNewColumnType('VARCHAR');
      setNewColumnLength(undefined);
      setNewColumnNullable(true);
    } catch (error: any) {
      console.error('Error adding column:', error);
      toast({
        title: 'Error',
        description: `Failed to add column: ${error.response?.data?.detail || error.message || 'An unexpected error occurred.'}`,
        variant: 'destructive',
      });
    } finally {
      setAddingColumn(false);
    }
  }, [
    newColumnName,
    newColumnType,
    newColumnLength,
    newColumnNullable,
    selectedTargetTable,
    targetColumns,
    newTargetColumns,
    projectId,
    updateMappingData,
    toast,
    internalColumnAttributes,
  ]);

  const handleNextStep = useCallback(async () => {
    console.log('Step2: Proceeding to next step.');
    if (!projectId || !username || !selectedSourceTable || !selectedTargetTable) {
      toast({ title: 'Error', description: 'Project, user, or table selection missing.', variant: 'destructive' });
      return;
    }

    const selectedSourceColumnNames: string[] = sourceColumns
      .filter(col => internalColumnAttributes[selectedSourceTable.table]?.[col.name]?.is_required_for_mapping)
      .map(col => col.name);

    const selectedTargetColumnNames: string[] = targetColumns
      .filter(col => internalColumnAttributes[selectedTargetTable.table]?.[col.name]?.is_required_for_mapping)
      .map(col => col.name);

    try {
      await storeSelectedColumns({
        project_id: projectId,
        database_name: selectedSourceTable.database,
        schema_name: selectedSourceTable.schema,
        table_name: selectedSourceTable.table,
        selected_columns: selectedSourceColumnNames,
      });

      await storeSelectedColumns({
        project_id: projectId,
        database_name: selectedTargetTable.database,
        schema_name: selectedTargetTable.schema,
        table_name: selectedTargetTable.table,
        selected_columns: selectedTargetColumnNames,
      });

      updateMappingData({
        column_attributes: internalColumnAttributes,
        new_target_columns: newTargetColumns,
        column_mappings: mappingData.column_mappings || [],
      });
      toast({ title: 'Required Columns Saved', description: 'Column requirements saved successfully!', variant: 'success' });
      onNext();
    } catch (error: any) {
      console.error('Step2: Failed to save column requirements:', error);
      toast({
        title: 'Error Saving Columns',
        description: `Failed to save column requirements: ${error.message}`,
        variant: 'destructive',
      });
    }
  }, [
    projectId,
    username,
    selectedSourceTable,
    selectedTargetTable,
    sourceColumns,
    targetColumns,
    internalColumnAttributes,
    newTargetColumns,
    updateMappingData,
    toast,
    onNext,
    mappingData.column_mappings,
  ]);

  const handleBackStep = useCallback(() => {
    console.log('Step2: Going back. Saving current state.');
    updateMappingData({
      column_attributes: internalColumnAttributes,
      new_target_columns: newTargetColumns,
      column_mappings: mappingData.column_mappings || [],
    });
    onBack();
  }, [internalColumnAttributes, newTargetColumns, updateMappingData, onBack, mappingData.column_mappings]);

  const filteredSourceColumns = sourceColumns.filter(col =>
    col.name.toLowerCase().includes(sourceSearch.toLowerCase())
  );

  const filteredTargetColumns = targetColumns.filter(col =>
    col.name.toLowerCase().includes(targetSearch.toLowerCase())
  );

  if (loading) {
    return (
      <Card className="p-4">
        <CardHeader>
          <CardTitle>Step 2: Define Required and Nullable Columns</CardTitle>
        </CardHeader>
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
        <CardTitle>Step 2: Define Required and Nullable Columns</CardTitle>
        <p className="text-sm text-muted-foreground">
          Select which columns are required for mapping and specify their nullability. Add new columns to the target table if needed.
        </p>
      </CardHeader>
      <CardContent className="space-y-8">
        {selectedSourceTable && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Source Table: {selectedSourceTable.table}</h3>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search source columns..."
                  value={sourceSearch}
                  onChange={e => setSourceSearch(e.target.value)}
                  className="w-48"
                />
                <Button variant="outline" onClick={handleDeselectAllSource}>
                  Deselect All
                </Button>
                <Checkbox
                  checked={selectAllSource}
                  onCheckedChange={checked => setSelectAllSource(!!checked)}
                  id="select-all-source"
                />
                <Label htmlFor="select-all-source">Select All</Label>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column Name</TableHead>
                  <TableHead>Data Type</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead>Required for Mapping</TableHead>
                  <TableHead>Nullable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSourceColumns.map(col => (
                  <TableRow key={col.name}>
                    <TableCell>{col.name}</TableCell>
                    <TableCell>
                      <Select
                        value={internalColumnAttributes[selectedSourceTable.table]?.[col.name]?.data_type || col.data_type}
                        onValueChange={value => handleTypeChange(selectedSourceTable.table, col.name, value)}
                        disabled={col.is_primary_key || col.is_foreign_key}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {dataTypes.map(type => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={internalColumnAttributes[selectedSourceTable.table]?.[col.name]?.length || ''}
                        onChange={e =>
                          handleLengthChange(
                            selectedSourceTable.table,
                            col.name,
                            e.target.value ? parseInt(e.target.value) : undefined
                          )
                        }
                        placeholder="Length"
                        disabled={
                          col.is_primary_key ||
                          col.is_foreign_key ||
                          internalColumnAttributes[selectedSourceTable.table]?.[col.name]?.data_type !== 'VARCHAR'
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={internalColumnAttributes[selectedSourceTable.table]?.[col.name]?.is_required_for_mapping || false}
                        onCheckedChange={checked => handleRequiredToggle(selectedSourceTable.table, col.name, !!checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={internalColumnAttributes[selectedSourceTable.table]?.[col.name]?.is_nullable || false}
                        onCheckedChange={checked => handleNullableToggle(selectedSourceTable.table, col.name, !!checked)}
                        disabled={col.is_primary_key}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {selectedTargetTable && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Target Table: {selectedTargetTable.table}</h3>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search target columns..."
                  value={targetSearch}
                  onChange={e => setTargetSearch(e.target.value)}
                  className="w-48"
                />
                <Button variant="outline" onClick={handleDeselectAllTarget}>
                  Deselect All
                </Button>
                <Checkbox
                  checked={selectAllTarget}
                  onCheckedChange={checked => setSelectAllTarget(!!checked)}
                  id="select-all-target"
                />
                <Label htmlFor="select-all-target">Select All</Label>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column Name</TableHead>
                  <TableHead>Data Type</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead>Required for Mapping</TableHead>
                  <TableHead>Nullable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTargetColumns.map(col => (
                  <TableRow key={col.name}>
                    <TableCell>{col.name}</TableCell>
                    <TableCell>
                      <Select
                        value={internalColumnAttributes[selectedTargetTable.table]?.[col.name]?.data_type || col.data_type}
                        onValueChange={value => handleTypeChange(selectedTargetTable.table, col.name, value)}
                        disabled={col.is_primary_key || col.is_foreign_key}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {dataTypes.map(type => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={internalColumnAttributes[selectedTargetTable.table]?.[col.name]?.length || ''}
                        onChange={e =>
                          handleLengthChange(
                            selectedTargetTable.table,
                            col.name,
                            e.target.value ? parseInt(e.target.value) : undefined
                          )
                        }
                        placeholder="Length"
                        disabled={
                          col.is_primary_key ||
                          col.is_foreign_key ||
                          internalColumnAttributes[selectedTargetTable.table]?.[col.name]?.data_type !== 'VARCHAR'
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={internalColumnAttributes[selectedTargetTable.table]?.[col.name]?.is_required_for_mapping || false}
                        onCheckedChange={checked => handleRequiredToggle(selectedTargetTable.table, col.name, !!checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={internalColumnAttributes[selectedTargetTable.table]?.[col.name]?.is_nullable || false}
                        onCheckedChange={checked => handleNullableToggle(selectedTargetTable.table, col.name, !!checked)}
                        disabled={col.is_primary_key}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="border p-4 rounded-lg space-y-4">
              <h3 className="text-lg font-semibold">Add New Column to Target Table</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <Label htmlFor="new-column-name">Column Name</Label>
                  <Input
                    id="new-column-name"
                    value={newColumnName}
                    onChange={e => setNewColumnName(e.target.value)}
                    placeholder="e.g., new_column"
                    disabled={addingColumn}
                  />
                </div>
                <div>
                  <Label htmlFor="new-column-type">Data Type</Label>
                  <Select value={newColumnType} onValueChange={setNewColumnType} disabled={addingColumn}>
                    <SelectTrigger id="new-column-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dataTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="new-column-length">Length (for VARCHAR)</Label>
                  <Input
                    id="new-column-length"
                    type="number"
                    value={newColumnLength || ''}
                    onChange={e => setNewColumnLength(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="e.g., 255"
                    disabled={addingColumn || newColumnType !== 'VARCHAR'}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="new-column-nullable"
                    checked={newColumnNullable}
                    onCheckedChange={checked => setNewColumnNullable(!!checked)}
                    disabled={addingColumn}
                  />
                  <Label htmlFor="new-column-nullable">Nullable</Label>
                </div>
              </div>
              <Button onClick={handleAddNewColumn} disabled={addingColumn || !newColumnName.trim()}>
                {addingColumn ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Column'
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2 mt-6">
          <Button variant="outline" onClick={handleBackStep} disabled={loading || addingColumn}>
            Back
          </Button>
          <Button
            onClick={handleNextStep}
            disabled={loading || addingColumn || !selectedSourceTable || !selectedTargetTable}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Step2RequiredNull;