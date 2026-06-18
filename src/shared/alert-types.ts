export interface ChainAlertStatus {
  rate: number;
  threshold: number;
  alarmActive: boolean;
  belowThreshold: boolean;
  consecutiveMissed: number;
}

export interface AlertStatus {
  timestamp: string;
  hasActiveAlarms: boolean;
  activeLabels: string[];
  node: {
    connected: boolean;
    noNewBlock: boolean;
    consecutiveBlocksMissed: boolean;
    currentConsecutiveMissed: number;
  };
  signRate: {
    rate: number;
    threshold: number;
    alarmActive: boolean;
    belowThreshold: boolean;
  };
  evmVotes: Record<string, ChainAlertStatus>;
  ampdVotes: Record<string, ChainAlertStatus>;
  ampdSignings: Record<string, ChainAlertStatus>;
}

export type ChainAlertKind = 'evm-votes' | 'ampd-votes' | 'ampd-signings';

export const ALERT_KIND_LABELS: Record<ChainAlertKind, string> = {
  'evm-votes': 'EVM vote rate',
  'ampd-votes': 'AMPD vote rate',
  'ampd-signings': 'AMPD signing rate',
};
