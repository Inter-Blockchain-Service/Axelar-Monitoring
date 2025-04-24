"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastMetricsUpdate = exports.setupWebSockets = exports.io = void 0;
const socket_io_1 = require("socket.io");
/**
 * Configure the WebSocket server and connection handlers
 */
const setupWebSockets = (server, metrics, tendermintClient, rpcEndpoint, validatorAddress, broadcasterAddress) => {
    // Configure Socket.io with CORS
    exports.io = new socket_io_1.Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });
    // Client connection handler
    exports.io.on('connection', (socket) => {
        console.log('New web client connected:', socket.id);
        // Send current metrics immediately to the new client
        socket.emit('metrics-update', metrics);
        if (metrics.evmVotesEnabled) {
            socket.emit('evm-votes-update', metrics.evmVotes);
        }
        // Send AMPD data if enabled
        if (metrics.ampdEnabled) {
            // Send the list of supported chains
            exports.io.emit('ampd-chains', { chains: metrics.ampdSupportedChains });
            // Send initial data for each chain
            metrics.ampdSupportedChains.forEach(chainName => {
                const votes = tendermintClient.getAmpdChainVotes(chainName);
                const signings = tendermintClient.getAmpdChainSignings(chainName);
                if (votes) {
                    exports.io.emit('ampd-votes', { chain: chainName, votes });
                }
                if (signings) {
                    exports.io.emit('ampd-signings', { chain: chainName, signings });
                }
            });
        }
        // Send connection information
        socket.emit('connection-status', {
            connected: tendermintClient.isConnected(),
            heartbeatConnected: tendermintClient.isConnected(),
            endpoint: rpcEndpoint,
            validatorAddress,
            broadcasterAddress,
            evmVotesEnabled: metrics.evmVotesEnabled,
            ampdEnabled: metrics.ampdEnabled,
            ampdAddress: metrics.ampdEnabled ? tendermintClient.getAmpdAddress() : ''
        });
        // Disconnect handler
        socket.on('disconnect', () => {
            console.log('Web client disconnected:', socket.id);
        });
    });
    return exports.io;
};
exports.setupWebSockets = setupWebSockets;
/**
 * Broadcast metrics update to all clients
 */
const broadcastMetricsUpdate = (metrics) => {
    if (exports.io) {
        exports.io.emit('metrics-update', metrics);
    }
};
exports.broadcastMetricsUpdate = broadcastMetricsUpdate;
