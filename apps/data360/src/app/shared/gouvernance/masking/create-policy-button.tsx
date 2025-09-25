'use client';

import { Button } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiPlusBold } from 'react-icons/pi';
import { useModal } from '@/app/shared/modal-views/use-modal';
import CreatePolicyForm from './create-policy-form';

type Props = {
  title?: string;
  className?: string;
  buttonLabel?: string;
  onCreated?: () => void;
};

export default function CreatePolicyButton({ title = 'Create Masking Policy', className, buttonLabel = 'Create Policy', onCreated }: React.PropsWithChildren<Props>) {
  const { openModal, closeModal } = useModal();
  return (
    <Button
      onClick={() =>
        openModal({
          view: <CreatePolicyForm onClose={closeModal} onSuccess={onCreated} />,
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


