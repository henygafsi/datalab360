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

// Import new services
import { createProject } from './createProject';
import { getProjects } from './getProjects';
// No direct logWizardEvent import needed here, parent handles it
// Removed: import { getAllUsers } from '@/app/services/user/getAllUsers';
// Removed: import { MultiSelect } from '@/components/ui/multi-select';

interface Project {
    project_id: string;
    name: string;
    created_by: string;
    shared_with: string[];
    deployment_version: number;
    last_completed_step: string | null;
}

interface Step0Props {
    onProjectSelected: (projectId: string, lastCompletedStep: string | null) => void;
}

const Step0ProjectManagement: React.FC<Step0Props> = ({ onProjectSelected }) => {
    const { toast } = useToast();
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [newProjectName, setNewProjectName] = useState<string>('');
    const [newProjectSharedWith, setNewProjectSharedWith] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [isCreatingProject, setIsCreatingProject] = useState(false);

    useEffect(() => {
        console.log('Step0: Component mounted. Fetching initial projects...');
        const fetchData = async () => {
            setLoading(true);
            try {
                const fetchedProjects = await getProjects();
                setProjects(fetchedProjects);
                console.log('Step0: Fetched projects:', fetchedProjects);
            } catch (error: any) {
                console.error("Step0: Error fetching data:", error);
                toast({
                    title: 'Error',
                    description: `Failed to fetch data: ${error.message || 'An unexpected error occurred.'}`,
                    variant: 'destructive',
                });
            } finally {
                setLoading(false);
                console.log('Step0: Finished fetching projects. Loading state:', false);
            }
        };
        fetchData();
    }, [toast]);

    const handleCreateProject = async () => {
        console.log('Step0: Attempting to create new project.');
        if (!newProjectName.trim()) {
            toast({
                title: 'Validation Error',
                description: 'Project name cannot be empty.',
                variant: 'destructive',
            });
            console.warn('Step0: Project name is empty.');
            return;
        }

        setIsCreatingProject(true);
        const sharedUsers = newProjectSharedWith.split(',').map(email => email.trim()).filter(email => email);
        const payload = { name: newProjectName.trim(), shared_with: sharedUsers };
        console.log('Step0: Create project payload:', payload);

        try {
            const response = await createProject(payload);
            console.log('Step0: Create project response:', response);

            toast({
                title: 'Project Created',
                description: `Project "${newProjectName}" created successfully!`,
                variant: 'success',
            });

            const updatedProjects = await getProjects();
            setProjects(updatedProjects);
            setSelectedProjectId(response.project_id);
            onProjectSelected(response.project_id, null); // New projects start from step 1
            console.log('Step0: New project created and selected:', response.project_id);
        } catch (error: any) {
            console.error("Step0: Error creating project:", error);
            toast({
                title: 'Error',
                description: `Failed to create project: ${error.message || 'An unexpected error occurred.'}`,
                variant: 'destructive',
            });
        } finally {
            setIsCreatingProject(false);
            console.log('Step0: Finished creating project. Creating state:', false);
        }
    };

    const handleSelectProject = () => {
        console.log('Step0: Attempting to select existing project.');
        if (!selectedProjectId) {
            toast({
                title: 'Selection Required',
                description: 'Please select an existing project.',
                variant: 'destructive',
            });
            console.warn('Step0: No project selected for continuation.');
            return;
        }
        const selectedProject = projects.find(p => p.project_id === selectedProjectId);
        if (selectedProject) {
            onProjectSelected(selectedProject.project_id, selectedProject.last_completed_step);
            console.log('Step0: Selected existing project:', selectedProject.project_id, 'Last completed step:', selectedProject.last_completed_step);
        } else {
            toast({
                title: 'Error',
                description: 'Selected project not found.',
                variant: 'destructive',
            });
            console.error('Step0: Selected project not found in state:', selectedProjectId);
        }
    };

    if (loading) {
        return (
            <Card className="p-4">
                <CardHeader><CardTitle>Loading Projects...</CardTitle></CardHeader>
                <CardContent>
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Fetching available projects.
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
                {/* Create New Project Section */}
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

                {/* Select Existing Project Section */}
                {projects.length > 0 && (
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
                )}
                {projects.length === 0 && !loading && (
                    <p className="text-center text-muted-foreground">No existing projects found. Please create a new one.</p>
                )}
            </CardContent>
        </Card>
    );
};

export default Step0ProjectManagement;