'use client';

import { useState, useEffect, useCallback } from 'react';
import { getProfile, updateProfile, changePassword, getUserRoles, changeUserRole, UserProfile, UpdateProfileData, ChangePasswordData, UserRoles } from '@/app/services/user/profile';

interface UseProfileReturn {
  profile: UserProfile | null;
  roles: UserRoles | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  refetchRoles: () => Promise<void>;
  updateProfileData: (data: UpdateProfileData) => Promise<UserProfile>;
  changeUserPassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  changeRole: (role: string) => Promise<UserRoles>;
}

export function useProfile(): UseProfileReturn {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<UserRoles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProfile();
      setProfile(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  }, []);

  const refetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserRoles();
      setRoles(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const updateProfileData = async (data: UpdateProfileData): Promise<UserProfile> => {
    setLoading(true);
    setError(null);
    try {
      const updated = await updateProfile(data);
      setProfile(updated);
      return updated;
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const changeUserPassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    setLoading(true);
    setError(null);
    try {
      const result = await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      return result;
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const changeRole = async (role: string): Promise<UserRoles> => {
    setLoading(true);
    setError(null);
    try {
      const updated = await changeUserRole(role);
      setRoles(updated);
      return updated;
    } catch (err: any) {
      setError(err.message || 'Failed to change role');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    profile,
    roles,
    loading,
    error,
    refetch,
    refetchRoles,
    updateProfileData,
    changeUserPassword,
    changeRole,
  };
}