import { useVPNStore } from '../store/vpnStore';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

function formatSpeed(mbps: number): string {
  if (mbps < 1) return `${(mbps * 1000).toFixed(0)} Kbps`;
  return `${mbps.toFixed(1)} Mbps`;
}

function formatBytes(mb: number): string {
  if (mb < 1000) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1000).toFixed(2)} GB`;
}

export function SpeedChart() {
  const { downloadSpeed, uploadSpeed, totalDownload, totalUpload, speedHistory, status } = useVPNStore();
  const isActive = status === 'connected';
  const maxSpeed = Math.max(...speedHistory.map(s => s.download), 1);

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Network Speed</h3>

      {/* Speed bars */}
      <div className="h-20 flex items-end gap-0.5 mb-4">
        {Array.from({ length: 30 }).map((_, i) => {
          const sample = speedHistory[speedHistory.length - 30 + i];
          const h = sample ? (sample.download / maxSpeed) * 100 : 0;
          return (
            <div
              key={i}
              className="flex-1 rounded-sm speed-bar"
              style={{
                height: `${Math.max(h, 2)}%`,
                background: isActive
                  ? `linear-gradient(to top, rgba(0,210,200,0.8), rgba(0,210,200,0.3))`
                  : 'rgba(79,110,247,0.15)',
              }}
            />
          );
        })}
      </div>

      {/* Current speeds */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-navy-800 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDownToLine size={13} className="text-teal-400" />
            <span className="text-xs text-gray-400">Download</span>
          </div>
          <p className="text-white font-bold text-lg">{isActive ? formatSpeed(downloadSpeed) : '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5">{formatBytes(totalDownload)} total</p>
        </div>
        <div className="bg-navy-800 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUpFromLine size={13} className="text-accent-blue" />
            <span className="text-xs text-gray-400">Upload</span>
          </div>
          <p className="text-white font-bold text-lg">{isActive ? formatSpeed(uploadSpeed) : '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5">{formatBytes(totalUpload)} total</p>
        </div>
      </div>
    </div>
  );
}
