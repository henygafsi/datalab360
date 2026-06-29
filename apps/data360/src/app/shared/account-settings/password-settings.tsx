'use client';

import { useState } from 'react';
import { SubmitHandler, Controller } from 'react-hook-form';
import { PiDesktop } from 'react-icons/pi';
import { Form } from '@core/ui/form';
import { Button, Password, Title, Text } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  passwordFormSchema,
  PasswordFormTypes,
} from '@/validators/password-settings.schema';
import { routes } from '@/config/routes';
import toast from 'react-hot-toast';
import { useProfile } from '@/hooks/useProfile';
import Link from 'next/link';

export default function PasswordSettingsView() {
  const { changeUserPassword, loading } = useProfile();
  const [isLoading, setLoading] = useState(false);

  const onSubmit: SubmitHandler<PasswordFormTypes> = async (data) => {
    setLoading(true);
    try {
      await changeUserPassword(data.currentPassword, data.newPassword);
      toast.success('Password changed successfully!');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change password';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form<PasswordFormTypes>
      validationSchema={passwordFormSchema}
      onSubmit={onSubmit}
      className="@container"
      useFormProps={{
        mode: 'onChange',
        defaultValues: {
          currentPassword: '',
          newPassword: '',
          confirmedPassword: '',
        },
      }}
    >
      {({ register, control, formState: { errors }, getValues }) => {
        return (
          <>
            <div className="mb-8 flex items-center gap-6">
              <div>
                <Title as="h1" className="text-2xl font-bold text-gray-900 dark:text-white">
                  Password Settings
                </Title>
                <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Change your password
                </Text>
              </div>
              <div className="ms-auto">
                <Link href={routes.profile}>
                  <Button variant="outline">View Profile</Button>
                </Link>
              </div>
            </div>

            <div className="mx-auto w-full max-w-screen-2xl">
              <div className="mb-8">
                <Title as="h2" className="text-lg font-medium text-gray-900 dark:text-white">
                  Change Password
                </Title>
                <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Enter your current password and choose a new one
                </Text>
              </div>

              <div className="space-y-6">
<div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Current Password
                  </label>
                  <Password
                    {...register('currentPassword')}
                    placeholder="Enter your current password"
                    error={errors.currentPassword?.message}
                    className="w-full max-w-md bg-white dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    New Password
                  </label>
                  <Controller
                    control={control}
                    name="newPassword"
                    render={({ field: { onChange, value } }) => (
                      <Password
                        placeholder="Enter your new password"
                        onChange={onChange}
                        error={errors.newPassword?.message}
                        className="w-full max-w-md bg-white dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
                      />
                    )}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Confirm New Password
                  </label>
                  <Controller
                    control={control}
                    name="confirmedPassword"
                    render={({ field: { onChange, value } }) => (
                      <Password
                        placeholder="Confirm your new password"
                        onChange={onChange}
                        error={errors.confirmedPassword?.message}
                        className="w-full max-w-md bg-white dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
                      />
                    )}
                  />
                </div>

                <div className="mt-6 flex gap-3">
                  <Button type="submit" variant="solid" isLoading={isLoading || loading}>
                    Update Password
                  </Button>
                </div>
              </div>
            </div>
          </>
        );
      }}
    </Form>
  );
}