import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { TendermintClient, StatusType, StatusUpdate } from './tendermint';
import { HeartbeatStatusType, HeartbeatUpdate } from './heartbeat_manager';
import { BLOCKS_HISTORY_SIZE, HEARTBEAT_HISTORY_SIZE, HEARTBEAT_PERIOD } from '../constants';
import dotenv from 'dotenv';
import { AmpdVoteData, AmpdSigningData } from './ampd-manager';
import { EvmVoteData, PollStatus as EvmPollStatus } from './evm-vote-manager';

// Load environment variables
dotenv.config();

// Default configuration
const DEFAULT_RPC_ENDPOINT = 'http://localhost:26657';
const DEFAULT_VALIDATOR_ADDRESS = '';

// Create Express application
const app = express();
const server = http.createServer(app);

// Configure Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Interface for validator metrics
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
  // Heartbeat metrics
  heartbeatStatus: number[];
  heartbeatBlocks: (number | undefined)[]; // Modified to accept undefined
  heartbeatsMissed: number;
  heartbeatsSigned: number;
  heartbeatsConsecutiveMissed: number;
  lastHeartbeatPeriod: number;
  lastHeartbeatTime: Date | null;
  heartbeatConnected: boolean;
  heartbeatLastError: string;
  // EVM Votes metrics
  evmVotesEnabled: boolean;
  evmVotes: EvmVoteData;
  evmLastGlobalPollId: number;
  // AMPD metrics
  ampdEnabled: boolean;
  ampdVotes: AmpdVoteData;
  ampdSignings: AmpdSigningData;
  ampdSupportedChains: string[];
}

// Initialize metrics with default values
let metrics: ValidatorMetrics = {
  chainId: process.env.CHAIN_ID || 'axelar',
  moniker: process.env.VALIDATOR_MONIKER || 'My Validator',
  lastBlock: 0,
  lastBlockTime: new Date(),
  signStatus: Array(BLOCKS_HISTORY_SIZE).fill(-1), // History for the complete signature period
  totalMissed: 0,
  totalSigned: 0,
  totalProposed: 0,
  consecutiveMissed: 0,
  prevoteMissed: 0,
  precommitMissed: 0,
  connected: false,
  lastError: '',
  // Initialize heartbeat metrics
  heartbeatStatus: Array(HEARTBEAT_HISTORY_SIZE).fill(-1),
  heartbeatBlocks: Array(HEARTBEAT_HISTORY_SIZE).fill(undefined), // Adding block heights
  heartbeatsMissed: 0,
  heartbeatsSigned: 0,
  heartbeatsConsecutiveMissed: 0,
  lastHeartbeatPeriod: 0,
  lastHeartbeatTime: null,
  heartbeatConnected: false,
  heartbeatLastError: '',
  // Initialize EVM votes metrics
  evmVotesEnabled: false,
  evmVotes: {},
  evmLastGlobalPollId: 0,
  // Initialize AMPD metrics
  ampdEnabled: false,
  ampdVotes: {},
  ampdSignings: {},
  ampdSupportedChains: []
};

// Create and configure the Tendermint client
const rpcEndpoint = process.env.RPC_ENDPOINT || DEFAULT_RPC_ENDPOINT;
const validatorAddress = process.env.VALIDATOR_ADDRESS || DEFAULT_VALIDATOR_ADDRESS;
const broadcasterAddress = process.env.BROADCASTER_ADDRESS || validatorAddress;
const axelarApiEndpoint = process.env.AXELAR_API_ENDPOINT || '';
const ampdAddress = process.env.AMPD_ADDRESS || broadcasterAddress;

if (!validatorAddress) {
  console.error("ERROR: Validator address not specified. Set VALIDATOR_ADDRESS in environment variables.");
  process.exit(1);
}

// Get supported AMPD chains from environment variables
const ampdSupportedChainsEnv = process.env.AMPD_SUPPORTED_CHAINS || '';
const ampdSupportedChains = ampdSupportedChainsEnv.split(',').filter(chain => chain.trim() !== '');

