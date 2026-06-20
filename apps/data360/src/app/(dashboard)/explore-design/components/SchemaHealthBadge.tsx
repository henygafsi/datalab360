'use client';

import React, { useEffect, useState } from 'react';
import { Badge, Tooltip, Text } from 'rizzui';
import { Activity } from 'lucide-react';

interface SchemaHealthBadgeProps {
  projectId: string;
  /** Required for the score to be meaningful — health scans {database}.{schema}. */
  database?: string;
  schema?: string;
  onLoad?: (score: number) => void;
}

export default function SchemaHealthBadge({
  projectId,
  database,
  schema,
  onLoad,
}: SchemaHealthBadgeProps) {
  const [health, setHealth] = useState<{
    score: number;
    explanation: string;
  } | null>(null);

  useEffect(() => {
    // schema-health is computed by scanning {database}.{schema}; without them the
    // score would be meaningless, so don't fire (badge stays hidden) rather than guess.
    if (!projectId || !database || !schema) return;
    import('@/app/services/explore-design/de-objects').then((api) => {
      api
        .getSchemaHealth(projectId, { database, schema })
        .then((data) => {
          const score = Math.round(data.overall_score ?? 0);
          const explanation =
            data.recommendations?.[0] ??
            `Completeness ${Math.round(data.sub_scores?.completeness?.score ?? 0)} · Naming ${Math.round(data.sub_scores?.naming?.score ?? 0)} · Types ${Math.round(data.sub_scores?.type_efficiency?.score ?? 0)}`;
          setHealth({ score, explanation });
          onLoad?.(score);
        })
        .catch(() => {});
    });
  }, [projectId, database, schema, onLoad]);

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
