"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBroadcasters = exports.setupWebSockets = void 0;
const socket_io_1 = require("socket.io");
/**
 * Configure the WebSocket server and connection handlers
 */
const setupWebSockets = (server, metrics, tendermintClient, rpcEndpoint, validatorAddress, broadcasterAddress) => {
    // Configure Socket.io
    const io = new socket_io_1.Server(server);
    // Client connection handler
    io.on('connection', (socket) => {
        console.log('New web client connected:', socket.id);
        // Send current metrics immediately to the new client
        socket.emit('metrics-update', metrics);
        if (metrics.evmVotesEnabled) {
            socket.emit('evm-votes-update', metrics.evmVotes);
        }
        // Send AMPD data if enabled
        if (metrics.ampdEnabled) {
            // Send the list of supported chains
            io.emit('ampd-chains', { chains: metrics.ampdSupportedChains });
            // Send initial data for each chain
            metrics.ampdSupportedChains.forEach(chainName => {
                const votes = tendermintClient.getAmpdChainVotes(chainName);
                const signings = tendermintClient.getAmpdChainSignings(chainName);
                if (votes) {
                    io.emit('ampd-votes', { chain: chainName, votes });
                }
                if (signings) {
                    io.emit('ampd-signings', { chain: chainName, signings });
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
    return io;
};
exports.setupWebSockets = setupWebSockets;
/**
 * Creates functions to broadcast updates to clients
 */
const createBroadcasters = (io) => {
    return {
        /**
         * Broadcast metrics update to all clients
         */
        broadcastMetricsUpdate: (metrics) => {
            if (io) {
                io.emit('metrics-update', metrics);
            }
        },
        /**
         * Broadcast EVM votes update to all clients
         */
        broadcastEvmVotesUpdate: (votes) => {
            if (io) {
                io.emit('evm-votes-update', votes);
            }
        },
        /**
         * Broadcast AMPD votes update to all clients
         */
        broadcastAmpdVotesUpdate: (chain, votes) => {
            if (io) {
                io.emit('ampd-votes', { chain, votes });
            }
        },
        /**
         * Broadcast AMPD signings update to all clients
         */
        broadcastAmpdSigningsUpdate: (chain, signings) => {
            if (io) {
                io.emit('ampd-signings', { chain, signings });
            }
        }
    };
};
exports.createBroadcasters = createBroadcasters;
