// components/mapping-wizard/Step4AddColumns.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, MinusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getAuthToken } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';



interface Step4Props {
    onNext: () => void;
    onBack: () => void;
    mappingData: any;
    updateMappingData: (newData: any) => void;
    selectedSourceTable: { database: string; schema: string; table: string } | null;
    selectedTargetTable: { database: string; schema: string; table: string } | null;
  }
  
  interface ColumnDetail {
    name: string;
    data_type: string;
    is_nullable: boolean;
    is_primary_key: boolean;
    is_foreign_key: boolean;
  }
  
  const Step4AddColumns: React.FC<Step4Props> = ({ onNext, onBack, mappingData, updateMappingData, selectedSourceTable, selectedTargetTable }) => {
    const [currentColumnMappings, setCurrentColumnMappings] = useState<any[]>(mappingData.column_mappings || []);
    const [sourceColumns, setSourceColumns] = useState<ColumnDetail[]>([]);
    const [targetColumns, setTargetColumns] = useState<ColumnDetail[]>([]);
    const [newTargetColumns, setNewTargetColumns] = useState<{ name: string; type: string; nullable: boolean }[]>(mappingData.new_target_columns || []); // Initialize from mappingData
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
  
    useEffect(() => {
      const fetchColumns = async () => {
        if (!selectedSourceTable || !selectedTargetTable) {
          toast({
            title: 'Error',
            description: 'Source or target table not selected.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }
  
        setLoading(true);
        try {
          const token = getAuthToken();
          const [sourceRes, targetRes] = await Promise.all([
            fetch(`/api/mapping/details?database_name=${selectedSourceTable.database}&schema_name=${selectedSourceTable.schema}&table_name=${selectedSourceTable.table}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`/api/mapping/details?database_name=${selectedTargetTable.database}&schema_name=${selectedTargetTable.schema}&table_name=${selectedTargetTable.table}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            }),
          ]);
  
          if (!sourceRes.ok) throw new Error('Failed to fetch source table columns.');
          if (!targetRes.ok) throw new Error('Failed to fetch target table columns.');
  
          const sourceData = await sourceRes.json();
          const targetData = await targetRes.json();
  
          setSourceColumns(sourceData.columns.map((col: any) => ({
            name: col.name,
            data_type: col.type,
            is_nullable: col.null === 'Y',
            is_primary_key: col.primary_key === 'Y',
            is_foreign_key: false, // Update with actual FK info if needed
          })));
          setTargetColumns(targetData.columns.map((col: any) => ({
            name: col.name,
            data_type: col.type,
            is_nullable: col.null === 'Y',
            is_primary_key: col.primary_key === 'Y',
            is_foreign_key: false, // Update with actual FK info if needed
          })));
  
        } catch (error: any) {
          toast({
            title: 'Error',
            description: `Failed to load column details: ${error.message}`,
            variant: 'destructive',
          });
        } finally {
          setLoading(false);
        }
      };
  
      fetchColumns();
    }, [selectedSourceTable, selectedTargetTable, toast]);
  
    const handleSourceColumnChange = (index: number, newSourceColumn: string) => {
      const updatedMappings = [...currentColumnMappings];
      const sourceColDetail = sourceColumns.find(col => col.name === newSourceColumn);
      if (sourceColDetail) {
        updatedMappings[index] = {
          ...updatedMappings[index],
          source_column: newSourceColumn,
          data_type: sourceColDetail.data_type, // Update data type from source
        };
        setCurrentColumnMappings(updatedMappings);
      }
    };
  
    const handleTargetColumnChange = (index: number, newTargetColumn: string) => {
      const updatedMappings = [...currentColumnMappings];
      updatedMappings[index] = { ...updatedMappings[index], target_column: newTargetColumn };
      setCurrentColumnMappings(updatedMappings);
    };
  
    const addMappingRow = () => {
      setCurrentColumnMappings([...currentColumnMappings, { source_column: '', target_column: '', data_type: '' }]);
    };
  
    const removeMappingRow = (index: number) => {
      const updatedMappings = currentColumnMappings.filter((_, i) => i !== index);
      setCurrentColumnMappings(updatedMappings);
    };
  
    const handleAddNewTargetColumn = () => {
      setNewTargetColumns([...newTargetColumns, { name: '', type: 'VARCHAR', nullable: true }]);
    };
  
    const handleNewTargetColumnChange = (index: number, field: string, value: string | boolean) => {
      const updatedNewColumns = [...newTargetColumns];
      (updatedNewColumns[index] as any)[field] = value;
      setNewTargetColumns(updatedNewColumns);
    };
  
    const removeNewTargetColumn = (index: number) => {
      const updatedNewColumns = newTargetColumns.filter((_, i) => i !== index);
      setNewTargetColumns(updatedNewColumns);
    };
  
    const handleNextStep = async () => {
      // Validate mappings before proceeding
      for (const mapping of currentColumnMappings) {
        if (!mapping.source_column || !mapping.target_column) {
          toast({
            title: 'Validation Error',
            description: 'All mapped columns must have both source and target specified.',
            variant: 'destructive',
          });
          return;
        }
      }
  
      // Prepare data for backend validation (similar to BaseMappingRequest)
      const mappingsForValidation = [{
        source_database: selectedSourceTable!.database,
        source_schema: selectedSourceTable!.schema,
        source_table: selectedSourceTable!.table,
        target_database: selectedTargetTable!.database,
        target_schema: selectedTargetTable!.schema,
        target_table: selectedTargetTable!.table,
        column_mappings: currentColumnMappings.map(m => ({ source_column: m.source_column, target_column: m.target_column })), // Pass as ColumnMap objects
        new_target_columns: [], // Validation endpoint doesn't need new columns
      }];
  
      setLoading(true);
      try {
        const token = getAuthToken();
        const response = await fetch('/api/mapping/test_mapping/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ mappings: mappingsForValidation }),
        });
  
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Column mapping validation failed.');
        }
  
        toast({
          title: 'Success',
          description: 'Column mappings are compatible!',
        });
  
        // Update mappingData with the confirmed column mappings and new target columns
        updateMappingData({
          column_mappings: currentColumnMappings,
          new_target_columns: newTargetColumns, // Store new columns for deployment
          // Update top-level source_columns and target_columns from currentColumnMappings
          source_columns: currentColumnMappings.map(m => m.source_column),
          target_columns: currentColumnMappings.map(m => m.target_column),
        });
  
        onNext();
      } catch (error: any) {
        toast({
          title: 'Error',
          description: `Mapping validation failed: ${error.message}`,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
  
    if (loading) {
      return (
        <Card className="p-4">
          <CardHeader><CardTitle>Step 4: Add Columns & Refine Mappings</CardTitle></CardHeader>
          <CardContent>Loading column data...</CardContent>
        </Card>
      );
    }
  
    return (
      <Card className="p-4">
        <CardHeader>
          <CardTitle>Step 4: Add Columns & Refine Mappings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <h3 className="text-lg font-semibold mb-2">Column Mapping:</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source Column</TableHead>
                <TableHead>Target Column</TableHead>
                <TableHead>Data Type (Inferred)</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentColumnMappings.map((mapping, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Select
                      value={mapping.source_column}
                      onValueChange={(value) => handleSourceColumnChange(index, value)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select Source Column" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceColumns.map((col) => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.name} ({col.data_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={mapping.target_column}
                      onValueChange={(value) => handleTargetColumnChange(index, value)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select Target Column" />
                      </SelectTrigger>
                      <SelectContent>
                        {targetColumns.map((col) => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.name} ({col.data_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{mapping.data_type}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeMappingRow(index)}>
                      <MinusCircle className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button onClick={addMappingRow} variant="outline" className="mt-2">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Mapping Row
          </Button>
  
          <h3 className="text-lg font-semibold mt-6 mb-2">Add New Columns to Target Table:</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column Name</TableHead>
                <TableHead>Data Type</TableHead>
                <TableHead>Nullable</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {newTargetColumns.map((col, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Input
                      value={col.name}
                      onChange={(e) => handleNewTargetColumnChange(index, 'name', e.target.value)}
                      placeholder="New Column Name"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={col.type}
                      onValueChange={(value) => handleNewTargetColumnChange(index, 'type', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VARCHAR">VARCHAR</SelectItem>
                        <SelectItem value="NUMBER">NUMBER</SelectItem>
                        <SelectItem value="BOOLEAN">BOOLEAN</SelectItem>
                        <SelectItem value="DATE">DATE</SelectItem>
                        {/* Add more types as needed */}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={col.nullable}
                      onCheckedChange={(checked: boolean) => handleNewTargetColumnChange(index, 'nullable', checked)}
                    />
                    <Label htmlFor={`new-col-nullable-${index}`} className="ml-2">
                      Nullable
                    </Label>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeNewTargetColumn(index)}>
                      <MinusCircle className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button onClick={handleAddNewTargetColumn} variant="outline" className="mt-2">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Target Column
          </Button>
  
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onBack}>Back</Button>
            <Button onClick={handleNextStep} disabled={loading}>
              {loading ? 'Validating...' : 'Validate & Proceed to Deployment'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };
  
  export default Step4AddColumns;
  