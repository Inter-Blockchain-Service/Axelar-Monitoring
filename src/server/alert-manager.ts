import axios from 'axios';
import { ValidatorMetrics } from './metrics';
import { EventEmitter } from 'events';
import { StatusType } from '../hooks/useMetrics';
import { HeartbeatStatusType } from '../hooks/useMetrics';

// Alert types
export enum AlertType {
  NODE_SYNC_ISSUE = 'node_sync_issue',
  NO_NEW_BLOCK = 'no_new_block',
  NODE_DISCONNECTED = 'node_disconnected',
  NODE_RECONNECTED = 'node_reconnected',
  CONSECUTIVE_BLOCKS_MISSED = 'consecutive_blocks_missed',
  SIGN_RATE_LOW = 'sign_rate_low',
  CONSECUTIVE_HEARTBEATS_MISSED = 'consecutive_heartbeats_missed',
  HEARTBEAT_RATE_LOW = 'heartbeat_rate_low',
  EVM_VOTE_MISSED = 'evm_vote_missed',
  EVM_VOTE_RATE_LOW = 'evm_vote_rate_low',
  EVM_VOTES_RECOVERED = 'evm_votes_recovered',
  AMPD_VOTE_MISSED = 'ampd_vote_missed',
  AMPD_VOTE_RATE_LOW = 'ampd_vote_rate_low',
  AMPD_VOTES_RECOVERED = 'ampd_votes_recovered',
  AMPD_SIGNING_MISSED = 'ampd_signing_missed',
  AMPD_SIGNING_RATE_LOW = 'ampd_signing_rate_low',
  AMPD_SIGNINGS_RECOVERED = 'ampd_signings_recovered',
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
  evmVoteRateThreshold: number;
  ampdVoteRateThreshold: number;
  ampdSigningRateThreshold: number;
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
  private lastAlertTimestamps: Record<string, Date> = {} as Record<string, Date>;
  private lastAlertSeverities: Record<string, 'info' | 'warning' | 'critical'> = {} as Record<string, 'info' | 'warning' | 'critical'>;
  private thresholds: AlertThresholds;
  private notificationConfig: NotificationConfig;
  private cooldownPeriod: number = 5 * 60 * 1000; // 5 minutes in milliseconds by default
  private reconnectToNode: (() => Promise<void>) | null = null;
  
  // State to track missed blocks
  private isMissingBlocks: boolean = false;
  private lastAlertedConsecutiveMissed: number = 0;
  
  // State to track missed heartbeats
  private isMissingHeartbeats: boolean = false;
  private lastAlertedConsecutiveHeartbeatsMissed: number = 0;
  
  // State to track low rates
  private isLowSignRate: boolean = false;
  private isLowHeartbeatRate: boolean = false;
  private lastAlertedSignRate: number = 0;
  private lastAlertedHeartbeatRate: number = 0;
  
  // State to track low vote and signing rates
  private evmVoteRateByChain: Record<string, { isLow: boolean; lastRate: number }> = {};
  private ampdVoteRateByChain: Record<string, { isLow: boolean; lastRate: number }> = {};
  private ampdSigningRateByChain: Record<string, { isLow: boolean; lastRate: number }> = {};
  
  // Counters for consecutive missed votes and signatures
  private evmConsecutiveMissedByChain: Record<string, number> = {};
  private ampdVotesConsecutiveMissedByChain: Record<string, number> = {};
  private ampdSigningsConsecutiveMissedByChain: Record<string, number> = {};
  
  private isNoNewBlockAlerted: boolean = false;
  private lastBlockHeight: number = 0;
  private readonly QUICK_RECONNECT_DELAY: number = 10 * 1000; // 10 seconds before first reconnection attempt
  private readonly ALERT_DELAY: number = 2 * 60 * 1000; // 2 minutes before alert
  
