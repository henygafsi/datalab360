// components/mapping-wizard/Step5Deployment.tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getAuthToken } from '@/lib/utils';

interface Step5Props {
    onBack: () => void;
    mappingData: any;
  }
  
  const Step5Deployment: React.FC<Step5Props> = ({ onBack, mappingData }) => {
    const [deploying, setDeploying] = useState(false);
    const { toast } = useToast();
  
    const handleDeploy = async () => {
      setDeploying(true);
      try {
        const token = getAuthToken();
        // Prepare the request body for /deploy_model/
        const deployRequestBody = {
          mappings: [
            {
              source_database: mappingData.source_database,
              source_schema: mappingData.source_schema,
              source_table: mappingData.source_table,
              target_database: mappingData.target_database,
              target_schema: mappingData.target_schema,
              target_table: mappingData.target_table,
              column_mappings: mappingData.column_mappings.map((m: any) => ({
                source_column: m.source_column,
                target_column: m.target_column,
              })), // Ensure this matches the ColumnMap Pydantic model
              new_target_columns: mappingData.new_target_columns || [], // Pass new columns
            },
          ],
          // If you had a model name, you'd add it here, but BaseMappingRequest doesn't require it
          // model_name: "MyNewMappingModel",
        };
  
        const response = await fetch('/api/mapping/deploy_model/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(deployRequestBody),
        });
  
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Deployment failed.');
        }
  
        toast({
          title: 'Success',
          description: 'Model deployed successfully!',
        });
        // Optionally, redirect or show a success message that persists
      } catch (error: any) {
        toast({
          title: 'Deployment Error',
          description: `Deployment failed: ${error.message}`,
          variant: 'destructive',
        });
      } finally {
        setDeploying(false);
      }
    };
  
    return (
      <Card className="p-4">
        <CardHeader>
          <CardTitle>Step 5: Deployment Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <h3 className="text-lg font-semibold">Review Mapping Configuration:</h3>
          <div className="border p-4 rounded-lg bg-gray-50">
            <p><strong>Source:</strong> {mappingData.source_database}.{mappingData.source_schema}.{mappingData.source_table}</p>
            <p><strong>Target:</strong> {mappingData.target_database}.{mappingData.target_schema}.{mappingData.target_table}</p>
            <h4 className="font-semibold mt-2">Column Mappings:</h4>
            {mappingData.column_mappings && mappingData.column_mappings.length > 0 ? (
              <ul className="list-disc list-inside text-sm">
                {mappingData.column_mappings.map((m: any, index: number) => (
                  <li key={index}>{m.source_column} ({m.data_type}) {'->'} {m.target_column}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No column mappings defined.</p>
            )}
  
            {mappingData.new_target_columns && mappingData.new_target_columns.length > 0 && (
              <>
                <h4 className="font-semibold mt-2">New Target Columns to Add:</h4>
                <ul className="list-disc list-inside text-sm">
                  {mappingData.new_target_columns.map((col: any, index: number) => (
                    <li key={index}>{col.name} ({col.type}) {col.nullable ? '(Nullable)' : '(Required)'}</li>
                  ))}
                </ul>
              </>
            )}
  
            {/* Display other collected data here: PK/FK, Required/Nullable status for each column */}
            <h4 className="font-semibold mt-2">Column Attributes:</h4>
            {mappingData.column_attributes && Object.keys(mappingData.column_attributes).length > 0 ? (
              Object.entries(mappingData.column_attributes).map(([tableName, columns]: [string, any]) => (
                <div key={tableName} className="mt-1">
                  <p className="font-medium">{tableName}:</p>
                  <ul className="list-disc list-inside ml-4 text-xs">
                    {Object.entries(columns).map(([colName, attrs]: [string, any]) => (
                      <li key={colName}>
                        {colName}: PK={attrs.is_primary_key ? 'Yes' : 'No'}, FK={attrs.is_foreign_key ? 'Yes' : 'No'}, Nullable={attrs.is_nullable ? 'Yes' : 'No'}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No detailed column attributes available.</p>
            )}
  
            {/* You might want to display suggested_constraints_ddl if you collected them and want to show the user */}
          </div>
  
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onBack}>Back</Button>
            <Button onClick={handleDeploy} disabled={deploying}>
              {deploying ? 'Deploying...' : 'Deploy Model'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };
  
  export default Step5Deployment;
  