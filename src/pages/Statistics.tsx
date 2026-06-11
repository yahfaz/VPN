import { useEffect } from 'react';
import clsx from 'clsx';
import { ArrowDownToLine, ArrowUpFromLine, Server, Clock, type LucideIcon } from 'lucide-react';
import { useVPNStore } from '../store/vpnStore';

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: LucideIcon;
  label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="card p-4">
      <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center mb-3', color)}>
        <Icon size={18} className="text-white" />
      </div>
      <p className="text-gray-400 text-xs uppercase tracking-wider">{label}</p>
      <p className="text-white text-xl font-bold mt-1">{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function formatMB(mb: number) {
  if (mb < 1000) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1000).toFixed(2)} GB`;
}

function formatSpeed(mbps: number) {
  if (mbps < 1) return `${(mbps * 1000).toFixed(0)} Kbps`;
  return `${mbps.toFixed(1)} Mbps`;
}

import { useState } from 'react';

function useSessionTime(connectedSince: Date | null) {
  const [t, setT] = useState('—');
  useEffect(() => {
    if (!connectedSince) { setT('—'); return; }
    const id = setInterval(() => {
      const diff = Math.floor((Date.now() - connectedSince.getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      if (h > 0) setT(`${h}h ${m}m`);
      else if (m > 0) setT(`${m}m ${s}s`);
      else setT(`${s}s`);
    }, 1000);
    return () => clearInterval(id);
  }, [connectedSince]);
  return t;
}

export function Statistics() {
  const {
    status, connectedServer, connectedSince, updateSpeed,
    downloadSpeed, uploadSpeed, totalDownload, totalUpload, speedHistory,
    protocol,
  } = useVPNStore();
  const sessionTime = useSessionTime(connectedSince);
  const isConnected = status === 'connected';

  useEffect(() => {
    const id = setInterval(updateSpeed, 1000);
    return () => clearInterval(id);
  }, [updateSpeed]);

  const maxSpeed = Math.max(...speedHistory.map(s => Math.max(s.download, s.upload)), 1);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Statistics</h1>
        <p className="text-gray-400 text-sm mt-1">Real-time session data</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={ArrowDownToLine}
          label="Downloaded"
          value={formatMB(totalDownload)}
          sub={isConnected ? `${formatSpeed(downloadSpeed)} now` : undefined}
          color="bg-teal-500"
        />
        <StatCard
          icon={ArrowUpFromLine}
          label="Uploaded"
          value={formatMB(totalUpload)}
          sub={isConnected ? `${formatSpeed(uploadSpeed)} now` : undefined}
          color="bg-accent-blue"
        />
        <StatCard
          icon={Clock}
          label="Session Time"
          value={sessionTime}
          color="bg-accent-purple"
        />
        <StatCard
          icon={Server}
          label="Servers Used"
          value={connectedServer ? `1` : '0'}
          sub={connectedServer?.country}
          color="bg-orange-500"
        />
      </div>

      {/* Speed graph */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Live Speed Graph</h3>
        <div className="h-40 flex items-end gap-1 bg-navy-900 rounded-xl p-3">
          {Array.from({ length: 30 }).map((_, i) => {
            const sample = speedHistory[speedHistory.length - 30 + i];
            const dlH = sample ? (sample.download / maxSpeed) * 100 : 0;
            const ulH = sample ? (sample.upload / maxSpeed) * 100 : 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                <div
                  className="w-full rounded-sm transition-all duration-300"
                  style={{ height: `${Math.max(dlH, 1)}%`, background: 'rgba(0,210,200,0.8)' }}
                />
                <div
                  className="w-full rounded-sm transition-all duration-300"
                  style={{ height: `${Math.max(ulH, 1)}%`, background: 'rgba(79,110,247,0.7)' }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-teal-500" />
            <span className="text-xs text-gray-400">Download</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-accent-blue" />
            <span className="text-xs text-gray-400">Upload</span>
          </div>
          <span className="ml-auto text-xs text-gray-600">Last 30 seconds</span>
        </div>
      </div>

      {/* Session info */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Session Info</h3>
        <div className="space-y-3">
          {[
            { label: 'Status', value: isConnected ? '🟢 Connected' : '🔴 Disconnected' },
            { label: 'Server', value: connectedServer ? `${connectedServer.flag} ${connectedServer.city ?? connectedServer.country}` : '—' },
            { label: 'Protocol', value: isConnected && connectedServer?.proto ? `OpenVPN ${connectedServer.proto.toUpperCase()}` : protocol },
            { label: 'Encryption', value: isConnected ? 'Negotiated per server (AES)' : '—' },
            { label: 'Tunnel', value: isConnected ? '✅ All traffic routed via VPN' : '—' },
            { label: 'Server Host', value: connectedServer?.hostname ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-navy-700 last:border-0">
              <span className="text-sm text-gray-400">{label}</span>
              <span className="text-sm text-white font-medium">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
