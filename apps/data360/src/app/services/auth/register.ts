import axios from 'axios';

/**
 * The shape of one mapping item
 * (e.g., one link between source & target).
 */
export interface userData {
    username: string,
    first_name: string,
    last_name: string,
    email: string,
    password: string,
    confirm_password: string,
}



export const registerUser = async (userData: any) => {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/user/register`; // e.g., http://api.datalab360.io/mapping
    try {
      const response = await axios.post(url, userData);
      return response.data;
    } catch (error) {
        console.error('Error saving mapping:', error);
        throw error;
    }
  };
