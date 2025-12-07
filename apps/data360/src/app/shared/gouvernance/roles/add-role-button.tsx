// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\gouvernance\roles\add-role-button.tsx

'use client';

import { Button } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiPlusBold } from 'react-icons/pi';
import { useModal } from '@/app/shared/modal-views/use-modal'; // Correct import for useModal
import AddRoleForm from './add-role-form'; // Adjust import path

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
  onAddRoleSuccess, // Destructure the callback
}: React.PropsWithChildren<AddRoleButtonProps>) {
  const { openModal, closeModal } = useModal(); // Correctly use the hook here

  console.log('AddRoleForm in AddRoleButton:', AddRoleForm); // <-- CHECK THIS LOG! Should be a function.

  return (
    <Button
      onClick={() =>
        openModal({
          view: (
            <AddRoleForm
              onAddRoleSuccess={onAddRoleSuccess} // Pass the success callback
              onClose={closeModal} // Pass the close modal function
            />
          ),
          customSize: '480px',
        })
      }
      className={cn('w-full @lg:w-auto', className)}
    >
      <PiPlusBold className="me-1.5 h-[17px] w-[17px]" />
      {buttonLabel}
    </Button>
  );
}