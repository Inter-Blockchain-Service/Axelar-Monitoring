import { EventEmitter } from 'events';
import axios from 'axios';
import dotenv from 'dotenv';
import { bech32AddressMatches } from './utils';

// Load environment variables
dotenv.config();

// Maximum number of poll_ids to store per chain
const MAX_POLL_HISTORY = 200;

// Vote status type
export enum VoteStatusType {
  Unknown = 'unknown',
  Unsubmitted = 'unsubmitted',
  Validated = 'validated',
  Invalid = 'invalid'
}

// Interface to represent a poll
export interface PollStatus {
  pollId: string;
  result: VoteStatusType | string;
  timestamp?: string; // Date ISO string
  txHash?: string; // Vote transaction hash (when submitted by our broadcaster)
}

// Interface for chain data
export interface EvmVoteData {
  [chain: string]: {
    pollIds: PollStatus[];
  }
}

// Define interfaces for complex types
interface TxResult {
  events: Record<string, string[]>;
  height?: string;
  data?: {
    value?: {
      TxResult?: {
        result?: {
          log?: string;
        }
      }
    }
  }
}

interface TxMessage {
  "@type": string;
  messages?: TxMessage[];
  [key: string]: unknown;
}

interface EventAttribute {
  key: string;
  value: string;
}

interface LogEvent {
  type: string;
  attributes: EventAttribute[];
}

interface LogItem {
  events?: LogEvent[];
}

const VOTE_EVENTS_TYPE = '/axelar.evm.v1beta1.VoteEvents';
const VOTE_NO_EVENTS_TYPE = '/axelar.evm.v1beta1.VoteNoEvents';

/**
 * Classify an EVM vote payload using Axelar protocol semantics:
 * - VoteEvents with events[] non-empty = validator confirms proposed events (yes)
 * - VoteEvents with events[] empty = vote "no" (Axelarscan shows as No)
 * - VoteNoEvents = explicit reject / no matching events
 */
function classifyEvmVote(
  vote: unknown
): { status: VoteStatusType; chain?: string } | null {
  if (!vote || typeof vote !== 'object' || vote === null || !('@type' in vote)) {
    return null;
  }

  const voteType = vote['@type'] as string;
  const chain = 'chain' in vote && vote.chain !== undefined ? String(vote.chain) : undefined;

  if (voteType === VOTE_NO_EVENTS_TYPE) {
    return { status: VoteStatusType.Invalid, chain };
  }
  if (voteType === VOTE_EVENTS_TYPE) {
    if ('events' in vote && Array.isArray(vote.events)) {
      return {
        status: vote.events.length > 0 ? VoteStatusType.Validated : VoteStatusType.Invalid,
        chain,
      };
    }
    return { status: VoteStatusType.Validated, chain };
  }

  return null;
}

/** Extract poll_id and vote from RefundMsgRequest or VoteRequest shapes. */
function extractVotePayload(
  message: Record<string, unknown>
): { pollId: string | number; vote: unknown } | null {
  const msgType = message['@type'] as string | undefined;

  if (msgType === '/axelar.reward.v1beta1.RefundMsgRequest' && message.inner_message) {
    const inner = message.inner_message as Record<string, unknown>;
    if ('poll_id' in inner) {
      return { pollId: inner.poll_id as string | number, vote: inner.vote ?? null };
    }
    return null;
  }

  if (msgType === '/axelar.vote.v1beta1.VoteRequest' && 'poll_id' in message) {
    return { pollId: message.poll_id as string | number, vote: message.vote ?? null };
  }

  return null;
}

export class EvmVoteManager extends EventEmitter {
  private chainData: EvmVoteData = {};
  private lastGlobalPollId: number = 0;
  private validatorAddress: string;
  private apiEndpoint: string;
  private supportedChains: string[] = [];

