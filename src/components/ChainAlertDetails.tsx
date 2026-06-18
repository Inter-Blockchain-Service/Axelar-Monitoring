import { ChainAlertStatus, ChainAlertKind, ALERT_KIND_LABELS } from '../shared/alert-types';

export function getAlertDotClass(status?: ChainAlertStatus): string {
  if (!status) return 'bg-[#4a4a4a]';
  if (status.alarmActive) return 'bg-[#ef4444] animate-pulse';
  if (status.belowThreshold || status.consecutiveMissed > 0) return 'bg-[#f59e0b]';
  return 'bg-[#10b981]';
}

export function getAlertStatusLabel(status?: ChainAlertStatus): string {
  if (!status) return 'No alert data';
  if (status.alarmActive) return 'Alarm active';
  if (status.belowThreshold) return 'Below threshold';
  if (status.consecutiveMissed > 0) return 'Consecutive misses';
  return 'OK';
}

interface ChainAlertDetailsProps {
  kind: ChainAlertKind;
  status?: ChainAlertStatus;
}

export default function ChainAlertDetails({ kind, status }: ChainAlertDetailsProps) {
  return (
    <div className="mb-5 p-4 rounded-lg border border-[#2a2a2a] bg-[#141414]">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${getAlertDotClass(status)}`} />
        <span className="text-sm font-medium text-white">
          {status ? getAlertStatusLabel(status) : 'Waiting for alert data…'}
        </span>
        <span className="text-xs text-[#a0a0a0]">· {ALERT_KIND_LABELS[kind]}</span>
      </div>

      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[#a0a0a0] text-xs">Current rate</p>
            <p className={`font-medium ${status.belowThreshold ? 'text-[#f59e0b]' : 'text-[#10b981]'}`}>
              {status.rate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[#a0a0a0] text-xs">Threshold</p>
            <p className="text-white font-medium">{status.threshold.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[#a0a0a0] text-xs">Alarm latched</p>
            <p className={`font-medium ${status.alarmActive ? 'text-[#ef4444]' : 'text-[#10b981]'}`}>
              {status.alarmActive ? 'Yes' : 'No'}
            </p>
          </div>
          <div>
            <p className="text-[#a0a0a0] text-xs">Consecutive missed</p>
            <p className={`font-medium ${status.consecutiveMissed > 0 ? 'text-[#f59e0b]' : 'text-white'}`}>
              {status.consecutiveMissed}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
