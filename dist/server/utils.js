"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getErrorMessage = exports.connectTendermintClient = exports.logNodeStatus = exports.updateStatusArray = exports.updateAndBroadcastMetrics = exports.updateConnectionStatus = void 0;
/**
 * Updates connection metrics and broadcasts if needed
 * @param metrics Validator metrics to update
 * @param connected Connection status
 * @param errorMessage Optional error message
 * @param broadcasters Optional broadcasters to send updates
 */
const updateConnectionStatus = (metrics, connected, errorMessage = '', broadcasters) => {
    metrics.connected = connected;
    metrics.heartbeatConnected = connected;
    if (errorMessage) {
        metrics.lastError = errorMessage;
        metrics.heartbeatLastError = errorMessage;
    }
    if (broadcasters) {
        broadcasters.broadcastMetricsUpdate(metrics);
    }
};
exports.updateConnectionStatus = updateConnectionStatus;
/**
 * Helper function to log and broadcast metrics changes
 * @param metrics Metrics to broadcast
 * @param broadcasters Broadcasters to use
 * @param logMessage Optional log message
 */
const updateAndBroadcastMetrics = (metrics, broadcasters, logMessage) => {
    if (broadcasters) {
        broadcasters.broadcastMetricsUpdate(metrics);
    }
    if (logMessage) {
        console.log(logMessage);
    }
};
exports.updateAndBroadcastMetrics = updateAndBroadcastMetrics;
/**
 * Helper function to update array status with shift pattern
 * @param statusArray Array to update
 * @param newStatus New status to insert at the beginning
 * @returns Updated array
 */
const updateStatusArray = (statusArray, newStatus) => {
    return [newStatus, ...statusArray.slice(0, statusArray.length - 1)];
};
exports.updateStatusArray = updateStatusArray;
/**
 * Helper to log node status
 * @param status Node status object
 * @param attempts Number of connection attempts
 * @param elapsedMinutes Minutes elapsed since first attempt
 * @param interval Retry interval in ms
 */
const logNodeStatus = (status, attempts, elapsedMinutes, interval) => {
    if (status.available && status.synced) {
        console.log(`Node is ready and synced at block height: ${status.blockHeight}`);
    }
    else if (status.available && !status.synced) {
        console.log(`Node is available but still syncing (attempt ${attempts}, waiting for ${elapsedMinutes} min). Waiting ${interval / 1000}s before retrying...`);
        if (status.blockHeight) {
            console.log(`Current block height: ${status.blockHeight}`);
        }
    }
    else {
        console.log(`Node is not available (attempt ${attempts}, waiting for ${elapsedMinutes} min). Waiting ${interval / 1000}s before retrying...`);
    }
};
exports.logNodeStatus = logNodeStatus;
/**
 * Helper to connect Tendermint client and log result
 * @param tendermintClient Client to connect
 * @param message Message to log
 */
const connectTendermintClient = (tendermintClient, message = 'Connecting Tendermint client...') => {
    console.log(message);
    tendermintClient.connect();
};
exports.connectTendermintClient = connectTendermintClient;
/**
 * Creates a safe error message from any error object
 * @param error Error object
 * @param defaultMessage Default message if error is not an Error instance
 * @returns Error message string
 */
const getErrorMessage = (error, defaultMessage = 'Unknown error') => {
    return error instanceof Error ? error.message : defaultMessage;
};
exports.getErrorMessage = getErrorMessage;
