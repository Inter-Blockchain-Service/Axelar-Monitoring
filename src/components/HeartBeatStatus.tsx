import React, { useState, useEffect, useRef } from 'react';
import { HeartbeatStatusType } from '@/hooks/useMetrics';
import { HEARTBEAT_PERIOD } from '@/constants';

interface HeartBeatStatusProps {
  statusList: number[];
  className?: string;
  lastPeriod?: number;
  blocksList?: (number | undefined)[];
}

export default function HeartBeatStatus({ statusList, className = '', lastPeriod = 0, blocksList = [] }: HeartBeatStatusProps) {
  const [prevLastPeriod, setPrevLastPeriod] = useState<number>(lastPeriod);
  const [hasNewHeartbeat, setHasNewHeartbeat] = useState<boolean>(false);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Nombre de heartbeats à afficher
  const DISPLAY_LIMIT = 200;
  
  // Détecter l'arrivée d'un nouveau heartbeat
  useEffect(() => {
    if (lastPeriod > prevLastPeriod && prevLastPeriod > 0) {
      setHasNewHeartbeat(true);
      
      // Réinitialiser l'animation après 1 seconde
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      
      animationTimeoutRef.current = setTimeout(() => {
        setHasNewHeartbeat(false);
      }, 1000);
    }
    
    setPrevLastPeriod(lastPeriod);
    
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [lastPeriod, prevLastPeriod]);
  
  // Fonction pour obtenir la couleur en fonction du statut
  const getStatusColor = (status: number) => {
    switch (status) {
      case HeartbeatStatusType.Signed:
        return 'bg-green-500';
      case HeartbeatStatusType.Missed:
        return 'bg-red-500';
      case HeartbeatStatusType.Unknown:
      default:
        return 'bg-[#9e9e9e4d]';
    }
  };

  // Fonction pour obtenir le texte du statut
  const getStatusText = (status: number) => {
    switch (status) {
      case HeartbeatStatusType.Signed:
        return 'Signé';
      case HeartbeatStatusType.Missed:
        return 'Manqué';
      case HeartbeatStatusType.Unknown:
      default:
        return 'Inconnu';
    }
  };
  
  // Calculer la période réelle pour un index donné
  const getPeriodNumber = (index: number) => {
    if (lastPeriod <= 0) return '?';
    return (lastPeriod - index).toString();
  };
  
  // Générer le texte du tooltip en fonction du statut et de la hauteur du bloc
  const getTooltipText = (index: number, status: number, blockHeight?: number) => {
    const period = getPeriodNumber(index);
    
    if (status === HeartbeatStatusType.Signed && blockHeight) {
      return `HeartBeat au bloc ${blockHeight}`;
    } else if (status === HeartbeatStatusType.Missed) {
      return `HeartBeat manqué (période ${period})`;
    } else {
      return `Pas de données (période ${period})`;
    }
  };
  
  // Préparer les données pour l'affichage
  const visibleHeartbeats = statusList.slice(0, DISPLAY_LIMIT).map((status, index) => {
    const blockHeight = blocksList && blocksList.length > index ? blocksList[index] : undefined;
    return { status, index, blockHeight };
  });
  
  return (
    <div className={`bg-[#333333] p-4 rounded-lg shadow-md ${className}`}>
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-200">
            Statut des HeartBeats récents
          </h3>
          <div className="text-sm text-gray-500">
            Affichage des {DISPLAY_LIMIT} dernières périodes
          </div>
        </div>

      </div>
      
      <div className="grid grid-cols-35 gap-1 pb-1 overflow-y-auto max-h-[180px]">
        {visibleHeartbeats.map((item) => (
          <div 
            key={item.index} 
            className={`w-4 h-4 ${getStatusColor(item.status)} hover:opacity-80 transition-opacity rounded-sm ${item.index === 0 && hasNewHeartbeat ? 'animate-pulse scale-110' : ''}`}
            title={getTooltipText(item.index, item.status, item.blockHeight)}
          />
        ))}
      </div>
      
      <div className="flex justify-start mt-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <span className="text-xs">Signé</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            <span className="text-xs">Manqué</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-[#9e9e9e4d] rounded-sm"></div>
            <span className="text-xs">Pas de données</span>
          </div>
        </div>
      </div>
    </div>
  );
} 