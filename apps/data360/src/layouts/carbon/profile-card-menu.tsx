'use client';
import { Avatar, Button, Popover, Title, Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { routes } from '@/config/routes';
import Link from 'next/link';
import { Placement } from '@floating-ui/react';
import {
  HiOutlineUser,
  HiOutlineCog6Tooth,
  HiOutlineShieldCheck
} from 'react-icons/hi2';

type ProfileCardMenuProps = {
  className?: string;
  buttonClassName?: string;
  avatarClassName?: string;
  placement?: Placement;
  icon?: ReactNode;
  title?: string;
  designation?: string;
  initial?: string;
  image?: string;
  children?: ReactNode;
};

// Generate initials from name
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const menuItems = [
  {
    name: 'My Profile',
    href: routes.profile,
    icon: HiOutlineUser,
  },
  {
    name: 'Account Settings',
    href: routes.forms.profileSettings,
    icon: HiOutlineCog6Tooth,
  },
];

function DropdownMenu({
  initial,
  title,
  designation,
}: ProfileCardMenuProps) {
  return (
    <div className="w-64 text-left rtl:text-right">
      <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 px-5 pb-4 pt-5">
        <Avatar
          name={title!}
          initials={initial || getInitials(title || 'U')}
          className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold"
        />
        <div className="flex-1 min-w-0">
          {title && (
            <Title as="h6" className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {title}
            </Title>
          )}
          {designation && (
            <Badge
              variant="flat"
              color="primary"
              size="sm"
              className="mt-1"
            >
              <HiOutlineShieldCheck className="w-3 h-3 mr-1" />
              {designation}
            </Badge>
          )}
        </div>
      </div>
      <div className="px-3 py-3">
        {menuItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors duration-200"
          >
            <item.icon className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
            <span className="font-medium">{item.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function ProfileCardMenu({
  className,
  buttonClassName,
  avatarClassName,
  placement = 'bottom-start',
  icon,
  title,
  designation,
  initial = 'P',
}: ProfileCardMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <>
      <div className={cn('px-6 py-5', className)}>
        <Popover
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          shadow="sm"
          placement={placement}
        >
          <Popover.Trigger>
            <Button
              variant="outline"
              className={cn(
                'flex-items-center group flex h-auto w-full max-w-full justify-between gap-3 border-2 border-gray-100 px-5 py-3.5 text-left',
                buttonClassName
              )}
            >
              <span className="flex items-center gap-3">
                <div>
                  <Avatar
                    name={title!}
                    initials={initial || getInitials(title || 'U')}
                    size="sm"
                    className={cn('bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold', avatarClassName)}
                  />
                </div>
                <span className="flex max-w-[120px] flex-col">
                  {title && (
                    <Title
                      as="h6"
                      className="text-sm font-semibold text-gray-900"
                    >
                      {title}
                    </Title>
                  )}
                  {designation && (
                    <Text className="truncate text-gray-600">
                      {designation}
                    </Text>
                  )}
                </span>
              </span>
              {icon && icon}
            </Button>
          </Popover.Trigger>

          <Popover.Content className="z-[9999] p-0 dark:bg-gray-100 [&>svg]:dark:fill-gray-100">
            <DropdownMenu
              initial={initial || getInitials(title || 'U')}
              title={title}
              designation={designation}
            />
          </Popover.Content>
        </Popover>
      </div>
    </>
  );
}
