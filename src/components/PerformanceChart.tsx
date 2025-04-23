import React from 'react';

interface PerformanceChartProps {
  data: number[];
  height?: number;
  className?: string;
}

export default function PerformanceChart({ data, height = 100, className = '' }: PerformanceChartProps) {
  const max = Math.max(...data, 100); // Minimum 100 to avoid an empty chart
  
  return (
    <div className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md ${className}`}>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">
        Real-time Performance
      </h3>
      
      <div className="relative" style={{ height: `${height}px` }}>
        <div className="flex items-end justify-between h-full gap-1 relative z-10">
          {data.map((value, index) => {
            const barHeight = (value / max) * 100;
            return (
              <div 
                key={index}
                className="bg-blue-500 dark:bg-blue-600 rounded-t w-full transition-all duration-500 ease-in-out"
                style={{ height: `${barHeight}%` }}
                title={`${value}`}
              />
            );
          })}
        </div>
        
        {/* Reference horizontal lines */}
        <div className="absolute inset-0 flex flex-col justify-between">
          <div className="border-t border-gray-200 dark:border-gray-700 w-full h-0" />
          <div className="border-t border-gray-200 dark:border-gray-700 w-full h-0" />
          <div className="border-t border-gray-200 dark:border-gray-700 w-full h-0" />
        </div>
      </div>
      
      <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
        {data.map((_, index) => (
          <span key={index}>{index + 1}</span>
        ))}
      </div>
    </div>
  );
} 