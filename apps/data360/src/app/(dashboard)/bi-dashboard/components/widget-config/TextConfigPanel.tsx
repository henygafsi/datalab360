'use client';

/**
 * TextConfigPanel — inline (docked) text-widget form for BiSmartRightBar's
 * Configure section. Replaces the fixed right-drawer the text tile used to
 * open from ChartPaletteRail / AddWidgetPanel — same fields, no popup.
 */
import { useState } from 'react';
import { Loader2, Type } from 'lucide-react';
import { useCanPerform } from '@/hooks/useCanPerform';

interface TextConfigPanelProps {
  onSave: (title: string, content: string) => Promise<void>;
  onClose: () => void;
}

export default function TextConfigPanel({ onSave, onClose }: TextConfigPanelProps) {
  // Action-RBAC gate (System 2): saving is POST /widgets
  // (require_action 'bi_reporting','create'). Fail-open while loading.
  const createPerm = useCanPerform('bi_reporting', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (saving) return;
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(title.trim(), content);
      setTitle('');
      setContent('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <div className="mb-1 flex items-center gap-1.5">
        <Type className="h-3.5 w-3.5 text-teal-500" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
          Add text widget
        </h3>
      </div>
      <div>
        <label
          htmlFor="text-widget-title"
          className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300"
        >
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="text-widget-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Section header"
          autoFocus
          className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      <div>
        <label
          htmlFor="text-widget-content"
          className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300"
        >
          Content <span className="font-normal text-gray-400">(Markdown)</span>
        </label>
        <textarea
          id="text-widget-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="**Bold**, _italic_, [link](https://…)"
          className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      {error && <p className="text-[11px] text-red-600 dark:text-red-400" role="alert">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !canCreate}
          title={!canCreate ? 'Requires the "create" permission on Business Reporting.' : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {saving ? 'Adding…' : 'Add widget'}
        </button>
      </div>
    </div>
  );
}
