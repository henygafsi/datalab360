'use client';

import { Title, Text } from 'rizzui';
import { useProfile } from '@/hooks/useProfile';
import { useSession } from 'next-auth/react';

export default function ProfileDetails() {
  const { profile } = useProfile();
  const { data: session } = useSession();
  
  const username = session?.user?.username || '';
  const displayName = profile?.display_name || profile?.first_name || username || 'User';
  const email = profile?.email;
  const firstName = profile?.first_name;
  const lastName = profile?.last_name;
  const loginName = profile?.login_name;

  return (
    <div className="mx-auto mt-10 w-full max-w-[1294px] @2xl:mt-7 @6xl:mt-0">
      <div className="grid gap-6">
        <div className="rounded-lg border border-gray-200 p-6">
          <Title as="h3" className="text-lg font-semibold text-gray-900 mb-4">
            Profile Information
          </Title>
          
          <div className="grid gap-4">
            <div>
              <Text className="text-sm font-medium text-gray-500">Display Name</Text>
              <Text className="text-gray-900">{displayName || '-'}</Text>
            </div>
            
            <div>
              <Text className="text-sm font-medium text-gray-500">Username</Text>
              <Text className="text-gray-900">@{username}</Text>
            </div>

            {loginName && (
              <div>
                <Text className="text-sm font-medium text-gray-500">Login Name</Text>
                <Text className="text-gray-900">{loginName}</Text>
              </div>
            )}

            {firstName && (
              <div>
                <Text className="text-sm font-medium text-gray-500">First Name</Text>
                <Text className="text-gray-900">{firstName}</Text>
              </div>
            )}

            {lastName && (
              <div>
                <Text className="text-sm font-medium text-gray-500">Last Name</Text>
                <Text className="text-gray-900">{lastName}</Text>
              </div>
            )}
            
            {email && (
              <div>
                <Text className="text-sm font-medium text-gray-500">Email</Text>
                <Text className="text-gray-900">{email}</Text>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}