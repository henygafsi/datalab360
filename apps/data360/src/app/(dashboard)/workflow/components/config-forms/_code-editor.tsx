'use client';

/**
 * Lightweight SQL/Python code editor (no Monaco/CodeMirror dependency).
 *
 * Isolated in its own file so it only lands in the chunks of the two forms
 * that use it (`sql-script-config-form`, `python-script-config-form`) instead
 * of being inlined into all 75 form chunks via `_shared.tsx`.
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: 'sql' | 'python';
  placeholder?: string;
  error?: boolean;
  rows?: number;
  ariaLabel: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value, onChange, language, placeholder, error, rows = 14, ariaLabel,
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = React.useRef<HTMLDivElement | null>(null);

  // Compute line numbers from the current value (at least `rows` lines for empty editor)
  const lineCount = Math.max((value.match(/\n/g)?.length ?? 0) + 1, 1);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Tab handling — insert 2 spaces instead of switching focus
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${value.substring(0, start)}  ${value.substring(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  // Keep gutter scroll in sync with textarea scroll
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  return (
    <div
      className={cn(
        'flex rounded-lg border overflow-hidden',
        'bg-slate-50 dark:bg-slate-900',
        error ? 'border-red-500' : 'border-slate-200 dark:border-slate-700',
        'focus-within:ring-2 focus-within:ring-blue-500'
      )}
      aria-label={ariaLabel}
    >
      <div
        ref={gutterRef}
        aria-hidden="true"
        className={cn(
          'select-none text-right pt-2 pb-2 pr-2 pl-3',
          'text-xs font-mono leading-5',
          'text-slate-400 dark:text-slate-500',
          'bg-slate-100 dark:bg-slate-800/70',
          'border-r border-slate-200 dark:border-slate-700',
          'overflow-hidden'
        )}
        style={{ minWidth: '2.5rem' }}
      >
        {lineNumbers.map((n) => (
          <div key={n}>{n}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        placeholder={placeholder}
        rows={rows}
        spellCheck={false}
        wrap="off"
        data-language={language}
        className={cn(
          'flex-1 px-3 py-2 bg-transparent resize-y',
          'text-xs font-mono leading-5',
          'text-slate-800 dark:text-slate-100',
          'placeholder:text-slate-400',
          'focus:outline-none'
        )}
      />
    </div>
  );
};
