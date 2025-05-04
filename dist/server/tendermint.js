"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TendermintClient = exports.StatusType = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const validator_signature_manager_1 = require("./validator-signature-manager");
const heartbeat_manager_1 = require("./heartbeat-manager");
const evm_vote_manager_1 = require("./evm-vote-manager");
const ampd_manager_1 = require("./ampd-manager");
const QUERY_NEW_BLOCK = `tm.event='NewBlock'`;
const QUERY_VOTE = `tm.event='Vote'`;
const QUERY_TX = `tm.event='Tx'`;
// Type describing block status
var StatusType;
(function (StatusType) {
    StatusType[StatusType["Missed"] = 0] = "Missed";
    StatusType[StatusType["Prevote"] = 1] = "Prevote";
    StatusType[StatusType["Precommit"] = 2] = "Precommit";
    StatusType[StatusType["Signed"] = 3] = "Signed";
    StatusType[StatusType["Proposed"] = 4] = "Proposed"; // Block proposed
})(StatusType || (exports.StatusType = StatusType = {}));
// WebSocket client for Tendermint
class TendermintClient extends events_1.EventEmitter {
    constructor(endpoint, validatorAddress, broadcasterAddress = '', historySize = 700, axelarApiEndpoint = '', ampdSupportedChains = [], ampdAddress = '', rpcUrl = '') {
        super();
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectInterval = 5000;
        this.evmVoteManager = null;
        this.ampdManager = null;
        this.reconnectTimeout = null;
        this.reconnectDelay = 5000;
        this.endpoint = this.normalizeEndpoint(endpoint);
        this.validatorAddress = validatorAddress.toUpperCase();
        this.broadcasterAddress = broadcasterAddress || validatorAddress;
        this.ampdAddress = ampdAddress || this.broadcasterAddress;
        this.signatureManager = new validator_signature_manager_1.ValidatorSignatureManager(validatorAddress);
        this.heartbeatManager = new heartbeat_manager_1.HeartbeatManager(this.broadcasterAddress, historySize);
        this.rpcUrl = rpcUrl || this.endpoint;
        if (axelarApiEndpoint) {
            this.evmVoteManager = new evm_vote_manager_1.EvmVoteManager(this.broadcasterAddress, axelarApiEndpoint);
            // Forward events from the EVM vote manager
            this.evmVoteManager.on('vote-update', (update) => {
                this.emit('vote-update', update);
            });
            // Initialize the AMPD manager if chains are specified
            if (ampdSupportedChains && ampdSupportedChains.length > 0) {
                this.ampdManager = new ampd_manager_1.AmpdManager(axelarApiEndpoint, ampdSupportedChains, this.ampdAddress);
                // Forward events from the AMPD manager
                this.ampdManager.on('vote-update', (update) => {
                    this.emit('ampd-vote-update', update);
                });
                this.ampdManager.on('signing-update', (update) => {
                    this.emit('ampd-signing-update', update);
                });
            }
        }
        // Forward events from the signature manager
        this.signatureManager.on('status-update', (update) => {
            this.emit('status-update', update);
        });
        // Forward events from the heartbeat manager
        this.heartbeatManager.on('heartbeat-update', (update) => {
            this.emit('heartbeat-update', update);
        });
    }
    // Normalize WebSocket URL
    normalizeEndpoint(url) {
        url = url.trim().replace(/\/$/, '');
        if (!url.endsWith('/websocket')) {
            url += '/websocket';
        }
        // If URL doesn't start with ws:// or wss://, assume http and convert to ws
        if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
            if (url.startsWith('https://')) {
                url = 'wss://' + url.substring(8);
            }
            else if (url.startsWith('http://')) {
                url = 'ws://' + url.substring(7);
            }
            else {
                url = 'ws://' + url;
            }
        }
        return url;
    }
    // Connect to WebSocket
    connect() {
        try {
            console.log(`Connecting to ${this.endpoint}`);
            this.setupWebSocket();
        }
        catch (error) {
            console.error('Connection error:', error);
            this.attemptReconnect();
        }
    }
    setupWebSocket() {
        try {
            this.ws = new ws_1.default(this.endpoint);
            this.ws.on('open', () => {
                console.log('WebSocket connected');
                this.connected = true;
                this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
                this.emit('connect');
                // Wait a short delay before subscribing to events
                setTimeout(() => {
                    if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
                        this.subscribeToEvents();
                    }
                    else {
                        console.warn('WebSocket not ready for subscription, will retry...');
                        this.attemptReconnect();
                    }
                }, 1000);
            });
            this.ws.on('close', () => {
                console.log('WebSocket disconnected');
                this.connected = false;
                this.emit('disconnect');
                this.attemptReconnect(); // Trigger reconnection on close
            });
            this.ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.connected = false;
                this.emit('disconnect');
                this.attemptReconnect(); // Trigger reconnection on error
            });
            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                }
                catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            });
        }
        catch (error) {
            console.error('Error setting up WebSocket:', error);
            this.connected = false;
            this.emit('disconnect');
            this.attemptReconnect();
        }
    }
    async checkNodeAvailability() {
        var _a, _b;
        try {
            const response = await fetch(`${this.rpcUrl}/status`);
            if (!response.ok) {
                return false;
            }
            const data = await response.json();
            return ((_b = (_a = data.result) === null || _a === void 0 ? void 0 : _a.sync_info) === null || _b === void 0 ? void 0 : _b.catching_up) === false;
        }
        catch (error) {
            console.error('Error checking node availability:', error);
            return false;
        }
    }
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.emit('permanentDisconnect');
            return;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        this.reconnectTimeout = setTimeout(async () => {
            try {
                console.log(`Attempting to reconnect (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
                // Check if node is available and synced before reconnecting
                const isAvailable = await this.checkNodeAvailability();
                if (!isAvailable) {
                    console.error('Node is not available, will retry later');
                    this.reconnectAttempts++;
                    this.attemptReconnect();
                    return;
                }
                // Clean up existing connection
                if (this.ws) {
                    this.ws.removeAllListeners();
                    this.ws.terminate();
                    this.ws = null;
                }
                // Reset state
                this.connected = false;
                this.reconnectAttempts++;
                // Attempt new connection
                this.setupWebSocket();
            }
            catch (error) {
                console.error('Error during reconnection attempt:', error);
                this.reconnectAttempts++;
                this.attemptReconnect();
            }
        }, this.reconnectDelay);
    }
    subscribeToEvents() {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            console.warn('Cannot subscribe to events: WebSocket not ready');
            return;
        }
        try {
            // Subscribe to new blocks
            const subscribeNewBlock = {
                jsonrpc: "2.0",
                method: "subscribe",
                id: 1,
                params: { query: QUERY_NEW_BLOCK }
            };
            // Subscribe to votes
            const subscribeVotes = {
                jsonrpc: "2.0",
                method: "subscribe",
                id: 2,
                params: { query: QUERY_VOTE }
            };
            // Subscribe to transactions (for heartbeats)
            const subscribeTx = {
                jsonrpc: "2.0",
                method: "subscribe",
                id: 3,
                params: { query: QUERY_TX }
            };
            this.ws.send(JSON.stringify(subscribeNewBlock));
            this.ws.send(JSON.stringify(subscribeVotes));
            this.ws.send(JSON.stringify(subscribeTx));
            console.log('Successfully subscribed to all events');
        }
        catch (error) {
            console.error('Error subscribing to events:', error);
            this.attemptReconnect();
        }
    }
    handleMessage(reply) {
        if (!reply.result || !reply.result.data) {
            return;
        }
        const eventType = reply.result.data.type;
        const value = reply.result.data.value;
        switch (eventType) {
            case 'tendermint/event/NewBlock':
                // Type assertion to indicate that value is of type BlockData
                if (value && typeof value === 'object' && 'block' in value &&
                    value.block && typeof value.block === 'object' && 'header' in value.block) {
                    const blockData = value;
                    this.signatureManager.handleNewBlock(blockData);
                    this.heartbeatManager.handleNewBlock(blockData);
                }
                else {
                    console.error('Invalid block structure received:', value);
                }
                break;
            case 'tendermint/event/Vote':
                // Type assertion to indicate that value is of type VoteData
                if (value && typeof value === 'object' && 'Vote' in value) {
                    const voteData = value;
                    this.signatureManager.handleVote(voteData);
                }
                break;
            case 'tendermint/event/Tx':
                // Type assertion to indicate that value is of type TxData
                if (value && typeof value === 'object' && 'TxResult' in value) {
                    const txData = value;
                    this.heartbeatManager.handleTransaction(txData.TxResult);
                    // Process transactions for EVM votes if manager is enabled
                    if (this.evmVoteManager) {
                        // Adapt the result format to match what EvmVoteManager expects
                        const evmTxResult = {
                            events: reply.result.events || {},
                            data: {
                                value: {
                                    TxResult: txData.TxResult
                                }
                            }
                        };
                        this.evmVoteManager.handleTransaction(evmTxResult);
                    }
                    // Process transactions for AMPD votes and signatures if manager is enabled
                    if (this.ampdManager) {
                        // Adapt the result format to match what AmpdManager expects
                        const ampdTxResult = {
                            events: reply.result.events || {}
                        };
                        this.ampdManager.handleTransaction(ampdTxResult);
                    }
                }
                break;
            default:
                // Ignore other event types
                break;
        }
    }
    disconnect() {
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
            this.connected = false;
        }
    }
    isConnected() {
        return this.connected;
    }
    /**
     * Gets the heartbeat status history
     */
    getHeartbeatHistory() {
        return this.heartbeatManager.getHeartbeatHistory();
    }
    /**
     * Gets the history of blocks where heartbeats were found
     */
    getHeartbeatBlocks() {
        return this.heartbeatManager.getHeartbeatBlocks();
    }
    /**
     * Gets the EVM vote data for a specific chain
     */
    getEvmChainVotes(chain) {
        if (!this.evmVoteManager)
            return null;
        return this.evmVoteManager.getChainVotes(chain);
    }
    /**
     * Gets all EVM vote data
     */
    getAllEvmVotes() {
        if (!this.evmVoteManager)
            return null;
        return this.evmVoteManager.getAllVotes();
    }
    /**
     * Checks if the EVM vote manager is enabled
     */
    hasEvmVoteManager() {
        return !!this.evmVoteManager;
    }
    /**
     * Checks if the AMPD manager is enabled
     */
    hasAmpdManager() {
        return !!this.ampdManager;
    }
    /**
     * Gets the AMPD vote data for a specific chain
     */
    getAmpdChainVotes(chain) {
        if (!this.ampdManager)
            return null;
        return this.ampdManager.getChainVotes(chain);
    }
    /**
     * Gets the AMPD signature data for a specific chain
     */
    getAmpdChainSignings(chain) {
        if (!this.ampdManager)
            return null;
        return this.ampdManager.getChainSignings(chain);
    }
    /**
     * Gets all AMPD vote data
     */
    getAllAmpdVotes() {
        if (!this.ampdManager)
            return null;
        return this.ampdManager.getAllVotesData();
    }
    /**
     * Gets all AMPD signing data
     */
    getAllAmpdSignings() {
        if (!this.ampdManager)
            return null;
        return this.ampdManager.getAllSigningsData();
    }
    /**
     * Gets the list of supported AMPD chains
     */
    getAmpdSupportedChains() {
        if (!this.ampdManager)
            return [];
        return this.ampdManager.getSupportedChains();
    }
    /**
     * Gets the AMPD address used
     */
    getAmpdAddress() {
        return this.ampdAddress;
    }
}
exports.TendermintClient = TendermintClient;
