"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { ElementType, Fragment, useState } from 'react';
import { carbonMenuItems, type MenuItemsType } from '@/layouts/carbon/carbon-menu-items';
import { Text } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiCaretRightBold } from 'react-icons/pi';
import Menu from '@core/ui/carbon-menu/dropdown/menu';
import { SortableList } from '@core/components/dnd/dnd-sortable-list';
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useDndEnabled } from '@/store/dnd-enable-store';
import { Tooltip } from 'rizzui';

// Color map for icon badge backgrounds and text
const COLOR_MAP: Record<string, { bg: string; text: string; activeBg: string; activeText: string; border: string }> = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-950/40',       text: 'text-blue-500 dark:text-blue-400',       activeBg: 'bg-blue-500',    activeText: 'text-white', border: 'border-blue-500' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-500 dark:text-emerald-400', activeBg: 'bg-emerald-500', activeText: 'text-white', border: 'border-emerald-500' },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-950/40',   text: 'text-violet-500 dark:text-violet-400',   activeBg: 'bg-violet-500',  activeText: 'text-white', border: 'border-violet-500' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-950/40',     text: 'text-amber-500 dark:text-amber-400',     activeBg: 'bg-amber-500',   activeText: 'text-white', border: 'border-amber-500' },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-950/40',       text: 'text-rose-500 dark:text-rose-400',       activeBg: 'bg-rose-500',    activeText: 'text-white', border: 'border-rose-500' },
  cyan:    { bg: 'bg-cyan-50 dark:bg-cyan-950/40',       text: 'text-cyan-500 dark:text-cyan-400',       activeBg: 'bg-cyan-500',    activeText: 'text-white', border: 'border-cyan-500' },
  purple:  { bg: 'bg-purple-50 dark:bg-purple-950/40',   text: 'text-purple-500 dark:text-purple-400',   activeBg: 'bg-purple-500',  activeText: 'text-white', border: 'border-purple-500' },
  green:   { bg: 'bg-green-50 dark:bg-green-950/40',     text: 'text-green-500 dark:text-green-400',     activeBg: 'bg-green-500',   activeText: 'text-white', border: 'border-green-500' },
  orange:  { bg: 'bg-orange-50 dark:bg-orange-950/40',   text: 'text-orange-500 dark:text-orange-400',   activeBg: 'bg-orange-500',  activeText: 'text-white', border: 'border-orange-500' },
};

// Section divider indices (insert divider AFTER these indices)
// After "Connect Data" (data layer), after "Workflow" (process layer), after "Business Reporting" (output layer)
const DIVIDER_AFTER_INDICES = [0, 3, 5];

function getColors(color: string) {
  return COLOR_MAP[color] || COLOR_MAP.blue;
}

