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
    const endpoint = `${process.env.NEXT_PUBLIC_API_URL}/user/login/`;

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
  } catch (error: any) {
    const axiosError = error as AxiosError<any>;

    // Handle API error response
    if (axiosError.response?.data?.detail) {
      const detail = axiosError.response.data.detail;

      // detail peut être string OU array d'objets
      if (Array.isArray(detail)) {
        const errorMessages = detail.map((e: any) => e.msg || e).join(', ');
        throw new Error(`Login failed: ${errorMessages}`);
      } else if (typeof detail === 'string') {
        throw new Error(`Login failed: ${detail}`);
      } else {
        throw new Error('Login failed: Invalid credentials');
      }
    }

    // Handle network or other errors
    if (axiosError.message) {
      throw new Error(`Login error: ${axiosError.message}`);
    }

    throw new Error('Login error: An unexpected issue occurred during login.');
  }
};
