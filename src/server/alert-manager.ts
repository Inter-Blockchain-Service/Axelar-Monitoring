import axios from 'axios';
import { ValidatorMetrics } from './metrics';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';

// Types d'alertes
export enum AlertType {
  BLOCK_SIGNATURE_MISSED = 'block_signature_missed',
  CONSECUTIVE_BLOCKS_MISSED = 'consecutive_blocks_missed',
  HEARTBEAT_MISSED = 'heartbeat_missed',
  CONSECUTIVE_HEARTBEATS_MISSED = 'consecutive_heartbeats_missed',
  NODE_DISCONNECTED = 'node_disconnected',
  SIGN_RATE_LOW = 'sign_rate_low',
  HEARTBEAT_RATE_LOW = 'heartbeat_rate_low',
  EVM_VOTE_MISSED = 'evm_vote_missed',
  AMPD_VOTE_MISSED = 'ampd_vote_missed',
  AMPD_SIGNING_MISSED = 'ampd_signing_missed',
  NODE_SYNC_ISSUE = 'node_sync_issue'
}

// Interface pour une alerte
interface Alert {
  type: AlertType;
  message: string;
  timestamp: Date;
  metrics: Partial<ValidatorMetrics>;
  severity: 'info' | 'warning' | 'critical';
}

// Interface pour les seuils d'alertes
interface AlertThresholds {
  consecutiveBlocksMissed: number;
  consecutiveHeartbeatsMissed: number;
  signRateThreshold: number;
  heartbeatRateThreshold: number;
  consecutiveEvmVotesMissed: number;
  consecutiveAmpdVotesMissed: number;
  consecutiveAmpdSigningsMissed: number;
}

// Interface pour la configuration de notification
interface NotificationConfig {
  discord: {
    enabled: boolean;
    webhookUrl: string;
  };
  telegram: {
    enabled: boolean;
    botToken: string;
    chatId: string;
  };
}

export class AlertManager extends EventEmitter {
  private metrics: ValidatorMetrics;
  private previousMetrics: Partial<ValidatorMetrics> = {};
  private lastAlertTimestamps: Record<AlertType, Date> = {} as Record<AlertType, Date>;
  private thresholds: AlertThresholds;
  private notificationConfig: NotificationConfig;
  private cooldownPeriod: number = 5 * 60 * 1000; // 5 minutes en millisecondes par défaut
  
  // Compteurs pour votes et signatures consécutifs manqués
  private evmConsecutiveMissedByChain: Record<string, number> = {};
  private ampdVotesConsecutiveMissedByChain: Record<string, number> = {};
  private ampdSigningsConsecutiveMissedByChain: Record<string, number> = {};
  
  constructor(metrics: ValidatorMetrics) {
    super();
    this.metrics = metrics;
    
    // Charger la configuration depuis les variables d'environnement
    this.thresholds = {
      consecutiveBlocksMissed: parseInt(process.env.ALERT_CONSECUTIVE_BLOCKS_THRESHOLD || '3', 10),
      consecutiveHeartbeatsMissed: parseInt(process.env.ALERT_CONSECUTIVE_HEARTBEATS_THRESHOLD || '2', 10),
      signRateThreshold: parseFloat(process.env.ALERT_SIGN_RATE_THRESHOLD || '98.5'),
      heartbeatRateThreshold: parseFloat(process.env.ALERT_HEARTBEAT_RATE_THRESHOLD || '98.0'),
      consecutiveEvmVotesMissed: parseInt(process.env.ALERT_CONSECUTIVE_EVM_VOTES_THRESHOLD || '3', 10),
      consecutiveAmpdVotesMissed: parseInt(process.env.ALERT_CONSECUTIVE_AMPD_VOTES_THRESHOLD || '3', 10),
      consecutiveAmpdSigningsMissed: parseInt(process.env.ALERT_CONSECUTIVE_AMPD_SIGNINGS_THRESHOLD || '3', 10)
    };
    
    this.notificationConfig = {
      discord: {
        enabled: process.env.DISCORD_ALERTS_ENABLED === 'true',
        webhookUrl: process.env.DISCORD_WEBHOOK_URL || ''
      },
      telegram: {
        enabled: process.env.TELEGRAM_ALERTS_ENABLED === 'true',
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        chatId: process.env.TELEGRAM_CHAT_ID || ''
      }
    };
    
    // Initialiser les timestamps des dernières alertes
    Object.values(AlertType).forEach(type => {
      this.lastAlertTimestamps[type] = new Date(0); // Date 0 = jamais envoyé
    });
    
    // Initialiser les compteurs de votes manqués pour chaque chaîne
    if (metrics.evmVotesEnabled && metrics.evmVotes) {
      Object.keys(metrics.evmVotes).forEach(chain => {
        this.evmConsecutiveMissedByChain[chain] = 0;
      });
    }
    
    if (metrics.ampdEnabled && metrics.ampdSupportedChains) {
      metrics.ampdSupportedChains.forEach(chain => {
        this.ampdVotesConsecutiveMissedByChain[chain] = 0;
        this.ampdSigningsConsecutiveMissedByChain[chain] = 0;
      });
    }
    
    console.log('Alert Manager initialized with thresholds:', this.thresholds);
  }
  
