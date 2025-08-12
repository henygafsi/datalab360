'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';
import { getSession } from 'next-auth/react';
import { manageTableStructure } from './addConstraints'; // Ensure this is imported

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
        source_table_key?: string;
    }>;
    new_target_columns: Array<{
        name: string;
        type: string;
        nullable: boolean;
    }>;
    primary_keys?: {
        source: string[];
        target: string[];
    };
    foreign_keys?: {
        source: Array<{ column: string; referenced_table: string; referenced_column: string }>;
        target: Array<{ column: string; referenced_table: string; referenced_column: string }>;
    };
}

interface Step5Props {
    onBack: () => void;
    mappingData: MappingData;
    projectId: string;
    primaryKeys?: string[];
    username: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://www.api.datalab360.io:8443';

const Step5Deployment: React.FC<Step5Props> = ({ onBack, mappingData, projectId, username }) => {
    const router = useRouter();
    const { toast } = useToast();
    const [deploying, setDeploying] = useState(false);
    // Using mappingData directly for display, as it should be the most up-to-date from parent
    const [deployedMappings] = useState(mappingData.column_mappings);
    const [newColumns] = useState(mappingData.new_target_columns);

    const handleDeploy = useCallback(async () => {
        if (!projectId || !mappingData || !mappingData.target_table) {
            toast({
                title: 'Error',
                description: 'Missing project ID, mapping data, or target table information.',
                variant: 'destructive',
            });
            return;
        }

        setDeploying(true);

        if (mappingData.column_mappings.length === 0) {
            toast({
                title: 'Error',
                description: 'Please define at least one column mapping before deployment.',
                variant: 'destructive',
            });
            setDeploying(false);
            return;
        }

        for (const mapping of mappingData.column_mappings) {
            if (!mapping.source_column || !mapping.target_column) {
                toast({
                    title: 'Error',
                    description: 'All column mappings must have both source and target columns defined.',
                    variant: 'destructive',
                });
                setDeploying(false);
                return;
            }
        }

        try {
            const session = await getSession();
            if (!session?.user?.access_token) {
                throw new Error('No access token available. Please log in again.');
            }
            const token = session.user.access_token;

            // 1. Perform Mapping Validation (using /mapping/test_mapping/)
            const mappingsForValidation = [
                {
                    source_database: mappingData.source_database,
                    source_schema: mappingData.source_schema,
                    source_table: mappingData.source_table,
                    source_columns: mappingData.column_mappings.map((m) => m.source_column),
                    target_database: mappingData.target_database,
                    target_schema: mappingData.target_schema,
                    target_table: mappingData.target_table,
                    target_columns: mappingData.column_mappings.map((m) => m.target_column),
                },
            ];

            console.log('Step5: Sending mapping validation request to /mapping/test_mapping/', mappingsForValidation);
            const validationResponse = await axios.post(
                `${API_BASE_URL}/mapping/test_mapping/`,
                { project_id: projectId, mappings: mappingsForValidation },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            if (validationResponse.data.status !== 'success') {
                throw new Error(validationResponse.data.detail || 'Mapping validation failed. Please review your mappings.');
            }

            toast({
                title: 'Validation Success',
                description: 'Column mappings are valid. Proceeding to apply constraints and deploy.',
                variant: 'success',
            });
            console.log('Step5: Mapping validation successful.');


            // 2. Apply Primary Key and Foreign Key Constraints (using /mapping/manage_table)
            const constraintPromises = [];
            const targetTableKey = `"${mappingData.target_database}"."${mappingData.target_schema}"."${mappingData.target_table}"`;

            if (mappingData.primary_keys?.target?.length) {
                mappingData.primary_keys.target.forEach((pkColumn: string) => {
                    console.log(`Step5: Adding PK constraint for ${pkColumn} on ${targetTableKey}`);
                    constraintPromises.push(
                        manageTableStructure({
                            SOURCE_TABLE: targetTableKey,
                            COLUMN_NAME: pkColumn,
                            CONSTRAINT_TYPE: 'ADD_PK',
                        }, token) // Pass token to manageTableStructure
                    );
                });
            }

            if (mappingData.foreign_keys?.target?.length) {
                mappingData.foreign_keys.target.forEach((fk) => {
                    const referencedTableFullPath = `"${mappingData.target_database}"."${mappingData.target_schema}"."${fk.referenced_table}"`;
                    console.log(`Step5: Adding FK constraint for ${fk.column} referencing ${referencedTableFullPath}.${fk.referenced_column}`);
                    constraintPromises.push(
                        manageTableStructure({
                            SOURCE_TABLE: targetTableKey,
                            COLUMN_NAME: fk.column,
                            TABLE_REF: referencedTableFullPath,
                            COLUMN_REF: fk.referenced_column,
                            CONSTRAINT_TYPE: 'ADD_FK',
                        }, token) // Pass token to manageTableStructure
                    );
                });
            }

            if (constraintPromises.length > 0) {
                console.log(`Step5: Attempting to apply ${constraintPromises.length} constraints.`);
                const results = await Promise.allSettled(constraintPromises);
                const errors = results
                    .filter((r) => r.status === 'rejected')
                    .map((r) => (r as PromiseRejectedResult).reason);

                if (errors.length) {
                    errors.forEach((err, idx) => console.error(`Step5: Constraint application error ${idx + 1}:`, err));
                    throw new Error(`One or more constraint applications failed. Details in console. Errors: ${errors.map((e) => e.message).join(', ')}`);
                }
                toast({
                    title: 'Constraints Applied',
                    description: 'Primary and/or Foreign Key constraints were applied successfully.',
                    variant: 'success',
                });
                console.log('Step5: All specified constraints applied successfully.');
            } else {
                console.log('Step5: No primary or foreign key constraints defined for target table.');
            }

            // 3. Perform Final Deployment (using /mapping/deploy_model/)
            const deployRequestBody = {
                project_id: projectId,
                mappings: [
                    {
                        source_database: mappingData.source_database,
                        source_schema: mappingData.source_schema,
                        source_table: mappingData.source_table,
                        source_columns: mappingData.column_mappings.map(m => m.source_column),
                        target_database: mappingData.target_database,
                        target_schema: mappingData.target_schema,
                        target_table: mappingData.target_table,
                        target_columns: mappingData.column_mappings.map(m => m.target_column),
                    },
                ],
            };

            console.log('Step5: Sending final deployment request to /mapping/deploy_model/', deployRequestBody);
            const deployResponse = await axios.post(
                `${API_BASE_URL}/mapping/deploy_model/`,
                deployRequestBody,
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            if (deployResponse.data.status !== 'success') {
                throw new Error(deployResponse.data.detail || 'Model deployment failed after validation.');
            }

            // --- Deployment Success ---
            toast({
                title: 'Deployment Complete!',
                description: 'Model deployed successfully. Refreshing the page...',
                variant: 'success',
                duration: 2000, // Show for 2 seconds before refresh
            });
            console.log('Step5: Model deployed successfully via /mapping/deploy_model/.');

            console.log('Step5: Wizard event DEPLOY_MODEL logged as SUCCESS.');

            // Refresh the current page to reload project data from scratch
            // This will take the user back to Step 0 and load the updated project status
            setTimeout(() => {
                window.location.reload(); // Hard refresh the page
                // Or if using Next.js App Router only for client-side navigation without full page load:
                // router.refresh(); // This re-fetches data for current route segment
                // router.push('/mapping'); // This navigates back to mapping homepage, then loads data
            }, 2500); // Give time for toast to be seen

        } catch (error: any) {
            console.error('Step5: Deployment process error:', error);
            toast({
                title: 'Deployment Failed',
                description: `Deployment failed: ${error.response?.data?.detail || error.message || 'An unexpected error occurred.'}`,
                variant: 'destructive',
            });

          
            console.error('Step5: Wizard event DEPLOY_MODEL logged as FAILED.');

        } finally {
            setDeploying(false);
        }
    }, [projectId, mappingData, username, toast, router]);

    return (
        <Card className="p-6">
            <CardHeader>
                <CardTitle>Step 5: Review and Deploy</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Review your mappings and additional columns, then initiate the deployment process to the target table.
                </p>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold">Deployment Summary</h3>
                        <p><strong>Source Table:</strong> {mappingData.source_database}.{mappingData.source_schema}.{mappingData.source_table}</p>
                        <p><strong>Target Table:</strong> {mappingData.target_database}.{mappingData.target_schema}.{mappingData.target_table}</p>

                        {deployedMappings.length > 0 && (
                            <>
                                <p><strong>Column Mappings:</strong></p>
                                <ul className="list-disc pl-5">
                                    {deployedMappings.map((mapping, index) => (
                                        <li key={index}>
                                            {mapping.source_column} → {mapping.target_column} ({mapping.data_type})
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {newColumns.length > 0 && (
                            <>
                                <p><strong>Additional Columns:</strong></p>
                                <ul className="list-disc pl-5">
                                    {newColumns.map((col, index) => (
                                        <li key={index}>
                                            {col.name} ({col.type}, {col.nullable ? 'Nullable' : 'Not Nullable'})
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {mappingData.primary_keys && (
                            <>
                                <p><strong>Primary Keys on Target:</strong></p>
                                <ul className="list-disc pl-5">
                                    {mappingData.primary_keys.target.length > 0 ? (
                                        <li>{mappingData.primary_keys.target.join(', ')}</li>
                                    ) : (
                                        <li>None defined for target.</li>
                                    )}
                                </ul>
                            </>
                        )}

                        {mappingData.foreign_keys && (
                            <>
                                <p><strong>Foreign Keys on Target:</strong></p>
                                <ul className="list-disc pl-5">
                                    {mappingData.foreign_keys.target.length > 0 ? (
                                        mappingData.foreign_keys.target.map((fk, index) => (
                                            <li key={`target-fk-${index}`}>
                                                {fk.column} → {fk.referenced_table}.{fk.referenced_column}
                                            </li>
                                        ))
                                    ) : (
                                        <li>None defined for target.</li>
                                    )}
                                </ul>
                            </>
                        )}
                    </div>
                    <div className="flex justify-between gap-2 mt-6">
                        <Button variant="outline" onClick={onBack} disabled={deploying}>
                            Back
                        </Button>
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
                </div>
            </CardContent>
        </Card>
    );
};

export default Step5Deployment;