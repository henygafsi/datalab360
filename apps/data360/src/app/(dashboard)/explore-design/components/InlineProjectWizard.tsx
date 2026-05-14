'use client';

/**
 * InlineProjectWizard — slide-1 redesign of project creation.
 *
 * Replaces the ProjectSelector modal's create flow with an inline,
 * multi-step wizard that lives in the page surface (no popup).
 *
 * Flow:
 *   1. Name + description
 *   2. Optional tags + source tables (skippable)
 *   3. Submit → create + emit onCreated(projectId)
 *
 * Designed to render under the page header when the user clicks
 * "New project". Caller controls its lifecycle via the `open` prop and
 * collapses it on success.
 */
import { useCallback, useState } from 'react';
import { Button, Input, Textarea } from 'rizzui';
import { toast } from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createExploreProject } from '@/app/services/api/exploreDesignApi';
import type { CreateExploreProjectRequest } from '@/app/services/api/types';

export interface InlineProjectWizardProps {
  open: boolean;
  /** Called with the new project's id after successful creation. */
  onCreated: (projectId: string, projectName: string) => void;
  /** Called when the user dismisses the wizard. */
  onCancel: () => void;
}

type Step = 0 | 1 | 2;

const STEP_LABELS: Record<Step, string> = {
  0: 'Identify',
  1: 'Context',
  2: 'Confirm',
};

export default function InlineProjectWizard({
  open,
  onCreated,
  onCancel,
}: InlineProjectWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setStep(0);
    setName('');
    setDescription('');
    setTags('');
    setSubmitting(false);
  }, []);

  if (!open) return null;

  const nameError = step === 0 && name.trim().length > 0 && name.trim().length < 3
    ? 'At least 3 characters.'
    : '';
  const canAdvance = step === 0 ? name.trim().length >= 3 : true;

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleNext = () => {
    if (!canAdvance) return;
    if (step < 2) setStep(((step + 1) as Step));
  };

  const handleBack = () => {
    if (step > 0) setStep(((step - 1) as Step));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const body: CreateExploreProjectRequest = {
        project_name: name.trim(),
        description: description.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const res: any = await createExploreProject(body);
      // Backend may wrap in {success, data} or return data directly.
      const created = res?.data ?? res;
      const projectId: string | undefined =
        created?.project_id ?? created?.project?.project_id;
      if (!projectId) {
        throw new Error('Server did not return a project_id');
      }
      toast.success(`Project "${name.trim()}" created`);
      onCreated(projectId, name.trim());
      reset();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        'Could not create project';
      toast.error(typeof msg === 'string' ? msg : 'Could not create project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            New explore project
          </span>
          <div className="flex items-center gap-1.5">
            {([0, 1, 2] as Step[]).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold',
                    s < step && 'border-emerald-500 bg-emerald-500 text-white',
                    s === step && 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
                    s > step && 'border-slate-300 text-slate-400 dark:border-slate-600',
                  )}
                >
                  {s < step ? <Check className="h-3 w-3" /> : s + 1}
                </div>
                <span
                  className={cn(
                    'text-xs',
                    s === step
                      ? 'font-medium text-slate-900 dark:text-white'
                      : 'text-slate-500',
                  )}
                >
                  {STEP_LABELS[s]}
                </span>
                {s < 2 && <div className="h-px w-6 bg-slate-200 dark:bg-slate-700" />}
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          onClick={handleCancel}
          disabled={submitting}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-5">
        {step === 0 && (
          <div className="grid gap-3">
            <Input
              label="Project name"
              placeholder="e.g. retail-customer-360"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={nameError}
              autoFocus
              disabled={submitting}
            />
            <Textarea
              label="Description (optional)"
              placeholder="Short summary of what this project models."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={submitting}
            />
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-3">
            <Input
              label="Tags (comma-separated)"
              placeholder="bi, retail, weekly"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-slate-500">
              You can attach source tables and configure ingestion later from the
              Catalog tab. This wizard only creates the project shell so you can
              start exploring right away.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-2 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="w-24 shrink-0 text-slate-500">Name</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {name.trim()}
              </span>
            </div>
            {description.trim() && (
              <div className="flex items-baseline gap-2">
                <span className="w-24 shrink-0 text-slate-500">Description</span>
                <span className="text-slate-700 dark:text-slate-200">
                  {description.trim()}
                </span>
              </div>
            )}
            {tags.trim() && (
              <div className="flex items-baseline gap-2">
                <span className="w-24 shrink-0 text-slate-500">Tags</span>
                <span className="text-slate-700 dark:text-slate-200">
                  {tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700">
        <Button
          variant="outline"
          size="sm"
          onClick={step === 0 ? handleCancel : handleBack}
          disabled={submitting}
        >
          {step === 0 ? (
            'Cancel'
          ) : (
            <>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </>
          )}
        </Button>
        <div className="text-xs text-slate-400">
          Step {step + 1} of 3
        </div>
        {step < 2 ? (
          <Button size="sm" onClick={handleNext} disabled={!canAdvance || submitting}>
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-1" /> Create project
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
