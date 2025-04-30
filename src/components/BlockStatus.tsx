import React, { useState, useEffect, useRef } from 'react';
import { StatusType } from '@/hooks/useMetrics';

interface BlockStatusProps {
  statusList: number[];
  className?: string;
  lastBlockHeight?: number;
}

export default function BlockStatus({ statusList, className = '', lastBlockHeight = 0 }: BlockStatusProps) {
  const [prevLastBlock, setPrevLastBlock] = useState<number>(lastBlockHeight);
  const [hasNewBlock, setHasNewBlock] = useState<boolean>(false);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Detect new block arrival
  useEffect(() => {
    if (lastBlockHeight > prevLastBlock && prevLastBlock > 0) {
      setHasNewBlock(true);
      
      // Reset animation after 1 second
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      
      animationTimeoutRef.current = setTimeout(() => {
        setHasNewBlock(false);
      }, 1000);
    }
    
    setPrevLastBlock(lastBlockHeight);
    
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [lastBlockHeight, prevLastBlock]);
  
  // Function to get color based on status
  const getStatusColor = (status: number) => {
    switch (status) {
      case StatusType.Proposed:
        return 'bg-purple-500';
      case StatusType.Signed:
        return 'bg-green-500';
      case StatusType.Precommit:
        return 'bg-yellow-500';
      case StatusType.Prevote:
        return 'bg-orange-500';
      case StatusType.Missed:
        return 'bg-red-500';
      default:
        return 'bg-[#9e9e9e4d]';
    }
  };

  // Calculate actual block height for a given index
  const getBlockHeight = (index: number) => {
    if (lastBlockHeight <= 0) return '?';
    return (lastBlockHeight - index).toString();
  };
  
  // Limit to last 200 blocks only
  const visibleBlocks = statusList.slice(0, 200).map((status, index) => ({ status, index }));
  
  return (
    <div className={`bg-[#292524] p-4 rounded-lg shadow-md ${className}`}>
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-200">
            Recent Blocks Status
          </h3>
          <div className="text-sm text-gray-500">
            Displaying the last 200 blocks
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-35 gap-1 pb-1 overflow-y-auto max-h-[180px]">
        {visibleBlocks.map((item) => (
          <div 
            key={item.index} 
            className={`w-4 h-4 ${getStatusColor(item.status)} hover:opacity-80 transition-opacity rounded-sm ${item.index === 0 && hasNewBlock ? 'animate-pulse scale-110' : ''}`}
            title={`${getBlockHeight(item.index)}`}
          />
        ))}
      </div>
      
      <div className="flex justify-start mt-4">
        <div className="grid grid-cols-5 gap-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-purple-500 rounded-sm"></div>
            <span className="text-xs">Proposed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <span className="text-xs">Signed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-500 rounded-sm"></div>
            <span className="text-xs">Precommit</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
            <span className="text-xs">Prevote</span>
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