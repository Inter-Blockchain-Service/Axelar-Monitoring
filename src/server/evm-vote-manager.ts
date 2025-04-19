import { EventEmitter } from 'events';
import axios from 'axios';

// Liste des chaînes supportées à partir du fichier .env
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
  ]; // Valeurs par défaut si non définies dans .env

// Nombre maximum de poll_ids à stocker par chaîne
const MAX_POLL_HISTORY = 35;

// Type de statut d'un vote
export enum VoteStatusType {
  Unknown = 'unknown',
  Unsubmitted = 'unsubmitted',
  Validated = 'validated',
  Invalid = 'invalid'
}

// Interface pour représenter un poll
export interface PollStatus {
  pollId: string;
  result: VoteStatusType | string;
}

// Interface pour les données de chaîne
interface ChainData {
  [chain: string]: {
    pollIds: PollStatus[];
  }
}

export class EvmVoteManager extends EventEmitter {
  private chainData: ChainData = {};
  private lastGlobalPollId: number = 0;
  private validatorAddress: string;
  private apiEndpoint: string;

  constructor(validatorAddress: string, apiEndpoint: string) {
    super();
    this.validatorAddress = validatorAddress;
    this.apiEndpoint = apiEndpoint;

    // Initialiser la structure de données pour chaque chaîne
    SUPPORTED_CHAINS.forEach(chain => {
      this.chainData[chain.toLowerCase()] = {
        pollIds: Array(MAX_POLL_HISTORY).fill(undefined).map(() => ({
          pollId: "unknown",
          result: VoteStatusType.Unknown
        }))
      };
    });

    console.log(`Gestionnaire de votes EVM initialisé pour ${validatorAddress}`);
  }

