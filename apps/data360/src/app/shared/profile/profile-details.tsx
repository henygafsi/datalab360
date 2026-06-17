'use client';

import { Title, Text } from 'rizzui';
import { useSession } from 'next-auth/react';
import type { UserProfile, UpdateProfileData } from '@/app/services/user/profile';
import ProfileEditForm from './profile-edit-form';

const EMPTY = '—';

interface ProfileDetailsProps {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void | Promise<void>;
  editing: boolean;
  onSave: (data: UpdateProfileData) => Promise<void>;
  onCancel: () => void;
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</Text>
      <Text className="text-gray-900 dark:text-gray-100">{value ? value : EMPTY}</Text>
    </div>
  );
}

function FieldRowSkeleton() {
  return (
    <div className="grid gap-1.5">
      <span className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      <span className="h-4 w-40 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
    </div>
  );
}

export default function ProfileDetails({
  profile,
  loading,
  error,
  onRetry,
  editing,
  onSave,
  onCancel,
}: ProfileDetailsProps) {
  const { data: session } = useSession();

  const username = profile?.username || session?.user?.username || '';

  return (
    <div className="mx-auto mt-10 w-full max-w-[1294px] @2xl:mt-7 @6xl:mt-0">
      <div className="grid gap-6">
        <div className="rounded-lg border border-gray-200 p-6 dark:border-gray-700 dark:bg-gray-900/40">
          {editing ? (
            <ProfileEditForm profile={profile} onSave={onSave} onCancel={onCancel} />
          ) : (
            <>
              <Title as="h3" className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                Profile Information
              </Title>

              {error ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/40"
                >
                  <Text className="text-sm font-medium text-red-700 dark:text-red-300">
                    Couldn&apos;t load your profile.
                  </Text>
                  <Text className="mt-0.5 text-sm text-red-600 dark:text-red-400">{error}</Text>
                  <button
                    type="button"
                    onClick={() => void onRetry()}
                    className="mt-3 text-sm font-medium text-red-700 underline underline-offset-2 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
                  >
                    Try again
                  </button>
                </div>
              ) : loading && !profile ? (
                <div className="grid gap-4">
                  <FieldRowSkeleton />
                  <FieldRowSkeleton />
                  <FieldRowSkeleton />
                  <FieldRowSkeleton />
                </div>
              ) : (
                <div className="grid gap-4">
                  <FieldRow
                    label="Display Name"
                    value={profile?.display_name || profile?.first_name}
                  />
                  <FieldRow label="Username" value={username ? `@${username}` : null} />
                  <FieldRow label="Login Name" value={profile?.login_name} />
                  <FieldRow label="First Name" value={profile?.first_name} />
                  <FieldRow label="Last Name" value={profile?.last_name} />
                  <FieldRow label="Email" value={profile?.email} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
