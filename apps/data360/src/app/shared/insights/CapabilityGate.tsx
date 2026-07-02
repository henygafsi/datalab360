'use client';

/**
 * CapabilityGate — declarative wrapper around useCapability.
 *
 *   <CapabilityGate capability="bi.dashboard.publish">
 *     <button onClick={publish}>Publish</button>
 *   </CapabilityGate>
 *
 * Reaction follows the capability map (src/config/capabilities.ts):
 *   · hide    → children are not rendered (optional `fallback` instead);
 *   · disable → children stay visible but inert (pointer-events off, dimmed)
 *               with the real denial reason as a native tooltip — no popups.
 *
 * While the permission sources load, `hide` renders nothing (no
 * flash-of-forbidden-UI) and `disable` renders the children inert with a
 * "Checking your access…" tooltip. This is a UI affordance layer only — the
 * backend gates cited in capabilities.ts remain the enforcement.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CapabilityKey, UiBehavior } from '@/config/capabilities';
import { useCapability } from '@/hooks/useCapability';

export interface CapabilityGateProps {
  /** Key into the CAPABILITIES map. */
  capability: CapabilityKey;
  /** Project to evaluate project-role requirements against (defaults to the module's active project). */
  projectId?: string | null;
  /** Override the map's uiBehavior for this surface only. */
  behavior?: UiBehavior;
  /** Rendered instead of the children when hidden (hide behavior only). */
  fallback?: ReactNode;
  /** Extra classes for the disable-mode wrapper. */
  className?: string;
  children: ReactNode;
}

export default function CapabilityGate({
  capability,
  projectId,
  behavior,
  fallback = null,
  className,
  children,
}: CapabilityGateProps) {
  const cap = useCapability(capability, projectId !== undefined ? { projectId } : undefined);
  const mode: UiBehavior = behavior ?? cap.behavior;

  if (cap.allowed && !cap.loading) return <>{children}</>;

  if (mode === 'hide') {
    // Nothing while loading either — never flash a capability the user may not have.
    return cap.loading ? null : <>{fallback}</>;
  }

  // disable — keep the affordance discoverable, carry the honest reason.
  const title = cap.loading
    ? 'Checking your access…'
    : (cap.reason ?? 'Not available for your role.');
  return (
    <span
      className={cn('inline-flex cursor-not-allowed', className)}
      title={title}
      aria-disabled="true"
      aria-busy={cap.loading || undefined}
      data-capability={capability}
      data-capability-state={cap.loading ? 'loading' : 'denied'}
    >
      <span className="pointer-events-none opacity-50 grayscale-[25%]">{children}</span>
    </span>
  );
}
