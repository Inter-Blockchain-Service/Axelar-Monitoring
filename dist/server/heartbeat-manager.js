"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeartbeatManager = exports.HeartbeatStatusType = exports.TRY_CNT = void 0;
const events_1 = require("events");
const constants_1 = require("../constants");
// Heartbeat configuration constants
exports.TRY_CNT = 10; // Number of blocks to check per period
// Status types for heartbeat periods
var HeartbeatStatusType;
(function (HeartbeatStatusType) {
    HeartbeatStatusType[HeartbeatStatusType["Unknown"] = -1] = "Unknown";
    HeartbeatStatusType[HeartbeatStatusType["Missed"] = 0] = "Missed";
    HeartbeatStatusType[HeartbeatStatusType["Signed"] = 1] = "Signed"; // Successfully signed heartbeat
})(HeartbeatStatusType || (exports.HeartbeatStatusType = HeartbeatStatusType = {}));
/**
 * Heartbeat logic manager
 * This class is responsible for detecting and tracking heartbeats
 */
class HeartbeatManager extends events_1.EventEmitter {
    constructor(targetAddress, historySize = 700) {
        super();
        this.currentPeriod = 0;
        this.periodsFound = new Map();
        this.isInitialized = false;
        this.firstBlockSeen = 0;
        this.heartbeatHistory = [];
        this.heartbeatFoundAtBlocks = [];
        this.targetAddress = targetAddress;
        this.historySize = historySize;
        this.heartbeatHistory = Array(historySize).fill(HeartbeatStatusType.Unknown);
        this.heartbeatFoundAtBlocks = Array(historySize).fill(undefined);
    }
    /**
     * Process a transaction to detect heartbeats
     */
    handleTransaction(txResult) {
        const height = parseInt(txResult.height);
        // Initialization - record first block
        if (this.firstBlockSeen === 0) {
            this.firstBlockSeen = height;
            this.currentPeriod = Math.floor(height / constants_1.HEARTBEAT_PERIOD);
            console.log(`HeartbeatManager: First block seen is ${height}, current period: ${this.currentPeriod}`);
        }
        // Determine which HeartBeat period we are in
        const blockPeriod = Math.floor(height / constants_1.HEARTBEAT_PERIOD);
        const periodStart = blockPeriod * constants_1.HEARTBEAT_PERIOD;
        const periodEnd = (blockPeriod + 1) * constants_1.HEARTBEAT_PERIOD - 1;
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
            }
            catch (error) {
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
            }
            catch (error) {
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
    handleNewBlock(blockData) {
        var _a, _b;
        try {
            if (!((_b = (_a = blockData === null || blockData === void 0 ? void 0 : blockData.block) === null || _a === void 0 ? void 0 : _a.header) === null || _b === void 0 ? void 0 : _b.height)) {
                console.error('Invalid block structure:', blockData);
                return;
            }
            const height = parseInt(blockData.block.header.height);
            const currentPeriod = Math.floor(height / constants_1.HEARTBEAT_PERIOD);
            // If it's the first block we see
            if (this.lastProcessedBlock === undefined) {
                this.lastProcessedBlock = height;
                this.currentPeriod = currentPeriod;
                console.log(`HeartbeatManager initialization: block ${height}, period ${currentPeriod}`);
                return;
            }
            // HeartBeat period logic
            const blockPeriod = Math.floor(height / constants_1.HEARTBEAT_PERIOD);
            const periodStart = blockPeriod * constants_1.HEARTBEAT_PERIOD;
            const periodEnd = (blockPeriod + 1) * constants_1.HEARTBEAT_PERIOD - 1;
            const periodKey = `${periodStart}-${periodEnd}`;
            // If we just changed period and the previous one isn't validated
            if (blockPeriod > this.currentPeriod) {
                const prevPeriod = blockPeriod - 1;
                const prevPeriodStart = prevPeriod * constants_1.HEARTBEAT_PERIOD;
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
            const blockStartPlusWindow = periodStart + 1 + exports.TRY_CNT;
            if (height === blockStartPlusWindow && !this.periodsFound.has(periodKey) && this.isInitialized) {
                console.log(`HeartbeatManager: ⚠️ HeartBeat window (${exports.TRY_CNT} blocks) exceeded for period ${periodKey}, detection chances reduced`);
            }
        }
        catch (error) {
            console.error('Error while handling new block:', error);
        }
    }
    /**
     * Update heartbeat status in history
     */
    updateHeartbeatStatus(period, periodStart, periodEnd, status, foundAtBlock, final = false) {
        // Update heartbeat history
        this.heartbeatHistory = [status, ...this.heartbeatHistory.slice(0, this.historySize - 1)];
        // Add block height to the beginning of block history and shift others
        this.heartbeatFoundAtBlocks = [foundAtBlock, ...this.heartbeatFoundAtBlocks.slice(0, this.historySize - 1)];
        // Emit update event
        const update = {
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
    getHeartbeatHistory() {
        return [...this.heartbeatHistory];
    }
    /**
     * Get history of blocks where heartbeats were found
     */
    getHeartbeatBlocks() {
        return [...this.heartbeatFoundAtBlocks];
    }
}
exports.HeartbeatManager = HeartbeatManager;
