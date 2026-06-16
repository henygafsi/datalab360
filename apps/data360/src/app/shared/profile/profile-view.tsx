'use client';

import { useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import type { UpdateProfileData } from '@/app/services/user/profile';
import ProfileHeader from './profile-header';
import ProfileDetails from './profile-details';

/**
 * Client wrapper for the Profile page. Owns a single `useProfile()` instance so
 * the header and the details/edit card stay in sync (the previous layout had
 * two independent fetches), plus the inline-edit toggle that replaced the dead
 * "Edit Profile" → /forms/profile-settings link.
 */
export default function ProfileView() {
  const { profile, loading, error, refetch, updateProfileData } = useProfile();
  const [editing, setEditing] = useState(false);

  const handleSave = async (data: UpdateProfileData) => {
    await updateProfileData(data);
    setEditing(false);
  };

  return (
    <div className="@container">
      <ProfileHeader
        profile={profile}
        loading={loading}
        editing={editing}
        onEdit={() => setEditing(true)}
      />
      <ProfileDetails
        profile={profile}
        loading={loading}
        error={error}
        onRetry={refetch}
        editing={editing}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
      />
    </div>
  );
}
