'use client';

import React, { useMemo } from 'react';
import { Badge, Text } from 'rizzui';
import { ArrowDown } from 'lucide-react';

interface GraphEvent {
  id: string;
  type: string;
  target: string;
  status: 'pending' | 'validated' | 'failed' | 'applied';
  level: number;
}

interface EventDependencyGraphProps {
  events: GraphEvent[];
  edges: { from: string; to: string }[];
}

const statusColors: Record<string, string> = {
  pending:
    'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700',
  validated:
    'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700',
  failed: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700',
  applied:
    'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600',
};

export default function EventDependencyGraph({
  events,
  edges,
}: EventDependencyGraphProps) {
  const levels = useMemo(() => {
    const grouped: Record<number, GraphEvent[]> = {};
    events.forEach((e) => {
      if (!grouped[e.level]) grouped[e.level] = [];
      grouped[e.level].push(e);
    });
    return Object.entries(grouped).sort(
      ([a], [b]) => Number(a) - Number(b)
    );
  }, [events]);

  return (
    <div className="space-y-2">
      <Text className="font-semibold text-gray-900 dark:text-white">
        Event Dependency Graph (DAG)
      </Text>
      <div className="flex items-center gap-4 mb-4">
        {Object.entries(statusColors).map(([status, cls]) => (
          <div key={status} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${cls} border`} />
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {status}
            </Text>
          </div>
        ))}
      </div>
      <div className="space-y-4">
        {levels.map(([level, levelEvents]) => (
          <div key={level}>
            <Text className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              Level {level}
            </Text>
            <div className="flex flex-wrap gap-3">
              {levelEvents.map((event) => (
                <div
                  key={event.id}
                  className={`px-4 py-3 rounded-lg border-2 ${statusColors[event.status]} min-w-[200px]`}
                >
                  <Text className="font-medium text-sm text-gray-900 dark:text-white">
                    {event.type}
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {event.target}
                  </Text>
                </div>
              ))}
            </div>
            {Number(level) < levels.length - 1 && (
              <div className="flex justify-center py-2">
                <ArrowDown className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
