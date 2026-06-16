import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Title, Collapse } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiCaretDownBold, PiDatabase, PiBrain, PiFolderDuotone } from 'react-icons/pi';
import {
  HiOutlineMap,
  HiOutlineCog8Tooth,
  HiOutlineUsers,
  HiOutlineShieldCheck,
  HiOutlineKey,
  HiOutlineHome,
  HiOutlineSquares2X2,
  HiOutlineSparkles,
  HiOutlineBuildingOffice2,
  HiOutlineChartBarSquare,
  HiOutlineFingerPrint,
} from 'react-icons/hi2';


const modernMenuItems = [
  {
    name: 'Dashboard',
    href: '/',
    icon: <HiOutlineHome className="w-5 h-5" />,
  },
  {
    name: 'Sources',
    href: '/sources',
    icon: <PiDatabase className="w-5 h-5" />,
    badge: 'NEW',
  },
  {
    name: 'Products / Projects',
    href: '/data-products',
    icon: <HiOutlineSquares2X2 className="w-5 h-5" />,
  },
  {
    name: 'Modeling',
    icon: <HiOutlineMap className="w-5 h-5" />,
    dropdownItems: [
      {
        name: 'Explore & Design',
        href: '/explore-design',
        icon: <HiOutlineSparkles className="w-4 h-4" />,
      },
      {
        name: 'Workflow',
        href: '/workflow',
        icon: <HiOutlineCog8Tooth className="w-4 h-4" />,
      }
    ]
  },
  {
    name: 'Data Sources',
    icon: <HiOutlineCog8Tooth className="w-5 h-5" />,
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
    name: 'Intelligent',
    href: '/intelligent',
    icon: <PiBrain className="w-5 h-5" />,
  },
  {
    name: 'Observability',
    href: '/observability',
    icon: <HiOutlineChartBarSquare className="w-5 h-5" />,
  },
  {
    name: 'Governance',
    icon: <HiOutlineShieldCheck className="w-5 h-5" />,
    dropdownItems: [
      {
        name: 'Users',
        href: '/governance/users',
        icon: <HiOutlineUsers className="w-4 h-4" />,
      },
      {
        name: 'Roles',
        href: '/governance/roles',
        icon: <HiOutlineShieldCheck className="w-4 h-4" />,
      },
      {
        name: 'Grants',
        href: '/governance/grants',
        icon: <HiOutlineKey className="w-4 h-4" />,
      },
      {
        name: 'Policies',
        href: '/governance/policies',
        icon: <HiOutlineShieldCheck className="w-4 h-4" />,
      },
      {
        name: 'Masking Policy',
        href: '/governance/policies',
        icon: <HiOutlineShieldCheck className="w-4 h-4" />,
      },
      {
        name: 'OAuth & Auth',
        href: '/governance/oauth',
        icon: <HiOutlineFingerPrint className="w-4 h-4" />,
      },
      {
        name: 'Projects',
        href: '/governance/projects',
        icon: <PiFolderDuotone className="w-4 h-4" />,
      }
    ]
  },
  {
    name: 'Client Accounts',
    href: '/client-accounts',
    icon: <HiOutlineBuildingOffice2 className="w-5 h-5" />,
  }
];

export function SidebarMenu() {
  const pathname = usePathname();

  // Feature flag: show full menu when datalake connection completed
  const [datalakeConnected, setDatalakeConnected] = useState<boolean>(false);

  useEffect(() => {
    // Initialize from localStorage (or future session-based flag)
    try {
      const flag = typeof window !== 'undefined' ? window.localStorage.getItem('features.datalakeConnected') : null;
      setDatalakeConnected(flag === '1');
    } catch {}

    // Listen for refresh events to update without logout/login
    const handler = () => {
      try {
        const flag = typeof window !== 'undefined' ? window.localStorage.getItem('features.datalakeConnected') : null;
        setDatalakeConnected(flag === '1');
      } catch {}
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('app:refresh-menu', handler);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('app:refresh-menu', handler);
      }
    };
  }, []);

  const filteredMenuItems = useMemo(() => {
    if (datalakeConnected) {
      return modernMenuItems;
    }
    // Before connection established: show minimal menu with only Connections under Data Sources
    return modernMenuItems
      .map((item) => {
        if (item.name === 'Data Sources') {
          return {
            ...item,
            dropdownItems: item.dropdownItems?.filter((d: any) => d.href === '/data-source-connection')
          };
        }
        // Hide other groups entirely when not connected
        if (['Sources', 'Products / Projects', 'Modeling', 'Data Sources', 'Intelligent', 'Observability', 'Governance', 'Client Accounts'].includes(item.name)) {
          return null as any;
        }
        return item;
      })
      .filter(Boolean);
  }, [datalakeConnected]);

  return (
    <nav className="space-y-2">
      {filteredMenuItems.map((item: any, index: number) => {
        const isActive = pathname === (item?.href as string);
        const pathnameExistInDropdowns: any = item?.dropdownItems?.filter(
          (dropdownItem: any) => dropdownItem.href === pathname
        );
        const isDropdownOpen = Boolean(pathnameExistInDropdowns?.length);

        return (
          <Fragment key={item.name + '-' + index}>
            {item?.dropdownItems ? (
              <div className="rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60">
              <Collapse
                header={({ open, toggle }) => (
                  <button
                      className="flex w-full items-center justify-between text-slate-700 dark:text-slate-200"
                    onClick={toggle}
                    >
                      <div className="flex items-center gap-2">
                        {item?.icon}
                        <Title as="h6" className="font-medium">
                      {item.name}
                        </Title>
                    </div>
                    <PiCaretDownBold
                        className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
                    />
                  </button>
                )}
              >
                  <div className="px-2 pb-2">
                    {item?.dropdownItems?.map((dropdownItem: any) => {
                      const isDropdownActive = pathname === dropdownItem.href;
                    return (
                      <Link
                          key={dropdownItem.name}
                          href={dropdownItem.href}
                        className={cn(
                            'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                            isDropdownActive
                              ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                          )}
                        >
                          {dropdownItem.icon && dropdownItem.icon}
                        {dropdownItem.name}
                      </Link>
                    );
                  })}
                </div>
              </Collapse>
              </div>
            ) : (
              <Link
                href={item?.href as string}
                className={cn(
                  'flex items-center gap-2 rounded-md border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60 px-4 py-3 transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                )}
              >
                {item?.icon}
                <Title as="h6" className="font-medium">
                  {item.name}
                </Title>
                {item?.badge && (
                  <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                    {item.badge}
                  </span>
                )}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
