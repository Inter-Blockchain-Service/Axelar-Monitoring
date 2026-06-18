'use client';

import React from 'react';
import { ChainAlertStatus } from '../shared/alert-types';
import { getAlertDotClass, getAlertStatusLabel } from './ChainAlertDetails';

interface ChainAlertDotProps {
  chain: string;
  status?: ChainAlertStatus;
  onClick?: () => void;
}

const ChainAlertDot: React.FC<ChainAlertDotProps> = ({ chain, status, onClick }) => {
  const dot = (
    <div className={`w-2.5 h-2.5 rounded-full ${getAlertDotClass(status)}`} />
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="shrink-0 mt-0.5 p-1 rounded hover:bg-[#2a2a2a] transition-colors"
        title={`Alert status: ${getAlertStatusLabel(status)} — click for history`}
        aria-label={`Alert status for ${chain}`}
      >
        {dot}
      </button>
    );
  }

  return (
    <div
      className="shrink-0 mt-0.5 p-1"
      title={`Alert status: ${getAlertStatusLabel(status)}`}
    >
      {dot}
    </div>
  );
};

export default ChainAlertDot;
