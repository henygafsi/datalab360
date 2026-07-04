// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\governance\roles\add-role-button.tsx

'use client';

import { Button } from 'rizzui';
import { useSetAtom } from 'jotai';
import cn from '@core/utils/class-names';
import { PiPlusBold } from 'react-icons/pi';
import { useCanPerform } from '@/hooks/useCanPerform';
import { addRolePanelOpenAtom } from '../create-panel-atoms';

type AddRoleButtonProps = {
  title?: string;
  className?: string;
  buttonLabel?: string;
  onAddRoleSuccess: () => void; // Callback to refresh the table
};

export default function AddRoleButton({
  title = 'Add New Role',
  className,
  buttonLabel = 'Add Role',
}: React.PropsWithChildren<AddRoleButtonProps>) {
  // Open the DOCKED create panel (hosted in RolesTable) rather than a centered
  // modal. The atom bridges this header CTA to the table's flex-sibling panel.
  const setOpen = useSetAtom(addRolePanelOpenAtom);
  // System 2 Action-RBAC: creating roles maps to gouvernance:create. Keep enabled
  // while the allow-set loads (fail-open) so there's no flash of a disabled CTA.
  const { allowed, loading } = useCanPerform('gouvernance', 'create');
  const denied = !allowed && !loading;

  return (
    <Button
      disabled={denied}
      title={
        denied
          ? 'You lack the "create" permission on governance. Ask an administrator to grant it.'
          : undefined
      }
      onClick={() => setOpen(true)}
      className={cn('w-full @lg:w-auto', className)}
    >
      <PiPlusBold className="me-1.5 h-[17px] w-[17px]" />
      {buttonLabel}
    </Button>
  );
}