import { EventEmitter } from 'events';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// List of supported chains from the .env file
const SUPPORTED_CHAINS = process.env.EVM_SUPPORTED_CHAINS 
  ? process.env.EVM_SUPPORTED_CHAINS.split(',').map(chain => chain.trim()) 
  : [
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
  ]; // Default values if not defined in .env


// Maximum number of poll_ids to store per chain
const MAX_POLL_HISTORY = 35;

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
}

// Interface for chain data
export interface EvmVoteData {
  [chain: string]: {
    pollIds: PollStatus[];
  }
}

export class EvmVoteManager extends EventEmitter {
  private chainData: EvmVoteData = {};
  private lastGlobalPollId: number = 0;
  private validatorAddress: string;
  private apiEndpoint: string;

  constructor(validatorAddress: string, apiEndpoint: string) {
    super();
    this.validatorAddress = validatorAddress;
    this.apiEndpoint = apiEndpoint;

    // Initialize data structure for each chain
    SUPPORTED_CHAINS.forEach(chain => {
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
  public handleTransaction(txResult: any): void {
    const height = parseInt(txResult.height);

    
    // Check if txResult.events contains vote information for our validator
    if (txResult.events && 
        txResult.events['axelar.vote.v1beta1.Voted.voter'] &&
        txResult.events['axelar.vote.v1beta1.Voted.voter'].some((voter: string) => voter.includes(this.validatorAddress))) {
        
      // Get transaction hash
      if (txResult.events['tx.hash'] && txResult.events['tx.hash'].length > 0) {
        const txHash = txResult.events['tx.hash'][0];
        
        // Query Axelar API for transaction details
        this.getTxByHash(txHash)
          .then(txDetails => {
            try {
              // Check if it's a BatchRequest or a direct message
              if (!txDetails) {
                console.log(`⚠️ No details for transaction ${txHash}`);
                return;
              }
              
              const messages = txDetails.tx.body.messages;
              if (!messages || messages.length === 0) {
                console.log("⚠️ No messages found in transaction");
                return;
              }

              // Process differently based on message type
              if (messages[0]["@type"] === "/axelar.auxiliary.v1beta1.BatchRequest") {
                const batchMessages = messages[0].messages;
                
                if (batchMessages && batchMessages.length > 0) {
                  console.log(`📝 Processing ${batchMessages.length} messages in batch`);
                  // Process each message in the batch
                  batchMessages.forEach((batchMsg: any, index: number) => {
                    console.log(`📝 Processing message ${index + 1}/${batchMessages.length} from batch`);
                    this.processVoteMessage(batchMsg);
                  });
                } else {
                  console.log("⚠️ No messages in BatchRequest");
                }
              } else {
                // Case of a single message
                console.log(`📝 Processing direct message of type ${messages[0]["@type"]}`);
                this.processVoteMessage(messages[0]);
              }
            } catch (e) {
              console.error("❌ Error processing vote:", e);
            }
          })
          .catch(error => {
            console.error("❌ Error requesting transaction details:", error);
          });
      }
    }
    
    if (txResult.data && txResult.data.value && txResult.data.value.TxResult && txResult.data.value.TxResult.result && txResult.data.value.TxResult.result.log) {
      try {
        const logData = txResult.data.value.TxResult.result.log;
        
        // Check if log contains "poll_id" to detect all transaction types with poll_ids
        if (logData.includes('"poll_id"') || logData.includes('poll_id')) {
          
          try {
            const logs = JSON.parse(logData);
            
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
                        } catch (e) {
                          console.error("Error parsing participants attribute:", e);
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
                          } catch (e) {
                            // If parsing fails, look for poll_id by regex
                            const pollIdMatch = pollMappings.match(/"poll_id"\s*:\s*"(\d+)"/);
                            if (pollIdMatch && pollIdMatch[1]) {
                              pollId = pollIdMatch[1];
                              break;
                            }
                          }
                        } catch (e) {
                          console.error("Error extracting poll_id:", e);
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
          } catch (e) {
            console.error("Error parsing logs:", e);
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
  }

  // Function to add a new poll_id to a chain
  private addPollIdToChain(chain: string, pollId: string): boolean {
    if (!chain) return false;
    
    // Normalize chain name
    const normalizedChain = chain.toLowerCase().replace(/[\"\\]/g, '');
    
    // Check if chain is supported
    if (this.chainData[normalizedChain]) {
      // Check if this poll_id already exists in our history
      const existingIndex = this.chainData[normalizedChain].pollIds.findIndex(item => 
        item.pollId === pollId && item.pollId !== "unknown"
      );
      
      // If poll_id already exists, don't add it again
      if (existingIndex >= 0) {
        return false;
      }
      
      // Convert poll_id to number for validation
      const numericPollId = parseInt(pollId, 10);
      
      // Check if poll_id increments by 1 from last global poll
      if (this.lastGlobalPollId > 0 && numericPollId !== this.lastGlobalPollId + 1) {
        console.log(`\n⚠️ ALERT - NON-SEQUENTIAL GLOBAL POLL ID`);
        console.log(`   Last global Poll ID: ${this.lastGlobalPollId}`);
        console.log(`   New Poll ID: ${numericPollId}`);
        console.log(`   Gap: ${numericPollId - this.lastGlobalPollId}`);
        console.log(`   Chain: ${normalizedChain.toUpperCase()}`);
      }
      
      // Update last known global poll_id
      if (!isNaN(numericPollId)) {
        this.lastGlobalPollId = numericPollId;
      }
      
      // Add new poll_id to the beginning of the array and remove the oldest
      this.chainData[normalizedChain].pollIds.unshift({
        pollId: pollId,
        result: VoteStatusType.Unsubmitted
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

  // Get transaction details by hash
  private async getTxByHash(txHash: string) {
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
      } catch (error: any) {
        // If transaction is not yet indexed (404), retry after delay
        if (error.response && error.response.status === 404) {
          console.log(`💬 Tx ${txHash} not yet indexed, attempt ${attempt}/${maxRetries}...`);
          
          // If not the last attempt, wait and retry
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        }
        
        console.error(`❌ Error requesting transaction ${txHash}:`, error.message);
        return null;
      }
    }
    
    return null;
  }

  // Function to process an individual vote message
  private processVoteMessage(message: any) {
    try {
      // Check if it's a RefundMsgRequest containing a VoteRequest
      if (message["@type"] === "/axelar.reward.v1beta1.RefundMsgRequest" && message.inner_message) {
        const innerMessage = message.inner_message;
        
        if (innerMessage.poll_id) {
          const pollId = innerMessage.poll_id;
          const vote = innerMessage.vote;
          
          if (vote && vote["@type"] === "/axelar.evm.v1beta1.VoteEvents") {
            const voteChain = vote.chain;
            const events = vote.events;
            
            // Check if vote is valid
            let isValid = false;
            if (events && events.length > 0) {
              // Check that chain in events matches the one in vote
              isValid = events.some((event: any) => event.chain === voteChain);
            }
            
            // Determine status based on validity
            const status = isValid ? VoteStatusType.Validated : VoteStatusType.Invalid;
            
            // Update poll status
            this.updatePollStatus(pollId, status, voteChain);
          } else {
            console.log(`Unsupported vote type: ${vote?.["@type"] || "unknown"}`);
          }
        } else {
          console.log("No poll_id found in inner_message");
        }
      } else {
        console.log(`Unsupported message type: ${message["@type"]}`);
      }
    } catch (e) {
      console.error("Error processing individual message:", e);
    }
  }

  // Function to update a poll_id status
  private updatePollStatus(pollId: string, newStatus: VoteStatusType, chain?: string): boolean {
    if (!pollId) return false;
    
    let updated = false;
    
    // If a chain is specified, update only that chain
    if (chain) {
      const normalizedChain = chain.toLowerCase();
      if (this.chainData[normalizedChain]) {
        // Find poll index
        const pollIndex = this.chainData[normalizedChain].pollIds.findIndex(item => 
          item.pollId === pollId && item.pollId !== "unknown"
        );
        
        // If found, update its status
        if (pollIndex >= 0) {
          const oldStatus = this.chainData[normalizedChain].pollIds[pollIndex].result;
          this.chainData[normalizedChain].pollIds[pollIndex].result = newStatus;
          updated = true;
          
          // Emit event to notify of update
          this.emit('vote-update', {
            chain: normalizedChain,
            pollIds: this.chainData[normalizedChain].pollIds,
            lastGlobalPollId: this.lastGlobalPollId
          });
          
          return updated;
        }
      }
    }
    
    // If no update was made or no chain is specified, search in all chains
    for (const chainName of SUPPORTED_CHAINS) {
      const normalizedChain = chainName.toLowerCase();
      const chain = this.chainData[normalizedChain];
      
      if (chain) {
        // Find poll index
        const pollIndex = chain.pollIds.findIndex(item => 
          item.pollId === pollId && item.pollId !== "unknown"
        );
        
        // If found, update its status
        if (pollIndex >= 0) {
          const oldStatus = chain.pollIds[pollIndex].result;
          chain.pollIds[pollIndex].result = newStatus;
          updated = true;
          
          // Emit event to notify of update
          this.emit('vote-update', {
            chain: normalizedChain,
            pollIds: this.chainData[normalizedChain].pollIds,
            lastGlobalPollId: this.lastGlobalPollId
          });
          
          break;
        }
      }
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