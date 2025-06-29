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
};

export default function AddUserButton({
  title = 'Add New User',
  modalBtnLabel = 'Add User',
  className,
  buttonLabel = 'Add User',
}: React.PropsWithChildren<AddUserButtonProps>) {
  const { openModal } = useModal();

  return (
    <Button
      onClick={() =>
        openModal({
          view: (
            <AddUserForm
              onAddUser={(newUser) => {
                console.log('New user added:', newUser);
              }}
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
