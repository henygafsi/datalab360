'use client';

import { Button, Title, Text, Avatar } from 'rizzui';
import cn from '@core/utils/class-names';
import { useLayout } from '@/layouts/use-layout';
import { LAYOUT_OPTIONS } from '@/config/enums';
import { useBerylliumSidebars } from '@/layouts/beryllium/beryllium-utils';
import { useSession } from 'next-auth/react';
import type { UserProfile } from '@/app/services/user/profile';

interface ProfileHeaderProps {
  profile: UserProfile | null;
  loading: boolean;
  editing: boolean;
  onEdit: () => void;
}

export default function ProfileHeader({ profile, loading, editing, onEdit }: ProfileHeaderProps) {
  const { data: session } = useSession();
  const { layout } = useLayout();
  const { expandedLeft } = useBerylliumSidebars();

  const username = profile?.username || session?.user?.username || '';
  const displayName =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    session?.user?.name ||
    username ||
    'User';

  const showSkeleton = loading && !profile;

  return (
    <div
      className={cn(
        layout === LAYOUT_OPTIONS.LITHIUM ? '3xl:-mt-4' : 'mt-0',
        layout === LAYOUT_OPTIONS.BORON && '-mt-[15px] 2xl:-mt-8'
      )}
    >
      <div
        className={cn(
          '-mx-6 h-[150px] bg-gradient-to-r from-[#F8E1AF] to-[#F6CFCF] @5xl:h-[200px] 3xl:-mx-8 3xl:h-[250px] 4xl:-mx-10 4xl:h-[300px]',
          layout === LAYOUT_OPTIONS.BERYLLIUM &&
            (expandedLeft
              ? 'xl:-me-8 3xl:-ms-5 4xl:-ms-4'
              : 'xl:-me-8 4xl:-ms-6')
        )}
      />

      <div className="mx-auto w-full max-w-[1294px] @container @5xl:mt-0 @5xl:pt-4 sm:flex sm:justify-between">
        <div className="flex h-auto gap-4 @5xl:gap-6">
          <div>
            <div className="relative -top-1/3 aspect-square w-[110px] overflow-hidden rounded-full border-4 border-white bg-white shadow-profilePic @2xl:w-[130px] @5xl:-top-2/3 @5xl:w-[150px] md:border-[6px] 3xl:w-[200px]">
              <Avatar
                name={displayName}
                className="h-full w-full bg-gray-100 text-2xl font-semibold text-gray-700 3xl:text-4xl"
              />
            </div>
          </div>
          <div className="pt-2.5">
            {showSkeleton ? (
              <>
                <span className="block h-6 w-40 animate-pulse rounded bg-gray-100" />
                <span className="mt-2 block h-3 w-24 animate-pulse rounded bg-gray-100" />
              </>
            ) : (
              <>
                <Title
                  as="h1"
                  className="text-lg font-bold capitalize leading-normal text-gray-900 dark:text-gray-100 @3xl:!text-xl 3xl:text-2xl"
                >
                  {displayName}
                </Title>
                {username && (
                  <Text className="text-xs text-gray-500 dark:text-gray-400 @3xl:text-sm 3xl:text-base">
                    @{username}
                  </Text>
                )}
                {profile?.email && (
                  <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400 @3xl:text-sm 3xl:text-base">
                    {profile.email}
                  </Text>
                )}
              </>
            )}
          </div>
        </div>
        <div className="pt-3 @3xl:pt-4">
          {!editing && (
            <Button
              variant="outline"
              onClick={onEdit}
              disabled={showSkeleton}
              className="font-500 text-gray-900 dark:text-gray-100"
            >
              Edit Profile
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
