'use client';

import { Loader2 } from 'lucide-react';

export interface FormLoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  children: React.ReactNode;
}

export default function FormLoadingOverlay({
  isLoading,
  message = 'Enregistrement en cours...',
  children,
}: FormLoadingOverlayProps) {
  return (
    <div className="relative">
      {/* Form content */}
      <div className={isLoading ? 'pointer-events-none opacity-50' : ''}>
        {children}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {message}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Veuillez patienter...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Specialized variant for inline button loading
export function ButtonLoading({
  isLoading,
  loadingText = 'Chargement...',
  children,
}: {
  isLoading: boolean;
  loadingText?: string;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <span className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {loadingText}
      </span>
    );
  }

  return <>{children}</>;
}
