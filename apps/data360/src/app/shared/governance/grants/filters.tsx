'use client';

import { FilterDrawerView } from '@core/components/controlled-table/table-filter';
import { useState } from 'react';
import {
  PiFunnel,
  PiMagnifyingGlassBold,
  PiTrashDuotone,
} from 'react-icons/pi';
import { Badge, Button, Flex, Input, Text } from 'rizzui';
import ToggleColumns from '@core/components/table-utils/toggle-columns';

export default function Filters<TData extends Record<string, any>>({
  table,
}: {
  table: any;
}) {
  const [openDrawer, setOpenDrawer] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  return (
    <Flex align="center" justify="between" className="mb-4 gap-0">
      <Flex align="center" className="w-auto flex-wrap">
        <Input
          type="search"
          aria-label="Search grants by name"
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
