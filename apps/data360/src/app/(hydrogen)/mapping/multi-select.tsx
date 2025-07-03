'use client';

import React from 'react';
import Select from 'react-select';

interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  selected,
  onValueChange,
  placeholder = 'Select...',
  className,
  disabled,
}) => {
  const selectedOptions = options.filter(opt => selected.includes(opt.value));

  const handleChange = (newValue: readonly MultiSelectOption[] | null) => {
    onValueChange(newValue ? newValue.map(opt => opt.value) : []);
  };

  return (
    <div className={className}>
      <Select
        isMulti
        isDisabled={disabled}
        options={options}
        value={selectedOptions}
        onChange={handleChange}
        placeholder={placeholder}
        classNamePrefix="react-select"
      />
    </div>
  );
};
