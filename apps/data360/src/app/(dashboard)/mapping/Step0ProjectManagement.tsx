'use client';

import React, { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';
import { createProject } from './createProject';
import { getProjects } from './getProjects';
import { getProjectLatestEvents } from './getProjectLatestEvents';

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
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectSharedWith, setNewProjectSharedWith] = useState('');
    const [loading, setLoading] = useState(true);
    const [isCreatingProject, setIsCreatingProject] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const baseProjects = await getProjects();
                console.log('Step0: Fetched base projects:', baseProjects);

                if (!baseProjects || baseProjects.length === 0) {
                    setProjects([]);
                    return;
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

                const finalProjects = await Promise.all(enrichedProjectsPromises);
                setProjects(finalProjects);
                console.log('Step0: Enriched projects with final steps:', finalProjects);
            } catch (error: any) {
                console.error("Step0: Error during data fetching:", error);
                toast({
                    title: 'Error',
                    description: `Failed to fetch project data: ${error.message || 'An unexpected error occurred.'}`,
                    variant: 'destructive',
                });
                setProjects([]);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [toast]);

    const handleSelectProject = () => {
        if (!selectedProjectId) {
            toast({ title: 'Selection Required', description: 'Please select an existing project.', variant: 'destructive' });
            return;
        }
        const selectedProject = projects.find(p => p.project_id === selectedProjectId);
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
            toast({ title: 'Project Created', description: `Project "${newProjectName}" created successfully!`, variant: 'success' });

            const newProject: Project = {
                ...(response as Omit<Project, 'last_completed_step'>),
                name: newProjectName.trim(),
                created_by: 'You',
                shared_with: sharedUsers,
                deployment_version: 0,
                last_completed_step: 'CREATE_PROJECT',
            };
            setProjects(prevProjects => [newProject, ...prevProjects]);
            setSelectedProjectId(response.project_id);
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
        <Card className="p-4">
            <CardHeader>
                <CardTitle>Step 0: Project Management</CardTitle>
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
                    <Button onClick={handleCreateProject} disabled={isCreatingProject || !newProjectName.trim()}>
                        {isCreatingProject ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
                            </>
                        ) : (
                            'Create Project'
                        )}
                    </Button>
                </div>
                {projects.length > 0 ? (
                    <div className="space-y-4 border p-4 rounded-lg">
                        <h3 className="text-lg font-semibold">Select Existing Project</h3>
                        <div>
                            <Label htmlFor="existing-project">Existing Project</Label>
                            <Select onValueChange={setSelectedProjectId} value={selectedProjectId || ''}>
                                <SelectTrigger id="existing-project">
                                    <SelectValue placeholder="Select an existing project" />
                                </SelectTrigger>
                                <SelectContent>
                                    {projects.map((project) => (
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
    );
};

export default Step0ProjectManagement;