import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { ValidatorSignatureManager } from './validator-signature-manager';
import { HeartbeatManager, HeartbeatStatusType } from './heartbeat_manager';
import { EvmVoteManager, PollStatus, VoteStatusType } from './evm-vote-manager';
import { AmpdManager } from './ampd-manager';

const QUERY_NEW_BLOCK = `tm.event='NewBlock'`;
const QUERY_VOTE = `tm.event='Vote'`;
const QUERY_TX = `tm.event='Tx'`;

// Type décrivant le statut d'un bloc
export enum StatusType {
  Missed,     // Bloc manqué
  Prevote,    // Prevote vu
  Precommit,  // Precommit vu
  Signed,     // Bloc signé
  Proposed    // Bloc proposé
}

// Mise à jour du statut d'un bloc
export interface StatusUpdate {
  height: number;
  status: StatusType;
  final: boolean;
}

// Représentation d'une réponse WebSocket de Tendermint
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

// Client WebSocket pour Tendermint
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
      
      // Transmettre les événements du gestionnaire de votes EVM
      this.evmVoteManager.on('vote-update', (update) => {
        this.emit('vote-update', update);
      });
      
      // Initialiser le gestionnaire AMPD si des chaînes sont spécifiées
      if (ampdSupportedChains && ampdSupportedChains.length > 0) {
        this.ampdManager = new AmpdManager(
          axelarApiEndpoint, 
          ampdSupportedChains,
          this.ampdAddress
        );
        
        // Transmettre les événements du gestionnaire AMPD
        this.ampdManager.on('vote-update', (update) => {
          this.emit('ampd-vote-update', update);
        });
        
        this.ampdManager.on('signing-update', (update) => {
          this.emit('ampd-signing-update', update);
        });
      }
    }
    
    // Transmettre les événements du gestionnaire de signatures
    this.signatureManager.on('status-update', (update: StatusUpdate) => {
      this.emit('status-update', update);
    });

    // Transmettre les événements du gestionnaire de heartbeats
    this.heartbeatManager.on('heartbeat-update', (update) => {
      this.emit('heartbeat-update', update);
    });
  }
  
  // Normalise l'URL du WebSocket
  private normalizeEndpoint(url: string): string {
    url = url.trim().replace(/\/$/, '');
    if (!url.endsWith('/websocket')) {
      url += '/websocket';
    }
    
    // Si l'URL ne commence pas par ws:// ou wss://, suppose http et convertit en ws
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
  
  // Connexion au WebSocket
  public connect(): void {
    try {
      console.log(`Connexion à ${this.endpoint}`);
      this.ws = new WebSocket(this.endpoint);
      
      this.ws.on('open', () => {
        console.log(`WebSocket connecté à ${this.endpoint}`);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.subscribeToEvents();
      });
      
      this.ws.on('message', (data: Buffer) => {
        try {
          const reply = JSON.parse(data.toString()) as WsReply;
          this.handleMessage(reply);
        } catch (err) {
          console.error('Erreur de parsing JSON:', err);
        }
      });
      
      this.ws.on('close', () => {
        console.log('WebSocket déconnecté');
        this.connected = false;
        this.attemptReconnect();
      });
      
      this.ws.on('error', (error) => {
        console.error('Erreur WebSocket:', error);
        if (this.ws) {
          this.ws.terminate();
        }
      });
    } catch (error) {
      console.error('Erreur de connexion:', error);
      this.attemptReconnect();
    }
  }
  
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts} dans ${this.reconnectInterval/1000}s...`);
      setTimeout(() => this.connect(), this.reconnectInterval);
    } else {
      console.error(`Échec après ${this.maxReconnectAttempts} tentatives. Arrêt des tentatives de reconnexion.`);
      this.emit('permanent-disconnect');
    }
  }
  
  private subscribeToEvents(): void {
    if (!this.ws || !this.connected) return;
    
    // S'abonner aux nouveaux blocs
    const subscribeNewBlock = {
      jsonrpc: "2.0",
      method: "subscribe",
      id: 1,
      params: { query: QUERY_NEW_BLOCK }
    };
    
    // S'abonner aux votes
    const subscribeVotes = {
      jsonrpc: "2.0",
      method: "subscribe",
      id: 2,
      params: { query: QUERY_VOTE }
    };

    // S'abonner aux transactions (pour les heartbeats)
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
          console.error('Structure de bloc invalide reçue:', value);
        }
        break;
      case 'tendermint/event/Vote':
        this.signatureManager.handleVote(value);
        break;
      case 'tendermint/event/Tx':
        if (value.TxResult) {
          this.heartbeatManager.handleTransaction(value.TxResult);
          
          // Traiter les transactions pour les votes EVM si le gestionnaire est activé
          if (this.evmVoteManager) {
            this.evmVoteManager.handleTransaction(reply.result);
          }
          
          // Traiter les transactions pour les votes et signatures AMPD si le gestionnaire est activé
          if (this.ampdManager) {
            this.ampdManager.handleTransaction(reply.result);
          }
        }
        break;
      default:
        // Ignorer les autres types d'événements
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
   * Récupère l'historique des statuts de heartbeat
   */
  public getHeartbeatHistory(): HeartbeatStatusType[] {
    return this.heartbeatManager.getHeartbeatHistory();
  }

  /**
   * Récupère l'historique des blocs où les heartbeats ont été trouvés
   */
  public getHeartbeatBlocks(): (number | undefined)[] {
    return this.heartbeatManager.getHeartbeatBlocks();
  }

  /**
   * Récupère les données de votes EVM pour une chaîne spécifique
   */
  public getEvmChainVotes(chain: string): PollStatus[] | null {
    if (!this.evmVoteManager) return null;
    return this.evmVoteManager.getChainVotes(chain);
  }

  /**
   * Récupère toutes les données de votes EVM
   */
  public getAllEvmVotes(): any {
    if (!this.evmVoteManager) return null;
    return this.evmVoteManager.getAllVotes();
  }

  /**
   * Vérifie si le gestionnaire de votes EVM est activé
   */
  public hasEvmVoteManager(): boolean {
    return !!this.evmVoteManager;
  }

  /**
   * Vérifie si le gestionnaire AMPD est activé
   */
  public hasAmpdManager(): boolean {
    return !!this.ampdManager;
  }
  
  /**
   * Récupère les données de votes AMPD pour une chaîne spécifique
   */
  public getAmpdChainVotes(chain: string): PollStatus[] | null {
    if (!this.ampdManager) return null;
    return this.ampdManager.getChainVotes(chain);
  }
  
  /**
   * Récupère les données de signatures AMPD pour une chaîne spécifique
   */
  public getAmpdChainSignings(chain: string): any {
    if (!this.ampdManager) return null;
    return this.ampdManager.getChainSignings(chain);
  }
  
  /**
   * Récupère toutes les données AMPD
   */
  public getAllAmpdData(): any {
    if (!this.ampdManager) return null;
    return this.ampdManager.getAllData();
  }
  
  /**
   * Récupère la liste des chaînes AMPD supportées
   */
  public getAmpdSupportedChains(): string[] {
    if (!this.ampdManager) return [];
    return this.ampdManager.getSupportedChains();
  }

  /**
   * Récupère l'adresse AMPD utilisée
   */
  public getAmpdAddress(): string {
    return this.ampdAddress;
  }
} 