'use client';

import { Button } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiPlusBold } from 'react-icons/pi';
import { useModal } from '@/app/shared/modal-views/use-modal';
import AddRoleForm from './add-role-form';

type AddRoleButtonProps = {
  title?: string;
  modalBtnLabel?: string;
  className?: string;
  buttonLabel?: string;
};

export default function AddRoleButton({
  title = 'Add New Role',
  modalBtnLabel = 'Add Role',
  className,
  buttonLabel = 'Add Role',
}: React.PropsWithChildren<AddRoleButtonProps>) {
  const { openModal } = useModal();

  return (
    <Button
      onClick={() =>
        openModal({
          view: <AddRoleForm />,
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
