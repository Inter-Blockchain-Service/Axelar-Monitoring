import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

// Statut d'un bloc
export enum StatusType {
  Missed = 0,     // Bloc manqué
  Prevote = 1,    // Prevote vu
  Precommit = 2,  // Precommit vu
  Signed = 3,     // Bloc signé
  Proposed = 4    // Bloc proposé
}

// Statut d'un heartbeat
export enum HeartbeatStatusType {
  Unknown = -1,   // Pas encore de données pour cette période
  Missed = 0,     // Heartbeat manqué
  Signed = 1      // Heartbeat signé avec succès
}

// Statut d'un vote EVM
export enum VoteStatusType {
  Unknown = 'unknown',
  Unsubmitted = 'unsubmitted',
  Validated = 'validated',
  Invalid = 'invalid'
}

// Interface pour un poll EVM
export interface PollStatus {
  pollId: string;
  result: string;
}

// Interface pour les données de votes par chaîne
export interface ChainData {
  [chain: string]: {
    pollIds: PollStatus[];
  }
}

// Interface pour les métriques du validateur
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
  // Métriques de Heartbeat
  heartbeatStatus: number[];
  heartbeatBlocks: (number | undefined)[];
  heartbeatsMissed: number;
  heartbeatsSigned: number;
  heartbeatsConsecutiveMissed: number;
  lastHeartbeatPeriod: number;
  lastHeartbeatTime: Date | null;
  heartbeatConnected: boolean;
  heartbeatLastError: string;
  // Métriques de votes EVM
  evmVotesEnabled: boolean;
  evmVotes: ChainData;
  evmLastGlobalPollId: number;
}

// Informations de connexion
export interface ConnectionInfo {
  connected: boolean;
  heartbeatConnected: boolean;
  endpoint: string;
  wsEndpoint: string;
  validatorAddress: string;
  broadcasterAddress: string;
  evmVotesEnabled: boolean;
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
    // Initialisation des métriques de heartbeat
    heartbeatStatus: [],
    heartbeatBlocks: [],
    heartbeatsMissed: 0,
    heartbeatsSigned: 0,
    heartbeatsConsecutiveMissed: 0,
    lastHeartbeatPeriod: 0,
    lastHeartbeatTime: null,
    heartbeatConnected: false,
    heartbeatLastError: '',
    // Initialisation des métriques de votes EVM
    evmVotesEnabled: false,
    evmVotes: {},
    evmLastGlobalPollId: 0
  });
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    connected: false,
    heartbeatConnected: false,
    endpoint: '',
    wsEndpoint: '',
    validatorAddress: '',
    broadcasterAddress: '',
    evmVotesEnabled: false
  });
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Création de la connexion socket
    const socketInstance = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001');

    // Gestion des événements de connexion
    socketInstance.on('connect', () => {
      setIsConnected(true);
      console.log('Connecté au serveur WebSocket');
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      console.log('Déconnecté du serveur WebSocket');
    });

    // Écoute des mises à jour de métriques
    socketInstance.on('metrics-update', (data: ValidatorMetrics) => {
      // Convertir lastBlockTime de string à Date si nécessaire
      if (typeof data.lastBlockTime === 'string') {
        data.lastBlockTime = new Date(data.lastBlockTime);
      }
      // Convertir lastHeartbeatTime de string à Date si nécessaire
      if (data.lastHeartbeatTime && typeof data.lastHeartbeatTime === 'string') {
        data.lastHeartbeatTime = new Date(data.lastHeartbeatTime);
      }
      setMetrics(data);
    });

    // Écoute des mises à jour des votes EVM
    socketInstance.on('evm-votes-update', (data: ChainData) => {
      setMetrics(prevMetrics => ({
        ...prevMetrics,
        evmVotes: data
      }));
    });

    // Écoute des informations de connexion
    socketInstance.on('connection-status', (data: ConnectionInfo) => {
      setConnectionInfo(data);
    });

    setSocket(socketInstance);

    // Nettoyage à la déconnexion
    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return { metrics, connectionInfo, isConnected };
} 