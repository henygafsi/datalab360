'use client';

import { projectRecentActivitiesData } from '@/data/project-dashboard';
import WidgetCard from '@core/components/cards/widget-card';
import cn from '@core/utils/class-names';
import { Box, Flex, Text } from 'rizzui';
import SimpleBar from 'simplebar-react';

export default function RecentActivities({
  className,
}: {
  className?: string;
}) {
  // Previously two tabs ("Activity" / "Update") rendered the identical feed —
  // the data has no type field to split on, so they are collapsed into one
  // honest list rather than showing the same content twice.
  return (
    <WidgetCard
      title="Recent Activities"
      className={cn('@container dark:bg-gray-100/50', className)}
    >
      <SimpleBar className="mt-4 h-[505px] @3xl/pd:h-[700px] @7xl/pd:h-[380px]">
        <ActivityCard />
      </SimpleBar>
    </WidgetCard>
  );
}

function ActivityCard() {
  return (
    <Box className="space-y-2 p-0.5">
      {projectRecentActivitiesData.map((activity) => (
        <Box
          key={activity.id}
          className="group cursor-pointer space-y-1 rounded-lg bg-gray-50 p-4 transition-shadow hover:shadow dark:bg-gray-100"
        >
          <Flex align="center" justify="between" className="gap-0">
            <Text className="font-semibold group-hover:underline">
              {activity.title}
            </Text>
            <Text className="text-gray-400">{activity.date}</Text>
          </Flex>
          <Text className="text-gray-400">{activity.activity}</Text>
        </Box>
      ))}
    </Box>
  );
}
