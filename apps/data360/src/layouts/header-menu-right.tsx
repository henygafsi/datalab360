import { Badge, ActionIcon } from 'rizzui';
import ProfileMenu from '@/layouts/profile-menu';
import NotificationDropdown from './notification-dropdown';
import DeploymentProgressChip from './deployment-progress-chip';
import {
  HiOutlineBell,
  HiOutlineSun,
  HiOutlineMoon
} from 'react-icons/hi2';
import { useState } from 'react';
import { useUnreadBadge } from '@/hooks/useNotifications';

function BellWithBadge() {
  const { count } = useUnreadBadge();
  return (
    <div className="relative">
      <button className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200 hover:scale-110 group">
        <HiOutlineBell className="w-5 h-5 text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white" />
      </button>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 border-2 border-white dark:border-slate-900 text-[10px] font-semibold text-white leading-[14px] text-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </div>
  );
}

export default function HeaderMenuRight() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    // Add your dark mode toggle logic here
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="flex items-center space-x-3">
      {/* Theme Toggle */}
      <button
        onClick={toggleDarkMode}
        className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200 hover:scale-110"
        aria-label="Toggle theme"
      >
        {isDarkMode ? (
          <HiOutlineSun className="w-5 h-5 text-amber-500" />
        ) : (
          <HiOutlineMoon className="w-5 h-5 text-slate-600" />
        )}
      </button>

      {/* Active deployments chip — visible only when something is in flight */}
      <DeploymentProgressChip />

      {/* Notifications */}
      <NotificationDropdown>
        <BellWithBadge />
      </NotificationDropdown>

      {/* Divider */}
      <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />

      {/* Profile Menu */}
      <ProfileMenu />
    </div>
  );
}
