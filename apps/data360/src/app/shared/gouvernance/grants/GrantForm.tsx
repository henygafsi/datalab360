'use client';

import { useState } from 'react';
import { Button, Input, Text } from 'rizzui';
import { useModal } from '@/app/shared/modal-views/use-modal';

interface GrantFormProps {
  title?: string;
}

export default function GrantForm({ title = 'Add New Grant' }: GrantFormProps) {
  const { closeModal } = useModal();
  const [grantName, setGrantName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // TODO: Implement grant creation API call
      console.log('Creating grant:', grantName);
      closeModal();
    } catch (error) {
      console.error('Failed to create grant:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="m-auto px-5 pb-8 pt-5 @lg:pt-6 @2xl:px-7">
      <div className="mb-6">
        <Text className="text-lg font-semibold">{title}</Text>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Grant Name"
          placeholder="Enter grant name"
          value={grantName}
          onChange={(e) => setGrantName(e.target.value)}
          required
        />

        <div className="flex gap-3 justify-end pt-4">
          <Button variant="outline" onClick={closeModal}>
            Cancel
          </Button>
          <Button type="submit" isLoading={loading}>
            Create Grant
          </Button>
        </div>
      </form>
    </div>
  );
}
