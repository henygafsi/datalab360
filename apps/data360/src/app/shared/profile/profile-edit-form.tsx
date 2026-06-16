'use client';

import { useState } from 'react';
import { Input, Button, Title } from 'rizzui';
import { toast } from 'react-hot-toast';
import type { UserProfile, UpdateProfileData } from '@/app/services/user/profile';

interface ProfileEditFormProps {
  profile: UserProfile | null;
  onSave: (data: UpdateProfileData) => Promise<void>;
  onCancel: () => void;
}

/**
 * Inline profile editor. Replaces the old "Edit Profile" link that pointed at
 * the dropped `/forms/profile-settings` template route (404). Writes through
 * the real `PUT` profile endpoint via `useProfile().updateProfileData`.
 */
export default function ProfileEditForm({ profile, onSave, onCancel }: ProfileEditFormProps) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only send fields the backend update contract accepts; normalise empty
  // strings to null so the payload never carries blank placeholders.
  const norm = (v: string) => {
    const t = v.trim();
    return t.length ? t : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const payload: UpdateProfileData = {
        display_name: norm(displayName),
        first_name: norm(firstName),
        last_name: norm(lastName),
        email: norm(email),
      };
      await onSave(payload);
      toast.success('Profile updated');
    } catch (err: any) {
      const msg = err?.message || 'Failed to update profile';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <Title as="h3" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Edit Profile
      </Title>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/40"
        >
          <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="grid gap-5 @lg:grid-cols-2">
        <Input
          label="Display Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="How your name appears"
          disabled={saving}
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          disabled={saving}
        />
        <Input
          label="First Name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={saving}
        />
        <Input
          label="Last Name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          disabled={saving}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" isLoading={saving} disabled={saving}>
          Save Changes
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
