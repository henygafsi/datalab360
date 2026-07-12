'use client';

/**
 * ProjectCrudControls — compact project CRUD for the right bar's Overview
 * (Actions section, no table selected). Completes the project lifecycle from
 * the E&D page itself:
 *
 *   · rename        — inline input, PUT /projects/{id} (project_name)
 *   · description   — inline textarea, PUT /projects/{id} (description)
 *   · delete        — typed-name confirm (shared ConfirmDestructiveDialog,
 *                     tier="hard"), DELETE /projects/{id}
 *
 * Create stays where it was (InlineProjectWizard via the header selector).
 * Honest gating: when `canWrite` is false the icon buttons render disabled
 * with a tooltip — never hidden, never a fake success. All mutations surface
 * backend errors via getApiErrorMessage (the API 403s for non-editors).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlignLeft, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Tooltip } from 'rizzui';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import { ConfirmDestructiveDialog } from '@/components/ui/confirm-dialog';
import { deleteProject, getProject, updateProject } from '@/app/services/api/projectsApi';
import type { Project } from '@/app/services/api/types';

const READ_ONLY_HINT = 'View-only access — ask an owner or editor';

export default function ProjectCrudControls({
  projectId,
  projectName,
  canWrite,
  onRenamed,
  onDeleted,
}: {
  projectId: string;
  /** Display name from the page (fallback while the row loads). */
  projectName: string;
  /** False for viewer sessions — buttons disable with an honest tooltip. */
  canWrite: boolean;
  /** Called with the new name after a successful rename. */
  onRenamed?: (name: string) => void;
  /** Called after a successful delete — clear selection + refresh lists. */
  onDeleted?: () => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [mode, setMode] = useState<'idle' | 'rename' | 'describe'>('idle');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setMode('idle');
    getProject(projectId)
      .then((p) => { if (!cancelled) setProject(p); })
      .catch(() => { /* decorative fetch — name prop still renders */ });
    return () => { cancelled = true; };
  }, [projectId]);

  const name = project?.project_name || projectName;
  const description = project?.description ?? '';

  const startEdit = useCallback((next: 'rename' | 'describe') => {
    setDraft(next === 'rename' ? name : description);
    setMode(next);
  }, [name, description]);

  const save = useCallback(async () => {
    const value = draft.trim();
    if (mode === 'rename' && !value) {
      toast.error('Project name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const body = mode === 'rename' ? { project_name: value } : { description: value };
      const updated = await updateProject(projectId, body);
      setProject(updated);
      setMode('idle');
      if (mode === 'rename') {
        onRenamed?.(updated.project_name || value);
        toast.success('Project renamed');
      } else {
        toast.success('Description updated');
      }
    } catch (err) {
      // Never pretend a denied write succeeded — surface the backend error.
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [draft, mode, projectId, onRenamed]);

  const doDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteProject(projectId);
      setConfirmOpen(false);
      toast.success(`Project "${name}" deleted`);
      onDeleted?.();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }, [projectId, name, onDeleted]);

  const iconBtn =
    'inline-flex items-center justify-center rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-300';

  return (
    <div className="px-4 pt-3">
      <div className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-800 dark:text-slate-200" title={name}>
            {name}
          </span>
          <Tooltip content={canWrite ? 'Rename project' : READ_ONLY_HINT}>
            <button
              type="button"
              aria-label="Rename project"
              disabled={!canWrite || saving}
              onClick={() => startEdit('rename')}
              className={iconBtn}
            >
              <Pencil className="h-3 w-3" aria-hidden />
            </button>
          </Tooltip>
          <Tooltip content={canWrite ? 'Edit description' : READ_ONLY_HINT}>
            <button
              type="button"
              aria-label="Edit project description"
              disabled={!canWrite || saving}
              onClick={() => startEdit('describe')}
              className={iconBtn}
            >
              <AlignLeft className="h-3 w-3" aria-hidden />
            </button>
          </Tooltip>
          <Tooltip content={canWrite ? 'Delete project' : READ_ONLY_HINT}>
            <button
              type="button"
              aria-label="Delete project"
              disabled={!canWrite || deleting}
              onClick={() => setConfirmOpen(true)}
              className={cn(iconBtn, 'hover:text-red-600 dark:hover:text-red-400')}
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Trash2 className="h-3 w-3" aria-hidden />}
            </button>
          </Tooltip>
        </div>

        {mode === 'idle' && description && (
          <p className="mt-1 line-clamp-2 text-[10px] text-slate-400" title={description}>{description}</p>
        )}

        {mode !== 'idle' && (
          <div className="mt-2 space-y-1.5">
            {mode === 'rename' ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void save(); }
                  if (e.key === 'Escape') setMode('idle');
                }}
                maxLength={120}
                aria-label="New project name"
                className="w-full rounded-md border border-blue-300 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:ring-1 focus:ring-blue-400 dark:border-blue-700 dark:bg-slate-900 dark:text-slate-200"
              />
            ) : (
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setMode('idle'); }}
                rows={3}
                maxLength={500}
                aria-label="Project description"
                placeholder="What is this project for?"
                className="w-full resize-none rounded-md border border-blue-300 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none placeholder:text-slate-400 focus:ring-1 focus:ring-blue-400 dark:border-blue-700 dark:bg-slate-900 dark:text-slate-200"
              />
            )}
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setMode('idle')}
                disabled={saving}
                className="rounded-md px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />}
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Typed-name confirm — the shared destructive-dialog pattern (same as
          workflow/service deletes), tier="hard". */}
      <ConfirmDestructiveDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tier="hard"
        title="Delete project"
        body={
          <>
            This deletes the project <span className="font-semibold">{name}</span> and its
            drafts/metadata from Data360. Warehouse objects already deployed are NOT dropped.
          </>
        }
        resourceLabel="project"
        resourceName={name}
        loading={deleting}
        onConfirm={() => void doDelete()}
      />
    </div>
  );
}
