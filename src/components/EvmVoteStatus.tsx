import React, { useState, useEffect } from 'react';
import { PollStatus } from '../hooks/useMetrics';

interface ChainData {
  [chain: string]: {
    pollIds: PollStatus[];
  }
}

interface EvmVoteStatusProps {
  evmVotes: ChainData;
  enabled: boolean;
  className?: string;
  chainId: string;
}

const EvmVoteStatus: React.FC<EvmVoteStatusProps> = ({ evmVotes, enabled, className = '', chainId }) => {
  const [availableChains, setAvailableChains] = useState<string[]>([]);
  const [displayLimit] = useState(35); // Display maximum number of votes
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const getAxelarscanUrl = (): string => {
    if (chainId === 'axelar-dojo-1') {
      return 'https://axelarscan.io';
    } else if (chainId === 'axelar-testnet-lisbon-3') {
      return 'https://testnet.axelarscan.io';
    } else {
      return 'https://axelarscan.io';
    }
  };

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

  const handleChainClick = (chain: string) => {
    setSelectedChain(chain);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedChain(null);
  };

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
    <div className={`bg-[#292524] p-4 rounded-lg shadow-md flex flex-col h-full ${className}`}>
      <div className="mb-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-200">
            EVM Votes
          </h3>
          <div className="text-sm text-gray-500">
            Last 35 votes are displayed (you can click on the chain to see last 200)
          </div>
        </div>
      </div>

      <div className="flex-grow">
        {availableChains.map((chain) => {
          const chainVotes = evmVotes[chain]?.pollIds || [];

          return (
            <div key={chain} className="mb-2">
              <div className="flex items-start">
                <div 
                  className="w-30 font-semibold text-white text-sm cursor-pointer hover:text-blue-400"
                  onClick={() => handleChainClick(chain)}
                >
                  {chain.toUpperCase()}:
                </div>
                <div className="grid grid-cols-35 gap-1 flex-1">
                  {chainVotes.length > 0 ? (
                    chainVotes.slice(0, displayLimit).map((vote, index) => (
                      vote.result.toString() === 'unknown' ? (
                        <div
                          key={`${vote.pollId}-${index}`}
                          className={`w-4 h-4 ${getStatusColor(vote.result.toString())} rounded-sm block`}
                          title={`Poll ID: ${vote.pollId} - ${getStatusTooltip(vote.result.toString())}`}
                        />
                      ) : (
                        <a
                          href={`${getAxelarscanUrl()}/evm-poll/${vote.pollId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          key={`${vote.pollId}-${index}`}
                          className={`w-4 h-4 ${getStatusColor(vote.result.toString())} hover:opacity-80 transition-opacity rounded-sm block`}
                          title={`Poll ID: ${vote.pollId} - ${getStatusTooltip(vote.result.toString())}`}
                        />
                      )
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

      {showModal && selectedChain && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#333333] p-6 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">
                EVM History Votes - {selectedChain.toUpperCase()}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-20 gap-1">
              {evmVotes[selectedChain]?.pollIds.map((vote, index) => (
                vote.result.toString() === 'unknown' ? (
                  <div
                    key={`${vote.pollId}-${index}`}
                    className={`w-6 h-6 ${getStatusColor(vote.result.toString())} rounded-sm block`}
                    title={`Poll ID: ${vote.pollId} - ${getStatusTooltip(vote.result.toString())}`}
                  />
                ) : (
                  <a
                    href={`${getAxelarscanUrl()}/evm-poll/${vote.pollId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    key={`${vote.pollId}-${index}`}
                    className={`w-6 h-6 ${getStatusColor(vote.result.toString())} hover:opacity-80 transition-opacity rounded-sm block`}
                    title={`Poll ID: ${vote.pollId} - ${getStatusTooltip(vote.result.toString())}`}
                  />
                )
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-700">
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
        </div>
      )}

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