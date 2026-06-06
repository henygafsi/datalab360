'use client';

/**
 * PermissionGate — content-level Data360 Action-RBAC gate (System 2).
 *
 * Wraps a section/tab/panel and, when the current user lacks the required action,
 * renders an explicit, UX-friendly "access restricted" state instead of the
 * content (never a blank). Use it to gate whole action surfaces; use
 * `PermissionGatedButton` to gate individual CTAs.
 *
 *   <PermissionGate module="workflow" action="create" projectId={projectId}>
 *     <PipelineBuilder />
 *   </PermissionGate>
 *
 * Backed by `useCanPerform`, which fail-opens on a hard backend error (so a
 * transient hiccup never locks a user out) and re-resolves live when the admin
 * edits the matrix (SSE → invalidateMyPermissions).
 */
import * as React from 'react';
import { Lock } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { useCanPerform } from '@/hooks/useCanPerform';

export interface PermissionGateProps {
  /** action-registry module key (e.g. 'workflow'). */
  module: string;
  /** action key (e.g. 'create', 'execute', 'deploy'). */
  action: string;
  /** Project scope for the check (forwarded to useCanPerform). */
  projectId?: string | null;
  /** Headline for the denied state. */
  title?: string;
  /** Supporting copy for the denied state. */
  description?: string;
  /** Render this instead of the default denied EmptyState. */
  fallback?: React.ReactNode;
  /** Render nothing (instead of the denied state) when access is denied. */
  hideWhenDenied?: boolean;
  /** Tighter padding for inline use inside cards/tabs. */
  compact?: boolean;
  children: React.ReactNode;
}

export default function PermissionGate({
  module,
  action,
  projectId,
  title,
  description,
  fallback,
  hideWhenDenied = false,
  compact = false,
  children,
}: PermissionGateProps) {
  const { allowed, loading } = useCanPerform(module, action, projectId);

  // While the allow-set is still loading, show a quiet placeholder rather than
  // the content — this avoids briefly flashing restricted content to a user who
  // will turn out to be denied (the cache is shared + warms after the first page).
  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        className={`flex items-center justify-center ${compact ? 'py-8' : 'py-12'}`}
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent dark:border-slate-600 dark:border-t-transparent" />
        <span className="sr-only">Checking permissions…</span>
      </div>
    );
  }

  if (allowed) return <>{children}</>;
  if (hideWhenDenied) return null;
  if (fallback) return <>{fallback}</>;

  return (
    <EmptyState
      icon={Lock}
      compact={compact}
      title={title ?? 'Access restricted'}
      description={
        description ??
        `You don't have the "${action}" permission on this section. Ask an administrator to grant it in Admin → Data360 config → Action RBAC.`
      }
    />
  );
}
