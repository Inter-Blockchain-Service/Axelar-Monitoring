import WebSocket from 'ws';
import { EventEmitter } from 'events';

const QUERY_NEW_BLOCK = `tm.event='NewBlock'`;
const QUERY_VOTE = `tm.event='Vote'`;
const QUERY_TX = `tm.event='Tx'`;

// Type décrivant le statut d'un bloc
export enum StatusType {
  Missed,     // Bloc manqué
  Prevote,    // Prevote vu
  Precommit,  // Precommit vu
  Signed,     // Bloc signé
  Proposed,   // Bloc proposé
  HeartBeat   // HeartBeat détecté
}

// Mise à jour du statut d'un bloc
export interface StatusUpdate {
  height: number;
  status: StatusType;
  final: boolean;
  isHeartBeat?: boolean;  // Indique si c'est un heartbeat
  heartBeatPeriod?: number;  // Période de heartbeat
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

// Constantes pour les heartbeats
const HEARTBEAT_PERIOD = 50; // Les HeartBeat sont attendus tous les 50 blocs
const HEARTBEAT_HISTORY_SIZE = 700; // Historique des HeartBeats (700 périodes ~ 35000 blocs)

// Client WebSocket pour Tendermint
export class TendermintClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private endpoint: string;
  private validatorAddress: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectInterval: number = 5000;
  private periodsFound: Map<string, number> = new Map(); // Pour suivre les périodes où on a trouvé des heartbeats
  private heartBeatHistory: boolean[] = Array(HEARTBEAT_HISTORY_SIZE).fill(false); // Historique des HeartBeats (true = détecté, false = manqué)
  private currentHeartBeatPeriod: number = 0;
  
