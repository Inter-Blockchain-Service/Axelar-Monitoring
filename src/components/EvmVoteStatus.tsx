import React, { useState, useEffect } from 'react';
import { Typography, Box, Tooltip } from '@mui/material';

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
}

const EvmVoteStatus: React.FC<EvmVoteStatusProps> = ({ evmVotes, enabled, lastGlobalPollId }) => {
  const [availableChains, setAvailableChains] = useState<string[]>([]);
  const [displayLimit, setDisplayLimit] = useState(35); // Afficher tous les votes (MAX_POLL_HISTORY)

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
      <div className="bg-[#333333] p-4 rounded-lg shadow-md">
        <Typography variant="h6" align="center" gutterBottom>
          Statut des Votes EVM
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <Typography variant="body1" color="text.secondary">
            La surveillance des votes EVM n'est pas activée
          </Typography>
        </Box>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'validated':
        return 'rgb(34, 197, 94)'; // bg-green-500
      case 'unsubmitted':
        return 'rgb(249, 115, 22)'; // bg-orange-500
      case 'invalid':
        return 'rgb(239, 68, 68)'; // bg-red-500
      case 'unknown':
      default:
        return '#9e9e9e4d'; // gris transparent (comme bg-gray-300 dark:bg-gray-600)
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
    <div className="bg-[#333333] p-4 rounded-lg shadow-md">
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-200">
            Statut des Votes EVM
          </h3>
          <div className="text-sm text-gray-500">
            Dernier Poll ID Global: {lastGlobalPollId}
          </div>
        </div>
      </div>

      <Box sx={{ overflow: 'auto', maxHeight: 600, mt: 2 }}>
        {availableChains.map((chain) => {
          const chainVotes = evmVotes[chain]?.pollIds || [];
          const votesToDisplay = chainVotes.slice(0, displayLimit);

          return (
            <Box key={chain} sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ minWidth: 120, fontWeight: 'bold', color: 'white' }}>
                  {chain.toUpperCase()}:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {votesToDisplay.map((vote, index) => (
                    <Tooltip 
                      key={`${vote.pollId}-${index}`} 
                      title={`Poll ID: ${vote.pollId} - ${getStatusTooltip(vote.result.toString())}`}
                    >
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          backgroundColor: getStatusColor(vote.result.toString()),
                          borderRadius: 1,
                          cursor: 'pointer',
                          transition: 'transform 0.2s',
                          '&:hover': {
                            transform: 'scale(1.1)',
                            zIndex: 1
                          }
                        }}
                      />
                    </Tooltip>
                  ))}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>

      <div className="flex justify-start mt-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{backgroundColor: getStatusColor('unsubmitted')}}></div>
            <span className="text-xs">Unsubmitted</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{backgroundColor: getStatusColor('validated')}}></div>
            <span className="text-xs">Validé</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{backgroundColor: getStatusColor('invalid')}}></div>
            <span className="text-xs">Invalide</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvmVoteStatus; 