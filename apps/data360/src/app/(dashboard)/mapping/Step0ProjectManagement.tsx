'use client';

import React, { useState, useCallback } from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw } from 'lucide-react';
import { createProject } from './createProject';
import { getProjects } from './getProjects';
import { getProjectLatestEvents } from './getProjectLatestEvents';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useCanPerform } from '@/hooks/useCanPerform';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

interface Project {
    project_id: string;
    name: string;
    created_by: string;
    shared_with: string[];
    deployment_version: number;
    step_name?: string | null;
    last_completed_step: string | null;
}

interface Step0Props {
    onProjectSelected: (projectId: string, lastCompletedStep: string | null) => void;
}

const Step0ProjectManagement: React.FC<Step0Props> = ({ onProjectSelected }) => {
    const { toast } = useToast();
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectSharedWith, setNewProjectSharedWith] = useState('');
    const [isCreatingProject, setIsCreatingProject] = useState(false);

    // Action-RBAC: creating a mapping project mutates state — gate on mapping:create
    // (fail-open while the allow-set loads).
    const createPerm = useCanPerform('mapping', 'create');
    const canCreate = createPerm.allowed || createPerm.loading;

    // Fetch and enrich projects with latest events
    const fetchData = useCallback(async (): Promise<Project[]> => {
        const baseProjects = await getProjects();

        if (!baseProjects || baseProjects.length === 0) {
            return [];
        }

        const enrichedProjectsPromises = baseProjects.map(async (project) => {
            const events = await getProjectLatestEvents(project.project_id);
            const lastEvent = events.length > 0 ? events[events.length - 1] : null;
            const finalStep = lastEvent ? lastEvent.event_type : (project.step_name || 'None');
            return {
                ...project,
                last_completed_step: finalStep,
            };
        });

        return Promise.all(enrichedProjectsPromises);
    }, []);

    const { data: projects, loading, isStale, refetch } = useCacheAwareQuery<Project[]>(
        fetchData,
        { cacheKeys: [CACHE_KEYS.PROJECTS], initialData: [] }
    );

    const handleSelectProject = () => {
        if (!selectedProjectId) {
            toast({ title: 'Selection Required', description: 'Please select an existing project.', variant: 'destructive' });
            return;
        }
        const selectedProject = (projects ?? []).find(p => p.project_id === selectedProjectId);
        if (selectedProject) {
            onProjectSelected(selectedProject.project_id, selectedProject.last_completed_step);
        } else {
            toast({ title: 'Error', description: 'Selected project not found.', variant: 'destructive' });
        }
    };

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) {
            toast({ title: 'Validation Error', description: 'Project name cannot be empty.', variant: 'destructive' });
            return;
        }

        setIsCreatingProject(true);
        const sharedUsers = newProjectSharedWith.split(',').map(email => email.trim()).filter(email => email);
        const payload = { name: newProjectName.trim(), shared_with: sharedUsers };

        try {
            const response = await createProject(payload);
            toast({ title: 'Project Created', description: `Project "${newProjectName}" created` });

            setSelectedProjectId(response.project_id);
            refetch();
            onProjectSelected(response.project_id, null);
        } catch (error: any) {
            console.error("Step0: Error creating project:", error);
            toast({ title: 'Error', description: `Failed to create project: ${error.message || 'An unexpected error occurred.'}`, variant: 'destructive' });
        } finally {
            setIsCreatingProject(false);
        }
    };

    if (loading) {
        return (
            <Card className="p-4">
                <CardHeader><CardTitle>Loading Projects...</CardTitle></CardHeader>
                <CardContent className="flex items-center">
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Fetching available projects...
                </CardContent>
            </Card>
        );
    }

    return (
        <ErrorBoundary>
        {!createPerm.allowed && !createPerm.loading && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300">
                View-only access — you lack the &apos;create&apos; permission on Mapping. Ask an administrator to grant it.
            </div>
        )}
        <Card className="p-4">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Step 0: Project Management</CardTitle>
                    {isStale && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span>Syncing...</span>
                        </div>
                    )}
                </div>
                <p className="text-sm text-muted-foreground">
                    Create a new mapping project or select an existing one to continue your work.
                </p>
            </CardHeader>
            <CardContent className="space-y-8">
                <div className="space-y-4 border p-4 rounded-lg">
                    <h3 className="text-lg font-semibold">Create New Project</h3>
                    <div>
                        <Label htmlFor="new-project-name">Project Name</Label>
                        <Input
                            id="new-project-name"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="e.g., Retail Data Mart Mapping"
                            disabled={isCreatingProject}
                        />
                    </div>
                    <div>
                        <Label htmlFor="new-project-shared-with">Share With (comma-separated emails, optional)</Label>
                        <Input
                            id="new-project-shared-with"
                            value={newProjectSharedWith}
                            onChange={(e) => setNewProjectSharedWith(e.target.value)}
                            placeholder="user1@example.com, user2@example.com"
                            disabled={isCreatingProject}
                        />
                    </div>
                    <Button
                        onClick={handleCreateProject}
                        disabled={!canCreate || isCreatingProject || !newProjectName.trim()}
                        title={!canCreate ? "You lack the 'create' permission on Mapping. Ask an administrator to grant it." : undefined}
                    >
                        {isCreatingProject ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
                            </>
                        ) : (
                            'Create Project'
                        )}
                    </Button>
                </div>
                {(projects ?? []).length > 0 ? (
                    <div className="space-y-4 border p-4 rounded-lg">
                        <h3 className="text-lg font-semibold">Select Existing Project</h3>
                        <div>
                            <Label htmlFor="existing-project">Existing Project</Label>
                            <Select onValueChange={setSelectedProjectId} value={selectedProjectId || ''}>
                                <SelectTrigger id="existing-project">
                                    <SelectValue placeholder="Select an existing project" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(projects ?? []).map((project) => (
                                        <SelectItem key={project.project_id} value={project.project_id}>
                                            {project.name} (Created by: {project.created_by}) - Last Step: {project.last_completed_step || 'None'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleSelectProject} disabled={!selectedProjectId}>
                            Continue to Project
                        </Button>
                    </div>
                ) : (
                    <p className="text-center text-muted-foreground">No existing projects found. Please create a new one.</p>
                )}
            </CardContent>
        </Card>
        </ErrorBoundary>
    );
};

export default Step0ProjectManagement;