"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkNodeStatus = checkNodeStatus;
exports.waitForNodeToBeSynced = waitForNodeToBeSynced;
exports.createReconnectionHandler = createReconnectionHandler;
exports.connectToNode = connectToNode;
const axios_1 = __importDefault(require("axios"));
const websockets_1 = require("./websockets");
/**
 * Checks if the RPC node is available and synchronized
 * @param rpcEndpoint RPC node URL
 * @returns Promise with an object indicating if the node is available and synced
 */
async function checkNodeStatus(rpcEndpoint) {
    try {
        // Clean URL for HTTP request
        const endpoint = rpcEndpoint.replace(/\/websocket$/, '');
        const statusUrl = `${endpoint}/status`;
        console.log(`Checking node status at: ${statusUrl}`);
        const response = await axios_1.default.get(statusUrl);
        if (response.data && response.data.result) {
            const syncInfo = response.data.result.sync_info;
            const isSynced = syncInfo && syncInfo.catching_up === false;
            const blockHeight = syncInfo ? parseInt(syncInfo.latest_block_height) : undefined;
            return {
                available: true,
                synced: isSynced,
                blockHeight
            };
        }
        return { available: true, synced: false, error: 'Unexpected response format' };
    }
    catch (error) {
        console.error('Error checking node status:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { available: false, synced: false, error: errorMessage };
    }
}
/**
 * Waits for the node to be available and synchronized
 * @param rpcEndpoint RPC node URL
 * @param interval Interval between attempts (in ms)
 * @returns Promise that resolves when the node is ready
 */
async function waitForNodeToBeSynced(rpcEndpoint, interval = 10000) {
    let attempts = 0;
    const startTime = Date.now();
    // Infinite loop until the node is synchronized
    while (true) {
        attempts++;
        const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
        const status = await checkNodeStatus(rpcEndpoint);
        if (status.available && status.synced) {
            console.log(`Node is ready and synced at block height: ${status.blockHeight}`);
            return true;
        }
        if (status.available && !status.synced) {
            console.log(`Node is available but still syncing (attempt ${attempts}, waiting for ${elapsedMinutes} min). Waiting ${interval / 1000}s before retrying...`);
            if (status.blockHeight) {
                console.log(`Current block height: ${status.blockHeight}`);
            }
        }
        else {
            console.log(`Node is not available (attempt ${attempts}, waiting for ${elapsedMinutes} min). Waiting ${interval / 1000}s before retrying...`);
        }
        // Wait for the specified interval
        await new Promise(resolve => setTimeout(resolve, interval));
    }
}
/**
 * Creates a function to reconnect to the RPC node
 * @param tendermintClient Tendermint client
 * @param metrics Validator metrics
 * @param rpcEndpoint RPC node URL
 * @returns Reconnection function
 */
function createReconnectionHandler(tendermintClient, metrics, rpcEndpoint) {
    return async function reconnectToNode() {
        console.log("Attempting to reconnect to node...");
        // First, disconnect the existing client
        tendermintClient.disconnect();
        // Update metrics to reflect disconnected state
        metrics.connected = false;
        metrics.heartbeatConnected = false;
        metrics.lastError = "Node disconnected. Attempting to reconnect...";
        (0, websockets_1.broadcastMetricsUpdate)(metrics);
        try {
            // Wait for the node to be available and synced again
            console.log(`Checking if node ${rpcEndpoint} is available and synced...`);
            const isNodeReady = await waitForNodeToBeSynced(rpcEndpoint);
            if (isNodeReady) {
                // Connect the Tendermint client if the node is ready
                console.log('Node is ready again. Reconnecting Tendermint client...');
                tendermintClient.connect();
            }
        }
        catch (error) {
            console.error('Error during node reconnection:', error);
            console.warn('Failed to reconnect. Will retry on next permanent disconnect event.');
        }
    };
}
/**
 * Connects to the RPC node after checking its status
 * @param tendermintClient Tendermint client
 * @param metrics Validator metrics
 * @param rpcEndpoint RPC node URL
 */
async function connectToNode(tendermintClient, metrics, rpcEndpoint) {
    // Check RPC node status before connecting
    console.log(`Checking if node ${rpcEndpoint} is available and synced...`);
    try {
        const isNodeReady = await waitForNodeToBeSynced(rpcEndpoint);
        if (isNodeReady) {
            // Connect the Tendermint client if the node is ready
            console.log('Node is ready. Connecting Tendermint client...');
            tendermintClient.connect();
        }
        else {
            // This code should never be reached since the function waits indefinitely
            console.warn('WARNING: Node is not ready or synced. Starting anyway, but expect issues.');
            // Update metrics with error message
            metrics.connected = false;
            metrics.lastError = "Node is not available or not synced.";
            // Connect anyway to allow future attempts
            tendermintClient.connect();
        }
    }
    catch (error) {
        console.error('Error during node status check:', error);
        console.warn('Starting Tendermint client anyway...');
        tendermintClient.connect();
    }
}
