"use client";

import { useDndEnabled } from "@/store/dnd-enable-store";
import { Box, Flex, Switch, Text } from "rizzui";

export default function DndSwitcher() {
  const { enabled, setEnabled } = useDndEnabled();
  return (
    <Flex
      align="center"
      justify="between"
      className="fixed z-30 bottom-4 left-1/2 -translate-x-1/2 lg:translate-x-0 2xl:translate-x-2.5 max-w-[280px] w-full px-4 py-1 rounded-md shadow-lg border border-muted bg-gray-50"
    >
      <Box>
        <Text className="font-semibold text-base">Enable Drag & Drop</Text>
      </Box>
      <Switch
        size="lg"
        checked={enabled}
        onChange={() => setEnabled(!enabled)}
        switchKnobClassName="!bg-gray-50 [&_svg]:text-gray-900"
        switchClassName="!bg-gray-900 !border-gray-50 !ring-0 !ring-offset-0"
      />
    </Flex>
  );
}
