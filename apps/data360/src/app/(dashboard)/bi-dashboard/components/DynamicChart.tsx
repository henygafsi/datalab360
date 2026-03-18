'use client';

import { useMemo } from 'react';
import { useTheme } from 'next-themes';
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap,
  ComposedChart,
  RadialBarChart, RadialBar,
  FunnelChart, Funnel, LabelList,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

/** Interpolate color from green → yellow → red based on 0..1 ratio */
function heatColor(ratio: number): string {
  const r = ratio < 0.5 ? Math.round(255 * ratio * 2) : 255;
  const g = ratio < 0.5 ? 255 : Math.round(255 * (1 - ratio) * 2);
  return `rgb(${r},${g},80)`;
}

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
 * Supports: bar, line, area, pie, donut, scatter, stacked_bar, stacked_area,
 * combo, radar, treemap, funnel, heatmap, waterfall, histogram, gauge,
 * radial_bar, bubble, candlestick.
 */
export function DynamicChart({ config }: DynamicChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const data = config.prefetched?.data;
  const chartType = config.chartType || 'bar';
  const xKey = config.x || undefined;
  const measures = config.measures || [];

  // Determine data keys (measure columns present in the data)
  const dataKeys = useMemo(() => {
    if (!data || data.length === 0) return [];
    const allKeys = Object.keys(data[0]);
    if (measures.length > 0) {
      return measures
        .map((m) => m.column)
        .filter((col) => allKeys.includes(col));
    }
    return allKeys.filter((k) => k !== xKey && typeof data[0][k] === 'number');
  }, [data, measures, xKey]);

  // Clean data: convert null/undefined measure values to null
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

  const effectiveXKey = useMemo(() => {
    if (xKey) return xKey;
    if (!data || data.length === 0) return '';
    const allKeys = Object.keys(data[0]);
    return allKeys.find((k) => !dataKeys.includes(k) && typeof data[0][k] === 'string') || allKeys[0];
  }, [data, xKey, dataKeys]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 dark:text-gray-500 text-sm">
        No data
      </div>
    );
  }

  const gridStroke = isDark ? '#374151' : '#e2e8f0';
  const axisStroke = isDark ? '#4B5563' : '#e2e8f0';
  const tickFill = isDark ? '#9CA3AF' : undefined;
  const labelFill = isDark ? '#D1D5DB' : '#374151';

  const commonMargin = { top: 10, right: 10, bottom: 30, left: 10 };
  const commonXAxis = {
    dataKey: effectiveXKey,
    tick: { fontSize: 10, fill: tickFill },
    tickLine: false,
    axisLine: { stroke: axisStroke },
    angle: -35,
    textAnchor: 'end' as const,
    interval: 'preserveStartEnd' as const,
    height: 50,
  };
  const commonYAxis = {
    tick: { fontSize: 11, fill: tickFill },
    tickLine: false,
    axisLine: { stroke: axisStroke },
  };
  const commonTooltipStyle = {
    backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
    border: isDark ? '1px solid #374151' : '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '12px',
    color: isDark ? '#F3F4F6' : undefined,
  };

  // ── Pie / Donut ──
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

  // ── Scatter ──
  if (chartType === 'scatter') {
    const yKey = dataKeys[0] || '';
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={commonMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey={effectiveXKey} name={effectiveXKey} tick={{ fontSize: 11, fill: tickFill }} />
          <YAxis dataKey={yKey} name={yKey} tick={{ fontSize: 11, fill: tickFill }} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={commonTooltipStyle} />
          <Scatter data={cleanData as any[]} fill={COLORS[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // ── Bubble (scatter with variable size) ──
  if (chartType === 'bubble') {
    const yKey = dataKeys[0] || '';
    const zKey = dataKeys[1] || dataKeys[0] || '';
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={commonMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey={effectiveXKey} name={effectiveXKey} tick={{ fontSize: 11, fill: tickFill }} />
          <YAxis dataKey={yKey} name={yKey} tick={{ fontSize: 11, fill: tickFill }} />
          <ZAxis dataKey={zKey} range={[40, 400]} name={zKey} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={commonTooltipStyle} />
          <Legend />
          <Scatter data={cleanData as any[]} fill={COLORS[0]} fillOpacity={0.6} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // ── Radar ──
  if (chartType === 'radar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={cleanData as any[]} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke={gridStroke} />
          <PolarAngleAxis dataKey={effectiveXKey} tick={{ fontSize: 10, fill: tickFill }} />
          <PolarRadiusAxis tick={{ fontSize: 9, fill: tickFill }} />
          {dataKeys.map((key, i) => (
            <Radar
              key={key}
              name={key}
              dataKey={key}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
          <Tooltip contentStyle={commonTooltipStyle} />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  // ── Treemap ──
  if (chartType === 'treemap') {
    const valueKey = dataKeys[0] || '';
    const treemapData = cleanData.map((row, i) => ({
      name: String(row[effectiveXKey] || `Item ${i + 1}`),
      size: Number(row[valueKey]) || 0,
      fill: COLORS[i % COLORS.length],
    }));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={treemapData}
          dataKey="size"
          nameKey="name"
          aspectRatio={4 / 3}
          stroke={isDark ? '#1F2937' : '#fff'}
        >
          {treemapData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
          <Tooltip contentStyle={commonTooltipStyle} />
        </Treemap>
      </ResponsiveContainer>
    );
  }

  // ── Funnel ──
  if (chartType === 'funnel') {
    const valueKey = dataKeys[0] || '';
    const funnelData = cleanData
      .map((row, i) => ({
        name: String(row[effectiveXKey] || `Step ${i + 1}`),
        value: Number(row[valueKey]) || 0,
        fill: COLORS[i % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);

    return (
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip contentStyle={commonTooltipStyle} />
          <Funnel dataKey="value" data={funnelData} isAnimationActive>
            <LabelList position="right" fill={labelFill} stroke="none" dataKey="name" fontSize={11} />
            {funnelData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    );
  }

  // ── Gauge (radial bar) ──
  if (chartType === 'gauge') {
    const valueKey = dataKeys[0] || '';
    const gaugeData = cleanData.slice(0, 5).map((row, i) => ({
      name: String(row[effectiveXKey] || `Metric ${i + 1}`),
      value: Number(row[valueKey]) || 0,
      fill: COLORS[i % COLORS.length],
    }));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="25%"
          outerRadius="90%"
          data={gaugeData}
          startAngle={180}
          endAngle={0}
          cx="50%"
          cy="70%"
        >
          <RadialBar
            background
            dataKey="value"
            cornerRadius={6}
            label={{ fill: labelFill, fontSize: 11, position: 'insideStart' }}
          />
          <Tooltip contentStyle={commonTooltipStyle} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  }

  // ── Radial Bar (full 360° progress display) ──
  if (chartType === 'radial_bar') {
    const valueKey = dataKeys[0] || '';
    const radialData = cleanData.slice(0, 8).map((row, i) => ({
      name: String(row[effectiveXKey] || `Item ${i + 1}`),
      value: Number(row[valueKey]) || 0,
      fill: COLORS[i % COLORS.length],
    }));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="20%"
          outerRadius="90%"
          data={radialData}
          startAngle={90}
          endAngle={-270}
          cx="50%"
          cy="50%"
        >
          <RadialBar
            background={{ fill: isDark ? '#1F2937' : '#F1F5F9' }}
            dataKey="value"
            cornerRadius={8}
            label={{ fill: labelFill, fontSize: 11, position: 'insideStart' }}
          />
          <Tooltip contentStyle={commonTooltipStyle} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  }

  // ── Heatmap (custom grid) ──
  if (chartType === 'heatmap') {
    const valueKey = dataKeys[0] || '';
    const allValues = cleanData.map((r) => Number(r[valueKey]) || 0);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;
    const cols = Math.ceil(Math.sqrt(cleanData.length));

    return (
      <div className="w-full h-full overflow-auto p-2">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {cleanData.map((row, i) => {
            const val = Number(row[valueKey]) || 0;
            const ratio = (val - minVal) / range;
            return (
              <div
                key={i}
                className="rounded p-2 text-center text-xs font-medium text-white truncate"
                style={{ backgroundColor: heatColor(ratio), minHeight: 36 }}
                title={`${row[effectiveXKey]}: ${val}`}
              >
                <div className="truncate">{String(row[effectiveXKey] || '')}</div>
                <div className="font-bold">{val.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Waterfall ──
  if (chartType === 'waterfall') {
    const valueKey = dataKeys[0] || '';
    let cumulative = 0;
    const waterfallData = cleanData.map((row, i) => {
      const val = Number(row[valueKey]) || 0;
      const start = cumulative;
      cumulative += val;
      return {
        name: String(row[effectiveXKey] || `Step ${i + 1}`),
        value: val,
        base: Math.min(start, cumulative),
        top: Math.abs(val),
        fill: val >= 0 ? '#10b981' : '#ef4444',
      };
    });
    // Add total bar
    waterfallData.push({
      name: 'Total',
      value: cumulative,
      base: 0,
      top: cumulative,
      fill: '#3b82f6',
    });

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={waterfallData} margin={commonMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis {...commonXAxis} />
          <YAxis {...commonYAxis} />
          <Tooltip contentStyle={commonTooltipStyle} formatter={(v: any, name: string) => name === 'base' ? null : v} />
          <Bar dataKey="base" stackId="waterfall" fill="transparent" />
          <Bar dataKey="top" stackId="waterfall" radius={[4, 4, 0, 0]}>
            {waterfallData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Histogram (bar chart with no gaps) ──
  if (chartType === 'histogram') {
    const valueKey = dataKeys[0] || '';
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={cleanData as any[]} margin={commonMargin} barCategoryGap={0} barGap={0}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis {...commonXAxis} />
          <YAxis {...commonYAxis} />
          <Tooltip contentStyle={commonTooltipStyle} />
          <Bar dataKey={valueKey} fill={COLORS[0]} fillOpacity={0.85} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Candlestick ──
  if (chartType === 'candlestick') {
    // Expects data with open, high, low, close columns (use first 4 dataKeys)
    const [openKey, highKey, lowKey, closeKey] = dataKeys.length >= 4
      ? dataKeys
      : [dataKeys[0] || 'open', dataKeys[1] || 'high', dataKeys[2] || 'low', dataKeys[3] || 'close'];

    const candleData = cleanData.map((row) => {
      const open = Number(row[openKey]) || 0;
      const close = Number(row[closeKey]) || 0;
      const high = Number(row[highKey]) || Math.max(open, close);
      const low = Number(row[lowKey]) || Math.min(open, close);
      const isUp = close >= open;
      return {
        ...row,
        _body: [Math.min(open, close), Math.max(open, close)],
        _wick: [low, high],
        _fill: isUp ? '#10b981' : '#ef4444',
      };
    });

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={candleData as any[]} margin={commonMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis {...commonXAxis} />
          <YAxis {...commonYAxis} domain={['auto', 'auto']} />
          <Tooltip contentStyle={commonTooltipStyle} />
          <Bar dataKey="_body" radius={[2, 2, 2, 2]}>
            {candleData.map((entry, i) => (
              <Cell key={i} fill={entry._fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Combo (bar + line overlay) ──
  if (chartType === 'combo') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={cleanData as any[]} margin={commonMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis {...commonXAxis} />
          <YAxis {...commonYAxis} />
          <Tooltip contentStyle={commonTooltipStyle} />
          <Legend />
          {dataKeys.map((key, i) => {
            // First measure as bars, rest as lines
            if (i === 0) {
              return <Bar key={key} dataKey={key} fill={COLORS[i]} radius={[4, 4, 0, 0]} barSize={30} />;
            }
            return (
              <Line
                key={key}
                type="natural"
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // ── Stacked Bar ──
  if (chartType === 'stacked_bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={cleanData as any[]} margin={commonMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis {...commonXAxis} />
          <YAxis {...commonYAxis} />
          <Tooltip contentStyle={commonTooltipStyle} />
          <Legend />
          {dataKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="stack"
              fill={COLORS[i % COLORS.length]}
              radius={i === dataKeys.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Stacked Area ──
  if (chartType === 'stacked_area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={cleanData as any[]} margin={commonMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis {...commonXAxis} />
          <YAxis {...commonYAxis} />
          <Tooltip contentStyle={commonTooltipStyle} />
          <Legend />
          {dataKeys.map((key, i) => (
            <Area
              key={key}
              type="natural"
              dataKey={key}
              stackId="stack"
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.4}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // ── Default: Bar / Line / Area ──
  const ChartContainer = chartType === 'line' ? LineChart : chartType === 'area' ? AreaChart : BarChart;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ChartContainer data={cleanData as any[]} margin={commonMargin}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis {...commonXAxis} />
        <YAxis {...commonYAxis} />
        <Tooltip contentStyle={commonTooltipStyle} />
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
