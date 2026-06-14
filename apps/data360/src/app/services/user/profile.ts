import { AxiosError } from 'axios';
import apiClient from '@/lib/api-client';
import { API_CONTRACTS } from '@/lib/api-contracts';

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
    const response = await apiClient.get<UserProfile>(API_CONTRACTS.user.getProfile.path);

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
    const response = await apiClient.put<UserProfile>(API_CONTRACTS.user.updateProfile.path, data);

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
    const response = await apiClient.post<{ success: boolean; message: string }>(
      API_CONTRACTS.user.changePassword.path,
      passwordData
    );

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
    const response = await apiClient.get<UserRoles>(API_CONTRACTS.user.getUserRoles.path);

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
    const response = await apiClient.post<UserRoles>(API_CONTRACTS.user.changeUserRole.path, { role });

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