import { Badge, ActionIcon } from 'rizzui';
import ProfileMenu from '@/layouts/profile-menu';
import NotificationDropdown from './notification-dropdown';
import DeploymentProgressChip from './deployment-progress-chip';
import { HiOutlineBell, HiOutlineSun, HiOutlineMoon } from 'react-icons/hi2';
import { forwardRef, useState } from 'react';
import { useUnreadBadge } from '@/hooks/useNotifications';

// Popover.Trigger clones its child with a ref + interaction props — a plain
// function component here warned "Function components cannot be given refs"
// on EVERY page (the header renders everywhere). Forward both.
const BellWithBadge = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function BellWithBadge(props, ref) {
  const { count } = useUnreadBadge();
  return (
    <div className="relative" ref={ref} {...props}>
      <button className="group rounded-xl bg-slate-100/70 p-2.5 transition-all duration-200 hover:scale-110 hover:bg-slate-200 dark:bg-slate-800/70 dark:hover:bg-slate-700">
        <HiOutlineBell className="h-5 w-5 text-slate-600 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-white" />
      </button>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 h-[18px] min-w-[18px] rounded-full border-2 border-white bg-red-500 px-1 text-center text-[10px] font-semibold leading-[14px] text-white dark:border-slate-900">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </div>
  );
});

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
        className="rounded-xl bg-slate-100/70 p-2.5 transition-all duration-200 hover:scale-110 hover:bg-slate-200 dark:bg-slate-800/70 dark:hover:bg-slate-700"
        aria-label="Toggle theme"
      >
        {isDarkMode ? (
          <HiOutlineSun className="h-5 w-5 text-amber-500" />
        ) : (
          <HiOutlineMoon className="h-5 w-5 text-slate-600" />
        )}
      </button>

      {/* Active deployments chip — visible only when something is in flight */}
      <DeploymentProgressChip />

      {/* Notifications */}
      <NotificationDropdown>
        <BellWithBadge />
      </NotificationDropdown>

      {/* Divider */}
      <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />

      {/* Profile Menu */}
      <ProfileMenu />
    </div>
  );
}
