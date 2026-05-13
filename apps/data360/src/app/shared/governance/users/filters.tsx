// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\governance\users\filters.tsx

'use client';

import { FilterDrawerView } from '@core/components/controlled-table/table-filter';
import { useState } from 'react';
import {
  PiFunnel,
  PiMagnifyingGlassBold,
  // PiTrashDuotone, // Not used in this component
} from 'react-icons/pi';
import { Button, Flex, Input } from 'rizzui'; // Removed Badge, Text as they are not directly used here
import ToggleColumns from '@core/components/table-utils/toggle-columns';

export default function Filters<TData extends Record<string, any>>({
  table,
}: {
  table: any; // Type should ideally be more specific to TanStack Table instance
}) {
  const [openDrawer, setOpenDrawer] = useState(false);
  // const [showFilters, setShowFilters] = useState(true); // Not used in the current logic

  return (
    <Flex align="center" justify="between" className="mb-4 gap-0">
      <Flex align="center" className="w-auto flex-wrap">
        <Input
          type="search"
          aria-label="Search users by name"
          placeholder="Search by name..."
          value={table.getState().globalFilter ?? ''}
          onClear={() => table.setGlobalFilter('')}
          onChange={(e) => table.setGlobalFilter(e.target.value)}
          inputClassName="h-9"
          clearable={true}
          prefix={<PiMagnifyingGlassBold className="h-4 w-4" />}
        />
      </Flex>
      <Flex align="center" className="w-auto">
        <Button
          onClick={() => setOpenDrawer(!openDrawer)}
          variant={'outline'}
          className="h-[34px] px-4"
        >
          <PiFunnel className="mr-2" />
          Filters
        </Button>
        <FilterDrawerView
          drawerTitle="User Filters"
          isOpen={openDrawer}
          setOpenDrawer={setOpenDrawer}
        >
          {/* Add any custom filter elements here */}
          <ToggleColumns table={table} />
        </FilterDrawerView>
      </Flex>
    </Flex>
  );
}