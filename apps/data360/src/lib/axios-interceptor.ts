import axios from 'axios';

let isRedirecting = false;

/**
 * Global axios interceptor to handle authentication errors
 * Redirects to sign-in page only when user is not authenticated (401, 403)
 */
export function setupAxiosInterceptor() {
  // Response interceptor to catch errors
  axios.interceptors.response.use(
    (response) => {
      // Reset redirect flag on successful response
      isRedirecting = false;
      return response;
    },
    (error) => {
      // Don't redirect multiple times
      if (isRedirecting) {
        return Promise.reject(error);
      }

      // Only redirect on authentication errors
      const isAuthError =
        error.response?.status === 401 || // Unauthorized
        error.response?.status === 403;   // Forbidden

      if (isAuthError) {
        console.error('Authentication error, redirecting to sign-in:', error.message);

        // Set flag to prevent multiple redirects
        isRedirecting = true;

        // Redirect to sign-in page
        if (typeof window !== 'undefined') {
          window.location.href = '/signin';
        }
      }

      return Promise.reject(error);
    }
  );
}