  /**
   * Vérifie les métriques actuelles pour détecter les alertes
   */
  public checkMetrics(): void {
    // Sauvegarder l'état précédent des métriques pour comparaison
    const prevMetrics = { ...this.previousMetrics };
    this.previousMetrics = { ...this.metrics };
    
    // Calculer les taux actuels
    const signRate = this.calculateSignRate();
    const heartbeatRate = this.calculateHeartbeatRate();
    
    // Vérifier les blocs consécutifs manqués
    if (this.metrics.consecutiveMissed >= this.thresholds.consecutiveBlocksMissed) {
      this.createAlert(
        AlertType.CONSECUTIVE_BLOCKS_MISSED,
        `⚠️ ALERTE: ${this.metrics.consecutiveMissed} blocs consécutifs manqués`,
        'critical'
      );
    }
    
    // Vérifier les heartbeats consécutifs manqués
    if (this.metrics.heartbeatsConsecutiveMissed >= this.thresholds.consecutiveHeartbeatsMissed) {
      this.createAlert(
        AlertType.CONSECUTIVE_HEARTBEATS_MISSED,
        `⚠️ ALERTE: ${this.metrics.heartbeatsConsecutiveMissed} heartbeats consécutifs manqués`,
        'critical'
      );
    }
    
    // Vérifier le taux de signature
    if (signRate < this.thresholds.signRateThreshold) {
      this.createAlert(
        AlertType.SIGN_RATE_LOW,
        `⚠️ ALERTE: Taux de signature bas (${signRate.toFixed(2)}%)`,
        'warning'
      );
    }
    
    // Vérifier le taux de heartbeat
    if (heartbeatRate < this.thresholds.heartbeatRateThreshold) {
      this.createAlert(
        AlertType.HEARTBEAT_RATE_LOW,
        `⚠️ ALERTE: Taux de heartbeat bas (${heartbeatRate.toFixed(2)}%)`,
        'warning'
      );
    }
    
    // Vérifier si le nœud est déconnecté
    if (prevMetrics.connected === true && this.metrics.connected === false) {
      this.createAlert(
        AlertType.NODE_DISCONNECTED,
        `🔴 ALERTE CRITIQUE: Nœud déconnecté! Dernière erreur: ${this.metrics.lastError}`,
        'critical'
      );
    }
    
    // Analyser les votes EVM
    if (this.metrics.evmVotesEnabled) {
      this.checkEvmVotes();
    }
    
    // Analyser les votes AMPD
    if (this.metrics.ampdEnabled) {
      this.checkAmpdVotes();
      this.checkAmpdSignings();
    }
  }
  
