import { StatusType } from './tendermint';
import { EvmVoteData } from './evm-vote-manager';
import { AmpdVoteData, AmpdSigningData } from './ampd-manager';
import { BLOCKS_HISTORY_SIZE } from '../constants';

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
  /** Current streak of missed blocks from the most recent block backward. */
  currentConsecutiveMissed: number;
  /** Maximum consecutive missed blocks in the signStatus window. */
  maxConsecutiveMissed: number;
  prevoteMissed: number;
  precommitMissed: number;
  connected: boolean;
  lastError: string;
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
  chainId: string,
  moniker: string
): ValidatorMetrics => {
  return {
    chainId,
    moniker,
    lastBlock: 0,
    lastBlockTime: new Date(),
    signStatus: Array(BLOCKS_HISTORY_SIZE).fill(-1), 
    totalMissed: 0,
    totalSigned: 0,
    totalProposed: 0,
    consecutiveMissed: 0,
    currentConsecutiveMissed: 0,
    maxConsecutiveMissed: 0,
    prevoteMissed: 0,
    precommitMissed: 0,
    connected: false,
    lastError: '',
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
  
  let runningStreak = 0;
  let maxConsecutiveMissed = 0;
  let currentConsecutiveMissed = 0;
  let currentStreakComputed = false;

  const isMissedStatus = (status: number): boolean =>
    status === StatusType.Missed ||
    status === StatusType.Precommit ||
    status === StatusType.Prevote;

  // Go through all blocks in history, ignore -1 values (no data yet)
  updatedMetrics.signStatus.forEach((status) => {
    if (status === -1) return;

    if (!currentStreakComputed) {
      if (isMissedStatus(status)) {
        currentConsecutiveMissed += 1;
      } else if (status === StatusType.Signed || status === StatusType.Proposed) {
        currentStreakComputed = true;
      }
    }
    
    switch (status) {
      case StatusType.Missed:
        updatedMetrics.totalMissed += 1;
        runningStreak += 1;
        break;
      case StatusType.Precommit:
        updatedMetrics.precommitMissed += 1;
        updatedMetrics.totalMissed += 1;
        runningStreak += 1;
        break;
      case StatusType.Prevote:
        updatedMetrics.prevoteMissed += 1;
        updatedMetrics.totalMissed += 1;
        runningStreak += 1;
        break;
      case StatusType.Signed:
        updatedMetrics.totalSigned += 1;
        runningStreak = 0;
        break;
      case StatusType.Proposed:
        updatedMetrics.totalProposed += 1;
        updatedMetrics.totalSigned += 1;
        runningStreak = 0;
        break;
    }
    
    maxConsecutiveMissed = Math.max(maxConsecutiveMissed, runningStreak);
  });
  
  updatedMetrics.currentConsecutiveMissed = currentConsecutiveMissed;
  updatedMetrics.maxConsecutiveMissed = maxConsecutiveMissed;
  updatedMetrics.consecutiveMissed = currentConsecutiveMissed;
  
  return updatedMetrics;
}; 