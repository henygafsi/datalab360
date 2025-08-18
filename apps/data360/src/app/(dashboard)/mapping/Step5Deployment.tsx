'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';
import { getSession } from 'next-auth/react';
import { manageTableStructure } from './addConstraints';

// --- Interface Definitions ---
interface ForeignKey {
    column: string;
    referenced_table: string;
    referenced_column: string;
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
        source_table_key?: string;
    }>;
    new_target_columns: Array<{
        name: string;
        type: string;
        nullable: boolean;
    }>;
    primary_keys?: {
        source: { [tableKey: string]: string[] }; // Updated to match parent
        target: string[];
    };
    foreign_keys?: {
        source: ForeignKey[];
        target: ForeignKey[];
    };
}

interface Step5Props {
    onBack: () => void;
    mappingData: MappingData;
    projectId: string;
    username: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://www.api.datalab360.io:8443';

const Step5Deployment: React.FC<Step5Props> = ({ onBack, mappingData, projectId, username }) => {
    const router = useRouter();
    const { toast } = useToast();
    const [deploying, setDeploying] = useState(false);
    const deployedMappings = mappingData?.column_mappings || [];
    const newColumns = mappingData?.new_target_columns || [];

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

        try {
            const session = await getSession();
            if (!session?.user?.access_token) {
                throw new Error('No access token available. Please log in again.');
            }
            const token = session.user.access_token;

            const pk_source = mappingData.primary_keys?.source
                ? Object.values(mappingData.primary_keys.source).flat()
                : [];
            const pk_target = mappingData.primary_keys?.target || [];

            const mappingsForPayload = [
                {
                    source_database: mappingData.source_database,
                    source_schema: mappingData.source_schema,
                    source_table: mappingData.source_table,
                    source_columns: mappingData.column_mappings.map((m) => m.source_column),
                    pk_source: pk_source,
                    target_database: mappingData.target_database,
                    target_schema: mappingData.target_schema,
                    target_table: mappingData.target_table,
                    target_columns: mappingData.column_mappings.map((m) => m.target_column),
                    pk_target: pk_target,
                },
            ];

            console.log('Step5: Sending mapping validation request to /mapping/test_mapping/', mappingsForPayload);
            const validationResponse = await axios.post(
                `${API_BASE_URL}/mapping/test_mapping/`,
                { project_id: projectId, mappings: mappingsForPayload },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            if (validationResponse.data.status !== 'success') {
                throw new Error(validationResponse.data.detail || 'Mapping validation failed.');
            }

            toast({
                title: 'Validation Success',
                description: 'Column mappings are valid. Applying constraints and deploying.',
                variant: 'success',
            });
            console.log('Step5: Mapping validation successful.');

            // --- FIXED: Restored Constraint Application Logic ---
            const constraintPromises = [];
            const targetTableKey = `"${mappingData.target_database}"."${mappingData.target_schema}"."${mappingData.target_table}"`;

            if (mappingData.primary_keys?.target?.length) {
                // Assuming the API takes all PK columns at once for a given table
                console.log(`Step5: Adding PK constraint for ${mappingData.primary_keys.target.join(', ')} on ${targetTableKey}`);
                constraintPromises.push(
                    manageTableStructure({
                        SOURCE_TABLE: targetTableKey,
                        COLUMN_NAME: mappingData.primary_keys.target.join(', '), // Join for single call if API supports it
                        CONSTRAINT_TYPE: 'ADD_PK',
                    }, token)
                );
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
                        }, token)
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
                    throw new Error(`One or more constraint applications failed: ${errors.map((e) => e.message).join(', ')}`);
                }
                toast({
                    title: 'Constraints Applied',
                    description: 'Primary and/or Foreign Key constraints were applied successfully.',
                    variant: 'success',
                });
            }
            // --- End of Restored Logic ---

            const deployRequestBody = {
                project_id: projectId,
                mappings: mappingsForPayload,
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
            
            toast({
                title: 'Deployment Complete!',
                description: 'Model deployed successfully. Refreshing...',
                variant: 'success',
                duration: 2000,
            });
            
            setTimeout(() => {
                window.location.reload();
            }, 2500);

        } catch (error: any) {
            console.error('Step5: Deployment process error:', error);
            toast({
                title: 'Deployment Failed',
                description: `Deployment failed: ${error.response?.data?.detail || error.message || 'An unexpected error occurred.'}`,
                variant: 'destructive',
            });
        } finally {
            setDeploying(false);
        }
    }, [projectId, mappingData, username, toast, router]);

    return (
        <Card className="p-6">
            <CardHeader>
                <CardTitle>Step 5: Review and Deploy</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Review your mappings and additional columns, then initiate the deployment process.
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
                                <p className="mt-2"><strong>Column Mappings:</strong></p>
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
                                <p className="mt-2"><strong>Additional Columns:</strong></p>
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
                                <p className="mt-2"><strong>Primary Keys on Target:</strong></p>
                                <ul className="list-disc pl-5">
                                    {mappingData.primary_keys.target.length > 0 ? (
                                        <li>{mappingData.primary_keys.target.join(', ')}</li>
                                    ) : (
                                        <li>None defined for target.</li>
                                    )}
                                </ul>
                            </>
                        )}
                         {mappingData.foreign_keys && mappingData.foreign_keys.target.length > 0 && (
                            <>
                                <p className="mt-2"><strong>Foreign Keys on Target:</strong></p>
                                <ul className="list-disc pl-5">
                                    {mappingData.foreign_keys.target.map((fk, index) => (
                                        <li key={`target-fk-${index}`}>
                                            {fk.column} → {fk.referenced_table}.{fk.referenced_column}
                                        </li>
                                    ))}
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
