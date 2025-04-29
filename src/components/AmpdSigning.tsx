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
  const [displayLimit] = useState(35); // Display a maximum number of signatures
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Set up Socket.io event listeners
    if (socket) {
      // Listener for supported chains
      socket.on('ampd-chains', (data) => {
        console.log("AMPD Chains received (signing):", data);
        setSupportedChains(data.chains || []);
        setIsLoading(false);
      });
      
      // Listener for signing data
      socket.on('ampd-signings', (data) => {
        if (data.chain && data.signings) {
          setSigningData(prevData => ({
            ...prevData,
            [data.chain]: data.signings
          }));
        }
      });
    }

    // Cleanup when component unmounts
    return () => {
      if (socket) {
        socket.off('ampd-chains');
        socket.off('ampd-signings');
      }
    };
  }, [socket]);

  // Function to get status color
  const getStatusColor = (status: string) => {
    if (status === 'signed') return 'bg-green-500'; // green - valid signature
    if (status === 'unsubmit') return 'bg-orange-500'; // orange - unsubmitted
    if (status === 'unknown') return 'bg-[#9e9e9e4d]'; // transparent gray - no data
    return 'bg-[#9e9e9e4d]'; // default transparent gray
  };

  // Function to get tooltip text
  const getStatusTooltip = (status: string) => {
    if (status === 'signed') return 'Valid signature';
    if (status === 'unsubmit') return 'Unsubmitted';
    if (status === 'unknown') return 'No data';
    return 'Unknown';
  };

  // Function to format signing ID
  const formatSigningId = (signingId: string): string => {
    if (signingId === 'unknown') return 'Unknown';
    return signingId.length > 20 ? `${signingId.substring(0, 8)}...${signingId.substring(signingId.length - 8)}` : signingId;
  };

  // If data is loading, show indicator
  if (isLoading) {
    return (
      <div className={`bg-[#333333] p-4 rounded-lg shadow-md ${className}`}>
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-200">
              AMPD Signatures
            </h3>
          </div>
        </div>
        <div className="flex justify-center items-center h-[200px]">
          <p className="text-gray-400">
            Loading AMPD data...
          </p>
        </div>
      </div>
    );
  }

  // If no chains are supported after loading
  if (supportedChains.length === 0) {
    return (
      <div className={`bg-[#333333] p-4 rounded-lg shadow-md ${className}`}>
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-200">
            Amplifier Signings
            </h3>
            <div className="text-sm text-gray-500">
              Last 35 signings are displayed (you can click on the chain to see last 200)
            </div>
          </div>
        </div>
        <div className="flex justify-center items-center h-[200px]">
          <p className="text-gray-400">
            AMPD monitoring is not enabled
          </p>
        </div>
      </div>
    );
  }

  // Filter chains if a specific chain is passed as prop
  const chainsToDisplay = chain ? supportedChains.filter(c => c === chain) : supportedChains;

  const handleChainClick = (chainName: string) => {
    setSelectedChain(chainName);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedChain(null);
  };

  return (
    <div className={`bg-[#333333] p-4 rounded-lg shadow-md flex flex-col h-full ${className}`}>
      <div className="mb-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-200">
            AMPD Signatures
          </h3>
        </div>
      </div>
      
      <div className="overflow-y-auto flex-grow">
        {chainsToDisplay.map((chainName) => {
          const chainSignings = signingData[chainName] || [];
          const signingsToDisplay = chainSignings.slice(0, displayLimit);

          return (
            <div key={chainName} className="mb-2">
              <div className="flex items-start">
                <div 
                  className="w-20 font-semibold text-white text-sm cursor-pointer hover:text-blue-400"
                  onClick={() => handleChainClick(chainName)}
                >
                  {chainName.toUpperCase()}:
                </div>
                <div className="grid grid-cols-35 gap-1 flex-1">
                  {signingsToDisplay.length > 0 ? (
                    signingsToDisplay.map((signing, index) => (
                      <a
                        href={`https://axelarscan.io/amplifier-proof/${signing.contractAddress}_${signing.signingId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        key={`${signing.signingId}-${index}`}
                        className={`w-4 h-4 ${getStatusColor(signing.result)} hover:opacity-80 transition-opacity rounded-sm block`}
                        title={`Session ID: ${formatSigningId(signing.signingId)} - ${getStatusTooltip(signing.result)}`}
                      />
                    ))
                  ) : (
                    <p className="text-gray-400 text-sm">
                      No signatures available
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
                Amplifier History Signings - {selectedChain.toUpperCase()}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-20 gap-1">
              {signingData[selectedChain]?.map((signing, index) => (
                <a
                  href={`https://axelarscan.io/amplifier-proof/${signing.contractAddress}_${signing.signingId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={`${signing.signingId}-${index}`}
                  className={`w-6 h-6 ${getStatusColor(signing.result)} hover:opacity-80 transition-opacity rounded-sm block`}
                  title={`Session ID: ${formatSigningId(signing.signingId)} - ${getStatusTooltip(signing.result)}`}
                />
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
                  <span className="text-xs">Valid signature</span>
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
            <span className="text-xs">Valid signature</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AmpdSigning; 