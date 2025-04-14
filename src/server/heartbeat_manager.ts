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
 * Gestionnaire de la logique des heartbeats
 * Cette classe est responsable de la détection et du suivi des heartbeats
 */
export class HeartbeatManager extends EventEmitter {
  private targetAddress: string;
  private currentPeriod: number = 0;
  private periodsFound: Map<string, number> = new Map();
  private isInitialized: boolean = false;
  private firstBlockSeen: number = 0;
  private heartbeatHistory: HeartbeatStatusType[] = [];
  private heartbeatFoundAtBlocks: (number | undefined)[] = [];
  private historySize: number;
  private lastProcessedBlock: number | undefined;

  constructor(targetAddress: string, historySize: number = 700) {
    super();
    this.targetAddress = targetAddress;
    this.historySize = historySize;
    this.heartbeatHistory = Array(historySize).fill(HeartbeatStatusType.Unknown);
    this.heartbeatFoundAtBlocks = Array(historySize).fill(undefined);
  }

  /**
   * Traite une transaction pour détecter les heartbeats
   */
  public handleTransaction(txResult: any): void {
    const height = parseInt(txResult.height);
    
    // Initialisation - enregistrer le premier bloc
    if (this.firstBlockSeen === 0) {
      this.firstBlockSeen = height;
      this.currentPeriod = Math.floor(height / HEARTBEAT_PERIOD);
      console.log(`HeartbeatManager: Premier bloc vu est ${height}, période actuelle: ${this.currentPeriod}`);
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
        
        console.log(`HeartbeatManager: ✅ HeartBeat trouvé pour l'adresse ${this.targetAddress} à la hauteur ${height} (période ${periodKey})`);
      }
    }
  }

  /**
   * Traite un nouveau bloc pour détecter les périodes de heartbeat
   */
  public handleNewBlock(blockData: any): void {
    try {
      if (!blockData?.block?.header?.height) {
        console.error('Structure de bloc invalide:', blockData);
        return;
      }

      const height = parseInt(blockData.block.header.height);
      const currentPeriod = Math.floor(height / HEARTBEAT_PERIOD);
      
      // Si c'est le premier bloc qu'on voit
      if (this.lastProcessedBlock === undefined) {
        this.lastProcessedBlock = height;
        this.currentPeriod = currentPeriod;
        console.log(`Initialisation du HeartbeatManager: bloc ${height}, période ${currentPeriod}`);
        return;
      }
      
      // Logique de période de HeartBeat
      const blockPeriod = Math.floor(height / HEARTBEAT_PERIOD);
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
          console.log(`HeartbeatManager: ✅ INITIALISATION TERMINÉE: Les vérifications vont maintenant commencer à partir de la période ${periodStart}-${periodEnd}`);
        } 
        // Si nous avons terminé l'initialisation
        else {
          // Vérifier si la période précédente a été manquée
          if (!this.periodsFound.has(prevPeriodKey)) {
            // Marquer cette période comme échec
            this.updateHeartbeatStatus(prevPeriod, prevPeriodStart, prevPeriodEnd, HeartbeatStatusType.Missed, undefined, true);
            console.log(`HeartbeatManager: ❌ ÉCHEC: HeartBeat NON trouvé dans la période ${prevPeriodKey}`);
          }
        }
        
        // Mettre à jour la période courante
        this.currentPeriod = blockPeriod;
        console.log(`HeartbeatManager: ⏱️ Nouvelle période de HeartBeat commencée: ${periodKey}`);
      }
      
      // Vérifier si nous avons dépassé la fenêtre de recherche d'une période sans succès
      const blockStartPlusWindow = periodStart + 1 + TRY_CNT;
      if (height === blockStartPlusWindow && !this.periodsFound.has(periodKey) && this.isInitialized) {
        console.log(`HeartbeatManager: ⚠️ Fenêtre de HeartBeat (${TRY_CNT} blocs) dépassée pour la période ${periodKey}, chances de détection réduites`);
      }
    } catch (e) {
      console.error('Erreur lors de la gestion du nouveau bloc:', e);
    }
  }

  /**
   * Met à jour le statut d'un heartbeat dans l'historique
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

  /**
   * Récupère l'historique des statuts de heartbeat
   */
  public getHeartbeatHistory(): HeartbeatStatusType[] {
    return [...this.heartbeatHistory];
  }

  /**
   * Récupère l'historique des blocs où les heartbeats ont été trouvés
   */
  public getHeartbeatBlocks(): (number | undefined)[] {
    return [...this.heartbeatFoundAtBlocks];
  }
} 