export function CarbonSidebarMenu({ allowedIds, collapsed = false }: { allowedIds: number[]; collapsed?: boolean }) {
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
      {!collapsed && (
        <Text
          as="span"
          className="block px-6 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500"
        >
          Navigation
        </Text>
      )}

      <ul className={cn("pb-12", collapsed && "pt-4")}>
        <SortableList items={items} onChange={handleChange}>
          {items.map((item, index) => {
            const Icon = item.icon;
            const colors = getColors(item.color);
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
                  <Menu trigger="hover" placement="right-start" offset={collapsed ? 8 : 2} closeDelay={0}>
                    <Menu.Trigger>
                      {collapsed ? (
                        <Tooltip content={item.name} placement="right">
                          <button
                            type="button"
                            aria-label={item.name}
                            aria-expanded={isDropdownOpen}
                            aria-haspopup="menu"
                            aria-disabled={disabled || undefined}
                            className={cn(
                              'group relative mx-auto flex flex-col items-center justify-center rounded-xl p-2 transition-all duration-200 lg:my-1 2xl:my-1.5',
                              isDropdownOpen
                                ? 'bg-slate-100 dark:bg-slate-800/60'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                              disabled && 'pointer-events-none cursor-not-allowed opacity-40'
                            )}
                          >
                            {/* Colored icon badge */}
                            <span
                              aria-hidden="true"
                              className={cn(
                                'inline-flex size-8 items-center justify-center rounded-lg transition-all duration-200 [&>svg]:size-[18px]',
                                isDropdownOpen
                                  ? cn(colors.activeBg, colors.activeText, 'shadow-sm')
                                  : cn(colors.bg, colors.text, 'group-hover:shadow-sm')
                              )}
                            >
                              <Icon />
                            </span>
                            {/* Active dot indicator */}
                            {isDropdownOpen && (
                              <span aria-hidden="true" className={cn('mt-1 h-1 w-1 rounded-full', colors.activeBg)} />
                            )}
                          </button>
                        </Tooltip>
                      ) : (
                        // role="button" div (not <button>): this row contains the
                        // SortableList.DragHandle which itself renders a <button>;
                        // a <button> inside a <button> is invalid HTML → a hydration
                        // error that fired on every page (shared chrome). Menu.Trigger
                        // still wires onClick + keyboard onto this node.
                        <div
                          role="button"
                          tabIndex={disabled ? -1 : 0}
                          aria-label={item.name}
                          aria-expanded={isDropdownOpen}
                          aria-haspopup="menu"
                          aria-disabled={disabled || undefined}
                          className={cn(
                            'group relative mx-3 flex grow cursor-pointer items-center justify-between rounded-xl px-3 py-2 font-medium transition-all duration-200 lg:my-0.5 2xl:my-0.5 2xl:me-5',
                            isDropdownOpen
                              ? 'bg-slate-100/80 dark:bg-slate-800/50'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/30',
                            enabled && 'ps-8',
                            disabled && 'pointer-events-none cursor-not-allowed opacity-40'
                          )}
                        >
                          {/* Left accent bar for active state */}
                          {isDropdownOpen && (
                            <span aria-hidden="true" className={cn('absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full', colors.activeBg)} />
                          )}

                          <span className="flex items-center">
                            {enabled && (
                              <SortableList.DragHandle
                                className={cn(
                                  'absolute inset-t-0 start-1.5 me-1 size-4 [&>svg]:size-[16px]',
                                  isDropdownOpen ? 'text-slate-500' : 'text-slate-400'
                                )}
                              />
                            )}
                            {/* Colored icon badge */}
                            {Icon && (
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'me-2.5 inline-flex size-8 items-center justify-center rounded-lg transition-all duration-200 [&>svg]:size-[20px]',
                                  isDropdownOpen
                                    ? cn(colors.activeBg, colors.activeText, 'shadow-sm')
                                    : cn(colors.bg, colors.text, 'group-hover:shadow-sm')
                                )}
                              >
                                <Icon />
                              </span>
                            )}
                            <span className={cn(
                              'text-[13px] font-medium transition-colors duration-200',
                              isDropdownOpen
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-slate-600 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-200'
                            )}>
                              {item.name}
                            </span>
                          </span>

                          <PiCaretRightBold
                            aria-hidden="true"
                            className={cn(
                              'h-3 w-3 transition-all duration-200',
                              isDropdownOpen
                                ? 'text-slate-400'
                                : 'text-slate-300 group-hover:text-slate-400 dark:text-slate-600'
                            )}
                          />
                        </div>
                      )}
                    </Menu.Trigger>

                    <Menu.List className="relative w-[260px] !border !border-slate-200/80 !px-1.5 !py-2 shadow-lg shadow-slate-200/50 dark:!border-slate-700/60 dark:bg-slate-900 dark:shadow-black/30">
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
                              'px-0 py-0 transition-all data-[hover=true]:dark:bg-slate-800/60',
                              isChildDropdownOpen && 'bg-slate-50 dark:bg-slate-800/60'
                            )}
                          >
                            {dropdownItem.subMenuItems?.length ? (
                              <NestedDropdown
                                dropdownItem={dropdownItem}
                                isChildDropdownOpen={isChildDropdownOpen}
                                DropdownIcon={DropdownIcon}
                                pathname={pathname}
                                itemColor={item.color}
                              />
                            ) : (
                              <MenuLink
                                item={dropdownItem}
                                isChildActive={isChildActive}
                                itemColor={item.color}
                              />
                            )}
                          </Menu.Item>
                        ) : (
                          <li
                            key={`dropdown-disabled-${dropdownItem.name}-${di}`}
                            className="mx-1 flex items-center rounded-lg px-3 py-2 text-sm font-medium opacity-40 pointer-events-none cursor-not-allowed"
                          >
                            {DropdownIcon && (
                              <DropdownIcon className="me-2.5 h-4 w-4 text-slate-400" />
                            )}
                            {dropdownItem.name}
                          </li>
                        );
                      })}
                    </Menu.List>
                  </Menu>
                </SortableList.Item>

                {/* Section divider */}
                {!collapsed && DIVIDER_AFTER_INDICES.includes(index) && (
                  <li className="mx-6 my-1.5 h-px bg-slate-200/60 dark:bg-slate-700/40 2xl:me-8" />
                )}
                {collapsed && DIVIDER_AFTER_INDICES.includes(index) && (
                  <li className="mx-auto my-1.5 h-px w-6 bg-slate-200/60 dark:bg-slate-700/40" />
                )}
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
  itemColor,
}: {
  dropdownItem: any;
  isChildDropdownOpen: boolean;
  DropdownIcon: ElementType;
  pathname: string;
  itemColor: string;
}) {
  const colors = getColors(itemColor);

  return (
    <ul className="w-full">
      <Menu trigger="hover" placement="right-start" offset={0} closeDelay={0}>
        <Menu.Trigger>
          <li
            className={cn(
              'group relative flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
              isChildDropdownOpen
                ? cn('bg-slate-50 dark:bg-slate-800/60', `border-l-2 ${colors.border}`)
                : 'border-l-2 border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/40'
            )}
          >
            <span className="flex items-center">
              {DropdownIcon && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'me-2.5 inline-flex h-4 w-4 items-center justify-center',
                    isChildDropdownOpen
                      ? colors.text
                      : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                  )}
                >
                  <DropdownIcon />
                </span>
              )}
              <span className={cn(
                isChildDropdownOpen ? 'text-slate-900 dark:text-slate-100' : ''
              )}>
                {dropdownItem.name}
              </span>
            </span>

            <PiCaretRightBold
              aria-hidden="true"
              className={cn(
                'h-3 w-3 transition-colors',
                isChildDropdownOpen ? 'text-slate-400' : 'text-slate-300 dark:text-slate-600'
              )}
            />
          </li>
        </Menu.Trigger>

        <Menu.List className="!border !border-slate-200/80 shadow-lg shadow-slate-200/50 dark:!border-slate-700/60 dark:bg-slate-900 dark:shadow-black/30">
          {dropdownItem.subMenuItems?.map((subMenuItem: any, si: number) => {
            const isSubActive = pathname === subMenuItem.href;

            return (
              <Menu.Item key={`sub-menu-${subMenuItem.name}-${si}`} className="px-0 py-0">
                <MenuLink item={subMenuItem} isChildActive={isSubActive} itemColor={itemColor} />
              </Menu.Item>
            );
          })}
        </Menu.List>
      </Menu>
    </ul>
  );
}

function MenuLink({ item, isChildActive, itemColor }: { item: any; isChildActive?: boolean; itemColor?: string }) {
  const Icon = item.icon;
  const colors = itemColor ? getColors(itemColor) : getColors('blue');

  return (
    <Link
      href={item.href}
      className={cn(
        'relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium capitalize transition-all duration-200',
        isChildActive
          ? cn('bg-slate-50 dark:bg-slate-800/60', `border-l-2 ${colors.border}`)
          : 'border-l-2 border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/40'
      )}
    >
      <span className="flex items-center truncate">
        {Icon && (
          <span
            aria-hidden="true"
            className={cn(
              'me-2.5 inline-flex h-4 w-4 items-center justify-center',
              isChildActive
                ? colors.text
                : 'text-slate-400 dark:text-slate-500'
            )}
          >
            <Icon />
          </span>
        )}
        <span className={cn(
          'truncate',
          isChildActive ? 'text-slate-900 dark:text-slate-100' : ''
        )}>
          {item.name}
        </span>
      </span>
    </Link>
  );
}
