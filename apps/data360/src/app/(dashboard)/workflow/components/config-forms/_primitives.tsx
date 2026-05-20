'use client';

/**
 * Lightweight form primitives shared between the ETL sidebar shell and the
 * lazy-loaded config forms.
 *
 * Kept deliberately separate from `_shared.tsx`: `ETLConfigSidebar.tsx` imports
 * `FormField` + `Input` for its always-visible "Component Name" field, and
 * those must NOT drag the heavy `CodeEditor` / `AIGenerateDrawer` (and their
 * Cortex + react-hot-toast deps) into the eager workflow chunk.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}

export const FormField: React.FC<FormFieldProps> = ({ label, error, required, children, hint }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {hint && !error && (
      <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    )}
    {error && (
      <p className="text-xs text-red-500 flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        {error}
      </p>
    )}
  </div>
);

interface InputProps {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  type?: string;
}

export const Input: React.FC<InputProps> = ({ value, onChange, placeholder, disabled, error, type = 'text' }) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    className={cn(
      'w-full px-3 py-2 rounded-lg border',
      'bg-white dark:bg-slate-800',
      'text-sm text-slate-800 dark:text-slate-100',
      'placeholder:text-slate-400',
      'focus:outline-none focus:ring-2 focus:ring-blue-500',
      error ? 'border-red-500' : 'border-slate-200 dark:border-slate-700',
      disabled && 'opacity-50 cursor-not-allowed'
    )}
  />
);
