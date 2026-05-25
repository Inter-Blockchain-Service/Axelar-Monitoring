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
    <div className={`bg-[#1a1a1a] px-5 py-4 rounded-lg border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xs font-medium text-[#a0a0a0] uppercase tracking-wide">{title}</h3>
        {icon && <div className="text-[#fbb800]">{icon}</div>}
      </div>
      
      <div className="flex items-end gap-2">
        <p className="text-2xl font-bold text-white">{value}</p>
        
        {trend && (
          <div className="flex items-center gap-1 pb-1">
            {trend === 'up' && <span className="text-[#10b981]">↑</span>}
            {trend === 'down' && <span className="text-[#ef4444]">↓</span>}
            {trend === 'neutral' && <span className="text-[#a0a0a0]">→</span>}
          </div>
        )}
      </div>
    </div>
  );
} 