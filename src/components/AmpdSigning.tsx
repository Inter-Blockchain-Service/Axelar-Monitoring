import React, { useEffect, useState } from 'react';
import { SigningStatus } from '../server/ampd-manager';
import { Socket } from 'socket.io-client';

interface AmpdSigningProps {
  socket: Socket | null;
  chain?: string;
  className?: string;
}

const AmpdSigning: React.FC<AmpdSigningProps> = ({ socket, chain, className = '' }) => {
  const [signingData, setSigningData] = useState<Record<string, SigningStatus[]>>({});
  const [supportedChains, setSupportedChains] = useState<string[]>([]);
  const [displayLimit, setDisplayLimit] = useState(35); // Afficher un maximum de signatures

  useEffect(() => {
    // Configuration des écouteurs d'événements Socket.io
    if (socket) {
      // Écouteur pour les chaînes supportées
      socket.on('ampd-chains', (data) => {
        setSupportedChains(data.chains || []);
        
        // Si des chaînes sont disponibles, demander les données pour chacune
        if (data.chains && data.chains.length > 0) {
          data.chains.forEach((chainName: string) => {
            socket.emit('get-ampd-signings', { chain: chainName });
          });
        }
      });
      
      // Écouteur pour les données de signature
      socket.on('ampd-signings', (data) => {
        if (data.chain && data.signings) {
          setSigningData(prevData => ({
            ...prevData,
            [data.chain]: data.signings
          }));
        }
      });
      
      // Écouteur pour les mises à jour de signature
      socket.on('ampd-signings-update', (data) => {
        if (data.chain) {
          // Demander une mise à jour complète des données
          socket.emit('get-ampd-signings', { chain: data.chain });
        }
      });
      
      // Demander la liste des chaînes supportées
      socket.emit('get-ampd-chains');
    }

    // Nettoyage lors du démontage du composant
    return () => {
      if (socket) {
        socket.off('ampd-chains');
        socket.off('ampd-signings');
        socket.off('ampd-signings-update');
      }
    };
  }, [socket]);

  // Fonction pour obtenir la couleur du statut
  const getStatusColor = (status: string) => {
    if (status === 'signed') return 'bg-green-500'; // vert - signature valide
    if (status === 'unsubmit') return 'bg-orange-500'; // orange - non soumis
    if (status === 'unknown') return 'bg-[#9e9e9e4d]'; // gris transparent - pas de donnée
    return 'bg-[#9e9e9e4d]'; // gris transparent par défaut
  };

  // Fonction pour obtenir le texte du tooltip
  const getStatusTooltip = (status: string) => {
    if (status === 'signed') return 'Signature valide';
    if (status === 'unsubmit') return 'Non soumis';
    if (status === 'unknown') return 'Pas de donnée';
    return 'Inconnu';
  };

  // Fonction pour formater l'ID de signature
  const formatSigningId = (signingId: string): string => {
    if (signingId === 'unknown') return 'Inconnu';
    return signingId.length > 20 ? `${signingId.substring(0, 8)}...${signingId.substring(signingId.length - 8)}` : signingId;
  };

  // Si aucune chaîne n'est supportée
  if (supportedChains.length === 0) {
    return (
      <div className={`bg-[#333333] p-4 rounded-lg shadow-md ${className}`}>
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-200">
              Signatures AMPD
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
    <div className={`bg-[#333333] p-4 rounded-lg shadow-md ${className}`}>
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-200">
            Signatures AMPD
          </h3>
        </div>
      </div>
      
      <div className="overflow-y-auto max-h-[180px]">
        {chainsToDisplay.map((chainName) => {
          const chainSignings = signingData[chainName] || [];
          // On prend toutes les signatures, y compris celles marquées "unknown"
          const signingsToDisplay = chainSignings.slice(0, displayLimit);

          return (
            <div key={chainName} className="mb-2">
              <div className="flex items-start">
                <div className="w-20 font-semibold text-white text-sm">
                  {chainName.toUpperCase()}:
                </div>
                <div className="grid grid-cols-35 gap-1 flex-1">
                  {signingsToDisplay.length > 0 ? (
                    signingsToDisplay.map((signing, index) => (
                      <div 
                        key={`${signing.signingId}-${index}`} 
                        className={`w-4 h-4 ${getStatusColor(signing.result)} hover:opacity-80 transition-opacity rounded-sm`}
                        title={`Session ID: ${formatSigningId(signing.signingId)} - ${getStatusTooltip(signing.result)}`}
                      />
                    ))
                  ) : (
                    <p className="text-gray-400 text-sm">
                      Aucune signature disponible
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-start mt-4">
        <div className="grid grid-cols-3 gap-2">
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
            <span className="text-xs">Signature valide</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AmpdSigning; 