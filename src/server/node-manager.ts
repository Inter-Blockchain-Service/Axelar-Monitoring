import axios from 'axios';
import { TendermintClient } from './tendermint';
import { ValidatorMetrics } from './metrics';
import { Broadcasters } from './websockets-client';
import { 
  updateConnectionStatus, 
  logNodeStatus, 
  getErrorMessage
} from './utils';

// Constants for reconnection management
const RECONNECTION_COOLDOWN = 10000; // 10 seconds between reconnection attempts
const QUICK_RECONNECT_DELAY = 10 * 1000; // 10 seconds

// Global variables for control
let isReconnectionInProgress = false;
let lastReconnectionAttempt = 0;

/**
 * Checks if the RPC node is available and synchronized
 * @param rpcEndpoint RPC node URL
 * @returns Promise with an object indicating if the node is available and synced
 */
export async function checkNodeStatus(rpcEndpoint: string): Promise<{ available: boolean; synced: boolean; blockHeight?: number; error?: string }> {
  try {
    // Clean URL for HTTP request
    const endpoint = rpcEndpoint.replace(/\/websocket$/, '');
    const statusUrl = `${endpoint}/status`;
    
    console.log(`Checking node status at: ${statusUrl}`);
    
    // Add a 5-second timeout to avoid indefinitely blocked requests
    const response = await axios.get(statusUrl, { timeout: 5000 });
    
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
  } catch (error: unknown) {
    console.error('Error checking node status:', error);
    const errorMessage = getErrorMessage(error, 'Unknown error');
    return { available: false, synced: false, error: errorMessage };
  }
}

/**
 * Waits for the node to be available and synchronized
 * @param rpcEndpoint RPC node URL
 * @param interval Interval between attempts (in ms)
 * @returns Promise that resolves when the node is ready
 */
export async function waitForNodeToBeSynced(
  rpcEndpoint: string,
  interval: number = 10000
): Promise<boolean> {
  let attempts = 0;
  const startTime = Date.now();
  
  // Infinite loop until the node is synchronized
  while (true) {
    attempts++;
    const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
    const status = await checkNodeStatus(rpcEndpoint);
    
    // Log node status based on availability and sync state
    logNodeStatus(status, attempts, elapsedMinutes, interval);
    
    if (status.available && status.synced) {
      return true;
    }
    
    // Wait for the specified interval
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Checks if a reconnection can be attempted based on the time elapsed
 * since the last attempt and the current state
 */
export function canAttemptReconnection(): boolean {
  const now = Date.now();
  
  // If a reconnection is already in progress, don't start a new one
  if (isReconnectionInProgress) {
    return false;
  }
  
  // Check if the cooldown period has passed
  if (now - lastReconnectionAttempt < RECONNECTION_COOLDOWN) {
    return false;
  }
  
  return true;
}

/**
 * Creates a function to reconnect to the RPC node
 * @param tendermintClient Tendermint client
 * @param metrics Validator metrics
 * @param rpcEndpoint RPC node URL
 * @param broadcasters Optional broadcasters for WebSocket updates
 * @returns Reconnection function
 */
export function createReconnectionHandler(
  tendermintClient: TendermintClient,
  metrics: ValidatorMetrics,
  rpcEndpoint: string,
  broadcasters?: Broadcasters
): () => Promise<void> {
  let lastBlockHeight: number = 0;
  let lastBlockTime: Date = new Date();

  const reconnectToNode = async (): Promise<void> => {
    if (!canAttemptReconnection()) {
      console.log("Reconnection already in progress or cooldown period not elapsed, skipping...");
      return;
    }
    
    isReconnectionInProgress = true;
    lastReconnectionAttempt = Date.now();
    
    console.log("Attempting to reconnect to node...");
    
    // Disconnect the existing client
    tendermintClient.disconnect();
    
    // Update status
    updateConnectionStatus(
      metrics,
      false,
      "Node disconnected. Attempting to reconnect...",
      broadcasters
    );
    
    try {
      // Check if the node is ready
      console.log(`Checking if node ${rpcEndpoint} is available and synced...`);
      const isNodeReady = await waitForNodeToBeSynced(rpcEndpoint);
      
      if (isNodeReady) {
        // Reconnect the client
        tendermintClient.handleReconnection();
        
        updateConnectionStatus(
          metrics,
          true,
          "Node reconnected successfully",
          broadcasters
        );
      }
    } catch (error) {
      console.error('Error during node reconnection:', error);
      updateConnectionStatus(
        metrics,
        false,
        "Failed to reconnect to node",
        broadcasters
      );
    } finally {
      isReconnectionInProgress = false;
    }
  };

  // Function to check for new blocks
  const checkNewBlocks = () => {
    if (metrics.lastBlock === lastBlockHeight) {
      const timeSinceLastBlock = Date.now() - lastBlockTime.getTime();
      
      // If no new block for 10 seconds, attempt a quick reconnect
      if (timeSinceLastBlock > QUICK_RECONNECT_DELAY) {
        console.log('No new block detected for 10 seconds, attempting quick reconnect...');
        reconnectToNode().catch((error: Error) => {
          console.error('Quick reconnect failed:', error);
        });
      }
    } else {
      lastBlockHeight = metrics.lastBlock;
      lastBlockTime = new Date();
    }
  };

  // Start periodic new block checking
  setInterval(checkNewBlocks, 5000); // Check every 5 seconds

  // Set up disconnect event handler
  tendermintClient.on('disconnect', () => {
    reconnectToNode();
  });

  return reconnectToNode;
}

/**
 * Connects to the RPC node after checking its status
 * @param tendermintClient Tendermint client
 * @param metrics Validator metrics
 * @param rpcEndpoint RPC node URL
 */
export async function connectToNode(
  tendermintClient: TendermintClient,
  metrics: ValidatorMetrics,
  rpcEndpoint: string
): Promise<void> {
  // Check RPC node status before connecting
  console.log(`Checking if node ${rpcEndpoint} is available and synced...`);
  
  try {
    const isNodeReady = await waitForNodeToBeSynced(rpcEndpoint);
    
    if (isNodeReady) {
      // Connect the Tendermint client if the node is ready
      console.log('Node is ready. Connecting Tendermint client...');
      tendermintClient.connect();
    } else {
      // This code should never be reached since the function waits indefinitely
      console.warn('WARNING: Node is not ready or synced. Starting anyway, but expect issues.');
      
      // Update metrics with error message
      updateConnectionStatus(metrics, false, "Node is not available or not synced.");
      
      // Connect anyway to allow future attempts
      tendermintClient.connect();
    }
  } catch (error: unknown) {
    console.error('Error during node status check:', error);
    console.warn('Starting Tendermint client anyway...');
    tendermintClient.connect();
  }
} 