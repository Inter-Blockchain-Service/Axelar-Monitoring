"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const dotenv_1 = __importDefault(require("dotenv"));
const tendermint_1 = require("./tendermint");
const metrics_1 = require("./metrics");
const api_1 = require("./api");
const websockets_client_1 = require("./websockets-client");
const events_1 = require("./events");
const node_manager_1 = require("./node-manager");
const alert_manager_1 = require("./alert-manager");
const constants_1 = require("../constants");
// Load environment variables
dotenv_1.default.config();
// Default configuration
const DEFAULT_RPC_ENDPOINT = 'http://localhost:26657';
const DEFAULT_VALIDATOR_ADDRESS = '';
// Create Express application
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Initialize metrics
const metrics = (0, metrics_1.createInitialMetrics)(process.env.CHAIN_ID || 'axelar', process.env.VALIDATOR_MONIKER || 'My Validator');
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
// Create Tendermint client
const tendermintClient = new tendermint_1.TendermintClient(rpcEndpoint, validatorAddress, broadcasterAddress, constants_1.HEARTBEAT_HISTORY_SIZE, axelarApiEndpoint, ampdSupportedChains, ampdAddress, rpcEndpoint);
// Check if EVM votes manager is enabled
metrics.evmVotesEnabled = tendermintClient.hasEvmVoteManager();
// If EVM votes manager is enabled, get initial votes
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
// Configure WebSockets
const io = (0, websockets_client_1.setupWebSockets)(server, metrics, tendermintClient, rpcEndpoint, validatorAddress, broadcasterAddress);
// Create broadcaster functions
const broadcasters = (0, websockets_client_1.createBroadcasters)(io);
// Create reconnection function with broadcasters
const reconnectToNode = (0, node_manager_1.createReconnectionHandler)(tendermintClient, metrics, rpcEndpoint, broadcasters);
// Initialize alert manager
const alertManager = new alert_manager_1.AlertManager(metrics, reconnectToNode);
// Configure event handlers with reconnection function and broadcasters
(0, events_1.setupEventHandlers)(tendermintClient, metrics, reconnectToNode, broadcasters);
// Configure API routes
(0, api_1.setupApiRoutes)(app, metrics, tendermintClient);
// Add API routes for alerts
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
// Start server and connect to RPC node
const PORT = process.env.PORT || 3001;
server.listen(Number(PORT), '0.0.0.0', async () => {
    console.log(`Server listening on address 0.0.0.0:${PORT}`);
    console.log(`Monitoring validator ${metrics.moniker} (${validatorAddress}) on ${rpcEndpoint}`);
    console.log(`Signature period set to ${constants_1.BLOCKS_HISTORY_SIZE} blocks`);
    console.log(`Heartbeat monitoring set to ${constants_1.HEARTBEAT_HISTORY_SIZE} periods (1 period = ${constants_1.HEARTBEAT_PERIOD} blocks)`);
    if (metrics.evmVotesEnabled) {
        console.log(`EVM votes monitoring enabled with API endpoint: ${axelarApiEndpoint}`);
    }
    if (metrics.ampdEnabled) {
        console.log(`AMPD monitoring enabled for chains: ${metrics.ampdSupportedChains.join(', ')}`);
        console.log(`AMPD address used: ${tendermintClient.getAmpdAddress()}`);
    }
    // Start periodic alert checks (every 5 seconds)
    alertManager.startPeriodicChecks(10000);
    console.log('Alert system started with periodic checks every 5 seconds');
    // Connect to RPC node after checking its status
    await (0, node_manager_1.connectToNode)(tendermintClient, metrics, rpcEndpoint);
});
exports.default = server;
