'use client';

import { Button } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiEditBold } from 'react-icons/pi';
import { useModal } from '@/app/shared/modal-views/use-modal';
import EditGrantForm from './EditGrantForm'; // Assuming you have a form component for editing grants

export default function EditGrantsButton({
  title = 'Edit Grants',
  buttonLabel = 'Edit Grants',
  className,
}: {
  title?: string;
  buttonLabel?: string;
  className?: string;
}) {
  const { openModal } = useModal();

  return (
    <Button
      onClick={() =>
        openModal({
          view: <EditGrantForm title={title} />,
          customSize: '480px',
        })
      }
      className={cn('w-full @lg:w-auto', className)}
    >
      <PiEditBold className="mr-1.5 h-[17px] w-[17px]" />
      {buttonLabel}
    </Button>
  );
}
