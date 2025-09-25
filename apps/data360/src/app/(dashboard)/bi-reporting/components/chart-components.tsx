'use client';

import { Badge } from 'rizzui';
import { useMemo, useCallback } from 'react';
import { useChartData } from '@/app/services/charts/useChartData';
import { ChartFilter } from '@/app/services/charts/types';
import {
  AreaChart,
  BarChart,
  PieChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Area,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  ScatterChart,
  Scatter,
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];

// Dynamic data is fetched from /charts/data. Static samples removed.

interface ChartCardProps {
  id: string;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  children: React.ReactNode;
  heightRem?: number; // dynamic height in rem
}

function ChartCard({ title, description, badge, badgeColor, children, heightRem }: ChartCardProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl shadow-slate-900/5 dark:shadow-black/20 p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-slate-900/10 dark:hover:shadow-black/30 hover:-translate-y-1">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h3>
          <Badge className={`${badgeColor}`}>
            {badge}
          </Badge>
        </div>
        <p className="text-slate-600 dark:text-slate-400">{description}</p>
      </div>
      <div style={{ height: `${heightRem ?? 20}rem` }}>{children}</div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  border: 'none',
  borderRadius: '16px',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
  backdropFilter: 'blur(16px)'
};

export const CHART_OPTIONS = [
  {
    id: 'bar',
    title: 'Bar',
    badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    component: null
  },
  {
    id: 'line',
    title: 'Line',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    component: null
  },
  {
    id: 'pie',
    title: 'Pie',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    component: null
  },
  {
    id: 'scatter',
    title: 'Scatter',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    component: null
  },
  {
    id: 'card',
    title: 'Card',
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    component: null
  }
];

export default ChartCard;

