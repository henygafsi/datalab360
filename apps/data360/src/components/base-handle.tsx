import React from "react";
import { Handle, HandleProps } from "reactflow";
import { cn } from "@/lib/utils";

export const BaseHandle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & HandleProps
>(({ className, ...props }, ref) => (
  <Handle ref={ref} className={cn("", className)} {...props} />
));
BaseHandle.displayName = "BaseHandle";
