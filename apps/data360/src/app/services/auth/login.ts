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
 * How long we wait for the sign-in call before giving up.
 *
 * This used to be 180 s, which meant an unreachable data platform left the
 * sign-in button spinning for three minutes and then reported axios' own
 * "timeout of 180000ms exceeded" — a message that tells the user nothing and
 * reads like a credentials failure. A sign-in that has not come back in 45 s is
 * not going to succeed; failing here lets us say WHY and offer a retry.
 */
export const SIGN_IN_TIMEOUT_MS = 45_000;

/** Thrown when the platform never answered — distinct from "bad password". */
export const SIGN_IN_UNREACHABLE =
  'The platform did not respond in time. This is a connectivity problem, not a problem with your credentials — please retry, and tell your administrator if it keeps happening.';

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
        // Bound the wait so an unreachable platform fails fast and explicably.
        timeout: SIGN_IN_TIMEOUT_MS,
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

    // No response at all — a timeout or an unreachable host. Neither is a
    // credentials failure, and axios' own wording ("timeout of 45000ms
    // exceeded", "Network Error") reads as one. Say what actually happened so
    // the user retries instead of re-typing a password that was never wrong.
    if (axiosError.code === 'ECONNABORTED' || /timeout/i.test(axiosError.message ?? '')) {
      throw new Error(SIGN_IN_UNREACHABLE);
    }
    if (!axiosError.response) {
      throw new Error(
        'Could not reach the platform. Check your connection, then retry — your credentials were never sent.'
      );
    }

    // Handle other errors that DID carry a response
    if (axiosError.message) {
      throw new Error(axiosError.message);
    }

    throw new Error('An error occurred while signing in.');
  }
};
