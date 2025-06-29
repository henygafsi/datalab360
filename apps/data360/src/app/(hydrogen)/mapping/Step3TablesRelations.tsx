// components/mapping-wizard/Step3TablesRelations.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getAuthToken } from '@/lib/utils';

// You'd typically use a library like 'react-flow-renderer' or similar for actual drawing
// For demonstration, we'll just show the data that would drive the visualization.

interface Step3Props {
    onNext: () => void;
    onBack: () => void;
    mappingData: any;
    updateMappingData: (newData: any) => void;
    selectedSourceTable: { database: string; schema: string; table: string } | null;
    selectedTargetTable: { database: string; schema: string; table: string } | null;
  }
  
  const Step3TablesRelations: React.FC<Step3Props> = ({ onNext, onBack, mappingData, updateMappingData, selectedSourceTable, selectedTargetTable }) => {
    const [constraints, setConstraints] = useState<any[]>([]);
    const [sourceTableColumns, setSourceTableColumns] = useState<any[]>([]);
    const [targetTableColumns, setTargetTableColumns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
  
    useEffect(() => {
      const fetchData = async () => {
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
  
          // Fetch constraints for both source and target schemas
          const [sourceConstraintsRes, targetConstraintsRes, sourceColsRes, targetColsRes] = await Promise.all([
            fetch(`/api/mapping/constraints?database_name=${selectedSourceTable.database}&schema=${selectedSourceTable.schema}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`/api/mapping/constraints?database_name=${selectedTargetTable.database}&schema=${selectedTargetTable.schema}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`/api/mapping/details?database_name=${selectedSourceTable.database}&schema_name=${selectedSourceTable.schema}&table_name=${selectedSourceTable.table}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`/api/mapping/details?database_name=${selectedTargetTable.database}&schema_name=${selectedTargetTable.schema}&table_name=${selectedTargetTable.table}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            }),
          ]);
  
          if (!sourceConstraintsRes.ok) throw new Error('Failed to fetch source constraints.');
          if (!targetConstraintsRes.ok) throw new Error('Failed to fetch target constraints.');
          if (!sourceColsRes.ok) throw new Error('Failed to fetch source columns.');
          if (!targetColsRes.ok) throw new Error('Failed to fetch target columns.');
  
          const sourceConstraints = await sourceConstraintsRes.json();
          const targetConstraints = await targetConstraintsRes.json();
          const sourceCols = await sourceColsRes.json();
          const targetCols = await targetColsRes.json();
  
          setConstraints([...sourceConstraints, ...targetConstraints]);
          setSourceTableColumns(sourceCols.columns);
          setTargetTableColumns(targetCols.columns);
  
        } catch (error: any) {
          toast({
            title: 'Error',
            description: `Failed to load relations: ${error.message}`,
            variant: 'destructive',
          });
        } finally {
          setLoading(false);
        }
      };
  
      fetchData();
    }, [selectedSourceTable, selectedTargetTable, toast]);
  
    const getColumnAttributes = (tableName: string, colName: string) => {
      return mappingData.column_attributes?.[tableName]?.[colName] || { is_nullable: true, is_primary_key: false, is_foreign_key: false };
    };
  
    const currentSourceTableName = selectedSourceTable?.table;
    const currentTargetTableName = selectedTargetTable?.table;
  
    // Filter constraints relevant to the selected source and target tables
    const relevantConstraints = constraints.filter(constraint =>
      (constraint.table_name === currentSourceTableName && constraint.referenced_table_name === currentTargetTableName) ||
      (constraint.table_name === currentTargetTableName && constraint.referenced_table_name === currentSourceTableName) ||
      (constraint.table_name === currentSourceTableName && constraint.referenced_table_name === currentSourceTableName) ||
      (constraint.table_name === currentTargetTableName && constraint.referenced_table_name === currentTargetTableName)
    );
  
    if (loading) {
      return (
        <Card className="p-4">
          <CardHeader><CardTitle>Step 3: Tables & Relations Visualization</CardTitle></CardHeader>
          <CardContent>Loading table and relation data...</CardContent>
        </Card>
      );
    }
  
    return (
      <Card className="p-4">
        <CardHeader>
          <CardTitle>Step 3: Tables & Relations Visualization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Visual representation of source and target tables, their columns, and inferred/existing relationships.
            This section would typically use a visualization library (e.g., React Flow) to draw the connections.
          </p>
  
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Source Table Display */}
            <div className="border p-4 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold mb-2">{currentSourceTableName}</h3>
              <ul className="list-disc list-inside text-sm">
                {sourceTableColumns.map((col: any) => {
                  const attrs = getColumnAttributes(currentSourceTableName!, col.name);
                  return (
                    <li key={col.name}>
                      <strong>{col.name}</strong> ({col.type})
                      {attrs.is_primary_key && <span className="text-blue-500 ml-1">(PK)</span>}
                      {attrs.is_foreign_key && <span className="text-green-500 ml-1">(FK)</span>}
                      {!attrs.is_nullable && <span className="text-red-500 ml-1">(Required)</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
  
            {/* Target Table Display */}
            <div className="border p-4 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold mb-2">{currentTargetTableName}</h3>
              <ul className="list-disc list-inside text-sm">
                {targetTableColumns.map((col: any) => {
                  const attrs = getColumnAttributes(currentTargetTableName!, col.name);
                  return (
                    <li key={col.name}>
                      <strong>{col.name}</strong> ({col.type})
                      {attrs.is_primary_key && <span className="text-blue-500 ml-1">(PK)</span>}
                      {attrs.is_foreign_key && <span className="text-green-500 ml-1">(FK)</span>}
                      {!attrs.is_nullable && <span className="text-red-500 ml-1">(Required)</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
  
          {/* Displaying relationships (simplified text representation) */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-2">Relationships:</h3>
            {relevantConstraints.length > 0 ? (
              <ul className="list-disc list-inside text-sm">
                {relevantConstraints.map((c, index) => (
                  <li key={index}>
                    <strong>{c.table_name}.{c.column_name}</strong> refers to{' '}
                    <strong>{c.referenced_table_name}.{c.referenced_column_name}</strong> (Constraint: {c.constraint_name})
                  </li>
                ))}
              </ul>
            ) : (
              <p>No direct foreign key relationships found between selected tables or within them.</p>
            )}
          </div>
  
          {/* Placeholder for actual visualization */}
          <div className="w-full h-96 border border-dashed rounded-lg flex items-center justify-center bg-gray-50 text-gray-400">
            [Graphical Visualization of Tables and Relations would go here]
          </div>
  
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onBack}>Back</Button>
            <Button onClick={onNext}>Next</Button>
          </div>
        </CardContent>
      </Card>
    );
  };
  
  export default Step3TablesRelations;
  