import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { ValidatorSignatureManager } from './validator-signature-manager';
import { HeartbeatManager, HeartbeatStatusType } from './heartbeat-manager';
import { EvmVoteManager, PollStatus as EvmPollStatus, EvmVoteData } from './evm-vote-manager';
import { 
  AmpdManager, 
  PollStatus as AmpdPollStatus, 
  SigningStatus, 
  AmpdVoteData, 
  AmpdSigningData 
} from './ampd-manager';

const QUERY_NEW_BLOCK = `tm.event='NewBlock'`;
const QUERY_VOTE = `tm.event='Vote'`;
const QUERY_TX = `tm.event='Tx'`;

// Type describing block status
export enum StatusType {
  Missed,     // Missed block
  Prevote,    // Prevote seen
  Precommit,  // Precommit seen
  Signed,     // Block signed
  Proposed    // Block proposed
}

// Block status update
export interface StatusUpdate {
  height: number;
  status: StatusType;
  final: boolean;
}

// Representation of a Tendermint WebSocket response
interface WsReply {
  id: number;
  result: TxResult;
}

// Updated TxResult interface to match what the handlers expect
interface TxResult {
  query: string;
  data: {
    type: string;
    value: Record<string, unknown>;
  };
  events?: Record<string, string[]>;
}

// Types for Tendermint data structures
interface BlockHeader {
  height: string;
  proposer_address: string;
}

interface BlockLastCommit {
  signatures: Array<{validator_address: string}>;
}

interface Block {
  header: BlockHeader;
  last_commit: BlockLastCommit;
}

interface BlockData {
  block: Block;
}

interface VoteData {
  Vote: {
    height: string;
    validator_address: string;
    type: number;
  };
}

interface TxData {
  TxResult: {
    height: string;
    tx?: string;
    result?: {
      log?: string;
    };
  };
  [key: string]: unknown;
}

