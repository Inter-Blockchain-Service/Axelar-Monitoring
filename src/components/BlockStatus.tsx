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
        return 'bg-[#fbb800]';
      case StatusType.Signed:
        return 'bg-[#10b981]';
      case StatusType.Precommit:
        return 'bg-[#a855f7]';
      case StatusType.Prevote:
        return 'bg-[#3b82f6]';
      case StatusType.Missed:
        return 'bg-[#ef4444]';
      default:
        return 'bg-[#2a2a2a]';
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
    <div className={`bg-[#1a1a1a] p-5 rounded-lg border border-[#2a2a2a] ${className}`}>
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-semibold text-white">
            Recent Blocks Status
          </h3>
          <div className="text-xs text-[#a0a0a0]">
            Last 200 blocks
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-35 gap-1 pb-1 overflow-y-auto max-h-[180px]">
        {visibleBlocks.map((item) => (
          <div 
            key={item.index} 
            className={`w-4 h-4 ${getStatusColor(item.status)} hover:opacity-80 transition-opacity rounded-sm ${item.index === 0 && hasNewBlock ? 'animate-pulse' : ''}`}
            title={`Block #${getBlockHeight(item.index)}`}
          />
        ))}
      </div>
      
      <div className="flex justify-start mt-4 pt-4 border-t border-[#2a2a2a]">
        <div className="grid grid-cols-5 gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-[#fbb800] rounded-sm"></div>
            <span className="text-xs text-[#a0a0a0]">Proposed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-[#10b981] rounded-sm"></div>
            <span className="text-xs text-[#a0a0a0]">Signed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-[#a855f7] rounded-sm"></div>
            <span className="text-xs text-[#a0a0a0]">Precommit</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-[#3b82f6] rounded-sm"></div>
            <span className="text-xs text-[#a0a0a0]">Prevote</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-[#ef4444] rounded-sm"></div>
            <span className="text-xs text-[#a0a0a0]">Missed</span>
          </div>
        </div>
      </div>
    </div>
  );
} 