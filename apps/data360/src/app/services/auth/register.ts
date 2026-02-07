import axios from 'axios';

/**
 * User registration data
 */
export interface userData {
    organisation_name: string;
    username: string;
    email: string;
    password: string;
    confirm_password: string;
}



export const registerUser = async (userData: userData) => {
    const { API_CONTRACTS } = await import('@/lib/api-contracts');
    const url = API_CONTRACTS.auth.register.getUrl();

    try {
      const response = await axios.post(url, userData, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });
      return response.data;
    } catch (error: any) {
      const axiosError = error as any;

      if (axiosError.response?.data?.detail) {
        throw new Error(`Registration failed: ${axiosError.response.data.detail}`);
      }

      throw new Error('Registration error: An unexpected issue occurred.');
    }
  };

