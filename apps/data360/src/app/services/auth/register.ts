import axios, { AxiosError } from 'axios';

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
    } catch (error) {
      const axiosError = error as AxiosError<{
        detail?: string | Array<{ msg?: string }>;
        message?: string;
      }>;

      const data = axiosError.response?.data;
      if (data?.message && typeof data.message === 'string') {
        throw new Error(`Registration failed: ${data.message}`);
      }
      if (data?.detail) {
        const detail = data.detail;
        if (Array.isArray(detail)) {
          const errorMessages = detail.map((e) => e.msg ?? '').filter(Boolean).join(', ');
          throw new Error(`Registration failed: ${errorMessages}`);
        }
        if (typeof detail === 'string') {
          throw new Error(`Registration failed: ${detail}`);
        }
      }

      throw new Error('Registration error: An unexpected issue occurred.');
    }
  };

