import React from 'react';
import { ConnectionInfo } from '@/hooks/useMetrics';

interface ValidatorInfoProps {
  connectionInfo: ConnectionInfo;
  moniker: string;
  chainId: string;
  className?: string;
}

export default function ValidatorInfo({ connectionInfo, moniker, chainId, className = '' }: ValidatorInfoProps) {
  return (
    <div className={`bg-white dark:bg-[#333333] p-6 rounded-lg shadow-md ${className}`}>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">
        Informations du Validateur
      </h3>
      
      <div className="space-y-3">
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Moniker</div>
          <div className="font-medium">{moniker}</div>
        </div>
        
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Chaîne</div>
          <div className="font-medium">{chainId}</div>
        </div>
        
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Adresse du Validateur</div>
          <div className="font-mono text-xs break-all">
            {connectionInfo.validatorAddress || '(Non connecté)'}
          </div>
        </div>
        
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Adresse du Broadcaster (HeartBeats)</div>
          <div className="font-mono text-xs break-all">
            {connectionInfo.broadcasterAddress || '(Non configuré)'}
          </div>
        </div>
      </div>
    </div>
  );
} 