'use client';

/**
 * PermissionGatedButton — a button that disables itself when the current user
 * lacks the required Data360 action (System 2 RBAC), with an explanatory tooltip.
 *
 * Backed by `useCanPerform(module, action, projectId?)`. Use this instead of
 * hand-rolled `D360_ADMIN_ROLES.includes(role)` gates.
 *
 *   <PermissionGatedButton module="gouvernance" action="create" onClick={...}>
 *     New role
 *   </PermissionGatedButton>
 */
import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useCanPerform } from '@/hooks/useCanPerform';

export interface PermissionGatedButtonProps extends ButtonProps {
  /** action-registry module key (e.g. 'gouvernance'). */
  module: string;
  /** action key (e.g. 'create', 'edit', 'delete'). */
  action: string;
  /** Forward-compat project scope — not yet enforced (PROJECT_ID migration pending). */
  projectId?: string | null;
  /** Tooltip shown when the action is denied. */
  deniedReason?: string;
  /** Render `null` instead of a disabled button when denied. */
  hideWhenDenied?: boolean;
}

const PermissionGatedButton = React.forwardRef<
  HTMLButtonElement,
  PermissionGatedButtonProps
>(function PermissionGatedButton(
  {
    module,
    action,
    projectId,
    deniedReason,
    hideWhenDenied = false,
    disabled,
    title,
    children,
    ...rest
  },
  ref
) {
  const { allowed, loading } = useCanPerform(module, action, projectId);

  if (!allowed && !loading && hideWhenDenied) return null;

  const denied = !allowed && !loading;
  const reason =
    deniedReason ?? `Requires the "${action}" permission on ${module}.`;

  return (
    <Button
      ref={ref}
      disabled={disabled || loading || denied}
      title={denied ? reason : title}
      aria-disabled={disabled || loading || denied}
      {...rest}
    >
      {children}
    </Button>
  );
});

export default PermissionGatedButton;
