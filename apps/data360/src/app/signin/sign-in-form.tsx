'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { SubmitHandler } from 'react-hook-form';
import { PiArrowRightBold, PiUserBold, PiIdentificationBadgeBold, PiLockKeyBold, PiWarningCircleBold } from 'react-icons/pi';
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

const errorMessages: Record<string, string> = {
  CredentialsSignin: 'Invalid credentials. Please check your account name, username, and password.',
  SessionRequired: 'Please sign in to access this page.',
  Default: 'An authentication error occurred. Please try again.',
};

// Backend 401s carrying errno 250001 ("Multi-factor authentication is
// required… enroll") mean the warehouse account has MFA enforcement but the
// user never enrolled — retrying the password here can never succeed, so say
// exactly what to do instead of the generic "invalid credentials" line.
// Brand rule: neutral wording only — no vendor names in customer-facing copy.
const MFA_ENROLLMENT_MESSAGE =
  'This account requires multi-factor authentication (MFA) enrollment. Log in to your data warehouse console once to complete MFA enrollment, then retry signing in here.';

/**
 * Turn a NextAuth error (opaque code from `?error=` OR the backend `detail`
 * string thrown by authorize()) into the message shown to the user.
 * - MFA-enrollment 401s (mentions "multi-factor" or errno 250001) get an
 *   actionable callout instead of "invalid credentials".
 * - Known NextAuth codes keep their friendly mapping.
 * - Any other human-readable backend detail is surfaced verbatim (vendor name
 *   scrubbed per brand rules); single opaque tokens fall back to the generic.
 */
function resolveAuthError(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return errorMessages.Default;
  if (/multi[\s-]?factor|250001/i.test(value)) return MFA_ENROLLMENT_MESSAGE;
  if (errorMessages[value]) return errorMessages[value];
  // A sentence-like message is the backend detail threaded through authorize()
  // (e.g. account not found, user disabled) — show it rather than collapsing
  // every failure to "invalid credentials".
  if (/\s/.test(value)) return value.replace(/snowflake/gi, 'data warehouse');
  return errorMessages.Default;
}

export default function SignInForm() {
  const [reset, setReset] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || routes.accountOverview;

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(resolveAuthError(errorParam));
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
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        // result.error is the backend detail thrown by authorize() (or an
        // opaque NextAuth code) — resolve it: MFA-enrollment 401s get an
        // actionable callout, other backend details render verbatim.
        setError(
          resolveAuthError(typeof result.error === 'string' ? result.error : null)
        );
      } else if (result?.ok) {
        // Store access_token in localStorage for modules that read it directly
        try {
          const sessionRes = await fetch('/api/auth/session');
          const session = await sessionRes.json() as { user?: { access_token?: string } };
          const token = session?.user?.access_token;
          if (token) {
            localStorage.setItem('access_token', token);
            localStorage.setItem('snowflake_token', token);
          }
        } catch {
          // Non-blocking — modules will fall back to getSession()
        }
        const targetUrl = result.url || callbackUrl;
        window.location.assign(targetUrl);
      }
    } catch (err: unknown) {
      setError(resolveAuthError(err instanceof Error ? err.message : null));
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
              <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900/50 p-4">
                <PiWarningCircleBold className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <Input
                type="text"
                size="lg"
                label="Account Name"
                placeholder="Enter your account name"
                className="[&>label>span]:font-medium [&>label>span]:text-gray-700 dark:[&>label>span]:text-gray-300"
                inputClassName="text-sm h-12 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                prefix={<PiIdentificationBadgeBold className="w-[18px] h-[18px] text-gray-400" />}
                {...register('account_name')}
                error={errors.account_name?.message}
                disabled={isLoading}
              />

              <Input
                type="text"
                size="lg"
                label="Username"
                placeholder="Enter your username"
                className="[&>label>span]:font-medium [&>label>span]:text-gray-700 dark:[&>label>span]:text-gray-300"
                inputClassName="text-sm h-12 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                prefix={<PiUserBold className="w-[18px] h-[18px] text-gray-400" />}
                {...register('username')}
                error={errors.username?.message}
                disabled={isLoading}
              />

              <Password
                label="Password"
                placeholder="Enter your password"
                size="lg"
                className="[&>label>span]:font-medium [&>label>span]:text-gray-700 dark:[&>label>span]:text-gray-300"
                inputClassName="text-sm h-12 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                prefix={<PiLockKeyBold className="w-[18px] h-[18px] text-gray-400" />}
                {...register('password')}
                error={errors.password?.message}
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <Checkbox
                {...register('rememberMe')}
                label="Remember me"
                className="[&>label>span]:text-sm [&>label>span]:font-normal [&>label>span]:text-gray-600 dark:[&>label>span]:text-gray-400"
                disabled={isLoading}
              />
              <Link
                href={routes.auth.forgotPassword1}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium shadow-lg shadow-blue-600/25 hover:shadow-blue-600/30 transition-all duration-200 mt-2"
              type="submit"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Sign in</span>
                  <PiArrowRightBold className="w-4 h-4" />
                </div>
              )}
            </Button>
          </div>
        )}
      </Form>

      <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          Don&apos;t have an account?{' '}
          <Link
            href={routes.auth.signUp1}
            className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            Create account
          </Link>
        </Text>
      </div>
    </>
  );
}
