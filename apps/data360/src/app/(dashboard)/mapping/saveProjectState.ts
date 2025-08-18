// saveProjectState.ts
import axios from 'axios';
import { getSession } from 'next-auth/react';

export const saveProjectState = async (projectId: string | null, mappingData: any, currentStep: number): Promise<void> => {
    if (!projectId) return;

    try {
        const session = await getSession();
        const accessToken = session?.user?.access_token;

        if (!accessToken) {
            throw new Error('User is not authenticated: Access token not found in session.');
        }

        await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/mapping/save-state/`,
            { project_id: projectId, step: currentStep, state: mappingData },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );
    } catch (error) {
        console.error(`Failed to save project state for ${projectId}:`, error);
        throw error;
    }
};