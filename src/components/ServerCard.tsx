import clsx from 'clsx';
import { Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Server } from '../types';
import { useVPNStore } from '../store/vpnStore';

interface Props {
  server: Server;
  compact?: boolean;
}

function pingColor(ping: number) {
  if (ping < 50) return 'text-teal-400';
  if (ping < 120) return 'text-yellow-400';
  return 'text-red-400';
}

function loadColor(load: number) {
  if (load < 40) return 'bg-teal-400';
  if (load < 70) return 'bg-yellow-400';
  return 'bg-red-400';
}

export function ServerCard({ server, compact = false }: Props) {
  const { selectedServer, connectedServer, selectServer, toggleFavorite, connect } = useVPNStore();
  const navigate = useNavigate();
  const isSelected = selectedServer?.id === server.id;
  const isConnected = connectedServer?.id === server.id;

  const handleSelect = () => {
    selectServer(server);
  };

  const handleConnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConnected) return;
    selectServer(server);
    connect();
    // Jump to the dashboard so the user can watch the connecting/verifying status.
    navigate('/');
  };

  return (
    <div
      onClick={handleSelect}
      className={clsx(
        'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150',
        'hover:bg-navy-700',
        isSelected && !isConnected && 'bg-accent-blue/10 border border-accent-blue/25',
        isConnected && 'bg-teal-500/10 border border-teal-500/30'
      )}
    >
      <span className="text-2xl">{server.flag}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white text-sm font-medium truncate">
            {server.city ?? server.country}
          </p>
          {server.city && (
            <p className="text-gray-500 text-xs truncate hidden sm:block">{server.country}</p>
          )}
          {server.type === 'static' && (
            <span className="text-xs bg-accent-purple/20 text-accent-purple px-1.5 py-0.5 rounded font-medium flex-shrink-0">Static</span>
          )}
          {server.type === 'p2p' && (
            <span className="text-xs bg-accent-blue/20 text-accent-blue px-1.5 py-0.5 rounded font-medium flex-shrink-0">P2P</span>
          )}
          {isConnected && (
            <span className="text-xs bg-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded font-medium flex-shrink-0">Connected</span>
          )}
        </div>
        {!compact && (
          <div className="flex items-center gap-3 mt-1">
            {server.config ? (
              // Live VPNGate server: show what actually matters for picking one
              <>
                {server.proto && (
                  <span className={clsx(
                    'text-xs font-mono px-1.5 py-0.5 rounded',
                    server.firewallFriendly
                      ? 'bg-teal-500/15 text-teal-400'
                      : 'bg-navy-900 text-gray-500'
                  )}>
                    {server.proto.toUpperCase()}{server.port ? `:${server.port}` : ''}
                  </span>
                )}
                {server.speedMbps !== undefined && server.speedMbps > 0 && (
                  <span className="text-xs text-gray-500">{server.speedMbps} Mbps</span>
                )}
                {server.sessions !== undefined && (
                  <span className="text-xs text-gray-500">{server.sessions} users</span>
                )}
              </>
            ) : (
              <>
                <span className="text-xs text-gray-500">{server.serverCount} servers</span>
                <div className="flex items-center gap-1">
                  <div className={clsx('w-1.5 h-1.5 rounded-full', loadColor(server.load))} />
                  <span className="text-xs text-gray-500">{server.load}% load</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={clsx('text-xs font-mono font-medium', pingColor(server.ping))}>
          {server.ping}ms
        </span>

        <button
          onClick={e => { e.stopPropagation(); toggleFavorite(server.id); }}
          className={clsx(
            'p-1 rounded transition-colors',
            server.favorite ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'
          )}
        >
          <Star size={14} fill={server.favorite ? 'currentColor' : 'none'} />
        </button>

        <button
          onClick={handleConnect}
          className={clsx(
            'px-3 py-1 rounded-lg text-xs font-semibold transition-all',
            isConnected
              ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
              : 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/30'
          )}
        >
          {isConnected ? 'Connected' : 'Connect'}
        </button>
      </div>
    </div>
  );
}
