'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SubmitHandler } from 'react-hook-form';
import { PiArrowRightBold, PiBuildingsBold, PiUserBold, PiEnvelopeBold, PiLockKeyBold, PiWarningCircleBold } from 'react-icons/pi';
import { Password, Checkbox, Button, Input, Text } from 'rizzui';
import { Form } from '@core/ui/form';
import { routes } from '@/config/routes';
import { SignUpSchema, signUpSchema } from '@/validators/signup.schema';
import { registerUser } from '@/app/services/auth/register';

const initialValues = {
  organisation_name: '',
  username: '',
  email: '',
  password: '',
  confirm_password: '',
  isAgreed: false,
};

export default function SignUpForm() {
  const [reset, setReset] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit: SubmitHandler<SignUpSchema> = async (data) => {
    setIsLoading(true);
    setError(null);

    try {
      await registerUser({
        organisation_name: data.organisation_name,
        username: data.username,
        email: data.email,
        password: data.password,
        confirm_password: data.confirm_password,
      });
      alert('Registration successful!');
      setReset({ ...initialValues, isAgreed: false });
    } catch (error) {
      setError('Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Form<SignUpSchema>
        validationSchema={signUpSchema}
        resetValues={reset}
        onSubmit={onSubmit}
        useFormProps={{
          defaultValues: initialValues,
        }}
      >
        {({ register, formState: { errors } }) => (
          <div className="space-y-5">
            {error && (
              <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900/50 p-4">
                <PiWarningCircleBold className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <Input
                type="text"
                size="lg"
                label="Organization"
                placeholder="Enter your organization name"
                className="[&>label>span]:font-medium [&>label>span]:text-gray-700 dark:[&>label>span]:text-gray-300"
                inputClassName="text-sm h-12 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                prefix={<PiBuildingsBold className="w-[18px] h-[18px] text-gray-400" />}
                {...register('organisation_name')}
                error={errors.organisation_name?.message}
                disabled={isLoading}
              />

              <Input
                type="text"
                size="lg"
                label="Username"
                placeholder="Choose a username"
                className="[&>label>span]:font-medium [&>label>span]:text-gray-700 dark:[&>label>span]:text-gray-300"
                inputClassName="text-sm h-12 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                prefix={<PiUserBold className="w-[18px] h-[18px] text-gray-400" />}
                {...register('username')}
                error={errors.username?.message}
                disabled={isLoading}
              />

              <Input
                type="email"
                size="lg"
                label="Email"
                placeholder="Enter your email"
                className="[&>label>span]:font-medium [&>label>span]:text-gray-700 dark:[&>label>span]:text-gray-300"
                inputClassName="text-sm h-12 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                prefix={<PiEnvelopeBold className="w-[18px] h-[18px] text-gray-400" />}
                {...register('email')}
                error={errors.email?.message}
                disabled={isLoading}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Password
                  label="Password"
                  placeholder="Create password"
                  size="lg"
                  className="[&>label>span]:font-medium [&>label>span]:text-gray-700 dark:[&>label>span]:text-gray-300"
                  inputClassName="text-sm h-12 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  prefix={<PiLockKeyBold className="w-[18px] h-[18px] text-gray-400" />}
                  {...register('password')}
                  error={errors.password?.message}
                  disabled={isLoading}
                />

                <Password
                  label="Confirm Password"
                  placeholder="Confirm password"
                  size="lg"
                  className="[&>label>span]:font-medium [&>label>span]:text-gray-700 dark:[&>label>span]:text-gray-300"
                  inputClassName="text-sm h-12 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  prefix={<PiLockKeyBold className="w-[18px] h-[18px] text-gray-400" />}
                  {...register('confirm_password')}
                  error={errors.confirm_password?.message}
                  disabled={isLoading}
                />
              </div>
            </div>

            <Checkbox
              {...register('isAgreed')}
              className="[&>label>span]:text-sm [&>label>span]:font-normal [&>label>span]:text-gray-600 dark:[&>label>span]:text-gray-400 [&>label]:items-start pt-1"
              disabled={isLoading}
              label={
                <span>
                  I agree to the{' '}
                  <Link
                    href="/"
                    className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors"
                  >
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link
                    href="/"
                    className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </span>
              }
            />

            <Button
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium shadow-lg shadow-blue-600/25 hover:shadow-blue-600/30 transition-all duration-200 mt-2"
              type="submit"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating account...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Create account</span>
                  <PiArrowRightBold className="w-4 h-4" />
                </div>
              )}
            </Button>
          </div>
        )}
      </Form>

      <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <Link
            href={routes.signIn}
            className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            Sign in
          </Link>
        </Text>
      </div>
    </>
  );
}
