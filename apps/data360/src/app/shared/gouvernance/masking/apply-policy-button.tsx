'use client';

import { Button } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiPlusBold } from 'react-icons/pi';
import { useModal } from '@/app/shared/modal-views/use-modal';
import ApplyPolicyForm from './apply-policy-form';

type Props = {
  title?: string;
  className?: string;
  buttonLabel?: string;
  onApplied?: () => void;
};

export default function ApplyPolicyButton({ title = 'Apply Masking Policy', className, buttonLabel = 'Apply Policy', onApplied }: React.PropsWithChildren<Props>) {
  const { openModal, closeModal } = useModal();
  return (
    <Button
      onClick={() =>
        openModal({
          view: <ApplyPolicyForm onClose={closeModal} onSuccess={onApplied} />,
          customSize: '640px',
        })
      }
      className={cn('w-full @lg:w-auto', className)}
    >
      <PiPlusBold className="me-1.5 h-[17px] w-[17px]" />
      {buttonLabel}
    </Button>
  );
}


