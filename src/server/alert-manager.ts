import axios from 'axios';
import { ValidatorMetrics } from './metrics';
import { EventEmitter } from 'events';
import { StatusType } from '../hooks/useMetrics';
import { HeartbeatStatusType } from '../hooks/useMetrics';

// Alert types
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
  NODE_SYNC_ISSUE = 'node_sync_issue',
  // Nouveaux types d'alertes pour les retours à la normale
  EVM_VOTES_RECOVERED = 'evm_votes_recovered',
  AMPD_VOTES_RECOVERED = 'ampd_votes_recovered',
  AMPD_SIGNINGS_RECOVERED = 'ampd_signings_recovered',
  NODE_RECONNECTED = 'node_reconnected'
}

// Interface for AMPD signings
interface AmpdSigning {
  signingId: string;
  result: string;
}

// Interface for an alert
interface Alert {
  type: AlertType;
  message: string;
  timestamp: Date;
  metrics: Partial<ValidatorMetrics>;
  severity: 'info' | 'warning' | 'critical';
}

// Interface for alert thresholds
interface AlertThresholds {
  consecutiveBlocksMissed: number;
  consecutiveHeartbeatsMissed: number;
  signRateThreshold: number;
  heartbeatRateThreshold: number;
  consecutiveEvmVotesMissed: number;
  consecutiveAmpdVotesMissed: number;
  consecutiveAmpdSigningsMissed: number;
}

