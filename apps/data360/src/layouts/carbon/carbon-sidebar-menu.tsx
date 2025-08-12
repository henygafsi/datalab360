"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { ElementType, Fragment, useState } from 'react';
import { carbonMenuItems } from '@/layouts/carbon/carbon-menu-items';
import { Text } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiCaretDownBold } from 'react-icons/pi';
import Menu from '@core/ui/carbon-menu/dropdown/menu';
import { SortableList } from '@core/components/dnd/dnd-sortable-list';
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useDndEnabled } from '@/store/dnd-enable-store';



export function CarbonSidebarMenu({ allowedIds }: { allowedIds: number[] }) {
  const pathname = usePathname();
  const [items, setItems] = useState(carbonMenuItems);
  const { enabled } = useDndEnabled();

  function handleChange(event: DragEndEvent) {
    const { active, over } = event;
    if (!active || !over) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    setItems((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  function isDisabled(id: number) {
    return !allowedIds.includes(id);
  }

  return (
    <div className="mb-auto">
      <Text
        as="span"
        className="block px-[25px] pt-5 font-lexend text-xs uppercase text-gray-400 dark:text-gray-600"
      >
        Menu
      </Text>

      <ul className="pb-12">
        <SortableList items={items} onChange={handleChange}>
          {items.map((item, index) => {
            const Icon = item.icon;
            const disabled = isDisabled(item.id);

            const pathnameExistInDropdowns = item.menuItems?.some(
              (dropdownItem) =>
                dropdownItem.href === pathname ||
                dropdownItem.subMenuItems?.some((sub) => sub.href === pathname)
            );
            const isDropdownOpen = Boolean(pathnameExistInDropdowns);

            return (
              <Fragment key={`sortable-menu-${item.name}-${index}`}>
                <SortableList.Item id={item.id}>
                  <Menu trigger="hover" placement="right-start" offset={2} closeDelay={0}>
                    <Menu.Trigger>
                      <div
                        className={cn(
                          'group relative mx-3.5 flex grow items-center justify-between overflow-hidden rounded-md px-3 py-2.5 font-medium transition-all lg:my-1 2xl:my-2 2xl:me-5',
                          isDropdownOpen
                            ? 'bg-primary text-gray-0'
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-700/90 dark:hover:text-gray-700',
                          enabled && 'ps-7',
                          disabled && 'pointer-events-none cursor-not-allowed opacity-40'
                        )}
                      >
                        <span className="flex items-center">
                          {enabled && (
                            <SortableList.DragHandle
                              className={cn(
                                'absolute inset-t-0 start-1 me-1 size-5 [&>svg]:size-[20px]',
                                isDropdownOpen ? 'text-gray-0' : 'text-gray-900'
                              )}
                            />
                          )}
                          {Icon && (
                            <span
                              className={cn(
                                'me-2 inline-flex size-6 items-center justify-center rounded-md [&>svg]:size-[24px]',
                                isDropdownOpen
                                  ? 'text-gray-0'
                                  : 'text-gray-400 dark:text-gray-500 dark:group-hover:text-gray-700'
                              )}
                            >
                              <Icon />
                            </span>
                          )}
                          {item.name}
                        </span>

                        <PiCaretDownBold
                          strokeWidth={3}
                          className={cn(
                            'h-3.5 w-3.5 -rotate-90 transition-transform rtl:rotate-90',
                            isDropdownOpen ? 'text-gray-0' : 'text-gray-900'
                          )}
                        />
                      </div>
                    </Menu.Trigger>

                    <Menu.List className="relative w-[280px] !border-transparent !px-2 !py-3 dark:border-gray-300 dark:bg-gray-100">
                      {item.menuItems?.map((dropdownItem, di) => {
                        const isChildActive = pathname === dropdownItem.href;
                        const pathnameExistInChildDropdowns = dropdownItem.subMenuItems?.some(
                          (sub) => sub.href === pathname
                        );
                        const isChildDropdownOpen = Boolean(pathnameExistInChildDropdowns);
                        const DropdownIcon = dropdownItem.icon;

                        return allowedIds.includes(item.id) ? (
                          <Menu.Item
                            key={`dropdown-${dropdownItem.name}-${di}`}
                            className={cn(
                              'px-0 py-0 transition-all data-[hover=true]:dark:bg-gray-200',
                              isChildDropdownOpen && 'bg-gray-100 dark:bg-gray-200'
                            )}
                          >
                            {dropdownItem.subMenuItems?.length ? (
                              <NestedDropdown
                                dropdownItem={dropdownItem}
                                isChildDropdownOpen={isChildDropdownOpen}
                                DropdownIcon={DropdownIcon}
                                pathname={pathname}
                              />
                            ) : (
                              <MenuLink
                                item={dropdownItem}
                                isChildActive={isChildActive}
                              />
                            )}
                          </Menu.Item>
                        ) : (
                          <li
                            key={`dropdown-disabled-${dropdownItem.name}-${di}`}
                            className="mx-2 flex items-center rounded-md px-3 py-2.5 font-medium opacity-40 pointer-events-none cursor-not-allowed"
                          >
                            {DropdownIcon && (
                              <DropdownIcon className="me-2 h-5 w-5 text-gray-400" />
                            )}
                            {dropdownItem.name}
                          </li>
                        );
                      })}
                    </Menu.List>
                  </Menu>
                </SortableList.Item>
              </Fragment>
            );
          })}
        </SortableList>
      </ul>
    </div>
  );
}

function NestedDropdown({
  dropdownItem,
  isChildDropdownOpen,
  DropdownIcon,
  pathname,
}: {
  dropdownItem: any;
  isChildDropdownOpen: boolean;
  DropdownIcon: ElementType;
  pathname: string;
}) {
  return (
    <ul className="w-full">
      <Menu trigger="hover" placement="right-start" offset={0} closeDelay={0}>
        <Menu.Trigger>
          <li
            className={cn(
              'group relative flex cursor-pointer items-center justify-between rounded-md px-3.5 py-2 font-medium',
              isChildDropdownOpen
                ? 'before:top-2/5 rounded-md bg-gray-100 text-primary before:absolute before:start-0 before:block before:h-4/5 before:w-1 before:rounded-ee-md before:rounded-se-md before:bg-primary dark:bg-gray-200'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-700/90 hover:dark:bg-gray-200 dark:hover:text-gray-700'
            )}
          >
            <span className="flex items-center">
              {DropdownIcon && (
                <span
                  className={cn(
                    'me-2 inline-flex h-5 w-5 items-center justify-center rounded-md',
                    isChildDropdownOpen
                      ? 'text-primary'
                      : 'text-gray-400 dark:text-gray-500 dark:group-hover:text-gray-700'
                  )}
                >
                  <DropdownIcon />
                </span>
              )}
              {dropdownItem.name}
            </span>

            <PiCaretDownBold
              strokeWidth={3}
              className={cn(
                'h-3.5 w-3.5 -rotate-90 transition-transform rtl:rotate-90',
                isChildDropdownOpen ? 'text-primary' : 'text-gray-900'
              )}
            />
          </li>
        </Menu.Trigger>

        <Menu.List className="!border-transparent dark:border-gray-300 dark:bg-gray-100">
          {dropdownItem.subMenuItems?.map((subMenuItem: any, si: number) => {
            const isSubActive = pathname === subMenuItem.href;

            return (
              <Menu.Item key={`sub-menu-${subMenuItem.name}-${si}`} className="px-0 py-0">
                <MenuLink item={subMenuItem} isChildActive={isSubActive} />
              </Menu.Item>
            );
          })}
        </Menu.List>
      </Menu>
    </ul>
  );
}

function MenuLink({ item, isChildActive }: { item: any; isChildActive?: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'relative flex w-full items-center justify-between rounded-md px-3.5 py-2 font-medium capitalize',
        isChildActive
          ? 'before:top-2/5 bg-gray-100 text-primary before:absolute before:-start-2.5 before:block before:h-4/5 before:w-1 before:rounded-ee-md before:rounded-se-md before:bg-primary dark:bg-gray-200'
          : 'text-gray-900 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-700/90 dark:hover:bg-gray-200'
      )}
    >
      <span className="flex items-center truncate">
        {Icon && (
          <span
            className={cn(
              'me-3 inline-flex h-5 w-5 items-center justify-center rounded-md',
              isChildActive
                ? 'text-primary'
                : 'text-gray-400 dark:text-gray-500 dark:group-hover:text-gray-700'
            )}
          >
            <Icon />
          </span>
        )}
        <span className="truncate">{item.name}</span>
      </span>
    </Link>
  );
}
