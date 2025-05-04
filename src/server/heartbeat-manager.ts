import { EventEmitter } from 'events';
import { HEARTBEAT_PERIOD } from '../constants';

// Heartbeat configuration constants
export const TRY_CNT = 10; // Number of blocks to check per period

// Status types for heartbeat periods
export enum HeartbeatStatusType {
  Unknown = -1,   // No data yet for this period
  Missed = 0,     // Missed heartbeat
  Signed = 1      // Successfully signed heartbeat
}

// Interface for heartbeat updates
export interface HeartbeatUpdate {
  period: number;      // Period identifier
  periodStart: number; // Start block of period
  periodEnd: number;   // End block of period
  status: HeartbeatStatusType; // Period status
  foundAtBlock?: number; // Block where heartbeat was found (if signed)
  final: boolean;      // Indicates if status is final
}

// Interfaces for transactions and blocks
interface TxResult {
  height: string;
  tx?: string;
  result?: {
    log?: string;
  };
}

interface BlockData {
  block: {
    header: {
      height: string;
    };
  };
}

/**
 * Heartbeat logic manager
 * This class is responsible for detecting and tracking heartbeats
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
   * Process a transaction to detect heartbeats
   */
  public handleTransaction(txResult: TxResult): void {
    const height = parseInt(txResult.height);
    
    // Initialization - record first block
    if (this.firstBlockSeen === 0) {
      this.firstBlockSeen = height;
      this.currentPeriod = Math.floor(height / HEARTBEAT_PERIOD);
      console.log(`HeartbeatManager: First block seen is ${height}, current period: ${this.currentPeriod}`);
    }
    
    // Determine which HeartBeat period we are in
    const blockPeriod = Math.floor(height / HEARTBEAT_PERIOD);
    const periodStart = blockPeriod * HEARTBEAT_PERIOD;
    const periodEnd = (blockPeriod + 1) * HEARTBEAT_PERIOD - 1;
    const periodKey = `${periodStart}-${periodEnd}`;
    
    // HeartBeat detection
    let isHeartBeat = false;
    let decodedTx = '';
    let addressFound = false;
    
    // Search in raw TX
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
      } catch (error) {
        console.error("Error decoding transaction:", error);
      }
    }
    
    // Also check in raw_log
    if (isHeartBeat && !addressFound && txResult.result && txResult.result.log) {
      try {
        const logData = txResult.result.log;
        if (logData.includes(this.targetAddress)) {
          addressFound = true;
        }
      } catch (error) {
        console.error("Error checking log data:", error);
      }
    }
    
    // If it's a HeartBeat and our address is found
    if (isHeartBeat && addressFound) {
      if (!this.periodsFound.has(periodKey)) {
        this.periodsFound.set(periodKey, height);
        
        // Update heartbeat history
        this.updateHeartbeatStatus(blockPeriod, periodStart, periodEnd, HeartbeatStatusType.Signed, height, true);
        
        console.log(`HeartbeatManager: ✅ HeartBeat found for address ${this.targetAddress} at height ${height} (period ${periodKey})`);
      }
    }
  }

  /**
   * Process new block to detect heartbeat periods
   */
  public handleNewBlock(blockData: BlockData): void {
    try {
      if (!blockData?.block?.header?.height) {
        console.error('Invalid block structure:', blockData);
        return;
      }

      const height = parseInt(blockData.block.header.height);
      const currentPeriod = Math.floor(height / HEARTBEAT_PERIOD);
      
      // If it's the first block we see
      if (this.lastProcessedBlock === undefined) {
        this.lastProcessedBlock = height;
        this.currentPeriod = currentPeriod;
        console.log(`HeartbeatManager initialization: block ${height}, period ${currentPeriod}`);
        return;
      }
      
      // HeartBeat period logic
      const blockPeriod = Math.floor(height / HEARTBEAT_PERIOD);
      const periodStart = blockPeriod * HEARTBEAT_PERIOD;
      const periodEnd = (blockPeriod + 1) * HEARTBEAT_PERIOD - 1;
      const periodKey = `${periodStart}-${periodEnd}`;
      
      // If we just changed period and the previous one isn't validated
      if (blockPeriod > this.currentPeriod) {
        const prevPeriod = blockPeriod - 1;
        const prevPeriodStart = prevPeriod * HEARTBEAT_PERIOD;
        const prevPeriodEnd = periodStart - 1;
        const prevPeriodKey = `${prevPeriodStart}-${prevPeriodEnd}`;
        
        // Check if we have completed initialization
        if (!this.isInitialized) {
          this.isInitialized = true;
          console.log(`HeartbeatManager: ✅ INITIALIZATION COMPLETE: Checks will now start from period ${periodStart}-${periodEnd}`);
        } 
        // If we have completed initialization
        else {
          // Check if the previous period was missed
          if (!this.periodsFound.has(prevPeriodKey)) {
            // Mark this period as failed
            this.updateHeartbeatStatus(prevPeriod, prevPeriodStart, prevPeriodEnd, HeartbeatStatusType.Missed, undefined, true);
            console.log(`HeartbeatManager: ❌ FAILURE: HeartBeat NOT found in period ${prevPeriodKey}`);
          }
        }
        
        // Update current period
        this.currentPeriod = blockPeriod;
        console.log(`HeartbeatManager: ⏱️ New HeartBeat period started: ${periodKey}`);
      }
      
      // Check if we have exceeded the search window for a period without success
      const blockStartPlusWindow = periodStart + 1 + TRY_CNT;
      if (height === blockStartPlusWindow && !this.periodsFound.has(periodKey) && this.isInitialized) {
        console.log(`HeartbeatManager: ⚠️ HeartBeat window (${TRY_CNT} blocks) exceeded for period ${periodKey}, detection chances reduced`);
      }
    } catch (error) {
      console.error('Error while handling new block:', error);
    }
  }

  /**
   * Update heartbeat status in history
   */
  private updateHeartbeatStatus(
    period: number,
    periodStart: number,
    periodEnd: number,
    status: HeartbeatStatusType,
    foundAtBlock?: number,
    final: boolean = false
  ): void {
    // Update heartbeat history
    this.heartbeatHistory = [status, ...this.heartbeatHistory.slice(0, this.historySize - 1)];
    
    // Add block height to the beginning of block history and shift others
    this.heartbeatFoundAtBlocks = [foundAtBlock, ...this.heartbeatFoundAtBlocks.slice(0, this.historySize - 1)];
    
    // Emit update event
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
   * Get heartbeat status history
   */
  public getHeartbeatHistory(): HeartbeatStatusType[] {
    return [...this.heartbeatHistory];
  }

  /**
   * Get history of blocks where heartbeats were found
   */
  public getHeartbeatBlocks(): (number | undefined)[] {
    return [...this.heartbeatFoundAtBlocks];
  }
} 