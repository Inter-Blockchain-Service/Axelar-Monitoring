import { EventEmitter } from 'events';

// Vote status types
export enum VoteStatusType {
    Unsubmit = 'unsubmit',
    Signed = 'signed'
}

// Structure for a vote poll
export interface PollStatus {
    pollId: string;
    contractAddress: string;
    result: string;
}

// Structure for a signing session
export interface SigningStatus {
    signingId: string;
    contractAddress: string;
    result: string;
}

// Interfaces for data structures
export interface AmpdVoteData {
    [chain: string]: {
        pollIds: PollStatus[];
    }
}

export interface AmpdSigningData {
    [chain: string]: {
        signingIds: SigningStatus[];
    }
}

export class AmpdManager extends EventEmitter {
    private ampdAddress: string;
    private axelarApiEndpoint: string;
    private supportedChains: string[] = [];
    // Separate data structures for votes and signings
    private voteData: AmpdVoteData = {};
    private signingData: AmpdSigningData = {};
    private maxPollHistory: number = 35;

    constructor(axelarApiEndpoint: string, supportedChains: string[] = [], ampdAddress: string) {
        super();
        this.ampdAddress = ampdAddress;
        this.axelarApiEndpoint = axelarApiEndpoint;
        this.supportedChains = supportedChains.map(chain => chain.toLowerCase());
        
        // Initialize data structure for each chain
        this.initializeData();
    }

    private initializeData(): void {
        this.supportedChains.forEach(chain => {
            // Initialize vote data
            this.voteData[chain] = {
                pollIds: Array(this.maxPollHistory).fill(null).map(() => ({
                    pollId: "unknown",
                    contractAddress: "unknown",
                    result: "unknown"
                }))
            };
            
            // Initialize signing data
            this.signingData[chain] = {
                signingIds: Array(this.maxPollHistory).fill(null).map(() => ({
                    signingId: "unknown",
                    contractAddress: "unknown",
                    result: "unknown"
                }))
            };
        });
    }

    /**
     * Process a transaction to search for AMPD events
     */
    public handleTransaction(txResult: any): void {
        if (!txResult || !txResult.events) return;

        // Process poll_started events
        if (txResult.events['wasm-messages_poll_started.messages']) {
            this.processPollStarted(txResult);
        }
        
        // Process signing sessions
        if (txResult.events && txResult.events['wasm-proof_under_construction.multisig_session_id']) {
            this.processSigningSessions(txResult);
        }
        
        // Process votes and signature submissions
        if (txResult.events &&
            (txResult.events['wasm-voted.poll_id'] || txResult.events['wasm-signature_submitted.session_id']) &&
            txResult.events['tx.fee_payer'] && 
            txResult.events['tx.fee_payer'].includes(this.ampdAddress)) {
            this.processVotesAndSignatures(txResult);
        }
    }

    /**
     * Process poll_started events
     */
    private processPollStarted(txResult: any): void {
        const pollId = txResult.events['wasm-messages_poll_started.poll_id'] ? 
            txResult.events['wasm-messages_poll_started.poll_id'][0] : null;
        const sourceChain = txResult.events['wasm-messages_poll_started.source_chain'] ? 
            txResult.events['wasm-messages_poll_started.source_chain'][0] : null;
        const contractAddress = txResult.events['wasm-messages_poll_started._contract_address'] ? 
            txResult.events['wasm-messages_poll_started._contract_address'][0] : null;
        
        // Check if our AMPD address is in the participants list
        if (txResult.events['wasm-messages_poll_started.participants']) {
            const participantsStr = txResult.events['wasm-messages_poll_started.participants'][0];
            try {
                const participants = JSON.parse(participantsStr);
                const isParticipant = participants.includes(this.ampdAddress);
                
                if (isParticipant) {
                    this.updateChainDataWithPoll(sourceChain, pollId, contractAddress);
                    
                    // Emit update event
                    this.emit('vote-update', { chain: sourceChain, pollId, status: 'unsubmit' });
                }
            } catch (error) {
                console.error("Error parsing participants:", error);
            }
        }
    }

