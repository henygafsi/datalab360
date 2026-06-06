// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\governance\users\add-user-button.tsx

'use client';

import { Button } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiUserPlusBold } from 'react-icons/pi';
import { useModal } from '@/app/shared/modal-views/use-modal';
import { useCanPerform } from '@/hooks/useCanPerform';
import AddUserForm from './add-user-form';

type AddUserButtonProps = {
  title?: string;
  modalBtnLabel?: string;
  className?: string;
  buttonLabel?: string;
  onAddUserSuccess: () => void;
};

export default function AddUserButton({
  title = 'Add New User',
  modalBtnLabel = 'Add User',
  className,
  buttonLabel = 'Add User',
  onAddUserSuccess,
}: React.PropsWithChildren<AddUserButtonProps>) {
  const { openModal, closeModal } = useModal();
  // System 2 Action-RBAC: creating users maps to gouvernance:create. Keep enabled
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
      onClick={() =>
        openModal({
          view: (
            <AddUserForm
              onAddUserSuccess={onAddUserSuccess}
              onClose={closeModal}
            />
          ),
          customSize: '500px',
        })
      }
      className={cn('w-full @lg:w-auto', className)}
    >
      <PiUserPlusBold className="me-1.5 h-[17px] w-[17px]" />
      {buttonLabel}
    </Button>
  );
}