'use client';

import { Title, Text } from 'rizzui';
import { useProfile } from '@/hooks/useProfile';
import { useSession } from 'next-auth/react';

const EMPTY = '—';

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <Text className="text-sm font-medium text-gray-500">{label}</Text>
      <Text className="text-gray-900">{value ? value : EMPTY}</Text>
    </div>
  );
}

function FieldRowSkeleton() {
  return (
    <div className="grid gap-1.5">
      <span className="h-3 w-24 animate-pulse rounded bg-gray-100" />
      <span className="h-4 w-40 animate-pulse rounded bg-gray-100" />
    </div>
  );
}

export default function ProfileDetails() {
  const { profile, loading, error, refetch } = useProfile();
  const { data: session } = useSession();

  const username = profile?.username || session?.user?.username || '';

  return (
    <div className="mx-auto mt-10 w-full max-w-[1294px] @2xl:mt-7 @6xl:mt-0">
      <div className="grid gap-6">
        <div className="rounded-lg border border-gray-200 p-6">
          <Title as="h3" className="mb-4 text-lg font-semibold text-gray-900">
            Profile Information
          </Title>

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-4"
            >
              <Text className="text-sm font-medium text-red-700">
                Couldn&apos;t load your profile.
              </Text>
              <Text className="mt-0.5 text-sm text-red-600">{error}</Text>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-3 text-sm font-medium text-red-700 underline underline-offset-2 hover:text-red-800"
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
              <FieldRow
                label="Username"
                value={username ? `@${username}` : null}
              />
              <FieldRow label="Login Name" value={profile?.login_name} />
              <FieldRow label="First Name" value={profile?.first_name} />
              <FieldRow label="Last Name" value={profile?.last_name} />
              <FieldRow label="Email" value={profile?.email} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
