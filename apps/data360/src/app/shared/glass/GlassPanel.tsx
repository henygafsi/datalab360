'use client';

/**
 * GlassPanel — the one frosted surface of the 2026 design system.
 *
 * Wraps the semantic glass DEPTH SCALE from globals.css so no component
 * hand-rolls `rgba(...) + backdrop-filter` again. Pick an elevation:
 *   depth 1 = panel / card / list plane
 *   depth 2 = raised (ContextBar, popover, toolbar)
 *   depth 3 = overlay (destructive dialog only)
 *
 * See the Obsidian `_design-system-2026` proposal §1b.
 */
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type GlassDepth = 1 | 2 | 3;

const DEPTH: Record<GlassDepth, string> = {
  1: 'glass-1',
  2: 'glass-2',
  3: 'glass-3',
};

const RADIUS = {
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
} as const;

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Elevation (1 panel · 2 raised · 3 overlay). Default 1. */
  depth?: GlassDepth;
  /** Corner radius. Default xl. */
  radius?: keyof typeof RADIUS;
}

const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(function GlassPanel(
  { depth = 1, radius = 'xl', className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn(DEPTH[depth], RADIUS[radius], className)} {...rest}>
      {children}
    </div>
  );
});

export default GlassPanel;
