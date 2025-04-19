import { EventEmitter } from 'events';

// Types pour les statuts de vote
export enum VoteStatusType {
    Unsubmit = 'unsubmit',
    Signed = 'signed'
}

// Structure pour un poll de vote
export interface PollStatus {
    pollId: string;
    contractAddress: string;
    result: string;
}

// Structure pour une session de signature
export interface SigningStatus {
    signingId: string;
    contractAddress: string;
    result: string;
}

// Structure des données par chaîne
interface ChainData {
    pollIds: PollStatus[];
    signingIds: SigningStatus[];
}

export class AmpdManager extends EventEmitter {
    private ampdAddress: string;
    private axelarApiEndpoint: string;
    private supportedChains: string[] = [];
    private chainData: Record<string, ChainData> = {};
    private maxPollHistory: number = 35;

    constructor(axelarApiEndpoint: string, supportedChains: string[] = [], ampdAddress: string) {
        super();
        this.ampdAddress = ampdAddress;
        this.axelarApiEndpoint = axelarApiEndpoint;
        this.supportedChains = supportedChains.map(chain => chain.toLowerCase());
        
        // Initialiser la structure de données pour chaque chaîne
        this.initializeChainData();
    }

    private initializeChainData(): void {
        this.supportedChains.forEach(chain => {
            this.chainData[chain] = {
                pollIds: Array(this.maxPollHistory).fill(null).map(() => ({
                    pollId: "unknown",
                    contractAddress: "unknown",
                    result: "unknown"
                })),
                signingIds: Array(this.maxPollHistory).fill(null).map(() => ({
                    signingId: "unknown",
                    contractAddress: "unknown",
                    result: "unknown"
                }))
            };
        });
    }

    /**
     * Traite une transaction pour y rechercher des événements AMPD
     */
    public handleTransaction(txResult: any): void {
        if (!txResult || !txResult.events) return;

        // Traitement des poll_started
        if (txResult.events['wasm-messages_poll_started.messages']) {
            this.processPollStarted(txResult);
        }
        
        // Traitement des sessions de signature
        if (txResult.events && txResult.events['wasm-proof_under_construction.multisig_session_id']) {
            this.processSigningSessions(txResult);
        }
        
        // Traitement des votes et soumissions de signature
        if (txResult.events &&
            (txResult.events['wasm-voted.poll_id'] || txResult.events['wasm-signature_submitted.session_id']) &&
            txResult.events['tx.fee_payer'] && 
            txResult.events['tx.fee_payer'].includes(this.ampdAddress)) {
            this.processVotesAndSignatures(txResult);
        }
    }

    /**
     * Traite les événements poll_started
     */
    private processPollStarted(txResult: any): void {
        const pollId = txResult.events['wasm-messages_poll_started.poll_id'] ? 
            txResult.events['wasm-messages_poll_started.poll_id'][0] : null;
        const sourceChain = txResult.events['wasm-messages_poll_started.source_chain'] ? 
            txResult.events['wasm-messages_poll_started.source_chain'][0] : null;
        const contractAddress = txResult.events['wasm-messages_poll_started._contract_address'] ? 
            txResult.events['wasm-messages_poll_started._contract_address'][0] : null;
        
        // Vérifier si notre adresse AMPD est dans la liste des participants
        if (txResult.events['wasm-messages_poll_started.participants']) {
            const participantsStr = txResult.events['wasm-messages_poll_started.participants'][0];
            try {
                const participants = JSON.parse(participantsStr);
                const isParticipant = participants.includes(this.ampdAddress);
                
                if (isParticipant) {
                    this.updateChainDataWithPoll(sourceChain, pollId, contractAddress);
                    
                    // Émettre un événement de mise à jour
                    this.emit('vote-update', { chain: sourceChain, pollId, status: 'unsubmit' });
                }
            } catch (error) {
                console.error("Erreur lors du parsing des participants:", error);
            }
        }
    }

