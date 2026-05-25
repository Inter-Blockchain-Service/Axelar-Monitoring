"use client";

import React, { useState, useEffect } from 'react';
import { useMetrics } from '@/hooks/useMetrics';
import MetricCard from '@/components/MetricCard';
import ConnectionStatus from '@/components/ConnectionStatus';
import BlockStatus from '@/components/BlockStatus';
import EvmVoteStatus from '@/components/EvmVoteStatus';
import AmpdVoting from '@/components/AmpdVoting';
import AmpdSigning from '@/components/AmpdSigning';


export default function Dashboard() {
  const { metrics, isConnected, socket } = useMetrics();
  const [formattedDate, setFormattedDate] = useState<string>('');
  const [isClient, setIsClient] = useState(false);
  
  // Detect when the component is rendered on client side
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Debug AMPD connections
  useEffect(() => {
    if (isClient) {
      console.log("AMPD Enabled:", metrics.ampdEnabled, "Socket:", socket ? "Connected" : "Not connected");
    }
  }, [metrics.ampdEnabled, socket, isClient]);
  
  // Update formatted date only on client side
  useEffect(() => {
    if (isClient) {
      setFormattedDate(formatDate(metrics.lastBlockTime));
    }
  }, [metrics.lastBlockTime, isClient]);
  
  // Format the date of the last block
  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleString();
    } catch {
      return '-';
    }
  };
  
  // Calculate signature rate (%)
  const signRate = metrics.totalSigned + metrics.totalMissed > 0
    ? ((metrics.totalSigned / (metrics.totalSigned + metrics.totalMissed)) * 100).toFixed(2)
    : '100.00';
  
  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-8" suppressHydrationWarning>
      <header className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              Axelar Monitoring  
            </h1>
            <p className="text-[#a0a0a0] text-sm">Real-time validator monitoring</p>
          </div>
          <ConnectionStatus isConnected={isConnected} />
        </div>
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-[#a0a0a0]">Validator:</span>
            <span className="text-white font-medium">{metrics.moniker}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#a0a0a0]">Chain:</span>
            <span className="text-white font-medium">{metrics.chainId}</span>
          </div>
        </div>
      </header>

      <main className="space-y-8">
        {/* Block information and main metrics */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <MetricCard 
              title="Last Block" 
              value={isClient ? metrics.lastBlock.toString() : '-'} 
              className="border-l-4 border-[#fbb800]"
            />
            <MetricCard 
              title="Block Time" 
              value={isClient ? formattedDate : '-'} 
              className="border-l-4 border-[#fbb800]"
            />
            <MetricCard 
              title="Node Status" 
              value={isClient ? (metrics.connected ? "Online" : "Offline") : '-'} 
              className={`border-l-4 ${metrics.connected ? 'border-[#10b981]' : 'border-[#ef4444]'}`}
            />
          </div>
        </section>
        
        {/* Signature Statistics */}
        <section>
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-bold text-white">Signature Statistics</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <MetricCard 
              title="Signed Blocks" 
              value={isClient ? metrics.totalSigned.toString() : '-'} 
              className="border-l-4 border-[#10b981]"
            />
            <MetricCard 
              title="Proposed Blocks" 
              value={isClient ? metrics.totalProposed.toString() : '-'} 
              className="border-l-4 border-[#fbb800]"
            />
            <MetricCard 
              title="Missed Blocks" 
              value={isClient ? metrics.totalMissed.toString() : '-'} 
              className="border-l-4 border-[#ef4444]"
            />
            <MetricCard 
              title="Signature Rate" 
              value={isClient ? `${signRate}%` : '-'} 
              className="border-l-4 border-[#fbb800]"
            />
          </div>
        </section>
        
        {/* Missed Blocks Details */}
        <section>
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-bold text-white">Missed Blocks Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard 
              title="Consecutive Missed" 
              value={isClient ? metrics.consecutiveMissed.toString() : '-'} 
              className="border-l-4 border-[#ef4444]"
            />
            <MetricCard 
              title="Missed Prevotes" 
              value={isClient ? metrics.prevoteMissed.toString() : '-'} 
              className="border-l-4 border-[#f59e0b]"
            />
            <MetricCard 
              title="Missed Precommits" 
              value={isClient ? metrics.precommitMissed.toString() : '-'} 
              className="border-l-4 border-[#fbb800]"
            />
          </div>
        </section>
        
        {isClient && (
          <>
            {/* Status visualization */}
            <section>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-bold text-white">Block Status Visualization</h2>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <BlockStatus 
                  statusList={metrics.signStatus} 
                  lastBlockHeight={metrics.lastBlock} 
                />
              </div>
            </section>
            
            {/* EVM and AMPD votes display */}
            <section>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-bold text-white">EVM and AMPD Votes</h2>
              </div>
              <div className="flex flex-col gap-6">
                {/* EVM Votes Section */}
                <EvmVoteStatus 
                  evmVotes={metrics.evmVotes}
                  enabled={metrics.evmVotesEnabled}
                  className="min-h-[400px]"
                  chainId={metrics.chainId}
                />
                
                {/* AMPD Votes Section */}
                <AmpdVoting socket={socket} className="min-h-[400px]" chainId={metrics.chainId} />
                
                {/* AMPD Signatures Section */}
                <AmpdSigning socket={socket} className="min-h-[400px]" chainId={metrics.chainId} />
              </div>
            </section>
            

          </>
        )}
      </main>

      <footer className="mt-12 text-center text-[#a0a0a0] text-sm">
        <p>© 2025 Inter Blockchain Services</p>
      </footer>
    </div>
  );
} 