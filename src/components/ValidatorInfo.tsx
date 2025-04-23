import React from 'react';
import { ConnectionInfo } from '@/hooks/useMetrics';

interface ValidatorInfoProps {
  connectionInfo: ConnectionInfo;
  moniker: string;
  chainId: string;
  className?: string;
}

export default function ValidatorInfo({ connectionInfo, moniker, chainId, className = '' }: ValidatorInfoProps) {
  const formatAddress = (address: string) => {
    if (!address) return '-';
    if (address.length < 25) return address;
    return `${address.substring(0, 14)}...${address.substring(address.length - 8)}`;
  };

  return (
    <div className={`bg-[#333333] p-6 rounded-lg shadow-md ${className}`}>
      <h3 className="text-lg font-semibold text-gray-200 mb-4">
        Validator Information
      </h3>
      
      <div className="space-y-3">
        <div>
          <div className="text-sm text-gray-400">Moniker</div>
          <div className="font-medium">{moniker}</div>
        </div>
        
        <div>
          <div className="text-sm text-gray-400">Chain</div>
          <div className="font-medium">{chainId}</div>
        </div>
        
        <div>
          <div className="text-sm text-gray-400">Validator Address</div>
          <div className="font-mono text-xs break-all">
            {connectionInfo.validatorAddress || '(Not connected)'}
          </div>
        </div>
        
        <div>
          <div className="text-sm text-gray-400">Broadcaster Address (HeartBeats)</div>
          <div className="font-mono text-xs break-all">
            {connectionInfo.broadcasterAddress || '(Not configured)'}
          </div>
        </div>
        
        {connectionInfo.ampdEnabled && connectionInfo.ampdAddress && (
          <div>
            <div className="text-sm text-gray-400">AMPD Address</div>
            <div className="font-mono text-xs break-all">
              {connectionInfo.ampdAddress || '(Not configured)'}
            </div>
          </div>
        )}
        
        <div>
          <div className="text-sm text-gray-400">RPC Endpoint</div>
          <div className="font-mono text-xs break-all">
            {connectionInfo.endpoint || '-'}
          </div>
        </div>
      </div>
    </div>
  );
} 