  // Fonction pour traiter les transactions
  public handleTransaction(txResult: any): void {
    const height = parseInt(txResult.height);

    
    // Vérifier si txResult.events contient les informations de vote pour notre validateur
    if (txResult.events && 
        txResult.events['axelar.vote.v1beta1.Voted.voter'] &&
        txResult.events['axelar.vote.v1beta1.Voted.voter'].some((voter: string) => voter.includes(this.validatorAddress))) {
        
      // Récupérer le hash de la transaction
      if (txResult.events['tx.hash'] && txResult.events['tx.hash'].length > 0) {
        const txHash = txResult.events['tx.hash'][0];
        
        // Interroger l'API Axelar pour les détails de la transaction
        this.getTxByHash(txHash)
          .then(txDetails => {
            try {
              // Vérifier si c'est un BatchRequest ou un message direct
              if (!txDetails) {
                console.log(`⚠️ Pas de détails pour la transaction ${txHash}`);
                return;
              }
              
              const messages = txDetails.tx.body.messages;
              if (!messages || messages.length === 0) {
                console.log("⚠️ Pas de messages trouvés dans la transaction");
                return;
              }

              // Traiter différemment selon le type de message
              if (messages[0]["@type"] === "/axelar.auxiliary.v1beta1.BatchRequest") {
                const batchMessages = messages[0].messages;
                
                if (batchMessages && batchMessages.length > 0) {
                  console.log(`📝 Traitement de ${batchMessages.length} messages dans le batch`);
                  // Traiter chaque message dans le batch
                  batchMessages.forEach((batchMsg: any, index: number) => {
                    console.log(`📝 Traitement du message ${index + 1}/${batchMessages.length} du batch`);
                    this.processVoteMessage(batchMsg);
                  });
                } else {
                  console.log("⚠️ Pas de messages dans le BatchRequest");
                }
              } else {
                // Cas d'un seul message
                console.log(`📝 Traitement d'un message direct de type ${messages[0]["@type"]}`);
                this.processVoteMessage(messages[0]);
              }
            } catch (e) {
              console.error("❌ Erreur lors du traitement du vote:", e);
            }
          })
          .catch(error => {
            console.error("❌ Erreur lors de la requête des détails de la transaction:", error);
          });
      }
    }
    
    if (txResult.data && txResult.data.value && txResult.data.value.TxResult && txResult.data.value.TxResult.result && txResult.data.value.TxResult.result.log) {
      try {
        const logData = txResult.data.value.TxResult.result.log;
        
        // Vérifier si le log contient "poll_id" pour détecter tous les types de transactions avec des poll_id
        if (logData.includes('"poll_id"') || logData.includes('poll_id')) {
          
          try {
            const logs = JSON.parse(logData);
            
            // Chercher les événements qui contiennent des poll_id dans les attributs
            for (const log of logs) {
              if (log.events) {
                for (const event of log.events) {
                  // Filtrer les types de transactions que nous voulons traiter
                  // Exclure les événements de vote qui sont traités ailleurs
                  if (event.type !== 'axelar.vote.v1beta1.Voted' && event.attributes) {
                    // Variables pour stocker la chaîne et le poll_id
                    let chain = null;
                    let pollId = null;
                    
                    // Extraire d'abord la chaîne qui est généralement dans un attribut 'chain'
                    for (const attr of event.attributes) {
                      if (attr.key === 'chain') {
                        chain = attr.value.replace(/^"(.*)"$/, '$1').replace(/\\"/g, '');
                        break;
                      }
                    }
                    
                    // Chercher le poll_id selon différentes structures
                    for (const attr of event.attributes) {
                      // Cas 1: Dans un attribut 'participants'
                      if (attr.key === 'participants' && attr.value && attr.value.includes('poll_id')) {
                        try {
                          const participantsObj = JSON.parse(attr.value.replace(/\\"/g, '"'));
                          if (participantsObj.poll_id) {
                            pollId = participantsObj.poll_id;
                            break;
                          }
                        } catch (e) {
                          console.error("Erreur lors du parsing de l'attribut participants:", e);
                        }
                      }
                      // Cas 2: Dans poll_mappings (comme dans ConfirmGatewayTxsStarted)
                      else if (attr.key === 'poll_mappings') {
                        try {
                          const pollMappings = attr.value;
                          // Essayer de parser les poll_mappings pour obtenir le poll_id
                          try {
                            const mappings = JSON.parse(pollMappings);
                            if (Array.isArray(mappings) && mappings.length > 0 && mappings[0].poll_id) {
                              pollId = mappings[0].poll_id;
                              break;
                            }
                          } catch (e) {
                            // Si le parsing échoue, chercher le poll_id par regex
                            const pollIdMatch = pollMappings.match(/"poll_id"\s*:\s*"(\d+)"/);
                            if (pollIdMatch && pollIdMatch[1]) {
                              pollId = pollIdMatch[1];
                              break;
                            }
                          }
                        } catch (e) {
                          console.error("Erreur lors de l'extraction du poll_id:", e);
                        }
                      }
                    }
                    
                    // Si on a trouvé à la fois une chaîne et un poll_id, les traiter
                    if (chain && pollId) {
                      // Ajouter le poll_id à la chaîne correspondante
                      this.addPollIdToChain(chain, pollId);
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error("Erreur lors du parsing des logs:", e);
          }
        }
      } catch (e) {
        // Ignorer les erreurs
      }
    }
  }

  // Fonction pour ajouter un nouveau poll_id à une chaîne
  private addPollIdToChain(chain: string, pollId: string): boolean {
    if (!chain) return false;
    
    // Normaliser le nom de la chaîne
    const normalizedChain = chain.toLowerCase().replace(/[\"\\]/g, '');
    
    // Vérifier si la chaîne est supportée
    if (this.chainData[normalizedChain]) {
      // Vérifier si ce poll_id existe déjà dans notre historique
      const existingIndex = this.chainData[normalizedChain].pollIds.findIndex(item => 
        item.pollId === pollId && item.pollId !== "unknown"
      );
      
      // Si le poll_id existe déjà, ne pas l'ajouter à nouveau
      if (existingIndex >= 0) {
        return false;
      }
      
      // Convertir le poll_id en nombre pour la vérification
      const numericPollId = parseInt(pollId, 10);
      
      // Vérifier si le poll_id s'incrémente bien de 1 par rapport au dernier poll global
      if (this.lastGlobalPollId > 0 && numericPollId !== this.lastGlobalPollId + 1) {
        console.log(`\n⚠️ ALERTE - POLL ID NON SÉQUENTIEL GLOBAL`);
        console.log(`   Dernier Poll ID global: ${this.lastGlobalPollId}`);
        console.log(`   Nouveau Poll ID: ${numericPollId}`);
        console.log(`   Écart: ${numericPollId - this.lastGlobalPollId}`);
        console.log(`   Chaîne: ${normalizedChain.toUpperCase()}`);
      }
      
      // Mettre à jour le dernier poll_id global connu
      if (!isNaN(numericPollId)) {
        this.lastGlobalPollId = numericPollId;
      }
      
      // Ajouter le nouveau poll_id au début du tableau et supprimer le plus ancien
      this.chainData[normalizedChain].pollIds.unshift({
        pollId: pollId,
        result: VoteStatusType.Unsubmitted
      });
      
      // Limiter la taille du tableau
      if (this.chainData[normalizedChain].pollIds.length > MAX_POLL_HISTORY) {
        this.chainData[normalizedChain].pollIds.pop();
      }

      // Émettre un événement pour notifier de la mise à jour
      this.emit('vote-update', {
        chain: normalizedChain,
        pollIds: this.chainData[normalizedChain].pollIds,
        lastGlobalPollId: this.lastGlobalPollId
      });
      
      return true;
    }
    
    return false;
  }

  // Récupérer les détails d'une transaction par son hash
  private async getTxByHash(txHash: string) {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 secondes de délai entre les tentatives
    
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
        // Si la transaction n'est pas encore indexée (404), réessayer après un délai
        if (error.response && error.response.status === 404) {
          console.log(`💬 Tx ${txHash} pas encore indexée, tentative ${attempt}/${maxRetries}...`);
          
          // Si ce n'est pas la dernière tentative, attendre et réessayer
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        }
        
        console.error(`❌ Erreur lors de la requête de la transaction ${txHash}:`, error.message);
        return null;
      }
    }
    
    return null;
  }

  // Fonction pour traiter un message de vote individuel
  private processVoteMessage(message: any) {
    try {
      // Vérifier si c'est un RefundMsgRequest contenant un VoteRequest
      if (message["@type"] === "/axelar.reward.v1beta1.RefundMsgRequest" && message.inner_message) {
        const innerMessage = message.inner_message;
        
        if (innerMessage.poll_id) {
          const pollId = innerMessage.poll_id;
          const vote = innerMessage.vote;
          
          if (vote && vote["@type"] === "/axelar.evm.v1beta1.VoteEvents") {
            const voteChain = vote.chain;
            const events = vote.events;
            
            // Vérifier si le vote est valide
            let isValid = false;
            if (events && events.length > 0) {
              // Vérifier que la chaîne dans events correspond à celle dans vote
              isValid = events.some((event: any) => event.chain === voteChain);
            }
            
            // Déterminer le statut en fonction de la validité
            const status = isValid ? VoteStatusType.Validated : VoteStatusType.Invalid;
            
            // Mettre à jour le statut du poll
            this.updatePollStatus(pollId, status, voteChain);
          } else {
            console.log(`Type de vote non supporté: ${vote?.["@type"] || "inconnu"}`);
          }
        } else {
          console.log("Pas de poll_id trouvé dans l'inner_message");
        }
      } else {
        console.log(`Type de message non supporté: ${message["@type"]}`);
      }
    } catch (e) {
      console.error("Erreur lors du traitement d'un message individuel:", e);
    }
  }

  // Fonction pour mettre à jour le statut d'un poll_id
  private updatePollStatus(pollId: string, newStatus: VoteStatusType, chain?: string): boolean {
    if (!pollId) return false;
    
    let updated = false;
    
    // Si une chaîne est spécifiée, mettre à jour uniquement cette chaîne
    if (chain) {
      const normalizedChain = chain.toLowerCase();
      if (this.chainData[normalizedChain]) {
        // Chercher l'index du poll
        const pollIndex = this.chainData[normalizedChain].pollIds.findIndex(item => 
          item.pollId === pollId && item.pollId !== "unknown"
        );
        
        // Si trouvé, mettre à jour son statut
        if (pollIndex >= 0) {
          const oldStatus = this.chainData[normalizedChain].pollIds[pollIndex].result;
          this.chainData[normalizedChain].pollIds[pollIndex].result = newStatus;
          updated = true;
          
          // Émettre un événement pour notifier de la mise à jour
          this.emit('vote-update', {
            chain: normalizedChain,
            pollIds: this.chainData[normalizedChain].pollIds,
            lastGlobalPollId: this.lastGlobalPollId
          });
          
          return updated;
        }
      }
    }
    
    // Si aucune mise à jour n'a été effectuée ou si aucune chaîne n'est spécifiée, rechercher dans toutes les chaînes
    for (const chainName of SUPPORTED_CHAINS) {
      const normalizedChain = chainName.toLowerCase();
      const chain = this.chainData[normalizedChain];
      
      if (chain) {
        // Chercher l'index du poll
        const pollIndex = chain.pollIds.findIndex(item => 
          item.pollId === pollId && item.pollId !== "unknown"
        );
        
        // Si trouvé, mettre à jour son statut
        if (pollIndex >= 0) {
          const oldStatus = chain.pollIds[pollIndex].result;
          chain.pollIds[pollIndex].result = newStatus;
          updated = true;
          
          // Émettre un événement pour notifier de la mise à jour
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
   * Récupère les données de votes pour une chaîne spécifique
   */
  public getChainVotes(chain: string): PollStatus[] | null {
    const normalizedChain = chain.toLowerCase();
    return this.chainData[normalizedChain]?.pollIds || null;
  }

  /**
   * Récupère toutes les données de votes pour toutes les chaînes
   */
  public getAllVotes(): ChainData {
    return this.chainData;
  }

  /**
   * Récupère le dernier ID de poll global
   */
  public getLastGlobalPollId(): number {
    return this.lastGlobalPollId;
  }
} 