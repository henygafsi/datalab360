import Image from 'next/image';
import Link from 'next/link';
import logoImg from '@public/logo-primary.svg';
import SignUpForm from './sign-up-form';
import { metaObject } from '@/config/site.config';

export const metadata = {
  ...metaObject('Sign Up'),
};

export default function SignUp() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Subtle background pattern */}
      <div
        className="fixed inset-0 opacity-[0.015] dark:opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }}
      />

      <div className="w-full max-w-[420px] relative">
        {/* Form card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl shadow-gray-200/60 dark:shadow-none border border-gray-100 dark:border-gray-800 p-8 sm:p-10">
          {/* Logo inside card */}
          <div className="mb-8 text-center">
              <Image
                src={logoImg}
                alt="Data360"
                className="h-15 w-auto mx-auto"
              />
          
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Fill in your details to get started
            </p>
          </div>

          <SignUpForm />
        </div>

        {/* Footer text */}
        <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
          Secured with enterprise-grade encryption
        </p>
      </div>
    </div>
  );
}