// Create Tendermint client that now manages blocks/votes, heartbeats, EVM votes and AMPD
const tendermintClient = new TendermintClient(
  rpcEndpoint,
  validatorAddress,
  broadcasterAddress,
  HEARTBEAT_HISTORY_SIZE,
  axelarApiEndpoint,
  ampdSupportedChains,
  ampdAddress
);

// Check if EVM vote manager is enabled
metrics.evmVotesEnabled = tendermintClient.hasEvmVoteManager();

// If EVM vote manager is enabled, get initial votes
if (metrics.evmVotesEnabled) {
  console.log(`EVM votes monitoring enabled with API endpoint: ${axelarApiEndpoint}`);
  // Initialize EVM votes
  metrics.evmVotes = tendermintClient.getAllEvmVotes() || {};
}

// Check if AMPD manager is enabled
metrics.ampdEnabled = tendermintClient.hasAmpdManager();

// If AMPD manager is enabled, get initial data
if (metrics.ampdEnabled) {
  console.log(`AMPD monitoring enabled for chains: ${ampdSupportedChains.join(', ')}`);
  // Initialize AMPD data
  metrics.ampdVotes = tendermintClient.getAllAmpdVotes() || {};
  metrics.ampdSignings = tendermintClient.getAllAmpdSignings() || {};
  metrics.ampdSupportedChains = tendermintClient.getAmpdSupportedChains() || [];
}

// Calculate statistics based on block history
function recalculateStats() {
  // Reset statistics
  metrics.totalMissed = 0;
  metrics.totalSigned = 0;
  metrics.totalProposed = 0;
  metrics.prevoteMissed = 0;
  metrics.precommitMissed = 0;
  
  // Number of consecutive missed blocks
  let consecutiveMissed = 0;
  let maxConsecutiveMissed = 0;
  
  // Go through all blocks in history, ignore -1 values (no data yet)
  metrics.signStatus.forEach((status) => {
    if (status === -1) return; // Ignore blocks without data
    
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
    
    // Update maximum consecutive missed blocks
    maxConsecutiveMissed = Math.max(maxConsecutiveMissed, consecutiveMissed);
  });
  
  // Update number of consecutive missed blocks
  metrics.consecutiveMissed = maxConsecutiveMissed;
}

// Calculate heartbeat statistics
function recalculateHeartbeatStats() {
  // Reset statistics
  metrics.heartbeatsMissed = 0;
  metrics.heartbeatsSigned = 0;
  
  // Number of consecutive missed heartbeats
  let consecutiveMissed = 0;
  let maxConsecutiveMissed = 0;
  
  // Go through all heartbeats in history, ignore -1 values (no data yet)
  metrics.heartbeatStatus.forEach((status) => {
    if (status === -1) return; // Ignore periods without data
    
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
    
    // Update maximum consecutive missed heartbeats
    maxConsecutiveMissed = Math.max(maxConsecutiveMissed, consecutiveMissed);
  });
  
  // Update number of consecutive missed heartbeats
  metrics.heartbeatsConsecutiveMissed = maxConsecutiveMissed;
}

// Handle validator status updates (blocks and votes only)
tendermintClient.on('status-update', (update: StatusUpdate) => {
  metrics.connected = true;
  
  if (update.final) {
    metrics.lastBlock = update.height;
    metrics.lastBlockTime = new Date();
    
    // Update signature status (shift and add new status)
    metrics.signStatus = [update.status, ...metrics.signStatus.slice(0, BLOCKS_HISTORY_SIZE - 1)];
    
    // Recalculate all statistics based on complete history
    recalculateStats();
    
    // Emit updated metrics to all connected clients
    io.emit('metrics-update', metrics);
    console.log(`Block ${update.height}: ${StatusType[update.status]}`);
  }
});

// Handle heartbeat updates
tendermintClient.on('heartbeat-update', (update: HeartbeatUpdate) => {
  metrics.heartbeatConnected = true;
  
  if (update.final) {
    metrics.lastHeartbeatPeriod = update.period;
    metrics.lastHeartbeatTime = new Date();
    
    // Update heartbeat status (shift and add new status)
    metrics.heartbeatStatus = [update.status, ...metrics.heartbeatStatus.slice(0, HEARTBEAT_HISTORY_SIZE - 1)];
    
    // Recalculate all heartbeat statistics
    recalculateHeartbeatStats();
    
    // Emit updated metrics to all connected clients
    io.emit('metrics-update', metrics);
    console.log(`HeartBeat period ${update.period} (${update.periodStart}-${update.periodEnd}): ${HeartbeatStatusType[update.status]}`);
  }
  
  // Update metrics object with heartbeat block heights
  metrics.heartbeatBlocks = tendermintClient.getHeartbeatBlocks();
});

