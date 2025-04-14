import React from 'react';

interface MetricCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export default function MetricCard({ title, value, icon, trend, className = '' }: MetricCardProps) {
  return (
    <div className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
        {icon && <div className="text-gray-500 dark:text-gray-400">{icon}</div>}
      </div>
      
      <div className="flex items-end gap-2">
        <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
        
        {trend && (
          <div className="flex items-center gap-1 pb-1">
            {trend === 'up' && <span className="text-green-500">↑</span>}
            {trend === 'down' && <span className="text-red-500">↓</span>}
            {trend === 'neutral' && <span className="text-gray-500">→</span>}
          </div>
        )}
      </div>
    </div>
  );
} 