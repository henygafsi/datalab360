'use client';

import { useState, useEffect } from 'react';
import { Controller } from 'react-hook-form';
import { PiKey, PiDesktop } from 'react-icons/pi';
import { Form } from '@core/ui/form';
import { Button, Title, Text, Select } from 'rizzui';
import cn from '@core/utils/class-names';
import { routes } from '@/config/routes';
import toast from 'react-hot-toast';
import { useProfile } from '@/hooks/useProfile';
import Link from 'next/link';
import { z } from 'zod';


interface RoleFormTypes {
  role: string;
}

const roleFormSchema = z.object({
  role: z.string().min(1, 'Role is required'),
});

export default function RoleSettingsView() {
  const { roles, loading, refetchRoles, changeRole } = useProfile();
  const [isLoading, setLoading] = useState(false);

  useEffect(() => {
    refetchRoles();
  }, [refetchRoles]);

  const onSubmit = async (data: RoleFormTypes) => {
    setLoading(true);
    try {
      await changeRole(data.role);
      toast.success('Role changed successfully!');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change role';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!roles) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Text className="text-gray-500 dark:text-gray-400">Loading roles...</Text>
      </div>
    );
  }

  return (
    <Form<RoleFormTypes>
      validationSchema={roleFormSchema}
      onSubmit={onSubmit}
      className="@container"
      useFormProps={{
        mode: 'onChange',
        defaultValues: {
          role: roles.current_role,
        },
      }}
    >
      {({ control, formState: { errors }, getValues }) => {
        return (
          <>
            <div className="mb-8 flex items-center gap-6">
              <div>
                <Title as="h1" className="text-2xl font-bold text-gray-900 dark:text-white">
                  Role Settings
                </Title>
                <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Switch between your assigned roles
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
                  Current Role
                </Title>
                <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Select a role to switch to
                </Text>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Available Roles
                  </label>
                  <Controller
                    control={control}
                    name="role"
                    render={({ field: { onChange, value } }) => {
                      const options = roles.available_roles.map((r: string) => ({
                        value: r,
                        label: r,
                      }));

                      return (
                        <Select
                          value={options.find(
                            (opt: { value: string; label: string }) => opt.value === value
                          )}
                          options={options}
                          onChange={(option: { value: string; label: string } | null) =>
                            onChange(option?.value)
                          }
                          placeholder="Select a role"
                          className="w-full max-w-md bg-white dark:bg-gray-800"
                          error={errors.role?.message}
                        />
                      );
                    }}
                  />
                </div>

                <div className="mt-6 flex gap-3">
                  <Button type="submit" variant="solid" isLoading={isLoading || loading}>
                    Switch Role
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