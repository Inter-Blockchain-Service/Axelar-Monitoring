import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { TendermintClient, StatusType, StatusUpdate } from './tendermint';
import { HeartbeatStatusType, HeartbeatUpdate } from './heartbeat_manager';
import { VoteStatusType, PollStatus } from './evm-vote-manager';
import { BLOCKS_HISTORY_SIZE, HEARTBEAT_HISTORY_SIZE, HEARTBEAT_PERIOD } from '../constants';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Configuration par défaut
const DEFAULT_RPC_ENDPOINT = 'http://localhost:26657';
const DEFAULT_VALIDATOR_ADDRESS = '';

// Créer l'application Express
const app = express();
const server = http.createServer(app);

// Configurer Socket.io avec CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Interface pour les métriques du validateur
interface ValidatorMetrics {
  chainId: string;
  moniker: string;
  lastBlock: number;
  lastBlockTime: Date;
  signStatus: number[];
  totalMissed: number;
  totalSigned: number;
  totalProposed: number;
  consecutiveMissed: number;
  prevoteMissed: number;
  precommitMissed: number;
  connected: boolean;
  lastError: string;
  // Métriques de Heartbeat
  heartbeatStatus: number[];
  heartbeatBlocks: (number | undefined)[]; // Modifié pour accepter undefined
  heartbeatsMissed: number;
  heartbeatsSigned: number;
  heartbeatsConsecutiveMissed: number;
  lastHeartbeatPeriod: number;
  lastHeartbeatTime: Date | null;
  heartbeatConnected: boolean;
  heartbeatLastError: string;
  // Métriques EVM Votes
  evmVotesEnabled: boolean;
  evmVotes: any;
  evmLastGlobalPollId: number;
}

// Initialiser les métriques avec des valeurs par défaut
let metrics: ValidatorMetrics = {
  chainId: process.env.CHAIN_ID || 'axelar',
  moniker: process.env.VALIDATOR_MONIKER || 'Mon Validateur',
  lastBlock: 0,
  lastBlockTime: new Date(),
  signStatus: Array(BLOCKS_HISTORY_SIZE).fill(-1), // Historique pour la période de signature complète
  totalMissed: 0,
  totalSigned: 0,
  totalProposed: 0,
  consecutiveMissed: 0,
  prevoteMissed: 0,
  precommitMissed: 0,
  connected: false,
  lastError: '',
  // Initialisation des métriques heartbeats
  heartbeatStatus: Array(HEARTBEAT_HISTORY_SIZE).fill(-1),
  heartbeatBlocks: Array(HEARTBEAT_HISTORY_SIZE).fill(undefined), // Ajout des hauteurs de bloc
  heartbeatsMissed: 0,
  heartbeatsSigned: 0,
  heartbeatsConsecutiveMissed: 0,
  lastHeartbeatPeriod: 0,
  lastHeartbeatTime: null,
  heartbeatConnected: false,
  heartbeatLastError: '',
  // Initialisation des métriques EVM votes
  evmVotesEnabled: false,
  evmVotes: {},
  evmLastGlobalPollId: 0
};

// Créer et configurer le client Tendermint
const rpcEndpoint = process.env.RPC_ENDPOINT || DEFAULT_RPC_ENDPOINT;
const validatorAddress = process.env.VALIDATOR_ADDRESS || DEFAULT_VALIDATOR_ADDRESS;
const broadcasterAddress = process.env.BROADCASTER_ADDRESS || validatorAddress;
const axelarApiEndpoint = process.env.AXELAR_API_ENDPOINT || '';

if (!validatorAddress) {
  console.error("ERREUR: Adresse du validateur non spécifiée. Définissez VALIDATOR_ADDRESS dans les variables d'environnement.");
  process.exit(1);
}

// Créer le client Tendermint qui gère maintenant à la fois les blocs/votes, les heartbeats et les votes EVM
const tendermintClient = new TendermintClient(
  rpcEndpoint,
  validatorAddress,
  broadcasterAddress,
  HEARTBEAT_HISTORY_SIZE,
  axelarApiEndpoint
);

// Vérifier si le gestionnaire de votes EVM est activé
metrics.evmVotesEnabled = tendermintClient.hasEvmVoteManager();

// Si le gestionnaire de votes EVM est activé, récupérer les votes initiaux
if (metrics.evmVotesEnabled) {
  console.log(`Surveillance des votes EVM activée avec API endpoint: ${axelarApiEndpoint}`);
  // Initialiser les votes EVM
  metrics.evmVotes = tendermintClient.getAllEvmVotes() || {};
}

