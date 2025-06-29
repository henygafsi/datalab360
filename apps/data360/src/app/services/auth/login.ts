import axios from 'axios';

/**
 * The shape of the login data
 */
export interface LoginData {
  email: string;
  password: string;
}

/**
 * The shape of the login response (adjust it to fit your actual response data)
 */
export interface LoginResponse {
  access_token: string;
  token_type: string;
  idUser: string;
  email: string;
  username: string;
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
  const url = `${process.env.NEXT_PUBLIC_API_URL}/user/login/`;
  console.log('Login URL:', url);
  console.log('Login data:', loginData);

  // ✅ Properly format the request body as x-www-form-urlencoded
  const body = new URLSearchParams();
  body.append('username', loginData.email); // required: FastAPI expects "username"
  body.append('password', loginData.password);

  try {
    const response = await axios.post<LoginResponse>(url, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    console.log('Login response:', response.data);


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
};
