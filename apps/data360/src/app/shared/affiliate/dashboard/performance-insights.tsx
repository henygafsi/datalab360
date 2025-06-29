"use client";

import { useState } from "react";
import cn from "@core/utils/class-names";
import { Box, Flex, RadialProgressBar, Text } from "rizzui";
import WidgetCard from "@core/components/cards/widget-card";
import ArrowShapeIcon from "@core/components/icons/arrow-shape-up";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

const data = [
  { name: "Dental Care", value: 45 },
  { name: "Neurology", value: 58 },
  { name: "Gynecology", value: 32 },
];
const COLORS = ["#60a8fb", "#4052F6", "#282ECA"];

const dataTwo = [
  { name: "Campaigns", value: 45 },
  { name: "Marketing Materials", value: 37 },
];

export default function PerformanceInsights({ className }: { className?: string }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const onPieEnter = (_: unknown, index: number) => {
    setActiveIndex(index);
  };

  return (
    <WidgetCard
      title="Performance Insights"
      className={cn("@container h-full dark:bg-[#181818]", className)}
    >
      <Flex
        justify="center"
        align="center"
        direction="col"
        gap="6"
        className="h-full pt-6 pb-4 @lg:flex-row @xl:justify-center @2xl:gap-12"
      >
        <Box className="relative size-[170px] shrink-0">
          <ResponsiveContainer
            width="100%"
            height="100%"
            className="relative z-10"
          >
            <PieChart>
              <Pie
                cx="50%"
                cy="50%"
                dataKey="value"
                innerRadius="80%"
                outerRadius="100%"
                fill="#8884d8"
                paddingAngle={4}
                data={data}
                onMouseEnter={onPieEnter}
                activeIndex={activeIndex}
                cornerRadius={2}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                    stroke={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <Box className="absolute inset-9 flex flex-col items-center justify-center rounded-full bg-white shadow-[0px_4px_20px_0px_#00000029] dark:bg-gray-200">
            <Text className="text-center text-gray-500">Total</Text>
            <Text className="text-xl font-bold dark:text-white">82%</Text>
          </Box>

          <Box className="absolute -inset-2 rounded-full shadow-[0px_4px_20px_0px_#00000029]" />
        </Box>

        <Flex
          align="center"
          justify="evenly"
          className="@xl:w-auto @2xl:gap-12"
        >
          {dataTwo.map((item, index) => (
            <Flex
              key={index}
              align="center"
              direction="col"
              className="w-auto @md:flex-row"
            >
              <Box className="bg-[#96C0FF]/50 inline-block rounded-full relative">
                <RadialProgressBar
                  size={68}
                  value={item.value}
                  trackColor="#96C0FF33"
                  progressColor="#282ECA"
                  progressbarWidth={5}
                  startAngle={45}
                />
                <Flex
                  align="center"
                  justify="center"
                  className="absolute inset-3.5 w-auto bg-white z-10 p-1 shadow-[0px_4px_8px_0px_#11111114] rounded-full gap-0"
                >
                  <ArrowShapeIcon className="size-5" />
                </Flex>
              </Box>
              <Box className="text-center @md:text-start">
                <Text className="text-xl font-bold dark:text-white">+{item.value}%</Text>
                <Text className="text-gray-500">{item.name}</Text>
              </Box>
            </Flex>
          ))}
        </Flex>
      </Flex>
    </WidgetCard>
  );
}
