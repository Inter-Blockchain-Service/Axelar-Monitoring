import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

// Block status
export enum StatusType {
  Missed = 0,     // Missed block
  Prevote = 1,    // Prevote seen
  Precommit = 2,  // Precommit seen
  Signed = 3,     // Block signed
  Proposed = 4    // Block proposed
}

// Heartbeat status
export enum HeartbeatStatusType {
  Unknown = -1,   // No data yet for this period
  Missed = 0,     // Missed heartbeat
  Signed = 1      // Successfully signed heartbeat
}

// EVM vote status
export enum VoteStatusType {
  Unknown = 'unknown',
  Unsubmitted = 'unsubmitted',
  Validated = 'validated',
  Invalid = 'invalid'
}

// Interface for an EVM poll
export interface PollStatus {
  pollId: string;
  contractAddress: string;
  result: string;
}

// Interface for AMPD data
export interface AmpdData {
  [chain: string]: PollStatus[];
}

// Interface for votes data by chain
export interface ChainData {
  [chain: string]: {
    pollIds: PollStatus[];
  }
}

// Interface for validator metrics
export interface ValidatorMetrics {
  chainId: string;
  moniker: string;
  lastBlock: number;
  lastBlockTime: Date;
  signStatus: number[];
  totalMissed: number;
  totalSigned: number;
  totalProposed: number;
  consecutiveMissed: number;
  prevoteMissed: number;
  precommitMissed: number;
  connected: boolean;
  lastError: string;
  // Heartbeat metrics
  heartbeatStatus: number[];
  heartbeatBlocks: (number | undefined)[];
  heartbeatsMissed: number;
  heartbeatsSigned: number;
  heartbeatsConsecutiveMissed: number;
  lastHeartbeatPeriod: number;
  lastHeartbeatTime: Date | null;
  heartbeatConnected: boolean;
  heartbeatLastError: string;
  // EVM votes metrics
  evmVotesEnabled: boolean;
  evmVotes: ChainData;
  evmLastGlobalPollId: number;
  // AMPD metrics
  ampdEnabled: boolean;
  ampdVotes: AmpdData;
  ampdSignings: AmpdData;
  ampdSupportedChains: string[];
}

// Connection information
export interface ConnectionInfo {
  connected: boolean;
  heartbeatConnected: boolean;
  endpoint: string;
  wsEndpoint: string;
  validatorAddress: string;
  broadcasterAddress: string;
  evmVotesEnabled: boolean;
  ampdEnabled: boolean;
  ampdAddress: string;
}

export function useMetrics() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [metrics, setMetrics] = useState<ValidatorMetrics>({
    chainId: '',
    moniker: '',
    lastBlock: 0,
    lastBlockTime: new Date(),
    signStatus: [],
    totalMissed: 0,
    totalSigned: 0,
    totalProposed: 0,
    consecutiveMissed: 0,
    prevoteMissed: 0,
    precommitMissed: 0,
    connected: false,
    lastError: '',
    // Initialize heartbeat metrics
    heartbeatStatus: [],
    heartbeatBlocks: [],
    heartbeatsMissed: 0,
    heartbeatsSigned: 0,
    heartbeatsConsecutiveMissed: 0,
    lastHeartbeatPeriod: 0,
    lastHeartbeatTime: null,
    heartbeatConnected: false,
    heartbeatLastError: '',
    // Initialize EVM votes metrics
    evmVotesEnabled: false,
    evmVotes: {},
    evmLastGlobalPollId: 0,
    // Initialize AMPD metrics
    ampdEnabled: false,
    ampdVotes: {},
    ampdSignings: {},
    ampdSupportedChains: []
  });
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    connected: false,
    heartbeatConnected: false,
    endpoint: '',
    wsEndpoint: '',
    validatorAddress: '',
    broadcasterAddress: '',
    evmVotesEnabled: false,
    ampdEnabled: false,
    ampdAddress: ''
  });
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Create socket connection
    const socketInstance = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001');

    // Handle connection events
    socketInstance.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to WebSocket server');
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from WebSocket server');
    });

    // Listen for metrics updates
    socketInstance.on('metrics-update', (data: ValidatorMetrics) => {
      // Convert lastBlockTime from string to Date if needed
      if (typeof data.lastBlockTime === 'string') {
        data.lastBlockTime = new Date(data.lastBlockTime);
      }
      // Convert lastHeartbeatTime from string to Date if needed
      if (data.lastHeartbeatTime && typeof data.lastHeartbeatTime === 'string') {
        data.lastHeartbeatTime = new Date(data.lastHeartbeatTime);
      }
      setMetrics(data);
    });

    // Listen for EVM votes updates
    socketInstance.on('evm-votes-update', (data: ChainData) => {
      setMetrics(prevMetrics => ({
        ...prevMetrics,
        evmVotes: data
      }));
    });

    // Listen for connection information
    socketInstance.on('connection-status', (data: ConnectionInfo) => {
      setConnectionInfo(data);
    });

    setSocket(socketInstance);

    // Cleanup on disconnect
    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return { metrics, connectionInfo, isConnected, socket };
} 