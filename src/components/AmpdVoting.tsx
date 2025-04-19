import React, { useEffect, useState } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { PollStatus } from '../server/ampd-manager';
import { Socket } from 'socket.io-client';

interface AmpdVotingProps {
  socket: Socket | null;
  chain?: string;
  className?: string;
}

const AmpdVoting: React.FC<AmpdVotingProps> = ({ socket, chain, className = '' }) => {
  const [voteData, setVoteData] = useState<Record<string, PollStatus[]>>({});
  const [supportedChains, setSupportedChains] = useState<string[]>([]);
  const [displayLimit, setDisplayLimit] = useState(35); // Afficher un maximum de votes
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Configuration des écouteurs d'événements Socket.io
    if (socket) {
      // Écouteur pour les chaînes supportées
      socket.on('ampd-chains', (data) => {
        console.log("AMPD Chains received:", data);
        setSupportedChains(data.chains || []);
        setIsLoading(false);
        
        // Si des chaînes sont disponibles, demander les données pour chacune
        if (data.chains && data.chains.length > 0) {
          data.chains.forEach((chainName: string) => {
            socket.emit('get-ampd-votes', { chain: chainName });
          });
        }
      });
      
      // Écouteur pour les données de vote
      socket.on('ampd-votes', (data) => {
        if (data.chain && data.votes) {
          setVoteData(prevData => ({
            ...prevData,
            [data.chain]: data.votes
          }));
        }
      });
      
      // Écouteur pour les mises à jour de vote
      socket.on('ampd-votes-update', (data) => {
        if (data.chain) {
          // Demander une mise à jour complète des données
          socket.emit('get-ampd-votes', { chain: data.chain });
        }
      });
      
      // Demander la liste des chaînes supportées
      socket.emit('get-ampd-chains');
    }

    // Nettoyage lors du démontage du composant
    return () => {
      if (socket) {
        socket.off('ampd-chains');
        socket.off('ampd-votes');
        socket.off('ampd-votes-update');
      }
    };
  }, [socket]);

  // Fonction pour obtenir la couleur du statut
  const getStatusColor = (status: string) => {
    if (status === 'succeeded_on_chain' || status.includes('succeeded')) return 'bg-green-500'; // vert - vote valide
    if (status === 'not_found' || status.includes('failed')) return 'bg-red-500'; // rouge - vote invalide
    if (status === 'unsubmit') return 'bg-orange-500'; // orange - non soumis
    if (status === 'unknown') return 'bg-[#9e9e9e4d]'; // gris transparent - pas de donnée
    return 'bg-[#9e9e9e4d]'; // gris transparent par défaut
  };

  // Fonction pour obtenir le texte du tooltip
  const getStatusTooltip = (status: string) => {
    if (status === 'succeeded_on_chain' || status.includes('succeeded')) return 'Vote valide';
    if (status === 'not_found' || status.includes('failed')) return 'Vote invalide';
    if (status === 'unsubmit') return 'Non soumis';
    if (status === 'unknown') return 'Pas de donnée';
    return 'Inconnu';
  };

  // Fonction pour formater l'ID du poll
  const formatPollId = (pollId: string): string => {
    if (pollId === 'unknown') return 'Inconnu';
    return pollId.length > 20 ? `${pollId.substring(0, 8)}...${pollId.substring(pollId.length - 8)}` : pollId;
  };

  // Si les données sont en cours de chargement, afficher un indicateur
  if (isLoading) {
    return (
      <div className={`bg-[#333333] p-4 rounded-lg shadow-md ${className}`}>
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-200">
              Votes AMPD
            </h3>
          </div>
        </div>
        <div className="flex justify-center items-center h-[200px]">
          <p className="text-gray-400">
            Chargement des données AMPD...
          </p>
        </div>
      </div>
    );
  }

  // Si aucune chaîne n'est supportée après le chargement
  if (supportedChains.length === 0) {
    return (
      <div className={`bg-[#333333] p-4 rounded-lg shadow-md ${className}`}>
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-200">
              Votes AMPD
            </h3>
          </div>
        </div>
        <div className="flex justify-center items-center h-[200px]">
          <p className="text-gray-400">
            La surveillance AMPD n'est pas activée
          </p>
        </div>
      </div>
    );
  }

  // Filtrer les chaînes si une chaîne spécifique est passée en prop
  const chainsToDisplay = chain ? supportedChains.filter(c => c === chain) : supportedChains;

  return (
    <div className={`bg-[#333333] p-4 rounded-lg shadow-md flex flex-col h-full ${className}`}>
      <div className="mb-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-200">
            Votes AMPD
          </h3>
        </div>
      </div>
      
      <div className="overflow-y-auto flex-grow">
        {chainsToDisplay.map((chainName) => {
          const chainVotes = voteData[chainName] || [];
          // On prend tous les votes, y compris ceux marqués "unknown"
          const votesToDisplay = chainVotes.slice(0, displayLimit);

          return (
            <div key={chainName} className="mb-2">
              <div className="flex items-start">
                <div className="w-20 font-semibold text-white text-sm">
                  {chainName.toUpperCase()}:
                </div>
                <div className="grid grid-cols-35 gap-1 flex-1">
                  {votesToDisplay.length > 0 ? (
                    votesToDisplay.map((vote, index) => (
                      <div 
                        key={`${vote.pollId}-${index}`} 
                        className={`w-4 h-4 ${getStatusColor(vote.result)} hover:opacity-80 transition-opacity rounded-sm`}
                        title={`Poll ID: ${formatPollId(vote.pollId)} - ${getStatusTooltip(vote.result)}`}
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
            <span className="text-xs">Vote valide</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            <span className="text-xs">Vote invalide</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AmpdVoting; 