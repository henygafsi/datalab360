'use client';

import { Button } from 'rizzui';
import { useModal } from '@/app/shared/modal-views/use-modal';
import { PiPenBold } from 'react-icons/pi';
import EditGrantsForm from './edit-grants-form';

type EditGrantsButtonProps = {
  title?: string;
  buttonLabel?: string;
};

export default function EditGrantsButton({
  title = 'Edit Grants',
  buttonLabel = 'Edit Grants',
}: React.PropsWithChildren<EditGrantsButtonProps>) {
  const { openModal } = useModal();

  return (
    <Button
      onClick={() =>
        openModal({
          view: <EditGrantsForm />,
          customSize: '480px',
        })
      }
      className="w-full bg-blue-500 text-white @lg:w-auto"
    >
      <PiPenBold className="me-1.5 h-[17px] w-[17px]" />
      {buttonLabel}
    </Button>
  );
}
