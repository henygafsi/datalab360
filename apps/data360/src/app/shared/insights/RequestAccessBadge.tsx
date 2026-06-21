'use client';

/**
 * RequestAccessBadge — a small "Request access" button for any data asset.
 *
 * Renders a compact pill button. On click it opens a minimal inline dialog
 * where the user picks a privilege (SELECT / REFERENCES) and optionally gives a
 * reason, then POSTs createAccessRequest. Toast the resulting owner on success;
 * surface the real error (no fake messages) on failure.
 *
 * Any authenticated user may request — no RBAC gate on this action.
 * The badge is intentionally small (size="sm") so it can sit inline with
 * catalog table rows, Explore-Design panels, etc.
 *
 * Props:
 *   assetFqn   — fully-qualified asset name (e.g. "DB.SCHEMA.TABLE")
 *   assetType  — optional asset type label (defaults to 'TABLE')
 *   className  — extra tailwind classes for the trigger button
 */

import { useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  createAccessRequest,
  type CreateAccessRequestBody,
} from '@/app/services/access-requests';

export interface RequestAccessBadgeProps {
  assetFqn: string;
  assetType?: 'TABLE' | 'VIEW' | 'DATA_PRODUCT';
  className?: string;
}

type Privilege = 'SELECT' | 'REFERENCES';

export default function RequestAccessBadge({
  assetFqn,
  assetType = 'TABLE',
  className,
}: RequestAccessBadgeProps) {
  const [open, setOpen] = useState(false);
  const [privilege, setPrivilege] = useState<Privilege>('SELECT');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = () => {
    setPrivilege('SELECT');
    setReason('');
    setError(null);
    setOpen(true);
  };

  const handleClose = () => {
    if (!loading) setOpen(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const body: CreateAccessRequestBody = {
        asset_fqn: assetFqn,
        asset_type: assetType,
        privilege,
        reason: reason.trim() || undefined,
      };
      const result = await createAccessRequest(body);
      toast({
        title: 'Access request submitted',
        description: `Pending approval from ${result.owner || 'asset owner'}.`,
      });
      setOpen(false);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-0.5 text-[10px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20',
          className,
        )}
      >
        <KeyRound className="h-3 w-3" aria-hidden />
        Request access
      </button>

      {/* Inline dialog overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="req-access-title"
            className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              aria-label="Close"
              className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>

            <h2
              id="req-access-title"
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white"
            >
              <KeyRound className="h-4 w-4 text-blue-500" />
              Request access
            </h2>

            <p className="mt-1 break-all text-[11px] text-slate-500 dark:text-slate-400">
              {assetFqn}
            </p>

            <div className="mt-4 space-y-3">
              {/* Privilege select */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="req-privilege"
                  className="text-[11px] font-medium text-slate-700 dark:text-slate-300"
                >
                  Privilege
                </label>
                <select
                  id="req-privilege"
                  value={privilege}
                  onChange={(e) => setPrivilege(e.target.value as Privilege)}
                  disabled={loading}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="SELECT">SELECT — read data</option>
                  <option value="REFERENCES">REFERENCES — reference in foreign keys</option>
                </select>
              </div>

              {/* Reason textarea */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="req-reason"
                  className="text-[11px] font-medium text-slate-700 dark:text-slate-300"
                >
                  Reason{' '}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="req-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={loading}
                  rows={3}
                  placeholder="Why do you need access?"
                  className="resize-none rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-600"
                />
              </div>

              {/* Error */}
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                >
                  {error}
                </p>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {loading ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