// WebSocket client for Tendermint
export class TendermintClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private endpoint: string;
  private validatorAddress: string;
  private broadcasterAddress: string;
  private ampdAddress: string;
  private signatureManager: ValidatorSignatureManager;
  private heartbeatManager: HeartbeatManager;
  private evmVoteManager: EvmVoteManager | null = null;
  private ampdManager: AmpdManager | null = null;
  private rpcUrl: string;
  
  constructor(
    endpoint: string,
    axelarApiEndpoint: string = '',
    validatorAddress: string,
    broadcasterAddress: string = '',
    ampdAddress: string = '',
    historySize: number = 700,
    evmSupportedChains: string[] = [],
    ampdSupportedChains: string[] = []
  ) {
    super();
    this.endpoint = this.normalizeEndpoint(endpoint);
    this.validatorAddress = validatorAddress.toUpperCase();
    this.broadcasterAddress = broadcasterAddress || validatorAddress;
    this.ampdAddress = ampdAddress || this.broadcasterAddress;
    this.signatureManager = new ValidatorSignatureManager(validatorAddress);
    this.heartbeatManager = new HeartbeatManager(this.broadcasterAddress, historySize);
    this.rpcUrl = endpoint.trim().replace(/\/websocket$/, '');
    
    if (axelarApiEndpoint) {
      this.evmVoteManager = new EvmVoteManager(this.broadcasterAddress, axelarApiEndpoint, evmSupportedChains);
      
      // Forward events from the EVM vote manager
      this.evmVoteManager.on('vote-update', (update) => {
        this.emit('vote-update', update);
      });
      
      // Initialize the AMPD manager if chains are specified
      if (ampdSupportedChains && ampdSupportedChains.length > 0) {
        this.ampdManager = new AmpdManager(
          axelarApiEndpoint, 
          ampdSupportedChains,
          this.ampdAddress
        );
        
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
    this.signatureManager.on('status-update', (update: StatusUpdate) => {
      this.emit('status-update', update);
    });

    // Forward events from the heartbeat manager
    this.heartbeatManager.on('heartbeat-update', (update) => {
      this.emit('heartbeat-update', update);
    });
  }
  
  // Normalize WebSocket URL
  private normalizeEndpoint(url: string): string {
    url = url.trim().replace(/\/$/, '');
    if (!url.endsWith('/websocket')) {
      url += '/websocket';
    }
    
    // If URL doesn't start with ws:// or wss://, assume http and convert to ws
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      if (url.startsWith('https://')) {
        url = 'wss://' + url.substring(8);
      } else if (url.startsWith('http://')) {
        url = 'ws://' + url.substring(7);
      } else {
        url = 'ws://' + url;
      }
    }
    
    return url;
  }
  
  // Method to be notified of reconnection by NodeManager
  public handleReconnection(): void {
    this.setupWebSocket();
  }

  // Method for initial connection
  public connect(): void {
    console.log(`Connecting to ${this.endpoint}`);
    this.setupWebSocket();
  }
  
  private setupWebSocket(): void {
    try {
      this.ws = new WebSocket(this.endpoint);
      
      this.ws.on('open', () => {
        console.log('WebSocket connected');
        this.connected = true;
        this.emit('connect');
        this.subscribeToEvents();
      });
      
      this.ws.on('close', () => {
        console.log('WebSocket disconnected');
        this.connected = false;
        this.emit('disconnect');
      });
      
      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.connected = false;
        this.emit('disconnect');
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      this.connected = false;
      this.emit('disconnect');
    }
  }
  
  private generateSubscriptionId(): number {
    // Combine timestamp with random number for uniqueness
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return timestamp * 10000 + random;
  }

  private subscribeToEvents(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot subscribe to events: WebSocket not ready');
      return;
    }
    
    try {
      // Subscribe to new blocks
      const subscribeNewBlock = {
        jsonrpc: "2.0",
        method: "subscribe",
        id: this.generateSubscriptionId(),
        params: { query: QUERY_NEW_BLOCK }
      };
      
      // Subscribe to votes
      const subscribeVotes = {
        jsonrpc: "2.0",
        method: "subscribe",
        id: this.generateSubscriptionId(),
        params: { query: QUERY_VOTE }
      };

      // Subscribe to transactions (for heartbeats)
      const subscribeTx = {
        jsonrpc: "2.0",
        method: "subscribe",
        id: this.generateSubscriptionId(),
        params: { query: QUERY_TX }
      };
      
      this.ws.send(JSON.stringify(subscribeNewBlock));
      this.ws.send(JSON.stringify(subscribeVotes));
      this.ws.send(JSON.stringify(subscribeTx));
      console.log('Successfully subscribed to all events');
    } catch (error) {
      console.error('Error subscribing to events:', error);
      this.emit('disconnect');
    }
  }
  
  private handleMessage(reply: WsReply): void {
    if (!reply.result || !reply.result.data) {
      return;
    }
    
    const eventType = reply.result.data.type;
    const value = reply.result.data.value;
    console.log('Received event:', eventType);
    switch (eventType) {
      case 'tendermint/event/NewBlock':
        // Type assertion to indicate that value is of type BlockData
        if (value && typeof value === 'object' && 'block' in value && 
            value.block && typeof value.block === 'object' && 'header' in value.block) {
          const blockData = value as unknown as BlockData;
          this.signatureManager.handleNewBlock(blockData);
          this.heartbeatManager.handleNewBlock(blockData);
        } else {
          console.error('Invalid block structure received:', value);
        }
        break;
      case 'tendermint/event/Vote':
        // Type assertion to indicate that value is of type VoteData
        if (value && typeof value === 'object' && 'Vote' in value) {
          const voteData = value as unknown as VoteData;
          this.signatureManager.handleVote(voteData);
        }
        break;
      case 'tendermint/event/Tx':
        // Type assertion to indicate that value is of type TxData
        if (value && typeof value === 'object' && 'TxResult' in value) {
          const txData = value as unknown as TxData;
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
  
  public disconnect(): void {
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
      this.connected = false;
    }
  }
  
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Gets the heartbeat status history
   */
  public getHeartbeatHistory(): HeartbeatStatusType[] {
    return this.heartbeatManager.getHeartbeatHistory();
  }

  /**
   * Gets the history of blocks where heartbeats were found
   */
  public getHeartbeatBlocks(): (number | undefined)[] {
    return this.heartbeatManager.getHeartbeatBlocks();
  }

  /**
   * Gets the EVM vote data for a specific chain
   */
  public getEvmChainVotes(chain: string): EvmPollStatus[] | null {
    if (!this.evmVoteManager) return null;
    return this.evmVoteManager.getChainVotes(chain);
  }

  /**
   * Gets all EVM vote data
   */
  public getAllEvmVotes(): EvmVoteData | null {
    if (!this.evmVoteManager) return null;
    return this.evmVoteManager.getAllVotes();
  }

  /**
   * Checks if the EVM vote manager is enabled
   */
  public hasEvmVoteManager(): boolean {
    return !!this.evmVoteManager;
  }

  /**
   * Checks if the AMPD manager is enabled
   */
  public hasAmpdManager(): boolean {
    return !!this.ampdManager;
  }
  
  /**
   * Gets the AMPD vote data for a specific chain
   */
  public getAmpdChainVotes(chain: string): AmpdPollStatus[] | null {
    if (!this.ampdManager) return null;
    return this.ampdManager.getChainVotes(chain);
  }
  
  /**
   * Gets the AMPD signature data for a specific chain
   */
  public getAmpdChainSignings(chain: string): SigningStatus[] | null {
    if (!this.ampdManager) return null;
    return this.ampdManager.getChainSignings(chain);
  }
  
  /**
   * Gets all AMPD vote data
   */
  public getAllAmpdVotes(): AmpdVoteData | null {
    if (!this.ampdManager) return null;
    return this.ampdManager.getAllVotesData();
  }
  
  /**
   * Gets all AMPD signing data
   */
  public getAllAmpdSignings(): AmpdSigningData | null {
    if (!this.ampdManager) return null;
    return this.ampdManager.getAllSigningsData();
  }
  
  /**
   * Gets the list of supported AMPD chains
   */
  public getAmpdSupportedChains(): string[] {
    if (!this.ampdManager) return [];
    return this.ampdManager.getSupportedChains();
  }

  /**
   * Gets the AMPD address used
   */
  public getAmpdAddress(): string {
    return this.ampdAddress;
  }
} 