  constructor(metrics: ValidatorMetrics, reconnectToNode?: () => Promise<void>) {
    super();
    this.metrics = metrics;
    this.reconnectToNode = reconnectToNode || null;
    
    // Load configuration from environment variables
    this.thresholds = {
      consecutiveBlocksMissed: parseInt(process.env.ALERT_CONSECUTIVE_BLOCKS_THRESHOLD || '3', 10),
      consecutiveHeartbeatsMissed: parseInt(process.env.ALERT_CONSECUTIVE_HEARTBEATS_THRESHOLD || '2', 10),
      signRateThreshold: parseFloat(process.env.ALERT_SIGN_RATE_THRESHOLD || '98.5'),
      heartbeatRateThreshold: parseFloat(process.env.ALERT_HEARTBEAT_RATE_THRESHOLD || '98.0'),
      consecutiveEvmVotesMissed: parseInt(process.env.ALERT_CONSECUTIVE_EVM_VOTES_THRESHOLD || '3', 10),
      consecutiveAmpdVotesMissed: parseInt(process.env.ALERT_CONSECUTIVE_AMPD_VOTES_THRESHOLD || '3', 10),
      consecutiveAmpdSigningsMissed: parseInt(process.env.ALERT_CONSECUTIVE_AMPD_SIGNINGS_THRESHOLD || '3', 10),
      evmVoteRateThreshold: parseFloat(process.env.ALERT_EVM_VOTE_RATE_THRESHOLD || '98.0'),
      ampdVoteRateThreshold: parseFloat(process.env.ALERT_AMPD_VOTE_RATE_THRESHOLD || '98.0'),
      ampdSigningRateThreshold: parseFloat(process.env.ALERT_AMPD_SIGNING_RATE_THRESHOLD || '98.0')
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
    
    // Check if node is disconnected
    if (prevMetrics.connected === true && this.metrics.connected === false) {
      console.log('Node disconnected detected in checkMetrics');
      this.createAlert(
        AlertType.NODE_DISCONNECTED,
        `🔴 CRITICAL ALERT: Node disconnected! Last error: ${this.metrics.lastError}`,
        'critical'
      );
    }
    
    // Check if node is reconnected
    if (prevMetrics.connected === false && this.metrics.connected === true) {
      console.log('Node reconnected detected in checkMetrics');
      this.createAlert(
        AlertType.NODE_RECONNECTED,
        `🟢 INFO: Node reconnected successfully!`,
        'info'
      );
    }
    
    // Check for no new blocks
    if (this.metrics.lastBlock === this.lastBlockHeight) {
      const timeSinceLastBlock = Date.now() - this.metrics.lastBlockTime.getTime();
      
      // If still no new block after 2 minutes
      if (timeSinceLastBlock > this.ALERT_DELAY) {
        if (!this.isNoNewBlockAlerted) {
          this.isNoNewBlockAlerted = true;
          this.createAlert(
            AlertType.NO_NEW_BLOCK,
            `⚠️ ALERT: No new block detected for ${Math.floor(timeSinceLastBlock / 1000 / 60)} minutes`,
            'warning'
          );
        }
      }
    } else {
      this.lastBlockHeight = this.metrics.lastBlock;
      if (this.isNoNewBlockAlerted) {
        this.isNoNewBlockAlerted = false;
        this.createAlert(
          AlertType.NO_NEW_BLOCK,
          `✅ Recovery: New blocks are being received again`,
          'info'
        );
      }
    }
    
    // Check consecutive missed blocks using signStatus
    if (this.metrics.signStatus && this.metrics.signStatus.length > 0) {
      let consecutiveMissed = 0;
      
      // We only look at the first blocks until we find a signed block
      for (const status of this.metrics.signStatus) {
        if (status === StatusType.Missed) {
          consecutiveMissed++;
        } else {
          // As soon as we find a signed block, we stop counting
          break;
        }
      }
      
      // Check if we exceed the threshold
      if (consecutiveMissed >= this.thresholds.consecutiveBlocksMissed) {
        if (!this.isMissingBlocks) {
          // First threshold exceedance
          this.isMissingBlocks = true;
          this.lastAlertedConsecutiveMissed = consecutiveMissed;
          this.createAlert(
            AlertType.CONSECUTIVE_BLOCKS_MISSED,
            `⚠️ ALERT: ${consecutiveMissed} blocks missed`,
            'warning'
          );
        } else if (consecutiveMissed > this.lastAlertedConsecutiveMissed) {
          // The number of missed blocks has increased
          this.lastAlertedConsecutiveMissed = consecutiveMissed;
          this.createAlert(
            AlertType.CONSECUTIVE_BLOCKS_MISSED,
            `🚨 ALERT: ${consecutiveMissed} blocks missed in increase`,
            'critical'
          );
        }
      } else if (this.isMissingBlocks) {
        // On est revenu en dessous du seuil
        this.isMissingBlocks = false;
        this.createAlert(
          AlertType.CONSECUTIVE_BLOCKS_MISSED,
          `✅ Recovery: No more blocks missed`,
          'info'
        );
      }
    }
    
    // Check consecutive missed heartbeats using heartbeatStatus
    if (this.metrics.heartbeatStatus && this.metrics.heartbeatStatus.length > 0) {
      let consecutiveHeartbeatsMissed = 0;
      
      // We only look at the first heartbeats until we find a signed heartbeat
      for (const status of this.metrics.heartbeatStatus) {
        if (status === HeartbeatStatusType.Missed) {
          consecutiveHeartbeatsMissed++;
        } else {
          // As soon as we find a signed heartbeat, we stop counting
          break;
        }
      }
      
      // Check if we exceed the threshold
      if (consecutiveHeartbeatsMissed >= this.thresholds.consecutiveHeartbeatsMissed) {
        if (!this.isMissingHeartbeats) {
          // First threshold exceedance
          this.isMissingHeartbeats = true;
          this.lastAlertedConsecutiveHeartbeatsMissed = consecutiveHeartbeatsMissed;
          this.createAlert(
            AlertType.CONSECUTIVE_HEARTBEATS_MISSED,
            `⚠️ ALERT: ${consecutiveHeartbeatsMissed} heartbeats missed`,
            'warning'
          );
        } else if (consecutiveHeartbeatsMissed > this.lastAlertedConsecutiveHeartbeatsMissed) {
          // The number of missed heartbeats has increased
          this.lastAlertedConsecutiveHeartbeatsMissed = consecutiveHeartbeatsMissed;
          this.createAlert(
            AlertType.CONSECUTIVE_HEARTBEATS_MISSED,
            `🚨 ALERT: ${consecutiveHeartbeatsMissed} heartbeats missed in increase`,
            'critical'
          );
        }
      } else if (this.isMissingHeartbeats) {
        // On est revenu en dessous du seuil
        this.isMissingHeartbeats = false;
        this.createAlert(
          AlertType.CONSECUTIVE_HEARTBEATS_MISSED,
          `✅ Recovery: New heartbeats received`,
          'info'
        );
      }
    }
    
    // Calculate current rates
    const signRate = this.calculateSignRate();
    const heartbeatRate = this.calculateHeartbeatRate();
    
    // Check signature rate
    if (signRate < this.thresholds.signRateThreshold) {
      if (!this.isLowSignRate) {
        // First threshold exceedance
        this.isLowSignRate = true;
        this.lastAlertedSignRate = signRate;
        this.createAlert(
          AlertType.SIGN_RATE_LOW,
          `⚠️ ALERT: Low signature rate (${signRate.toFixed(2)}%)`,
          'warning'
        );
      } else if (signRate < this.lastAlertedSignRate) {
        // The rate has decreased
        this.lastAlertedSignRate = signRate;
        this.createAlert(
          AlertType.SIGN_RATE_LOW,
          `🚨 ALERT: Signature rate in decrease (${signRate.toFixed(2)}%)`,
          'critical'
        );
      }
    } else if (this.isLowSignRate) {
      // On est revenu au-dessus du seuil
      this.isLowSignRate = false;
      this.createAlert(
        AlertType.SIGN_RATE_LOW,
        `✅ Recovery: Normal signature rate (${signRate.toFixed(2)}%)`,
        'info'
      );
    }
    
    // Check heartbeat rate
    if (heartbeatRate < this.thresholds.heartbeatRateThreshold) {
      if (!this.isLowHeartbeatRate) {
        // First threshold exceedance
        this.isLowHeartbeatRate = true;
        this.lastAlertedHeartbeatRate = heartbeatRate;
        this.createAlert(
          AlertType.HEARTBEAT_RATE_LOW,
          `⚠️ ALERT: Low heartbeat rate (${heartbeatRate.toFixed(2)}%)`,
          'warning'
        );
      } else if (heartbeatRate < this.lastAlertedHeartbeatRate) {
        // The rate has decreased
        this.lastAlertedHeartbeatRate = heartbeatRate;
        this.createAlert(
          AlertType.HEARTBEAT_RATE_LOW,
          `🚨 ALERT: Heartbeat rate in decrease (${heartbeatRate.toFixed(2)}%)`,
          'critical'
        );
      }
    } else if (this.isLowHeartbeatRate) {
      // On est revenu au-dessus du seuil
      this.isLowHeartbeatRate = false;
      this.createAlert(
        AlertType.HEARTBEAT_RATE_LOW,
        `✅ Recovery: Normal heartbeat rate (${heartbeatRate.toFixed(2)}%)`,
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
    
    // Check rate-based alerts
    this.checkRateAlerts();
  }
  
  /**
   * Check missed EVM votes
   */
  private checkEvmVotes(): void {
    if (!this.metrics.evmVotes) return;
    
    // console.log(`EVM votes check: chains=${Object.keys(this.metrics.evmVotes).join(',')}`);
    
    // Loop through all EVM chains
    Object.entries(this.metrics.evmVotes).forEach(([chain, chainData]) => {
      if (!chainData || !chainData.pollIds || chainData.pollIds.length === 0) return;
      
      // We only look at recent consecutive missed votes
      let consecutiveMissed = 0;
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // 5 minutes in milliseconds
      
      // Go through votes from newest to oldest
      for (let i = 0; i < chainData.pollIds.length; i++) {
        const vote = chainData.pollIds[i];
        if (vote.result === 'invalid') {
          consecutiveMissed++;
        } else if (vote.result === 'unsubmitted' && vote.timestamp) {
          const voteTime = new Date(vote.timestamp).getTime();
          if (voteTime < fiveMinutesAgo) {
            consecutiveMissed++;
          }
        } else if (vote.result === 'validated') {
          break;
        }
      }
      
      // console.log(`Chain ${chain}: ${consecutiveMissed} consecutive missed votes on ${chainData.pollIds.length} recent votes`);
      
      // If the number of consecutive missed votes exceeds the warning threshold, send a warning alert
      if (consecutiveMissed >= this.thresholds.consecutiveEvmVotesMissed) {
        if (!this.evmConsecutiveMissedByChain[chain]) {
          this.evmConsecutiveMissedByChain[chain] = consecutiveMissed;
          console.log(`Chain ${chain}: Threshold (${this.thresholds.consecutiveEvmVotesMissed}) exceeded, sending warning alert`);
          this.createAlert(
            AlertType.EVM_VOTE_MISSED,
            `⚠️ ALERT: ${consecutiveMissed} consecutive missed EVM votes on chain ${chain}`,
            'warning',
            chain
          );
        } else if (consecutiveMissed > this.evmConsecutiveMissedByChain[chain]) {
          this.evmConsecutiveMissedByChain[chain] = consecutiveMissed;
          console.log(`Chain ${chain}: Increased to ${consecutiveMissed} missed votes, sending critical alert`);
          this.createAlert(
            AlertType.EVM_VOTE_MISSED,
            `🚨 ALERT: ${consecutiveMissed} consecutive missed EVM votes in increase on chain ${chain}`,
            'critical',
            chain
          );
        }
      } else if (this.evmConsecutiveMissedByChain[chain]) {
        // Check for valid votes in the most recent polls
        const hasNewValidVote = chainData.pollIds.some(vote => {
          if (vote.result === 'unsubmitted' && vote.timestamp) {
            const voteTime = new Date(vote.timestamp).getTime();
            if (voteTime > fiveMinutesAgo) return false;
          }
          // Nous considérons comme validés tous les votes avec le statut 'validated'
          // même si leur timestamp est plus ancien que fiveMinutesAgo
          return vote.result === 'validated';
        });

        if (hasNewValidVote) {
          this.evmConsecutiveMissedByChain[chain] = 0;
          console.log(`Chain ${chain}: Recovered from missed votes after receiving a valid vote`);
          this.createAlert(
            AlertType.EVM_VOTES_RECOVERED,
            `✅ Recovery: No more consecutive missed EVM votes on chain ${chain} after receiving a valid vote`,
            'info',
            chain
          );
        } else {
          console.log(`Chain ${chain}: Still in alert state, waiting for a valid vote`);
        }
      }
    });
  }
  
  /**
   * Check missed AMPD votes
   */
  private checkAmpdVotes(): void {
    if (!this.metrics.ampdVotes) return;
    
    // console.log(`AMPD votes check: chains=${Object.keys(this.metrics.ampdVotes).join(',')}`);
    
    // Loop through all AMPD chains
    Object.entries(this.metrics.ampdVotes).forEach(([chain, chainData]) => {
      if (!chainData || !chainData.pollIds || chainData.pollIds.length === 0) return;
      
      // We only look at recent consecutive missed votes
      let consecutiveMissed = 0;
      const twoMinutesAgo = Date.now() - (2 * 60 * 1000); // 1 minute in milliseconds
      
      // Go through votes from newest to oldest
      for (let i = 0; i < chainData.pollIds.length; i++) {
        const vote = chainData.pollIds[i];
        if (vote.result === 'not_found') {
          consecutiveMissed++;
        } else if (vote.result === 'unsubmit' && vote.timestamp) {
          const voteTime = new Date(vote.timestamp).getTime();
          if (voteTime < twoMinutesAgo) {
            consecutiveMissed++;
          }
        } else if (vote.result === 'succeeded_on_chain') {
          break;
        }
      }
      
      // console.log(`Chain ${chain}: ${consecutiveMissed} consecutive missed votes on ${chainData.pollIds.length} recent votes`);
      
      // If the number of consecutive missed votes exceeds the warning threshold, send a warning alert
      if (consecutiveMissed >= this.thresholds.consecutiveAmpdVotesMissed) {
        if (!this.ampdVotesConsecutiveMissedByChain[chain]) {
          this.ampdVotesConsecutiveMissedByChain[chain] = consecutiveMissed;
          console.log(`Chain ${chain}: Threshold (${this.thresholds.consecutiveAmpdVotesMissed}) exceeded, sending warning alert`);
          this.createAlert(
            AlertType.AMPD_VOTE_MISSED,
            `⚠️ ALERT: ${consecutiveMissed} consecutive missed AMPD votes on chain ${chain}`,
            'warning',
            chain
          );
        } else if (consecutiveMissed > this.ampdVotesConsecutiveMissedByChain[chain]) {
          this.ampdVotesConsecutiveMissedByChain[chain] = consecutiveMissed;
          console.log(`Chain ${chain}: Increased to ${consecutiveMissed} missed votes, sending critical alert`);
          this.createAlert(
            AlertType.AMPD_VOTE_MISSED,
            `🚨 ALERT: ${consecutiveMissed} consecutive missed AMPD votes in increase on chain ${chain}`,
            'critical',
            chain
          );
        }
      } else if (this.ampdVotesConsecutiveMissedByChain[chain]) {
        const hasNewValidVote = chainData.pollIds.some(vote => {
          if (vote.result === 'unsubmit' && vote.timestamp) {
            const voteTime = new Date(vote.timestamp).getTime();
            if (voteTime > twoMinutesAgo) return false;
          }
          // Nous considérons comme validés tous les votes avec le statut 'succeeded_on_chain'
          // même si leur timestamp est plus ancien que twoMinutesAgo
          return vote.result === 'succeeded_on_chain';
        });

        if (hasNewValidVote) {
          this.ampdVotesConsecutiveMissedByChain[chain] = 0;
          console.log(`Chain ${chain}: Recovered from missed votes after receiving a valid vote`);
          this.createAlert(
            AlertType.AMPD_VOTES_RECOVERED,
            `✅ Recovery: No more consecutive missed AMPD votes on chain ${chain} after receiving a valid vote`,
            'info',
            chain
          );
        } else {
          console.log(`Chain ${chain}: Still in alert state, waiting for a valid vote`);
        }
      }
    });
  }
  
  /**
   * Check missed AMPD signings
   */
  private checkAmpdSignings(): void {
    if (!this.metrics.ampdSignings) return;
    
    // console.log(`AMPD signings check: chains=${Object.keys(this.metrics.ampdSignings).join(',')}`);
    
    // Loop through all AMPD chains
    Object.entries(this.metrics.ampdSignings).forEach(([chain, chainData]) => {
      if (!chainData || !chainData.signingIds || chainData.signingIds.length === 0) return;
      
      // We only look at recent consecutive missed signings
      let consecutiveMissed = 0;
      const twoMinutesAgo = Date.now() - (2 * 60 * 1000); // 1 minute in milliseconds
      
      // Go through signings from newest to oldest
      for (let i = 0; i < chainData.signingIds.length; i++) {
        const signing = chainData.signingIds[i];
        if (signing.result === 'unsubmit' && signing.timestamp) {
          const signingTime = new Date(signing.timestamp).getTime();
          if (signingTime < twoMinutesAgo) {
            consecutiveMissed++;
          }
        } else if (signing.result === 'signed') {
          break;
        }
      }
      
      // console.log(`Chain ${chain}: ${consecutiveMissed} consecutive missed signings on ${chainData.signingIds.length} recent signings`);
      
      // If the number of consecutive missed signings exceeds the warning threshold, send a warning alert
      if (consecutiveMissed >= this.thresholds.consecutiveAmpdSigningsMissed) {
        if (!this.ampdSigningsConsecutiveMissedByChain[chain]) {
          this.ampdSigningsConsecutiveMissedByChain[chain] = consecutiveMissed;
          console.log(`Chain ${chain}: Threshold (${this.thresholds.consecutiveAmpdSigningsMissed}) exceeded, sending warning alert`);
          this.createAlert(
            AlertType.AMPD_SIGNING_MISSED,
            `⚠️ ALERT: ${consecutiveMissed} consecutive missed AMPD signings on chain ${chain}`,
            'warning',
            chain
          );
        } else if (consecutiveMissed > this.ampdSigningsConsecutiveMissedByChain[chain]) {
          this.ampdSigningsConsecutiveMissedByChain[chain] = consecutiveMissed;
          console.log(`Chain ${chain}: Increased to ${consecutiveMissed} missed signings, sending critical alert`);
          this.createAlert(
            AlertType.AMPD_SIGNING_MISSED,
            `🚨 ALERT: ${consecutiveMissed} consecutive missed AMPD signings in increase on chain ${chain}`,
            'critical',
            chain
          );
        }
      } else if (this.ampdSigningsConsecutiveMissedByChain[chain]) {
        const hasNewValidSigning = chainData.signingIds.some(signing => {
          if (signing.result === 'unsubmit' && signing.timestamp) {
            const signingTime = new Date(signing.timestamp).getTime();
            if (signingTime > twoMinutesAgo) return false;
          }
          // Nous considérons comme validés toutes les signatures avec le statut 'signed'
          // même si leur timestamp est plus ancien que twoMinutesAgo
          return signing.result === 'signed';
        });

        if (hasNewValidSigning) {
          this.ampdSigningsConsecutiveMissedByChain[chain] = 0;
          console.log(`Chain ${chain}: Recovered from missed signings after receiving a valid signing`);
          this.createAlert(
            AlertType.AMPD_SIGNINGS_RECOVERED,
            `✅ Recovery: No more consecutive missed AMPD signings on chain ${chain} after receiving a valid signing`,
            'info',
            chain
          );
        } else {
          console.log(`Chain ${chain}: Still in alert state, waiting for a valid signing`);
        }
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
   * Calculate EVM vote rate for a specific chain
   */
  private calculateEvmVoteRate(chain: string): number {
    if (!this.metrics.evmVotes || !this.metrics.evmVotes[chain]) return 100;
    
    const chainData = this.metrics.evmVotes[chain];
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    let validVotes = 0;
    let totalVotes = 0;
    
    chainData.pollIds.forEach(vote => {
      if (vote.timestamp && vote.result !== 'unknown') {
        const voteTime = new Date(vote.timestamp).getTime();
        // On ne compte que les votes matures (plus de 5 minutes)
        if (voteTime < fiveMinutesAgo) {
          totalVotes++;
          if (vote.result === 'validated') {
            validVotes++;
          }
        }
      }
    });
    
    if (totalVotes === 0) return 100;
    return (validVotes / totalVotes) * 100;
  }
  
  /**
   * Calculate AMPD vote rate for a specific chain
   */
  private calculateAmpdVoteRate(chain: string): number {
    if (!this.metrics.ampdVotes || !this.metrics.ampdVotes[chain]) return 100;
    
    const chainData = this.metrics.ampdVotes[chain];
    const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
    
    let validVotes = 0;
    let totalVotes = 0;
    
    chainData.pollIds.forEach(vote => {
      if (vote.timestamp && vote.result !== 'unknown') {
        const voteTime = new Date(vote.timestamp).getTime();
        // On ne compte que les votes matures (plus de 2 minutes)
        if (voteTime < twoMinutesAgo) {
          totalVotes++;
          if (vote.result === 'succeeded_on_chain') {
            validVotes++;
          }
        }
      }
    });
    
    if (totalVotes === 0) return 100;
    return (validVotes / totalVotes) * 100;
  }
  
  /**
   * Calculate AMPD signing rate for a specific chain
   */
  private calculateAmpdSigningRate(chain: string): number {
    if (!this.metrics.ampdSignings || !this.metrics.ampdSignings[chain]) return 100;
    
    const chainData = this.metrics.ampdSignings[chain];
    const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
    
    let validSignings = 0;
    let totalSignings = 0;
    
    chainData.signingIds.forEach(signing => {
      if (signing.timestamp && signing.result !== 'unknown') {
        const signingTime = new Date(signing.timestamp).getTime();
        // On ne compte que les signatures matures (plus de 2 minutes)
        if (signingTime < twoMinutesAgo) {
          totalSignings++;
          if (signing.result === 'signed') {
            validSignings++;
          }
        }
      }
    });
    
    if (totalSignings === 0) return 100;
    return (validSignings / totalSignings) * 100;
  }
  
  /**
   * Check metrics for rate-based alerts
   */
  private checkRateAlerts(): void {
    // Check EVM vote rates
    if (this.metrics.evmVotesEnabled && this.metrics.evmVotes) {
      Object.keys(this.metrics.evmVotes).forEach(chain => {
        const rate = this.calculateEvmVoteRate(chain);
        
        // Initialize state if necessary
        if (!this.evmVoteRateByChain[chain]) {
          this.evmVoteRateByChain[chain] = { isLow: false, lastRate: rate };
        }
        
        if (rate < this.thresholds.evmVoteRateThreshold) {
          if (!this.evmVoteRateByChain[chain].isLow) {
            // First threshold exceedance
            this.evmVoteRateByChain[chain].isLow = true;
            this.evmVoteRateByChain[chain].lastRate = rate;
            this.createAlert(
              AlertType.EVM_VOTE_RATE_LOW,
              `⚠️ ALERT: Low EVM vote rate (${rate.toFixed(2)}%) on chain ${chain}`,
              'warning',
              chain
            );
          } else if (rate < this.evmVoteRateByChain[chain].lastRate) {
            // The rate has decreased
            this.evmVoteRateByChain[chain].lastRate = rate;
            this.createAlert(
              AlertType.EVM_VOTE_RATE_LOW,
              `🚨 ALERT: EVM vote rate in decrease (${rate.toFixed(2)}%) on chain ${chain}`,
              'critical',
              chain
            );
          }
        } else if (this.evmVoteRateByChain[chain].isLow) {
          // On est revenu au-dessus du seuil
          this.evmVoteRateByChain[chain].isLow = false;
          this.createAlert(
            AlertType.EVM_VOTE_RATE_LOW,
            `✅ Recovery: Normal EVM vote rate (${rate.toFixed(2)}%) on chain ${chain}`,
            'info',
            chain
          );
        }
      });
    }

    // Check AMPD vote rates
    if (this.metrics.ampdEnabled && this.metrics.ampdVotes) {
      Object.keys(this.metrics.ampdVotes).forEach(chain => {
        const rate = this.calculateAmpdVoteRate(chain);
        
        // Initialize state if necessary
        if (!this.ampdVoteRateByChain[chain]) {
          this.ampdVoteRateByChain[chain] = { isLow: false, lastRate: rate };
        }
        
        if (rate < this.thresholds.ampdVoteRateThreshold) {
          if (!this.ampdVoteRateByChain[chain].isLow) {
            // First threshold exceedance
            this.ampdVoteRateByChain[chain].isLow = true;
            this.ampdVoteRateByChain[chain].lastRate = rate;
            this.createAlert(
              AlertType.AMPD_VOTE_RATE_LOW,
              `⚠️ ALERT: Low AMPD vote rate (${rate.toFixed(2)}%) on chain ${chain}`,
              'warning',
              chain
            );
          } else if (rate < this.ampdVoteRateByChain[chain].lastRate) {
            // The rate has decreased
            this.ampdVoteRateByChain[chain].lastRate = rate;
            this.createAlert(
              AlertType.AMPD_VOTE_RATE_LOW,
              `🚨 ALERT: AMPD vote rate in decrease (${rate.toFixed(2)}%) on chain ${chain}`,
              'critical',
              chain
            );
          }
        } else if (this.ampdVoteRateByChain[chain].isLow) {
          // On est revenu au-dessus du seuil
          this.ampdVoteRateByChain[chain].isLow = false;
          this.createAlert(
            AlertType.AMPD_VOTE_RATE_LOW,
            `✅ Recovery: Normal AMPD vote rate (${rate.toFixed(2)}%) on chain ${chain}`,
            'info',
            chain
          );
        }
      });
    }

    // Check AMPD signing rates
    if (this.metrics.ampdEnabled && this.metrics.ampdSignings) {
      Object.keys(this.metrics.ampdSignings).forEach(chain => {
        const rate = this.calculateAmpdSigningRate(chain);
        
        // Initialize state if necessary
        if (!this.ampdSigningRateByChain[chain]) {
          this.ampdSigningRateByChain[chain] = { isLow: false, lastRate: rate };
        }
        
        if (rate < this.thresholds.ampdSigningRateThreshold) {
          if (!this.ampdSigningRateByChain[chain].isLow) {
            // First threshold exceedance
            this.ampdSigningRateByChain[chain].isLow = true;
            this.ampdSigningRateByChain[chain].lastRate = rate;
            this.createAlert(
              AlertType.AMPD_SIGNING_RATE_LOW,
              `⚠️ ALERT: Low AMPD signing rate (${rate.toFixed(2)}%) on chain ${chain}`,
              'warning',
              chain
            );
          } else if (rate < this.ampdSigningRateByChain[chain].lastRate) {
            // The rate has decreased
            this.ampdSigningRateByChain[chain].lastRate = rate;
            this.createAlert(
              AlertType.AMPD_SIGNING_RATE_LOW,
              `🚨 ALERT: AMPD signing rate in decrease (${rate.toFixed(2)}%) on chain ${chain}`,
              'critical',
              chain
            );
          }
        } else if (this.ampdSigningRateByChain[chain].isLow) {
          // On est revenu au-dessus du seuil
          this.ampdSigningRateByChain[chain].isLow = false;
          this.createAlert(
            AlertType.AMPD_SIGNING_RATE_LOW,
            `✅ Recovery: Normal AMPD signing rate (${rate.toFixed(2)}%) on chain ${chain}`,
            'info',
            chain
          );
        }
      });
    }
  }
  
  /**
   * Check if we can send an alert (cooldown period elapsed)
   */
  private canSendAlert(type: AlertType, severity: 'info' | 'warning' | 'critical', chain?: string): boolean {
    const now = new Date();
    const alertKey = chain ? `${type}_${chain}` : type;
    const lastAlert = this.lastAlertTimestamps[alertKey];
    const lastSeverity = this.lastAlertSeverities[alertKey];

    // No cooldown for info alerts (return to normal)
    if (severity === 'info') {
      return true;
    }

    // If it's the first alert of this type or if severity has changed
    if (!lastAlert || lastSeverity !== severity) {
      return true;
    }

    // Check cooldown based on severity
    const cooldown = severity === 'critical' ? this.cooldownPeriod : this.cooldownPeriod * 2;
    return (now.getTime() - lastAlert.getTime()) > cooldown;
  }
  
  /**
   * Create and send an alert
   */
  private createAlert(type: AlertType, message: string, severity: 'info' | 'warning' | 'critical', chain?: string): void {
    // Check if we can send this alert type (cooldown)
    if (!this.canSendAlert(type, severity, chain)) {
      return;
    }
    
    // Update last alert timestamp and severity
    const alertKey = chain ? `${type}_${chain}` : type;
    this.lastAlertTimestamps[alertKey] = new Date();
    this.lastAlertSeverities[alertKey] = severity;
    
    // Create alert object
    const alert: Alert = {
      type,
      message,
      timestamp: new Date(),
      metrics: {
        ...this.metrics,
      },
      severity
    };
    
    // Send notifications (async)
    this.sendNotifications(alert).catch(err => {
      console.error('Failed to send alert notifications:', err);
    });
    
    // Emit event for clients
    this.emit('alert', alert);
    
    // console.log(`Alert created: ${message}`);
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
          
          // Show recent polls for context
          message += `\nRecent Polls (5):\n`;
          polls.slice(0, 5).forEach((poll) => {
            message += `- ${poll.pollId || 'Unknown'}: ${poll.result || 'Unknown'}\n`;
          });
          
          // Show status summary
          let validCount = 0;
          let invalidCount = 0;
          
          polls.forEach(poll => {
            if (poll.result === 'invalid') {
              invalidCount++;
            } else if (poll.result === 'validated') {
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
          
          // Show the 5 most recent polls for context
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
          
          // Show recent votes for context
          message += `\nRecent Votes (5):\n`;
          votes.slice(0, 5).forEach((vote) => {
            message += `- ${vote.pollId || 'Unknown'}: ${vote.result || 'Unknown'}\n`;
          });
          
          // Show status summary
          let validCount = 0;
          let invalidCount = 0;
          
          votes.forEach(vote => {
            if (vote.result === 'not_found') {
              invalidCount++;
            } else if (vote.result === 'succeeded_on_chain') {
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
          
          // Show the 5 most recent votes for context
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
          
          // Show recent signings for context
          message += `\nRecent Signings (5):\n`;
          signings.slice(0, 5).forEach((signing) => {
            message += `- ${signing.signingId || 'Unknown'}: ${signing.result || 'Unknown'}\n`;
          });
          
          // Show status summary
          let validCount = 0;
          let unsubmitCount = 0;
          
          signings.forEach(signing => {
            if (signing.result === 'unsubmit') {
              unsubmitCount++;
            } else if (signing.result === 'signed') {
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
          
          // Rechercher la chain in ampdSignings, trying exact name first, then alternative possibilities
          const chainData = metrics.ampdSignings && (
            metrics.ampdSignings[ampdSigningsRecoveredChain] || 
            // If exact chain not found, try alternative possibilities
            Object.entries(metrics.ampdSignings).find(([key]) => 
              key === ampdSigningsRecoveredChain || 
              ampdSigningsRecoveredChain.includes(key) || 
              key.includes(ampdSigningsRecoveredChain)
            )?.[1]
          );
          
          if (chainData && chainData.signingIds) {
            // Show the 5 most recent signings for context
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