'use client';

import React, { useEffect, useState } from 'react';
import { Badge, Tooltip, Text } from 'rizzui';
import { Activity } from 'lucide-react';

interface SchemaHealthBadgeProps {
  projectId: string;
  onLoad?: (score: number) => void;
}

export default function SchemaHealthBadge({
  projectId,
  onLoad,
}: SchemaHealthBadgeProps) {
  const [health, setHealth] = useState<{
    score: number;
    explanation: string;
  } | null>(null);

  useEffect(() => {
    if (!projectId) return;
    import('@/app/services/explore-design').then((api) => {
      api
        .getSchemaHealth(projectId)
        .then((data) => {
          setHealth(data);
          onLoad?.(data.score);
        })
        .catch(() => {});
    });
  }, [projectId, onLoad]);

  if (!health) return null;

  const color =
    health.score >= 80
      ? 'success'
      : health.score >= 60
        ? 'warning'
        : 'danger';

  return (
    <Tooltip
      content={
        <div className="max-w-xs">
          <Text className="font-medium text-white mb-1">
            Schema Health: {health.score}/100
          </Text>
          <Text className="text-xs text-gray-300">{health.explanation}</Text>
        </div>
      }
    >
      <Badge
        variant="flat"
        color={color}
        className="cursor-pointer flex items-center gap-1"
      >
        <Activity className="w-3 h-3" />
        Health: {health.score}
      </Badge>
    </Tooltip>
  );
}
