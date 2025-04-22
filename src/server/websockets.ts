import { Server, Socket } from 'socket.io';
import http from 'http';
import { ValidatorMetrics } from './metrics';
import { TendermintClient } from './tendermint';

// Exporter l'instance io pour pouvoir l'utiliser dans d'autres modules
export let io: Server;

/**
 * Configure le serveur WebSocket et les gestionnaires de connexion
 */
export const setupWebSockets = (
  server: http.Server,
  metrics: ValidatorMetrics,
  tendermintClient: TendermintClient,
  rpcEndpoint: string,
  validatorAddress: string,
  broadcasterAddress: string
): Server => {
  // Configurer Socket.io avec CORS
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Gestionnaire de connexion client
  io.on('connection', (socket: Socket) => {
    console.log('New web client connected:', socket.id);
    
    // Envoyer les métriques actuelles immédiatement au nouveau client
    socket.emit('metrics-update', metrics);
    if (metrics.evmVotesEnabled) {
      socket.emit('evm-votes-update', metrics.evmVotes);
    }
    
    // Envoyer les données AMPD si activées
    if (metrics.ampdEnabled) {
      // Envoyer la liste des chaînes supportées
      io.emit('ampd-chains', { chains: metrics.ampdSupportedChains });
      
      // Envoyer les données initiales pour chaque chaîne
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
    
    // Envoyer les informations de connexion
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
    
    // Gestionnaire de déconnexion
    socket.on('disconnect', () => {
      console.log('Web client disconnected:', socket.id);
    });
  });

  return io;
};

/**
 * Émet une mise à jour des métriques à tous les clients
 */
export const broadcastMetricsUpdate = (metrics: ValidatorMetrics): void => {
  if (io) {
    io.emit('metrics-update', metrics);
  }
}; 