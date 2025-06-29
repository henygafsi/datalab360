import axios from 'axios';
import { getSession } from 'next-auth/react';

/**
 * Fetches the list of databases from the API.
 * @returns {Promise<string[]>} - A promise that resolves to the list of database names.
 */
export const getDatabases = async (): Promise<string[]> => {
  const session = await getSession();
  if (!session?.user?.access_token) {
    throw new Error('No access token available');
  }
  const token = session.user.access_token;

  const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/databases`; // Replace with your actual URL endpoint
  console.log('Fetching databases with token:', token);

  
  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    // Extracting the database names from the response data
    const databases = response.data.databases.map((db: { name: string }) => db.name);

    return databases; // Return the list of database names
  } catch (error) {
    console.error('Error fetching databases:', error);
    throw error; // Rethrow the error to be handled by the caller
  }
};
