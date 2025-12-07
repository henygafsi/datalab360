'use client';

import Link from 'next/link';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { SubmitHandler } from 'react-hook-form';
import { PiArrowRightBold } from 'react-icons/pi';
import { Checkbox, Password, Button, Input, Text } from 'rizzui';
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
  //TODO: why we need to reset it here
  const [reset, setReset] = useState({});

  //const router = useRouter()
  /*const onSubmit: SubmitHandler<LoginSchema> = (data) => {
    console.log(data);
    signIn('credentials', {
      ...data,
    });
    setReset({ email: "", password: "", isRememberMe: false });
  };*/
  const onSubmit: SubmitHandler<LoginSchema> = async (data) => {
    console.log(data);
    // Call NextAuth's signIn method (which internally handles credentials verification)
    const response = await signIn('credentials', {
      redirect: false, // Optionally, prevent redirect on success
      ...data,
    });

    if (response?.error) {
      console.error('Login failed:', response.error);
    } else {
      // Optionally handle redirect or set a successful login state here
      console.log('Login successful:', response);
      try {
        if (typeof window !== 'undefined') {
          const accountName = (data as any).account_name || '';
          const username = (data as any).username || '';
          const password = (data as any).password || '';
          // Cache credentials for silent re-auth
          window.sessionStorage.setItem('auth.account_name', accountName);
          window.sessionStorage.setItem('auth.username', username);
          window.sessionStorage.setItem('auth.password', password);
          // Also persist in localStorage to survive navigation reloads
          window.localStorage.setItem('auth.account_name', accountName);
          window.localStorage.setItem('auth.username', username);
          window.localStorage.setItem('auth.password', password);
        }
      } catch {}
    }

    setReset({ username: "", password: "", isRememberMe: false });
  };


  return (
    <>
      <Form<LoginSchema>
        validationSchema={loginSchema}
        resetValues={reset}
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
              size="lg"
              label="Username"
              placeholder="Enter your userrname"
              className="[&>label>span]:font-medium"
              inputClassName="text-sm"
              {...register('username')}
              error={errors.username?.message}
            />
            <Password
              label="Password"
              placeholder="Enter your password"
              size="lg"
              className="[&>label>span]:font-medium"
              inputClassName="text-sm"
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
                href={routes.auth.forgotPassword1}
                className="h-auto p-0 text-sm font-semibold text-blue underline transition-colors hover:text-gray-900 hover:no-underline"
              >
                Forget Password?
              </Link>
            </div>
            <Button className="w-full" type="submit" size="lg">
              <span>Sign in</span>{' '}
              <PiArrowRightBold className="ms-2 mt-0.5 h-6 w-6" />
            </Button>
          </div>
        )}
      </Form>
      <Text className="mt-6 text-center leading-loose text-gray-500 lg:mt-8 lg:text-start">
        Don’t have an account?{' '}
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