    /**
     * Process signing session events
     */
    private processSigningSessions(txResult: any): void {
        const sessionId = txResult.events['wasm-proof_under_construction.multisig_session_id'][0];
        const cleanSessionId = sessionId ? sessionId.replace(/"/g, '') : null;
        
        const contractAddress = txResult.events['wasm-signing_started._contract_address'] ? 
            txResult.events['wasm-signing_started._contract_address'][0] : null;
        
        const destinationChain = txResult.events['wasm-proof_under_construction.destination_chain'] ? 
            txResult.events['wasm-proof_under_construction.destination_chain'][0].replace(/"/g, '') : null;
        
        // Check if our AMPD address is in the public keys
        if (txResult.events['wasm-signing_started.pub_keys'] && 
            txResult.events['wasm-signing_started.pub_keys'][0].includes(this.ampdAddress)) {
            
            this.updateSigningSession(destinationChain, cleanSessionId, contractAddress);
            
            // Emit update event
            this.emit('signing-update', { chain: destinationChain, signingId: cleanSessionId, status: 'unsubmit' });
        }
    }

    /**
     * Process votes and signature submissions
     */
    private processVotesAndSignatures(txResult: any): void {
        // Process votes
        if (txResult.events['wasm-voted.poll_id']) {
            // Get transaction hash to retrieve details
            if (txResult.events['tx.hash'] && txResult.events['tx.hash'].length > 0) {
                const txHash = txResult.events['tx.hash'][0];
                this.fetchVoteDetails(txHash);
            }
        }
        
        // Process signatures
        if (txResult.events['wasm-signature_submitted.session_id']) {
            const sessionIds = txResult.events['wasm-signature_submitted.session_id'];
            const contractAddresses = txResult.events['wasm-signature_submitted._contract_address'] || [];
            
            for (let i = 0; i < sessionIds.length; i++) {
                const sessionId = sessionIds[i];
                const contractAddress = i < contractAddresses.length ? contractAddresses[i] : null;
                
                if (sessionId && contractAddress) {
                    this.updateSigningStatusInChainData(sessionId, contractAddress);
                }
            }
        }
    }

    /**
     * Update chain data with a new poll
     */
    private updateChainDataWithPoll(sourceChain: string | null, pollId: string | null, contractAddress: string | null): void {
        const chainKey = sourceChain ? sourceChain.toLowerCase() : null;
        
        if (chainKey && this.voteData[chainKey]) {
            const cleanPollId = pollId ? pollId.replace(/"/g, '') : 'unknown';
            
            this.voteData[chainKey].pollIds.unshift({
                pollId: cleanPollId,
                contractAddress: contractAddress || 'unknown',
                result: 'unsubmit'
            });
            
            // Maintain maximum size
            if (this.voteData[chainKey].pollIds.length > this.maxPollHistory) {
                this.voteData[chainKey].pollIds.pop();
            }
        } else {
            console.warn(`Unknown or unsupported source chain: ${sourceChain}`);
        }
    }

    /**
     * Update chain data with a new signing session
     */
    private updateSigningSession(destinationChain: string | null, sessionId: string | null, contractAddress: string | null): void {
        const chainKey = destinationChain ? destinationChain.toLowerCase() : null;
        
        if (chainKey && this.signingData[chainKey]) {
            this.signingData[chainKey].signingIds.unshift({
                signingId: sessionId || 'unknown',
                contractAddress: contractAddress || 'unknown',
                result: 'unsubmit'
            });
            
            // Maintain maximum size
            if (this.signingData[chainKey].signingIds.length > this.maxPollHistory) {
                this.signingData[chainKey].signingIds.pop();
            }
        } else {
            console.warn(`Unable to determine chain for session ${sessionId} or unsupported chain: ${chainKey}`);
        }
    }

    /**
     * Update poll status in vote data
     */
    private updatePollStatusInChainData(pollId: string, contractAddress: string, votes: string[]): void {
        let updated = false;
        
        Object.keys(this.voteData).forEach(chainKey => {
            const pollIds = this.voteData[chainKey].pollIds;
            
            for (let i = 0; i < pollIds.length; i++) {
                const poll = pollIds[i];
                
                if (poll.pollId === pollId && poll.contractAddress === contractAddress) {
                    if (poll.result === 'unsubmit') {
                        if (votes && votes.length > 0) {
                            poll.result = votes[0];
                        } else {
                            poll.result = 'unsubmit';
                        }
                        updated = true;
                        
                        // Emit update event
                        this.emit('vote-update', { chain: chainKey, pollId, status: poll.result });
                    }
                }
            }
        });
        
        if (!updated) {
            console.error(`Error: Could not find poll ${pollId} for address ${contractAddress} to update status.`);
        }
    }

    /**
     * Update signing session status in signing data
     */
    private updateSigningStatusInChainData(sessionId: string, contractAddress: string): void {
        let updated = false;
        
        Object.keys(this.signingData).forEach(chainKey => {
            const signingIds = this.signingData[chainKey].signingIds;
            
            for (let i = 0; i < signingIds.length; i++) {
                const signing = signingIds[i];
                
                if (signing.signingId === sessionId && signing.contractAddress === contractAddress) {
                    if (signing.result === 'unsubmit') {
                        signing.result = 'signed';
                        updated = true;
                        
                        // Emit update event
                        this.emit('signing-update', { chain: chainKey, signingId: sessionId, status: 'signed' });
                    }
                }
            }
        });

        if (!updated) {
            console.error(`Error: Could not find signing session ${sessionId} for address ${contractAddress}.`);
        }
    }

    /**
     * Fetch vote details from a transaction hash
     */
    private async fetchVoteDetails(txHash: string, attempt: number = 1, maxAttempts: number = 3, delay: number = 2000): Promise<void> {
        try {
            if (attempt > 1) {
                console.log(`Attempt ${attempt}/${maxAttempts} to retrieve vote details...`);
            }
            
            // Build API URL
            const apiUrl = `${this.axelarApiEndpoint}/cosmos/tx/v1beta1/txs/${txHash}`;
            
            // Use global fetch module imported in the application
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }
            
            // Retrieve and parse JSON data
            const data = await response.json();
            
            // Array to store all found votes
            const votes: Array<{pollId: string, votes: string[], contract: string, sender: string}> = [];
            
            // Extract relevant information
            if (data && data.tx && data.tx.body && data.tx.body.messages && data.tx.body.messages.length > 0) {
                // Go through primary messages
                for (const message of data.tx.body.messages) {
                    // For batch messages
                    if (message['@type'] === '/axelar.auxiliary.v1beta1.BatchRequest' && message.messages) {
                        for (const subMessage of message.messages) {
                            if (subMessage['@type'] === '/cosmwasm.wasm.v1.MsgExecuteContract' && subMessage.msg && subMessage.msg.vote) {
                                votes.push({
                                    pollId: subMessage.msg.vote.poll_id,
                                    votes: subMessage.msg.vote.votes,
                                    contract: subMessage.contract,
                                    sender: subMessage.sender
                                });
                            }
                        }
                    }
                    // For direct messages
                    else if (message['@type'] === '/cosmwasm.wasm.v1.MsgExecuteContract' && message.msg && message.msg.vote) {
                        votes.push({
                            pollId: message.msg.vote.poll_id,
                            votes: message.msg.vote.votes,
                            contract: message.contract,
                            sender: message.sender
                        });
                    }
                }
            }
            
            if (votes.length > 0) {
                votes.forEach(voteDetail => {
                    if (voteDetail.pollId && voteDetail.contract && voteDetail.votes) {
                        this.updatePollStatusInChainData(
                            voteDetail.pollId,
                            voteDetail.contract,
                            voteDetail.votes
                        );
                    }
                });
            } else if (attempt < maxAttempts) {
                // Retry after a delay if no result
                console.log(`No details found, retrying in ${delay/1000} seconds...`);
                setTimeout(() => this.fetchVoteDetails(txHash, attempt + 1, maxAttempts, delay), delay);
            } else {
                console.error(`Failed after ${maxAttempts} attempts. Unable to retrieve vote details.`);
            }
        } catch (error) {
            console.error(`Error during attempt ${attempt}:`, error);
            
            if (attempt < maxAttempts) {
                // Retry after a delay in case of error
                console.log(`Retrying in ${delay/1000} seconds...`);
                setTimeout(() => this.fetchVoteDetails(txHash, attempt + 1, maxAttempts, delay), delay);
            } else {
                console.error(`Failed after ${maxAttempts} attempts. Giving up.`);
            }
        }
    }

    /**
     * Get vote data for a specific chain
     */
    public getChainVotes(chain: string): PollStatus[] | null {
        const chainKey = chain.toLowerCase();
        if (this.voteData[chainKey]) {
            return this.voteData[chainKey].pollIds;
        }
        return null;
    }

    /**
     * Get signing data for a specific chain
     */
    public getChainSignings(chain: string): SigningStatus[] | null {
        const chainKey = chain.toLowerCase();
        if (this.signingData[chainKey]) {
            return this.signingData[chainKey].signingIds;
        }
        return null;
    }

    /**
     * Get all vote data
     */
    public getAllVotesData(): AmpdVoteData {
        return this.voteData;
    }

    /**
     * Get all signing data
     */
    public getAllSigningsData(): AmpdSigningData {
        return this.signingData;
    }

    /**
     * Get the list of supported chains
     */
    public getSupportedChains(): string[] {
        return this.supportedChains;
    }
} 