'use client';

import { Button } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiPlusBold } from 'react-icons/pi';
import { useModal } from '@/app/shared/modal-views/use-modal';
import GrantForm from './GrantForm'; // Assuming you have a form component for adding grants

export default function AddGrantButton({
  title = 'Add New Grant',
  buttonLabel = 'Add Grant',
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
          view: <GrantForm title={title} />,
          customSize: '480px',
        })
      }
      className={cn('w-full @lg:w-auto', className)}
    >
      <PiPlusBold className="mr-1.5 h-[17px] w-[17px]" />
      {buttonLabel}
    </Button>
  );
}
