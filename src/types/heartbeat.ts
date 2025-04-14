// Type décrivant le statut d'un heartbeat
export enum HeartbeatStatusType {
  Unknown = -1, // Pas encore analysé
  Missed = 0,   // Heartbeat manqué
  Found = 1     // Heartbeat trouvé
}

// Mise à jour du statut d'un heartbeat
export interface HeartbeatUpdate {
  periodStart: number;
  periodEnd: number;
  found: boolean;
  blockHeight: number;
} 