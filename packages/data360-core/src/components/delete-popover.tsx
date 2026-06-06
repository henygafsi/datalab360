import { Title, Text, ActionIcon, Button, Popover } from "rizzui";
import TrashIcon from "@core/components/icons/trash";
import { PiTrashFill } from "react-icons/pi";

type DeletePopoverProps = {
  title: string;
  description: string;
  onDelete?: () => void;
  /** When true the trash control is disabled (e.g. RBAC denial) and the popover never opens. */
  disabled?: boolean;
  /** Tooltip shown on the disabled control explaining the denial. */
  disabledReason?: string;
};

export default function DeletePopover({ title, description, onDelete, disabled, disabledReason }: DeletePopoverProps) {
  // RBAC-denied (or otherwise disabled): render an inert, clearly-disabled trash
  // control with an explanatory tooltip instead of a working popover (no blank,
  // no no-op confirm dialog).
  if (disabled) {
    return (
      <ActionIcon
        size="sm"
        variant="outline"
        aria-label="Delete Item"
        disabled
        title={disabledReason}
        className="cursor-not-allowed opacity-50"
      >
        <TrashIcon className="size-4" />
      </ActionIcon>
    );
  }

  return (
    <Popover placement="left">
      <Popover.Trigger>
        <ActionIcon
          size="sm"
          variant="outline"
          aria-label={"Delete Item"}
          className="cursor-pointer"
        >
          <TrashIcon className="size-4" />
        </ActionIcon>
      </Popover.Trigger>
      <Popover.Content className="z-10">
        {({ setOpen }) => (
          <div className="w-56 pb-2 pt-1 text-left rtl:text-right">
            <Title
              as="h6"
              className="mb-0.5 flex items-start text-sm text-gray-700 sm:items-center"
            >
              <PiTrashFill className="me-1 size-[17px]" /> {title}
            </Title>
            <Text className="mb-2 leading-relaxed text-gray-500">{description}</Text>
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                className="me-1.5 h-7"
                onClick={() => {
                  onDelete && onDelete();
                  setOpen(false);
                }}
              >
                Yes
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setOpen(false)}
              >
                No
              </Button>
            </div>
          </div>
        )}
      </Popover.Content>
    </Popover>
  );
}
