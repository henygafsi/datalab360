'use client';

import React, { useMemo } from 'react';
import WidgetCard from '@core/components/cards/widget-card';
import { CustomTooltip } from '@core/components/charts/custom-tooltip';
import {
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
} from 'recharts';
import SimpleBar from '@core/ui/simplebar';
import DropdownAction from '@core/components/charts/dropdown-action';
import { Flex, Title } from 'rizzui';
import cn from '@core/utils/class-names';
import TrendingUpIcon from '@core/components/icons/trending-up';
import { useTheme } from 'next-themes';
import {
  financialViewOptions,
  totalStatisticsData,
  totalStatisticsLegend,
} from '@/data/financial-data';

const COLORS = {
  revenue: { dark: '#28D775', light: '#28D775' },
  expenses: { dark: '#273849', light: '#111A23' },
};

export default function TotalStatistics({ className }: { className?: string }) {
  const { theme } = useTheme();

  const handleChange = React.useCallback((viewType: string) => {
    console.log('viewType', viewType);
  }, []);

  const chartColors = useMemo(
    () => ({
      revenue:
        COLORS.revenue[theme as keyof typeof COLORS.revenue] ||
        COLORS.revenue.light,
      expenses:
        COLORS.expenses[theme as keyof typeof COLORS.expenses] ||
        COLORS.expenses.light,
    }),
    [theme]
  );

  return (
    <WidgetCard
      title="Total Statistics"
      titleClassName="text-gray-700 font-normal sm:text-sm font-inter"
      headerClassName="items-center"
      action={
        <Flex align="center" gap="5">
          <CustomLegend className="hidden @[28rem]:mt-0 @[28rem]:inline-flex" />
          <DropdownAction
            className="rounded-md border"
            options={financialViewOptions}
            onChange={handleChange}
            dropdownClassName="!z-0"
          />
        </Flex>
      }
      className={cn('min-h-[28rem] @container', className)}
    >
      <StatisticsSummary />
      <CustomLegend className="mb-4 mt-0 inline-flex @[28rem]:hidden" />
      <ChartContainer chartColors={chartColors} />
    </WidgetCard>
  );
}

function StatisticsSummary() {
  return (
    <div className="mb-3 mt-1 flex items-center gap-2 @[28rem]:mb-4">
      <Title as="h2" className="font-semibold">
        $83.45k
      </Title>
      <span className="flex items-center gap-1 text-green-dark">
        <TrendingUpIcon className="h-auto w-5" />
        <span className="font-medium leading-none"> +32.40%</span>
      </span>
    </div>
  );
}

function ChartContainer({
  chartColors,
}: {
  chartColors: { revenue: string; expenses: string };
}) {
  return (
    <SimpleBar className="-mb-3 pb-3">
      <div className="h-[24rem] w-full pt-6 @lg:pt-8">
        <ResponsiveContainer width="100%" height="100%" minWidth={900}>
          <ComposedChart
            barGap={8}
            data={totalStatisticsData}
            margin={{ left: -17, top: 20 }}
            className="[&_.recharts-tooltip-cursor]:fill-opacity-20 dark:[&_.recharts-tooltip-cursor]:fill-opacity-10 [&_.recharts-cartesian-axis-tick-value]:fill-gray-500 [&_.recharts-cartesian-axis.yAxis]:-translate-y-3 rtl:[&_.recharts-cartesian-axis.yAxis]:-translate-x-12 [&_.recharts-xAxis.xAxis]:translate-y-2.5 [&_path.recharts-rectangle]:!stroke-none"
          >
            <CartesianGrid
              vertical={false}
              strokeOpacity={0.435}
              strokeDasharray="8 10"
            />
            <XAxis dataKey="label" axisLine={false} tickLine={false} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={(label) => `$${label}k`}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar
              dataKey="revenue"
              fill={chartColors.revenue}
              stroke={chartColors.revenue}
              barSize={28}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              type="natural"
              dataKey="expenses"
              fill={chartColors.expenses}
              stroke={chartColors.expenses}
              barSize={28}
              radius={[4, 4, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </SimpleBar>
  );
}

function CustomLegend({ className }: { className?: string }) {
  const { theme } = useTheme();
  return (
    <div
      className={cn(
        'mt-2 flex flex-wrap items-start gap-3 lg:gap-7',
        className
      )}
    >
      {totalStatisticsLegend.map((item) => (
        <div key={item.name} className="flex items-center gap-1.5">
          <span
            className="-mt-0.5 h-3 w-3 rounded-full"
            style={{
              backgroundColor:
                COLORS[item.name.toLowerCase() as keyof typeof COLORS][
                  theme as 'dark' | 'light'
                ],
            }}
          />
          <span>{item.name}</span>
        </div>
      ))}
    </div>
  );
}
