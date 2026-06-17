'use client';

import { useState } from 'react';
import { Button, Input } from 'rizzui';
import toast from 'react-hot-toast';
import { HiOutlineFolderPlus, HiOutlineXMark } from 'react-icons/hi2';
import { createInternalStage } from './connectionServices';
import { useCanPerform } from '@/hooks/useCanPerform';

/**
 * Inline creator for an internal Snowflake stage (raw zone, no cloud
 * integration) — wires the orphaned `POST /connect/stages/internal`. Lets a
 * no-code user spin up an upload target before any external source exists.
 * Creating a stage maps to the connect:create action (System-2 RBAC); the CTA
 * is gated with useCanPerform('connect','create') and fail-opens while loading.
 */
export default function InternalStageCreator({ onCreated }: { onCreated?: (stageName: string) => void }) {
  const [open, setOpen] = useState(false);
  const [stageName, setStageName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createPerm = useCanPerform('connect', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;
  const createDeniedReason =
    'You lack the "create" permission on connect. Ask an administrator to grant it.';

  // Snowflake identifier guard: letters, digits, underscores; must start with a letter/underscore.
  const trimmed = stageName.trim();
  const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed);

  const submit = async () => {
    if (!valid) {
      setError('Use letters, digits and underscores only; start with a letter or underscore.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await createInternalStage(trimmed);
      toast.success(res.message || `Internal stage '${trimmed}' created.`);
      onCreated?.(trimmed);
      setStageName('');
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create internal stage';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={!canCreate}
        title={!canCreate ? createDeniedReason : undefined}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-700 dark:hover:bg-blue-950/30"
      >
        <HiOutlineFolderPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        Create internal stage
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <HiOutlineFolderPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          New internal stage
        </h4>
        <button
          onClick={() => { setOpen(false); setError(null); }}
          aria-label="Cancel"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <HiOutlineXMark className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        An internal stage is a managed Snowflake storage area you can upload files to directly — no cloud bucket or storage integration required.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Input
            placeholder="e.g. RAW_UPLOADS"
            value={stageName}
            onChange={(e) => { setStageName(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && valid && !submitting) void submit(); }}
            error={error ?? undefined}
            disabled={submitting}
          />
        </div>
        <Button
          onClick={() => void submit()}
          isLoading={submitting}
          disabled={!valid || submitting || !canCreate}
          title={!canCreate ? createDeniedReason : undefined}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          Create stage
        </Button>
      </div>
    </div>
  );
}