// Calculer les statistiques sur la base de l'historique des blocs
function recalculateStats() {
  // Réinitialiser les statistiques
  metrics.totalMissed = 0;
  metrics.totalSigned = 0;
  metrics.totalProposed = 0;
  metrics.prevoteMissed = 0;
  metrics.precommitMissed = 0;
  
  // Nombre de blocs manqués consécutifs
  let consecutiveMissed = 0;
  let maxConsecutiveMissed = 0;
  
  // Parcourir tous les blocs dans l'historique, ignorer les valeurs -1 (pas encore de données)
  metrics.signStatus.forEach((status) => {
    if (status === -1) return; // Ignorer les blocs sans données
    
    switch (status) {
      case StatusType.Missed:
        metrics.totalMissed += 1;
        consecutiveMissed += 1;
        break;
      case StatusType.Precommit:
        metrics.precommitMissed += 1;
        metrics.totalMissed += 1;
        consecutiveMissed += 1;
        break;
      case StatusType.Prevote:
        metrics.prevoteMissed += 1;
        metrics.totalMissed += 1;
        consecutiveMissed += 1;
        break;
      case StatusType.Signed:
        metrics.totalSigned += 1;
        consecutiveMissed = 0;
        break;
      case StatusType.Proposed:
        metrics.totalProposed += 1;
        metrics.totalSigned += 1;
        consecutiveMissed = 0;
        break;
    }
    
    // Mettre à jour le maximum de blocs manqués consécutifs
    maxConsecutiveMissed = Math.max(maxConsecutiveMissed, consecutiveMissed);
  });
  
  // Mettre à jour le nombre de blocs manqués consécutifs
  metrics.consecutiveMissed = maxConsecutiveMissed;
}

// Calculer les statistiques des heartbeats
function recalculateHeartbeatStats() {
  // Réinitialiser les statistiques
  metrics.heartbeatsMissed = 0;
  metrics.heartbeatsSigned = 0;
  
  // Nombre de heartbeats manqués consécutifs
  let consecutiveMissed = 0;
  let maxConsecutiveMissed = 0;
  
  // Parcourir tous les heartbeats dans l'historique, ignorer les valeurs -1 (pas encore de données)
  metrics.heartbeatStatus.forEach((status) => {
    if (status === -1) return; // Ignorer les périodes sans données
    
    switch (status) {
      case HeartbeatStatusType.Missed:
        metrics.heartbeatsMissed += 1;
        consecutiveMissed += 1;
        break;
      case HeartbeatStatusType.Signed:
        metrics.heartbeatsSigned += 1;
        consecutiveMissed = 0;
        break;
    }
    
    // Mettre à jour le maximum de heartbeats manqués consécutifs
    maxConsecutiveMissed = Math.max(maxConsecutiveMissed, consecutiveMissed);
  });
  
  // Mettre à jour le nombre de heartbeats manqués consécutifs
  metrics.heartbeatsConsecutiveMissed = maxConsecutiveMissed;
}

// Gérer les mises à jour d'état du validateur (blocs et votes uniquement)
tendermintClient.on('status-update', (update: StatusUpdate) => {
  metrics.connected = true;
  
  if (update.final) {
    metrics.lastBlock = update.height;
    metrics.lastBlockTime = new Date();
    
    // Mettre à jour l'état de signature (décaler et ajouter le nouvel état)
    metrics.signStatus = [update.status, ...metrics.signStatus.slice(0, BLOCKS_HISTORY_SIZE - 1)];
    
    // Recalculer toutes les statistiques sur la base de l'historique complet
    recalculateStats();
    
    // Émettre les métriques mises à jour à tous les clients connectés
    io.emit('metrics-update', metrics);
    console.log(`Bloc ${update.height} : ${StatusType[update.status]}`);
  }
});

