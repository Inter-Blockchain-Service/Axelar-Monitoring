import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { HeartbeatManager, HeartbeatStatusType, HeartbeatUpdate } from './heartbeat_manager';

/**
 * Client WebSocket dédié à la surveillance des heartbeats d'un validateur Axelar
 * Cette classe est responsable uniquement de la connexion WebSocket et de la transmission des messages
 */
export class HeartbeatClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private targetAddress: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;
  private wsEndpoint: string;
  private heartbeatManager: HeartbeatManager;

  constructor(wsEndpoint: string, targetAddress: string, historySize: number = 700) {
    super();
    this.wsEndpoint = wsEndpoint;
    this.targetAddress = targetAddress;
    this.heartbeatManager = new HeartbeatManager(targetAddress, historySize);
    
    // Transmettre les événements du HeartbeatManager
    this.heartbeatManager.on('heartbeat-update', (update) => {
      this.emit('heartbeat-update', update);
    });
  }

  /**
   * Établit la connexion WebSocket et s'abonne aux événements
   */
  public connect(): void {
    if (this.isConnected) return;

    try {
      this.ws = new WebSocket(this.wsEndpoint);

      this.ws.on('open', () => {
        console.log(`HeartbeatClient: Connecté à ${this.wsEndpoint}`);
        console.log(`HeartbeatClient: Surveillance de l'adresse ${this.targetAddress}`);
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // S'abonner aux nouveaux blocs
        if (this.ws) {
          this.ws.send(JSON.stringify({
            "method": "subscribe",
            "params": ["tm.event='NewBlock'"],
            "id": "block-subscription",
            "jsonrpc": "2.0"
          }));

          // S'abonner aux transactions
          this.ws.send(JSON.stringify({
            "method": "subscribe",
            "params": ["tm.event='Tx'"],
            "id": "tx-subscription", 
            "jsonrpc": "2.0"
          }));
        }

        this.emit('connected');
      });

      this.ws.on('message', (data) => this.handleMessage(data));

      this.ws.on('error', (error) => {
        console.error('HeartbeatClient: Erreur WebSocket:', error);
        this.handleDisconnect();
      });

      this.ws.on('close', () => {
        console.log('HeartbeatClient: Connexion WebSocket fermée');
        this.handleDisconnect();
      });
    } catch (error) {
      console.error('HeartbeatClient: Erreur de connexion:', error);
      this.handleDisconnect();
    }
  }

  /**
   * Ferme la connexion WebSocket
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    this.isConnected = false;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Vérifie si le client est connecté
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Gère la déconnexion et tente de se reconnecter
   */
  private handleDisconnect(): void {
    this.isConnected = false;
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`HeartbeatClient: Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts} dans ${this.reconnectDelay / 1000}s...`);
      
      this.reconnectTimeout = setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
    } else {
      console.error('HeartbeatClient: Échec de reconnexion après plusieurs tentatives');
      this.emit('permanent-disconnect');
    }
  }

  /**
   * Traite les messages reçus du WebSocket
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const finalData = JSON.parse(data.toString('utf-8'));

      // Vérifier s'il s'agit d'une transaction
      if (finalData.result && finalData.result.data && finalData.result.data.value && finalData.result.data.value.TxResult) {
        this.heartbeatManager.handleTransaction(finalData.result.data.value.TxResult);
      } 
      // Vérifier s'il s'agit d'un nouveau bloc
      else if (finalData.result && finalData.result.data && finalData.result.data.value && finalData.result.data.value.block) {
        this.heartbeatManager.handleNewBlock(finalData.result.data.value.block);
      }
    } catch (error) {
      console.error('HeartbeatClient: Erreur de traitement du message:', error);
    }
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
} 