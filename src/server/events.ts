import { TendermintClient, StatusUpdate, StatusType } from './tendermint';
import { ValidatorMetrics, recalculateStats, recalculateHeartbeatStats } from './metrics';
import { HeartbeatUpdate, HeartbeatStatusType } from './heartbeat-manager';
import { Broadcasters } from './websockets-client';
import { PollStatus } from './ampd-manager';
import { updateConnectionStatus, updateAndBroadcastMetrics, updateStatusArray } from './utils';

// Interface for EVM event updates
interface EvmVoteUpdate {
  chain: string;
  pollIds?: PollStatus[];
  lastGlobalPollId?: number;
}

// Interface for AMPD event updates
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
 * Sets up event handlers for the Tendermint client
 */
export const setupEventHandlers = (
  tendermintClient: TendermintClient,
  metrics: ValidatorMetrics,
  onPermanentDisconnect?: () => Promise<void>,
  broadcasters?: Broadcasters
): void => {
  // Block status update handler
  tendermintClient.on('status-update', (update: StatusUpdate) => {
    metrics.connected = true;
    
    if (update.final) {
      metrics.lastBlock = update.height;
      metrics.lastBlockTime = new Date();
      
      // Update signature status using the helper function
      metrics.signStatus = updateStatusArray(metrics.signStatus, update.status);
      
      // Recalculate all statistics based on complete history
      const updatedMetrics = recalculateStats(metrics);
      Object.assign(metrics, updatedMetrics);
      
      // Broadcast and log
      updateAndBroadcastMetrics(
        metrics,
        broadcasters,
        `Block ${update.height}: ${StatusType[update.status]}`
      );
    }
  });
  
  // Heartbeat update handler
  tendermintClient.on('heartbeat-update', (update: HeartbeatUpdate) => {
    metrics.heartbeatConnected = true;
    
    if (update.final) {
      metrics.lastHeartbeatPeriod = update.period;
      metrics.lastHeartbeatTime = new Date();
      
      // Update heartbeat status using the helper function
      metrics.heartbeatStatus = updateStatusArray(metrics.heartbeatStatus, update.status);
      
      // Recalculate all heartbeat statistics
      const updatedMetrics = recalculateHeartbeatStats(metrics);
      Object.assign(metrics, updatedMetrics);
      
      // Broadcast and log
      updateAndBroadcastMetrics(
        metrics,
        broadcasters,
        `HeartBeat period ${update.period} (${update.periodStart}-${update.periodEnd}): ${HeartbeatStatusType[update.status]}`
      );
    }
    
    // Update metrics object with heartbeat block heights
    metrics.heartbeatBlocks = tendermintClient.getHeartbeatBlocks();
  });
  
  // EVM vote update handler
  tendermintClient.on('vote-update', (update: EvmVoteUpdate) => {
    if (metrics.evmVotesEnabled && update.chain && update.pollIds) {
      // Update EVM vote data
      metrics.evmVotes = tendermintClient.getAllEvmVotes() || {};
      metrics.evmLastGlobalPollId = update.lastGlobalPollId || metrics.evmLastGlobalPollId;
      
      // Broadcast updates
      if (broadcasters) {
        broadcasters.broadcastMetricsUpdate(metrics);
        broadcasters.broadcastEvmVotesUpdate(metrics.evmVotes);
      }
    }
  });
  
  // AMPD vote update handler
  tendermintClient.on('ampd-vote-update', (update: AmpdVoteUpdate) => {
    if (metrics.ampdEnabled && update.chain) {
      // Update complete data
      metrics.ampdVotes = tendermintClient.getAllAmpdVotes() || {};
      
      // Broadcast updates
      if (broadcasters) {
        broadcasters.broadcastAmpdVotesUpdate(
          update.chain, 
          tendermintClient.getAmpdChainVotes(update.chain)
        );
      }
    }
  });
  
  // AMPD signature update handler
  tendermintClient.on('ampd-signing-update', (update: AmpdSigningUpdate) => {
    if (metrics.ampdEnabled && update.chain) {
      // Update complete data
      metrics.ampdSignings = tendermintClient.getAllAmpdSignings() || {};
      
      // Broadcast updates
      if (broadcasters) {
        broadcasters.broadcastAmpdSigningsUpdate(
          update.chain, 
          tendermintClient.getAmpdChainSignings(update.chain)
        );
      }
    }
  });
  
  // Permanent disconnect handler
  tendermintClient.on('permanent-disconnect', async () => {
    // Update connection status
    updateConnectionStatus(
      metrics, 
      false, 
      "Unable to connect to RPC node after multiple attempts.",
      broadcasters
    );
    
    // If a reconnection function is provided, call it
    if (onPermanentDisconnect) {
      console.log("Node disconnected permanently. Attempting to reconnect...");
      await onPermanentDisconnect();
    }
  });

  // WebSocket disconnect handler
  tendermintClient.on('disconnect', () => {
    // Update connection status
    updateConnectionStatus(
      metrics, 
      false, 
      "WebSocket connection lost. Attempting to reconnect...",
      broadcasters
    );
  });
}; 