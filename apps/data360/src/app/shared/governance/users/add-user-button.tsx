// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\governance\users\add-user-button.tsx

'use client';

import { Button } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiUserPlusBold } from 'react-icons/pi';
import { useModal } from '@/app/shared/modal-views/use-modal';
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

  return (
    <Button
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