import { TendermintClient, StatusUpdate, StatusType } from './tendermint';
import { ValidatorMetrics, recalculateStats, recalculateHeartbeatStats } from './metrics';
import { HeartbeatUpdate, HeartbeatStatusType } from './heartbeat_manager';
import { io, broadcastMetricsUpdate } from './websockets';

// Interface for EVM event updates
interface EvmVoteUpdate {
  chain: string;
  pollIds?: any[];
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
  onPermanentDisconnect?: () => Promise<void>
): void => {
  // Block status update handler
  tendermintClient.on('status-update', (update: StatusUpdate) => {
    metrics.connected = true;
    
    if (update.final) {
      metrics.lastBlock = update.height;
      metrics.lastBlockTime = new Date();
      
      // Update signature status (shift and add new status)
      metrics.signStatus = [update.status, ...metrics.signStatus.slice(0, metrics.signStatus.length - 1)];
      
      // Recalculate all statistics based on complete history
      const updatedMetrics = recalculateStats(metrics);
      Object.assign(metrics, updatedMetrics);
      
      // Emit updated metrics to all connected clients
      broadcastMetricsUpdate(metrics);
      console.log(`Block ${update.height}: ${StatusType[update.status]}`);
    }
  });
  
  // Heartbeat update handler
  tendermintClient.on('heartbeat-update', (update: HeartbeatUpdate) => {
    metrics.heartbeatConnected = true;
    
    if (update.final) {
      metrics.lastHeartbeatPeriod = update.period;
      metrics.lastHeartbeatTime = new Date();
      
      // Update heartbeat status (shift and add new status)
      metrics.heartbeatStatus = [update.status, ...metrics.heartbeatStatus.slice(0, metrics.heartbeatStatus.length - 1)];
      
      // Recalculate all heartbeat statistics
      const updatedMetrics = recalculateHeartbeatStats(metrics);
      Object.assign(metrics, updatedMetrics);
      
      // Emit updated metrics to all connected clients
      broadcastMetricsUpdate(metrics);
      console.log(`HeartBeat period ${update.period} (${update.periodStart}-${update.periodEnd}): ${HeartbeatStatusType[update.status]}`);
    }
    
    // Update metrics object with heartbeat block heights
    metrics.heartbeatBlocks = tendermintClient.getHeartbeatBlocks();
  });
  
  // EVM vote update handler
  tendermintClient.on('vote-update', (update: EvmVoteUpdate) => {
    if (metrics.evmVotesEnabled) {
      // Update votes for the specific chain
      if (update.chain && update.pollIds) {
        // Update EVM vote data
        metrics.evmVotes = tendermintClient.getAllEvmVotes() || {};
        metrics.evmLastGlobalPollId = update.lastGlobalPollId || metrics.evmLastGlobalPollId;
        
        // Emit updated metrics to connected clients
        broadcastMetricsUpdate(metrics);
        io.emit('evm-votes-update', metrics.evmVotes);
        
        // Debug log
        console.log(`Updated EVM votes for ${update.chain}, last Poll ID: ${metrics.evmLastGlobalPollId}`);
      }
    }
  });
  
  // AMPD vote update handler
  tendermintClient.on('ampd-vote-update', (update: AmpdVoteUpdate) => {
    if (metrics.ampdEnabled && update.chain) {
      // Update complete data
      metrics.ampdVotes = tendermintClient.getAllAmpdVotes() || {};
      
      // Emit updated data to all connected clients
      io.emit('ampd-votes', { 
        chain: update.chain, 
        votes: tendermintClient.getAmpdChainVotes(update.chain) 
      });
      
      // Debug log
      console.log(`Updated AMPD votes for ${update.chain}, pollId: ${update.pollId}`);
    }
  });
  
  // AMPD signature update handler
  tendermintClient.on('ampd-signing-update', (update: AmpdSigningUpdate) => {
    if (metrics.ampdEnabled && update.chain) {
      // Update complete data
      metrics.ampdSignings = tendermintClient.getAllAmpdSignings() || {};
      
      // Emit updated data to all connected clients
      io.emit('ampd-signings', { 
        chain: update.chain, 
        signings: tendermintClient.getAmpdChainSignings(update.chain) 
      });
      
      // Debug log
      console.log(`Updated AMPD signatures for ${update.chain}, signingId: ${update.signingId}`);
    }
  });
  
  // Permanent disconnect handler
  tendermintClient.on('permanent-disconnect', async () => {
    metrics.connected = false;
    metrics.heartbeatConnected = false;
    metrics.lastError = "Unable to connect to RPC node after multiple attempts.";
    metrics.heartbeatLastError = "Unable to connect to WebSocket after multiple attempts.";
    broadcastMetricsUpdate(metrics);
    
    // If a reconnection function is provided, call it
    if (onPermanentDisconnect) {
      console.log("Node disconnected permanently. Attempting to reconnect...");
      await onPermanentDisconnect();
    }
  });
}; 