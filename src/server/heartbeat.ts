import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { HEARTBEAT_PERIOD } from '../constants';

// Constantes de configuration des heartbeats
export const TRY_CNT = 10; // Nombre de blocs à vérifier par période

// Les types de statut pour les périodes de heartbeat
export enum HeartbeatStatusType {
  Unknown = -1,   // Pas encore de données pour cette période
  Missed = 0,     // Heartbeat manqué
  Signed = 1      // Heartbeat signé avec succès
}

// Interface pour les mises à jour de heartbeat
export interface HeartbeatUpdate {
  period: number;      // Identifiant de la période
  periodStart: number; // Bloc de début de période
  periodEnd: number;   // Bloc de fin de période
  status: HeartbeatStatusType; // Statut de la période
  foundAtBlock?: number; // Bloc où le heartbeat a été trouvé (si signé)
  final: boolean;      // Indique si le statut est final
}

/**
 * Client dédié à la surveillance des heartbeats d'un validateur Axelar
 * Cette classe est responsable de la détection et du suivi des heartbeats
 * envoyés par le validateur à intervalles réguliers.
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
  private currentPeriod: number = 0;
  private periodsFound: Map<string, number> = new Map();
  private isInitialized: boolean = false;
  private firstBlockSeen: number = 0;
  private heartbeatHistory: HeartbeatStatusType[] = [];
  private heartbeatFoundAtBlocks: (number | undefined)[] = [];
  private historySize: number;

  /**
   * Crée une nouvelle instance du client de heartbeat
   * @param wsEndpoint L'URL du WebSocket Tendermint
   * @param targetAddress L'adresse du validateur à surveiller
   * @param historySize La taille de l'historique des heartbeats à conserver
   */
  constructor(wsEndpoint: string, targetAddress: string, historySize: number = 700) {
    super();
    this.wsEndpoint = wsEndpoint;
    this.targetAddress = targetAddress;
    this.historySize = historySize;
    this.heartbeatHistory = Array(historySize).fill(HeartbeatStatusType.Unknown);
    this.heartbeatFoundAtBlocks = Array(historySize).fill(undefined);
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
   * @returns true si le client est connecté, false sinon
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Récupère l'historique des statuts de heartbeat
   * @returns Un tableau des statuts de heartbeat
   */
  public getHeartbeatHistory(): HeartbeatStatusType[] {
    return [...this.heartbeatHistory];
  }

  /**
   * Récupère l'historique des blocs où les heartbeats ont été trouvés
   * @returns Un tableau des hauteurs de bloc des heartbeats
   */
  public getHeartbeatBlocks(): (number | undefined)[] {
    return [...this.heartbeatFoundAtBlocks];
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
   * @param data Les données reçues du WebSocket
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const finalData = JSON.parse(data.toString('utf-8'));

      // Vérifier s'il s'agit d'une transaction
      if (finalData.result && finalData.result.data && finalData.result.data.value && finalData.result.data.value.TxResult) {
        this.handleTransaction(finalData.result.data.value.TxResult);
      } 
      // Vérifier s'il s'agit d'un nouveau bloc
      else if (finalData.result && finalData.result.data && finalData.result.data.value && finalData.result.data.value.block) {
        this.handleNewBlock(finalData.result.data.value.block);
      }
    } catch (error) {
      console.error('HeartbeatClient: Erreur de traitement du message:', error);
    }
  }

  /**
   * Traite une transaction pour détecter les heartbeats
   * @param txResult Les données de la transaction
   */
  private handleTransaction(txResult: any): void {
    const height = parseInt(txResult.height);
    
    // Initialisation - enregistrer le premier bloc
    if (this.firstBlockSeen === 0) {
      this.firstBlockSeen = height;
      this.currentPeriod = Math.floor(height / HEARTBEAT_PERIOD);
      console.log(`HeartbeatClient: Premier bloc vu est ${height}, période actuelle: ${this.currentPeriod}`);
    }
    
    // Déterminer dans quelle période HeartBeat nous sommes
    const blockPeriod = Math.floor(height / HEARTBEAT_PERIOD);
    const periodStart = blockPeriod * HEARTBEAT_PERIOD;
    const periodStartBlock = periodStart + 1;
    const periodEnd = (blockPeriod + 1) * HEARTBEAT_PERIOD - 1;
    const periodKey = `${periodStart}-${periodEnd}`;
    
    // Détection de HeartBeat
    let isHeartBeat = false;
    let decodedTx = '';
    let addressFound = false;
    
    // Recherche dans le TX brut
    if (txResult.tx && typeof txResult.tx === 'string') {
      try {
        decodedTx = Buffer.from(txResult.tx, 'base64').toString();
        
        if (decodedTx.includes('/axelar.reward.v1beta1.RefundMsgRequest') && 
            decodedTx.includes('/axelar.tss.v1beta1.HeartBeatRequest')) {
          isHeartBeat = true;
          
          if (decodedTx.includes(this.targetAddress)) {
            addressFound = true;
          }
        }
      } catch (e) {
        // Ignorer les erreurs de décodage
      }
    }
    
    // Vérifier aussi dans le raw_log
    if (isHeartBeat && !addressFound && txResult.result && txResult.result.log) {
      try {
        const logData = txResult.result.log;
        if (logData.includes(this.targetAddress)) {
          addressFound = true;
        }
      } catch (e) {}
    }
    
    // Si c'est un HeartBeat et notre adresse est trouvée
    if (isHeartBeat && addressFound) {
      if (!this.periodsFound.has(periodKey)) {
        this.periodsFound.set(periodKey, height);
        
        // Mettre à jour l'historique des heartbeats
        this.updateHeartbeatStatus(blockPeriod, periodStart, periodEnd, HeartbeatStatusType.Signed, height, true);
        
        console.log(`HeartbeatClient: ✅ HeartBeat trouvé pour l'adresse ${this.targetAddress} à la hauteur ${height} (période ${periodKey})`);
      }
    }
  }

  /**
   * Traite un nouveau bloc pour détecter les périodes de heartbeat
   * @param block Les données du bloc
   */
  private handleNewBlock(block: any): void {
    const blockHeight = parseInt(block.header.height);
    
    // Initialisation - enregistrer le premier bloc
    if (this.firstBlockSeen === 0) {
      this.firstBlockSeen = blockHeight;
      this.currentPeriod = Math.floor(blockHeight / HEARTBEAT_PERIOD);
      console.log(`HeartbeatClient: Premier bloc vu est ${blockHeight}, période actuelle: ${this.currentPeriod}`);
    }
    
    // Logique de période de HeartBeat
    const blockPeriod = Math.floor(blockHeight / HEARTBEAT_PERIOD);
    const periodStart = blockPeriod * HEARTBEAT_PERIOD;
    const periodEnd = (blockPeriod + 1) * HEARTBEAT_PERIOD - 1;
    const periodKey = `${periodStart}-${periodEnd}`;
    
    // Si nous venons de changer de période et que la précédente n'est pas validée
    if (blockPeriod > this.currentPeriod) {
      const prevPeriod = blockPeriod - 1;
      const prevPeriodStart = prevPeriod * HEARTBEAT_PERIOD;
      const prevPeriodEnd = periodStart - 1;
      const prevPeriodKey = `${prevPeriodStart}-${prevPeriodEnd}`;
      
      // Vérifier si nous avons terminé l'initialisation
      if (!this.isInitialized) {
        this.isInitialized = true;
        console.log(`HeartbeatClient: ✅ INITIALISATION TERMINÉE: Les vérifications vont maintenant commencer à partir de la période ${periodStart}-${periodEnd}`);
      } 
      // Si nous avons terminé l'initialisation
      else {
        // Vérifier si la période précédente a été manquée
        if (!this.periodsFound.has(prevPeriodKey)) {
          // Marquer cette période comme échec
          this.updateHeartbeatStatus(prevPeriod, prevPeriodStart, prevPeriodEnd, HeartbeatStatusType.Missed, undefined, true);
          console.log(`HeartbeatClient: ❌ ÉCHEC: HeartBeat NON trouvé dans la période ${prevPeriodKey}`);
        }
      }
      
      // Mettre à jour la période courante
      this.currentPeriod = blockPeriod;
      console.log(`HeartbeatClient: ⏱️ Nouvelle période de HeartBeat commencée: ${periodKey}`);
    }
    
    // Vérifier si nous avons dépassé la fenêtre de recherche d'une période sans succès
    const blockStartPlusWindow = periodStart + 1 + TRY_CNT;
    if (blockHeight === blockStartPlusWindow && !this.periodsFound.has(periodKey) && this.isInitialized) {
      console.log(`HeartbeatClient: ⚠️ Fenêtre de HeartBeat (${TRY_CNT} blocs) dépassée pour la période ${periodKey}, chances de détection réduites`);
    }
  }

  /**
   * Met à jour le statut d'un heartbeat dans l'historique
   * @param period La période du heartbeat
   * @param periodStart Le bloc de début de période
   * @param periodEnd Le bloc de fin de période
   * @param status Le statut du heartbeat
   * @param foundAtBlock Le bloc où le heartbeat a été trouvé (si signé)
   * @param final Indique si le statut est final
   */
  private updateHeartbeatStatus(
    period: number,
    periodStart: number,
    periodEnd: number,
    status: HeartbeatStatusType,
    foundAtBlock?: number,
    final: boolean = false
  ): void {
    // Mettre à jour l'historique des heartbeats
    // Ajouter le nouveau statut au début de l'historique et décaler les autres
    this.heartbeatHistory = [status, ...this.heartbeatHistory.slice(0, this.historySize - 1)];
    
    // Ajouter la hauteur du bloc au début de l'historique des blocs et décaler les autres
    this.heartbeatFoundAtBlocks = [foundAtBlock, ...this.heartbeatFoundAtBlocks.slice(0, this.historySize - 1)];
    
    // Émettre l'événement de mise à jour
    const update: HeartbeatUpdate = {
      period,
      periodStart,
      periodEnd,
      status,
      foundAtBlock,
      final
    };
    
    this.emit('heartbeat-update', update);
  }
} 