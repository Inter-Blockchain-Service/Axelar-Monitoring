import { TendermintClient, StatusUpdate, StatusType } from './tendermint';
import { ValidatorMetrics, recalculateStats, recalculateHeartbeatStats } from './metrics';
import { HeartbeatUpdate, HeartbeatStatusType } from './heartbeat_manager';
import { io, broadcastMetricsUpdate } from './websockets';

// Interface pour les mises à jour d'événements EVM
interface EvmVoteUpdate {
  chain: string;
  pollIds?: any[];
  lastGlobalPollId?: number;
}

// Interface pour les mises à jour d'événements AMPD
interface AmpdVoteUpdate {
  chain: string;
  pollId: string;
  status: string;
}

interface AmpdSigningUpdate {
  chain: string;
  signingId: string;
  status: string;
}

/**
 * Configure les gestionnaires d'événements pour le client Tendermint
 */
export const setupEventHandlers = (
  tendermintClient: TendermintClient,
  metrics: ValidatorMetrics,
  onPermanentDisconnect?: () => Promise<void>
): void => {
  // Gestionnaire de mise à jour du statut de bloc
  tendermintClient.on('status-update', (update: StatusUpdate) => {
    metrics.connected = true;
    
    if (update.final) {
      metrics.lastBlock = update.height;
      metrics.lastBlockTime = new Date();
      
      // Mettre à jour le statut de signature (décaler et ajouter le nouveau statut)
      metrics.signStatus = [update.status, ...metrics.signStatus.slice(0, metrics.signStatus.length - 1)];
      
      // Recalculer toutes les statistiques basées sur l'historique complet
      const updatedMetrics = recalculateStats(metrics);
      Object.assign(metrics, updatedMetrics);
      
      // Émettre les métriques mises à jour à tous les clients connectés
      broadcastMetricsUpdate(metrics);
      console.log(`Block ${update.height}: ${StatusType[update.status]}`);
    }
  });
  
  // Gestionnaire de mise à jour des heartbeats
  tendermintClient.on('heartbeat-update', (update: HeartbeatUpdate) => {
    metrics.heartbeatConnected = true;
    
    if (update.final) {
      metrics.lastHeartbeatPeriod = update.period;
      metrics.lastHeartbeatTime = new Date();
      
      // Mettre à jour le statut du heartbeat (décaler et ajouter le nouveau statut)
      metrics.heartbeatStatus = [update.status, ...metrics.heartbeatStatus.slice(0, metrics.heartbeatStatus.length - 1)];
      
      // Recalculer toutes les statistiques des heartbeats
      const updatedMetrics = recalculateHeartbeatStats(metrics);
      Object.assign(metrics, updatedMetrics);
      
      // Émettre les métriques mises à jour à tous les clients connectés
      broadcastMetricsUpdate(metrics);
      console.log(`HeartBeat period ${update.period} (${update.periodStart}-${update.periodEnd}): ${HeartbeatStatusType[update.status]}`);
    }
    
    // Mettre à jour l'objet métriques avec les hauteurs de bloc des heartbeats
    metrics.heartbeatBlocks = tendermintClient.getHeartbeatBlocks();
  });
  
  // Gestionnaire de mise à jour des votes EVM
  tendermintClient.on('vote-update', (update: EvmVoteUpdate) => {
    if (metrics.evmVotesEnabled) {
      // Mettre à jour les votes pour la chaîne spécifique
      if (update.chain && update.pollIds) {
        // Mettre à jour les données de vote EVM
        metrics.evmVotes = tendermintClient.getAllEvmVotes() || {};
        metrics.evmLastGlobalPollId = update.lastGlobalPollId || metrics.evmLastGlobalPollId;
        
        // Émettre les métriques mises à jour aux clients connectés
        broadcastMetricsUpdate(metrics);
        io.emit('evm-votes-update', metrics.evmVotes);
        
        // Log de débogage
        console.log(`Updated EVM votes for ${update.chain}, last Poll ID: ${metrics.evmLastGlobalPollId}`);
      }
    }
  });
  
  // Gestionnaire de mise à jour des votes AMPD
  tendermintClient.on('ampd-vote-update', (update: AmpdVoteUpdate) => {
    if (metrics.ampdEnabled && update.chain) {
      // Mettre à jour les données complètes
      metrics.ampdVotes = tendermintClient.getAllAmpdVotes() || {};
      
      // Émettre les données mises à jour à tous les clients connectés
      io.emit('ampd-votes', { 
        chain: update.chain, 
        votes: tendermintClient.getAmpdChainVotes(update.chain) 
      });
      
      // Log de débogage
      console.log(`Updated AMPD votes for ${update.chain}, pollId: ${update.pollId}`);
    }
  });
  
  // Gestionnaire de mise à jour des signatures AMPD
  tendermintClient.on('ampd-signing-update', (update: AmpdSigningUpdate) => {
    if (metrics.ampdEnabled && update.chain) {
      // Mettre à jour les données complètes
      metrics.ampdSignings = tendermintClient.getAllAmpdSignings() || {};
      
      // Émettre les données mises à jour à tous les clients connectés
      io.emit('ampd-signings', { 
        chain: update.chain, 
        signings: tendermintClient.getAmpdChainSignings(update.chain) 
      });
      
      // Log de débogage
      console.log(`Updated AMPD signatures for ${update.chain}, signingId: ${update.signingId}`);
    }
  });
  
  // Gestionnaire de déconnexion permanente
  tendermintClient.on('permanent-disconnect', async () => {
    metrics.connected = false;
    metrics.heartbeatConnected = false;
    metrics.lastError = "Unable to connect to RPC node after multiple attempts.";
    metrics.heartbeatLastError = "Unable to connect to WebSocket after multiple attempts.";
    broadcastMetricsUpdate(metrics);
    
    // Si une fonction de reconnexion est fournie, l'appeler
    if (onPermanentDisconnect) {
      console.log("Node disconnected permanently. Attempting to reconnect...");
      await onPermanentDisconnect();
    }
  });
}; 