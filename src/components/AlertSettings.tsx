import React, { useState, useEffect } from 'react';

interface AlertThresholds {
  consecutiveBlocksMissed: number;
  consecutiveHeartbeatsMissed: number;
  signRateThreshold: number;
  heartbeatRateThreshold: number;
}

interface AlertStatus {
  enabled: boolean;
  thresholds: AlertThresholds;
  notifications: {
    discord: boolean;
    telegram: boolean;
  };
}

const AlertSettings: React.FC = () => {
  const [alertStatus, setAlertStatus] = useState<AlertStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load alert settings when component mounts
  useEffect(() => {
    const fetchAlertSettings = async () => {
      try {
        const response = await fetch('/api/alerts/status');
        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }
        const data = await response.json();
        setAlertStatus(data);
        setLoading(false);
      } catch (err) {
        setError("Unable to load alert settings");
        setLoading(false);
        console.error(err);
      }
    };

    fetchAlertSettings();
  }, []);

  if (loading) {
    return (
      <div className="p-4 bg-black/20 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Alert Settings</h2>
        <p>Loading settings...</p>
      </div>
    );
  }

  if (error || !alertStatus) {
    return (
      <div className="p-4 bg-black/20 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Alert Settings</h2>
        <p className="text-red-500">{error || "Data not available"}</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-black/20 rounded-lg">
      <h2 className="text-xl font-bold mb-4">Alert Settings</h2>
      
      <div className="mb-4 flex items-center">
        <span className="mr-2">Status:</span>
        <span className={`px-2 py-1 rounded-full text-sm ${alertStatus.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {alertStatus.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      
      <div className="mb-4">
        <h3 className="font-semibold mb-2">Alert Thresholds</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/5 p-3 rounded">
            <span className="text-sm text-gray-400">Consecutive missed blocks:</span>
            <div className="text-lg">{alertStatus.thresholds.consecutiveBlocksMissed}</div>
          </div>
          <div className="bg-white/5 p-3 rounded">
            <span className="text-sm text-gray-400">Consecutive missed heartbeats:</span>
            <div className="text-lg">{alertStatus.thresholds.consecutiveHeartbeatsMissed}</div>
          </div>
          <div className="bg-white/5 p-3 rounded">
            <span className="text-sm text-gray-400">Minimum signing rate (%):</span>
            <div className="text-lg">{alertStatus.thresholds.signRateThreshold}%</div>
          </div>
          <div className="bg-white/5 p-3 rounded">
            <span className="text-sm text-gray-400">Minimum heartbeat rate (%):</span>
            <div className="text-lg">{alertStatus.thresholds.heartbeatRateThreshold}%</div>
          </div>
        </div>
      </div>
      
      <div>
        <h3 className="font-semibold mb-2">Notification Channels</h3>
        <div className="flex gap-4">
          <div className="flex items-center">
            <div className={`w-4 h-4 rounded-full mr-2 ${alertStatus.notifications.discord ? 'bg-green-500' : 'bg-gray-500'}`}></div>
            <span>Discord</span>
          </div>
          <div className="flex items-center">
            <div className={`w-4 h-4 rounded-full mr-2 ${alertStatus.notifications.telegram ? 'bg-green-500' : 'bg-gray-500'}`}></div>
            <span>Telegram</span>
          </div>
        </div>
      </div>
      
      <div className="mt-4 text-sm text-gray-400">
        <p>Alert settings can be modified in the .env file</p>
      </div>
    </div>
  );
};

export default AlertSettings; 