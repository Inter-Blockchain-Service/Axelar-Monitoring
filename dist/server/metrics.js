"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateHeartbeatStats = exports.recalculateStats = exports.createInitialMetrics = void 0;
const tendermint_1 = require("./tendermint");
const heartbeat_manager_1 = require("./heartbeat_manager");
const constants_1 = require("../constants");
// Create initial metrics with default values
const createInitialMetrics = (chainId = 'axelar', moniker = 'My Validator') => {
    return {
        chainId,
        moniker,
        lastBlock: 0,
        lastBlockTime: new Date(),
        signStatus: Array(constants_1.BLOCKS_HISTORY_SIZE).fill(-1), // History for the complete signature period
        totalMissed: 0,
        totalSigned: 0,
        totalProposed: 0,
        consecutiveMissed: 0,
        prevoteMissed: 0,
        precommitMissed: 0,
        connected: false,
        lastError: '',
        // Initialize heartbeat metrics
        heartbeatStatus: Array(constants_1.HEARTBEAT_HISTORY_SIZE).fill(-1),
        heartbeatBlocks: Array(constants_1.HEARTBEAT_HISTORY_SIZE).fill(undefined), // Adding block heights
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
exports.createInitialMetrics = createInitialMetrics;
// Calculate statistics based on block history
const recalculateStats = (metrics) => {
    const updatedMetrics = Object.assign({}, metrics);
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
        if (status === -1)
            return; // Ignore blocks without data
        switch (status) {
            case tendermint_1.StatusType.Missed:
                updatedMetrics.totalMissed += 1;
                consecutiveMissed += 1;
                break;
            case tendermint_1.StatusType.Precommit:
                updatedMetrics.precommitMissed += 1;
                updatedMetrics.totalMissed += 1;
                consecutiveMissed += 1;
                break;
            case tendermint_1.StatusType.Prevote:
                updatedMetrics.prevoteMissed += 1;
                updatedMetrics.totalMissed += 1;
                consecutiveMissed += 1;
                break;
            case tendermint_1.StatusType.Signed:
                updatedMetrics.totalSigned += 1;
                consecutiveMissed = 0;
                break;
            case tendermint_1.StatusType.Proposed:
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
exports.recalculateStats = recalculateStats;
// Calculate heartbeat statistics
const recalculateHeartbeatStats = (metrics) => {
    const updatedMetrics = Object.assign({}, metrics);
    // Reset statistics
    updatedMetrics.heartbeatsMissed = 0;
    updatedMetrics.heartbeatsSigned = 0;
    // Number of consecutive missed heartbeats
    let consecutiveMissed = 0;
    let maxConsecutiveMissed = 0;
    // Go through all heartbeats in history, ignore -1 values (no data yet)
    updatedMetrics.heartbeatStatus.forEach((status) => {
        if (status === -1)
            return; // Ignore periods without data
        switch (status) {
            case heartbeat_manager_1.HeartbeatStatusType.Missed:
                updatedMetrics.heartbeatsMissed += 1;
                consecutiveMissed += 1;
                break;
            case heartbeat_manager_1.HeartbeatStatusType.Signed:
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
exports.recalculateHeartbeatStats = recalculateHeartbeatStats;