// Interface pour les mises à jour d'événements EVM
interface EvmVoteUpdate {
  chain: string;
  pollIds?: EvmPollStatus[];
  lastGlobalPollId?: number;
}

// Handle EVM vote updates
tendermintClient.on('vote-update', (update: EvmVoteUpdate) => {
  if (metrics.evmVotesEnabled) {
    // Update votes for the specific chain
    if (update.chain && update.pollIds) {
      // Update EVM vote data
      metrics.evmVotes = tendermintClient.getAllEvmVotes() || {};
      metrics.evmLastGlobalPollId = update.lastGlobalPollId || metrics.evmLastGlobalPollId;
      
      // Emit updated metrics to connected clients
      io.emit('metrics-update', metrics);
      io.emit('evm-votes-update', metrics.evmVotes);
      
      // Debug log
      console.log(`Updated EVM votes for ${update.chain}, last Poll ID: ${metrics.evmLastGlobalPollId}`);
    }
  }
});

// Define types for AMPD events
interface AmpdVoteUpdate {
  chain: string;
  pollId: string;
  status: string;
}

interface AmpdSigningUpdate {
  chain: string;
  signingId: string;
  status: string;
}

// Handle AMPD vote updates
tendermintClient.on('ampd-vote-update', (update: AmpdVoteUpdate) => {
  if (metrics.ampdEnabled && update.chain) {
    // Update complete data
    metrics.ampdVotes = tendermintClient.getAllAmpdVotes() || {};
    
    // Emit updated data to connected clients
    io.emit('ampd-votes-update', { chain: update.chain, votes: tendermintClient.getAmpdChainVotes(update.chain) });
    
    // Debug log
    console.log(`Updated AMPD votes for ${update.chain}, pollId: ${update.pollId}`);
  }
});

// Handle AMPD signature updates
tendermintClient.on('ampd-signing-update', (update: AmpdSigningUpdate) => {
  if (metrics.ampdEnabled && update.chain) {
    // Update complete data
    metrics.ampdSignings = tendermintClient.getAllAmpdSignings() || {};
    
    // Emit updated data to connected clients
    io.emit('ampd-signings-update', { chain: update.chain, signings: tendermintClient.getAmpdChainSignings(update.chain) });
    
    // Debug log
    console.log(`Updated AMPD signatures for ${update.chain}, signingId: ${update.signingId}`);
  }
});

// Handle permanent disconnections
tendermintClient.on('permanent-disconnect', () => {
  metrics.connected = false;
  metrics.heartbeatConnected = false;
  metrics.lastError = "Unable to connect to RPC node after multiple attempts.";
  metrics.heartbeatLastError = "Unable to connect to WebSocket after multiple attempts.";
  io.emit('metrics-update', metrics);
});

// Start the client
tendermintClient.connect();

// Handle socket connections
io.on('connection', (socket) => {
  console.log('New web client connected:', socket.id);
  
  // Send current metrics immediately to the new client
  socket.emit('metrics-update', metrics);
  if (metrics.evmVotesEnabled) {
    socket.emit('evm-votes-update', metrics.evmVotes);
  }
  
  // Send AMPD data if enabled
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
  
  // Handle requests for AMPD data
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
    console.log('Web client disconnected:', socket.id);
  });
});

// API route
app.get('/api/metrics', (req, res) => {
  res.json(metrics);
});

// API route for EVM votes
app.get('/api/evm-votes', (req, res) => {
  if (metrics.evmVotesEnabled) {
    res.json(metrics.evmVotes);
  } else {
    res.status(404).json({ error: "EVM votes manager not enabled" });
  }
});

// API route for EVM votes for a specific chain
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

// API routes for AMPD
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

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(Number(PORT), '0.0.0.0', () => {
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
});

export default server; 