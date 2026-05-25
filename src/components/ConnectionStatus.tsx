import React from 'react';

interface ConnectionStatusProps {
  isConnected: boolean;
}

export default function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
      <div 
        className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-[#10b981]' : 'bg-[#ef4444]'} 
                   ${isConnected ? 'animate-pulse' : ''}`}
      />
      <span className="text-xs font-medium text-white">
        {isConnected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
} 