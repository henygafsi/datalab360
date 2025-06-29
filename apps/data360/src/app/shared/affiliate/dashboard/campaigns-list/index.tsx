"use client";

import React from "react";
import Link from "next/link";
import { Button } from "rizzui";
import cn from "@core/utils/class-names";
import { defaultColumns } from "./column";
import MainTable from "@core/components/table";
import { campaignsListData } from "@/data/affiliate.data";
import WidgetCard from "@core/components/cards/widget-card";
import { useTanStackTable } from "@core/components/table/custom/use-TanStack-Table";

export type CustomerListDataType = (typeof campaignsListData)[0];

export default function CampaignsList({ className }: { className?: string }) {
  const { table } = useTanStackTable<CustomerListDataType>({
    tableData: campaignsListData,
    columnConfig: defaultColumns,
    options: {
      initialState: {
        pagination: {
          pageIndex: 0,
          pageSize: 4,
        },
      },
      enableSorting: false,
      enableColumnResizing: false,
    },
  });

  return (
    <WidgetCard
      title="Campaigns list"
      className={cn("@container h-full dark:bg-[#181818]", className)}
      headerClassName="items-center mb-1 @xl:mb-4"
      action={
        <Link href={"#"}>
          <Button
            as="span"
            variant="text"
            className="p-0 underline"
          >
            View All
          </Button>
        </Link>
      }
    >
      <MainTable
        table={table}
        variant="minimal"
        classNames={{
          container: "[&>table>thead>tr>th]:whitespace-nowrap",
        }}
      />
    </WidgetCard>
  );
}
