import { StatusType } from './tendermint';
import { HeartbeatStatusType } from './heartbeat_manager';
import { EvmVoteData, PollStatus as EvmPollStatus } from './evm-vote-manager';
import { AmpdVoteData, AmpdSigningData } from './ampd-manager';
import { BLOCKS_HISTORY_SIZE, HEARTBEAT_HISTORY_SIZE } from '../constants';

// Interface for validator metrics
export interface ValidatorMetrics {
  chainId: string;
  moniker: string;
  lastBlock: number;
  lastBlockTime: Date;
  signStatus: number[];
  totalMissed: number;
  totalSigned: number;
  totalProposed: number;
  consecutiveMissed: number;
  prevoteMissed: number;
  precommitMissed: number;
  connected: boolean;
  lastError: string;
  // Heartbeat metrics
  heartbeatStatus: number[];
  heartbeatBlocks: (number | undefined)[]; // Modified to accept undefined
  heartbeatsMissed: number;
  heartbeatsSigned: number;
  heartbeatsConsecutiveMissed: number;
  lastHeartbeatPeriod: number;
  lastHeartbeatTime: Date | null;
  heartbeatConnected: boolean;
  heartbeatLastError: string;
  // EVM Votes metrics
  evmVotesEnabled: boolean;
  evmVotes: EvmVoteData;
  evmLastGlobalPollId: number;
  // AMPD metrics
  ampdEnabled: boolean;
  ampdVotes: AmpdVoteData;
  ampdSignings: AmpdSigningData;
  ampdSupportedChains: string[];
}

// Create initial metrics with default values
export const createInitialMetrics = (
  chainId: string = 'axelar',
  moniker: string = 'My Validator'
): ValidatorMetrics => {
  return {
    chainId,
    moniker,
    lastBlock: 0,
    lastBlockTime: new Date(),
    signStatus: Array(BLOCKS_HISTORY_SIZE).fill(-1), // History for the complete signature period
    totalMissed: 0,
    totalSigned: 0,
    totalProposed: 0,
    consecutiveMissed: 0,
    prevoteMissed: 0,
    precommitMissed: 0,
    connected: false,
    lastError: '',
    // Initialize heartbeat metrics
    heartbeatStatus: Array(HEARTBEAT_HISTORY_SIZE).fill(-1),
    heartbeatBlocks: Array(HEARTBEAT_HISTORY_SIZE).fill(undefined), // Adding block heights
    heartbeatsMissed: 0,
    heartbeatsSigned: 0,
    heartbeatsConsecutiveMissed: 0,
    lastHeartbeatPeriod: 0,
    lastHeartbeatTime: null,
    heartbeatConnected: false,
    heartbeatLastError: '',
    // Initialize EVM votes metrics
    evmVotesEnabled: false,
    evmVotes: {},
    evmLastGlobalPollId: 0,
    // Initialize AMPD metrics
    ampdEnabled: false,
    ampdVotes: {},
    ampdSignings: {},
    ampdSupportedChains: []
  };
};

// Calculate statistics based on block history
export const recalculateStats = (metrics: ValidatorMetrics): ValidatorMetrics => {
  const updatedMetrics = { ...metrics };
  
  // Reset statistics
  updatedMetrics.totalMissed = 0;
  updatedMetrics.totalSigned = 0;
  updatedMetrics.totalProposed = 0;
  updatedMetrics.prevoteMissed = 0;
  updatedMetrics.precommitMissed = 0;
  
  // Number of consecutive missed blocks
  let consecutiveMissed = 0;
  let maxConsecutiveMissed = 0;
  
  // Go through all blocks in history, ignore -1 values (no data yet)
  updatedMetrics.signStatus.forEach((status) => {
    if (status === -1) return; // Ignore blocks without data
    
    switch (status) {
      case StatusType.Missed:
        updatedMetrics.totalMissed += 1;
        consecutiveMissed += 1;
        break;
      case StatusType.Precommit:
        updatedMetrics.precommitMissed += 1;
        updatedMetrics.totalMissed += 1;
        consecutiveMissed += 1;
        break;
      case StatusType.Prevote:
        updatedMetrics.prevoteMissed += 1;
        updatedMetrics.totalMissed += 1;
        consecutiveMissed += 1;
        break;
      case StatusType.Signed:
        updatedMetrics.totalSigned += 1;
        consecutiveMissed = 0;
        break;
      case StatusType.Proposed:
        updatedMetrics.totalProposed += 1;
        updatedMetrics.totalSigned += 1;
        consecutiveMissed = 0;
        break;
    }
    
    // Update maximum consecutive missed blocks
    maxConsecutiveMissed = Math.max(maxConsecutiveMissed, consecutiveMissed);
  });
  
  // Update number of consecutive missed blocks
  updatedMetrics.consecutiveMissed = maxConsecutiveMissed;
  
  return updatedMetrics;
};

// Calculate heartbeat statistics
export const recalculateHeartbeatStats = (metrics: ValidatorMetrics): ValidatorMetrics => {
  const updatedMetrics = { ...metrics };
  
  // Reset statistics
  updatedMetrics.heartbeatsMissed = 0;
  updatedMetrics.heartbeatsSigned = 0;
  
  // Number of consecutive missed heartbeats
  let consecutiveMissed = 0;
  let maxConsecutiveMissed = 0;
  
  // Go through all heartbeats in history, ignore -1 values (no data yet)
  updatedMetrics.heartbeatStatus.forEach((status) => {
    if (status === -1) return; // Ignore periods without data
    
    switch (status) {
      case HeartbeatStatusType.Missed:
        updatedMetrics.heartbeatsMissed += 1;
        consecutiveMissed += 1;
        break;
      case HeartbeatStatusType.Signed:
        updatedMetrics.heartbeatsSigned += 1;
        consecutiveMissed = 0;
        break;
    }
    
    // Update maximum consecutive missed heartbeats
    maxConsecutiveMissed = Math.max(maxConsecutiveMissed, consecutiveMissed);
  });
  
  // Update number of consecutive missed heartbeats
  updatedMetrics.heartbeatsConsecutiveMissed = maxConsecutiveMissed;
  
  return updatedMetrics;
}; 