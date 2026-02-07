'use client';

import { ReactNode } from 'react';
import { Button } from 'rizzui';
import cn from '@core/utils/class-names';

export interface PageHeaderProps {
  /** Icon component to display */
  icon?: ReactNode;
  /** Page title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Color theme for the icon container */
  color?: 'blue' | 'purple' | 'green' | 'amber' | 'indigo' | 'red' | 'orange' | 'emerald' | 'violet';
  /** Action buttons or elements to display on the right */
  actions?: ReactNode;
  /** Badges to display next to title or below */
  badges?: ReactNode;
  /** Additional className for the container */
  className?: string;
  /** Children to render below the header */
  children?: ReactNode;
}

const colorStyles = {
  blue: {
    bg: 'bg-blue-lighter/70',
    icon: 'text-blue',
  },
  purple: {
    bg: 'bg-purple-lighter/70',
    icon: 'text-purple',
  },
  green: {
    bg: 'bg-green-lighter/70',
    icon: 'text-green',
  },
  amber: {
    bg: 'bg-orange-lighter/70',
    icon: 'text-orange',
  },
  orange: {
    bg: 'bg-orange-lighter/70',
    icon: 'text-orange',
  },
  indigo: {
    bg: 'bg-indigo-lighter/70',
    icon: 'text-indigo',
  },
  red: {
    bg: 'bg-red-lighter/70',
    icon: 'text-red',
  },
  emerald: {
    bg: 'bg-green-lighter/70',
    icon: 'text-green',
  },
  violet: {
    bg: 'bg-purple-lighter/70',
    icon: 'text-purple',
  },
};

/**
 * PageHeader Component
 *
 * A standardized header component for dashboard pages that ensures
 * consistent styling across the application.
 *
 * @example
 * ```tsx
 * <PageHeader
 *   icon={<PiUsers className="h-6 w-6" />}
 *   title="User Management"
 *   subtitle="Manage user accounts and permissions"
 *   color="blue"
 *   actions={<Button>Add User</Button>}
 * />
 * ```
 */
export default function PageHeader({
  icon,
  title,
  subtitle,
  color = 'blue',
  actions,
  badges,
  className,
  children,
}: PageHeaderProps) {
  const styles = colorStyles[color];

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {/* Icon Container (optional) */}
          {icon != null && (
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-lg',
                styles.bg
              )}
            >
              <div className={styles.icon}>{icon}</div>
            </div>
          )}

          {/* Title & Subtitle */}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {title}
              </h1>
              {badges}
            </div>
            {subtitle && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-3">
            {actions}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

/**
 * PageHeaderAction - A styled button for page header actions
 */
export function PageHeaderAction({
  children,
  variant = 'outline',
  onClick,
  className,
  ...props
}: {
  children: ReactNode;
  variant?: 'outline' | 'solid';
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Button
      variant={variant}
      onClick={onClick}
      className={cn('gap-2', className)}
      {...props}
    >
      {children}
    </Button>
  );
}
