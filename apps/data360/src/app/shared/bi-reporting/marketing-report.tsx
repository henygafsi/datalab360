// src/components/MarketingReport.js
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

export default function MarketingReport() {
  const barData = {
    labels: [
      'Spring Sale',
      'Back to School',
      'Holiday',
      'Summer Splash',
      'Black Friday',
      'New Year',
    ],
    datasets: [
      {
        label: 'Cost of Acquisition (CAC)',
        data: [1.5, 2.1, 1.7, 3.0, 2.5, 2.0],
        backgroundColor: '#C2185B',
      },
    ],
  };

  const pieData = {
    labels: [
      'Spring Sale',
      'Back to School',
      'Holiday',
      'Summer Splash',
      'Black Friday',
    ],
    datasets: [
      {
        data: [14, 5, 8, 31, 23],
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#7B1FA2',
        ],
      },
    ],
  };

  return (
    <div className="report-section">
      <h2>Marketing Report</h2>
      <div className="chart-container">
        <h3>Cost of Acquisition (CAC)</h3>
        <Bar data={barData} />
      </div>
      <div className="chart-container">
        <h3>Return on Investment (ROI)</h3>
        <Pie data={pieData} />
      </div>
    </div>
  );
}