// Gérer les mises à jour des heartbeats
tendermintClient.on('heartbeat-update', (update: HeartbeatUpdate) => {
  metrics.heartbeatConnected = true;
  
  if (update.final) {
    metrics.lastHeartbeatPeriod = update.period;
    metrics.lastHeartbeatTime = new Date();
    
    // Mettre à jour l'état des heartbeats (décaler et ajouter le nouvel état)
    metrics.heartbeatStatus = [update.status, ...metrics.heartbeatStatus.slice(0, HEARTBEAT_HISTORY_SIZE - 1)];
    
    // Recalculer toutes les statistiques des heartbeats
    recalculateHeartbeatStats();
    
    // Émettre les métriques mises à jour à tous les clients connectés
    io.emit('metrics-update', metrics);
    console.log(`Période HeartBeat ${update.period} (${update.periodStart}-${update.periodEnd}) : ${HeartbeatStatusType[update.status]}`);
  }
  
  // Mettre à jour l'objet metrics avec les hauteurs de bloc des heartbeats
  metrics.heartbeatBlocks = tendermintClient.getHeartbeatBlocks();
});

// Gérer les mises à jour des votes EVM
tendermintClient.on('vote-update', (update: any) => {
  if (metrics.evmVotesEnabled) {
    // Mettre à jour les votes pour la chaîne spécifique
    if (update.chain && update.pollIds) {
      // Mettre à jour les données des votes EVM
      metrics.evmVotes = tendermintClient.getAllEvmVotes();
      metrics.evmLastGlobalPollId = update.lastGlobalPollId || metrics.evmLastGlobalPollId;
      
      // Émettre les métriques mises à jour aux clients connectés
      io.emit('metrics-update', metrics);
      io.emit('evm-votes-update', metrics.evmVotes);
      
      // Log pour debug
      console.log(`Mis à jour des votes EVM pour ${update.chain}, dernier Poll ID: ${metrics.evmLastGlobalPollId}`);
    }
  }
});

// Gérer les déconnexions permanentes
tendermintClient.on('permanent-disconnect', () => {
  metrics.connected = false;
  metrics.heartbeatConnected = false;
  metrics.lastError = "Impossible de se connecter au nœud RPC après plusieurs tentatives.";
  metrics.heartbeatLastError = "Impossible de se connecter au WebSocket après plusieurs tentatives.";
  io.emit('metrics-update', metrics);
});

// Démarrer le client
tendermintClient.connect();

// Gérer les connexions socket
io.on('connection', (socket) => {
  console.log('Nouveau client web connecté:', socket.id);
  
  // Envoyer les métriques actuelles immédiatement au nouveau client
  socket.emit('metrics-update', metrics);
  if (metrics.evmVotesEnabled) {
    socket.emit('evm-votes-update', metrics.evmVotes);
  }
  
  socket.emit('connection-status', {
    connected: tendermintClient.isConnected(),
    heartbeatConnected: tendermintClient.isConnected(),
    endpoint: rpcEndpoint,
    validatorAddress,
    broadcasterAddress,
    evmVotesEnabled: metrics.evmVotesEnabled
  });
  
  socket.on('disconnect', () => {
    console.log('Client web déconnecté:', socket.id);
  });
});

// Route pour l'API
app.get('/api/metrics', (req, res) => {
  res.json(metrics);
});

// Route pour l'API des votes EVM
app.get('/api/evm-votes', (req, res) => {
  if (metrics.evmVotesEnabled) {
    res.json(metrics.evmVotes);
  } else {
    res.status(404).json({ error: "EVM votes manager not enabled" });
  }
});

// Route pour l'API des votes EVM pour une chaîne spécifique
app.get('/api/evm-votes/:chain', (req, res) => {
  if (metrics.evmVotesEnabled) {
    const chain = req.params.chain.toLowerCase();
    const votes = tendermintClient.getEvmChainVotes(chain);
    if (votes) {
      res.json(votes);
    } else {
      res.status(404).json({ error: `No votes data for chain: ${chain}` });
    }
  } else {
    res.status(404).json({ error: "EVM votes manager not enabled" });
  }
});

// Démarrer le serveur
const PORT = process.env.PORT || 3001;
server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Serveur en écoute sur l'adresse 0.0.0.0:${PORT}`);
  console.log(`Surveillance du validateur ${metrics.moniker} (${validatorAddress}) sur ${rpcEndpoint}`);
  console.log(`Période de signature définie à ${BLOCKS_HISTORY_SIZE} blocs`);
  console.log(`Surveillance des heartbeats définie sur ${HEARTBEAT_HISTORY_SIZE} périodes (1 période = ${HEARTBEAT_PERIOD} blocs)`);
  if (metrics.evmVotesEnabled) {
    console.log(`Surveillance des votes EVM activée avec API endpoint: ${axelarApiEndpoint}`);
  }
});

export default server; 