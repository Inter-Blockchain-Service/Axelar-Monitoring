"use client";

import React, { useState, useEffect } from 'react';
import { useMetrics } from '@/hooks/useMetrics';
import MetricCard from '@/components/MetricCard';
import ConnectionStatus from '@/components/ConnectionStatus';
import BlockStatus from '@/components/BlockStatus';
import ValidatorInfo from '@/components/ValidatorInfo';
import HeartBeatStatus from '@/components/HeartBeatStatus';
import { BLOCKS_HISTORY_SIZE, HEARTBEAT_PERIOD } from '@/constants';

// Période de signature d'Axelar
const SIGNING_PERIOD = 35000;

export default function Dashboard() {
  const { metrics, connectionInfo, isConnected } = useMetrics();
  const [formattedDate, setFormattedDate] = useState<string>('');
  const [formattedHeartbeatDate, setFormattedHeartbeatDate] = useState<string>('');
  const [isClient, setIsClient] = useState(false);
  
  // Détecter quand le composant est rendu côté client
  useEffect(() => {
    setIsClient(true);
  }, []);
  
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
    } catch (error) {
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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6" suppressHydrationWarning>
      <header className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Monitoring du Validateur {metrics.moniker}
          </h1>
          <ConnectionStatus isConnected={isConnected} />
        </div>
        <p className="text-gray-600 dark:text-gray-300">
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
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Statistiques de Signature</h2>
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
        
        {/* Statistiques des HeartBeats */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Statistiques des HeartBeats</h2>
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
        
        {/* Détails des Blocs Manqués */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Détails des Blocs Manqués</h2>
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
        
        {isClient && (
          <>
            {/* Affichage des statuts */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Visualisation des Statuts</h2>
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
            
            {/* Informations du validateur */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Informations du Validateur</h2>
              </div>
              <div className="grid grid-cols-1 gap-6">
                <ValidatorInfo 
                  connectionInfo={connectionInfo}
                  moniker={metrics.moniker}
                  chainId={metrics.chainId}
                />
              </div>
            </section>
            
            {/* Messages d'erreur */}
            {metrics.lastError && (
              <section className="mt-6">
                <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded">
                  <h3 className="text-lg font-medium text-red-800 dark:text-red-200">Dernier message d'erreur</h3>
                  <p className="mt-2 text-red-700 dark:text-red-300 whitespace-pre-line">{metrics.lastError}</p>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="mt-12 text-center text-gray-500 dark:text-gray-400 text-sm">
        <p>Actualisation automatique des données en temps réel</p>
        <p className="mt-1">Statistiques basées sur la période de signature de {BLOCKS_HISTORY_SIZE} blocs</p>
        <p className="mt-1">HeartBeats attendus tous les {HEARTBEAT_PERIOD} blocs</p>
        <p className="mt-1">Affichage visuel des 200 derniers heartbeats avec leurs hauteurs de bloc</p>
      </footer>
    </div>
  );
} 