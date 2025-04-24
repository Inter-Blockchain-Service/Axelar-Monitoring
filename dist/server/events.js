"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupEventHandlers = void 0;
const tendermint_1 = require("./tendermint");
const metrics_1 = require("./metrics");
const heartbeat_manager_1 = require("./heartbeat_manager");
const websockets_1 = require("./websockets");
/**
 * Sets up event handlers for the Tendermint client
 */
const setupEventHandlers = (tendermintClient, metrics, onPermanentDisconnect) => {
    // Block status update handler
    tendermintClient.on('status-update', (update) => {
        metrics.connected = true;
        if (update.final) {
            metrics.lastBlock = update.height;
            metrics.lastBlockTime = new Date();
            // Update signature status (shift and add new status)
            metrics.signStatus = [update.status, ...metrics.signStatus.slice(0, metrics.signStatus.length - 1)];
            // Recalculate all statistics based on complete history
            const updatedMetrics = (0, metrics_1.recalculateStats)(metrics);
            Object.assign(metrics, updatedMetrics);
            // Emit updated metrics to all connected clients
            (0, websockets_1.broadcastMetricsUpdate)(metrics);
            console.log(`Block ${update.height}: ${tendermint_1.StatusType[update.status]}`);
        }
    });
    // Heartbeat update handler
    tendermintClient.on('heartbeat-update', (update) => {
        metrics.heartbeatConnected = true;
        if (update.final) {
            metrics.lastHeartbeatPeriod = update.period;
            metrics.lastHeartbeatTime = new Date();
            // Update heartbeat status (shift and add new status)
            metrics.heartbeatStatus = [update.status, ...metrics.heartbeatStatus.slice(0, metrics.heartbeatStatus.length - 1)];
            // Recalculate all heartbeat statistics
            const updatedMetrics = (0, metrics_1.recalculateHeartbeatStats)(metrics);
            Object.assign(metrics, updatedMetrics);
            // Emit updated metrics to all connected clients
            (0, websockets_1.broadcastMetricsUpdate)(metrics);
            console.log(`HeartBeat period ${update.period} (${update.periodStart}-${update.periodEnd}): ${heartbeat_manager_1.HeartbeatStatusType[update.status]}`);
        }
        // Update metrics object with heartbeat block heights
        metrics.heartbeatBlocks = tendermintClient.getHeartbeatBlocks();
    });
    // EVM vote update handler
    tendermintClient.on('vote-update', (update) => {
        if (metrics.evmVotesEnabled) {
            // Update votes for the specific chain
            if (update.chain && update.pollIds) {
                // Update EVM vote data
                metrics.evmVotes = tendermintClient.getAllEvmVotes() || {};
                metrics.evmLastGlobalPollId = update.lastGlobalPollId || metrics.evmLastGlobalPollId;
                // Emit updated metrics to connected clients
                (0, websockets_1.broadcastMetricsUpdate)(metrics);
                websockets_1.io.emit('evm-votes-update', metrics.evmVotes);
                // Debug log
                console.log(`Updated EVM votes for ${update.chain}, last Poll ID: ${metrics.evmLastGlobalPollId}`);
            }
        }
    });
    // AMPD vote update handler
    tendermintClient.on('ampd-vote-update', (update) => {
        if (metrics.ampdEnabled && update.chain) {
            // Update complete data
            metrics.ampdVotes = tendermintClient.getAllAmpdVotes() || {};
            // Emit updated data to all connected clients
            websockets_1.io.emit('ampd-votes', {
                chain: update.chain,
                votes: tendermintClient.getAmpdChainVotes(update.chain)
            });
            // Debug log
            console.log(`Updated AMPD votes for ${update.chain}, pollId: ${update.pollId}`);
        }
    });
    // AMPD signature update handler
    tendermintClient.on('ampd-signing-update', (update) => {
        if (metrics.ampdEnabled && update.chain) {
            // Update complete data
            metrics.ampdSignings = tendermintClient.getAllAmpdSignings() || {};
            // Emit updated data to all connected clients
            websockets_1.io.emit('ampd-signings', {
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
        (0, websockets_1.broadcastMetricsUpdate)(metrics);
        // If a reconnection function is provided, call it
        if (onPermanentDisconnect) {
            console.log("Node disconnected permanently. Attempting to reconnect...");
            await onPermanentDisconnect();
        }
    });
};
exports.setupEventHandlers = setupEventHandlers;
