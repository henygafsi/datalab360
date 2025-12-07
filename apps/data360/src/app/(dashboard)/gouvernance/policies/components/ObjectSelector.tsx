'use client';

import { useState, useEffect } from 'react';
import { Select } from 'rizzui';
import {
  getDatabases,
  getSchemas,
  getTables,
  getColumns,
} from '@/app/services/gouvernance/policies';

interface ObjectSelectorProps {
  level: 'database' | 'schema' | 'table' | 'column';
  database?: string;
  schema?: string;
  table?: string;
  onSelect: (selected: string) => void;
  value?: string;
  label?: string;
  disabled?: boolean;
}

export function ObjectSelector({
  level,
  database,
  schema,
  table,
  onSelect,
  value = '',
  label,
  disabled = false,
}: ObjectSelectorProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, database, schema, table]);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);

      let data: any[] = [];

      switch (level) {
        case 'database':
          data = await getDatabases();
          break;
        case 'schema':
          if (!database) {
            setItems([]);
            setLoading(false);
            return;
          }
          data = await getSchemas(database);
          break;
        case 'table':
          if (!database || !schema) {
            setItems([]);
            setLoading(false);
            return;
          }
          data = await getTables(database, schema);
          break;
        case 'column':
          if (!database || !schema || !table) {
            setItems([]);
            setLoading(false);
            return;
          }
          data = await getColumns(database, schema, table);
          break;
        default:
          data = [];
      }

      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(`Error loading ${level}s:`, err);
      setError(err.message || `Failed to load ${level}s`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

  const options = Array.isArray(items) ? items.map(item => {
    // Handle both object and string formats
    const itemName = typeof item === 'string' ? item : (item?.name || '');
    const itemType = typeof item === 'object' && item?.type ? item.type : '';

    return {
      label: level === 'column' && itemType
        ? `${itemName || 'Unknown'} (${itemType})`
        : (itemName || 'Unknown'),
      value: itemName || '',
    };
  }).filter(opt => opt.value) : [];

  const handleChange = (val: any) => {
    // Extract value from object if needed (rizzui Select may pass object)
    const extractedValue = typeof val === 'object' ? val?.value : val;
    if (extractedValue && typeof extractedValue === 'string') {
      onSelect(extractedValue);
    }
  };

  return (
    <div className="object-selector">
      <Select
        label={label || `Select ${capitalize(level)}`}
        options={options}
        value={value || ''}
        onChange={handleChange}
        disabled={disabled || loading || options.length === 0}
        placeholder={
          loading
            ? `Loading ${level}s...`
            : error
            ? `Error loading ${level}s`
            : options.length === 0
            ? `No ${level}s available`
            : `Choose a ${level}`
        }
      />
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
