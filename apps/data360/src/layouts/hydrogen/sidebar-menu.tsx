import Link from 'next/link';
import { Fragment } from 'react';
import { usePathname } from 'next/navigation';
import { Title, Collapse } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiCaretDownBold } from 'react-icons/pi';
import { 
  HiOutlineDatabase, 
  HiOutlineMap, 
  HiOutlineCog8Tooth, 
  HiOutlineChartBarSquare,
  HiOutlineUsers,
  HiOutlineShieldCheck,
  HiOutlineKey,
  HiOutlineHome,
  HiOutlineDocumentChart
} from 'react-icons/hi2';

// Modern menu items with better organization
const modernMenuItems = [
  {
    name: 'Dashboard',
    href: '/',
    icon: <HiOutlineHome className="w-5 h-5" />,
  },
  {
    name: 'Data Sources',
    icon: <HiOutlineDatabase className="w-5 h-5" />,
    dropdownItems: [
      {
        name: 'Connections',
        href: '/data-source-connection',
      },
      {
        name: 'Configuration',
        href: '/data-source-config',
      }
    ]
  },
  {
    name: 'Data Processing',
    dropdownItems: [
      {
        name: 'Mapping',
        href: '/mapping',
        icon: <HiOutlineMap className="w-4 h-4" />,
      },
      {
        name: 'Workflow',
        href: '/workflow',
        icon: <HiOutlineCog8Tooth className="w-4 h-4" />,
      }
    ]
  },
  {
    name: 'Analytics',
    dropdownItems: [
      {
        name: 'BI Reporting',
        href: '/bi-reporting',
        icon: <HiOutlineChartBarSquare className="w-4 h-4" />,
      },
      {
        name: 'Dashboards',
        href: '/analytics',
        icon: <HiOutlineDocumentChart className="w-4 h-4" />,
      }
    ]
  },
  {
    name: 'Governance',
    dropdownItems: [
      {
        name: 'Users',
        href: '/gouvernance/users',
        icon: <HiOutlineUsers className="w-4 h-4" />,
      },
      {
        name: 'Roles',
        href: '/gouvernance/roles',
        icon: <HiOutlineShieldCheck className="w-4 h-4" />,
      },
      {
        name: 'Grants',
        href: '/gouvernance/grants',
        icon: <HiOutlineKey className="w-4 h-4" />,
      }
    ]
  }
];

export function SidebarMenu() {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {modernMenuItems.map((item, index) => {
        const isActive = pathname === (item?.href as string);
        const pathnameExistInDropdowns: any = item?.dropdownItems?.filter(
          (dropdownItem) => dropdownItem.href === pathname
        );
        const isDropdownOpen = Boolean(pathnameExistInDropdowns?.length);

        return (
          <Fragment key={item.name + '-' + index}>
            {item?.href ? (
              // Single Menu Item
              <Link
                href={item.href}
                className={cn(
                  'group flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-600 dark:text-blue-400 shadow-sm border border-blue-200/20 dark:border-blue-500/20'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                <span className={cn(
                  'mr-3 transition-transform duration-200',
                  isActive ? 'text-blue-600 dark:text-blue-400 scale-110' : 'group-hover:scale-110'
                )}>
                  {item.icon}
                </span>
                {item.name}
                {isActive && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                )}
              </Link>
            ) : (
              // Dropdown Menu Item
              <Collapse
                defaultOpen={isDropdownOpen}
                header={({ open, toggle }) => (
                  <button
                    onClick={toggle}
                    className={cn(
                      'group w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                      isDropdownOpen
                        ? 'bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    <div className="flex items-center">
                      <span className="mr-3 transition-transform duration-200 group-hover:scale-110">
                        {item.icon || <HiOutlineDocumentChart className="w-5 h-5" />}
                      </span>
                      {item.name}
                    </div>
                    <PiCaretDownBold
                      className={cn(
                        'w-4 h-4 transition-transform duration-200',
                        open ? 'rotate-0' : '-rotate-90'
                      )}
                    />
                  </button>
                )}
              >
                <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-4">
                  {item?.dropdownItems?.map((dropdownItem, dropIndex) => {
                    const isChildActive = pathname === (dropdownItem?.href as string);

                    return (
                      <Link
                        key={dropdownItem?.name + dropIndex}
                        href={dropdownItem?.href}
                        className={cn(
                          'group flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                          isChildActive
                            ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-600 dark:text-blue-400 shadow-sm border border-blue-200/20 dark:border-blue-500/20'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white hover:translate-x-1'
                        )}
                      >
                        <span className={cn(
                          'mr-3 transition-all duration-200',
                          isChildActive ? 'text-blue-600 dark:text-blue-400 scale-110' : 'group-hover:scale-110'
                        )}>
                          {dropdownItem.icon || <div className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />}
                        </span>
                        {dropdownItem.name}
                        {isChildActive && (
                          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </Collapse>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
