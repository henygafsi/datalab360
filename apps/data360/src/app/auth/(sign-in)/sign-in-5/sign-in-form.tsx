'use client';

import Link from 'next/link';
import { SubmitHandler } from 'react-hook-form';
import { signIn } from 'next-auth/react';
import { Password, Button, Switch, Input, Text } from 'rizzui';
import { useMedia } from '@core/hooks/use-media';
import { Form } from '@core/ui/form';
import { routes } from '@/config/routes';
import { loginSchema, LoginSchema } from '@/validators/login.schema';

const initialValues: LoginSchema = {
  account_name: '',
  username: 'admin@admin.com',
  password: 'admin',
  rememberMe: true,
};

export default function SignInForm() {
  const isMedium = useMedia('(max-width: 1200px)', false);
  const onSubmit: SubmitHandler<LoginSchema> = async (data) => {
    const res = await signIn('credentials', { redirect: false, ...data });
    if (!res?.error) {
      try {
        if (typeof window !== 'undefined') {
          const accountName = (data as any).account_name || '';
          const username = (data as any).username || '';
          const password = (data as any).password || '';
          window.sessionStorage.setItem('auth.account_name', accountName);
          window.sessionStorage.setItem('auth.username', username);
          window.sessionStorage.setItem('auth.password', password);
          window.localStorage.setItem('auth.account_name', accountName);
          window.localStorage.setItem('auth.username', username);
          window.localStorage.setItem('auth.password', password);
        }
      } catch {}
    }
  };

  return (
    <div className="xl:pe-12 2xl:pe-20">
      <Form<LoginSchema>
        validationSchema={loginSchema}
        onSubmit={onSubmit}
        useFormProps={{
          mode: 'onChange',
          defaultValues: initialValues,
        }}
      >
        {({ register, formState: { errors } }) => (
          <div className="space-y-5 lg:space-y-6">
            <Input
              type="text"
              size={isMedium ? 'lg' : 'xl'}
              label="username"
              placeholder="Enter your username"
              className="[&>label>span]:font-medium"
              {...register('username')}
              error={errors.username?.message}
            />
            <Password
              label="Password"
              placeholder="Enter your password"
              size={isMedium ? 'lg' : 'xl'}
              className="[&>label>span]:font-medium"
              {...register('password')}
              error={errors.password?.message}
            />
            <div className="flex items-center justify-between">
              <Switch
                label="Remember Me"
                className="[&>label>span]:font-medium [&>label]:my-1"
                {...register('rememberMe')}
              />
              <Link
                href={routes.auth.forgotPassword5}
                className="h-auto p-0 text-sm font-medium text-gray-900 underline transition-colors hover:text-primary hover:no-underline"
              >
                Forget Password?
              </Link>
            </div>
            <Button
              className="w-full"
              type="submit"
              size={isMedium ? 'lg' : 'xl'}
            >
              Sign In
            </Button>
          </div>
        )}
      </Form>
      <Text className="mt-6 text-center text-[15px] leading-loose text-gray-500 lg:mt-9 xl:text-base">
        Don’t have an account?{' '}
        <Link
          href={routes.auth.signUp5}
          className="font-bold text-gray-700 transition-colors hover:text-primary"
        >
          Sign Up
        </Link>
      </Text>
    </div>
  );
}
