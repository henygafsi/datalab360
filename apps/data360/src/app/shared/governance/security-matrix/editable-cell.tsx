'use client';

import { useState, useRef, useEffect } from 'react';
import { Input, Select } from 'rizzui';

type EditableCellProps = {
  value: string | null | undefined;
  onChange: (newValue: string | null) => void;
  type?: 'text' | 'select';
  options?: Array<{ label: string; value: string }>;
  disabled?: boolean;
  placeholder?: string;
};

export default function EditableCell({
  value,
  onChange,
  type = 'text',
  options = [],
  disabled = false,
  placeholder = '—',
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(value ?? '');
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const newVal = localValue.trim() || null;
    if (newVal !== (value ?? null)) {
      onChange(newVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setLocalValue(value ?? '');
      setEditing(false);
    }
  };

  if (disabled) {
    return (
      <span className="text-sm font-medium text-slate-900 dark:text-white">
        {value || placeholder}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full text-left px-2 py-1 -mx-2 -my-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer text-sm text-slate-700 dark:text-slate-300"
      >
        {value || <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>}
      </button>
    );
  }

  if (type === 'select') {
    const allOptions = [{ label: '— None', value: '' }, ...options];
    return (
      <Select
        size="sm"
        options={allOptions}
        value={localValue}
        onChange={(v: any) => {
          const val = v?.value ?? '';
          setLocalValue(val);
          onChange(val || null);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        className="w-full min-w-[120px]"
      />
    );
  }

  return (
    <Input
      ref={inputRef}
      size="sm"
      aria-label={placeholder || 'Edit cell value'}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className="w-full min-w-[100px]"
    />
  );
}
