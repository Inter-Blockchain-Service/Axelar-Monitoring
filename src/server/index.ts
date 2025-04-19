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
  // Métriques AMPD
  ampdEnabled: boolean;
  ampdVotes: any;
  ampdSignings: any;
  ampdSupportedChains: string[];
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
  evmLastGlobalPollId: 0,
  // Initialisation des métriques AMPD
  ampdEnabled: false,
  ampdVotes: {},
  ampdSignings: {},
  ampdSupportedChains: []
};

// Créer et configurer le client Tendermint
const rpcEndpoint = process.env.RPC_ENDPOINT || DEFAULT_RPC_ENDPOINT;
const validatorAddress = process.env.VALIDATOR_ADDRESS || DEFAULT_VALIDATOR_ADDRESS;
const broadcasterAddress = process.env.BROADCASTER_ADDRESS || validatorAddress;
const axelarApiEndpoint = process.env.AXELAR_API_ENDPOINT || '';
const ampdAddress = process.env.AMPD_ADDRESS || broadcasterAddress;

if (!validatorAddress) {
  console.error("ERREUR: Adresse du validateur non spécifiée. Définissez VALIDATOR_ADDRESS dans les variables d'environnement.");
  process.exit(1);
}

// Récupérer les chaînes AMPD supportées depuis les variables d'environnement
const ampdSupportedChainsEnv = process.env.AMPD_SUPPORTED_CHAINS || '';
const ampdSupportedChains = ampdSupportedChainsEnv.split(',').filter(chain => chain.trim() !== '');

// Créer le client Tendermint qui gère maintenant à la fois les blocs/votes, les heartbeats, les votes EVM et AMPD
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

// Si le gestionnaire de votes EVM est activé, récupérer les votes initiaux
if (metrics.evmVotesEnabled) {
  console.log(`Surveillance des votes EVM activée avec API endpoint: ${axelarApiEndpoint}`);
  // Initialiser les votes EVM
  metrics.evmVotes = tendermintClient.getAllEvmVotes() || {};
}

// Vérifier si le gestionnaire AMPD est activé
metrics.ampdEnabled = tendermintClient.hasAmpdManager();

// Si le gestionnaire AMPD est activé, récupérer les données initiales
if (metrics.ampdEnabled) {
  console.log(`Surveillance AMPD activée pour les chaînes: ${ampdSupportedChains.join(', ')}`);
  // Initialiser les données AMPD
  metrics.ampdVotes = tendermintClient.getAllAmpdData() || {};
  metrics.ampdSignings = tendermintClient.getAllAmpdData() || {};
  metrics.ampdSupportedChains = tendermintClient.getAmpdSupportedChains() || [];
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

// Gérer les mises à jour des votes AMPD
tendermintClient.on('ampd-vote-update', (update: any) => {
  if (metrics.ampdEnabled && update.chain) {
    // Mise à jour des données complètes
    metrics.ampdVotes = tendermintClient.getAllAmpdData();
    
    // Émettre les données mises à jour aux clients connectés
    io.emit('ampd-votes-update', { chain: update.chain, votes: tendermintClient.getAmpdChainVotes(update.chain) });
    
    // Log pour debug
    console.log(`Mis à jour des votes AMPD pour ${update.chain}, pollId: ${update.pollId}`);
  }
});

// Gérer les mises à jour des signatures AMPD
tendermintClient.on('ampd-signing-update', (update: any) => {
  if (metrics.ampdEnabled && update.chain) {
    // Mise à jour des données complètes
    metrics.ampdSignings = tendermintClient.getAllAmpdData();
    
    // Émettre les données mises à jour aux clients connectés
    io.emit('ampd-signings-update', { chain: update.chain, signings: tendermintClient.getAmpdChainSignings(update.chain) });
    
    // Log pour debug
    console.log(`Mis à jour des signatures AMPD pour ${update.chain}, signingId: ${update.signingId}`);
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
  
  // Envoyer les données AMPD si activées
  if (metrics.ampdEnabled) {
    socket.emit('ampd-chains', { chains: metrics.ampdSupportedChains });
  }
  
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
  
  // Gestion des requêtes pour les données AMPD
  socket.on('get-ampd-chains', () => {
    if (metrics.ampdEnabled) {
      socket.emit('ampd-chains', { chains: metrics.ampdSupportedChains });
    }
  });
  
  socket.on('get-ampd-votes', (data) => {
    if (metrics.ampdEnabled && data.chain) {
      const votes = tendermintClient.getAmpdChainVotes(data.chain);
      if (votes) {
        socket.emit('ampd-votes', { chain: data.chain, votes });
      }
    }
  });
  
  socket.on('get-ampd-signings', (data) => {
    if (metrics.ampdEnabled && data.chain) {
      const signings = tendermintClient.getAmpdChainSignings(data.chain);
      if (signings) {
        socket.emit('ampd-signings', { chain: data.chain, signings });
      }
    }
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

// Routes pour l'API AMPD
app.get('/api/ampd/chains', (req, res) => {
  if (metrics.ampdEnabled) {
    res.json(metrics.ampdSupportedChains);
  } else {
    res.status(404).json({ error: "AMPD manager not enabled" });
  }
});

app.get('/api/ampd/votes/:chain', (req, res) => {
  if (metrics.ampdEnabled) {
    const chain = req.params.chain.toLowerCase();
    const votes = tendermintClient.getAmpdChainVotes(chain);
    if (votes) {
      res.json(votes);
    } else {
      res.status(404).json({ error: `No votes data for chain: ${chain}` });
    }
  } else {
    res.status(404).json({ error: "AMPD manager not enabled" });
  }
});

app.get('/api/ampd/signings/:chain', (req, res) => {
  if (metrics.ampdEnabled) {
    const chain = req.params.chain.toLowerCase();
    const signings = tendermintClient.getAmpdChainSignings(chain);
    if (signings) {
      res.json(signings);
    } else {
      res.status(404).json({ error: `No signings data for chain: ${chain}` });
    }
  } else {
    res.status(404).json({ error: "AMPD manager not enabled" });
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
  if (metrics.ampdEnabled) {
    console.log(`Surveillance AMPD activée pour les chaînes: ${metrics.ampdSupportedChains.join(', ')}`);
    console.log(`Adresse AMPD utilisée: ${tendermintClient.getAmpdAddress()}`);
  }
});

export default server; 