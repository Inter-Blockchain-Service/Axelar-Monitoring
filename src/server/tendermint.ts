import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { ValidatorSignatureManager } from './validator-signature-manager';
import { HeartbeatManager, HeartbeatStatusType } from './heartbeat_manager';
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
  result: {
    query: string;
    data: {
      type: string;
      value: any;
    }
  }
}

// WebSocket client for Tendermint
export class TendermintClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private endpoint: string;
  private validatorAddress: string;
  private broadcasterAddress: string;
  private ampdAddress: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectInterval: number = 5000;
  private signatureManager: ValidatorSignatureManager;
  private heartbeatManager: HeartbeatManager;
  private evmVoteManager: EvmVoteManager | null = null;
  private ampdManager: AmpdManager | null = null;
  
  constructor(
    endpoint: string, 
    validatorAddress: string, 
    broadcasterAddress: string = '', 
    historySize: number = 700, 
    axelarApiEndpoint: string = '', 
    ampdSupportedChains: string[] = [],
    ampdAddress: string = ''
  ) {
    super();
    this.endpoint = this.normalizeEndpoint(endpoint);
    this.validatorAddress = validatorAddress.toUpperCase();
    this.broadcasterAddress = broadcasterAddress || validatorAddress;
    this.ampdAddress = ampdAddress || this.broadcasterAddress;
    this.signatureManager = new ValidatorSignatureManager(validatorAddress);
    this.heartbeatManager = new HeartbeatManager(this.broadcasterAddress, historySize);
    
    if (axelarApiEndpoint) {
      this.evmVoteManager = new EvmVoteManager(this.broadcasterAddress, axelarApiEndpoint);
      
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
  
  // Connect to WebSocket
  public connect(): void {
    try {
      console.log(`Connecting to ${this.endpoint}`);
      this.ws = new WebSocket(this.endpoint);
      
      this.ws.on('open', () => {
        console.log(`WebSocket connected to ${this.endpoint}`);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.subscribeToEvents();
      });
      
      this.ws.on('message', (data: Buffer) => {
        try {
          const reply = JSON.parse(data.toString()) as WsReply;
          this.handleMessage(reply);
        } catch (err) {
          console.error('JSON parsing error:', err);
        }
      });
      
      this.ws.on('close', () => {
        console.log('WebSocket disconnected');
        this.connected = false;
        this.attemptReconnect();
      });
      
      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        if (this.ws) {
          this.ws.terminate();
        }
      });
    } catch (error) {
      console.error('Connection error:', error);
      this.attemptReconnect();
    }
  }
  
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectInterval/1000}s...`);
      setTimeout(() => this.connect(), this.reconnectInterval);
    } else {
      console.error(`Failed after ${this.maxReconnectAttempts} attempts. Stopping reconnection attempts.`);
      this.emit('permanent-disconnect');
    }
  }
  
  private subscribeToEvents(): void {
    if (!this.ws || !this.connected) return;
    
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
  }
  
  private handleMessage(reply: WsReply): void {
    if (!reply.result || !reply.result.data) {
      return;
    }
    
    const eventType = reply.result.data.type;
    const value = reply.result.data.value;
    
    switch (eventType) {
      case 'tendermint/event/NewBlock':
        if (value && value.block && value.block.header) {
          this.signatureManager.handleNewBlock(value);
          this.heartbeatManager.handleNewBlock(value);
        } else {
          console.error('Invalid block structure received:', value);
        }
        break;
      case 'tendermint/event/Vote':
        this.signatureManager.handleVote(value);
        break;
      case 'tendermint/event/Tx':
        if (value.TxResult) {
          this.heartbeatManager.handleTransaction(value.TxResult);
          
          // Process transactions for EVM votes if manager is enabled
          if (this.evmVoteManager) {
            this.evmVoteManager.handleTransaction(reply.result);
          }
          
          // Process transactions for AMPD votes and signatures if manager is enabled
          if (this.ampdManager) {
            this.ampdManager.handleTransaction(reply.result);
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