    /**
     * Traite les événements de session de signature
     */
    private processSigningSessions(txResult: any): void {
        const sessionId = txResult.events['wasm-proof_under_construction.multisig_session_id'][0];
        const cleanSessionId = sessionId ? sessionId.replace(/"/g, '') : null;
        
        const contractAddress = txResult.events['wasm-signing_started._contract_address'] ? 
            txResult.events['wasm-signing_started._contract_address'][0] : null;
        
        const destinationChain = txResult.events['wasm-proof_under_construction.destination_chain'] ? 
            txResult.events['wasm-proof_under_construction.destination_chain'][0].replace(/"/g, '') : null;
        
        // Vérifier si notre adresse AMPD est dans les clés publiques
        if (txResult.events['wasm-signing_started.pub_keys'] && 
            txResult.events['wasm-signing_started.pub_keys'][0].includes(this.ampdAddress)) {
            
            this.updateSigningSession(destinationChain, cleanSessionId, contractAddress);
            
            // Émettre un événement de mise à jour
            this.emit('signing-update', { chain: destinationChain, signingId: cleanSessionId, status: 'unsubmit' });
        }
    }

    /**
     * Traite les votes et soumissions de signature
     */
    private processVotesAndSignatures(txResult: any): void {
        // Traitement des votes
        if (txResult.events['wasm-voted.poll_id']) {
            // Récupérer le hash de transaction pour obtenir les détails
            if (txResult.events['tx.hash'] && txResult.events['tx.hash'].length > 0) {
                const txHash = txResult.events['tx.hash'][0];
                this.fetchVoteDetails(txHash);
            }
        }
        
        // Traitement des signatures
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
     * Met à jour les données de chaîne avec un nouveau poll
     */
    private updateChainDataWithPoll(sourceChain: string | null, pollId: string | null, contractAddress: string | null): void {
        const chainKey = sourceChain ? sourceChain.toLowerCase() : null;
        
        if (chainKey && this.chainData[chainKey]) {
            const cleanPollId = pollId ? pollId.replace(/"/g, '') : 'unknown';
            
            this.chainData[chainKey].pollIds.unshift({
                pollId: cleanPollId,
                contractAddress: contractAddress || 'unknown',
                result: 'unsubmit'
            });
            
            // Maintenir la taille maximale
            if (this.chainData[chainKey].pollIds.length > this.maxPollHistory) {
                this.chainData[chainKey].pollIds.pop();
            }
        } else {
            console.warn(`Chaîne source inconnue ou non supportée: ${sourceChain}`);
        }
    }

    /**
     * Met à jour les données de chaîne avec une nouvelle session de signature
     */
    private updateSigningSession(destinationChain: string | null, sessionId: string | null, contractAddress: string | null): void {
        const chainKey = destinationChain ? destinationChain.toLowerCase() : null;
        
        if (chainKey && this.chainData[chainKey]) {
            this.chainData[chainKey].signingIds.unshift({
                signingId: sessionId || 'unknown',
                contractAddress: contractAddress || 'unknown',
                result: 'unsubmit'
            });
            
            // Maintenir la taille maximale
            if (this.chainData[chainKey].signingIds.length > this.maxPollHistory) {
                this.chainData[chainKey].signingIds.pop();
            }
        } else {
            console.warn(`Impossible de déterminer la chaîne pour la session ${sessionId} ou chaîne non supportée: ${chainKey}`);
        }
    }

    /**
     * Met à jour le statut d'un poll dans les données de chaîne
     */
    private updatePollStatusInChainData(pollId: string, contractAddress: string, votes: string[]): void {
        let updated = false;
        
        Object.keys(this.chainData).forEach(chainKey => {
            const chain = this.chainData[chainKey];
            
            for (let i = 0; i < chain.pollIds.length; i++) {
                const poll = chain.pollIds[i];
                
                if (poll.pollId === pollId && poll.contractAddress === contractAddress) {
                    if (poll.result === 'unsubmit') {
                        if (votes && votes.length > 0) {
                            poll.result = votes[0];
                        } else {
                            poll.result = 'unsubmit';
                        }
                        updated = true;
                        
                        // Émettre un événement de mise à jour
                        this.emit('vote-update', { chain: chainKey, pollId, status: poll.result });
                    }
                }
            }
        });
        
        if (!updated) {
            console.error(`Erreur: Impossible de trouver le poll ${pollId} pour l'adresse ${contractAddress} pour mettre à jour le statut.`);
        }
    }

    /**
     * Met à jour le statut d'une session de signature dans les données de chaîne
     */
    private updateSigningStatusInChainData(sessionId: string, contractAddress: string): void {
        let updated = false;
        
        Object.keys(this.chainData).forEach(chainKey => {
            const chain = this.chainData[chainKey];
            
            for (let i = 0; i < chain.signingIds.length; i++) {
                const signing = chain.signingIds[i];
                
                if (signing.signingId === sessionId && signing.contractAddress === contractAddress) {
                    if (signing.result === 'unsubmit') {
                        signing.result = 'signed';
                        updated = true;
                        
                        // Émettre un événement de mise à jour
                        this.emit('signing-update', { chain: chainKey, signingId: sessionId, status: 'signed' });
                    }
                }
            }
        });

        if (!updated) {
            console.error(`Erreur: Impossible de trouver la session de signature ${sessionId} pour l'adresse ${contractAddress}.`);
        }
    }

    /**
     * Récupère les détails d'un vote à partir d'un hash de transaction
     */
    private async fetchVoteDetails(txHash: string, attempt: number = 1, maxAttempts: number = 3, delay: number = 2000): Promise<void> {
        try {
            if (attempt > 1) {
                console.log(`Tentative ${attempt}/${maxAttempts} de récupération des détails du vote...`);
            }
            
            // Construire l'URL de l'API
            const apiUrl = `${this.axelarApiEndpoint}/cosmos/tx/v1beta1/txs/${txHash}`;
            
            // Utiliser le module global fetch importé dans l'application
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                throw new Error(`Erreur API: ${response.status}`);
            }
            
            // Récupérer et parser les données JSON
            const data = await response.json();
            
            // Tableau pour stocker tous les votes trouvés
            const votes: Array<{pollId: string, votes: string[], contract: string, sender: string}> = [];
            
            // Extraire les informations pertinentes
            if (data && data.tx && data.tx.body && data.tx.body.messages && data.tx.body.messages.length > 0) {
                // Parcourir les messages primaires
                for (const message of data.tx.body.messages) {
                    // Pour les messages en batch
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
                    // Pour les messages directs
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
                // Réessayer après un délai si pas de résultat
                console.log(`Aucun détail trouvé, nouvelle tentative dans ${delay/1000} secondes...`);
                setTimeout(() => this.fetchVoteDetails(txHash, attempt + 1, maxAttempts, delay), delay);
            } else {
                console.error(`Échec après ${maxAttempts} tentatives. Impossible de récupérer les détails du vote.`);
            }
        } catch (error) {
            console.error(`Erreur lors de la tentative ${attempt}:`, error);
            
            if (attempt < maxAttempts) {
                // Réessayer après un délai en cas d'erreur
                console.log(`Nouvelle tentative dans ${delay/1000} secondes...`);
                setTimeout(() => this.fetchVoteDetails(txHash, attempt + 1, maxAttempts, delay), delay);
            } else {
                console.error(`Échec après ${maxAttempts} tentatives. Abandon.`);
            }
        }
    }

    /**
     * Récupère les données de votes pour une chaîne spécifique
     */
    public getChainVotes(chain: string): PollStatus[] | null {
        const chainKey = chain.toLowerCase();
        if (this.chainData[chainKey]) {
            return this.chainData[chainKey].pollIds;
        }
        return null;
    }

    /**
     * Récupère les données de signatures pour une chaîne spécifique
     */
    public getChainSignings(chain: string): SigningStatus[] | null {
        const chainKey = chain.toLowerCase();
        if (this.chainData[chainKey]) {
            return this.chainData[chainKey].signingIds;
        }
        return null;
    }

    /**
     * Récupère toutes les données de votes et signatures
     */
    public getAllData(): Record<string, ChainData> {
        return this.chainData;
    }

    /**
     * Récupère la liste des chaînes supportées
     */
    public getSupportedChains(): string[] {
        return this.supportedChains;
    }
} 