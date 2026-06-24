'use client';

/**
 * ManageAccessButton — one-line mount for the cross-page "Manage access" panel.
 *
 * Renders a small header/toolbar button that opens a right-side Drawer hosting
 * <AccessManagementPanel> for the given module/page. Self-contained (brings its
 * own Drawer + react-hot-toast via the panel) so a page only needs:
 *
 *   <ManageAccessButton module="data-products" page="data-products" />
 *
 * Light theme, no reskin. Reuses rizzui Button + Drawer.
 */
import React, { useState } from 'react';
import { Button, Drawer } from 'rizzui';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import AccessManagementPanel, {
  type AccessManagementPanelProps,
} from './AccessManagementPanel';

interface ManageAccessButtonProps extends AccessManagementPanelProps {
  /** Optional className passthrough for the trigger button. */
  className?: string;
  /** Button visual size (rizzui). Defaults to 'sm'. */
  buttonSize?: 'sm' | 'md' | 'lg';
  /** Compact (icon-only) trigger. */
  iconOnly?: boolean;
}

const ManageAccessButton: React.FC<ManageAccessButtonProps> = ({
  className,
  buttonSize = 'sm',
  iconOnly = false,
  ...panelProps
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size={buttonSize}
        variant="outline"
        className={cn('gap-1.5', className)}
        onClick={() => setOpen(true)}
        title="Manage access"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        {!iconOnly && 'Manage access'}
      </Button>

      <Drawer isOpen={open} onClose={() => setOpen(false)} placement="right" size="md">
        <AccessManagementPanel {...panelProps} />
      </Drawer>
    </>
  );
};

export default ManageAccessButton;
