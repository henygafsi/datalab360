"use client";

import EyeIcon from "@core/components/icons/eye";
import PencilIcon from "@core/components/icons/pencil";
import TrashIcon from "@core/components/icons/trash";
import AvatarCard from "@core/ui/avatar-card";
import { toCurrency } from "@core/utils/to-currency";
import { createColumnHelper } from "@tanstack/react-table";
import { ActionIcon, Flex } from "rizzui";
import { CustomerListDataType } from ".";

const columnHelper = createColumnHelper<CustomerListDataType>();

export const defaultColumns = [
  columnHelper.accessor("image", {
    size: 220,
    header: "Campaign Name",
    cell: ({ row: { original } }) => (
      <AvatarCard
        src={original.image}
        name={original.campaignName}
        nameClassName="line-clamp-1"
        avatarProps={{
          rounded: "sm",
          name: original.campaignName,
          className: "!bg-transparent border border-muted overflow-hidden",
        }}
      />
    ),
  }),
  columnHelper.accessor("company", {
    size: 160,
    header: "Company",
    cell: ({ row: { original } }) => {
      const Icon = original.companyIcon;
      return (
        <Flex
          gap="1"
          align="center"
        >
          <Icon className="size-4 mr-2" />
          {original.company}
        </Flex>
      );
    },
  }),
  columnHelper.accessor("salesRange", {
    size: 160,
    header: "Sales Range",
    cell: (info) => toCurrency(info.getValue()),
  }),
  columnHelper.accessor("paymentMethod", {
    size: 180,
    header: "Payment Method",
  }),
  columnHelper.accessor("commission", {
    size: 140,
    header: "",
    cell: () => (
      <Flex
        justify="end"
        align="center"
        gap="1"
      >
        <ActionIcon
          size="sm"
          variant="outline"
          className="cursor-pointer"
        >
          <PencilIcon className="size-4" />
        </ActionIcon>
        <ActionIcon
          size="sm"
          variant="outline"
          className="cursor-pointer"
        >
          <EyeIcon className="size-4" />
        </ActionIcon>
        <ActionIcon
          size="sm"
          variant="outline"
          aria-label={"Delete Item"}
          className="cursor-pointer"
        >
          <TrashIcon className="h-4 w-4" />
        </ActionIcon>
      </Flex>
    ),
  }),
];
