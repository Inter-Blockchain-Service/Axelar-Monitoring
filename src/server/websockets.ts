import { Server, Socket } from 'socket.io';
import http from 'http';
import { ValidatorMetrics } from './metrics';
import { TendermintClient } from './tendermint';

// Export the io instance to be used in other modules
export let io: Server;

/**
 * Configure the WebSocket server and connection handlers
 */
export const setupWebSockets = (
  server: http.Server,
  metrics: ValidatorMetrics,
  tendermintClient: TendermintClient,
  rpcEndpoint: string,
  validatorAddress: string,
  broadcasterAddress: string
): Server => {
  // Configure Socket.io with CORS
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Client connection handler
  io.on('connection', (socket: Socket) => {
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

/**
 * Broadcast metrics update to all clients
 */
export const broadcastMetricsUpdate = (metrics: ValidatorMetrics): void => {
  if (io) {
    io.emit('metrics-update', metrics);
  }
}; 