// Interface for notification configuration
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
  private cooldownPeriod: number = 5 * 60 * 1000; // 5 minutes in milliseconds by default
  
  // État pour suivre les blocs manqués
  private isMissingBlocks: boolean = false;
  private lastAlertedConsecutiveMissed: number = 0;
  
  // État pour suivre les heartbeats manqués
  private isMissingHeartbeats: boolean = false;
  private lastAlertedConsecutiveHeartbeatsMissed: number = 0;
  
  // État pour suivre les taux bas
  private isLowSignRate: boolean = false;
  private isLowHeartbeatRate: boolean = false;
  private lastAlertedSignRate: number = 0;
  private lastAlertedHeartbeatRate: number = 0;
  
  // Counters for consecutive missed votes and signatures
  private evmConsecutiveMissedByChain: Record<string, number> = {};
  private ampdVotesConsecutiveMissedByChain: Record<string, number> = {};
  private ampdSigningsConsecutiveMissedByChain: Record<string, number> = {};
  
  constructor(metrics: ValidatorMetrics) {
    super();
    this.metrics = metrics;
    
    // Load configuration from environment variables
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
    
    // Initialize timestamps for the last alerts
    Object.values(AlertType).forEach(type => {
      this.lastAlertTimestamps[type] = new Date(0); // Date 0 = never sent
    });
    
    // Initialize missed vote counters for each chain
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
   * Check current metrics to detect alerts
   */
  public checkMetrics(): void {
    // Save previous state of metrics for comparison
    const prevMetrics = { ...this.previousMetrics };
    this.previousMetrics = { ...this.metrics };
    
    // Vérifier les blocs manqués consécutifs en utilisant signStatus
    if (this.metrics.signStatus && this.metrics.signStatus.length > 0) {
      let consecutiveMissed = 0;
      
      // On ne regarde que les premiers blocs jusqu'à ce qu'on trouve un bloc signé
      for (const status of this.metrics.signStatus) {
        if (status === StatusType.Missed) {
          consecutiveMissed++;
        } else {
          // Dès qu'on trouve un bloc signé, on arrête de compter
          break;
        }
      }
      
      // Vérifier si on dépasse le seuil
      if (consecutiveMissed >= this.thresholds.consecutiveBlocksMissed) {
        if (!this.isMissingBlocks) {
          // Premier dépassement du seuil
          this.isMissingBlocks = true;
          this.lastAlertedConsecutiveMissed = consecutiveMissed;
          this.createAlert(
            AlertType.CONSECUTIVE_BLOCKS_MISSED,
            `⚠️ ALERT: ${consecutiveMissed} blocs manqués consécutifs au début`,
            'warning'
          );
        } else if (consecutiveMissed > this.lastAlertedConsecutiveMissed) {
          // Le nombre de blocs manqués a augmenté
          this.lastAlertedConsecutiveMissed = consecutiveMissed;
          this.createAlert(
            AlertType.CONSECUTIVE_BLOCKS_MISSED,
            `🚨 ALERT: ${consecutiveMissed} blocs manqués consécutifs au début (augmentation)`,
            'critical'
          );
        }
      } else if (this.isMissingBlocks) {
        // On est revenu en dessous du seuil
        this.isMissingBlocks = false;
        this.createAlert(
          AlertType.CONSECUTIVE_BLOCKS_MISSED,
          `✅ Récupération: Plus de blocs manqués consécutifs au début`,
          'info'
        );
      }
    }
    
    // Vérifier les heartbeats manqués consécutifs en utilisant heartbeatStatus
    if (this.metrics.heartbeatStatus && this.metrics.heartbeatStatus.length > 0) {
      let consecutiveHeartbeatsMissed = 0;
      
      // On ne regarde que les premiers heartbeats jusqu'à ce qu'on trouve un heartbeat signé
      for (const status of this.metrics.heartbeatStatus) {
        if (status === HeartbeatStatusType.Missed) {
          consecutiveHeartbeatsMissed++;
        } else {
          // Dès qu'on trouve un heartbeat signé, on arrête de compter
          break;
        }
      }
      
      // Vérifier si on dépasse le seuil
      if (consecutiveHeartbeatsMissed >= this.thresholds.consecutiveHeartbeatsMissed) {
        if (!this.isMissingHeartbeats) {
          // Premier dépassement du seuil
          this.isMissingHeartbeats = true;
          this.lastAlertedConsecutiveHeartbeatsMissed = consecutiveHeartbeatsMissed;
          this.createAlert(
            AlertType.CONSECUTIVE_HEARTBEATS_MISSED,
            `⚠️ ALERT: ${consecutiveHeartbeatsMissed} heartbeats manqués consécutifs au début`,
            'warning'
          );
        } else if (consecutiveHeartbeatsMissed > this.lastAlertedConsecutiveHeartbeatsMissed) {
          // Le nombre de heartbeats manqués a augmenté
          this.lastAlertedConsecutiveHeartbeatsMissed = consecutiveHeartbeatsMissed;
          this.createAlert(
            AlertType.CONSECUTIVE_HEARTBEATS_MISSED,
            `🚨 ALERT: ${consecutiveHeartbeatsMissed} heartbeats manqués consécutifs au début (augmentation)`,
            'critical'
          );
        }
      } else if (this.isMissingHeartbeats) {
        // On est revenu en dessous du seuil
        this.isMissingHeartbeats = false;
        this.createAlert(
          AlertType.CONSECUTIVE_HEARTBEATS_MISSED,
          `✅ Récupération: Plus de heartbeats manqués consécutifs au début`,
          'info'
        );
      }
    }
    
    // Calculate current rates
    const signRate = this.calculateSignRate();
    const heartbeatRate = this.calculateHeartbeatRate();
    
    // Vérifier le taux de signature
    if (signRate < this.thresholds.signRateThreshold) {
      if (!this.isLowSignRate) {
        // Premier dépassement du seuil
        this.isLowSignRate = true;
        this.lastAlertedSignRate = signRate;
        this.createAlert(
          AlertType.SIGN_RATE_LOW,
          `⚠️ ALERT: Taux de signature bas (${signRate.toFixed(2)}%)`,
          'warning'
        );
      } else if (signRate < this.lastAlertedSignRate) {
        // Le taux a baissé
        this.lastAlertedSignRate = signRate;
        this.createAlert(
          AlertType.SIGN_RATE_LOW,
          `🚨 ALERT: Taux de signature en baisse (${signRate.toFixed(2)}%)`,
          'critical'
        );
      }
    } else if (this.isLowSignRate) {
      // On est revenu au-dessus du seuil
      this.isLowSignRate = false;
      this.createAlert(
        AlertType.SIGN_RATE_LOW,
        `✅ Récupération: Taux de signature normal (${signRate.toFixed(2)}%)`,
        'info'
      );
    }
    
    // Vérifier le taux de heartbeat
    if (heartbeatRate < this.thresholds.heartbeatRateThreshold) {
      if (!this.isLowHeartbeatRate) {
        // Premier dépassement du seuil
        this.isLowHeartbeatRate = true;
        this.lastAlertedHeartbeatRate = heartbeatRate;
        this.createAlert(
          AlertType.HEARTBEAT_RATE_LOW,
          `⚠️ ALERT: Taux de heartbeat bas (${heartbeatRate.toFixed(2)}%)`,
          'warning'
        );
      } else if (heartbeatRate < this.lastAlertedHeartbeatRate) {
        // Le taux a baissé
        this.lastAlertedHeartbeatRate = heartbeatRate;
        this.createAlert(
          AlertType.HEARTBEAT_RATE_LOW,
          `🚨 ALERT: Taux de heartbeat en baisse (${heartbeatRate.toFixed(2)}%)`,
          'critical'
        );
      }
    } else if (this.isLowHeartbeatRate) {
      // On est revenu au-dessus du seuil
      this.isLowHeartbeatRate = false;
      this.createAlert(
        AlertType.HEARTBEAT_RATE_LOW,
        `✅ Récupération: Taux de heartbeat normal (${heartbeatRate.toFixed(2)}%)`,
        'info'
      );
    }
    
    // Check if node is disconnected
    if (prevMetrics.connected === true && this.metrics.connected === false) {
      this.createAlert(
        AlertType.NODE_DISCONNECTED,
        `🔴 CRITICAL ALERT: Node disconnected! Last error: ${this.metrics.lastError}`,
        'critical'
      );
    }
    
    // Check if node is reconnected
    if (prevMetrics.connected === false && this.metrics.connected === true) {
      this.createAlert(
        AlertType.NODE_RECONNECTED,
        `🟢 INFO: Node reconnected successfully!`,
        'info'
      );
    }
    
    // Analyze EVM votes
    if (this.metrics.evmVotesEnabled) {
      this.checkEvmVotes();
    }
    
    // Analyze AMPD votes
    if (this.metrics.ampdEnabled) {
      this.checkAmpdVotes();
      this.checkAmpdSignings();
    }
  }
  
  /**
   * Check missed EVM votes
   */
  private checkEvmVotes(): void {
    if (!this.metrics.evmVotes) return;
    
    console.log(`EVM votes check: chains=${Object.keys(this.metrics.evmVotes).join(',')}`);
    
    // Loop through all EVM chains
    Object.entries(this.metrics.evmVotes).forEach(([chain, chainData]) => {
      // If no votes or no pollIds, ignore
      if (!chainData || !chainData.pollIds || chainData.pollIds.length === 0) return;
      
      // On regarde tous les votes, pas seulement le plus récent
      let invalidCount = 0;
      let invalidPollIds = [];
      
      // Comptons combien de votes sont invalides
      for (const poll of chainData.pollIds) {
        if (poll.result === 'Invalid') {
          invalidCount++;
          invalidPollIds.push(poll.pollId || 'unknown');
        }
      }
      
      console.log(`Chain ${chain}: ${invalidCount}/${chainData.pollIds.length} invalid votes`);
      
      if (invalidCount > 0) {
        console.log(`  Invalid poll IDs: ${invalidPollIds.slice(0, 5).join(', ')}${invalidPollIds.length > 5 ? '...' : ''}`);
      }
      
      // Si le nombre de votes invalides dépasse le seuil, envoyer une alerte
      if (invalidCount >= this.thresholds.consecutiveEvmVotesMissed) {
        console.log(`Chain ${chain}: Threshold (${this.thresholds.consecutiveEvmVotesMissed}) exceeded, sending alert`);
        this.createAlert(
          AlertType.EVM_VOTE_MISSED,
          `⚠️ ALERT: ${invalidCount} EVM votes missed on chain ${chain}`,
          'warning'
        );
      }
    });
  }
  
  /**
   * Check missed AMPD votes
   */
  private checkAmpdVotes(): void {
    if (!this.metrics.ampdVotes) return;
    
    console.log(`AMPD votes check: chains=${Object.keys(this.metrics.ampdVotes).join(',')}`);
    
    // Loop through all AMPD chains
    Object.entries(this.metrics.ampdVotes).forEach(([chain, chainData]) => {
      if (!chainData || !chainData.pollIds || chainData.pollIds.length === 0) return;
      
      // On regarde tous les votes, pas seulement le plus récent
      let invalidCount = 0;
      let invalidVoteIds = [];
      
      // Comptons combien de votes sont invalides
      for (const vote of chainData.pollIds) {
        if (vote.result === 'not_found') {
          invalidCount++;
          invalidVoteIds.push(vote.pollId || 'unknown');
        }
      }
      
      console.log(`Chain ${chain}: ${invalidCount}/${chainData.pollIds.length} invalid votes`);
      
      if (invalidCount > 0) {
        console.log(`  Invalid vote IDs: ${invalidVoteIds.slice(0, 5).join(', ')}${invalidVoteIds.length > 5 ? '...' : ''}`);
      }
      
      // Si le nombre de votes invalides dépasse le seuil, envoyer une alerte
      if (invalidCount >= this.thresholds.consecutiveAmpdVotesMissed) {
        console.log(`Chain ${chain}: Threshold (${this.thresholds.consecutiveAmpdVotesMissed}) exceeded, sending alert`);
        this.createAlert(
          AlertType.AMPD_VOTE_MISSED,
          `⚠️ ALERT: ${invalidCount} AMPD votes missed on chain ${chain}`,
          'warning'
        );
      }
    });
  }
  
  /**
   * Check missed AMPD signings
   */
  private checkAmpdSignings(): void {
    if (!this.metrics.ampdSignings) return;
    
    console.log(`AMPD signings check: chains=${Object.keys(this.metrics.ampdSignings).join(',')}`);
    
    // Loop through all AMPD chains
    Object.entries(this.metrics.ampdSignings).forEach(([chain, chainData]) => {
      if (!chainData || !chainData.signingIds || chainData.signingIds.length === 0) return;
      
      // On regarde tous les signings, pas seulement le plus récent
      let unsubmitCount = 0;
      let unsubmitIds = [];
      const twoMinutesAgo = Date.now() - (2 * 60 * 1000); // 2 minutes en millisecondes
      
      // Comptons combien de signings sont manqués depuis plus de 2 minutes
      for (const signing of chainData.signingIds) {
        if (signing.result === 'unsubmit' && signing.timestamp) {
          const signingTime = new Date(signing.timestamp).getTime();
          if (signingTime < twoMinutesAgo) {
            unsubmitCount++;
            unsubmitIds.push(signing.signingId || 'unknown');
          }
        }
      }
      
      console.log(`Chain ${chain}: ${unsubmitCount}/${chainData.signingIds.length} unsubmit signings (plus de 2 minutes)`);
      
      if (unsubmitCount > 0) {
        console.log(`  Unsubmit signing IDs: ${unsubmitIds.slice(0, 5).join(', ')}${unsubmitIds.length > 5 ? '...' : ''}`);
      }
      
      // Si le nombre de signings manqués dépasse le seuil, envoyer une alerte
      if (unsubmitCount >= this.thresholds.consecutiveAmpdSigningsMissed) {
        console.log(`Chain ${chain}: Threshold (${this.thresholds.consecutiveAmpdSigningsMissed}) exceeded, sending alert`);
        this.createAlert(
          AlertType.AMPD_SIGNING_MISSED,
          `⚠️ ALERT: ${unsubmitCount} AMPD signings manqués depuis plus de 2 minutes sur la chaîne ${chain}`,
          'warning'
        );
      }
    });
  }
  
  /**
   * Calculate the signing rate
   */
  private calculateSignRate(): number {
    const totalSigned = this.metrics.totalSigned || 0;
    const totalMissed = this.metrics.totalMissed || 0;
    const totalBlocks = totalSigned + totalMissed;
    if (totalBlocks === 0) return 100;
    return (totalSigned / totalBlocks) * 100;
  }
  
  /**
   * Calculate the heartbeat rate
   */
  private calculateHeartbeatRate(): number {
    const heartbeatsSigned = this.metrics.heartbeatsSigned || 0;
    const heartbeatsMissed = this.metrics.heartbeatsMissed || 0;
    const totalHeartbeats = heartbeatsSigned + heartbeatsMissed;
    if (totalHeartbeats === 0) return 100;
    return (heartbeatsSigned / totalHeartbeats) * 100;
  }
  
  /**
   * Check if we can send an alert (cooldown period elapsed)
   */
  private canSendAlert(type: AlertType): boolean {
    const now = new Date();
    const lastAlert = this.lastAlertTimestamps[type];
    return (now.getTime() - lastAlert.getTime()) > this.cooldownPeriod;
  }
  
  /**
   * Create and send an alert
   */
  private createAlert(type: AlertType, message: string, severity: 'info' | 'warning' | 'critical'): void {
    // Check if we can send this alert type (cooldown)
    if (!this.canSendAlert(type)) {
      return;
    }
    
    // Update last alert timestamp
    this.lastAlertTimestamps[type] = new Date();
    
    // Create alert object
    const alert: Alert = {
      type,
      message,
      timestamp: new Date(),
      metrics: {
        ...this.metrics,
        // We intentionally exclude large arrays to keep alerts small
      },
      severity
    };
    
    // Send notifications (async)
    this.sendNotifications(alert).catch(err => {
      console.error('Failed to send alert notifications:', err);
    });
    
    // Emit event for clients
    this.emit('alert', alert);
    
    console.log(`Alert created: ${message}`);
  }
  
  /**
   * Send notifications through configured channels
   */
  private async sendNotifications(alert: Alert): Promise<void> {
    const formattedMessage = this.formatAlertMessage(alert);
    
    try {
      const promises: Promise<void>[] = [];
      
      // Send to Discord if enabled
      if (this.notificationConfig.discord.enabled && this.notificationConfig.discord.webhookUrl) {
        promises.push(this.sendDiscordNotification(formattedMessage, alert));
      }
      
      // Send to Telegram if enabled
      if (this.notificationConfig.telegram.enabled && 
          this.notificationConfig.telegram.botToken && 
          this.notificationConfig.telegram.chatId) {
        promises.push(this.sendTelegramNotification(formattedMessage, alert));
      }
      
      await Promise.all(promises);
    } catch (error) {
      console.error('Failed to send notifications:', error);
    }
  }
  
  /**
   * Format alert message for notifications
   */
  private formatAlertMessage(alert: Alert): string {
    const timestamp = alert.timestamp.toISOString();
    const metrics = alert.metrics;
    
    // Base message
    let message = `${alert.message}\n\nTimestamp: ${timestamp}\n`;
    
    // Add validator info if available
    if (metrics.moniker) {
      message += `Validator: ${metrics.moniker}\n`;
    }
    
    // Add detailed metrics based on alert type
    switch (alert.type) {
      case AlertType.CONSECUTIVE_BLOCKS_MISSED:
      case AlertType.SIGN_RATE_LOW:
        message += `\nBlock Metrics:\n`;
        message += `- Height: ${metrics.lastBlock || 0}\n`;
        const totalSigned = metrics.totalSigned || 0;
        const totalMissed = metrics.totalMissed || 0;
        message += `- Signed: ${totalSigned}/${totalSigned + totalMissed} (${this.calculateSignRate().toFixed(2)}%)\n`;
        message += `- Consecutive missed: ${metrics.consecutiveMissed || 0}\n`;
        break;
        
      case AlertType.CONSECUTIVE_HEARTBEATS_MISSED:
      case AlertType.HEARTBEAT_RATE_LOW:
        message += `\nHeartbeat Metrics:\n`;
        message += `- Current period: ${metrics.lastHeartbeatPeriod || 0}\n`;
        const heartbeatsSigned = metrics.heartbeatsSigned || 0;
        const heartbeatsMissed = metrics.heartbeatsMissed || 0;
        message += `- Signed: ${heartbeatsSigned}/${heartbeatsSigned + heartbeatsMissed} (${this.calculateHeartbeatRate().toFixed(2)}%)\n`;
        message += `- Consecutive missed: ${metrics.heartbeatsConsecutiveMissed || 0}\n`;
        break;
        
      case AlertType.NODE_DISCONNECTED:
        message += `\nConnection Error:\n${metrics.lastError || 'Unknown error'}\n`;
        message += `Last seen: ${metrics.lastBlockTime ? new Date(metrics.lastBlockTime).toISOString() : 'unknown'}\n`;
        break;
        
      case AlertType.NODE_RECONNECTED:
        message += `\nNode reconnected after being offline\n`;
        message += `- Current block height: ${metrics.lastBlock || 0}\n`;
        message += `- Last block time: ${metrics.lastBlockTime ? new Date(metrics.lastBlockTime).toISOString() : 'unknown'}\n`;
        break;
        
      case AlertType.EVM_VOTE_MISSED:
        // Extract chain from message
        const evmChainMatch = alert.message.match(/on chain ([^\s]+)/);
        const evmChain = evmChainMatch ? evmChainMatch[1] : null;
        
        if (evmChain && metrics.evmVotes && metrics.evmVotes[evmChain]) {
          message += `\nEVM Vote Details (${evmChain}):\n`;
          
          const polls = metrics.evmVotes[evmChain].pollIds;
          
          // Afficher les polls récents pour contexte
          message += `\nRecent Polls (5):\n`;
          polls.slice(0, 5).forEach((poll) => {
            message += `- ${poll.pollId || 'Unknown'}: ${poll.result || 'Unknown'}\n`;
          });
          
          // Afficher un résumé des statuts
          let validCount = 0;
          let invalidCount = 0;
          
          polls.forEach(poll => {
            if (poll.result === 'Invalid') {
              invalidCount++;
            } else if (poll.result === 'Validated') {
              validCount++;
            }
          });
          
          message += `\nSummary:\n`;
          message += `- Total polls: ${polls.length}\n`;
          message += `- Valid polls: ${validCount}\n`;
          message += `- Invalid polls: ${invalidCount}\n`;
        }
        break;
        
      case AlertType.EVM_VOTES_RECOVERED:
        const evmRecoveredChainMatch = alert.message.match(/on chain ([^\s]+)/);
        const evmRecoveredChain = evmRecoveredChainMatch ? evmRecoveredChainMatch[1] : null;
        
        if (evmRecoveredChain && metrics.evmVotes && metrics.evmVotes[evmRecoveredChain]) {
          message += `\nEVM Votes have recovered on chain ${evmRecoveredChain}\n`;
          
          // Afficher les 5 polls les plus récents pour contexte
          message += `\nRecent Polls:\n`;
          const recentPolls = metrics.evmVotes[evmRecoveredChain].pollIds.slice(0, 5);
          recentPolls.forEach((poll) => {
            message += `- Poll ${poll.pollId}: ${poll.result}\n`;
          });
        }
        break;
        
      case AlertType.AMPD_VOTE_MISSED:
        // Extract chain from message
        const ampdVoteChainMatch = alert.message.match(/on chain ([^\s]+)/);
        const ampdVoteChain = ampdVoteChainMatch ? ampdVoteChainMatch[1] : null;
        
        if (ampdVoteChain && metrics.ampdVotes && metrics.ampdVotes[ampdVoteChain]) {
          message += `\nAMPD Vote Details (${ampdVoteChain}):\n`;
          
          const votes = metrics.ampdVotes[ampdVoteChain].pollIds;
          
          // Afficher les votes récents pour contexte
          message += `\nRecent Votes (5):\n`;
          votes.slice(0, 5).forEach((vote) => {
            message += `- ${vote.pollId || 'Unknown'}: ${vote.result || 'Unknown'}\n`;
          });
          
          // Afficher un résumé des statuts
          let validCount = 0;
          let invalidCount = 0;
          
          votes.forEach(vote => {
            if (vote.result === 'invalid') {
              invalidCount++;
            } else if (vote.result === 'validated') {
              validCount++;
            }
          });
          
          message += `\nSummary:\n`;
          message += `- Total votes: ${votes.length}\n`;
          message += `- Valid votes: ${validCount}\n`;
          message += `- Invalid votes: ${invalidCount}\n`;
        }
        break;
        
      case AlertType.AMPD_VOTES_RECOVERED:
        const ampdVotesRecoveredChainMatch = alert.message.match(/on chain ([^\s]+)/);
        const ampdVotesRecoveredChain = ampdVotesRecoveredChainMatch ? ampdVotesRecoveredChainMatch[1] : null;
        
        if (ampdVotesRecoveredChain && metrics.ampdVotes && metrics.ampdVotes[ampdVotesRecoveredChain]) {
          message += `\nAMPD Votes have recovered on chain ${ampdVotesRecoveredChain}\n`;
          
          // Afficher les 5 votes les plus récents pour contexte
          message += `\nRecent Votes:\n`;
          const recentVotes = metrics.ampdVotes[ampdVotesRecoveredChain].pollIds.slice(0, 5);
          recentVotes.forEach((vote) => {
            message += `- ${vote.pollId}: ${vote.result}\n`;
          });
        }
        break;
        
      case AlertType.AMPD_SIGNING_MISSED:
        // Extract chain from message
        const ampdSigningChainMatch = alert.message.match(/on chain ([^\s]+)/);
        const ampdSigningChain = ampdSigningChainMatch ? ampdSigningChainMatch[1] : null;
        
        if (ampdSigningChain && metrics.ampdSignings && metrics.ampdSignings[ampdSigningChain]) {
          message += `\nAMPD Signing Details (${ampdSigningChain}):\n`;
          
          const signings = metrics.ampdSignings[ampdSigningChain].signingIds;
          
          // Afficher les signings récents pour contexte
          message += `\nRecent Signings (5):\n`;
          signings.slice(0, 5).forEach((signing) => {
            message += `- ${signing.signingId || 'Unknown'}: ${signing.result || 'Unknown'}\n`;
          });
          
          // Afficher un résumé des statuts
          let validCount = 0;
          let unsubmitCount = 0;
          
          signings.forEach(signing => {
            if (signing.result === 'unsubmit') {
              unsubmitCount++;
            } else if (signing.result === 'validated') {
              validCount++;
            }
          });
          
          message += `\nSummary:\n`;
          message += `- Total signings: ${signings.length}\n`;
          message += `- Valid signings: ${validCount}\n`;
          message += `- Unsubmit signings: ${unsubmitCount}\n`;
        }
        break;
        
      case AlertType.AMPD_SIGNINGS_RECOVERED:
        const ampdSigningsRecoveredChainMatch = alert.message.match(/on chain ([^\s]+)/);
        const ampdSigningsRecoveredChain = ampdSigningsRecoveredChainMatch ? ampdSigningsRecoveredChainMatch[1] : null;
        
        if (ampdSigningsRecoveredChain) {
          message += `\nAMPD Signings have recovered on chain ${ampdSigningsRecoveredChain}\n`;
          
          // Rechercher la chaîne dans ampdSignings, en essayant d'abord le nom exact extrait
          const chainData = metrics.ampdSignings && (
            metrics.ampdSignings[ampdSigningsRecoveredChain] || 
            // Si on ne trouve pas la chaîne exacte, on essaie les alternatives possibles
            Object.entries(metrics.ampdSignings).find(([key]) => 
              key === ampdSigningsRecoveredChain || 
              ampdSigningsRecoveredChain.includes(key) || 
              key.includes(ampdSigningsRecoveredChain)
            )?.[1]
          );
          
          if (chainData && chainData.signingIds) {
            // Afficher les 5 signings les plus récents pour contexte
            message += `\nRecent Signings:\n`;
            const recentSignings = chainData.signingIds.slice(0, 5);
            recentSignings.forEach((signing: AmpdSigning) => {
              message += `- Signing ID: ${signing.signingId || 'Unknown'}, Status: ${signing.result || 'Unknown'}\n`;
            });
          } else {
            message += `No signing data found for this chain.\n`;
          }
        }
        break;
    }
    
    return message;
  }
  
  /**
   * Send notification to Discord
   */
  private async sendDiscordNotification(message: string, alert: Alert): Promise<void> {
    try {
      // Discord color based on severity
      const colorMap = {
        'info': 0x3498db,    // Blue
        'warning': 0xf39c12,  // Orange
        'critical': 0xe74c3c  // Red
      };
      
      const payload = {
        embeds: [{
          title: `Axelar Validator Alert: ${alert.type}`,
          description: message,
          color: colorMap[alert.severity],
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
   * Send notification to Telegram
   */
  private async sendTelegramNotification(message: string, alert: Alert): Promise<void> {
    try {
      // Format message for Telegram with emoji based on severity
      const severityEmoji = {
        'info': 'ℹ️',
        'warning': '⚠️',
        'critical': '🚨'
      };
      
      const telegramMessage = `${severityEmoji[alert.severity]} *Axelar Validator Alert*\n\n${message}`;
      
      const url = `https://api.telegram.org/bot${this.notificationConfig.telegram.botToken}/sendMessage`;
      const payload = {
        chat_id: this.notificationConfig.telegram.chatId,
        text: telegramMessage,
        parse_mode: 'Markdown'
      };
      
      await axios.post(url, payload);
      console.log('Telegram notification sent successfully');
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
    }
  }
  
  /**
   * Start periodic checks of metrics
   */
  public startPeriodicChecks(intervalMs: number = 5000): void {
    setInterval(() => {
      this.checkMetrics();
    }, intervalMs);
    
    console.log(`Alert Manager started periodic checks with interval ${intervalMs}ms`);
  }
} 