  constructor(endpoint: string, validatorAddress: string) {
    super();
    this.endpoint = this.normalizeEndpoint(endpoint);
    this.validatorAddress = validatorAddress.toUpperCase();
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
    
    // S'abonner aux transactions
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
        this.handleNewBlock(value);
        break;
      case 'tendermint/event/Vote':
        this.handleVote(value);
        break;
      case 'tendermint/event/Tx':
        this.handleTx(value);
        break;
      default:
        // Ignorer les autres types d'événements
        break;
    }
  }
  
  private handleNewBlock(blockData: any): void {
    try {
      const height = parseInt(blockData.block.header.height);
      const proposerAddress = blockData.block.header.proposer_address;
      
      let status = StatusType.Missed;
      
      // Vérifier si ce validateur est le proposeur
      if (proposerAddress === this.validatorAddress) {
        status = StatusType.Proposed;
      } 
      // Vérifier si le validateur a signé ce bloc
      else if (this.checkSignatureInBlock(blockData, this.validatorAddress)) {
        status = StatusType.Signed;
      }
      
      // Mettre à jour l'historique des HeartBeats à chaque nouveau bloc
      this.updateHeartBeatHistory(height);
      
      const update: StatusUpdate = {
        height,
        status,
        final: true
      };
      
      this.emit('status-update', update);
      
    } catch (error) {
      console.error('Erreur de traitement du bloc:', error);
    }
  }
  
  private checkSignatureInBlock(blockData: any, validatorAddress: string): boolean {
    if (!blockData.block.last_commit || !blockData.block.last_commit.signatures) {
      return false;
    }
    
    return blockData.block.last_commit.signatures.some(
      (sig: any) => sig.validator_address === validatorAddress
    );
  }
  
  private handleVote(voteData: any): void {
    try {
      if (voteData.Vote.validator_address !== this.validatorAddress) {
        return; // Ce n'est pas un vote de notre validateur
      }
      
      const height = parseInt(voteData.Vote.height);
      let status: StatusType;
      
      switch (voteData.Vote.type) {
        case 1: // SIGNED_MSG_TYPE_PREVOTE
          status = StatusType.Prevote;
          break;
        case 2: // SIGNED_MSG_TYPE_PRECOMMIT
          status = StatusType.Precommit;
          break;
        default:
          return; // Type de vote inconnu
      }
      
      const update: StatusUpdate = {
        height,
        status,
        final: false
      };
      
      this.emit('status-update', update);
      
    } catch (error) {
      console.error('Erreur de traitement du vote:', error);
    }
  }
  
  // Gestion des transactions - pour la détection des heartbeats
  private handleTx(txData: any): void {
    try {
      if (!txData.TxResult) return;
      
      const height = parseInt(txData.TxResult.height);
      const tx = txData.TxResult.tx;
      let decodedTx = '';
      
      // Déterminer dans quelle période HeartBeat nous sommes
      const blockPeriod = Math.floor(height / HEARTBEAT_PERIOD);
      const periodStart = blockPeriod * HEARTBEAT_PERIOD;
      const periodEnd = (blockPeriod + 1) * HEARTBEAT_PERIOD;
      const periodKey = `${periodStart}-${periodEnd-1}`;
      
      // Recherche dans le TX brut pour les heartbeats
      let isHeartBeat = false;
      let addressFound = false;
      
      if (tx && typeof tx === 'string') {
        try {
          decodedTx = Buffer.from(tx, 'base64').toString();
          
          // Correspondre à la méthode de recherche des HeartBeats
          if (decodedTx.includes('/axelar.reward.v1beta1.RefundMsgRequest') && 
              decodedTx.includes('/axelar.tss.v1beta1.HeartBeatRequest')) {
            isHeartBeat = true;
            
            // Vérifier si notre adresse de validateur est mentionnée
            // Convertir l'adresse en minuscules pour la comparaison
            const validatorAddressLower = this.validatorAddress.toLowerCase();
            if (decodedTx.includes(validatorAddressLower)) {
              addressFound = true;
            }
          }
        } catch (e) {
          // Ignorer les erreurs de décodage
        }
      }
      
      // Vérifier aussi dans les logs
      if (txData.TxResult.result && txData.TxResult.result.log) {
        try {
          const logData = txData.TxResult.result.log;
          // Convertir l'adresse en minuscules pour la comparaison
          const validatorAddressLower = this.validatorAddress.toLowerCase();
          if (logData.includes(validatorAddressLower)) {
            addressFound = true;
          }
        } catch (e) {}
      }
      
      // Si c'est un HeartBeat et que notre validateur est impliqué
      if (isHeartBeat && addressFound) {
        // Enregistrer cette période comme ayant un heartbeat
        if (!this.periodsFound.has(periodKey)) {
          this.periodsFound.set(periodKey, height);
          console.log(`HeartBeat détecté à la hauteur ${height} pour la période ${periodKey}`);
          
          // Mettre à jour l'historique des HeartBeats (ajouter true au début et supprimer le plus ancien)
          // S'assurer que les périodes manquantes entre la précédente et celle-ci sont marquées comme manquées
          const periodGap = blockPeriod - this.currentHeartBeatPeriod;
          if (periodGap > 1 && this.currentHeartBeatPeriod > 0) {
            // Ajouter des 'false' pour les périodes manquées
            const missedPeriods = Math.min(periodGap - 1, HEARTBEAT_HISTORY_SIZE);
            const newHistory = Array(missedPeriods).fill(false);
            this.heartBeatHistory = [...newHistory, ...this.heartBeatHistory.slice(0, HEARTBEAT_HISTORY_SIZE - missedPeriods)];
          }
          
          // Ajouter le HeartBeat actuel à l'historique
          this.heartBeatHistory = [true, ...this.heartBeatHistory.slice(0, HEARTBEAT_HISTORY_SIZE - 1)];
          
          // Mettre à jour la période actuelle
          this.currentHeartBeatPeriod = blockPeriod;
          
          // Envoyer une mise à jour de statut
          const update: StatusUpdate = {
            height,
            status: StatusType.HeartBeat,
            final: true,
            isHeartBeat: true,
            heartBeatPeriod: blockPeriod
          };
          
          this.emit('heartbeat-update', update);
        }
      }
      
    } catch (error) {
      console.error('Erreur de traitement de la transaction:', error);
    }
  }
  
  // Mise à jour de l'historique des HeartBeats quand un nouveau bloc est reçu
  private updateHeartBeatHistory(height: number): void {
    const blockPeriod = Math.floor(height / HEARTBEAT_PERIOD);
    
    // Si nous avons changé de période
    if (blockPeriod > this.currentHeartBeatPeriod) {
      // Vérifier si la période précédente avait un HeartBeat
      const prevPeriodKey = `${this.currentHeartBeatPeriod * HEARTBEAT_PERIOD}-${(this.currentHeartBeatPeriod + 1) * HEARTBEAT_PERIOD - 1}`;
      
      // Si la période précédente n'a pas été enregistrée comme ayant un HeartBeat
      if (!this.periodsFound.has(prevPeriodKey) && this.currentHeartBeatPeriod > 0) {
        console.log(`HeartBeat manqué pour la période ${prevPeriodKey}`);
        
        // Mettre à jour l'historique avec false pour la période manquée
        this.heartBeatHistory = [false, ...this.heartBeatHistory.slice(0, HEARTBEAT_HISTORY_SIZE - 1)];
      }
      
      // Mettre à jour la période actuelle
      this.currentHeartBeatPeriod = blockPeriod;
    }
  }
  
  // Méthode pour vérifier si un heartbeat a été trouvé dans une période donnée
  public hasHeartBeatInPeriod(period: number): boolean {
    const periodStart = period * HEARTBEAT_PERIOD;
    const periodEnd = (period + 1) * HEARTBEAT_PERIOD - 1;
    const periodKey = `${periodStart}-${periodEnd}`;
    return this.periodsFound.has(periodKey);
  }
  
  // Méthode pour obtenir la période de heartbeat actuelle
  public getCurrentHeartBeatPeriod(height: number): number {
    return Math.floor(height / HEARTBEAT_PERIOD);
  }
  
  // Méthode pour obtenir l'historique complet des HeartBeats
  public getHeartBeatHistory(): boolean[] {
    return [...this.heartBeatHistory];
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