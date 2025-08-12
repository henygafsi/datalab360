// components/ModuleMultiSelect.tsx
import { useState } from 'react';

export default function ModuleMultiSelect({
  allModules,
  value,
  onChange,
}: {
  allModules: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = (m: string) => {
    if (!value.includes(m)) onChange([...value, m]);
    setInput('');
  };
  const remove = (m: string) => onChange(value.filter((x) => x !== m));

  return (
    <div className="rounded border p-3">
      <div className="mb-2 flex flex-wrap gap-2">
        {value.map((m) => (
          <span
            key={m}
            className="flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
          >
            {m}
            <button onClick={() => remove(m)}>&times;</button>
          </span>
        ))}
      </div>

      <input
        className="w-full rounded border px-2 py-1 text-sm"
        placeholder="Type module & press Enter"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && input.trim()) {
            e.preventDefault();
            add(input.trim());
          }
        }}
        list="module-list"
      />

      {/* simple datalist dropdown */}
      <datalist id="module-list">
        {allModules.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}
