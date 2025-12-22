'use client';

import React, { useState } from 'react';
import { Modal, Button, Badge, Input, Text, Tooltip } from 'rizzui';
import {
  X, Shield, AlertTriangle, User, CreditCard, Phone, Mail,
  MapPin, Calendar, Hash, Lock, Eye, EyeOff, Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface SensitiveColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  database: string;
  schema: string;
  table: string;
  column: string;
  dataType: string;
  isSensitive: boolean;
  onMarkSensitive: (sensitiveType: string) => void;
  onRemoveSensitive: () => void;
}

interface SensitiveType {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  patterns: string[];
  recommendedMasking: string;
}

const SENSITIVE_TYPES: SensitiveType[] = [
  {
    id: 'pii_email',
    label: 'Email Address',
    description: 'Personal email addresses',
    icon: Mail,
    color: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30',
    patterns: ['email', 'mail'],
    recommendedMasking: 'Partial mask (show domain)',
  },
  {
    id: 'pii_phone',
    label: 'Phone Number',
    description: 'Phone/mobile numbers',
    icon: Phone,
    color: 'text-green-500 bg-green-100 dark:bg-green-900/30',
    patterns: ['phone', 'mobile', 'cell', 'tel'],
    recommendedMasking: 'Partial mask (last 4 digits)',
  },
  {
    id: 'pii_ssn',
    label: 'Social Security Number',
    description: 'SSN or national ID',
    icon: Hash,
    color: 'text-red-500 bg-red-100 dark:bg-red-900/30',
    patterns: ['ssn', 'social_security', 'national_id'],
    recommendedMasking: 'Full mask',
  },
  {
    id: 'pii_address',
    label: 'Address',
    description: 'Physical addresses',
    icon: MapPin,
    color: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30',
    patterns: ['address', 'street', 'city', 'zip', 'postal'],
    recommendedMasking: 'Partial mask',
  },
  {
    id: 'pii_dob',
    label: 'Date of Birth',
    description: 'Birth dates',
    icon: Calendar,
    color: 'text-amber-500 bg-amber-100 dark:bg-amber-900/30',
    patterns: ['dob', 'birth_date', 'birthday', 'date_of_birth'],
    recommendedMasking: 'Generalize (year only)',
  },
  {
    id: 'pii_name',
    label: 'Personal Name',
    description: 'First/last names',
    icon: User,
    color: 'text-indigo-500 bg-indigo-100 dark:bg-indigo-900/30',
    patterns: ['first_name', 'last_name', 'full_name', 'name'],
    recommendedMasking: 'Partial mask',
  },
  {
    id: 'financial_card',
    label: 'Credit Card',
    description: 'Credit/debit card numbers',
    icon: CreditCard,
    color: 'text-orange-500 bg-orange-100 dark:bg-orange-900/30',
    patterns: ['credit_card', 'card_number', 'cc_number'],
    recommendedMasking: 'Partial mask (last 4 digits)',
  },
  {
    id: 'financial_account',
    label: 'Account Number',
    description: 'Bank account numbers',
    icon: Hash,
    color: 'text-cyan-500 bg-cyan-100 dark:bg-cyan-900/30',
    patterns: ['account_number', 'bank_account', 'routing'],
    recommendedMasking: 'Full mask',
  },
  {
    id: 'auth_password',
    label: 'Password/Secret',
    description: 'Passwords or secrets',
    icon: Lock,
    color: 'text-rose-500 bg-rose-100 dark:bg-rose-900/30',
    patterns: ['password', 'pwd', 'secret', 'token', 'api_key'],
    recommendedMasking: 'Full mask',
  },
  {
    id: 'custom',
    label: 'Custom Sensitive',
    description: 'Other sensitive data',
    icon: Shield,
    color: 'text-slate-500 bg-slate-100 dark:bg-slate-700',
    patterns: [],
    recommendedMasking: 'Full mask',
  },
];

export const SensitiveColumnModal: React.FC<SensitiveColumnModalProps> = ({
  isOpen,
  onClose,
  database,
  schema,
  table,
  column,
  dataType,
  isSensitive,
  onMarkSensitive,
  onRemoveSensitive,
}) => {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');

  // Auto-detect sensitive type based on column name
  const detectedType = React.useMemo(() => {
    const columnLower = column.toLowerCase();
    for (const type of SENSITIVE_TYPES) {
      if (type.patterns.some(pattern => columnLower.includes(pattern))) {
        return type;
      }
    }
    return null;
  }, [column]);

  const handleConfirm = () => {
    if (!selectedType && !isSensitive) {
      toast.error('Please select a sensitive data type');
      return;
    }

    if (isSensitive) {
      onRemoveSensitive();
    } else {
      onMarkSensitive(selectedType || 'custom');
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              isSensitive
                ? 'bg-red-100 dark:bg-red-900/30'
                : 'bg-amber-100 dark:bg-amber-900/30'
            )}>
              <Shield className={cn(
                'h-5 w-5',
                isSensitive ? 'text-red-600' : 'text-amber-600'
              )} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {isSensitive ? 'Remove Sensitive Marking' : 'Mark as Sensitive'}
              </h3>
              <p className="text-sm text-slate-500">
                {column} ({dataType})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isSensitive ? (
            // Remove sensitive marking
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  This column is currently marked as sensitive. Removing this marking will allow it to be used without masking policies.
                </p>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Are you sure you want to remove the sensitive marking from <span className="font-mono font-medium">{column}</span>?
              </p>
            </div>
          ) : (
            // Mark as sensitive
            <div className="space-y-4">
              {/* Auto-detection Notice */}
              {detectedType && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className={cn('p-2 rounded-lg', detectedType.color)}>
                    <detectedType.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Auto-detected: {detectedType.label}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Based on column name pattern
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedType(detectedType.id)}
                    className="gap-1"
                  >
                    <Check className="h-3 w-3" />
                    Use
                  </Button>
                </div>
              )}

              <p className="text-sm text-slate-600 dark:text-slate-400">
                Select the type of sensitive data in this column:
              </p>

              {/* Sensitive Type Grid */}
              <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
                {SENSITIVE_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={cn(
                      'flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all',
                      selectedType === type.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    )}
                  >
                    <div className={cn('p-2 rounded-lg flex-shrink-0', type.color)}>
                      <type.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{type.label}</p>
                      <p className="text-xs text-slate-500 truncate">{type.description}</p>
                    </div>
                    {selectedType === type.id && (
                      <Check className="h-5 w-5 text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Selected type details */}
              {selectedType && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-medium">Recommended Masking</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {SENSITIVE_TYPES.find(t => t.id === selectedType)?.recommendedMasking}
                  </p>
                </div>
              )}

              {/* Custom reason (for custom type) */}
              {selectedType === 'custom' && (
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Reason (optional)
                  </label>
                  <Input
                    className="mt-1"
                    placeholder="Why is this column sensitive?"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t dark:border-slate-700 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className={cn(
              isSensitive
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-red-600 hover:bg-red-700'
            )}
          >
            {isSensitive ? (
              <>
                <EyeOff className="h-4 w-4 mr-2" />
                Remove Sensitive Marking
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                Mark as Sensitive
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default SensitiveColumnModal;
