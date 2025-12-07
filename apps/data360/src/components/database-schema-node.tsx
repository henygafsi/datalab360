import { Node, NodeProps, Position } from "reactflow";

import { TableBody, TableCell, TableRow } from "@/components/ui/table";

import { BaseNode } from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { useState } from "react"; // For managing hover state

type DatabaseSchemaNodeData = {
  label: string;
  schema: { title: string; type: string }[];
  sourceDB: string;
  sourceSC: string;
};

export function DatabaseSchemaNode({
  data,
  selected,

}: NodeProps<DatabaseSchemaNodeData>) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <BaseNode className="p-0" selected={selected}  onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <h2 className="rounded-tl-md rounded-tr-md bg-secondary p-2 text-center text-sm text-muted-foreground">
        {data.label}
      </h2>
      {/* Hover Tooltip */}
      {isHovered && (
        <div className="absolute top-[-35px] left-1/2 transform -translate-x-1/2 
                        bg-gray-800 text-white text-xs px-2 py-1 rounded shadow transition-opacity duration-200">
          {data.sourceDB}.{data.sourceSC}
        </div>
      )}
      {/* shadcn Table cannot be used because of hardcoded overflow-auto */}
      <table className="border-spacing-10 overflow-visible">
        <TableBody>
          {data.schema.map((entry) => (
            <TableRow key={entry.title} className="relative text-xs">
              <TableCell className="pl-0 pr-6 font-light">
                <LabeledHandle
                  id={entry.title}
                  title={entry.title}
                  type="target"
                  position={Position.Left}
                  className="h-1"
                />
              </TableCell>
              <TableCell className="pr-0 text-right font-thin">
                <LabeledHandle
                  id={entry.title}
                  title={entry.type}
                  type="source"
                  position={Position.Right}
                  className="p-0"
                  handleClassName="p-0"
                  labelClassName="p-0"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </table>
    </BaseNode>
  );
}
