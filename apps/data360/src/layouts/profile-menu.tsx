'use client';

import { Title, Text, Avatar, Button, Popover, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import { routes } from '@/config/routes';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  HiOutlineUser,
  HiOutlineCog6Tooth,
  HiOutlineArrowRightOnRectangle,
  HiOutlineShieldCheck
} from 'react-icons/hi2';

// Generate initials from username
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ProfileMenu({
  buttonClassName,
  avatarClassName,
}: {
  buttonClassName?: string;
  avatarClassName?: string;
}) {
  const { data: session } = useSession();
  const username = session?.user?.username || 'Guest';
  const email = session?.user?.email || '';
  const role = (session?.user as any)?.role || 'User';

  return (
    <ProfileMenuPopover>
      <Popover.Trigger>
        <button
          className={cn(
            'flex items-center gap-2 rounded-full outline-none focus-visible:ring-[1.5px] focus-visible:ring-gray-400 focus-visible:ring-offset-2 active:translate-y-px',
            buttonClassName
          )}
        >
          <Avatar
            name={username}
            initials={getInitials(username)}
            className={cn('!h-9 !w-9 sm:!h-10 sm:!w-10 bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold', avatarClassName)}
          />
          <span className="hidden md:flex flex-col items-start">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Hi, {username}
            </span>
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Content className="z-[9999] p-0 dark:bg-gray-100 [&>svg]:dark:fill-gray-100">
        <DropdownMenu username={username} email={email} role={role} />
      </Popover.Content>
    </ProfileMenuPopover>
  );
}

function ProfileMenuPopover({ children }: React.PropsWithChildren<{}>) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <Popover
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      shadow="sm"
      placement="bottom-end"
    >
      {children}
    </Popover>
  );
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

function DropdownMenu({ username, email, role }: { username: string; email: string; role: string }) {
  return (
    <div className="w-72 text-left rtl:text-right">
      {/* User info header */}
      <div className="flex items-center gap-4 border-b border-gray-200 dark:border-gray-700 px-5 pb-5 pt-5">
        <Avatar
          name={username}
          initials={getInitials(username)}
          size="lg"
          className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold"
        />
        <div className="flex-1 min-w-0">
          <Title as="h6" className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {username}
          </Title>
          {email && (
            <Text className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {email}
            </Text>
          )}
          <Badge
            variant="flat"
            color="primary"
            size="sm"
            className="mt-1.5"
          >
            <HiOutlineShieldCheck className="w-3 h-3 mr-1" />
            {role}
          </Badge>
        </div>
      </div>

      {/* Menu items */}
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

      {/* Sign out */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3">
        <Button
          className="w-full flex items-center justify-start gap-3 h-auto px-3 py-2.5 font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors duration-200"
          variant="text"
          onClick={() => signOut()}
        >
          <HiOutlineArrowRightOnRectangle className="w-5 h-5" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
