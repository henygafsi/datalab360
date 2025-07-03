// src/app/services/user/getAllUsers.ts
import axios from "axios";
import { getSession } from "next-auth/react";

interface User {
    idUser: string;
    username: string;
    email: string;
    role: string;
}

interface GetAllUsersResponse {
    users: User[];
    message: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Fetches all registered users from the backend.
 * This is used to populate the "Share With" multi-select dropdown.
 * @returns A list of user objects.
 */
export const getAllUsers = async (): Promise<User[]> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    try {
        // Assuming a new endpoint like /users/all exists in your backend
        // You might need to create this endpoint if it doesn't exist.
        const response = await axios.get<GetAllUsersResponse>(
            `${API_BASE_URL}/users/all`, // Adjust this endpoint if different
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            }
        );
        return response.data.users;
    } catch (error) {
        console.error("Error fetching all users:", error);
        if (axios.isAxiosError(error) && error.response) {
            throw new Error(error.response.data.detail || 'Failed to fetch users.');
        }
        throw error;
    }
};
