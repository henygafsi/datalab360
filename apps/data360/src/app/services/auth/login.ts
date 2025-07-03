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
  message: string;
}

function buildUrlWithQueryParams(baseUrl: string, params: Record<string, string | boolean | null | undefined>): string {
    const url = new URL(baseUrl);
    for (const key in params) {
        const value = params[key];
        if (value !== null && value !== undefined) {
            url.searchParams.append(key, String(value));
        }
    }
    return url.toString();
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
    // Build the URL with login credentials as query parameters
    const endpoint = buildUrlWithQueryParams(
        `${process.env.NEXT_PUBLIC_API_URL}/user/login/`, // Ensure NEXT_PUBLIC_API_URL is correctly set
        {
            account_name: loginData.account_name,
            username: loginData.username,
            password: loginData.password,
        }
    );
  try {
    console.log('Login URL with params:', endpoint);
    console.log('Login data (sent as params):', loginData);

    // Make the POST request. The data is now in the URL, so no 'body' is passed with axios.post.
    const response = await axios.post<LoginResponse>(endpoint, {}, { // Pass an empty object as the request body
      headers: {
        'accept': 'application/json', // Specify accepted response type
        // 'Content-Type' header is usually not necessary for empty body POSTs,
        // or can be omitted if server doesn't strictly require it.
        // If your server expects application/json even with query params, you could add:
        // 'Content-Type': 'application/json',
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error('Invalid response from server');
    }
  } catch (error: any) {
    if (error.response?.data?.detail) {
      console.error('Login error details:', error.response.data.detail);
      throw new Error(
        `Login failed: ${error.response.data.detail.map((e: any) => e.msg).join(', ')}`
      );
    } else {
      console.error('Login error:', error);
      throw new Error('Failed to log in. Please try again.');
    }
  }
}catch (error) {
    console.error("Login failed:", error);

    const axiosError = error as AxiosError<any>;

    if (axiosError.response?.data?.detail) {
      throw new Error(axiosError.response.data.detail);
    }
    throw new Error("Login error: An unexpected issue occurred during login.");
  }
};