  /**
   * Vérifie les votes EVM manqués
   */
  private checkEvmVotes(): void {
    // Parcourir toutes les chaînes EVM
    Object.entries(this.metrics.evmVotes).forEach(([chain, chainData]) => {
      // Si pas de votes ou pas de pollIds, ignorer
      if (!chainData || !chainData.pollIds || !chainData.pollIds.length) return;
      
      const latestPoll = chainData.pollIds[0]; // Le premier est le plus récent
      
      // Vérifier si le vote est manqué
      if (latestPoll.result === 'Missed' || latestPoll.result === 'missed' || latestPoll.result === 'invalid' || latestPoll.result === 'Invalid') {
        // Incrémenter le compteur de votes consécutifs manqués
        this.evmConsecutiveMissedByChain[chain] = (this.evmConsecutiveMissedByChain[chain] || 0) + 1;
        
        // Vérifier si seuil dépassé
        if (this.evmConsecutiveMissedByChain[chain] >= this.thresholds.consecutiveEvmVotesMissed) {
          // Déclencher alerte
          this.createAlert(
            AlertType.EVM_VOTE_MISSED,
            `⚠️ ALERTE: ${this.evmConsecutiveMissedByChain[chain]} votes EVM consécutifs manqués pour la chaîne ${chain.toUpperCase()}`,
            'critical'
          );
        }
      } else {
        // Réinitialiser le compteur s'il y a eu un vote réussi
        this.evmConsecutiveMissedByChain[chain] = 0;
      }
    });
  }
  
  /**
   * Vérifie les votes AMPD manqués
   */
  private checkAmpdVotes(): void {
    // Parcourir toutes les chaînes AMPD supportées
    this.metrics.ampdSupportedChains.forEach(chain => {
      // Récupérer les données de votes pour cette chaîne
      const chainVotes = this.metrics.ampdVotes[chain];
      
      // Si pas de votes, ignorer
      if (!chainVotes || !chainVotes.pollIds || !chainVotes.pollIds.length) return;
      
      const latestVote = chainVotes.pollIds[0]; // Le premier est le plus récent
      
      // Vérifier si le vote est manqué ou non soumis
      if (latestVote.result === 'Missed' || latestVote.result === 'missed' || latestVote.result === 'unsubmit') {
        // Incrémenter le compteur de votes consécutifs manqués
        this.ampdVotesConsecutiveMissedByChain[chain] = (this.ampdVotesConsecutiveMissedByChain[chain] || 0) + 1;
        
        // Vérifier si seuil dépassé
        if (this.ampdVotesConsecutiveMissedByChain[chain] >= this.thresholds.consecutiveAmpdVotesMissed) {
          // Déclencher alerte
          this.createAlert(
            AlertType.AMPD_VOTE_MISSED,
            `⚠️ ALERTE: ${this.ampdVotesConsecutiveMissedByChain[chain]} votes AMPD consécutifs manqués pour la chaîne ${chain.toUpperCase()}`,
            'critical'
          );
        }
      } else {
        // Réinitialiser le compteur s'il y a eu un vote réussi
        this.ampdVotesConsecutiveMissedByChain[chain] = 0;
      }
    });
  }
  
  /**
   * Vérifie les signatures AMPD manquées
   */
  private checkAmpdSignings(): void {
    // Parcourir toutes les chaînes AMPD supportées
    this.metrics.ampdSupportedChains.forEach(chain => {
      // Récupérer les données de signatures pour cette chaîne
      const chainSignings = this.metrics.ampdSignings[chain];
      
      // Si pas de signatures, ignorer
      if (!chainSignings || !chainSignings.signingIds || !chainSignings.signingIds.length) return;
      
      const latestSigning = chainSignings.signingIds[0]; // Le premier est le plus récent
      
      // Vérifier si la signature est manquée ou non soumise
      if (latestSigning.result === 'Missed' || latestSigning.result === 'missed' || latestSigning.result === 'unsubmit') {
        // Incrémenter le compteur de signatures consécutives manquées
        this.ampdSigningsConsecutiveMissedByChain[chain] = (this.ampdSigningsConsecutiveMissedByChain[chain] || 0) + 1;
        
        // Vérifier si seuil dépassé
        if (this.ampdSigningsConsecutiveMissedByChain[chain] >= this.thresholds.consecutiveAmpdSigningsMissed) {
          // Déclencher alerte
          this.createAlert(
            AlertType.AMPD_SIGNING_MISSED,
            `⚠️ ALERTE: ${this.ampdSigningsConsecutiveMissedByChain[chain]} signatures AMPD consécutives manquées pour la chaîne ${chain.toUpperCase()}`,
            'critical'
          );
        }
      } else {
        // Réinitialiser le compteur s'il y a eu une signature réussie
        this.ampdSigningsConsecutiveMissedByChain[chain] = 0;
      }
    });
  }
  
