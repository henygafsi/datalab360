'use client';

import { useEffect, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { Button, Title, Text, Input } from 'rizzui';
import { routes } from '@/config/routes';
import toast from 'react-hot-toast';
import {
  profileFormSchema,
  ProfileFormTypes,
} from '@/validators/profile-settings.schema';
import FormGroup from '@/app/shared/form-group';
import Link from 'next/link';
import FormFooter from '@core/components/form-footer';
import { useProfile } from '@/hooks/useProfile';
import { useSession } from 'next-auth/react';

export default function ProfileSettingsView() {
  const { data: session } = useSession();
  const { profile, loading, updateProfileData } = useProfile();
  const [formLoading, setFormLoading] = useState(false);

  const username = session?.user?.username || '';

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ProfileFormTypes>({
    defaultValues: {
      username: profile?.display_name || profile?.first_name || username || '',
      email: profile?.email || '',
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
    },
  });

  useEffect(() => {
    if (profile && !loading) {
      reset({
        username: profile.display_name || profile.first_name || username,
        email: profile.email || '',
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
      });
    }
  }, [profile, loading, username, reset]);

  const onSubmit: SubmitHandler<ProfileFormTypes> = async (data) => {
    setFormLoading(true);
    try {
      await updateProfileData({
        display_name: data.username,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
      });
      toast.success('Profile updated successfully!');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update profile';
      toast.error(errorMessage);
    } finally {
      setFormLoading(false);
    }
  };

  const isLegacyService = profile?.user_type === 'LEGACY_SERVICE';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="@container">
      <div className="mb-8 flex items-center gap-6">
        <div>
          <Title as="h1" className="text-2xl font-bold text-gray-900 dark:text-white">
            Account Settings
          </Title>
          <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your profile information
          </Text>
        </div>
        <div className="ms-auto">
          <Link href={routes.profile}>
            <Button variant="outline">View Profile</Button>
          </Link>
        </div>
      </div>

      <div className="mx-auto mb-10 grid w-full max-w-screen-2xl gap-7 divide-y divide-dashed divide-gray-200 dark:divide-gray-700 @2xl:gap-9 @3xl:gap-11">
        <FormGroup
          title="Username"
          className="pt-7 @2xl:pt-9 @3xl:grid-cols-12 @3xl:pt-11"
          description="Your unique identifier (read-only)"
        >
          <Input
            className="col-span-full bg-white dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
            {...register('username')}
            error={errors.username?.message}
            disabled
          />
        </FormGroup>

        <FormGroup
          title="Display Name"
          className="pt-7 @2xl:pt-9 @3xl:grid-cols-12 @3xl:pt-11"
          description="This is how your name appears in Snowflake"
        >
          <Input
            className="col-span-full bg-white dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
            placeholder="Enter your display name"
            {...register('username')}
            error={errors.username?.message}
          />
        </FormGroup>

        {!isLegacyService && (
        <>
        <FormGroup
          title="First Name"
          className="pt-7 @2xl:pt-9 @3xl:grid-cols-12 @3xl:pt-11"
        >
          <Input
            className="col-span-full bg-white dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
            placeholder="Enter your first name"
            {...register('first_name')}
            error={errors.first_name?.message}
          />
        </FormGroup>

        <FormGroup
          title="Last Name"
          className="pt-7 @2xl:pt-9 @3xl:grid-cols-12 @3xl:pt-11"
        >
          <Input
            className="col-span-full bg-white dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
            placeholder="Enter your last name"
            {...register('last_name')}
            error={errors.last_name?.message}
          />
        </FormGroup>
        </>
        )}

        <FormGroup
          title="Email"
          className="pt-7 @2xl:pt-9 @3xl:grid-cols-12 @3xl:pt-11"
          description="Your email address in Snowflake"
        >
          <Input
            type="email"
            className="col-span-full bg-white dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
            placeholder="your.email@example.com"
            {...register('email')}
            error={errors.email?.message}
          />
        </FormGroup>
      </div>

      <FormFooter
        isLoading={formLoading || loading}
        altBtnText="Cancel"
        submitBtnText="Save Changes"
      />
    </form>
  );
}