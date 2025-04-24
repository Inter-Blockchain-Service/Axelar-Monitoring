"use client";

import React, { useState, useEffect } from 'react';
import { useMetrics } from '@/hooks/useMetrics';
import MetricCard from '@/components/MetricCard';
import ConnectionStatus from '@/components/ConnectionStatus';
import BlockStatus from '@/components/BlockStatus';
import HeartBeatStatus from '@/components/HeartBeatStatus';
import EvmVoteStatus from '@/components/EvmVoteStatus';
import AmpdVoting from '@/components/AmpdVoting';
import AmpdSigning from '@/components/AmpdSigning';


export default function Dashboard() {
  const { metrics, isConnected, socket } = useMetrics();
  const [formattedDate, setFormattedDate] = useState<string>('');
  const [formattedHeartbeatDate, setFormattedHeartbeatDate] = useState<string>('');
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
      setFormattedHeartbeatDate(formatDate(metrics.lastHeartbeatTime));
    }
  }, [metrics.lastBlockTime, metrics.lastHeartbeatTime, isClient]);
  
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
  
  // Calculate heartbeat rate (%)
  const heartbeatRate = metrics.heartbeatsSigned + metrics.heartbeatsMissed > 0
    ? ((metrics.heartbeatsSigned / (metrics.heartbeatsSigned + metrics.heartbeatsMissed)) * 100).toFixed(2)
    : '100.00';
  
  return (
    <div className="min-h-screen bg-background text-foreground p-6" suppressHydrationWarning>
      <header className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-foreground">
            Validator Monitoring {metrics.moniker}
          </h1>
          <ConnectionStatus isConnected={isConnected} />
        </div>
        <p className="text-foreground/70">
          Real-time validator monitoring via WebSocket
        </p>
      </header>

      <main className="space-y-8">
        {/* Block information and main metrics */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <MetricCard 
              title="Last Block" 
              value={isClient ? metrics.lastBlock.toString() : '-'} 
              className="border-l-4 border-blue-500"
            />
            <MetricCard 
              title="Block Time" 
              value={isClient ? formattedDate : '-'} 
              className="border-l-4 border-blue-500"
            />
            <MetricCard 
              title="Node Status" 
              value={isClient ? (metrics.connected ? "Online" : "Offline") : '-'} 
              className={`border-l-4 ${metrics.connected ? 'border-green-500' : 'border-red-500'}`}
            />
          </div>
        </section>
        
        {/* Signature Statistics */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-foreground">Signature Statistics</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <MetricCard 
              title="Signed Blocks" 
              value={isClient ? metrics.totalSigned.toString() : '-'} 
              className="border-l-4 border-green-500"
            />
            <MetricCard 
              title="Proposed Blocks" 
              value={isClient ? metrics.totalProposed.toString() : '-'} 
              className="border-l-4 border-purple-500"
            />
            <MetricCard 
              title="Missed Blocks" 
              value={isClient ? metrics.totalMissed.toString() : '-'} 
              className="border-l-4 border-red-500"
            />
            <MetricCard 
              title="Signature Rate" 
              value={isClient ? `${signRate}%` : '-'} 
              className="border-l-4 border-blue-500"
            />
          </div>
        </section>
        
        {/* Missed Blocks Details */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-foreground">Missed Blocks Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard 
              title="Consecutive Missed" 
              value={isClient ? metrics.consecutiveMissed.toString() : '-'} 
              className="border-l-4 border-red-500"
            />
            <MetricCard 
              title="Missed Prevotes" 
              value={isClient ? metrics.prevoteMissed.toString() : '-'} 
              className="border-l-4 border-orange-500"
            />
            <MetricCard 
              title="Missed Precommits" 
              value={isClient ? metrics.precommitMissed.toString() : '-'} 
              className="border-l-4 border-yellow-500"
            />
          </div>
        </section>
        
        {/* HeartBeats Statistics */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-foreground">HeartBeats Statistics</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <MetricCard 
              title="Signed HeartBeats" 
              value={isClient ? metrics.heartbeatsSigned.toString() : '-'} 
              className="border-l-4 border-green-500"
            />
            <MetricCard 
              title="Missed HeartBeats" 
              value={isClient ? metrics.heartbeatsMissed.toString() : '-'} 
              className="border-l-4 border-red-500"
            />
            <MetricCard 
              title="HeartBeats Rate" 
              value={isClient ? `${heartbeatRate}%` : '-'} 
              className="border-l-4 border-blue-500"
            />
            <MetricCard 
              title="Last HeartBeat" 
              value={isClient ? formattedHeartbeatDate : '-'} 
              className="border-l-4 border-purple-500"
            />
          </div>
        </section>
        
        {isClient && (
          <>
            {/* Status visualization */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-foreground">Status Visualization</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <BlockStatus 
                  statusList={metrics.signStatus} 
                  lastBlockHeight={metrics.lastBlock} 
                />
                <HeartBeatStatus 
                  statusList={metrics.heartbeatStatus} 
                  lastPeriod={metrics.lastHeartbeatPeriod} 
                  blocksList={metrics.heartbeatBlocks}
                />
              </div>
            </section>
            
            {/* EVM and AMPD votes display */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-foreground">EVM and AMPD Votes</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[500px]">
                {/* Left column: EVM Votes */}
                <EvmVoteStatus 
                  evmVotes={metrics.evmVotes}
                  enabled={metrics.evmVotesEnabled}
                  lastGlobalPollId={metrics.evmLastGlobalPollId}
                  className="h-full"
                />
                
                {/* Right column: AMPD (Votes and Signatures stacked) */}
                <div className="flex flex-col gap-4 h-full">
                  <div className="flex-1">
                    <AmpdVoting socket={socket} className="h-full" />
                  </div>
                  <div className="flex-1">
                    <AmpdSigning socket={socket} className="h-full" />
                  </div>
                </div>
              </div>
            </section>
            

          </>
        )}
      </main>

      <footer className="mt-12 text-center text-foreground/70">

      </footer>
    </div>
  );
} 