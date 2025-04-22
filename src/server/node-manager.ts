import axios from 'axios';
import { TendermintClient } from './tendermint';
import { ValidatorMetrics } from './metrics';
import { broadcastMetricsUpdate } from './websockets';

/**
 * Vérifie si le nœud RPC est disponible et synchronisé
 * @param rpcEndpoint URL du nœud RPC
 * @returns Promesse avec un objet indiquant si le nœud est disponible et synchronisé
 */
export async function checkNodeStatus(rpcEndpoint: string): Promise<{ available: boolean; synced: boolean; blockHeight?: number; error?: string }> {
  try {
    // Nettoyer l'URL pour la requête HTTP
    const endpoint = rpcEndpoint.replace(/\/websocket$/, '');
    const statusUrl = `${endpoint}/status`;
    
    console.log(`Checking node status at: ${statusUrl}`);
    
    const response = await axios.get(statusUrl);
    
    if (response.data && response.data.result) {
      const syncInfo = response.data.result.sync_info;
      const isSynced = syncInfo && syncInfo.catching_up === false;
      const blockHeight = syncInfo ? parseInt(syncInfo.latest_block_height) : undefined;
      
      return { 
        available: true, 
        synced: isSynced,
        blockHeight
      };
    }
    
    return { available: true, synced: false, error: 'Unexpected response format' };
  } catch (error: any) {
    console.error('Error checking node status:', error);
    return { available: false, synced: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Attend que le nœud soit disponible et synchronisé
 * @param rpcEndpoint URL du nœud RPC
 * @param interval Intervalle entre les tentatives (en ms)
 * @returns Promesse qui se résout quand le nœud est prêt
 */
export async function waitForNodeToBeSynced(
  rpcEndpoint: string,
  interval: number = 10000
): Promise<boolean> {
  let attempts = 0;
  const startTime = Date.now();
  
  // Boucle infinie jusqu'à ce que le nœud soit synchronisé
  while (true) {
    attempts++;
    const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
    const status = await checkNodeStatus(rpcEndpoint);
    
    if (status.available && status.synced) {
      console.log(`Node is ready and synced at block height: ${status.blockHeight}`);
      return true;
    }
    
    if (status.available && !status.synced) {
      console.log(`Node is available but still syncing (attempt ${attempts}, waiting for ${elapsedMinutes} min). Waiting ${interval/1000}s before retrying...`);
      if (status.blockHeight) {
        console.log(`Current block height: ${status.blockHeight}`);
      }
    } else {
      console.log(`Node is not available (attempt ${attempts}, waiting for ${elapsedMinutes} min). Waiting ${interval/1000}s before retrying...`);
    }
    
    // Attendre l'intervalle spécifié
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Crée une fonction de reconnexion au nœud RPC
 * @param tendermintClient Client Tendermint
 * @param metrics Métriques du validateur
 * @param rpcEndpoint URL du nœud RPC
 * @returns Fonction de reconnexion
 */
export function createReconnectionHandler(
  tendermintClient: TendermintClient,
  metrics: ValidatorMetrics,
  rpcEndpoint: string
): () => Promise<void> {
  return async function reconnectToNode(): Promise<void> {
    console.log("Attempting to reconnect to node...");
    
    // D'abord, déconnecter le client existant
    tendermintClient.disconnect();
    
    // Mettre à jour les métriques pour refléter l'état déconnecté
    metrics.connected = false;
    metrics.heartbeatConnected = false;
    metrics.lastError = "Node disconnected. Attempting to reconnect...";
    broadcastMetricsUpdate(metrics);
    
    try {
      // Attendre que le nœud soit à nouveau disponible et synchronisé
      console.log(`Checking if node ${rpcEndpoint} is available and synced...`);
      const isNodeReady = await waitForNodeToBeSynced(rpcEndpoint);
      
      if (isNodeReady) {
        // Connecter le client Tendermint si le nœud est prêt
        console.log('Node is ready again. Reconnecting Tendermint client...');
        tendermintClient.connect();
      }
    } catch (error: any) {
      console.error('Error during node reconnection:', error);
      console.warn('Failed to reconnect. Will retry on next permanent disconnect event.');
    }
  };
}

/**
 * Connecte au nœud RPC après avoir vérifié son statut
 * @param tendermintClient Client Tendermint
 * @param metrics Métriques du validateur
 * @param rpcEndpoint URL du nœud RPC
 */
export async function connectToNode(
  tendermintClient: TendermintClient,
  metrics: ValidatorMetrics,
  rpcEndpoint: string
): Promise<void> {
  // Vérifier le statut du nœud RPC avant de se connecter
  console.log(`Checking if node ${rpcEndpoint} is available and synced...`);
  
  try {
    const isNodeReady = await waitForNodeToBeSynced(rpcEndpoint);
    
    if (isNodeReady) {
      // Connecter le client Tendermint si le nœud est prêt
      console.log('Node is ready. Connecting Tendermint client...');
      tendermintClient.connect();
    } else {
      // Ce code ne devrait jamais être atteint puisque la fonction attend indéfiniment
      console.warn('WARNING: Node is not ready or synced. Starting anyway, but expect issues.');
      
      // Mettre à jour les métriques avec le message d'erreur
      metrics.connected = false;
      metrics.lastError = "Node is not available or not synced.";
      
      // Connecter quand même pour permettre les tentatives futures
      tendermintClient.connect();
    }
  } catch (error: any) {
    console.error('Error during node status check:', error);
    console.warn('Starting Tendermint client anyway...');
    tendermintClient.connect();
  }
} 