// New: DynamicChart renders based on saved configuration and data from /charts/data
export function DynamicChart({
  config,
  enabled = true,
  fontScale = 1,
}: { config: any; enabled?: boolean; fontScale?: number }) {
  const database = config.database || config.db || 'CP_DATA360';
  const schema = config.schema || 'RETAIL_DW';
  const table = config.table || 'FACT_TRANSACTIONS';
  const x = config.xAxisColumn || config.x || 'DAT_REFERENCE';
  const measures = useMemo(() => {
    if (Array.isArray(config.measures) && config.measures.length > 0) return config.measures as Array<{ column: string; aggregator: string }>;
    return (config.yAxisColumn ? [{ column: config.yAxisColumn as string, aggregator: (config.aggregator as any) || 'SUM' }] : []);
  }, [config.measures, config.yAxisColumn, config.aggregator]);
  // Infer chart type from config or component ID
  const chartType = (() => {
    // First try to get from config.chartType
    if (config.chartType) return config.chartType as 'bar' | 'line' | 'pie' | 'scatter' | 'card';
    
    // If no X provided (null/empty), treat as 'card'
    if (!x) return 'card';
    
    // Try to infer from component ID if available
    if (config.componentId) {
      const id = config.componentId.toLowerCase();
      if (['bar', 'line', 'pie', 'scatter', 'card'].includes(id)) {
        return id as 'bar' | 'line' | 'pie' | 'scatter' | 'card';
      }
    }
    
    // Default to 'bar' as fallback
    return 'bar';
  })() as 'bar' | 'line' | 'pie' | 'scatter' | 'card';
  const limit = typeof config.limit === 'number' ? config.limit : 100;
  const groupBy: string[] = useMemo(() => {
    if (Array.isArray(config.groupBy)) return config.groupBy as string[];
    if (typeof config.groupBy === 'string' && config.groupBy.length > 0) {
      return config.groupBy.split(',').map((s: string) => s.trim());
    }
    return [];
  }, [config.groupBy]);
  const filters: ChartFilter[] = useMemo(() => {
    try {
      if (Array.isArray(config.filters)) return config.filters as unknown as ChartFilter[];
      if (typeof config.filters === 'string' && config.filters.trim().startsWith('[')) {
        return JSON.parse(config.filters) as ChartFilter[];
      }
    } catch {}
    return [];
  }, [config.filters]);

  // Use prefetched data from config (if present) immediately after save
  const prefetched = config.prefetched as { data: any[] } | undefined;

  const hasPrefetched = !!(config.prefetched && Array.isArray(config.prefetched.data) && config.prefetched.data.length > 0);

  const { data, loading, error } = useChartData({
    database,
    schema,
    table,
    x,
    measures,
    filters,
    groupBy,
    limit,
  }, { enabled: enabled && !hasPrefetched });

  // Function to evaluate thresholds and get status
  const evaluateThresholds = useCallback((value: number, measure: any) => {
    if (!measure.seuils || measure.seuils.length === 0) return null;
    
    for (const seuil of measure.seuils) {
      const { operator, value: thresholdValue, label, color } = seuil as any;
      let matches = false;
      
      switch (operator) {
        case '<':
          matches = value < thresholdValue;
          break;
        case '>':
          matches = value > thresholdValue;
          break;
        case '<=':
          matches = value <= thresholdValue;
          break;
        case '>=':
          matches = value >= thresholdValue;
          break;
        case '=':
          matches = value === thresholdValue;
          break;
        case '!=':
          matches = value !== thresholdValue;
          break;
        case 'between':
          if (Array.isArray(thresholdValue)) {
            const [min, max] = thresholdValue as [number, number];
            matches = value >= min && value <= max;
          }
          break;
      }
      
      if (matches) {
        return { label, color };
      }
    }
    
    return null;
  }, []);

  // If groupBy present, pivot first group into series.
  const { chartData, seriesKeys } = useMemo(() => {
    const raw = (prefetched?.data && prefetched.data.length ? prefetched.data : (data?.data || []));
    if (!groupBy || groupBy.length === 0) {
      // When no grouping, build series from measures
      if (measures.length <= 1) {
        const key = measures[0]?.column || 'value';
        return { chartData: raw.map((r: any) => ({ x: r.x ?? r[x] ?? r['x'] ?? '', [key]: r[key] ?? r.y ?? r['y'] })), seriesKeys: [key] };
      }
      // Multiple measures: each measure is a series
      const rows = raw.map((r: any) => {
        const xv = r.x ?? r[x] ?? r['x'] ?? '';
        const obj: Record<string, any> = { x: xv };
        for (const m of measures as Array<{ column: string }>) {
          obj[m.column] = r[m.column] ?? r.y ?? r['y'];
        }
        return obj;
      });
      return { chartData: rows, seriesKeys: measures.map(m => m.column) };
    }
    const groupKey = groupBy[0];
    const byX: Record<string, any> = {};
    const groups = new Set<string>();
    for (const row of raw as any[]) {
      const xv = row.x ?? row[x];
      const g = row[groupKey];
      const key = String(xv);
      if (!byX[key]) byX[key] = { x: xv };
      // populate each measure per group as series "<group>-<measure>"
      if (measures.length === 0) {
        const val = row.y ?? row['y'];
        byX[key][g] = val;
      } else {
        for (const m of measures as Array<{ column: string }>) {
          const seriesName = `${g}-${m.column}`;
          byX[key][seriesName] = row[m.column] ?? row.y ?? row['y'];
        }
      }
      groups.add(String(g));
    }
    const series = measures.length === 0
      ? Array.from(groups)
      : Array.from(groups).flatMap((g: string) => (measures as Array<{ column: string }>).map((m) => `${g}-${m.column}`));
    return { chartData: Object.values(byX), seriesKeys: series };
  }, [data, groupBy, x, measures, prefetched?.data]);

  // KPI totals
  const kpiTotal = useMemo(() => {
    if (!chartData || (chartData as any[]).length === 0) return 0;
    if (seriesKeys.length > 0) {
      const key = seriesKeys[0];
      return (chartData as any[]).reduce((acc, r: any) => acc + (Number(r[key]) || 0), 0);
    }
    return (chartData as any[]).reduce((acc, r: any) => acc + (Number(r['y']) || 0), 0);
  }, [chartData, seriesKeys]);

  // Direct card value from API response.data to match backend payload semantics
  const cardValue = useMemo(() => {
    if (chartType !== 'card') return null;
    const rows = data?.data || [];
    if (rows.length === 0) return 0;
    const firstMeasureKey = measures[0]?.column || Object.keys(rows[0] || {})[0];
    if (!firstMeasureKey) return 0;
    // Sum across rows if multiple; otherwise single value
    return rows.reduce((acc: number, r: any) => acc + (Number(r[firstMeasureKey]) || 0), 0);
  }, [data, measures, chartType]);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-slate-500">Loading chart...</div>;
  }
  if (error) {
    return <div className="h-full flex items-center justify-center text-red-500">{error.message}</div>;
  }

  const axisFont = Math.max(10, Math.round(12 * fontScale));
  const legendStyle = { fontSize: `${Math.max(10, Math.round(12 * fontScale))}px` } as any;

  if (chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData as any[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
          <XAxis dataKey="x" stroke="#64748b" fontSize={axisFont} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" fontSize={axisFont} tickLine={false} axisLine={false} />
          <Tooltip 
            contentStyle={tooltipStyle}
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                    <p className="font-medium text-slate-900 dark:text-white">{label}</p>
                    {payload.map((entry: any, index: number) => {
                      const seriesKey = entry.dataKey;
                      const measureColumn = seriesKey.includes('-') ? seriesKey.split('-').slice(1).join('-') : seriesKey;
                      const measure = measures.find(m => m.column === measureColumn);
                      const thresholdStatus = measure ? evaluateThresholds(Number(entry.value) || 0, measure) : null;
                      
                      return (
                        <div key={index} className="flex items-center gap-2 mt-1">
                          <div 
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-slate-700 dark:text-slate-300">
                            {seriesKey}: {Intl.NumberFormat().format(entry.value)}
                          </span>
                          {thresholdStatus && (
                            <span 
                              className="text-xs px-2 py-1 rounded-full"
                              style={{ 
                                backgroundColor: thresholdStatus.color + '20',
                                color: thresholdStatus.color
                              }}
                            >
                              {thresholdStatus.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend wrapperStyle={legendStyle} />
          {seriesKeys.map((k: string, idx: number) => (
            <Bar 
              key={k} 
              dataKey={k} 
              fill={COLORS[idx % COLORS.length]}
              radius={[8, 8, 0, 0]} 
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData as any[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
          <XAxis dataKey="x" stroke="#64748b" fontSize={axisFont} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" fontSize={axisFont} tickLine={false} axisLine={false} />
          <Tooltip 
            contentStyle={tooltipStyle}
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                    <p className="font-medium text-slate-900 dark:text-white">{label}</p>
                    {payload.map((entry: any, index: number) => {
                      const seriesKey = entry.dataKey;
                      const measureColumn = seriesKey.includes('-') ? seriesKey.split('-').slice(1).join('-') : seriesKey;
                      const measure = measures.find(m => m.column === measureColumn);
                      const thresholdStatus = measure ? evaluateThresholds(Number(entry.value) || 0, measure) : null;
                      
                      return (
                        <div key={index} className="flex items-center gap-2 mt-1">
                          <div 
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-slate-700 dark:text-slate-300">
                            {seriesKey}: {Intl.NumberFormat().format(entry.value)}
                          </span>
                          {thresholdStatus && (
                            <span 
                              className="text-xs px-2 py-1 rounded-full"
                              style={{ 
                                backgroundColor: thresholdStatus.color + '20',
                                color: thresholdStatus.color
                              }}
                            >
                              {thresholdStatus.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend wrapperStyle={legendStyle} />
          {seriesKeys.map((k: string, idx: number) => (
          <Line 
              key={k} 
            type="monotone" 
              dataKey={k} 
              stroke={COLORS[idx % COLORS.length]}
              strokeWidth={3} 
              dot={false} 
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // no 'area' chart type in BI library config

  if (chartType === 'pie') {
    const pieRows = (chartData as any[]).slice(0, 8);
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={pieRows} dataKey={seriesKeys[0] || 'y'} nameKey="x" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2}>
            {pieRows.map((entry: any, index: number) => {
              const seriesKey = seriesKeys[0] || 'y';
              const measureColumn = seriesKey.includes('-') ? seriesKey.split('-').slice(1).join('-') : seriesKey;
              const measure = measures.find(m => m.column === measureColumn);
                const thresholdStatus = measure ? evaluateThresholds(Number(entry[seriesKey]) || 0, measure) : null;
              
              return (
                <Cell 
                  key={`cell-${index}`} 
                  fill={thresholdStatus?.color || COLORS[index % COLORS.length]} 
                />
              );
            })}
          </Pie>
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const entry = payload[0];
                const seriesKey = seriesKeys[0] || 'y';
                const measureColumn = seriesKey.includes('-') ? seriesKey.split('-').slice(1).join('-') : seriesKey;
                const measure = measures.find(m => m.column === measureColumn);
                const thresholdStatus = measure ? evaluateThresholds(Number(entry.value) || 0, measure) : null;
                
                return (
                  <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                    <p className="font-medium text-slate-900 dark:text-white">{entry.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div 
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: entry.payload.fill }}
                      />
                      <span className="text-slate-700 dark:text-slate-300">
                        {Intl.NumberFormat().format(Number(entry.value) || 0)}
                      </span>
                      {thresholdStatus && (
                        <span 
                          className="text-xs px-2 py-1 rounded-full"
                          style={{ 
                            backgroundColor: thresholdStatus.color + '20',
                            color: thresholdStatus.color
                          }}
                        >
                          {thresholdStatus.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend wrapperStyle={legendStyle} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'scatter') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
          <XAxis dataKey="x" stroke="#64748b" fontSize={axisFont} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" fontSize={axisFont} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={legendStyle} />
          {seriesKeys.length === 0 ? (
            <Scatter data={chartData as any[]} fill={COLORS[0]} />
          ) : (
            seriesKeys.map((k: string, idx: number) => (
              <Scatter key={k} name={k} data={chartData as any[]} fill={COLORS[idx % COLORS.length]} dataKey={k} />
            ))
          )}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'card') {
    const rows = (prefetched?.data && prefetched.data.length ? prefetched.data : (data?.data || []));
    const aggregatedValues = rows
      .map((obj: any) => Object.entries(obj).map(([key, value]) => ({ key, value: Number(value) })))
      .flat();

    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          {aggregatedValues?.map(({ key, value }) => {
            // Find the measure that corresponds to this key
            const measure = measures.find(m => m.column === key);
            const thresholdStatus = measure ? evaluateThresholds(value, measure) : null;
            
            return (
              <div key={key} className="text-center">
                <div className="text-slate-400" style={{ fontSize: `${Math.round(12 * fontScale)}px` }}>{key}</div>
                <div 
                  className="font-bold text-slate-900 dark:text-white" 
                  style={{ 
                    fontSize: `${Math.round(48 * fontScale)}px`,
                    color: thresholdStatus?.color || undefined
                  }}
                >
                  {Intl.NumberFormat().format(value)}
                </div>
                {thresholdStatus && (
                  <div 
                    className="text-sm font-medium px-2 py-1 rounded-full"
                    style={{ 
                      backgroundColor: thresholdStatus.color + '20',
                      color: thresholdStatus.color,
                      fontSize: `${Math.round(10 * fontScale)}px`
                    }}
                  >
                    {thresholdStatus.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  

  // default fallback to line
  return (
      <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData as any[]}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
        <XAxis dataKey="x" stroke="#64748b" fontSize={axisFont} tickLine={false} axisLine={false} />
        <YAxis stroke="#64748b" fontSize={axisFont} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={legendStyle} />
        {seriesKeys.map((k: string, idx: number) => (
          <Line key={k} type="monotone" dataKey={k} stroke={COLORS[idx % COLORS.length]} strokeWidth={3} dot={false} />
        ))}
      </LineChart>
      </ResponsiveContainer>
  );
  }





