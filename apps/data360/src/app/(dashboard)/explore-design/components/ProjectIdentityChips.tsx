'use client';

/**
 * ProjectIdentityChips — the project's IDENTITY, inline in the E&D header:
 *
 *   · icon        — the UnifiedProject.icon vocabulary (backend derives
 *                   'compass' | 'git-branch' | 'folder' from project_type;
 *                   the same mapping is mirrored here for the detail route,
 *                   which doesn't carry the icon field);
 *   · type chip   — product / technical, from an explicit `type:` tag or
 *                   derived from project_type (see getIdentityTypeChip);
 *   · free tags   — editable INLINE, no popup: click the tag row → an input
 *                   appears in place; Enter adds, Backspace on empty removes
 *                   the last tag, Escape/blur closes. Saves via
 *                   PUT /projects/{project_id} (tags field), preserving
 *                   reserved machine tags (build:/type:/compliance:).
 *
 * Self-contained: fetches its own project row (backend-shared cache) and
 * re-syncs on SSE project invalidation. Optimistic save with revert+toast on
 * failure (the backend 403s for non-editors — surfaced honestly).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Folder, GitBranch, Loader2, Plus, Tag, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip } from 'rizzui';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  CACHE_KEYS,
  useOnCacheInvalidation,
} from '@/components/providers/CacheInvalidationProvider';
import { getProject, updateProject } from '@/app/services/api/projectsApi';
import type { Project } from '@/app/services/api/types';
import {
  getDisplayTags,
  getIdentityTypeChip,
  getReservedTags,
} from '@/components/project-onboarding/project-listing-utils';

// Mirror of the backend's UnifiedProject icon vocabulary (services.py
// type_icons: explore_design → compass, workflow → git-branch, else folder).
const ICON_BY_TYPE: Record<string, LucideIcon> = {
  explore_design: Compass,
  workflow: GitBranch,
};

const TYPE_CHIP_CLASS: Record<'product' | 'technical', string> = {
  product:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300',
  technical:
    'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
};

const MAX_TAG_LEN = 40;

export default function ProjectIdentityChips({
  projectId,
  readOnly = false,
  className,
}: {
  projectId: string;
  /** View-only sessions render the identity but cannot edit tags. */
  readOnly?: boolean;
  className?: string;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchProject = useCallback(async () => {
    try {
      const p = await getProject(projectId);
      setProject(p);
      setTags(p.tags ?? []);
    } catch {
      // Header chip is decorative-first: a failed fetch just renders nothing.
      setProject(null);
    }
  }, [projectId]);

  useEffect(() => {
    setProject(null);
    setTags([]);
    setEditing(false);
    void fetchProject();
  }, [fetchProject]);

  useOnCacheInvalidation(new Set([CACHE_KEYS.PROJECTS]), () => {
    // Skip the SSE re-sync mid-edit so a colleague's save doesn't clobber the
    // input; the post-save refetch below reconciles.
    if (!editing && !saving) void fetchProject();
  });

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const displayTags = useMemo(() => getDisplayTags(tags), [tags]);
  const typeChip = useMemo(
    () => getIdentityTypeChip(tags, project?.project_type),
    [tags, project?.project_type],
  );

  const saveTags = useCallback(
    async (nextDisplay: string[]) => {
      const prev = tags;
      const next = [...getReservedTags(prev), ...nextDisplay];
      setTags(next); // optimistic
      setSaving(true);
      try {
        await updateProject(projectId, { tags: next });
      } catch (err) {
        setTags(prev); // revert — never pretend a denied write succeeded
        toast.error(getApiErrorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [projectId, tags],
  );

  const addDraft = useCallback(() => {
    const t = draft.trim().slice(0, MAX_TAG_LEN);
    setDraft('');
    if (!t) return;
    if (displayTags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    void saveTags([...displayTags, t]);
  }, [draft, displayTags, saveTags]);

  const removeTag = useCallback(
    (t: string) => {
      void saveTags(displayTags.filter((x) => x !== t));
    },
    [displayTags, saveTags],
  );

  if (!project) return null;

  const TypeIcon = ICON_BY_TYPE[project.project_type] ?? Folder;

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {/* Icon — the project's UnifiedProject icon, with identity tooltip. */}
      <Tooltip
        content={
          <span className="block max-w-[220px] text-left">
            <span className="font-semibold">{project.project_name}</span>
            {project.description ? <><br />{project.description}</> : null}
          </span>
        }
        placement="bottom"
      >
        <span
          aria-label={`Project type: ${project.project_type}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
        >
          <TypeIcon className="h-3 w-3" aria-hidden />
        </span>
      </Tooltip>

      {/* Type chip — product / technical. */}
      {typeChip && (
        <Tooltip
          content={
            typeChip.explicit
              ? 'Identity set explicitly via a type: tag'
              : 'Derived from the project module — add a type:product or type:technical tag to override'
          }
          placement="bottom"
        >
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
              TYPE_CHIP_CLASS[typeChip.kind],
            )}
          >
            {typeChip.label}
          </span>
        </Tooltip>
      )}

      {/* Free-form tags — inline editable, no popup. */}
      <div
        role="group"
        aria-label="Project tags"
        className="flex min-w-0 flex-wrap items-center gap-1"
      >
        {displayTags.map((t) => (
          <span
            key={t}
            className="group/tag inline-flex max-w-[120px] items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <Tag className="h-2.5 w-2.5 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">{t}</span>
            {!readOnly && (
              // `invisible` (not `hidden`) so the × always reserves its width —
              // a hover-reveal that grows the chip shifts the whole row and
              // makes neighbouring targets unstable mid-click.
              <button
                type="button"
                onClick={() => removeTag(t)}
                disabled={saving}
                aria-label={`Remove tag ${t}`}
                className="invisible inline-flex shrink-0 rounded-full text-slate-400 hover:text-red-500 group-hover/tag:visible"
              >
                <X className="h-2.5 w-2.5" aria-hidden />
              </button>
            )}
          </span>
        ))}

        {!readOnly && (
          editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDraft();
                } else if (e.key === 'Backspace' && draft === '') {
                  e.preventDefault();
                  const last = displayTags[displayTags.length - 1];
                  if (last) removeTag(last);
                } else if (e.key === 'Escape') {
                  setDraft('');
                  setEditing(false);
                }
              }}
              onBlur={() => {
                addDraft();
                setEditing(false);
              }}
              maxLength={MAX_TAG_LEN}
              placeholder="add tag…"
              aria-label="Add a tag (Enter to add, Backspace to remove the last one)"
              className="h-5 w-20 rounded-full border border-blue-300 bg-white px-1.5 text-[10px] text-slate-700 outline-none placeholder:text-slate-400 focus:ring-1 focus:ring-blue-400 dark:border-blue-700 dark:bg-slate-900 dark:text-slate-200"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit tags inline"
              title="Add a free-form tag (saved to the project)"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-400 hover:border-blue-400 hover:text-blue-500 dark:border-slate-600 dark:hover:border-blue-500"
            >
              {saving ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-2.5 w-2.5" aria-hidden />
              )}
              tag
            </button>
          )
        )}
      </div>
    </div>
  );
}
