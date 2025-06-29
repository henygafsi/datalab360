"use client";

import { Box, Flex, Text } from "rizzui";
import cn from "@core/utils/class-names";
import WidgetCard from "@core/components/cards/widget-card";
import { Pie, PieChart, ResponsiveContainer } from "recharts";
import { useElementSize } from "@core/hooks/use-element-size";

const data = [
  {
    name: "45",
    devices: 2723,
    fill: "#96C0FF",
    id: "#ratingShadowOne",
    text: "Revenue",
  },
  {
    name: "30",
    devices: 6304,
    fill: "#4052F6",
    id: "#ratingShadowOne",
    text: "Conversions",
  },
  {
    name: "20",
    devices: 8530,
    fill: "#282ECA",
    id: "#ratingShadowOne",
    text: "Clicks",
  },
];

export default function CampaignManagement({ className }: { className?: string }) {
  const [ref, { width }] = useElementSize();
  const isLG = width > 430;

  return (
    <WidgetCard
      ref={ref}
      title="Campaign Management"
      className={cn("@container h-full dark:bg-[#181818]", className)}
    >
      <Box className="flex size-full flex-col items-center justify-center pb-4">
        <Box className="relative h-60 w-full shrink-0 @sm:mt-8 @sm:h-64">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <PieChart
              margin={{
                top: 40,
              }}
              className="relative [&>.recharts-surface]:mx-auto [&>.recharts-surface]:max-w-md [&>.recharts-surface]:md:max-w-none"
            >
              <Pie
                data={data}
                stroke="none"
                endAngle={-10}
                startAngle={190}
                paddingAngle={4}
                dataKey="devices"
                innerRadius={isLG ? 120 : 80}
                outerRadius={isLG ? 140 : 100}
                cornerRadius={10}
              />
            </PieChart>
          </ResponsiveContainer>

          <Flex
            className="absolute inset-0"
            justify="center"
            align="center"
            direction="col"
            gap="1"
          >
            <Text className="text-2xl font-bold text-gray-800 @2xl:text-3xl">100%</Text>
          </Flex>
        </Box>
        <Flex
          justify="center"
          className="-mt-8 flex-wrap @lg:gap-8"
        >
          {data.map((item) => (
            <Box key={item.name}>
              <Flex
                align="center"
                gap="1"
              >
                <span
                  className="me-2 size-3.5 flex-shrink-0"
                  style={{ backgroundColor: item.fill }}
                />
                <Text className="text-xl font-semibold">{item.name}%</Text>
              </Flex>
              <Text className="ms-[26px] font-medium">{item.text}</Text>
            </Box>
          ))}
        </Flex>
      </Box>
    </WidgetCard>
  );
}
