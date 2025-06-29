'use client';

import axios from 'axios';
import { getSession } from 'next-auth/react';

/**
 * Fetches the list of databases from the API.
 * @param {string}
 * @returns {Promise<string[]>} - A promise that resolves to the list of database names.
 */
export const getSchemas = async (databaseName: string): Promise<string[]> => {
  const session = await getSession();
  if (!session?.user?.access_token) {
      throw new Error('No access token available');
    }
  const token = session.user.access_token;

  const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/schemas/${databaseName}`; // Replace with your actual URL endpoint

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    
    // Extracting the database names from the response data
    const schemas = response.data.schemas.map((schema: { name: string }) => schema.name);

    return schemas; // Return the list of database names
  } catch (error) {
    console.error('Error fetching databases:', error);
    throw error; // Rethrow the error to be handled by the caller
  }
};
