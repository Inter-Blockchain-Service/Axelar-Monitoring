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

  useEffect(() => {
    if (evmVotes && Object.keys(evmVotes).length > 0) {
      const chains = Object.keys(evmVotes);
      // Trier les chaînes pour mettre ethereum en premier, puis par ordre alphabétique
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
              Statut des Votes EVM
            </h3>
          </div>
        </div>
        <div className="flex justify-center items-center h-[200px]">
          <p className="text-gray-400">
            La surveillance des votes EVM n'est pas activée
          </p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'validated':
        return 'bg-green-500'; // vert pour validé
      case 'unsubmitted':
        return 'bg-orange-500'; // orange pour non soumis
      case 'invalid':
        return 'bg-red-500'; // rouge pour invalide
      case 'unknown':
      default:
        return 'bg-[#9e9e9e4d]'; // gris transparent pour pas de donnée
    }
  };

  const getStatusTooltip = (status: string) => {
    switch (status) {
      case 'validated':
        return 'Validé';
      case 'unsubmitted':
        return 'Non soumis';
      case 'invalid':
        return 'Invalide';
      case 'unknown':
      default:
        return 'Pas de donnée';
    }
  };

  return (
    <div className={`bg-[#333333] p-4 rounded-lg shadow-md flex flex-col h-full ${className}`}>
      <div className="mb-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-200">
            Statut des Votes EVM
          </h3>
          <div className="text-sm text-gray-500">
            Dernier Poll ID Global: {lastGlobalPollId}
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
                    chainVotes.map((vote, index) => (
                      <div 
                        key={`${vote.pollId}-${index}`} 
                        className={`w-4 h-4 ${getStatusColor(vote.result.toString())} hover:opacity-80 transition-opacity rounded-sm`}
                        title={`Poll ID: ${vote.pollId} - ${getStatusTooltip(vote.result.toString())}`}
                      />
                    ))
                  ) : (
                    <p className="text-gray-400 text-sm">
                      Aucun vote disponible
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
            <div className="w-3 h-3 bg-[#9e9e9e4d] rounded-sm"></div>
            <span className="text-xs">Pas de donnée</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
            <span className="text-xs">Non soumis</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <span className="text-xs">Validé</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            <span className="text-xs">Invalide</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvmVoteStatus; 