import http from 'http';
import dotenv from 'dotenv';
import { TendermintClient } from './tendermint';
import { createInitialMetrics } from './metrics';
import { setupWebSockets, createBroadcasters } from './websockets-client';
import { setupEventHandlers } from './events';
import { connectToNode, createReconnectionHandler } from './node-manager';
import { AlertManager } from './alert-manager';
import { BLOCKS_HISTORY_SIZE, HEARTBEAT_HISTORY_SIZE, HEARTBEAT_PERIOD } from '../constants';

// Load environment variables
dotenv.config();

// Default configuration
const DEFAULT_RPC_ENDPOINT = 'http://localhost:26657';
const DEFAULT_VALIDATOR_ADDRESS = '';

// Create HTTP server
const server = http.createServer();

// Initialize metrics
const metrics = createInitialMetrics(
  process.env.CHAIN_ID || 'axelar',
  process.env.VALIDATOR_MONIKER || 'My Validator'
);

// Configure Tendermint client
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

// Get supported EVM chains from environment variables
const evmSupportedChainsEnv = process.env.EVM_SUPPORTED_CHAINS || '';
const evmSupportedChains = evmSupportedChainsEnv.split(',').filter(chain => chain.trim() !== '');

// Create Tendermint client
const tendermintClient = new TendermintClient(
  rpcEndpoint,
  axelarApiEndpoint,
  validatorAddress,
  broadcasterAddress,
  ampdAddress,
  HEARTBEAT_HISTORY_SIZE,
  evmSupportedChains,
  ampdSupportedChains
);

// Check if EVM votes manager is enabled
metrics.evmVotesEnabled = tendermintClient.hasEvmVoteManager();

// If EVM votes manager is enabled, get initial votes
if (metrics.evmVotesEnabled) {
  console.log(`EVM monitoring enabled for chains: ${evmSupportedChains.join(', ')}`);
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

// Configure WebSockets
const io = setupWebSockets(server, metrics, tendermintClient, rpcEndpoint, validatorAddress, broadcasterAddress);

// Create broadcaster functions
const broadcasters = createBroadcasters(io);

// Create reconnection function with broadcasters
const reconnectToNode = createReconnectionHandler(tendermintClient, metrics, rpcEndpoint, broadcasters);

// Initialize alert manager
const alertManager = new AlertManager(metrics, reconnectToNode);

// Configure event handlers with reconnection function and broadcasters
setupEventHandlers(tendermintClient, metrics, reconnectToNode, broadcasters);

// Start server and connect to RPC node
const PORT = process.env.PORT || 3001;
server.listen(Number(PORT), '0.0.0.0', async () => {
  console.log(`Server listening on address 0.0.0.0:${PORT}`);
  console.log(`Monitoring validator ${metrics.moniker} (${validatorAddress}) on ${rpcEndpoint}`);
  console.log(`Signature period set to ${BLOCKS_HISTORY_SIZE} blocks`);
  console.log(`Heartbeat monitoring set to ${HEARTBEAT_HISTORY_SIZE} periods (1 period = ${HEARTBEAT_PERIOD} blocks)`);
  
  if (metrics.evmVotesEnabled) {
    console.log(`EVM votes monitoring enabled with API endpoint: ${axelarApiEndpoint}`);
    console.log(`EVM monitoring enabled for chains: ${evmSupportedChains.join(', ')}`);
  }
  
  if (metrics.ampdEnabled) {
    console.log(`AMPD monitoring enabled for chains: ${metrics.ampdSupportedChains.join(', ')}`);
    console.log(`AMPD address used: ${tendermintClient.getAmpdAddress()}`);
  }
  
  // Start periodic alert checks (every 5 seconds)
  alertManager.startPeriodicChecks(10000);
  console.log('Alert system started with periodic checks every 5 seconds');
  
  // Connect to RPC node after checking its status
  await connectToNode(tendermintClient, metrics, rpcEndpoint);
});

export default server; 