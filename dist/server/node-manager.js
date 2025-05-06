"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkNodeStatus = checkNodeStatus;
exports.waitForNodeToBeSynced = waitForNodeToBeSynced;
exports.canAttemptReconnection = canAttemptReconnection;
exports.createReconnectionHandler = createReconnectionHandler;
exports.connectToNode = connectToNode;
const axios_1 = __importDefault(require("axios"));
const utils_1 = require("./utils");
// Variable globale pour suivre l'état de reconnexion
let isReconnectionInProgress = false;
let lastReconnectionAttempt = 0;
const RECONNECTION_COOLDOWN = 10000; // 10 secondes entre les tentatives de reconnexion
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
        const errorMessage = (0, utils_1.getErrorMessage)(error, 'Unknown error');
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
        // Log node status based on availability and sync state
        (0, utils_1.logNodeStatus)(status, attempts, elapsedMinutes, interval);
        if (status.available && status.synced) {
            return true;
        }
        // Wait for the specified interval
        await new Promise(resolve => setTimeout(resolve, interval));
    }
}
/**
 * Vérifie si une reconnexion peut être tentée en fonction du temps écoulé
 * depuis la dernière tentative et de l'état actuel
 */
function canAttemptReconnection() {
    const now = Date.now();
    // Si une reconnexion est déjà en cours, ne pas en démarrer une nouvelle
    if (isReconnectionInProgress) {
        return false;
    }
    // Vérifier si le délai de refroidissement est passé
    if (now - lastReconnectionAttempt < RECONNECTION_COOLDOWN) {
        return false;
    }
    return true;
}
/**
 * Creates a function to reconnect to the RPC node
 * @param tendermintClient Tendermint client
 * @param metrics Validator metrics
 * @param rpcEndpoint RPC node URL
 * @param broadcasters Optional broadcasters for WebSocket updates
 * @returns Reconnection function
 */
function createReconnectionHandler(tendermintClient, metrics, rpcEndpoint, broadcasters) {
    return async function reconnectToNode() {
        // Vérifier si on peut tenter une reconnexion
        if (!canAttemptReconnection()) {
            console.log("Reconnection already in progress or cooldown period not elapsed, skipping...");
            return;
        }
        // Marquer le début d'une tentative de reconnexion
        isReconnectionInProgress = true;
        lastReconnectionAttempt = Date.now();
        console.log("Attempting to reconnect to node...");
        // First, disconnect the existing client
        tendermintClient.disconnect();
        // Update metrics to reflect disconnected state
        (0, utils_1.updateConnectionStatus)(metrics, false, "Node disconnected. Attempting to reconnect...", broadcasters);
        try {
            // Wait for the node to be available and synced again
            console.log(`Checking if node ${rpcEndpoint} is available and synced...`);
            const isNodeReady = await waitForNodeToBeSynced(rpcEndpoint);
            if (isNodeReady) {
                // Connect the Tendermint client if the node is ready
                (0, utils_1.connectTendermintClient)(tendermintClient, 'Node is ready again. Reconnecting Tendermint client...');
            }
        }
        catch (error) {
            console.error('Error during node reconnection:', error);
            console.warn('Failed to reconnect. Will retry on next permanent disconnect event.');
        }
        finally {
            // Réinitialiser l'état de reconnexion une fois terminé
            isReconnectionInProgress = false;
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
            (0, utils_1.connectTendermintClient)(tendermintClient, 'Node is ready. Connecting Tendermint client...');
        }
        else {
            // This code should never be reached since the function waits indefinitely
            console.warn('WARNING: Node is not ready or synced. Starting anyway, but expect issues.');
            // Update metrics with error message
            (0, utils_1.updateConnectionStatus)(metrics, false, "Node is not available or not synced.");
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
