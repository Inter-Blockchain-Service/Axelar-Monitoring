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
  
  // Détecter quand le composant est rendu côté client
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Débogage des connections AMPD
  useEffect(() => {
    if (isClient) {
      console.log("AMPD Enabled:", metrics.ampdEnabled, "Socket:", socket ? "Connected" : "Not connected");
    }
  }, [metrics.ampdEnabled, socket, isClient]);
  
  // Mise à jour de la date formatée côté client uniquement
  useEffect(() => {
    if (isClient) {
      setFormattedDate(formatDate(metrics.lastBlockTime));
      setFormattedHeartbeatDate(formatDate(metrics.lastHeartbeatTime));
    }
  }, [metrics.lastBlockTime, metrics.lastHeartbeatTime, isClient]);
  
  // Formater la date du dernier bloc
  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleString();
    } catch {
      return '-';
    }
  };
  
  // Calculer le taux de signature (%)
  const signRate = metrics.totalSigned + metrics.totalMissed > 0
    ? ((metrics.totalSigned / (metrics.totalSigned + metrics.totalMissed)) * 100).toFixed(2)
    : '100.00';
  
  // Calculer le taux de heartbeats (%)
  const heartbeatRate = metrics.heartbeatsSigned + metrics.heartbeatsMissed > 0
    ? ((metrics.heartbeatsSigned / (metrics.heartbeatsSigned + metrics.heartbeatsMissed)) * 100).toFixed(2)
    : '100.00';
  
  return (
    <div className="min-h-screen bg-background text-foreground p-6" suppressHydrationWarning>
      <header className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-foreground">
            Monitoring du Validateur {metrics.moniker}
          </h1>
          <ConnectionStatus isConnected={isConnected} />
        </div>
        <p className="text-foreground/70">
          Surveillance en temps réel du validateur via WebSocket
        </p>
      </header>

      <main className="space-y-8">
        {/* Informations du bloc et métriques principales */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <MetricCard 
              title="Dernier Bloc" 
              value={isClient ? metrics.lastBlock.toString() : '-'} 
              className="border-l-4 border-blue-500"
            />
            <MetricCard 
              title="Heure du Bloc" 
              value={isClient ? formattedDate : '-'} 
              className="border-l-4 border-blue-500"
            />
            <MetricCard 
              title="Statut du Nœud" 
              value={isClient ? (metrics.connected ? "En ligne" : "Hors ligne") : '-'} 
              className={`border-l-4 ${metrics.connected ? 'border-green-500' : 'border-red-500'}`}
            />
          </div>
        </section>
        
        {/* Statistiques de Signature */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-foreground">Statistiques de Signature</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <MetricCard 
              title="Blocs Signés" 
              value={isClient ? metrics.totalSigned.toString() : '-'} 
              className="border-l-4 border-green-500"
            />
            <MetricCard 
              title="Blocs Proposés" 
              value={isClient ? metrics.totalProposed.toString() : '-'} 
              className="border-l-4 border-purple-500"
            />
            <MetricCard 
              title="Blocs Manqués" 
              value={isClient ? metrics.totalMissed.toString() : '-'} 
              className="border-l-4 border-red-500"
            />
            <MetricCard 
              title="Taux de Signature" 
              value={isClient ? `${signRate}%` : '-'} 
              className="border-l-4 border-blue-500"
            />
          </div>
        </section>
        
        {/* Détails des Blocs Manqués */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-foreground">Détails des Blocs Manqués</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard 
              title="Manqués Consécutifs" 
              value={isClient ? metrics.consecutiveMissed.toString() : '-'} 
              className="border-l-4 border-red-500"
            />
            <MetricCard 
              title="Prevote Manqués" 
              value={isClient ? metrics.prevoteMissed.toString() : '-'} 
              className="border-l-4 border-orange-500"
            />
            <MetricCard 
              title="Precommit Manqués" 
              value={isClient ? metrics.precommitMissed.toString() : '-'} 
              className="border-l-4 border-yellow-500"
            />
          </div>
        </section>
        
        {/* Statistiques des HeartBeats */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-foreground">Statistiques des HeartBeats</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <MetricCard 
              title="HeartBeats Signés" 
              value={isClient ? metrics.heartbeatsSigned.toString() : '-'} 
              className="border-l-4 border-green-500"
            />
            <MetricCard 
              title="HeartBeats Manqués" 
              value={isClient ? metrics.heartbeatsMissed.toString() : '-'} 
              className="border-l-4 border-red-500"
            />
            <MetricCard 
              title="Taux de HeartBeats" 
              value={isClient ? `${heartbeatRate}%` : '-'} 
              className="border-l-4 border-blue-500"
            />
            <MetricCard 
              title="Dernier HeartBeat" 
              value={isClient ? formattedHeartbeatDate : '-'} 
              className="border-l-4 border-purple-500"
            />
          </div>
        </section>
        
        {isClient && (
          <>
            {/* Affichage des statuts */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-foreground">Visualisation des Statuts</h2>
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
            
            {/* Affichage des votes EVM et AMPD */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-foreground">Votes EVM et AMPD</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[500px]">
                {/* Colonne de gauche: Votes EVM */}
                <EvmVoteStatus 
                  evmVotes={metrics.evmVotes}
                  enabled={metrics.evmVotesEnabled}
                  lastGlobalPollId={metrics.evmLastGlobalPollId}
                  className="h-full"
                />
                
                {/* Colonne de droite: AMPD (Votes et Signatures empilés) */}
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