import React, { useEffect, useState, useRef } from 'react';
import { SigningStatus } from '../server/ampd-manager';
import { Socket } from 'socket.io-client';

interface AmpdSigningProps {
  socket: Socket | null;
  chain?: string;
  className?: string;
  chainId?: string;
}

const AmpdSigning: React.FC<AmpdSigningProps> = ({ socket, chain, className = '', chainId = '' }) => {
  const [signingData, setSigningData] = useState<Record<string, SigningStatus[]>>({});
  const [supportedChains, setSupportedChains] = useState<string[]>([]);
  const [displayLimit, setDisplayLimit] = useState(35);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Function to get URL based on chainId
  const getAxelarscanUrl = (): string => {
    if (chainId === 'axelar-dojo-1') {
      return 'https://axelarscan.io';
    } else if (chainId === 'axelar-testnet-lisbon-3') {
      return 'https://testnet.axelarscan.io';
    } else {
      // Default to mainnet URL
      return 'https://axelarscan.io';
    }
  };

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

  // Calculate dynamic display limit based on container width
  useEffect(() => {
    const calculateDisplayLimit = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        // Subtract label width (120px) and some padding
        const availableWidth = containerWidth - 140;
        // Each vote box is 16px wide + 4px gap = 20px
        const votesPerRow = Math.floor(availableWidth / 20);
        // Set a minimum of 20 and maximum of 100
        const newLimit = Math.max(20, Math.min(votesPerRow, 100));
        setDisplayLimit(newLimit);
      }
    };

    // Wait a bit for the DOM to be fully rendered
    const timer = setTimeout(calculateDisplayLimit, 100);

    const resizeObserver = new ResizeObserver(calculateDisplayLimit);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, [supportedChains]);

  // Function to get status color
  const getStatusColor = (status: string) => {
    if (status === 'signed') return 'bg-[#10b981]'; // green - valid signature
    if (status === 'unsubmit') return 'bg-[#f59e0b]'; // orange - unsubmitted
    if (status === 'unknown') return 'bg-[#2a2a2a]'; // dark gray - no data
    return 'bg-[#2a2a2a]'; // default dark gray
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

  const getSigningLink = (signing: SigningStatus): string => {
    const baseUrl = getAxelarscanUrl();
    if (signing.txHash) {
      return `${baseUrl}/tx/${signing.txHash}`;
    }
    return `${baseUrl}/amplifier-proof/${signing.contractAddress}_${signing.signingId}`;
  };

  const getSigningTooltip = (signing: SigningStatus): string => {
    const status = getStatusTooltip(signing.result);
    const lines = [`Session ID: ${formatSigningId(signing.signingId)}`, `Status: ${status}`];
    if (signing.txHash) {
      lines.push(`Sign tx: ${signing.txHash.substring(0, 12)}...`);
    }
    return lines.join(' - ');
  };

  // If data is loading, show indicator
  if (isLoading) {
    return (
      <div className={`bg-[#1a1a1a] p-5 rounded-lg border border-[#2a2a2a] ${className}`}>
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-semibold text-white">
              AMPD Signatures
            </h3>
          </div>
        </div>
        <div className="flex justify-center items-center h-[200px]">
          <p className="text-[#a0a0a0] text-sm">
            Loading AMPD data...
          </p>
        </div>
      </div>
    );
  }

  // If no chains are supported after loading
  if (supportedChains.length === 0) {
    return (
      <div className={`bg-[#1a1a1a] p-5 rounded-lg border border-[#2a2a2a] ${className}`}>
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-semibold text-white">
            Amplifier Signings
            </h3>
          </div>
        </div>
        <div className="flex justify-center items-center h-[200px]">
          <p className="text-[#a0a0a0] text-sm">
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
    <div className={`bg-[#1a1a1a] p-5 rounded-lg border border-[#2a2a2a] flex flex-col h-full ${className}`}>
      <div className="mb-4">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-semibold text-white">
            AMPD Signatures
          </h3>
          <div className="text-xs text-[#a0a0a0]">
            Last {displayLimit} signings (select a chain for history)
          </div>
        </div>
      </div>
      
      <div className="overflow-y-auto flex-grow" ref={containerRef}>
        {chainsToDisplay.map((chainName) => {
          const chainSignings = signingData[chainName] || [];
          const signingsToDisplay = chainSignings.slice(0, displayLimit);

          return (
            <div key={chainName} className="mb-2">
              <div className="flex items-start">
                <div 
                  className="w-20 font-medium text-white text-sm cursor-pointer hover:text-[#fbb800] transition-colors"
                  style={{ minWidth: '120px' }}
                  title={chainName.toUpperCase()}
                  onClick={() => handleChainClick(chainName)}
                >
                  {chainName.toUpperCase()}:
                </div>
                <div className="flex gap-1 flex-1 flex-wrap">
                  {signingsToDisplay.length > 0 ? (
                    signingsToDisplay.map((signing, index) => (
                      signing.result === 'unknown' ? (
                        <div
                          key={`${signing.signingId}-${index}`}
                          className={`w-4 h-4 ${getStatusColor(signing.result)} rounded-sm block`}
                          title={getSigningTooltip(signing)}
                        />
                      ) : (
                        <a
                          href={getSigningLink(signing)}
                          target="_blank"
                          rel="noopener noreferrer"
                          key={`${signing.signingId}-${index}`}
                          className={`w-4 h-4 ${getStatusColor(signing.result)} hover:opacity-80 transition-opacity rounded-sm block`}
                          title={getSigningTooltip(signing)}
                        />
                      )
                    ))
                  ) : (
                    <p className="text-[#a0a0a0] text-xs">
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
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-6 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold text-white">
                Amplifier History Signings - {selectedChain.toUpperCase()}
              </h3>
              <button
                onClick={closeModal}
                className="text-[#a0a0a0] hover:text-white transition-colors text-xl"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-20 gap-1">
              {signingData[selectedChain]?.map((signing, index) => (
                signing.result === 'unknown' ? (
                  <div
                    key={`${signing.signingId}-${index}`}
                    className={`w-6 h-6 ${getStatusColor(signing.result)} rounded-sm block`}
                    title={getSigningTooltip(signing)}
                  />
                ) : (
                  <a
                    href={getSigningLink(signing)}
                    target="_blank"
                    rel="noopener noreferrer"
                    key={`${signing.signingId}-${index}`}
                    className={`w-6 h-6 ${getStatusColor(signing.result)} hover:opacity-80 transition-opacity rounded-sm block`}
                    title={getSigningTooltip(signing)}
                  />
                )
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-[#f59e0b] rounded-sm"></div>
                  <span className="text-xs text-[#a0a0a0]">Unsubmitted</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-[#10b981] rounded-sm"></div>
                  <span className="text-xs text-[#a0a0a0]">Valid signature</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-auto pt-4 border-t border-[#2a2a2a]">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-[#f59e0b] rounded-sm"></div>
            <span className="text-xs text-[#a0a0a0]">Unsubmitted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-[#10b981] rounded-sm"></div>
            <span className="text-xs text-[#a0a0a0]">Valid signature</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AmpdSigning; 