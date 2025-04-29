import React, { useState, useEffect } from 'react';

interface PollStatus {
  pollId: string;
  result: string;
}

interface ChainData {
  [chain: string]: {
    pollIds: PollStatus[];
  }
}

interface EvmVoteStatusProps {
  evmVotes: ChainData;
  enabled: boolean;
  lastGlobalPollId: number;
  className?: string;
}

const EvmVoteStatus: React.FC<EvmVoteStatusProps> = ({ evmVotes, enabled, lastGlobalPollId, className = '' }) => {
  const [availableChains, setAvailableChains] = useState<string[]>([]);
  const [displayLimit] = useState(35); // Display maximum number of votes

  useEffect(() => {
    if (evmVotes && Object.keys(evmVotes).length > 0) {
      const chains = Object.keys(evmVotes);
      // Sort chains to put ethereum first, then alphabetically
      const sortedChains = chains.sort((a, b) => {
        if (a === 'ethereum') return -1;
        if (b === 'ethereum') return 1;
        return a.localeCompare(b);
      });
      setAvailableChains(sortedChains);
    }
  }, [evmVotes]);

  if (!enabled) {
    return (
      <div className={`bg-[#333333] p-4 rounded-lg shadow-md ${className}`}>
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-200">
              EVM Votes Status
            </h3>
          </div>
        </div>
        <div className="flex justify-center items-center h-[200px]">
          <p className="text-gray-400">
            EVM votes monitoring is not enabled
          </p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'validated':
        return 'bg-green-500'; // green for validated
      case 'unsubmitted':
        return 'bg-orange-500'; // orange for unsubmitted
      case 'invalid':
        return 'bg-red-500'; // red for invalid
      case 'unknown':
      default:
        return 'bg-[#9e9e9e4d]'; // transparent gray for no data
    }
  };

  const getStatusTooltip = (status: string) => {
    switch (status) {
      case 'validated':
        return 'Validated';
      case 'unsubmitted':
        return 'Unsubmitted';
      case 'invalid':
        return 'Invalid';
      case 'unknown':
      default:
        return 'No data';
    }
  };

  return (
    <div className={`bg-[#333333] p-4 rounded-lg shadow-md flex flex-col h-full ${className}`}>
      <div className="mb-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-200">
            EVM Votes Status
          </h3>
          <div className="text-sm text-gray-500">
            Last Global Poll ID: {lastGlobalPollId}
          </div>
        </div>
      </div>

      <div className="flex-grow">
        {availableChains.map((chain) => {
          const chainVotes = evmVotes[chain]?.pollIds || [];

          return (
            <div key={chain} className="mb-2">
              <div className="flex items-start">
                <div className="w-30 font-semibold text-white text-sm">
                  {chain.toUpperCase()}:
                </div>
                <div className="grid grid-cols-35 gap-1 flex-1">
                  {chainVotes.length > 0 ? (
                    chainVotes.slice(0, displayLimit).map((vote, index) => (
                      <div 
                        key={`${vote.pollId}-${index}`} 
                        className={`w-4 h-4 ${getStatusColor(vote.result.toString())} hover:opacity-80 transition-opacity rounded-sm`}
                        title={`Poll ID: ${vote.pollId} - ${getStatusTooltip(vote.result.toString())}`}
                      />
                    ))
                  ) : (
                    <p className="text-gray-400 text-sm">
                      No votes available
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
            <span className="text-xs">Unsubmitted</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <span className="text-xs">Validated</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            <span className="text-xs">Invalid</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvmVoteStatus; 