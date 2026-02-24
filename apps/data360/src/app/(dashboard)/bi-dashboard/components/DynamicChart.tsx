'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

interface DynamicChartConfig {
  chartType?: string;
  x?: string | null;
  measures?: Array<{
    column: string;
    aggregator?: string;
    seuils?: any;
  }>;
  groupBy?: string[];
  prefetched?: { data: Record<string, unknown>[] };
  [key: string]: any;
}

interface DynamicChartProps {
  config: DynamicChartConfig;
  enabled?: boolean;
}

/**
 * DynamicChart — renders a recharts chart from the widget's config + data.
 *
 * Supports: bar, line, area, pie, donut, scatter.
 * Data comes from `config.prefetched.data`.
 */
export function DynamicChart({ config }: DynamicChartProps) {
  const data = config.prefetched?.data;
  const chartType = config.chartType || 'bar';
  const xKey = config.x || undefined;
  const measures = config.measures || [];

  // Determine data keys (measure columns present in the data)
  const dataKeys = useMemo(() => {
    if (!data || data.length === 0) return [];
    const allKeys = Object.keys(data[0]);
    // If measures defined, use those columns; otherwise guess non-x columns
    if (measures.length > 0) {
      return measures
        .map((m) => m.column)
        .filter((col) => allKeys.includes(col));
    }
    // Fallback: use all numeric-looking columns except x
    return allKeys.filter((k) => k !== xKey && typeof data[0][k] === 'number');
  }, [data, measures, xKey]);

  // Clean data: convert null/undefined measure values to null (so connectNulls skips them)
  const cleanData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((row) => {
      const cleaned = { ...row };
      for (const key of dataKeys) {
        const v = cleaned[key];
        if (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) {
          cleaned[key] = null;
        }
      }
      return cleaned;
    });
  }, [data, dataKeys]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No data
      </div>
    );
  }

  // For aggregated results, the x value may be the key name
  // Detect: if xKey is set use it, else try first string-typed column
  const effectiveXKey = useMemo(() => {
    if (xKey) return xKey;
    const allKeys = Object.keys(data[0]);
    return allKeys.find((k) => !dataKeys.includes(k) && typeof data[0][k] === 'string') || allKeys[0];
  }, [data, xKey, dataKeys]);

  // Pie/donut
  if (chartType === 'pie' || chartType === 'donut') {
    const valueKey = dataKeys[0] || Object.keys(data[0]).find((k) => typeof data[0][k] === 'number') || '';
    const nameKey = effectiveXKey;
    const innerRadius = chartType === 'donut' ? '50%' : 0;

    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={cleanData as any[]}
            dataKey={valueKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius="80%"
            paddingAngle={2}
            label={({ name, percent }) =>
              `${name}: ${(percent * 100).toFixed(0)}%`
            }
            labelLine={false}
          >
            {cleanData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // Scatter
  if (chartType === 'scatter') {
    const yKey = dataKeys[0] || '';
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={effectiveXKey} name={effectiveXKey} tick={{ fontSize: 11 }} />
          <YAxis dataKey={yKey} name={yKey} tick={{ fontSize: 11 }} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={cleanData as any[]} fill={COLORS[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // Bar / Line / Area
  const ChartContainer = chartType === 'line' ? LineChart : chartType === 'area' ? AreaChart : BarChart;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ChartContainer data={cleanData as any[]} margin={{ top: 10, right: 10, bottom: 30, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey={effectiveXKey}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
          angle={-35}
          textAnchor="end"
          interval="preserveStartEnd"
          height={50}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        {dataKeys.length > 1 && <Legend />}
        {dataKeys.map((key, i) => {
          const color = COLORS[i % COLORS.length];
          if (chartType === 'line') {
            return (
              <Line
                key={key}
                type="natural"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 2, strokeWidth: 1 }}
                activeDot={{ r: 4 }}
                connectNulls
              />
            );
          }
          if (chartType === 'area') {
            return (
              <Area
                key={key}
                type="natural"
                dataKey={key}
                stroke={color}
                fill={color}
                fillOpacity={0.1}
                strokeWidth={2}
                connectNulls
              />
            );
          }
          // Default: bar
          return (
            <Bar
              key={key}
              dataKey={key}
              fill={color}
              radius={[4, 4, 0, 0]}
            />
          );
        })}
      </ChartContainer>
    </ResponsiveContainer>
  );
}

export default DynamicChart;
