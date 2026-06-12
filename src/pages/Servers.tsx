import { useMemo } from 'react';
import clsx from 'clsx';
import { Search, X, Globe, Star, Clock, Shuffle, RefreshCw } from 'lucide-react';
import { useVPNStore } from '../store/vpnStore';
import { ServerCard } from '../components/ServerCard';
import { ServerRegion } from '../types';

const REGIONS: (ServerRegion | 'All')[] = ['All', 'Europe', 'Americas', 'Asia Pacific', 'Middle East & Africa'];
const TABS = [
  { id: 'all', label: 'All', icon: Globe },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'multihop', label: 'MultiHop', icon: Shuffle },
] as const;

export function Servers() {
  const {
    servers, vpngateServers, multiHopPairs, searchQuery, activeRegion, serverTab, recentServers,
    selectedMultiHop, backendOnline,
    setSearchQuery, setActiveRegion, setServerTab,
    selectMultiHop, connect, selectServer,
  } = useVPNStore();

  // Use real VPNGate servers when backend is online, fall back to static list
  const sourceServers = backendOnline && vpngateServers.length > 0 ? vpngateServers : servers;

  const filtered = useMemo(() => {
    let list = sourceServers;
    if (activeRegion !== 'All') list = list.filter(s => s.region === activeRegion);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.country.toLowerCase().includes(q) ||
        (s.city ?? '').toLowerCase().includes(q) ||
        (s.hostname ?? '').toLowerCase().includes(q)
      );
    }
    if (serverTab === 'favorites') list = list.filter(s => s.favorite);
    return list;
  }, [sourceServers, activeRegion, searchQuery, serverTab]);

  const displayList = serverTab === 'recent' ? recentServers : filtered;

  const handleMultiHopConnect = (pairId: string) => {
    const pair = multiHopPairs.find(p => p.id === pairId);
    if (!pair) return;
    selectMultiHop(pair);
    // MultiHop chains need coordinated servers, which free VPNGate servers
    // can't provide — only allow the simulated flow when backend is offline.
    if (backendOnline) return;
    const entryServer = servers.find(s => s.country === pair.entryCountry) ?? servers[0];
    selectServer(entryServer);
    connect();
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">🇺🇸 USA Server Locations</h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-gray-400 text-sm">
            {backendOnline && vpngateServers.length > 0
              ? `${vpngateServers.length} live USA servers from VPNGate`
              : 'USA servers — IP verification required to connect'}
          </p>
          {backendOnline && vpngateServers.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full">
              <RefreshCw size={10} />
              Live
            </span>
          )}
          {!backendOnline && (
            <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full">
              Simulation mode
            </span>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search country or city..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-navy-800 border border-navy-600 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue/60 transition-colors"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-navy-800 rounded-xl p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setServerTab(id)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all',
              serverTab === id
                ? 'bg-accent-blue text-white shadow'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Region filter (only on All/Favorites) */}
      {(serverTab === 'all' || serverTab === 'favorites') && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {REGIONS.map(r => (
            <button
              key={r}
              onClick={() => setActiveRegion(r)}
              className={clsx(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                activeRegion === r
                  ? 'bg-accent-blue text-white'
                  : 'bg-navy-800 text-gray-400 hover:text-white border border-navy-600'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* Server list */}
      {serverTab === 'multihop' ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 px-1">Route traffic through two VPN servers for extra privacy</p>
          {backendOnline && (
            <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2">
              MultiHop is not available on free VPNGate servers — it requires coordinated server pairs.
            </div>
          )}
          {multiHopPairs.map(pair => (
            <div
              key={pair.id}
              onClick={() => selectMultiHop(pair)}
              className={clsx(
                'card p-4 cursor-pointer hover:bg-navy-700 transition-all',
                selectedMultiHop?.id === pair.id && 'border-teal-500/30 bg-teal-500/5'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{pair.entryFlag}</span>
                  <span className="text-gray-500 text-sm">→</span>
                  <span className="text-2xl">{pair.exitFlag}</span>
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">
                    {pair.entryCountry} → {pair.exitCountry}
                  </p>
                  <p className="text-gray-400 text-xs">Double VPN chain</p>
                </div>
                <div className="text-right">
                  <p className="text-yellow-400 text-sm font-mono font-bold">{pair.ping}ms</p>
                  <button
                    onClick={e => { e.stopPropagation(); handleMultiHopConnect(pair.id); }}
                    className="mt-1 text-xs bg-accent-blue/20 text-accent-blue border border-accent-blue/30 px-2 py-0.5 rounded hover:bg-accent-blue/30 transition-colors"
                  >
                    Connect
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {displayList.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Globe size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No servers found</p>
              <p className="text-sm mt-1">Try a different search or region</p>
            </div>
          ) : (
            displayList.map(s => <ServerCard key={s.id} server={s} />)
          )}
        </div>
      )}
    </div>
  );
}
