'use client';

import { Badge } from 'rizzui';
import {
  HiOutlineCurrencyDollar,
  HiOutlineUsers,
  HiOutlineShoppingCart,
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
  HiOutlineEye,
  HiOutlineGlobeAlt,
  HiOutlineChartBarSquare,
  HiOutlineDocumentChartBar,
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlineSparkles,
} from 'react-icons/hi2';

interface StatCardProps {
  id: string;
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  icon: React.ReactNode;
  colorScheme: 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'indigo';
  subtitle?: string;
}

function StatCard({ title, value, change, icon, trend, colorScheme, subtitle }: StatCardProps) {
  const colorSchemes = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    amber: 'from-amber-500 to-amber-600',
    red: 'from-red-500 to-red-600',
    indigo: 'from-indigo-500 to-indigo-600'
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl shadow-slate-900/5 dark:shadow-black/20 p-8 group relative overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-slate-900/10 dark:hover:shadow-black/30 hover:-translate-y-1">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-transparent to-slate-100/50 dark:from-slate-900/50 dark:via-transparent dark:to-slate-800/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
      
      <div className="flex items-start justify-between relative z-10">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-3">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 tracking-wide uppercase">{title}</p>
            {subtitle && (
              <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-xs">
                {subtitle}
              </Badge>
            )}
          </div>
          
          <p className="text-4xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">{value}</p>
          
          <div className="flex items-center space-x-2">
            <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-semibold ${
              trend === 'up' 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {trend === 'up' ? (
                <HiOutlineArrowTrendingUp className="h-4 w-4" />
              ) : (
                <HiOutlineArrowTrendingDown className="h-4 w-4" />
              )}
              <span>{change}</span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">vs last period</span>
          </div>
        </div>
        
        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${colorSchemes[colorScheme]} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
          <div className="text-white scale-125">
            {icon}
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
    </div>
  );
}

export const STAT_CARD_OPTIONS = [
  {
    id: 'revenue',
    title: 'Total Revenue',
    value: '$124.8K',
    change: '+12.5%',
    trend: 'up' as const,
    icon: <HiOutlineCurrencyDollar className="h-7 w-7" />,
    colorScheme: 'blue' as const,
    subtitle: 'Monthly'
  },
  {
    id: 'users',
    title: 'Active Users',
    value: '24,847',
    change: '+8.3%',
    trend: 'up' as const,
    icon: <HiOutlineUsers className="h-7 w-7" />,
    colorScheme: 'green' as const,
    subtitle: 'Live'
  },
  {
    id: 'orders',
    title: 'Total Orders',
    value: '3,429',
    change: '-2.4%',
    trend: 'down' as const,
    icon: <HiOutlineShoppingCart className="h-7 w-7" />,
    colorScheme: 'purple' as const,
    subtitle: 'Weekly'
  },
  {
    id: 'growth',
    title: 'Growth Rate',
    value: '18.6%',
    change: '+5.2%',
    trend: 'up' as const,
    icon: <HiOutlineArrowTrendingUp className="h-7 w-7" />,
    colorScheme: 'amber' as const,
    subtitle: 'YTD'
  },
  {
    id: 'pageviews',
    title: 'Page Views',
    value: '1.2M',
    change: '+24.1%',
    trend: 'up' as const,
    icon: <HiOutlineEye className="h-7 w-7" />,
    colorScheme: 'indigo' as const,
    subtitle: 'This Month'
  },
  {
    id: 'conversions',
    title: 'Conversions',
    value: '4,267',
    change: '+15.8%',
    trend: 'up' as const,
    icon: <HiOutlineSparkles className="h-7 w-7" />,
    colorScheme: 'red' as const,
    subtitle: 'Monthly'
  }
];

export default StatCard;