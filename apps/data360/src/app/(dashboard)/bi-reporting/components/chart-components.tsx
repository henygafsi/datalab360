'use client';

import { Badge } from 'rizzui';
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
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];

const sampleData = [
  { name: 'Jan', value: 2400, value2: 1800, category: 'A' },
  { name: 'Feb', value: 3200, value2: 2400, category: 'B' },
  { name: 'Mar', value: 1500, value2: 1200, category: 'C' },
  { name: 'Apr', value: 2800, value2: 2200, category: 'D' },
  { name: 'May', value: 3500, value2: 2800, category: 'E' },
  { name: 'Jun', value: 2900, value2: 2400, category: 'F' },
];

const pieData = [
  { name: 'Desktop', value: 45, fill: COLORS[0] },
  { name: 'Mobile', value: 35, fill: COLORS[1] },
  { name: 'Tablet', value: 15, fill: COLORS[2] },
  { name: 'Other', value: 5, fill: COLORS[3] },
];

const radialData = [
  { name: 'Completed', value: 75, fill: COLORS[1] },
  { name: 'In Progress', value: 25, fill: COLORS[2] },
];

interface ChartCardProps {
  id: string;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  children: React.ReactNode;
}

function ChartCard({ title, description, badge, badgeColor, children }: ChartCardProps) {
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
      <div className="h-80">
        {children}
      </div>
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
    id: 'area-chart',
    title: 'Revenue Trend',
    description: 'Monthly revenue performance with growth indicators',
    badge: '6 Months',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    component: (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sampleData}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
          <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey="value" stroke="#3B82F6" fill="url(#colorValue)" strokeWidth={3} />
        </AreaChart>
      </ResponsiveContainer>
    )
  },
  {
    id: 'bar-chart',
    title: 'Sales Performance',
    description: 'Comparative sales data across different periods',
    badge: 'Monthly',
    badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    component: (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sampleData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
          <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" fill="#10B981" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  },
  {
    id: 'line-chart',
    title: 'Growth Trajectory',
    description: 'Month-over-month growth patterns and trends',
    badge: 'Trending Up',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    component: (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sampleData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
          <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke="#8B5CF6" 
            strokeWidth={4}
            dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 6 }}
            activeDot={{ r: 8, fill: '#8B5CF6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    )
  },
  {
    id: 'pie-chart',
    title: 'Device Distribution',
    description: 'User device breakdown by platform',
    badge: 'Live Data',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    component: (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            innerRadius={50}
            paddingAngle={2}
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    )
  },
  {
    id: 'multi-bar-chart',
    title: 'Comparative Analysis',
    description: 'Side-by-side comparison of multiple metrics',
    badge: 'Multi-Metric',
    badgeColor: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    component: (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sampleData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
          <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Bar dataKey="value" fill="#3B82F6" name="Primary" radius={[4, 4, 0, 0]} />
          <Bar dataKey="value2" fill="#10B981" name="Secondary" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  },
  {
    id: 'radial-chart',
    title: 'Progress Overview',
    description: 'Circular progress indicators for key metrics',
    badge: 'Progress',
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    component: (
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="80%" data={radialData}>
          <RadialBar dataKey="value" cornerRadius={10} fill="#10B981" />
          <Tooltip />
        </RadialBarChart>
      </ResponsiveContainer>
    )
  }
];

export default ChartCard;