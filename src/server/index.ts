import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import { TendermintClient } from './tendermint';
import { createInitialMetrics } from './metrics';
import { setupApiRoutes } from './api';
import { setupWebSockets } from './websockets';
import { setupEventHandlers } from './events';
import { connectToNode, createReconnectionHandler } from './node-manager';
import { AlertManager } from './alert-manager';
import { BLOCKS_HISTORY_SIZE, HEARTBEAT_HISTORY_SIZE, HEARTBEAT_PERIOD } from '../constants';

// Charger les variables d'environnement
dotenv.config();

// Configuration par défaut
const DEFAULT_RPC_ENDPOINT = 'http://localhost:26657';
const DEFAULT_VALIDATOR_ADDRESS = '';

// Créer l'application Express
const app = express();
const server = http.createServer(app);

// Initialiser les métriques
const metrics = createInitialMetrics(
  process.env.CHAIN_ID || 'axelar',
  process.env.VALIDATOR_MONIKER || 'My Validator'
);

// Configurer le client Tendermint
const rpcEndpoint = process.env.RPC_ENDPOINT || DEFAULT_RPC_ENDPOINT;
const validatorAddress = process.env.VALIDATOR_ADDRESS || DEFAULT_VALIDATOR_ADDRESS;
const broadcasterAddress = process.env.BROADCASTER_ADDRESS || validatorAddress;
const axelarApiEndpoint = process.env.AXELAR_API_ENDPOINT || '';
const ampdAddress = process.env.AMPD_ADDRESS || broadcasterAddress;

if (!validatorAddress) {
  console.error("ERROR: Validator address not specified. Set VALIDATOR_ADDRESS in environment variables.");
  process.exit(1);
}

// Obtenir les chaînes AMPD supportées depuis les variables d'environnement
const ampdSupportedChainsEnv = process.env.AMPD_SUPPORTED_CHAINS || '';
const ampdSupportedChains = ampdSupportedChainsEnv.split(',').filter(chain => chain.trim() !== '');

// Créer le client Tendermint
const tendermintClient = new TendermintClient(
  rpcEndpoint,
  validatorAddress,
  broadcasterAddress,
  HEARTBEAT_HISTORY_SIZE,
  axelarApiEndpoint,
  ampdSupportedChains,
  ampdAddress
);

// Vérifier si le gestionnaire de votes EVM est activé
metrics.evmVotesEnabled = tendermintClient.hasEvmVoteManager();

// Si le gestionnaire de votes EVM est activé, obtenir les votes initiaux
if (metrics.evmVotesEnabled) {
  console.log(`EVM votes monitoring enabled with API endpoint: ${axelarApiEndpoint}`);
  // Initialiser les votes EVM
  metrics.evmVotes = tendermintClient.getAllEvmVotes() || {};
}

// Vérifier si le gestionnaire AMPD est activé
metrics.ampdEnabled = tendermintClient.hasAmpdManager();

// Si le gestionnaire AMPD est activé, obtenir les données initiales
if (metrics.ampdEnabled) {
  console.log(`AMPD monitoring enabled for chains: ${ampdSupportedChains.join(', ')}`);
  // Initialiser les données AMPD
  metrics.ampdVotes = tendermintClient.getAllAmpdVotes() || {};
  metrics.ampdSignings = tendermintClient.getAllAmpdSignings() || {};
  metrics.ampdSupportedChains = tendermintClient.getAmpdSupportedChains() || [];
}

// Initialiser le gestionnaire d'alertes
const alertManager = new AlertManager(metrics);

// Créer la fonction de reconnexion
const reconnectToNode = createReconnectionHandler(tendermintClient, metrics, rpcEndpoint);

// Configurer les WebSockets
setupWebSockets(server, metrics, tendermintClient, rpcEndpoint, validatorAddress, broadcasterAddress);

// Configurer les gestionnaires d'événements avec la fonction de reconnexion
setupEventHandlers(tendermintClient, metrics, reconnectToNode);

// Configurer les routes API
setupApiRoutes(app, metrics, tendermintClient);

// Ajouter des routes API pour les alertes
app.get('/api/alerts/status', (req, res) => {
  const status = {
    enabled: true,
    thresholds: {
      consecutiveBlocksMissed: parseInt(process.env.ALERT_CONSECUTIVE_BLOCKS_THRESHOLD || '3', 10),
      consecutiveHeartbeatsMissed: parseInt(process.env.ALERT_CONSECUTIVE_HEARTBEATS_THRESHOLD || '2', 10),
      signRateThreshold: parseFloat(process.env.ALERT_SIGN_RATE_THRESHOLD || '98.5'),
      heartbeatRateThreshold: parseFloat(process.env.ALERT_HEARTBEAT_RATE_THRESHOLD || '98.0')
    },
    notifications: {
      discord: process.env.DISCORD_ALERTS_ENABLED === 'true',
      telegram: process.env.TELEGRAM_ALERTS_ENABLED === 'true'
    }
  };
  res.json(status);
});

// Démarrer le serveur et connecter au nœud RPC
const PORT = process.env.PORT || 3001;
server.listen(Number(PORT), '0.0.0.0', async () => {
  console.log(`Server listening on address 0.0.0.0:${PORT}`);
  console.log(`Monitoring validator ${metrics.moniker} (${validatorAddress}) on ${rpcEndpoint}`);
  console.log(`Signature period set to ${BLOCKS_HISTORY_SIZE} blocks`);
  console.log(`Heartbeat monitoring set to ${HEARTBEAT_HISTORY_SIZE} periods (1 period = ${HEARTBEAT_PERIOD} blocks)`);
  
  if (metrics.evmVotesEnabled) {
    console.log(`EVM votes monitoring enabled with API endpoint: ${axelarApiEndpoint}`);
  }
  
  if (metrics.ampdEnabled) {
    console.log(`AMPD monitoring enabled for chains: ${metrics.ampdSupportedChains.join(', ')}`);
    console.log(`AMPD address used: ${tendermintClient.getAmpdAddress()}`);
  }
  
  // Démarrer la vérification périodique des alertes (chaque minute)
  alertManager.startPeriodicChecks(60000);
  console.log('Alert system started with periodic checks every minute');
  
  // Connecter au nœud RPC après vérification de son statut
  await connectToNode(tendermintClient, metrics, rpcEndpoint);
});

export default server; 