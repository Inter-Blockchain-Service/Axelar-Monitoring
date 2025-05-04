"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupEventHandlers = void 0;
const tendermint_1 = require("./tendermint");
const metrics_1 = require("./metrics");
const heartbeat_manager_1 = require("./heartbeat-manager");
const utils_1 = require("./utils");
/**
 * Sets up event handlers for the Tendermint client
 */
const setupEventHandlers = (tendermintClient, metrics, onPermanentDisconnect, broadcasters) => {
    // Block status update handler
    tendermintClient.on('status-update', (update) => {
        metrics.connected = true;
        if (update.final) {
            metrics.lastBlock = update.height;
            metrics.lastBlockTime = new Date();
            // Update signature status using the helper function
            metrics.signStatus = (0, utils_1.updateStatusArray)(metrics.signStatus, update.status);
            // Recalculate all statistics based on complete history
            const updatedMetrics = (0, metrics_1.recalculateStats)(metrics);
            Object.assign(metrics, updatedMetrics);
            // Broadcast and log
            (0, utils_1.updateAndBroadcastMetrics)(metrics, broadcasters, `Block ${update.height}: ${tendermint_1.StatusType[update.status]}`);
        }
    });
    // Heartbeat update handler
    tendermintClient.on('heartbeat-update', (update) => {
        metrics.heartbeatConnected = true;
        if (update.final) {
            metrics.lastHeartbeatPeriod = update.period;
            metrics.lastHeartbeatTime = new Date();
            // Update heartbeat status using the helper function
            metrics.heartbeatStatus = (0, utils_1.updateStatusArray)(metrics.heartbeatStatus, update.status);
            // Recalculate all heartbeat statistics
            const updatedMetrics = (0, metrics_1.recalculateHeartbeatStats)(metrics);
            Object.assign(metrics, updatedMetrics);
            // Broadcast and log
            (0, utils_1.updateAndBroadcastMetrics)(metrics, broadcasters, `HeartBeat period ${update.period} (${update.periodStart}-${update.periodEnd}): ${heartbeat_manager_1.HeartbeatStatusType[update.status]}`);
        }
        // Update metrics object with heartbeat block heights
        metrics.heartbeatBlocks = tendermintClient.getHeartbeatBlocks();
    });
    // EVM vote update handler
    tendermintClient.on('vote-update', (update) => {
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
    tendermintClient.on('ampd-vote-update', (update) => {
        if (metrics.ampdEnabled && update.chain) {
            // Update complete data
            metrics.ampdVotes = tendermintClient.getAllAmpdVotes() || {};
            // Broadcast updates
            if (broadcasters) {
                broadcasters.broadcastAmpdVotesUpdate(update.chain, tendermintClient.getAmpdChainVotes(update.chain));
            }
        }
    });
    // AMPD signature update handler
    tendermintClient.on('ampd-signing-update', (update) => {
        if (metrics.ampdEnabled && update.chain) {
            // Update complete data
            metrics.ampdSignings = tendermintClient.getAllAmpdSignings() || {};
            // Broadcast updates
            if (broadcasters) {
                broadcasters.broadcastAmpdSigningsUpdate(update.chain, tendermintClient.getAmpdChainSignings(update.chain));
            }
        }
    });
    // Permanent disconnect handler
    tendermintClient.on('permanent-disconnect', async () => {
        // Update connection status
        (0, utils_1.updateConnectionStatus)(metrics, false, "Unable to connect to RPC node after multiple attempts.", broadcasters);
        // If a reconnection function is provided, call it
        if (onPermanentDisconnect) {
            console.log("Node disconnected permanently. Attempting to reconnect...");
            await onPermanentDisconnect();
        }
    });
    // WebSocket disconnect handler
    tendermintClient.on('disconnect', () => {
        // Update connection status
        (0, utils_1.updateConnectionStatus)(metrics, false, "WebSocket connection lost. Attempting to reconnect...", broadcasters);
    });
};
exports.setupEventHandlers = setupEventHandlers;
