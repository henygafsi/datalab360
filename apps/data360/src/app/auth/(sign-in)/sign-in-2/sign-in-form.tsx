'use client';

import Link from 'next/link';
import { SubmitHandler } from 'react-hook-form';
import { signIn } from 'next-auth/react';
import { Input, Button, Password, Checkbox, Text } from 'rizzui';
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
    <>
      <Form<LoginSchema>
        validationSchema={loginSchema}
        onSubmit={onSubmit}
        useFormProps={{
          mode: 'onChange',
          defaultValues: initialValues,
        }}
      >
        {({ register, formState: { errors } }) => (
          <div className="space-y-5">
            <Input
              type="text"
              size={isMedium ? 'lg' : 'xl'}
              label="username"
              placeholder="Enter your username"
              rounded="pill"
              className="[&>label>span]:font-medium"
              {...register('username')}
              error={errors.username?.message}
            />
            <Password
              label="Password"
              placeholder="Enter your password"
              size={isMedium ? 'lg' : 'xl'}
              rounded="pill"
              className="[&>label>span]:font-medium"
              {...register('password')}
              error={errors.password?.message}
            />
            <div className="flex items-center justify-between pb-2">
              <Checkbox
                {...register('rememberMe')}
                label="Remember Me"
                variant="flat"
                className="[&>label>span]:font-medium"
              />
              <Link
                href={routes.auth.forgotPassword2}
                className="h-auto p-0 text-sm font-semibold text-blue underline transition-colors hover:text-gray-900 hover:no-underline"
              >
                Forget Password?
              </Link>
            </div>
            <Button
              className="border-primary-light w-full border-2 text-base font-bold"
              type="submit"
              size={isMedium ? 'lg' : 'xl'}
              rounded="pill"
            >
              Sign in
            </Button>
          </div>
        )}
      </Form>
      <Text className="mt-5 text-center text-[15px] leading-loose text-gray-500 lg:text-start xl:mt-7 xl:text-base">
        Don’t have an account?{' '}
        <Link
          href={routes.auth.signUp2}
          className="font-semibold text-gray-700 transition-colors hover:text-blue"
        >
          Create Account
        </Link>
      </Text>
    </>
  );
}