  constructor(validatorAddress: string, apiEndpoint: string, supportedChains: string[] = []) {
    super();
    this.validatorAddress = validatorAddress;
    this.apiEndpoint = apiEndpoint;
    
    // Use provided supported chains or default list if empty
    this.supportedChains = supportedChains.length > 0 ? supportedChains : [
      'ethereum', 'binance',
      'polygon', 'avalanche',
      'fantom', 'moonbeam',
      'arbitrum', 'optimism',
      'base', 'mantle',
      'celo', 'kava',
      'filecoin', 'linea',
      'centrifuge', 'scroll',
      'immutable', 'fraxtal',
      'blast'
    ];

    // Initialize data structure for each chain
    this.supportedChains.forEach(chain => {
      this.chainData[chain.toLowerCase()] = {
        pollIds: Array(MAX_POLL_HISTORY).fill(undefined).map(() => ({
          pollId: "unknown",
          result: VoteStatusType.Unknown
        }))
      };
    });

    console.log(`EVM vote manager initialized for ${validatorAddress}`);
  }

  // Function to process transactions
  public handleTransaction(txResult: TxResult): void {
    // FIRST: Check if txResult.events contains poll_id information (for ConfirmGatewayTxs, etc.)
    if (txResult.events) {
      this.extractPollIdFromEvents(txResult.events);
    }
    
    // SECOND: Check if txResult.events contains vote information for our validator
    if (txResult.events && this.isOurVoteTransaction(txResult.events)) {
      const txHash = txResult.events['tx.hash']?.[0];
      if (txHash) {
        this.fetchAndProcessVoteTx(txHash);
      }
    }
    
    if (txResult.data && txResult.data.value && txResult.data.value.TxResult && txResult.data.value.TxResult.result && txResult.data.value.TxResult.result.log) {
      try {
        const logData = txResult.data.value.TxResult.result.log;
        
        // Check if log contains "poll_id" to detect all transaction types with poll_ids
        if (logData.includes('"poll_id"') || logData.includes('poll_id')) {
          
          try {
            const logs = JSON.parse(logData) as LogItem[];
            
            // Look for events that contain poll_id in attributes
            for (const log of logs) {
              if (log.events) {
                for (const event of log.events) {
                  // Filter transaction types we want to process
                  // Exclude vote events which are processed elsewhere
                  if (event.type !== 'axelar.vote.v1beta1.Voted' && event.attributes) {
                    // Variables to store chain and poll_id
                    let chain = null;
                    let pollId = null;
                    
                    // First extract the chain which is usually in a 'chain' attribute
                    for (const attr of event.attributes) {
                      if (attr.key === 'chain') {
                        chain = attr.value.replace(/^"(.*)"$/, '$1').replace(/\\"/g, '');
                        break;
                      }
                    }
                    
                    // Look for poll_id according to different structures
                    for (const attr of event.attributes) {
                      // Case 1: In a 'participants' attribute
                      if (attr.key === 'participants' && attr.value && attr.value.includes('poll_id')) {
                        try {
                          const participantsObj = JSON.parse(attr.value.replace(/\\"/g, '"'));
                          if (participantsObj.poll_id) {
                            pollId = participantsObj.poll_id;
                            break;
                          }
                        } catch (error) {
                          console.error("Error parsing participants attribute:", error);
                        }
                      }
                      // Case 2: In poll_mappings (as in ConfirmGatewayTxsStarted)
                      else if (attr.key === 'poll_mappings') {
                        try {
                          const pollMappings = attr.value;
                          // Try to parse poll_mappings to get poll_id
                          try {
                            const mappings = JSON.parse(pollMappings);
                            if (Array.isArray(mappings) && mappings.length > 0 && mappings[0].poll_id) {
                              pollId = mappings[0].poll_id;
                              break;
                            }
                          } catch (error) {
                            // If parsing fails, log the error and look for poll_id by regex
                            console.log("Failed to parse poll mappings JSON, falling back to regex:", error);
                            const pollIdMatch = pollMappings.match(/"poll_id"\s*:\s*"(\d+)"/);
                            if (pollIdMatch && pollIdMatch[1]) {
                              pollId = pollIdMatch[1];
                              break;
                            }
                          }
                        } catch (error) {
                          console.error("Error extracting poll_id:", error);
                        }
                      }
                    }
                    
                    // If we found both a chain and a poll_id, process them
                    if (chain && pollId) {
                      // Add poll_id to corresponding chain
                      this.addPollIdToChain(chain, pollId);
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error("Error parsing logs:", error);
          }
        }
      } catch (error) {
        // Log error but continue
        console.error("Error processing log data:", error);
      }
    }
  }

  // Function to extract poll_id from WebSocket events
  private extractPollIdFromEvents(events: Record<string, string[]>): void {
    try {
      // Look for poll_mappings in events (for ConfirmGatewayTxs, etc.)
      if (events['axelar.evm.v1beta1.ConfirmGatewayTxsStarted.poll_mappings']) {
        const pollMappingsArray = events['axelar.evm.v1beta1.ConfirmGatewayTxsStarted.poll_mappings'];
        const chainArray = events['axelar.evm.v1beta1.ConfirmGatewayTxsStarted.chain'];
        
        if (pollMappingsArray && pollMappingsArray.length > 0) {
          pollMappingsArray.forEach((pollMappingsStr, index) => {
            try {
              // Parse the poll_mappings JSON
              const pollMappings = JSON.parse(pollMappingsStr);
              
              if (Array.isArray(pollMappings) && pollMappings.length > 0) {
                pollMappings.forEach((mapping) => {
                  if (mapping.poll_id) {
                    const pollId = mapping.poll_id;
                    // Get corresponding chain
                    const chain = chainArray && chainArray[index] ? chainArray[index] : null;
                    
                    if (chain && pollId) {
                      console.log(`✅ Found poll_id ${pollId} for chain ${chain} in WebSocket events`);
                      this.addPollIdToChain(chain, pollId);
                    }
                  }
                });
              }
            } catch (error) {
              console.error("Error parsing poll_mappings from WebSocket events:", error);
            }
          });
        }
      }
      
      // Also check for other event types that might contain poll_id
      // (like ConfirmDepositStarted, etc.)
      for (const [eventKey, eventValues] of Object.entries(events)) {
        if (eventKey.includes('poll_id') && !eventKey.includes('poll_mappings')) {
          // Direct poll_id event
          const chainKey = eventKey.replace('.poll_id', '.chain');
          if (events[chainKey]) {
            eventValues.forEach((pollId, index) => {
              const chain = events[chainKey][index];
              if (chain && pollId) {
                console.log(`✅ Found poll_id ${pollId} for chain ${chain} in event ${eventKey}`);
                this.addPollIdToChain(chain, pollId);
              }
            });
          }
        }
      }
    } catch (error) {
      console.error("Error extracting poll_id from WebSocket events:", error);
    }
  }

  // Function to add a new poll_id to a chain
  private normalizePollId(pollId: string | number | null | undefined): string {
    if (pollId === null || pollId === undefined) return 'unknown';
    return String(pollId).replace(/"/g, '');
  }

  private addPollIdToChain(chain: string, pollId: string): boolean {
    if (!chain) return false;
    
    const cleanPollId = this.normalizePollId(pollId);
    if (cleanPollId === 'unknown') return false;

    // Normalize chain name
    const normalizedChain = chain.toLowerCase().replace(/[\"\\]/g, '');
    
    // Check if chain is supported
    if (this.chainData[normalizedChain]) {
      // Check if this poll_id already exists in our history
      const existingIndex = this.chainData[normalizedChain].pollIds.findIndex(item => 
        item.pollId === cleanPollId && item.pollId !== "unknown"
      );
      
      if (existingIndex >= 0) {
        return false;
      }
      
      // Convert poll_id to number for validation
      const numericPollId = parseInt(cleanPollId, 10);
      
      // Update last known global poll_id
      if (!isNaN(numericPollId)) {
        this.lastGlobalPollId = numericPollId;
      }
      
      // Add new poll_id to the beginning of the array and remove the oldest
      this.chainData[normalizedChain].pollIds.unshift({
        pollId: cleanPollId,
        result: VoteStatusType.Unsubmitted,
        timestamp: new Date().toISOString()
      });
      
      // Limit array size
      if (this.chainData[normalizedChain].pollIds.length > MAX_POLL_HISTORY) {
        this.chainData[normalizedChain].pollIds.pop();
      }

      // Emit event to notify of update
      this.emit('vote-update', {
        chain: normalizedChain,
        pollIds: this.chainData[normalizedChain].pollIds,
        lastGlobalPollId: this.lastGlobalPollId
      });
      
      return true;
    }
    
    return false;
  }

  /**
   * WS detection: is this tx one of our broadcaster's EVM votes?
   *
   * Canonical signal: axelar.vote.v1beta1.Voted (poll + voter on-chain).
   * RefundMsgRequest is only the gas-refund envelope in the tx body — also used by
   * multisig signatures; do not use it as the primary discriminator.
   *
   * TODO(explore): once Voted.voter is stable in prod WS events, drop the RefundMsgRequest /
   * BatchRequest fallbacks below and rely solely on Voted.voter (+ bech32 normalization).
   */
  private isOurVoteTransaction(events: Record<string, string[]>): boolean {
    const address = this.validatorAddress;

    if (events['axelar.vote.v1beta1.Voted.voter']?.some(voter => bech32AddressMatches(voter, address))) {
      return true;
    }

    // --- Fallback safety net (see TODO above) ---
    const senderKeys = ['message.sender', 'tx.fee_payer'];
    const isOurSender = senderKeys.some(key =>
      events[key]?.some(value => bech32AddressMatches(value, address))
    );
    if (!isOurSender) {
      return false;
    }

    const hasVoteEvent = Boolean(events['axelar.vote.v1beta1.Voted.voter']?.length);
    const hasSignatureSubmitted = Boolean(
      events['axelar.multisig.v1beta1.SignatureSubmitted.sig_id']?.length
    );
    if (hasSignatureSubmitted && !hasVoteEvent) {
      return false;
    }

    const isRefundVote = events['message.action']?.some(
      action => action.includes('/axelar.reward.v1beta1.RefundMsgRequest')
    );
    if (isRefundVote) {
      return true;
    }

    const isBatchVote = events['message.action']?.some(
      action => action.includes('/axelar.auxiliary.v1beta1.BatchRequest')
    );
    return Boolean(isBatchVote);
  }

  private logUnknownPollVote(
    pollId: string,
    chain: string | undefined,
    newStatus: VoteStatusType,
    txHash?: string
  ): void {
    const chainLabel = chain ?? 'unknown chain';
    const txLabel = txHash ? ` (tx: ${txHash})` : '';
    console.warn(
      `Vote for unknown poll ${pollId} on ${chainLabel} → status ${newStatus}${txLabel}. ` +
      `Poll creation event may have been missed or chain is not monitored.`
    );
  }

  // Fetch transaction details and process vote messages
  private fetchAndProcessVoteTx(txHash: string): void {
    this.getTxByHash(txHash)
      .then(txDetails => {
        try {
          if (!txDetails) {
            console.log(`⚠️ No details for transaction ${txHash}`);
            return;
          }

          const messages = txDetails.tx.body.messages;
          if (!messages || messages.length === 0) {
            console.log("⚠️ No messages found in transaction");
            return;
          }

          if (messages[0]["@type"] === "/axelar.auxiliary.v1beta1.BatchRequest") {
            const batchMessages = messages[0].messages;
            if (batchMessages && batchMessages.length > 0) {
              batchMessages.forEach((batchMsg: TxMessage) => {
                this.processVoteMessage(batchMsg, txHash);
              });
            } else {
              console.log("⚠️ No messages in BatchRequest");
            }
          } else {
            this.processVoteMessage(messages[0], txHash);
          }
        } catch (error) {
          console.error("❌ Error processing vote:", error);
        }
      })
      .catch(error => {
        console.error("❌ Error requesting transaction details:", error instanceof Error ? error.message : 'Unknown error');
      });
  }

  // Get transaction details by hash
  private async getTxByHash(txHash: string): Promise<{tx: {body: {messages: TxMessage[]}}} | null> {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds delay between attempts
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = `${this.apiEndpoint}/cosmos/tx/v1beta1/txs/${txHash}`;
        
        const response = await axios.get(url);
        
        if (response.status === 200) {
          return response.data;
        } else {
          return null;
        }
      } catch (error: unknown) {
        // If transaction is not yet indexed (404), retry after delay
        if (typeof error === 'object' && error !== null && 'response' in error &&
            typeof error.response === 'object' && error.response !== null && 'status' in error.response) {
          const axiosError = error as {response: {status: number}};
          if (axiosError.response.status === 404) {
            console.log(`💬 Tx ${txHash} not yet indexed, attempt ${attempt}/${maxRetries}...`);
            
            // If not the last attempt, wait and retry
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue;
            }
          }
        }
        
        console.error(`❌ Error requesting transaction ${txHash}:`, error instanceof Error ? error.message : 'Unknown error');
        return null;
      }
    }
    
    return null;
  }

  // Function to process an individual vote message
  private processVoteMessage(message: unknown, txHash: string) {
    try {
      if (typeof message !== 'object' || message === null || !('@type' in message)) {
        return;
      }

      console.log(`📋 Processing message type: ${message['@type']}`);

      const payload = extractVotePayload(message as Record<string, unknown>);
      if (!payload) {
        console.log(`⚠️ Unsupported message type: ${message['@type']}`);
        return;
      }

      const pollId = this.normalizePollId(payload.pollId);
      const classification = classifyEvmVote(payload.vote);

      if (!classification) {
        const voteType =
          payload.vote && typeof payload.vote === 'object' && payload.vote !== null && '@type' in payload.vote
            ? payload.vote['@type']
            : 'unknown';
        console.log(`⚠️ Unsupported vote type: ${voteType}`);
        console.log(`📦 Vote object:`, JSON.stringify(payload.vote, null, 2));
        return;
      }

      this.updatePollStatus(pollId, classification.status, classification.chain, txHash);
    } catch (error) {
      console.error("Error processing individual message:", error);
    }
  }

  // Function to update a poll_id status
  private updatePollStatus(
    pollId: string,
    newStatus: VoteStatusType,
    chain?: string,
    txHash?: string
  ): boolean {
    const cleanPollId = this.normalizePollId(pollId);
    if (!cleanPollId || cleanPollId === 'unknown') return false;
    
    let updated = false;

    const applyUpdate = (poll: PollStatus): boolean => {
      const canUpdate =
        poll.result === VoteStatusType.Unsubmitted ||
        (poll.result === VoteStatusType.Invalid && newStatus === VoteStatusType.Validated) ||
        (poll.result === VoteStatusType.Validated && newStatus === VoteStatusType.Invalid);

      if (!canUpdate) {
        return false;
      }

      poll.result = newStatus;
      if (txHash) {
        poll.txHash = txHash;
      }
      return true;
    };
    
    // If a chain is specified, update only that chain
    if (chain) {
      const normalizedChain = chain.toLowerCase().replace(/[\"\\]/g, '');
      if (this.chainData[normalizedChain]) {
        const pollIndex = this.chainData[normalizedChain].pollIds.findIndex(item => 
          item.pollId === cleanPollId && item.pollId !== "unknown"
        );
        
        if (pollIndex >= 0) {
          updated = applyUpdate(this.chainData[normalizedChain].pollIds[pollIndex]);
          
          if (updated) {
            this.emit('vote-update', {
              chain: normalizedChain,
              pollIds: this.chainData[normalizedChain].pollIds,
              lastGlobalPollId: this.lastGlobalPollId
            });
            return true;
          }
        }
      }
    }
    
    // If no update was made or no chain is specified, search in all chains
    for (const chainName of this.supportedChains) {
      const normalizedChain = chainName.toLowerCase();
      const chainData = this.chainData[normalizedChain];
      
      if (chainData) {
        const pollIndex = chainData.pollIds.findIndex(item => 
          item.pollId === cleanPollId && item.pollId !== "unknown"
        );
        
        if (pollIndex >= 0) {
          updated = applyUpdate(chainData.pollIds[pollIndex]);
          
          if (updated) {
            this.emit('vote-update', {
              chain: normalizedChain,
              pollIds: this.chainData[normalizedChain].pollIds,
              lastGlobalPollId: this.lastGlobalPollId
            });
          }
          
          break;
        }
      }
    }

    if (!updated) {
      this.logUnknownPollVote(cleanPollId, chain, newStatus, txHash);
    }

    return updated;
  }

  /**
   * Get vote data for a specific chain
   */
  public getChainVotes(chain: string): PollStatus[] | null {
    const normalizedChain = chain.toLowerCase();
    return this.chainData[normalizedChain]?.pollIds || null;
  }

  /**
   * Get all vote data for all chains
   */
  public getAllVotes(): EvmVoteData {
    return this.chainData;
  }

  /**
   * Get the last global poll ID
   */
  public getLastGlobalPollId(): number {
    return this.lastGlobalPollId;
  }
} 