'use client';

import { Checkbox, Button } from 'rizzui';
import { useState } from 'react';

const availableGrants = [
  'BI Reporting',
  'Data Health',
  'Mapping',
  'Observability',
  'Data Governance',
];

type EditGrantsFormProps = {
  initialGrants?: string[];
  onSubmit?: (updatedGrants: string[]) => void;
};

export default function EditGrantsForm({
  initialGrants = [],
  onSubmit,
}: EditGrantsFormProps) {
  const [selectedGrants, setSelectedGrants] = useState<string[]>(initialGrants);

  const toggleGrant = (grant: string) => {
    setSelectedGrants((prevGrants) =>
      prevGrants.includes(grant)
        ? prevGrants.filter((g) => g !== grant)
        : [...prevGrants, grant]
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit?.(selectedGrants);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <h3 className="text-lg font-medium">Select Grants</h3>
      <div className="space-y-2">
        {availableGrants.map((grant) => (
          <div key={grant} className="flex items-center">
            <Checkbox
              checked={selectedGrants.includes(grant)}
              onChange={() => toggleGrant(grant)}
            />
            <label className="ml-2 text-sm">{grant}</label>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Button type="submit" variant="solid" color="primary">
          Save Grants
        </Button>
      </div>
    </form>
  );
}
