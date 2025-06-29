'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
} from 'recharts';

// Sample data for Finance and Marketing tabs
const financeData = [
  { name: 'January', revenue: 2400, margin: 2.1, volume: 320 },
  { name: 'February', revenue: 3200, margin: 1.9, volume: 450 },
  { name: 'March', revenue: 1500, margin: 2.4, volume: 220 },
];

const marketingData = [
  { name: 'Spring Sale', roi: 3.5, cac: 1.2, ers: 4.2 },
  { name: 'Back to School', roi: 2.8, cac: 1.5, ers: 3.8 },
  { name: 'Black Friday', roi: 4.1, cac: 1.3, ers: 3.6 },
];

// Colors for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('finance');

  return (
    <div className="mx-auto w-full space-y-6 p-6">
      {/* Header with Breadcrumb and Filter Button */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-gray-600">Home / Dashboard</span>
          <h2 className="mt-1 text-2xl font-semibold text-gray-800">
            Dashboard
          </h2>
        </div>

        {/* Show Filters Button with Modal */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-white text-blue-600 shadow-md hover:bg-gray-100">
              Show Filters
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Filters</DialogTitle>
            </DialogHeader>
            {/* Filter options */}
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-gray-700">Month</span>
                <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50">
                  <option>January</option>
                  <option>February</option>
                  <option>March</option>
                </select>
              </label>
              <label className="block">
                <span className="text-gray-700">Year</span>
                <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50">
                  <option>2024</option>
                  <option>2023</option>
                  <option>2022</option>
                </select>
              </label>
              <label className="block">
                <span className="text-gray-700">Region</span>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  placeholder="Enter region"
                />
              </label>
              <Button className="mt-4 w-full bg-blue-600 text-white">
                Apply Filters
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs for Finance and Marketing */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value)}>
        <TabsList className="flex justify-center space-x-2">
          <TabsTrigger value="finance" className="px-4 py-2 font-medium">
            Finance
          </TabsTrigger>
          <TabsTrigger value="marketing" className="px-4 py-2 font-medium">
            Marketing
          </TabsTrigger>
        </TabsList>

        {/* Content for Finance Tab */}
        <TabsContent value="finance">
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Card className="bg-gradient-to-r from-blue-50 to-white p-4 shadow-lg">
              <CardHeader>
                <CardTitle>Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <h3 className="text-3xl font-bold text-blue-600">$2.1k</h3>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-r from-yellow-50 to-white p-4 shadow-lg">
              <CardHeader>
                <CardTitle>Gross Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <h3 className="text-3xl font-bold text-yellow-600">2.2%</h3>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-r from-green-50 to-white p-4 shadow-lg">
              <CardHeader>
                <CardTitle>Sales Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <h3 className="text-3xl font-bold text-green-600">324</h3>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Revenue Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart width={500} height={300} data={financeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="revenue" fill="#8884d8" />
                </BarChart>
              </CardContent>
            </Card>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Sales by Product Category</CardTitle>
              </CardHeader>
              <CardContent>
                <PieChart width={400} height={300}>
                  <Pie
                    data={financeData}
                    dataKey="volume"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                  >
                    {financeData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </CardContent>
            </Card>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Gross Margin by Month</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart width={500} height={300} data={financeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="margin" fill="#82ca9d" />
                </BarChart>
              </CardContent>
            </Card>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Sales Volume Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <AreaChart width={500} height={300} data={financeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="#8884d8"
                    fill="#8884d8"
                  />
                </AreaChart>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Content for Marketing Tab */}
        <TabsContent value="marketing">
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Card className="bg-gradient-to-r from-purple-50 to-white p-4 shadow-lg">
              <CardHeader>
                <CardTitle>ROI</CardTitle>
              </CardHeader>
              <CardContent>
                <h3 className="text-3xl font-bold text-purple-600">1.52</h3>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-r from-red-50 to-white p-4 shadow-lg">
              <CardHeader>
                <CardTitle>CAC</CardTitle>
              </CardHeader>
              <CardContent>
                <h3 className="text-3xl font-bold text-red-600">39%</h3>
              </CardContent>
            </Card>
          </div>

          {/* Marketing Charts */}
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Cost of Acquisition (CAC) by Campaign</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart width={500} height={300} data={marketingData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cac" fill="#82ca9d" />
                </BarChart>
              </CardContent>
            </Card>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>ROI by Campaign</CardTitle>
              </CardHeader>
              <CardContent>
                <PieChart width={400} height={300}>
                  <Pie
                    data={marketingData}
                    dataKey="roi"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                  >
                    {marketingData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </CardContent>
            </Card>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Customer Lifetime Value (CLV)</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart width={500} height={300} data={marketingData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="roi" fill="#8884d8" />
                </BarChart>
              </CardContent>
            </Card>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Conversion Rate by Campaign</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart width={500} height={300} data={marketingData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="ers" stroke="#FF8042" />
                </LineChart>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
