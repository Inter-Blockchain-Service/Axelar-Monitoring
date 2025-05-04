import { Server, Socket } from 'socket.io';
import http from 'http';
import { ValidatorMetrics } from './metrics';
import { TendermintClient } from './tendermint';
import { EvmVoteData } from './evm-vote-manager';
import { PollStatus as AmpdPollStatus, SigningStatus } from './ampd-manager';

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
  const io = new Server(server, {
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
 * Interface for broadcaster functions
 */
export interface Broadcasters {
  broadcastMetricsUpdate: (metrics: ValidatorMetrics) => void;
  broadcastEvmVotesUpdate: (votes: EvmVoteData) => void;
  broadcastAmpdVotesUpdate: (chain: string, votes: AmpdPollStatus[] | null) => void;
  broadcastAmpdSigningsUpdate: (chain: string, signings: SigningStatus[] | null) => void;
}

/**
 * Creates functions to broadcast updates to clients
 */
export const createBroadcasters = (io: Server): Broadcasters => {
  return {
    /**
     * Broadcast metrics update to all clients
     */
    broadcastMetricsUpdate: (metrics: ValidatorMetrics): void => {
      if (io) {
        io.emit('metrics-update', metrics);
      }
    },
    
    /**
     * Broadcast EVM votes update to all clients
     */
    broadcastEvmVotesUpdate: (votes: EvmVoteData): void => {
      if (io) {
        io.emit('evm-votes-update', votes);
      }
    },
    
    /**
     * Broadcast AMPD votes update to all clients
     */
    broadcastAmpdVotesUpdate: (chain: string, votes: AmpdPollStatus[] | null): void => {
      if (io) {
        io.emit('ampd-votes', { chain, votes });
      }
    },
    
    /**
     * Broadcast AMPD signings update to all clients
     */
    broadcastAmpdSigningsUpdate: (chain: string, signings: SigningStatus[] | null): void => {
      if (io) {
        io.emit('ampd-signings', { chain, signings });
      }
    }
  };
}; 