import axios from 'axios';
import { getSession } from 'next-auth/react';
import { headers } from 'next/headers';



const getAccessTokenFromSession = async (): Promise<string> => {
  const session = await getSession();
  if (!session || !session.user || !session.user.access_token) {
    throw new Error('No access token available in session. Please log in.');
  }
  return session.user.access_token;
};


export const getRoles = async (): Promise<{ role_name: string; modules: string[] }[]> => {
  const accessToken = await getAccessTokenFromSession();

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gouvernance/grants`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`, // AUTH TOKEN PASSED HERE
      },
      cache: 'no-store', // Ensure fresh data
    });
    const data = await response.json();
    return data as { role_name: string; modules: string[] }[];
};


export async function updateGrants(role_name: string, modules: string[]) {
  const accessToken = await getAccessTokenFromSession();

  return axios.put(
    `${process.env.NEXT_PUBLIC_API_URL}/gouvernance/update-grants`,
    { role_name, modules },
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
}