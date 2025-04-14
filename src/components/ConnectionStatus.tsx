import React from 'react';

interface ConnectionStatusProps {
  isConnected: boolean;
}

export default function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-2">
      <div 
        className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} 
                   ${isConnected ? 'animate-pulse' : ''}`}
      />
      <span className="text-sm font-medium">
        {isConnected ? 'Connecté' : 'Déconnecté'}
      </span>
    </div>
  );
} 