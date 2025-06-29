"use client";

import { Box } from "rizzui";
import cn from "@core/utils/class-names";
import SimpleBar from "@core/ui/simplebar";
import { useMedia } from "@core/hooks/use-media";
import WidgetCard from "@core/components/cards/widget-card";
import { visitorsStatisticsData } from "@/data/affiliate.data";
import { CustomTooltip } from "@core/components/charts/custom-tooltip";
import {
  Area,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export default function VisitorsStatistics({ className }: { className?: string }) {
  const isTablet = useMedia("(max-width: 800px)", false);

  return (
    <WidgetCard
      title="Visitors Statistics"
      description="Revealing risk and growth in investments."
      className={cn("@container h-full dark:bg-[#181818]", className)}
    >
      <SimpleBar>
        <Box className="h-96 w-full pt-9">
          <ResponsiveContainer
            width="100%"
            height="100%"
            {...(isTablet && { minWidth: "700px" })}
          >
            <AreaChart
              data={visitorsStatisticsData}
              margin={{
                left: -16,
              }}
              className="[&_.recharts-cartesian-axis-tick-value]:fill-gray-500 rtl:[&_.recharts-cartesian-axis.yAxis]:-translate-x-12 [&_.recharts-cartesian-grid-vertical]:opacity-0"
            >
              <CartesianGrid
                strokeDasharray="8 10"
                strokeOpacity={0.435}
              />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
              />
              <YAxis tickLine={false} />
              <Tooltip
                content={<CustomTooltip />}
                defaultIndex={2}
              />
              <Area
                type="monotone"
                dataKey="downloads"
                stroke="#6B46FF"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#downloads)"
              />
              <Area
                type="monotone"
                dataKey="uploads"
                stroke="#00D1FF"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#uploads)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </SimpleBar>
    </WidgetCard>
  );
}
