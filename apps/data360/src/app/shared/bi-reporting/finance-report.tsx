// src/components/FinanceReport.js
import React from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

// Register the necessary components for Bar and Pie charts
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

export default function FinanceReport() {
  const barData = {
    labels: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ],
    datasets: [
      {
        label: 'Revenue',
        data: [12, 19, 3, 5, 2, 3, 9, 15, 13, 12, 10, 11],
        backgroundColor: '#7B1FA2',
      },
    ],
  };

  const pieData = {
    labels: ['Cat 1', 'Cat 2', 'Cat 3', 'Cat 4'],
    datasets: [
      {
        data: [21.8, 32.7, 10.9, 34.6],
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'],
      },
    ],
  };

  return (
    <div className="report-section">
      <h2>Finance Report</h2>
      <div className="chart-container">
        <h3>Revenue</h3>
        <Bar data={barData} />
      </div>
      <div className="chart-container">
        <h3>Sales by Product Category</h3>
        <Pie data={pieData} />
      </div>
    </div>
  );
}
