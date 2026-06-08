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
    timestamp: string; // Date ISO string
    txHash?: string; // Vote transaction hash (when submitted by our AMPD)
}

// Structure for a signing session
export interface SigningStatus {
    signingId: string;
    contractAddress: string;
    result: string;
    timestamp: string; // Date ISO string
    txHash?: string; // Signature transaction hash (when submitted by our AMPD)
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

// Interface for transaction results
export interface TxResult {
    events: Record<string, string[]>;
}

// Interface for vote details
export interface VoteDetail {
    pollId: string;
    votes: string[];
    contract: string;
    sender: string;
}

export class AmpdManager extends EventEmitter {
    private ampdAddress: string;
    private axelarApiEndpoint: string;
    private supportedChains: string[] = [];
    // Separate data structures for votes and signings
    private voteData: AmpdVoteData = {};
    private signingData: AmpdSigningData = {};
    private maxPollHistory: number = 200;

    constructor(axelarApiEndpoint: string, supportedChains: string[] = [], ampdAddress: string) {
        super();
        this.ampdAddress = ampdAddress;
        this.axelarApiEndpoint = axelarApiEndpoint;
        
        // Use provided supported chains or default list if empty
        this.supportedChains = supportedChains.length > 0 ? supportedChains.map(chain => chain.toLowerCase()) : [
            'flow', 'stellar', 'sui', 'xrpl', 'xrpl-evm'
        ];
        
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
                    result: "unknown",
                    timestamp: new Date().toISOString()
                }))
            };
            
            // Initialize signing data
            this.signingData[chain] = {
                signingIds: Array(this.maxPollHistory).fill(null).map(() => ({
                    signingId: "unknown",
                    contractAddress: "unknown",
                    result: "unknown",
                    timestamp: new Date().toISOString()
                }))
            };
        });
    }

    /**
     * Check if a transaction was submitted by our AMPD address
     */
    private isOurTx(events: Record<string, string[]>): boolean {
        const feePayers = events['tx.fee_payer'] ?? [];
        return feePayers.some(payer =>
            payer === this.ampdAddress || payer.startsWith(`${this.ampdAddress}/`)
        );
    }

    private normalizePollId(pollId: string | number | null | undefined): string {
        if (pollId === null || pollId === undefined) return 'unknown';
        return String(pollId).replace(/"/g, '');
    }

    private normalizeSessionId(sessionId: string | number | null | undefined): string {
        return this.normalizePollId(sessionId);
    }

    /**
     * Process a transaction to search for AMPD events
     */
    public handleTransaction(txResult: TxResult): void {
        if (!txResult || !txResult.events) return;

        // Process poll_started events (poll_id is the reliable index key)
        if (txResult.events['wasm-messages_poll_started.poll_id']) {
            this.processPollStarted(txResult);
        }
        
        // Process signing sessions
        if (txResult.events && txResult.events['wasm-proof_under_construction.multisig_session_id']) {
            this.processSigningSessions(txResult);
        }
        
        // Process votes and signature submissions
        if (txResult.events &&
            (txResult.events['wasm-voted.poll_id'] || txResult.events['wasm-signature_submitted.session_id']) &&
            this.isOurTx(txResult.events)) {
            this.processVotesAndSignatures(txResult);
        }
    }

    /**
     * Process poll_started events
     */
    private processPollStarted(txResult: TxResult): void {
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
                    const cleanPollId = this.normalizePollId(pollId);
                    this.updateChainDataWithPoll(sourceChain, cleanPollId, contractAddress);
                    
                    // Emit update event
                    this.emit('vote-update', { chain: sourceChain, pollId: cleanPollId, status: 'unsubmit' });
                }
            } catch (error) {
                console.error("Error parsing participants:", error);
            }
        }
    }

    /**
     * Process signing session events
     */
    private processSigningSessions(txResult: TxResult): void {
        const sessionId = txResult.events['wasm-proof_under_construction.multisig_session_id'][0];
        const cleanSessionId = this.normalizeSessionId(sessionId);
        
        const contractAddress = txResult.events['wasm-signing_started._contract_address'] ? 
            txResult.events['wasm-signing_started._contract_address'][0] : null;
        
        const destinationChain = txResult.events['wasm-proof_under_construction.destination_chain'] ? 
            txResult.events['wasm-proof_under_construction.destination_chain'][0].replace(/"/g, '') : null;
        
        // Check if our AMPD address is in the public keys
        if (txResult.events['wasm-signing_started.pub_keys'] && 
            txResult.events['wasm-signing_started.pub_keys'][0].includes(this.ampdAddress)) {
            
            this.updateSigningSession(destinationChain, cleanSessionId, contractAddress);
            
            this.emit('signing-update', { chain: destinationChain, signingId: cleanSessionId, status: 'unsubmit' });
        }
    }

    /**
     * Process votes and signature submissions
     */
    private processVotesAndSignatures(txResult: TxResult): void {
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
            if (txResult.events['tx.hash'] && txResult.events['tx.hash'].length > 0) {
                const txHash = txResult.events['tx.hash'][0];
                this.fetchSignatureDetails(txHash);
            }
        }
    }

    /**
     * Update chain data with a new poll
     */
    private updateChainDataWithPoll(sourceChain: string | null, pollId: string | null, contractAddress: string | null): void {
        const chainKey = sourceChain ? sourceChain.toLowerCase().replace(/"/g, '') : null;
        
        if (chainKey && this.voteData[chainKey]) {
            const cleanPollId = pollId ? this.normalizePollId(pollId) : 'unknown';
            const cleanContract = contractAddress?.replace(/"/g, '') || 'unknown';

            // Skip if poll already tracked
            const exists = this.voteData[chainKey].pollIds.some(
                p => p.pollId === cleanPollId && p.contractAddress === cleanContract && p.pollId !== 'unknown'
            );
            if (exists) return;
            
            this.voteData[chainKey].pollIds.unshift({
                pollId: cleanPollId,
                contractAddress: cleanContract,
                result: 'unsubmit',
                timestamp: new Date().toISOString()
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
        if (!destinationChain || !sessionId || !contractAddress) return;
        
        const chain = destinationChain.toLowerCase().replace(/"/g, '');
        if (!this.supportedChains.includes(chain)) return;

        const cleanSessionId = this.normalizeSessionId(sessionId);
        const cleanContract = contractAddress.replace(/"/g, '');

        const exists = this.signingData[chain].signingIds.some(
            s => s.signingId === cleanSessionId && s.contractAddress === cleanContract && s.signingId !== 'unknown'
        );
        if (exists) return;
        
        const signingStatus: SigningStatus = {
            signingId: cleanSessionId,
            contractAddress: cleanContract,
            result: 'unsubmit',
            timestamp: new Date().toISOString()
        };
        
        this.signingData[chain].signingIds.unshift(signingStatus);
        if (this.signingData[chain].signingIds.length > this.maxPollHistory) {
            this.signingData[chain].signingIds = this.signingData[chain].signingIds.slice(0, this.maxPollHistory);
        }
    }

    /**
     * Update poll status in vote data
     */
    private updatePollStatusInChainData(
        pollId: string | number,
        contractAddress: string,
        votes: string[],
        txHash: string,
        sender: string
    ): void {
        if (sender !== this.ampdAddress) {
            return;
        }

        const cleanPollId = this.normalizePollId(pollId);
        const cleanContract = contractAddress.replace(/"/g, '');
        let updated = false;
        
        Object.keys(this.voteData).forEach(chainKey => {
            const pollIds = this.voteData[chainKey].pollIds;
            
            for (let i = 0; i < pollIds.length; i++) {
                const poll = pollIds[i];
                
                if (poll.pollId === cleanPollId && poll.contractAddress === cleanContract) {
                    if (poll.result === 'unsubmit') {
                        poll.result = votes && votes.length > 0 ? votes[0] : 'unsubmit';
                        poll.txHash = txHash;
                        updated = true;
                        
                        this.emit('vote-update', { chain: chainKey, pollId: cleanPollId, status: poll.result });
                    }
                }
            }
        });
        
        if (!updated) {
            console.warn(`Could not find unsubmit poll ${cleanPollId} for contract ${cleanContract} to update status.`);
        }
    }

    /**
     * Update signing session status in signing data
     */
    private updateSigningStatusInChainData(
        sessionId: string | number,
        contractAddress: string,
        txHash: string,
        sender: string
    ): void {
        if (sender !== this.ampdAddress) {
            return;
        }

        const cleanSessionId = this.normalizeSessionId(sessionId);
        const cleanContract = contractAddress.replace(/"/g, '');
        let updated = false;
        
        Object.keys(this.signingData).forEach(chainKey => {
            const signingIds = this.signingData[chainKey].signingIds;
            
            for (let i = 0; i < signingIds.length; i++) {
                const signing = signingIds[i];
                
                if (signing.signingId === cleanSessionId && signing.contractAddress === cleanContract) {
                    if (signing.result === 'unsubmit') {
                        signing.result = 'signed';
                        signing.txHash = txHash;
                        updated = true;
                        
                        this.emit('signing-update', { chain: chainKey, signingId: cleanSessionId, status: 'signed' });
                    }
                }
            }
        });

        if (!updated) {
            console.warn(`Could not find unsubmit signing session ${cleanSessionId} for contract ${cleanContract} to update status.`);
        }
    }

    /**
     * Fetch signature details from a transaction hash
     */
    private async fetchSignatureDetails(txHash: string, attempt: number = 1, maxAttempts: number = 3, delay: number = 2000): Promise<void> {
        try {
            const apiUrl = `${this.axelarApiEndpoint}/cosmos/tx/v1beta1/txs/${txHash}`;
            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();
            const signatures: Array<{ sessionId: string | number; contract: string; sender: string }> = [];

            if (data?.tx?.body?.messages?.length > 0) {
                for (const message of data.tx.body.messages) {
                    const messagesToScan = message['@type'] === '/axelar.auxiliary.v1beta1.BatchRequest' && message.messages
                        ? message.messages
                        : [message];

                    for (const subMessage of messagesToScan) {
                        if (subMessage['@type'] === '/cosmwasm.wasm.v1.MsgExecuteContract' && subMessage.msg?.submit_signature) {
                            signatures.push({
                                sessionId: subMessage.msg.submit_signature.session_id,
                                contract: subMessage.contract,
                                sender: subMessage.sender,
                            });
                        }
                    }
                }
            }

            if (signatures.length > 0) {
                signatures.forEach(sig => {
                    if (sig.sessionId !== undefined && sig.contract && sig.sender === this.ampdAddress) {
                        this.updateSigningStatusInChainData(sig.sessionId, sig.contract, txHash, sig.sender);
                    }
                });
            } else if (attempt < maxAttempts) {
                setTimeout(() => this.fetchSignatureDetails(txHash, attempt + 1, maxAttempts, delay), delay);
            } else {
                console.warn(`Unable to retrieve signature details for tx ${txHash} after ${maxAttempts} attempts.`);
            }
        } catch (error) {
            console.error(`Error fetching signature details (attempt ${attempt}):`, error);
            if (attempt < maxAttempts) {
                setTimeout(() => this.fetchSignatureDetails(txHash, attempt + 1, maxAttempts, delay), delay);
            }
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
                    if (voteDetail.pollId && voteDetail.contract && voteDetail.votes && voteDetail.sender === this.ampdAddress) {
                        this.updatePollStatusInChainData(
                            voteDetail.pollId,
                            voteDetail.contract,
                            voteDetail.votes,
                            txHash,
                            voteDetail.sender
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