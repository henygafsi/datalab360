'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getAuthToken } from '@/lib/auth';
import { Loader2 } from 'lucide-react'; // Import Loader2 for loading state
import { manageTableStructure } from './addConstraints'; // Import the service to manage table structure

interface Step5Props {
    onBack: () => void;
    mappingData: any; // Using 'any' for brevity, but ideally a specific interface like MappingDetail
}

const Step5Deployment: React.FC<Step5Props> = ({ onBack, mappingData }) => {
    const [deploying, setDeploying] = useState(false);
    const { toast } = useToast();

    const handleDeploy = async () => {
        setDeploying(true);
        try {
            const token = getAuthToken();

            let hadCriticalError = false;
            const constraintPromises = [];

            // --- Process Primary Keys ---
            if (mappingData.primary_keys && mappingData.primary_keys.target && mappingData.primary_keys.target.length > 0) {
                // Assuming target PKs are for the target table itself
                const targetTableKey = `"${mappingData.target_database}"."${mappingData.target_schema}"."${mappingData.target_table}"`;
                mappingData.primary_keys.target.forEach((pkColumn: string) => {
                    constraintPromises.push(
                        manageTableStructure({
                            SOURCE_TABLE: targetTableKey,
                            COLUMN_NAME: pkColumn,
                            CONSTRAINT_TYPE: 'ADD_PK'
                        })
                    );
                });
            }
            // Note: If source tables also have PKs to be explicitly "added" (e.g., if they were created without them),
            // you would add similar logic here for mappingData.primary_keys.source.
            // However, typically PKs are defined on creation or managed separately for source systems.
            // This implementation focuses on applying constraints to the target table.


            // --- Process Foreign Keys ---
            if (mappingData.foreign_keys && mappingData.foreign_keys.target && mappingData.foreign_keys.target.length > 0) {
                // Assuming target FKs are applied to the target table
                const targetTableKey = `"${mappingData.target_database}"."${mappingData.target_schema}"."${mappingData.target_table}"`;
                mappingData.foreign_keys.target.forEach((fk: { column: string; referenced_table: string; referenced_column: string }) => {
                    // The referenced_table from mappingData.foreign_keys.target might just be the table name,
                    // not the fully qualified path. You'll need to reconstruct the full path if necessary.
                    // For simplicity, let's assume referenced_table is just the name and needs full qualification.
                    // This assumes referenced_table is in the same database/schema as the target table, or you need more info.
                    // For now, let's assume it's a simple table name like 'PAYS' or 'CLIENTS'.
                    // You might need to adjust this if your FKs can reference tables in other schemas/databases.
                    const referencedTableFullPath = `"${mappingData.target_database}"."${mappingData.target_schema}"."${fk.referenced_table}"`;

                    constraintPromises.push(
                        manageTableStructure({
                            SOURCE_TABLE: targetTableKey, // The table where the FK is being added
                            COLUMN_NAME: fk.column, // The column in SOURCE_TABLE that is the FK
                            TABLE_REF: referencedTableFullPath, // The table being referenced
                            COLUMN_REF: fk.referenced_column, // The column in the referenced table
                            CONSTRAINT_TYPE: 'ADD_FK'
                        })
                    );
                });
            }
            // Similar to PKs, if source tables also need FKs explicitly added via this process,
            // you'd add logic for mappingData.foreign_keys.source here.

            // Execute all constraint modification requests
            if (constraintPromises.length > 0) {
                const results = await Promise.allSettled(constraintPromises);
                results.forEach(result => {
                    if (result.status === 'fulfilled') {
                        const responseData = result.value;
                        if (responseData && responseData.status === 'info') {
                            toast({
                                title: 'Information',
                                description: responseData.message,
                                variant: 'default',
                            });
                        } else if (responseData && responseData.status === 'success') {
                            toast({
                                title: 'Success',
                                description: responseData.message,
                                variant: 'success',
                            });
                        } else {
                            toast({
                                title: 'Success (Partial)',
                                description: 'A constraint operation completed with an unexpected success status.',
                                variant: 'default',
                            });
                        }
                    } else if (result.status === 'rejected') {
                        hadCriticalError = true;
                        console.error('Error in constraint operation:', result.reason);
                        const errorMessage = result.reason?.message || 'An unknown error occurred.';
                        toast({
                            title: 'Error Applying Constraint',
                            description: `Failed to apply a constraint: ${errorMessage}`,
                            variant: 'destructive',
                        });
                    }
                });
            }

            if (hadCriticalError) {
                // If any critical error occurred during constraint application, do not proceed with model deployment
                toast({
                    title: 'Deployment Halted',
                    description: 'Some critical errors occurred while applying constraints. Please review and try again.',
                    variant: 'destructive',
                });
                return; // Stop further deployment if constraints failed critically
            }


            // --- Proceed with Column Mappings Deployment (Existing Logic) ---
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
                        })),
                        new_target_columns: mappingData.new_target_columns || [],
                    },
                ],
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

                    {/* Display PKs to be applied */}
                    {mappingData.primary_keys && mappingData.primary_keys.target && mappingData.primary_keys.target.length > 0 && (
                        <>
                            <h4 className="font-semibold mt-2">Primary Keys to Apply (Target Table):</h4>
                            <ul className="list-disc list-inside text-sm">
                                {mappingData.primary_keys.target.map((pk: string, index: number) => (
                                    <li key={`pk-${index}`}>{pk}</li>
                                ))}
                            </ul>
                        </>
                    )}

                    {/* Display FKs to be applied */}
                    {mappingData.foreign_keys && mappingData.foreign_keys.target && mappingData.foreign_keys.target.length > 0 && (
                        <>
                            <h4 className="font-semibold mt-2">Foreign Keys to Apply (Target Table):</h4>
                            <ul className="list-disc list-inside text-sm">
                                {mappingData.foreign_keys.target.map((fk: any, index: number) => (
                                    <li key={`fk-${index}`}>
                                        {fk.column} REFERENCES {fk.referenced_table}.{fk.referenced_column}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    <h4 className="font-semibold mt-2">Column Attributes (PK/FK/Required):</h4>
                    {mappingData.column_attributes && Object.keys(mappingData.column_attributes).length > 0 ? (
                        Object.entries(mappingData.column_attributes).map(([tableName, columns]: [string, any]) => (
                            <div key={tableName} className="mt-1">
                                <p className="font-medium">{tableName}:</p>
                                <ul className="list-disc list-inside ml-4 text-xs">
                                    {Object.entries(columns).map(([colName, attrs]: [string, any]) => (
                                        <li key={colName}>
                                            {colName}:
                                            PK={attrs.is_primary_key ? 'Yes' : 'No'},
                                            FK={attrs.is_foreign_key ? 'Yes' : 'No'},
                                            DB Nullable={attrs.is_nullable ? 'Yes' : 'No'},
                                            Required for Mapping={attrs.is_required_for_mapping ? 'Yes' : 'No'}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-gray-500">No detailed column attributes available.</p>
                    )}
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onBack}>Back</Button>
                    <Button onClick={handleDeploy} disabled={deploying}>
                        {deploying ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Deploying...
                            </>
                        ) : (
                            'Deploy Model'
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step5Deployment;
