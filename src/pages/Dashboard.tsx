import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Clock, Shield, Lock, ChevronRight, Wifi, WifiOff, RefreshCw, Terminal, ChevronDown } from 'lucide-react';
import { useVPNStore } from '../store/vpnStore';
import { ConnectionButton } from '../components/ConnectionButton';
import { SpeedChart } from '../components/SpeedChart';
import { ServerCard } from '../components/ServerCard';
import { useNavigate } from 'react-router-dom';

function useTimer(connectedSince: Date | null) {
  const [elapsed, setElapsed] = useState('00:00:00');
  useEffect(() => {
    if (!connectedSince) { setElapsed('00:00:00'); return; }
    const id = setInterval(() => {
      const diff = Math.floor((Date.now() - connectedSince.getTime()) / 1000);
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(id);
  }, [connectedSince]);
  return elapsed;
}

export function Dashboard() {
  const {
    status, selectedServer, connectedServer, connectedSince,
    realIP, vpnIP, verifiedCountry, verifiedCountryCode, protocol, updateSpeed,
    cleanWeb, killSwitch, rotatingIP,
    backendOnline, openvpnAvailable, serverFetchError, connectionLog,
    connectToServerByIndex, vpngateServers, servers, refreshServers,
  } = useVPNStore();

  const [showLog, setShowLog] = useState(false);

  // Server 4 = index 3 (0-based) of the active server list. When the backend is
  // online we only ever surface real VPNGate servers — never the static
  // placeholder list, which can't actually be connected to.
  const allServers = backendOnline ? vpngateServers : servers;
  const server4 = allServers[3];
  const navigate = useNavigate();
  const elapsed = useTimer(connectedSince);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await refreshServers();
    setRefreshing(false);
  };

  useEffect(() => {
    const id = setInterval(updateSpeed, 1000);
    return () => clearInterval(id);
  }, [updateSpeed]);

  const isConnected = status === 'connected';
  const isVerifying = status === 'verifying';
  const isInFlight = status === 'connecting' || isVerifying || status === 'disconnecting';
  const displayServer = connectedServer ?? selectedServer;

  // Platform-aware OpenVPN install hint (the backend bundles openvpn.exe on Windows,
  // so this only ever shows for Linux/Mac users running the unbundled dev backend).
  const isWindows = /win/i.test(navigator.userAgent);
  const isMac = /mac/i.test(navigator.userAgent);
  const openvpnHint = isWindows
    ? 'install OpenVPN from openvpn.net'
    : isMac
      ? 'install it: brew install openvpn'
      : 'install it: sudo apt-get install openvpn';

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Backend status banner */}
      <div className={clsx(
        'flex items-center justify-between px-4 py-2.5 rounded-xl text-sm border',
        backendOnline
          ? 'bg-teal-500/10 border-teal-500/25 text-teal-400'
          : 'bg-yellow-500/10 border-yellow-500/25 text-yellow-400'
      )}>
        <div className="flex items-center gap-2">
          {backendOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="font-medium">
            {backendOnline
              ? `Backend connected${openvpnAvailable ? ' · OpenVPN ready' : ` · OpenVPN not found (${openvpnHint})`}`
              : (window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron
                ? 'Backend starting… please wait a moment'
                : 'Web preview — simulation only. Use the desktop app for real connections.'}
          </span>
        </div>
      </div>

      {/* Hero connection section */}
      <div className={clsx(
        'card p-8 text-center relative overflow-hidden',
        isConnected && 'border-teal-500/30'
      )}>
        {/* Background gradient */}
        <div className={clsx(
          'absolute inset-0 pointer-events-none transition-all duration-1000',
          isConnected
            ? 'bg-gradient-to-b from-teal-500/5 via-transparent to-transparent'
            : 'bg-gradient-to-b from-accent-blue/5 via-transparent to-transparent'
        )} />

        {/* Status badge */}
        <div className={clsx(
          'inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-6',
          isConnected
            ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30'
            : isInFlight
            ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/30'
            : 'bg-red-500/15 text-red-400 border border-red-500/30'
        )}>
          <div className={clsx(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-teal-400 animate-pulse' : isInFlight ? 'bg-accent-blue animate-pulse' : 'bg-red-400'
          )} />
          {isConnected
            ? `Connected to USA${verifiedCountry ? ` · ${verifiedCountry}` : ''}`
            : status === 'connecting' ? 'Connecting to USA server...'
            : isVerifying ? 'Verifying USA IP...'
            : status === 'disconnecting' ? 'Disconnecting...'
            : 'Not Protected'}
        </div>

        <div className="flex justify-center mb-6">
          <ConnectionButton />
        </div>

        {/* IP addresses */}
        <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto mt-6">
          <div className="bg-navy-800 rounded-xl p-3 text-left">
            <p className="text-gray-500 text-xs mb-1">Your IP</p>
            <p className="text-white text-sm font-mono font-medium">{realIP}</p>
            <p className="text-gray-500 text-xs mt-0.5">Real IP</p>
          </div>
          <div className="bg-navy-800 rounded-xl p-3 text-left">
            <p className="text-gray-500 text-xs mb-1">VPN IP</p>
            <p className={clsx('text-sm font-mono font-medium', isConnected ? 'text-teal-400' : isVerifying ? 'text-accent-blue animate-pulse' : 'text-gray-600')}>
              {isConnected ? vpnIP : isVerifying ? 'Verifying...' : '—.—.—.—'}
            </p>
            <p className="text-gray-500 text-xs mt-0.5">
              {isConnected
                ? (verifiedCountryCode ? `🇺🇸 ${verifiedCountryCode} Verified` : 'Masked')
                : isVerifying ? 'Checking country...'
                : 'Unmasked'}
            </p>
          </div>
        </div>
      </div>

      {/* Servers loading banner */}
      {backendOnline && vpngateServers.length === 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm border bg-yellow-500/10 border-yellow-500/25 text-yellow-400">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full border-2 border-yellow-400 border-t-transparent ${refreshing ? 'animate-spin' : 'animate-spin'}`} />
            <span>
              {refreshing
                ? 'Refreshing server list…'
                : serverFetchError
                  ? `Can't load USA servers: ${serverFetchError} Retrying automatically…`
                  : 'Finding USA servers… this can take up to a minute on first launch. Retrying automatically.'}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100 transition-opacity disabled:opacity-40"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Retry
          </button>
        </div>
      )}

      {/* Selected server */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            {isConnected ? 'Connected Server' : 'Quick Connect'}
          </h3>
          <button
            onClick={() => navigate('/servers')}
            className="flex items-center gap-1 text-xs text-accent-blue hover:text-blue-300 transition-colors"
          >
            Change <ChevronRight size={12} />
          </button>
        </div>

        {displayServer && (
          <div className="flex items-center gap-3 p-3 bg-navy-800 rounded-xl">
            <span className="text-3xl">{displayServer.flag}</span>
            <div className="flex-1">
              <p className="text-white font-semibold">{displayServer.city ?? displayServer.country}</p>
              <p className="text-gray-400 text-sm">{displayServer.country} · {displayServer.serverCount} servers</p>
            </div>
            <div className="text-right">
              <p className={clsx('text-sm font-mono font-bold',
                displayServer.ping < 50 ? 'text-teal-400' : displayServer.ping < 120 ? 'text-yellow-400' : 'text-red-400'
              )}>
                {displayServer.ping}ms
              </p>
              <p className="text-xs text-gray-500">{displayServer.load}% load</p>
            </div>
          </div>
        )}

        {/* Connection info */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-navy-800 rounded-lg p-2 text-center">
            <Shield size={14} className="text-accent-blue mx-auto mb-1" />
            <p className="text-xs text-gray-400">Protocol</p>
            <p className="text-white text-xs font-medium mt-0.5">{protocol.split(' ')[0]}</p>
          </div>
          <div className="bg-navy-800 rounded-lg p-2 text-center">
            <Lock size={14} className="text-teal-400 mx-auto mb-1" />
            <p className="text-xs text-gray-400">Encryption</p>
            <p className="text-white text-xs font-medium mt-0.5">AES</p>
          </div>
          <div className="bg-navy-800 rounded-lg p-2 text-center">
            <Clock size={14} className="text-accent-purple mx-auto mb-1" />
            <p className="text-xs text-gray-400">Duration</p>
            <p className="text-white text-xs font-mono font-medium mt-0.5">{isConnected ? elapsed : '—'}</p>
          </div>
        </div>
      </div>

      {/* Speed chart */}
      <SpeedChart />

      {/* Active protections — these apply to the real tunnel */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Active Protections</h3>
          <button onClick={() => navigate('/features')} className="text-xs text-accent-blue hover:text-blue-300 transition-colors">
            Manage
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'CleanWeb', on: cleanWeb, icon: '🛡️' },
            { label: 'Kill Switch', on: killSwitch, icon: '🔒' },
            { label: 'Rotating IP', on: rotatingIP, icon: '🔄' },
          ].map(({ label, on, icon }) => (
            <div key={label} className={clsx(
              'rounded-xl p-3 text-center transition-all',
              on ? 'bg-teal-500/10 border border-teal-500/20' : 'bg-navy-800 border border-transparent'
            )}>
              <span className="text-xl">{icon}</span>
              <p className="text-xs text-gray-400 mt-1">{label}</p>
              <p className={clsx('text-xs font-semibold mt-0.5', on ? 'text-teal-400' : 'text-gray-600')}>
                {on ? 'ON' : 'OFF'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Connect: Server 4 */}
      {server4 && (
        <div className={clsx(
          'card p-4 border-2 transition-all',
          connectedServer?.id === server4.id
            ? 'border-teal-500/50 bg-teal-500/5'
            : 'border-accent-blue/30 bg-accent-blue/5'
        )}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-accent-blue uppercase tracking-wider flex items-center gap-2">
              ⚡ Quick Connect — Server 4
            </h3>
            {connectedServer?.id === server4.id && (
              <span className="text-xs text-teal-400 bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 p-3 bg-navy-800 rounded-xl">
            <span className="text-3xl">{server4.flag}</span>
            <div className="flex-1">
              <p className="text-white font-semibold">{server4.city ?? server4.country}</p>
              <p className="text-gray-400 text-sm">
                {server4.country}
                {server4.hostname && ` · ${server4.hostname}`}
              </p>
            </div>
            <div className="text-right mr-2">
              <p className={clsx('text-sm font-mono font-bold',
                server4.ping < 50 ? 'text-teal-400' : server4.ping < 120 ? 'text-yellow-400' : 'text-red-400'
              )}>
                {server4.ping}ms
              </p>
              {server4.speedMbps !== undefined && (
                <p className="text-xs text-gray-500">{server4.speedMbps} Mbps</p>
              )}
            </div>
            <button
              onClick={() => {
                if (connectedServer?.id === server4.id) return;
                connectToServerByIndex(3);
              }}
              disabled={isInFlight || connectedServer?.id === server4.id}
              className={clsx(
                'px-4 py-2 rounded-xl text-sm font-bold transition-all',
                connectedServer?.id === server4.id
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40 cursor-default'
                  : 'bg-accent-blue text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {connectedServer?.id === server4.id ? 'Connected' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {/* Connection Log (debug panel) — collapsed by default, kept for troubleshooting */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowLog(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2 font-semibold uppercase tracking-wider text-xs">
            <Terminal size={13} /> Connection Log {connectionLog.length > 0 && `(${connectionLog.length})`}
          </span>
          <ChevronDown size={14} className={clsx('transition-transform', showLog && 'rotate-180')} />
        </button>
        {showLog && (
          <div className="border-t border-white/5 bg-navy-900 p-3 max-h-72 overflow-y-auto font-mono text-xs text-gray-400 space-y-0.5">
            {connectionLog.length === 0
              ? <p className="text-gray-600">No log entries yet — connect to see output.</p>
              : connectionLog.map((line, i) => (
                <p key={i} className={clsx(
                  line.startsWith('ERROR') || line.startsWith('Failed') ? 'text-red-400' :
                  line.includes('Completed') || line.includes('connected') ? 'text-teal-400' :
                  'text-gray-400'
                )}>{line}</p>
              ))
            }
          </div>
        )}
      </div>

      {/* Recent servers */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Recent Servers</h3>
          <button onClick={() => navigate('/servers')} className="text-xs text-accent-blue hover:text-blue-300 transition-colors">
            View all
          </button>
        </div>
        <div className="space-y-1">
          {(() => {
            // In the desktop app, only show recents that are real (connectable)
            // VPNGate servers — never the static placeholder entries.
            const recents = useVPNStore.getState().recentServers
              .filter(s => !backendOnline || s.config)
              .slice(0, 3);
            if (recents.length === 0) {
              return <p className="text-sm text-gray-600 px-1 py-2">No recent servers yet — connect to one to see it here.</p>;
            }
            return recents.map(s => <ServerCard key={s.id} server={s} compact />);
          })()}
        </div>
      </div>
    </div>
  );
}
