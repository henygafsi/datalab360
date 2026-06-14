'use client';

/**
 * ConfigShell — lets a widget-config form render either as a centered Modal
 * (legacy) OR inline inside the BI right panel (no popup — the Data360 pattern).
 *
 * The three config modals (Chart / KpiCard / Table) wrap their entire body in
 * this shell. With `variant="modal"` it renders the rizzui <Modal>; with
 * `variant="panel"` it renders the children bare so the BiSmartRightBar can host
 * the same form docked on the right. No form logic changes — only the chrome.
 */
import { Modal } from 'rizzui';
import type { ReactNode } from 'react';

export type ConfigVariant = 'modal' | 'panel';

export default function ConfigShell({
  variant = 'modal',
  isOpen,
  onClose,
  customSize,
  children,
}: {
  variant?: ConfigVariant;
  isOpen: boolean;
  onClose: () => void;
  customSize?: string;
  children: ReactNode;
}) {
  if (variant === 'panel') return <>{children}</>;
  return (
    <Modal isOpen={isOpen} onClose={onClose} customSize={customSize}>
      {children}
    </Modal>
  );
}
