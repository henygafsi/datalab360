import axios, { AxiosError } from 'axios';
import { getAuthHeadersSafe } from '@/lib/auth';

export interface UserProfile {
  username: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  login_name: string | null;
  status?: string;
  user_type?: string;
}

export interface UpdateProfileData {
  display_name?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}

export const getProfile = async (): Promise<UserProfile> => {
  try {
    const headers = await getAuthHeadersSafe();
    if (!headers) {
      throw new Error('Not authenticated');
    }

    const { API_CONTRACTS } = await import('@/lib/api-contracts');
    const endpoint = API_CONTRACTS.user.getProfile.getUrl();

    const response = await axios.get<UserProfile>(endpoint, {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error('Invalid response from server');
    }
  } catch (error: any) {
    const axiosError = error as AxiosError<{
      detail?: string | { detail?: string; error_code?: string; message?: string };
      message?: string;
    }>;

    const data = axiosError.response?.data;
    if (data?.message && typeof data.message === 'string') {
      throw new Error(data.message);
    }
    if (data?.detail) {
      const detail = data.detail;
      if (typeof detail === 'string') {
        throw new Error(detail);
      }
      if (typeof detail === 'object' && detail !== null && 'detail' in detail) {
        throw new Error((detail as { detail: string }).detail);
      }
    }

    if (axiosError.message) {
      throw new Error(axiosError.message);
    }

    throw new Error('An error occurred while fetching profile.');
  }
};

export const updateProfile = async (data: UpdateProfileData): Promise<UserProfile> => {
  try {
    const headers = await getAuthHeadersSafe();
    if (!headers) {
      throw new Error('Not authenticated');
    }

    const { API_CONTRACTS } = await import('@/lib/api-contracts');
    const endpoint = API_CONTRACTS.user.updateProfile.getUrl();

    const response = await axios.put<UserProfile>(endpoint, data, {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error('Invalid response from server');
    }
  } catch (error: any) {
    const axiosError = error as AxiosError<{
      detail?: string | { detail?: string; error_code?: string; message?: string };
      message?: string;
    }>;

    const data = axiosError.response?.data;
    if (data?.message && typeof data.message === 'string') {
      throw new Error(data.message);
    }
    if (data?.detail) {
      const detail = data.detail;
      if (typeof detail === 'string') {
        throw new Error(detail);
      }
      if (typeof detail === 'object' && detail !== null && 'detail' in detail) {
        throw new Error((detail as { detail: string }).detail);
      }
    }

    if (axiosError.message) {
      throw new Error(axiosError.message);
    }

    throw new Error('An error occurred while updating profile.');
  }
};

export const changePassword = async (passwordData: ChangePasswordData): Promise<{ success: boolean; message: string }> => {
  try {
    const headers = await getAuthHeadersSafe();
    if (!headers) {
      throw new Error('Not authenticated');
    }

    const { API_CONTRACTS } = await import('@/lib/api-contracts');
    const endpoint = API_CONTRACTS.user.changePassword.getUrl();

    const response = await axios.post<{ success: boolean; message: string }>(endpoint, passwordData, {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error('Invalid response from server');
    }
  } catch (error: any) {
    const axiosError = error as AxiosError<{
      detail?: string | { detail?: string; error_code?: string; message?: string };
      message?: string;
    }>;

    const data = axiosError.response?.data;
    if (data?.message && typeof data.message === 'string') {
      throw new Error(data.message);
    }
    if (data?.detail) {
      const detail = data.detail;
      if (typeof detail === 'string') {
        throw new Error(detail);
      }
      if (typeof detail === 'object' && detail !== null && 'detail' in detail) {
        throw new Error((detail as { detail: string }).detail);
      }
    }

    if (axiosError.message) {
      throw new Error(axiosError.message);
    }

    throw new Error('An error occurred while changing password.');
  }
};

export interface UserRoles {
  current_role: string;
  available_roles: string[];
}

export const getUserRoles = async (): Promise<UserRoles> => {
  try {
    const headers = await getAuthHeadersSafe();
    if (!headers) {
      throw new Error('Not authenticated');
    }

    const { API_CONTRACTS } = await import('@/lib/api-contracts');
    const endpoint = API_CONTRACTS.user.getUserRoles.getUrl();

    const response = await axios.get<UserRoles>(endpoint, {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error('Invalid response from server');
    }
  } catch (error: any) {
    const axiosError = error as AxiosError<{
      detail?: string | { detail?: string; error_code?: string; message?: string };
      message?: string;
    }>;

    const data = axiosError.response?.data;
    if (data?.message && typeof data.message === 'string') {
      throw new Error(data.message);
    }
    if (data?.detail) {
      const detail = data.detail;
      if (typeof detail === 'string') {
        throw new Error(detail);
      }
      if (typeof detail === 'object' && detail !== null && 'detail' in detail) {
        throw new Error((detail as { detail: string }).detail);
      }
    }

    if (axiosError.message) {
      throw new Error(axiosError.message);
    }

    throw new Error('An error occurred while fetching user roles.');
  }
};

export const changeUserRole = async (role: string): Promise<UserRoles> => {
  try {
    const headers = await getAuthHeadersSafe();
    if (!headers) {
      throw new Error('Not authenticated');
    }

    const { API_CONTRACTS } = await import('@/lib/api-contracts');
    const endpoint = API_CONTRACTS.user.changeUserRole.getUrl();

    const response = await axios.post<UserRoles>(endpoint, { role }, {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error('Invalid response from server');
    }
  } catch (error: any) {
    const axiosError = error as AxiosError<{
      detail?: string | { detail?: string; error_code?: string; message?: string };
      message?: string;
    }>;

    const data = axiosError.response?.data;
    if (data?.message && typeof data.message === 'string') {
      throw new Error(data.message);
    }
    if (data?.detail) {
      const detail = data.detail;
      if (typeof detail === 'string') {
        throw new Error(detail);
      }
      if (typeof detail === 'object' && detail !== null && 'detail' in detail) {
        throw new Error((detail as { detail: string }).detail);
      }
    }

    if (axiosError.message) {
      throw new Error(axiosError.message);
    }

    throw new Error('An error occurred while changing user role.');
  }
};