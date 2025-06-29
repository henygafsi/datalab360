"use client";

import { Box } from "rizzui";
import AffiliateStats from "./stats";
import MyProfile from "./my-profile";
import cn from "@core/utils/class-names";
import { Fragment, useState } from "react";
import CampaignsList from "./campaigns-list";
import CampaignManagement from "./campaign-management";
import VisitorsStatistics from "./visitors-statistics";
import { PiArrowsOutCardinalBold } from "react-icons/pi";
import FinancialManagement from "./financial-management";
import PerformanceInsights from "./performance-insights";
import { useIsMounted } from "@core/hooks/use-is-mounted";
import {
  DndContext,
  DragOverEvent,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arraySwap, rectSwappingStrategy, SortableContext } from "@dnd-kit/sortable";
import { DragHandle, SortableItem } from "@core/components/dnd/dnd-sortable-item";
import DndSwitcher from "@/app/shared/dnd-switcher";
import { useDndEnabled } from "@/store/dnd-enable-store";

const initialItems = [
  {
    id: "111",
    className: "@4xl/af:col-span-full @4xl/af:order-1 @7xl/af:col-span-8",
    content: <VisitorsStatistics />,
  },
  {
    id: "222",
    className: "@4xl/af:order-2 @5xl/af:col-span-6 @7xl/af:col-span-4",
    content: <MyProfile />,
  },
  {
    id: "333",
    className: "@4xl/af:col-span-full @4xl/af:order-4 @7xl/af:order-3 @7xl/af:col-span-8",
    content: <CampaignsList />,
  },
  {
    id: "444",
    className: "@4xl/af:order-3  @5xl/af:col-span-6 @7xl/af:order-4 @7xl/af:col-span-4",
    content: <CampaignManagement />,
  },
  {
    id: "555",
    className: "@4xl/af:col-span-full @4xl/af:order-5  @5xl/af:col-span-6",
    content: <FinancialManagement />,
  },
  {
    id: "666",
    className: "@4xl/af:col-span-full @4xl/af:order-6  @5xl/af:col-span-6",
    content: <PerformanceInsights />,
  },
];

export default function AffiliateDashBoard() {
  const { enabled } = useDndEnabled();
  const isMounted = useIsMounted();
  const [items, setItems] = useState(initialItems);
  const [over, setOver] = useState<DragOverEvent["over"]>();
  const [active, setActive] = useState<DragStartEvent["active"]>();

  function handleDragEnd() {
    const activeIndex = items.findIndex((item) => item.id === active?.id);
    const overIndex = items.findIndex((item) => item.id === over?.id);
    const activeClassName = active?.data?.current?.className;
    const overClassName = over?.data?.current?.className;
    const swappedArray = arraySwap(items, activeIndex, overIndex);
    swappedArray[activeIndex].className = activeClassName;
    swappedArray[overIndex].className = overClassName;
    setItems(() => swappedArray);
  }

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  if (!isMounted) return null;

  return (
    <Box className="@container/af">
      <Box className="grid grid-cols-1 @4xl/af:grid-cols-2 @5xl/af:grid-cols-12 gap-6 3xl:gap-8">
        <AffiliateStats className="@4xl/af:col-span-full" />
        <DndContext
          onDragStart={(e: DragStartEvent) => setActive(e.active)}
          onDragOver={(e: DragOverEvent) => setOver(e.over)}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <SortableContext
            items={items}
            strategy={rectSwappingStrategy}
          >
            {items.map((item, index) => (
              <Fragment key={index}>
                <SortableItem
                  as={"div"}
                  data={item}
                  id={item.id}
                  className={cn("relative h-full group", item.className)}
                >
                  {item.content}
                  {enabled && (
                    <DragHandle
                      className={cn(
                        "absolute bg-muted rounded-tl-md z-10 start-0 top-0 size-8 rounded-br-md border border-t-0 border-l-0 border-muted transition-transform duration-1000 text-gray-700 flex justify-center items-center",
                        enabled ? "translate-x-0" : "-translate-x-12"
                      )}
                    >
                      <PiArrowsOutCardinalBold className="size-4" />
                    </DragHandle>
                  )}
                </SortableItem>
              </Fragment>
            ))}
          </SortableContext>
        </DndContext>
      </Box>
      <DndSwitcher />
    </Box>
  );
}
