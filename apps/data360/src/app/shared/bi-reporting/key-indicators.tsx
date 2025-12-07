// src/components/KeyIndicators.js
import React from 'react';

export default function KeyIndicators({ reportType }: { reportType: string }) {
  const indicators =
    reportType === 'finance'
      ? [
          { label: 'CA', value: '2.1k' },
          { label: 'Gross Margin', value: '2.2%' },
          { label: 'Sales Volume', value: '324' },
        ]
      : [
          { label: 'ROI', value: '2.1%' },
          { label: 'CAC', value: '1.52' },
          { label: 'ERS', value: '39%' },
        ];

  return (
    <div className="key-indicators">
      {indicators.map((indicator, index) => (
        <div key={index} className="indicator">
          <p>{indicator.label}</p>
          <h2>{indicator.value}</h2>
        </div>
      ))}
    </div>
  );
}
