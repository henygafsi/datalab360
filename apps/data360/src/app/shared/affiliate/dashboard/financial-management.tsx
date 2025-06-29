"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import cn from "@core/utils/class-names";
import { Badge, Box, Flex } from "rizzui";
import SimpleBar from "@core/ui/simplebar";
import { DatePicker } from "@core/ui/datepicker";
import { useMedia } from "@core/hooks/use-media";
import { fiManChartData } from "@/data/affiliate.data";
import WidgetCard from "@core/components/cards/widget-card";
import { CustomTooltip } from "@core/components/charts/custom-tooltip";
import { Bar, XAxis, YAxis, Tooltip, BarChart, CartesianGrid, ResponsiveContainer } from "recharts";

export default function FinancialManagement({ className }: { className?: string }) {
  const [startDate, setStartDate] = useState(new Date());
  const isTablet = useMedia("(max-width: 800px)", false);
  const theme = useTheme();
  const isDark = theme.theme === "dark";

  return (
    <WidgetCard
      title="Financial Management"
      action={
        <>
          <Flex
            align="center"
            className="gap-0 hidden @md:flex"
          >
            <Box>
              <Badge
                renderAsDot
                className="me-0.5 bg-[#2563eb]"
              />{" "}
              CPC
            </Box>
            <Box>
              <Badge
                renderAsDot
                className="me-0.5 ms-4 bg-[#60a8fb]"
              />{" "}
              CPA
            </Box>
          </Flex>
          <DatePicker
            selected={startDate}
            onChange={(date) => setStartDate(date!)}
            dateFormat="yyyy"
            showYearPicker
            placeholderText="Select Year"
            inputProps={{ variant: "text", inputClassName: "p-0 px-1 h-auto" }}
            popperPlacement="bottom-end"
            className="w-[100px]"
          />
        </>
      }
      actionClassName="flex items-center gap-8"
      className={cn("@container h-full dark:bg-[#181818]", className)}
    >
      <SimpleBar>
        <Box className="h-80 w-full pt-9">
          <ResponsiveContainer
            width="100%"
            height="100%"
            {...(isTablet && { minWidth: "700px" })}
          >
            <BarChart
              data={fiManChartData}
              barSize={26}
              margin={{
                top: 20,
                left: -24,
              }}
              className="[&_.recharts-tooltip-cursor]:fill-opacity-20 dark:[&_.recharts-tooltip-cursor]:fill-opacity-10 [&_.recharts-cartesian-axis-tick-value]:fill-gray-500 [&_.recharts-cartesian-grid-vertical]:opacity-0"
              style={{ stroke: isDark ? "#111111" : "#ffffff", strokeWidth: 2 }}
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
              <YAxis
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="cpc"
                fill="#2563eb"
                stackId="a"
                radius={4}
              />
              <Bar
                dataKey="cpa"
                stackId="a"
                fill="#60a8fb"
                radius={4}
              />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleBar>
    </WidgetCard>
  );
}
