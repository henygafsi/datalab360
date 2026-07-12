import axios, { AxiosError } from 'axios';

/**
 * The shape of the login data
 */
export interface LoginData {
  account_name: string; // This is the account name, not email
  username: string; // This is the username, which is typically the email in many systems
  password: string;
}

/**
 * The shape of the login response (adjust it to fit your actual response data)
 */
export interface LoginResponse {
  access_token: string;
  token_type: string;
  account_name: string; // The account name associated with the user
  username: string;
  role: string;
  items: any[];
  message: string;
}

/**
 * Login function to authenticate the user.
 *
 * @param loginData - The user credentials (email and password)
 * @returns The login response containing the token and user ID.
 * @throws Error if the login request fails.
 */



export const login = async (loginData: LoginData): Promise<LoginResponse> => {
  try {
    const { API_CONTRACTS } = await import('@/lib/api-contracts');
    const endpoint = API_CONTRACTS.auth.login.getUrl();

    // Make the POST request with credentials in the body (NOT in URL)
    const response = await axios.post<LoginResponse>(
      endpoint,
      loginData, // Credentials in request body
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        // Add timeout to prevent hanging
        timeout: 30000,
      }
    );

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error('Invalid response from server');
    }
  } catch (error) {
    const axiosError = error as AxiosError<{
      detail?: string | { detail?: string; error_code?: string; message?: string } | Array<{ msg?: string }>;
      message?: string;
    }>;

    // Handle API error response (backend returns detail and optionally message, error_code)
    const data = axiosError.response?.data;
    if (data?.message && typeof data.message === 'string') {
      throw new Error(data.message);
    }
    if (data?.detail) {
      const detail = data.detail;
      if (Array.isArray(detail)) {
        const errorMessages = detail.map((e) => e.msg ?? '').filter(Boolean).join(', ');
        throw new Error(errorMessages);
      }
      if (typeof detail === 'string') {
        throw new Error(detail);
      }
      if (typeof detail === 'object' && detail !== null && 'detail' in detail && typeof (detail as { detail?: string }).detail === 'string') {
        throw new Error((detail as { detail: string }).detail);
      }
    }

    // Handle network or other errors
    if (axiosError.message) {
      throw new Error(axiosError.message);
    }

    throw new Error('An error occurred while signing in.');
  }
};