  /**
   * Calcule le taux de signature actuel
   */
  private calculateSignRate(): number {
    const totalBlocks = this.metrics.totalSigned + this.metrics.totalMissed;
    if (totalBlocks === 0) return 100;
    return (this.metrics.totalSigned / totalBlocks) * 100;
  }
  
  /**
   * Calcule le taux de heartbeat actuel
   */
  private calculateHeartbeatRate(): number {
    const totalHeartbeats = this.metrics.heartbeatsSigned + this.metrics.heartbeatsMissed;
    if (totalHeartbeats === 0) return 100;
    return (this.metrics.heartbeatsSigned / totalHeartbeats) * 100;
  }
  
  /**
   * Vérifie si une alerte peut être envoyée (respecte le cooldown)
   */
  private canSendAlert(type: AlertType): boolean {
    const now = new Date();
    const lastSent = this.lastAlertTimestamps[type];
    return (now.getTime() - lastSent.getTime()) > this.cooldownPeriod;
  }
  
  /**
   * Crée et envoie une alerte
   */
  private createAlert(type: AlertType, message: string, severity: 'info' | 'warning' | 'critical'): void {
    // Vérifier le cooldown
    if (!this.canSendAlert(type)) {
      console.log(`Alert ${type} suppressed due to cooldown period`);
      return;
    }
    
    // Créer l'objet alerte
    const alert: Alert = {
      type,
      message,
      timestamp: new Date(),
      metrics: {
        lastBlock: this.metrics.lastBlock,
        consecutiveMissed: this.metrics.consecutiveMissed,
        totalMissed: this.metrics.totalMissed,
        totalSigned: this.metrics.totalSigned,
        heartbeatsConsecutiveMissed: this.metrics.heartbeatsConsecutiveMissed,
        heartbeatsMissed: this.metrics.heartbeatsMissed,
        heartbeatsSigned: this.metrics.heartbeatsSigned
      },
      severity
    };
    
    // Mettre à jour le timestamp de la dernière alerte
    this.lastAlertTimestamps[type] = new Date();
    
    // Émettre l'événement d'alerte
    this.emit('alert', alert);
    
    // Envoyer les notifications
    this.sendNotifications(alert);
    
    // Log l'alerte
    console.log(`🚨 Alert triggered: ${message}`);
  }
  
  /**
   * Envoie les notifications sur les différentes plateformes configurées
   */
  private async sendNotifications(alert: Alert): Promise<void> {
    // Formater le message pour l'affichage
    const formattedMessage = this.formatAlertMessage(alert);
    
    // Envoyer sur Discord si activé
    if (this.notificationConfig.discord.enabled && this.notificationConfig.discord.webhookUrl) {
      await this.sendDiscordNotification(formattedMessage, alert);
    }
    
    // Envoyer sur Telegram si activé
    if (this.notificationConfig.telegram.enabled && 
        this.notificationConfig.telegram.botToken && 
        this.notificationConfig.telegram.chatId) {
      await this.sendTelegramNotification(formattedMessage, alert);
    }
  }
  
