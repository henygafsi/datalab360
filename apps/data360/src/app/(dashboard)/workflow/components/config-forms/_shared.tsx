'use client';

/**
 * Lightweight shared primitives + helpers used by the lazy-loaded ETL config
 * forms (never by the eager `ETLConfigSidebar.tsx` shell).
 *
 * Deliberately kept lean: it carries no heavy deps so webpack can inline it
 * cheaply into every form chunk. The expensive `CodeEditor` and
 * `AIGenerateDrawer` (Cortex + react-hot-toast) live in their own files
 * (`_code-editor.tsx`, `_ai-drawer.tsx`) so they only land in the SQL/Python
 * form chunks.
 *
 * Exports:
 *   - <FormField> / <Input>  re-exported from `_primitives` for convenience
 *   - <Select> / <MultiSelect> / <Textarea>
 *   - extractString / normalizeToStringArray  list-normalisation helpers
 *   - _uid                   stable list key generator
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

// Re-export the lightweight primitives so form files have a single import site.
export { FormField, Input } from './_primitives';

// Unique ID generator for list item keys (avoids key={index} anti-pattern)
let _uidCounter = 0;
export const _uid = () => `_uid_${Date.now()}_${++_uidCounter}`;

// ============================================
// FORM COMPONENTS
// ============================================

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
}

export const Select: React.FC<SelectProps> = ({ value, onChange, options, placeholder, disabled, error }) => (
  <div className="relative">
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'w-full px-3 py-2 rounded-lg border appearance-none',
        'bg-white dark:bg-slate-800',
        'text-sm text-slate-800 dark:text-slate-100',
        'focus:outline-none focus:ring-2 focus:ring-blue-500',
        error ? 'border-red-500' : 'border-slate-200 dark:border-slate-700',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
  </div>
);

interface MultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({ values, onChange, options, placeholder, disabled }) => (
  <select
    multiple
    value={values}
    onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
    disabled={disabled}
    className={cn(
      'w-full px-3 py-2 rounded-lg border h-32',
      'bg-white dark:bg-slate-800',
      'text-sm text-slate-800 dark:text-slate-100',
      'focus:outline-none focus:ring-2 focus:ring-blue-500',
      'border-slate-200 dark:border-slate-700',
      disabled && 'opacity-50 cursor-not-allowed'
    )}
  >
    {options.map((opt) => (
      <option key={opt} value={opt}>{opt}</option>
    ))}
  </select>
);

interface TextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  rows?: number;
  className?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ value, onChange, placeholder, disabled, error, rows = 4, className }) => (
  <textarea
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    rows={rows}
    className={cn(
      'w-full px-3 py-2 rounded-lg border resize-y',
      'bg-white dark:bg-slate-800',
      'text-sm text-slate-800 dark:text-slate-100',
      'placeholder:text-slate-400',
      'focus:outline-none focus:ring-2 focus:ring-blue-500',
      error ? 'border-red-500' : 'border-slate-200 dark:border-slate-700',
      disabled && 'opacity-50 cursor-not-allowed',
      className
    )}
  />
);

// ============================================
// HELPER FUNCTIONS
// ============================================

export const extractString = (item: unknown): string => {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    if ('name' in item) return String((item as { name: unknown }).name);
    if ('value' in item) return String((item as { value: unknown }).value);
  }
  return String(item);
};

export const normalizeToStringArray = (items: unknown): string[] => {
  if (!items) return [];
  if (!Array.isArray(items)) return [];
  return items.map(extractString).filter(Boolean);
};
