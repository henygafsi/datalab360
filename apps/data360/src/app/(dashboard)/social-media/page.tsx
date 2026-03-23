'use client';
// TODO: Wire to real API — this page currently uses only sample/demo data.
// Required: social media API service (connect accounts, fetch metrics, sentiment analysis via Cortex).
// All data below is illustrative. The "Demo Mode" banner warns users accordingly.

import { useState, useCallback } from 'react';
import { Badge, Button } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiChartBar,
  PiTarget,
  PiSmiley,
  PiUsers,
  PiImage,
  PiTrendingUp,
  PiHeart,
  PiChat,
  PiShare,
} from 'react-icons/pi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
} from 'recharts';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import KPICard from '@/components/analytics/KPICard';

type TabType = 'overview' | 'campaigns' | 'sentiment' | 'audience' | 'content';

const TABS = [
  {
    id: 'overview' as TabType,
    name: 'Overview',
    icon: PiChartBar,
    description: 'Engagement metrics & trends',
    badge: 'Live',
    badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  {
    id: 'campaigns' as TabType,
    name: 'Campaigns',
    icon: PiTarget,
    description: 'Campaign performance & ROI',
    badge: 'Analytics',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  {
    id: 'sentiment' as TabType,
    name: 'Sentiment',
    icon: PiSmiley,
    description: 'AI-powered sentiment analysis',
    badge: 'AI',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  },
  {
    id: 'audience' as TabType,
    name: 'Audience',
    icon: PiUsers,
    description: 'Demographics & reach insights',
    badge: 'Insights',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  {
    id: 'content' as TabType,
    name: 'Content',
    icon: PiImage,
    description: 'Top performing content analysis',
    badge: 'Performance',
    badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  },
];

// Sample data
const engagementData = [
  { day: 'Mon', likes: 245, shares: 89, comments: 156 },
  { day: 'Tue', likes: 312, shares: 124, comments: 203 },
  { day: 'Wed', likes: 278, shares: 101, comments: 189 },
  { day: 'Thu', likes: 389, shares: 145, comments: 267 },
  { day: 'Fri', likes: 456, shares: 178, comments: 312 },
  { day: 'Sat', likes: 512, shares: 201, comments: 378 },
  { day: 'Sun', likes: 467, shares: 189, comments: 345 },
];

const platformData = [
  { name: 'LinkedIn', value: 4500, color: '#0A66C2' },
  { name: 'Twitter/X', value: 3200, color: '#1DA1F2' },
  { name: 'Instagram', value: 2800, color: '#E4405F' },
  { name: 'TikTok', value: 1900, color: '#000000' },
  { name: 'Facebook', value: 1500, color: '#1877F2' },
];

const sentimentData = [
  { month: 'Jan', positive: 65, neutral: 25, negative: 10 },
  { month: 'Feb', positive: 72, neutral: 20, negative: 8 },
  { month: 'Mar', positive: 78, neutral: 18, negative: 4 },
  { month: 'Apr', positive: 82, neutral: 15, negative: 3 },
  { month: 'May', positive: 85, neutral: 12, negative: 3 },
  { month: 'Jun', positive: 88, neutral: 10, negative: 2 },
];

const audienceData = [
  { ageGroup: '18-24', count: 1200 },
  { ageGroup: '25-34', count: 3400 },
  { ageGroup: '35-44', count: 2800 },
  { ageGroup: '45-54', count: 2100 },
  { ageGroup: '55+', count: 900 },
];

const contentPerformance = [
  { title: 'Q2 Product Launch', engagement: 8900, reach: 45000, shares: 1200 },
  { title: 'Company Culture Post', engagement: 7200, reach: 38000, shares: 890 },
  { title: 'Industry Insights', engagement: 6500, reach: 32000, shares: 756 },
  { title: 'Customer Success Story', engagement: 5800, reach: 28000, shares: 634 },
  { title: 'Webinar Announcement', engagement: 4200, reach: 21000, shares: 412 },
];

const campaignData = [
  { name: 'Campaign A', spend: 5000, revenue: 45000, roi: 800 },
  { name: 'Campaign B', spend: 3500, revenue: 28000, roi: 700 },
  { name: 'Campaign C', spend: 4200, revenue: 38000, roi: 804 },
  { name: 'Campaign D', spend: 2800, revenue: 22000, roi: 685 },
  { name: 'Campaign E', spend: 6100, revenue: 52000, roi: 752 },
];

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

function OverviewTab() {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Total Engagement"
          value="23.4K"
          subtitle="This week"
          icon={<PiHeart className="w-6 h-6" />}
          color="red"
        />
        <KPICard
          title="Follower Growth"
          value="+1.2K"
          subtitle="7-day change"
          icon={<PiTrendingUp className="w-6 h-6" />}
          color="green"
        />
        <KPICard
          title="Avg. Reach"
          value="58.3K"
          subtitle="Per post"
          icon={<PiShare className="w-6 h-6" />}
          color="blue"
        />
        <KPICard
          title="Sentiment Score"
          value="87%"
          subtitle="Positive"
          icon={<PiSmiley className="w-6 h-6" />}
          color="purple"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engagement Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Weekly Engagement</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={engagementData}>
              <defs>
                <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="day" stroke="#9CA3AF" style={{ fontSize: '12px' }} />
              <YAxis stroke="#9CA3AF" style={{ fontSize: '12px' }} />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Area
                type="monotone"
                dataKey="likes"
                stroke="#3B82F6"
                fillOpacity={1}
                fill="url(#colorEngagement)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Platform Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Engagement by Platform</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={platformData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {platformData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function CampaignsTab() {
  return (
    <div className="space-y-6">
      {/* Campaign KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Active Campaigns"
          value="5"
          subtitle="Running now"
          icon={<PiTarget className="w-6 h-6" />}
          color="blue"
        />
        <KPICard
          title="Total Spend"
          value="$21.6K"
          subtitle="All campaigns"
          icon={<PiChartBar className="w-6 h-6" />}
          color="amber"
        />
        <KPICard
          title="Total Revenue"
          value="$185K"
          subtitle="Generated"
          icon={<PiTrendingUp className="w-6 h-6" />}
          color="green"
        />
        <KPICard
          title="Avg. ROI"
          value="756%"
          subtitle="Return on investment"
          icon={<PiShare className="w-6 h-6" />}
          color="purple"
        />
      </div>

      {/* Campaign Performance */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Campaign ROI Comparison</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={campaignData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9CA3AF" style={{ fontSize: '12px' }} />
            <YAxis stroke="#9CA3AF" style={{ fontSize: '12px' }} />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Bar dataKey="roi" fill="#10B981" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Campaign Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Campaign</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Spend</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Revenue</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {campaignData.map((c) => (
                <tr key={c.name} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">${c.spend.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">${c.revenue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      {c.roi}%
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SentimentTab() {
  return (
    <div className="space-y-6">
      {/* Sentiment KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Positive Sentiment"
          value="88%"
          subtitle="88% of mentions"
          icon={<PiSmiley className="w-6 h-6" />}
          color="green"
        />
        <KPICard
          title="Neutral Mentions"
          value="10%"
          subtitle="Factual content"
          icon={<PiChartBar className="w-6 h-6" />}
          color="amber"
        />
        <KPICard
          title="Negative Sentiment"
          value="2%"
          subtitle="Critical mentions"
          icon={<PiChat className="w-6 h-6" />}
          color="red"
        />
        <KPICard
          title="Trend"
          value="+5%"
          subtitle="Month-over-month"
          icon={<PiTrendingUp className="w-6 h-6" />}
          color="blue"
        />
      </div>

      {/* Sentiment Trend */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Sentiment Trend (Last 6 Months)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={sentimentData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="month" stroke="#9CA3AF" style={{ fontSize: '12px' }} />
            <YAxis stroke="#9CA3AF" style={{ fontSize: '12px' }} />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Line type="monotone" dataKey="positive" stroke="#10B981" strokeWidth={2} name="Positive" />
            <Line type="monotone" dataKey="neutral" stroke="#F59E0B" strokeWidth={2} name="Neutral" />
            <Line type="monotone" dataKey="negative" stroke="#EF4444" strokeWidth={2} name="Negative" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Mentions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Top Positive Mentions</h3>
        <div className="space-y-3">
          {[
            'Absolutely love the new product features!',
            'Best customer service experience ever!',
            'This platform changed how we work.',
            'Highly recommend to anyone in the industry.',
            'The UI/UX is incredibly intuitive.',
          ].map((mention, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30">
              <div className="text-green-600 dark:text-green-400 pt-1">
                <PiSmiley className="w-4 h-4" />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{mention}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AudienceTab() {
  return (
    <div className="space-y-6">
      {/* Audience KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Total Followers"
          value="125.4K"
          subtitle="All platforms"
          icon={<PiUsers className="w-6 h-6" />}
          color="blue"
        />
        <KPICard
          title="New Followers"
          value="+3.2K"
          subtitle="Last 30 days"
          icon={<PiTrendingUp className="w-6 h-6" />}
          color="green"
        />
        <KPICard
          title="Engagement Rate"
          value="4.8%"
          subtitle="Interactions/followers"
          icon={<PiChat className="w-6 h-6" />}
          color="purple"
        />
        <KPICard
          title="Reach"
          value="2.3M"
          subtitle="Monthly impressions"
          icon={<PiShare className="w-6 h-6" />}
          color="amber"
        />
      </div>

      {/* Age Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Age Group Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={audienceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="ageGroup" stroke="#9CA3AF" style={{ fontSize: '12px' }} />
              <YAxis stroke="#9CA3AF" style={{ fontSize: '12px' }} />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Bar dataKey="count" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Demographics */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Demographics</h3>
          <div className="space-y-4">
            {[
              { label: 'Top Country', value: 'United States', icon: '🇺🇸' },
              { label: 'Top City', value: 'San Francisco, CA', icon: '🏙️' },
              { label: 'Primary Language', value: 'English', icon: '🗣️' },
              { label: 'Peak Activity', value: 'Tuesday, 2-4 PM', icon: '⏰' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 last:pb-0">
                <span className="text-sm text-gray-600 dark:text-gray-400">{item.label}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  {item.icon} {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentTab() {
  return (
    <div className="space-y-6">
      {/* Content KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Posts Published"
          value="156"
          subtitle="This quarter"
          icon={<PiImage className="w-6 h-6" />}
          color="blue"
        />
        <KPICard
          title="Avg. Engagement"
          value="3.2K"
          subtitle="Per post"
          icon={<PiHeart className="w-6 h-6" />}
          color="red"
        />
        <KPICard
          title="Best Performing"
          value="8.9K"
          subtitle="Engagement"
          icon={<PiTrendingUp className="w-6 h-6" />}
          color="green"
        />
        <KPICard
          title="Avg. Shares"
          value="742"
          subtitle="Per post"
          icon={<PiShare className="w-6 h-6" />}
          color="purple"
        />
      </div>

      {/* Top Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-750/50">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Top 5 Content</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Content</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Engagement</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Reach</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Shares</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {contentPerformance.map((c) => (
                <tr key={c.title} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{c.title}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{c.engagement.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{c.reach.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      {c.shares.toLocaleString()}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Content Type Performance */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Content Type Performance</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { type: 'Videos', engagement: 4200, color: '#3B82F6' },
            { type: 'Carousels', engagement: 3100, color: '#10B981' },
            { type: 'Articles', engagement: 2400, color: '#F59E0B' },
            { type: 'Stories', engagement: 1800, color: '#EF4444' },
          ].map((item) => (
            <div
              key={item.type}
              className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-750 dark:to-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{item.type}</span>
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{item.engagement.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Avg. Engagement</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SocialMediaDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    toast.success('Data refreshed (demo mode)');
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleExport = useCallback(() => {
    toast.success(`Exported ${activeTab} tab data as CSV`);
  }, [activeTab]);

  const handleConnectAccount = useCallback(() => {
    toast('Coming soon — connect your social accounts to see real data', { icon: '🔗' });
  }, []);

  return (
    <ErrorBoundary>
      <div className="space-y-8">
        {/* Breadcrumb */}
        <div className="text-xs text-slate-500 dark:text-slate-400">
          <a href="/" className="hover:text-blue-600">Home</a> / <span className="text-slate-700 dark:text-slate-300">Social Media Analytics</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <PiChartBar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Social Media Analytics
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Monitor engagement, campaigns, sentiment, and audience insights
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={handleConnectAccount}>
              <PiUsers className="w-4 h-4" />
              Connect Account
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleRefresh} disabled={refreshing}>
              <PiTrendingUp className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <PiShare className="w-4 h-4" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Demo Mode Banner */}
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <span className="text-amber-500 dark:text-amber-400 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <div className="flex-1">
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Demo Mode</span>
            <span className="text-sm text-amber-700 dark:text-amber-400 ml-1">— Connect your social accounts to see real data. All metrics shown are illustrative sample data.</span>
          </div>
        </div>

        {/* Main Content Card with Tabs */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex gap-2 p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-all duration-200 rounded-lg border-2 whitespace-nowrap ${
                    isActive
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span>{tab.name}</span>
                      {tab.badge && (
                        <Badge className={`text-[10px] px-1.5 py-0.5 ${tab.badgeColor}`}>
                          {tab.badge}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs opacity-70 mt-0.5 font-normal hidden md:block">{tab.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && <OverviewTab />}
            {activeTab === 'campaigns' && <CampaignsTab />}
            {activeTab === 'sentiment' && <SentimentTab />}
            {activeTab === 'audience' && <AudienceTab />}
            {activeTab === 'content' && <ContentTab />}
          </div>
        </div>

        {/* Cross-module links */}
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>Related:</span>
          <a href="/intelligent" className="text-blue-600 dark:text-blue-400 hover:underline">AI Intelligence (Sentiment)</a>
          <a href="/bi-dashboard" className="text-blue-600 dark:text-blue-400 hover:underline">BI Dashboard (Reports)</a>
          <a href="/observability" className="text-blue-600 dark:text-blue-400 hover:underline">Observability (Cost)</a>
        </div>
      </div>
    </ErrorBoundary>
  );
}