  /**
   * Formate le message d'alerte pour l'affichage
   */
  private formatAlertMessage(alert: Alert): string {
    const timestamp = alert.timestamp.toISOString();
    const metrics = alert.metrics;
    
    let message = `${alert.message}\n`;
    message += `🕒 ${timestamp}\n`;
    message += `🔍 Validateur: ${this.metrics.moniker}\n`;
    message += `📊 Derniers stats:\n`;
    
    switch (alert.type) {
      case AlertType.CONSECUTIVE_BLOCKS_MISSED:
      case AlertType.BLOCK_SIGNATURE_MISSED:
      case AlertType.SIGN_RATE_LOW:
        message += `- Bloc actuel: ${metrics.lastBlock}\n`;
        message += `- Blocs consécutifs manqués: ${metrics.consecutiveMissed}\n`;
        message += `- Total manqués: ${metrics.totalMissed}\n`;
        message += `- Total signés: ${metrics.totalSigned}\n`;
        message += `- Taux: ${this.calculateSignRate().toFixed(2)}%\n`;
        break;
        
      case AlertType.CONSECUTIVE_HEARTBEATS_MISSED:
      case AlertType.HEARTBEAT_MISSED:
      case AlertType.HEARTBEAT_RATE_LOW:
        message += `- Heartbeats consécutifs manqués: ${metrics.heartbeatsConsecutiveMissed}\n`;
        message += `- Total heartbeats manqués: ${metrics.heartbeatsMissed}\n`;
        message += `- Total heartbeats signés: ${metrics.heartbeatsSigned}\n`;
        message += `- Taux: ${this.calculateHeartbeatRate().toFixed(2)}%\n`;
        break;
        
      case AlertType.NODE_DISCONNECTED:
        message += `- Dernière erreur: ${this.metrics.lastError}\n`;
        message += `- Dernier bloc vu: ${metrics.lastBlock}\n`;
        break;
        
      case AlertType.EVM_VOTE_MISSED:
        // Extraire le nom de la chaîne du message
        const evmChain = alert.message.match(/chaîne ([A-Z]+)/)?.[1].toLowerCase() || '';
        message += `- Chaîne: ${evmChain.toUpperCase()}\n`;
        message += `- Votes consécutifs manqués: ${this.evmConsecutiveMissedByChain[evmChain] || 0}\n`;
        if (this.metrics.evmVotes[evmChain] && this.metrics.evmVotes[evmChain].pollIds?.[0]) {
          message += `- Dernier poll ID: ${this.metrics.evmVotes[evmChain].pollIds[0].pollId}\n`;
        }
        break;
        
      case AlertType.AMPD_VOTE_MISSED:
        // Extraire le nom de la chaîne du message
        const ampdVoteChain = alert.message.match(/chaîne ([A-Z]+)/)?.[1].toLowerCase() || '';
        message += `- Chaîne: ${ampdVoteChain.toUpperCase()}\n`;
        message += `- Votes consécutifs manqués: ${this.ampdVotesConsecutiveMissedByChain[ampdVoteChain] || 0}\n`;
        break;
        
      case AlertType.AMPD_SIGNING_MISSED:
        // Extraire le nom de la chaîne du message
        const ampdSigningChain = alert.message.match(/chaîne ([A-Z]+)/)?.[1].toLowerCase() || '';
        message += `- Chaîne: ${ampdSigningChain.toUpperCase()}\n`;
        message += `- Signatures consécutives manquées: ${this.ampdSigningsConsecutiveMissedByChain[ampdSigningChain] || 0}\n`;
        break;
    }
    
    return message;
  }
  
  /**
   * Envoie une notification à Discord
   */
  private async sendDiscordNotification(message: string, alert: Alert): Promise<void> {
    try {
      // Couleur en fonction de la sévérité
      const color = alert.severity === 'critical' ? 0xFF0000 : 
                   alert.severity === 'warning' ? 0xFFAA00 : 0x00AA00;
      
      const payload = {
        embeds: [{
          title: `Alerte Validateur ${this.metrics.moniker}`,
          description: message,
          color: color,
          timestamp: new Date().toISOString()
        }]
      };
      
      await axios.post(this.notificationConfig.discord.webhookUrl, payload);
      console.log('Discord notification sent successfully');
    } catch (error) {
      console.error('Failed to send Discord notification:', error);
    }
  }
  
  /**
   * Envoie une notification à Telegram
   */
  private async sendTelegramNotification(message: string, alert: Alert): Promise<void> {
    try {
      const botToken = this.notificationConfig.telegram.botToken;
      const chatId = this.notificationConfig.telegram.chatId;
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      
      // Ajouter des émojis selon la sévérité
      const severityEmoji = alert.severity === 'critical' ? '🚨' : 
                           alert.severity === 'warning' ? '⚠️' : 'ℹ️';
      
      const payload = {
        chat_id: chatId,
        text: `${severityEmoji} ${message}`,
        parse_mode: 'Markdown'
      };
      
      await axios.post(url, payload);
      console.log('Telegram notification sent successfully');
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
    }
  }
  
  /**
   * Vérifie les métriques périodiquement
   */
  public startPeriodicChecks(intervalMs: number = 60000): void {
    setInterval(() => {
      this.checkMetrics();
    }, intervalMs);
    
    console.log(`Alert Manager started periodic checks (every ${intervalMs/1000}s)`);
  }
} 