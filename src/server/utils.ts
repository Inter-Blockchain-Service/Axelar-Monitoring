import { ValidatorMetrics } from './metrics';
import { Broadcasters } from './websockets-client';

/**
 * Updates connection metrics and broadcasts if needed
 * @param metrics Validator metrics to update
 * @param connected Connection status
 * @param errorMessage Optional error message
 * @param broadcasters Optional broadcasters to send updates
 */
export const updateConnectionStatus = (
  metrics: ValidatorMetrics,
  connected: boolean,
  errorMessage: string = '',
  broadcasters?: Broadcasters
): void => {
  metrics.connected = connected;
  metrics.heartbeatConnected = connected;
  
  if (errorMessage) {
    metrics.lastError = errorMessage;
    metrics.heartbeatLastError = errorMessage;
  }
  
  if (broadcasters) {
    broadcasters.broadcastMetricsUpdate(metrics);
  }
};

/**
 * Helper function to log and broadcast metrics changes
 * @param metrics Metrics to broadcast
 * @param broadcasters Broadcasters to use
 * @param logMessage Optional log message
 */
export const updateAndBroadcastMetrics = (
  metrics: ValidatorMetrics,
  broadcasters?: Broadcasters,
  logMessage?: string
): void => {
  if (broadcasters) {
    broadcasters.broadcastMetricsUpdate(metrics);
  }
  
  if (logMessage) {
    console.log(logMessage);
  }
};

/**
 * Helper function to update array status with shift pattern
 * @param statusArray Array to update
 * @param newStatus New status to insert at the beginning
 * @returns Updated array
 */
export const updateStatusArray = <T>(
  statusArray: T[],
  newStatus: T
): T[] => {
  return [newStatus, ...statusArray.slice(0, statusArray.length - 1)];
};

/**
 * Helper to log node status
 * @param status Node status object
 * @param attempts Number of connection attempts
 * @param elapsedMinutes Minutes elapsed since first attempt
 * @param interval Retry interval in ms
 */
export const logNodeStatus = (
  status: { available: boolean; synced: boolean; blockHeight?: number; error?: string },
  attempts: number,
  elapsedMinutes: number,
  interval: number
): void => {
  if (status.available && status.synced) {
    console.log(`Node ready (height: ${status.blockHeight})`);
  } else if (status.available && !status.synced) {
    console.log(`Node syncing (attempt ${attempts}, ${elapsedMinutes}m elapsed) - retry in ${interval/1000}s`);
  } else {
    const errorMsg = status.error ? ` - ${status.error}` : '';
    console.log(`Node unavailable (attempt ${attempts}, ${elapsedMinutes}m elapsed)${errorMsg} - retry in ${interval/1000}s`);
  }
};

/**
 * Creates a safe error message from any error object
 * @param error Error object
 * @param defaultMessage Default message if error is not an Error instance
 * @returns Error message string
 */
export const getErrorMessage = (
  error: unknown,
  defaultMessage: string = 'Unknown error'
): string => {
  return error instanceof Error ? error.message : defaultMessage;
}; 