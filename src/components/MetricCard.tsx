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
    <div className={`bg-[#333333] px-6 py-4 rounded-lg shadow-[0_4px_12px_rgba(200,200,200,0.1)] ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
      
      <div className="flex items-end gap-2">
        <p className="text-3xl font-bold text-white">{value}</p>
        
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