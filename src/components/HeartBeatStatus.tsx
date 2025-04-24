import React, { useState, useEffect, useRef } from 'react';
import { HeartbeatStatusType } from '@/hooks/useMetrics';

interface HeartBeatStatusProps {
  statusList: number[];
  className?: string;
  lastPeriod?: number;
  blocksList?: (number | undefined)[];
}

export default function HeartBeatStatus({ statusList, className = '', lastPeriod = 0, blocksList = [] }: HeartBeatStatusProps) {
  const [prevLastPeriod, setPrevLastPeriod] = useState<number>(lastPeriod);
  const [hasNewHeartbeat, setHasNewHeartbeat] = useState<boolean>(false);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Number of heartbeats to display
  const DISPLAY_LIMIT = 200;
  
  // Detect arrival of a new heartbeat
  useEffect(() => {
    if (lastPeriod > prevLastPeriod && prevLastPeriod > 0) {
      setHasNewHeartbeat(true);
      
      // Reset animation after 1 second
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      
      animationTimeoutRef.current = setTimeout(() => {
        setHasNewHeartbeat(false);
      }, 1000);
    }
    
    setPrevLastPeriod(lastPeriod);
    
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [lastPeriod, prevLastPeriod]);
  
  // Function to get color based on status
  const getStatusColor = (status: number) => {
    switch (status) {
      case HeartbeatStatusType.Signed:
        return 'bg-green-500';
      case HeartbeatStatusType.Missed:
        return 'bg-red-500';
      case HeartbeatStatusType.Unknown:
      default:
        return 'bg-[#9e9e9e4d]';
    }
  };

  // Calculate actual period for a given index
  const getPeriodNumber = (index: number) => {
    if (lastPeriod <= 0) return '?';
    return (lastPeriod - index).toString();
  };
  
  // Generate tooltip text based on status and block height
  const getTooltipText = (index: number, status: number, blockHeight?: number) => {
    const period = getPeriodNumber(index);
    
    if (status === HeartbeatStatusType.Signed && blockHeight) {
      return `HeartBeat at block ${blockHeight}`;
    } else if (status === HeartbeatStatusType.Missed) {
      return `Missed HeartBeat (period ${period})`;
    } else {
      return `No data (period ${period})`;
    }
  };
  
  // Prepare data for display
  const visibleHeartbeats = statusList.slice(0, DISPLAY_LIMIT).map((status, index) => {
    const blockHeight = blocksList && blocksList.length > index ? blocksList[index] : undefined;
    return { status, index, blockHeight };
  });
  
  return (
    <div className={`bg-[#333333] p-4 rounded-lg shadow-md ${className}`}>
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-200">
            Recent HeartBeats Status
          </h3>
          <div className="text-sm text-gray-500">
            Displaying the last {DISPLAY_LIMIT} periods
          </div>
        </div>

      </div>
      
      <div className="grid grid-cols-35 gap-1 pb-1 overflow-y-auto max-h-[180px]">
        {visibleHeartbeats.map((item) => (
          <div 
            key={item.index} 
            className={`w-4 h-4 ${getStatusColor(item.status)} hover:opacity-80 transition-opacity rounded-sm ${item.index === 0 && hasNewHeartbeat ? 'animate-pulse scale-110' : ''}`}
            title={getTooltipText(item.index, item.status, item.blockHeight)}
          />
        ))}
      </div>
      
      <div className="flex justify-start mt-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <span className="text-xs">Signed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            <span className="text-xs">Missed</span>
          </div>
        </div>
      </div>
    </div>
  );
} 