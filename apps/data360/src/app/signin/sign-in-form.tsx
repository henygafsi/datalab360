'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SubmitHandler } from 'react-hook-form';
import { PiArrowRightBold } from 'react-icons/pi';
import { Checkbox, Password, Button, Input, Text } from 'rizzui';
import { Form } from '@core/ui/form';
import { routes } from '@/config/routes';
import { loginSchema, LoginSchema } from '@/validators/login.schema';

const initialValues: LoginSchema = {
  account_name: '',
  username: '',
  password: '',
  rememberMe: true,
};

// Map NextAuth error codes to user-friendly messages
const errorMessages: Record<string, string> = {
  CredentialsSignin: 'Invalid credentials. Please check your account name, username, and password.',
  SessionRequired: 'Please sign in to access this page.',
  OAuthSignin: 'Error signing in with OAuth provider.',
  OAuthCallback: 'Error during OAuth callback.',
  OAuthCreateAccount: 'Could not create OAuth account.',
  EmailCreateAccount: 'Could not create email account.',
  Callback: 'Error during authentication callback.',
  OAuthAccountNotLinked: 'This account is already linked to another user.',
  EmailSignin: 'Check your email for the sign in link.',
  Default: 'An authentication error occurred. Please try again.',
};

export default function SignInForm() {
  const [reset, setReset] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Handle error query parameter from NextAuth redirects
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      const errorMessage = errorMessages[errorParam] || errorMessages.Default;
      setError(errorMessage);
    }
  }, [searchParams]);

  const onSubmit: SubmitHandler<LoginSchema> = async (data) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn('credentials', {
        account_name: data.account_name,
        username: data.username,
        password: data.password,
        redirect: false, // Don't redirect - handle manually to avoid exposing credentials
      });

      if (result?.error) {
        setError('Invalid credentials. Please check your account name, username, and password.');
      } else if (result?.ok) {
        // Success - redirect to dashboard
        router.push('/account-overview');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Form<LoginSchema>
        validationSchema={loginSchema}
        resetValues={reset}
        onSubmit={onSubmit}
        useFormProps={{
          defaultValues: initialValues,
        }}
      >
        {({ register, formState: { errors } }) => (
          <div className="space-y-5">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
            <Input
              type="text"
              size="lg"
              label="Account Name"
              placeholder="Enter your account name"
              className="[&>label>span]:font-medium"
              inputClassName="text-sm"
              {...register('account_name')}
              error={errors.account_name?.message}
              disabled={isLoading}
            />
            <Input
              type="text"
              size="lg"
              label="Username"
              placeholder="Enter your username"
              className="[&>label>span]:font-medium"
              inputClassName="text-sm"
              {...register('username')}
              error={errors.username?.message}
              disabled={isLoading}
            />
            <Password
              label="Password"
              placeholder="Enter your password"
              size="lg"
              className="[&>label>span]:font-medium"
              inputClassName="text-sm"
              {...register('password')}
              error={errors.password?.message}
              disabled={isLoading}
            />
            <div className="flex items-center justify-between pb-2">
              <Checkbox
                {...register('rememberMe')}
                label="Remember Me"
                className="[&>label>span]:font-medium"
                disabled={isLoading}
              />
              <Link
                href={routes.auth.forgotPassword1}
                className="h-auto p-0 text-sm font-semibold text-blue underline transition-colors hover:text-gray-900 hover:no-underline"
              >
                Forget Password?
              </Link>
            </div>
            <Button className="w-full" type="submit" size="lg" disabled={isLoading}>
              {isLoading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign in</span>{' '}
                  <PiArrowRightBold className="ms-2 mt-0.5 h-5 w-5" />
                </>
              )}
            </Button>
          </div>
        )}
      </Form>
      <Text className="mt-6 text-center leading-loose text-gray-500 lg:mt-8 lg:text-start">
        Don't have an account?{' '}
        <Link
          href={routes.auth.signUp1}
          className="font-semibold text-gray-700 transition-colors hover:text-blue"
        >
          Sign Up
        </Link>
      </Text>
    </>
  );
}
