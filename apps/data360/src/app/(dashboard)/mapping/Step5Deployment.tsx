'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle, AlertCircle, Calendar } from 'lucide-react';
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
    const [testing, setTesting] = useState(false);
    const [scheduling, setScheduling] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [scheduledDate, setScheduledDate] = useState('');
    const [scheduledTime, setScheduledTime] = useState('');
    const [deploymentMethod, setDeploymentMethod] = useState('');
    const [scheduleError, setScheduleError] = useState<string | null>(null);

    const deployedMappings = mappingData?.column_mappings || [];
    const newColumns = mappingData?.new_target_columns || [];

    // Deployment method options
    const deploymentMethodOptions = useMemo(() => ([
        { label: 'Select Deployment Method...', value: '' },
        { label: 'Replace Existing', value: 'REPLACE_EXISTING' },
        { label: 'New Release', value: 'NEW_RELEASE' },
        { label: 'Test', value: 'TEST' },
    ]), []);

    // Get minimum date (today)
    const minDate = useMemo(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }, []);

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

    // Test Mapping function
    const handleTestMapping = useCallback(async () => {
        if (!projectId || !mappingData) {
            toast({
                title: 'Error',
                description: 'Missing project ID or mapping data.',
                variant: 'destructive',
            });
            return;
        }

        if ((mappingData.column_mappings || []).length === 0) {
            toast({
                title: 'Error',
                description: 'Please define at least one column mapping before testing.',
                variant: 'destructive',
            });
            return;
        }

        setTesting(true);
        setTestStatus('idle');
        setTestMessage('');

        try {
            const session = await getSession();
            if (!session?.user?.access_token) {
                throw new Error('No access token available. Please log in again.');
            }
            const token = session.user.access_token;

            const mappingsForPayload = buildMappings();

            console.log('Step5: Testing mapping with /mapping/test_mapping/', mappingsForPayload);
            const response = await axios.post(
                `${API_BASE_URL}/mapping/test_mapping/`,
                { project_id: projectId, mappings: mappingsForPayload },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            if (response.data.status === 'success') {
                setTestStatus('success');
                setTestMessage('All column mappings are valid! Ready to schedule deployment.');
                toast({
                    title: '✅ Test Successful',
                    description: 'Mapping validation passed. You can now schedule the deployment.',
                    variant: 'default',
                });
            } else {
                throw new Error(response.data.detail || 'Test failed');
            }

        } catch (error: any) {
            console.error('Step5: Test mapping error:', error);
            setTestStatus('error');

            // Properly handle different error response formats
            let errorMsg = 'Test failed';
            if (error.response?.data?.detail) {
                errorMsg = typeof error.response.data.detail === 'string'
                    ? error.response.data.detail
                    : JSON.stringify(error.response.data.detail);
            } else if (error.response?.data?.errors) {
                const errors = error.response.data.errors;
                if (Array.isArray(errors)) {
                    errorMsg = errors.join(', ');
                } else if (typeof errors === 'object') {
                    errorMsg = Object.entries(errors)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ');
                } else {
                    errorMsg = String(errors);
                }
            } else if (error.message) {
                errorMsg = error.message;
            }

            setTestMessage(errorMsg);
            toast({
                title: '❌ Test Failed',
                description: errorMsg,
                variant: 'destructive',
                duration: 10000,
            });
        } finally {
            setTesting(false);
        }
    }, [projectId, mappingData, toast, buildMappings]);

    // Schedule Deployment function
    const handleScheduleDeployment = useCallback(async () => {
        if (!scheduledDate || !scheduledTime) {
            toast({
                title: 'Date & Time Required',
                description: 'Please select a deployment date and time.',
                variant: 'destructive',
            });
            return;
        }

        if (!deploymentMethod) {
            toast({
                title: 'Deployment Method Required',
                description: 'Please select a deployment method (Replace Existing, New Release, or Test).',
                variant: 'destructive',
            });
            return;
        }

        if (testStatus !== 'success') {
            toast({
                title: 'Test Required',
                description: 'Please test the mapping first before scheduling deployment.',
                variant: 'destructive',
            });
            return;
        }

        setScheduling(true);
        setScheduleError(null);

        try {
            const session = await getSession();
            if (!session?.user?.access_token) {
                throw new Error('No access token available.');
            }
            const token = session.user.access_token;

            const mappingsForPayload = buildMappings();

            // Combine date and time into ISO format
            const scheduledDateTime = `${scheduledDate}T${scheduledTime}:00`;

            // Schedule the deployment with nested mappings structure
            const scheduleData = {
                workflow_name: `mapping_deployment_${projectId}`,
                scheduled_date: scheduledDateTime,
                deployment_method: deploymentMethod,
                project_id: projectId,
                mappings: [{
                    project_id: projectId,
                    mappings: mappingsForPayload
                }],
                created_by: username,
                status: 'PENDING_APPROVAL'
            };

            console.log('Step5: Scheduling deployment:', scheduleData);
            const response = await axios.post(
                `${API_BASE_URL}/mapping/schedule_deployment/`,
                scheduleData,
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            toast({
                title: '🎉 Deployment Scheduled!',
                description: `Mapping deployment has been scheduled for ${new Date(scheduledDateTime).toLocaleString()}. It will be available in your account overview for modeler approval and activation.`,
                variant: 'default',
                duration: 5000,
            });

            setTimeout(() => {
                router.push('/account-overview');
            }, 2000);

        } catch (error: any) {
            console.error('Step5: Schedule deployment error:', error);

            // Extract detailed error message
            let errorMsg = 'Failed to schedule deployment';
            if (error.response?.status === 500) {
                errorMsg = `Backend Error (500): The schedule_deployment endpoint is not yet implemented on the backend. `;
                if (error.response?.data?.detail) {
                    errorMsg += typeof error.response.data.detail === 'string'
                        ? error.response.data.detail
                        : JSON.stringify(error.response.data.detail);
                }
            } else if (error.response?.data?.detail) {
                errorMsg = typeof error.response.data.detail === 'string'
                    ? error.response.data.detail
                    : JSON.stringify(error.response.data.detail);
            } else if (error.message) {
                errorMsg = error.message;
            }

            setScheduleError(errorMsg);

            toast({
                title: 'Scheduling Failed',
                description: errorMsg,
                variant: 'destructive',
                duration: 10000,
            });
        } finally {
            setScheduling(false);
        }
    }, [scheduledDate, scheduledTime, deploymentMethod, testStatus, projectId, username, toast, buildMappings, router]);

    return (
        <Card className="p-6">
            <CardHeader>
                <CardTitle>Step 5: Test & Schedule Deployment</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Test your mappings for validation, then schedule the deployment for modeler activation.
                </p>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {/* Test Status Display */}
                    {testStatus !== 'idle' && (
                        <div className={`p-4 rounded-lg border-2 ${
                            testStatus === 'success'
                                ? 'bg-green-50 dark:bg-green-950/20 border-green-500'
                                : 'bg-red-50 dark:bg-red-950/20 border-red-500'
                        }`}>
                            <div className="flex items-start space-x-3">
                                {testStatus === 'success' ? (
                                    <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                                ) : (
                                    <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1">
                                    <p className={`font-semibold ${
                                        testStatus === 'success' ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'
                                    }`}>
                                        {testStatus === 'success' ? 'Validation Successful' : 'Validation Failed'}
                                    </p>
                                    <p className={`text-sm mt-1 ${
                                        testStatus === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                                    }`}>
                                        {testMessage}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Deployment Summary */}
                    <div>
                        <h3 className="text-lg font-semibold mb-3">Mapping Summary</h3>

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

                                        <div className="mb-2">
                                            <p className="font-medium text-sm">Source → Target:</p>
                                            <p className="text-sm ml-2">
                                                {group.sources.map(s => `${s.database}.${s.schema}.${s.table}`).join(', ')}
                                                → {group.target?.database}.{group.target?.schema}.{group.target?.table}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-800">
                                <p className="text-sm"><strong>Source:</strong> {mappingData.source_database}.{mappingData.source_schema}.{mappingData.source_table}</p>
                                <p className="text-sm"><strong>Target:</strong> {mappingData.target_database}.{mappingData.target_schema}.{mappingData.target_table}</p>
                                <p className="text-sm mt-2"><strong>Mappings:</strong> {deployedMappings.length} columns</p>
                            </div>
                        )}
                    </div>

                    {/* Schedule Selection */}
                    {testStatus === 'success' && (
                        <div className="border-t pt-4 space-y-4">
                            <div className="flex items-center space-x-2 mb-3">
                                <Calendar className="w-5 h-5 text-blue-600" />
                                <h3 className="text-lg font-semibold">Schedule Deployment</h3>
                            </div>

                            {/* Date and Time Pickers */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Deployment Date
                                    </label>
                                    <input
                                        type="date"
                                        value={scheduledDate}
                                        onChange={(e) => setScheduledDate(e.target.value)}
                                        min={minDate}
                                        className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        disabled={scheduling}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Deployment Time
                                    </label>
                                    <input
                                        type="time"
                                        value={scheduledTime}
                                        onChange={(e) => setScheduledTime(e.target.value)}
                                        className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        disabled={scheduling}
                                    />
                                </div>
                            </div>

                            {/* Deployment Method */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Deployment Method
                                </label>
                                <select
                                    value={deploymentMethod}
                                    onChange={(e) => setDeploymentMethod(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    disabled={scheduling}
                                >
                                    {deploymentMethodOptions.map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                                    <p><strong>Replace Existing:</strong> Overwrites the current production model</p>
                                    <p><strong>New Release:</strong> Creates a new version alongside existing model</p>
                                    <p><strong>Test:</strong> Deploys to test environment for validation</p>
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <strong>Note:</strong> Deployment will be scheduled and sent to Account Overview where a modeler must approve and activate it before execution.
                            </p>
                        </div>
                    )}

                    {/* Schedule Error Display */}
                    {scheduleError && (
                        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <h4 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-2">
                                        Schedule Deployment Failed
                                    </h4>
                                    <p className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap">
                                        {scheduleError}
                                    </p>
                                    <p className="text-xs text-red-600 dark:text-red-500 mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                                        <strong>Action Required:</strong> Please ensure the backend endpoint <code className="px-1 py-0.5 bg-red-100 dark:bg-red-950 rounded">/mapping/schedule_deployment/</code> is implemented and accessible.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-between gap-2 mt-6 pt-4 border-t">
                        <Button variant="outline" onClick={onBack} disabled={testing || scheduling}>
                            Back
                        </Button>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleTestMapping}
                                disabled={testing || scheduling}
                                variant="outline"
                                className="border-blue-500 text-blue-600 hover:bg-blue-50"
                            >
                                {testing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Testing...
                                    </>
                                ) : (
                                    <>
                                        <AlertCircle className="mr-2 h-4 w-4" />
                                        Test Mapping
                                    </>
                                )}
                            </Button>
                            <Button
                                onClick={handleScheduleDeployment}
                                disabled={testStatus !== 'success' || scheduling || !scheduledDate || !scheduledTime || !deploymentMethod}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {scheduling ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Scheduling...
                                    </>
                                ) : (
                                    <>
                                        <Calendar className="mr-2 h-4 w-4" />
                                        Schedule Deployment
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step5Deployment;
