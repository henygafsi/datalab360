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
    score: number | null;
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
          // No-fake-0: a missing overall_score is "not scored", not a 0/100 health.
          // Render "—" rather than fabricating a perfect-fail score.
          const raw = data.overall_score;
          const score = raw == null || Number.isNaN(raw) ? null : Math.round(raw);
          const fmtSub = (v: number | null | undefined) =>
            v == null || Number.isNaN(v) ? '—' : Math.round(v);
          const explanation =
            data.recommendations?.[0] ??
            `Completeness ${fmtSub(data.sub_scores?.completeness?.score)} · Naming ${fmtSub(data.sub_scores?.naming?.score)} · Types ${fmtSub(data.sub_scores?.type_efficiency?.score)}`;
          setHealth({ score, explanation });
          if (score != null) onLoad?.(score);
        })
        .catch(() => {});
    });
  }, [projectId, database, schema, onLoad]);

  if (!health) return null;

  const scored = health.score != null;
  const color = !scored
    ? 'secondary'
    : health.score! >= 80
      ? 'success'
      : health.score! >= 60
        ? 'warning'
        : 'danger';

  return (
    <Tooltip
      content={
        <div className="max-w-xs">
          <Text className="font-medium text-white mb-1">
            Schema Health: {scored ? `${health.score}/100` : 'not scored'}
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
        Health: {scored ? health.score : '—'}
      </Badge>
    </Tooltip>
  );
}
