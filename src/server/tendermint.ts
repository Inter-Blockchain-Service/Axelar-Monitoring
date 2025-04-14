import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { ValidatorSignatureManager } from './validator-signature-manager';

const QUERY_NEW_BLOCK = `tm.event='NewBlock'`;
const QUERY_VOTE = `tm.event='Vote'`;

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
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectInterval: number = 5000;
  private signatureManager: ValidatorSignatureManager;
  
  constructor(endpoint: string, validatorAddress: string) {
    super();
    this.endpoint = this.normalizeEndpoint(endpoint);
    this.validatorAddress = validatorAddress.toUpperCase();
    this.signatureManager = new ValidatorSignatureManager(validatorAddress);
    
    // Transmettre les événements du gestionnaire de signatures
    this.signatureManager.on('status-update', (update: StatusUpdate) => {
      this.emit('status-update', update);
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
    
    this.ws.send(JSON.stringify(subscribeNewBlock));
    this.ws.send(JSON.stringify(subscribeVotes));
  }
  
  private handleMessage(reply: WsReply): void {
    if (!reply.result || !reply.result.data) {
      return;
    }
    
    const eventType = reply.result.data.type;
    const value = reply.result.data.value;
    
    switch (eventType) {
      case 'tendermint/event/NewBlock':
        this.signatureManager.handleNewBlock(value);
        break;
      case 'tendermint/event/Vote':
        this.signatureManager.handleVote(value);
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
} 