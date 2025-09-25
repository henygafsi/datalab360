'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';
import { getSession } from 'next-auth/react';

interface TableSelection {
    database: string;
    schema: string;
    table: string;
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
        target_table_key?: string;
    }>;
    new_target_columns: Array<{
        name: string;
        type: string;
        nullable: boolean;
    }>;
    primary_keys?: {
        source: { [tableKey: string]: string[] };
        target: string[];
    };
    groups?: Array<{ sources: TableSelection[]; target: TableSelection | null }>;
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

    type MappingPayload = {
        source_database: string;
        source_schema: string;
        source_table: string;
        source_columns: string[];
        pk_source: string[];
        target_database: string;
        target_schema: string;
        target_table: string;
        target_columns: string[];
        pk_target: string[];
    };

    const buildMappings = useCallback((): MappingPayload[] => {
        const groups = (mappingData.groups && mappingData.groups.length > 0)
            ? mappingData.groups
            : [{
                sources: [{ database: mappingData.source_database, schema: mappingData.source_schema, table: mappingData.source_table }],
                target: { database: mappingData.target_database, schema: mappingData.target_schema, table: mappingData.target_table }
            }];

        const mappings: MappingPayload[] = [];
        const pkSourceMap = mappingData.primary_keys?.source || {};

        groups.forEach(g => {
            if (!g.target) return;
            const tgtKey = `${g.target.database}.${g.target.schema}.${g.target.table}`;
            const targetPkList = mappingData.primary_keys?.source?.[tgtKey] || mappingData.primary_keys?.target || [];
            
            (g.sources || []).forEach(src => {
                const srcKey = `${src.database}.${src.schema}.${src.table}`;
                const sourcePkList = pkSourceMap[srcKey] || [];
                
                // Relevant mappings for this pair
                const relevant = (mappingData.column_mappings || []).filter((m: any) => {
                    const matchSource = (m.source_table_key || srcKey) === srcKey;
                    const matchTarget = m.target_table_key ? m.target_table_key === tgtKey : true;
                    return matchSource && matchTarget;
                });
                
                mappings.push({
                    source_database: src.database,
                    source_schema: src.schema,
                    source_table: src.table,
                    source_columns: relevant.map(m => m.source_column),
                    pk_source: sourcePkList,
                    target_database: g.target!.database,
                    target_schema: g.target!.schema,
                    target_table: g.target!.table,
                    target_columns: relevant.map(m => m.target_column),
                    pk_target: targetPkList,
                });
            });
        });
        return mappings;
    }, [mappingData]);


    const handleDeploy = useCallback(async () => {
        if (!projectId || !mappingData) {
            toast({
                title: 'Error',
                description: 'Missing project ID or mapping data.',
                variant: 'destructive',
            });
            return;
        }

        setDeploying(true);

        if ((mappingData.column_mappings || []).length === 0) {
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

            const mappingsForPayload = buildMappings();

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
                description: 'Column mappings are valid. Proceeding with deployment.',
                variant: 'success',
            });
            console.log('Step5: Mapping validation successful.');

            // PK constraints should already be applied during table setup, not during deployment
            // Deployment only handles the mapping logic, not table structure modifications

            const deployRequestBody = { project_id: projectId, mappings: mappingsForPayload };

            console.log('Step5: Sending final deployment request to /mapping/deploy_model/', deployRequestBody);
            const deployResponse = await axios.post(
                `${API_BASE_URL}/mapping/deploy_model/`,
                { project_id: projectId, mappings: mappingsForPayload },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            if (deployResponse.data.status !== 'success') {
                throw new Error(deployResponse.data.detail || 'Model deployment failed after validation.');
            }
            
            // Show success popup alert
            alert('🎉 Deployment Successful!\n\nYour mapping has been deployed successfully. The system will now refresh to show the updated data.');
            
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
    }, [projectId, mappingData, toast, buildMappings]);

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
                        
                        {/* Show all groups if they exist, otherwise show single mapping */}
                        {mappingData.groups && mappingData.groups.length > 0 ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-muted-foreground">Multiple table groups configured:</p>
                                    <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                        {mappingData.groups.length} group(s) • {deployedMappings.length} total mappings
                                    </div>
                                </div>
                                {mappingData.groups.map((group, groupIndex) => (
                                    <div key={groupIndex} className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-800">
                                        <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                                            Group {groupIndex + 1}
                                        </h4>
                                        
                                        {/* Source Tables */}
                                        <div className="mb-3">
                                            <p className="font-medium text-sm">Source Tables:</p>
                                            {group.sources.map((source, sourceIndex) => (
                                                <p key={sourceIndex} className="text-sm ml-2">
                                                    {source.database}.{source.schema}.{source.table}
                                                </p>
                                            ))}
                                        </div>
                                        
                                        {/* Target Table */}
                                        <div className="mb-3">
                                            <p className="font-medium text-sm">Target Table:</p>
                                            <p className="text-sm ml-2">
                                                {group.target?.database}.{group.target?.schema}.{group.target?.table}
                                            </p>
                                        </div>
                                        
                                        {/* Primary Keys for this group */}
                                        {(() => {
                                            const targetKey = `${group.target?.database}.${group.target?.schema}.${group.target?.table}`;
                                            const groupTargetPks = mappingData.primary_keys?.source?.[targetKey] || mappingData.primary_keys?.target || [];
                                            
                                            const sourcePkEntries = group.sources.map(source => {
                                                const sourceKey = `${source.database}.${source.schema}.${source.table}`;
                                                const sourcePks = mappingData.primary_keys?.source?.[sourceKey] || [];
                                                return { source, sourcePks };
                                            }).filter(entry => entry.sourcePks.length > 0);
                                            
                                            return (sourcePkEntries.length > 0 || groupTargetPks.length > 0) && (
                                                <div className="mb-3">
                                                    <p className="font-medium text-sm">Primary Keys:</p>
                                                    {sourcePkEntries.map((entry, index) => (
                                                        <p key={index} className="text-sm ml-2">
                                                            <span className="text-blue-600">Source ({entry.source.table}):</span> {entry.sourcePks.join(', ')}
                                                        </p>
                                                    ))}
                                                    {groupTargetPks.length > 0 && (
                                                        <p className="text-sm ml-2">
                                                            <span className="text-green-600">Target ({group.target?.table}):</span> {groupTargetPks.join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        
                                        {/* Column Mappings for this group */}
                                        {(() => {
                                            const groupMappings = deployedMappings.filter(mapping => {
                                                // Check if mapping belongs to this group by matching source tables
                                                const sourceKey = mapping.source_table_key || '';
                                                const targetKey = `${group.target?.database}.${group.target?.schema}.${group.target?.table}`;
                                                
                                                // Match by source table key or target table key
                                                const matchesSource = group.sources.some(source => 
                                                    sourceKey.includes(`${source.database}.${source.schema}.${source.table}`)
                                                );
                                                const matchesTarget = mapping.target_table_key === targetKey;
                                                
                                                return matchesSource || matchesTarget;
                                            });
                                            
                                            return groupMappings.length > 0 && (
                                                <div className="mb-3">
                                                    <p className="font-medium text-sm">Column Mappings ({groupMappings.length}):</p>
                                                    <ul className="list-disc pl-5 text-sm max-h-32 overflow-y-auto">
                                                        {groupMappings.map((mapping, index) => (
                                                            <li key={index}>
                                                                {mapping.source_column} → {mapping.target_column} ({mapping.data_type})
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div>
                                <p><strong>Source Table:</strong> {mappingData.source_database}.{mappingData.source_schema}.{mappingData.source_table}</p>
                                <p><strong>Target Table:</strong> {mappingData.target_database}.{mappingData.target_schema}.{mappingData.target_table}</p>
                            </div>
                        )}

                        {/* Show all column mappings if no groups */}
                        {(!mappingData.groups || mappingData.groups.length === 0) && deployedMappings.length > 0 && (
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
                    </div>
                    <div className="flex justify-between gap-2 mt-6">
                        <Button variant="outline" onClick={onBack} disabled={deploying}>Back</Button>
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
