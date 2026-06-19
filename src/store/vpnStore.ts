import { create } from 'zustand';
import { VPNState, Server, Protocol, MultiHopPair, ServerRegion } from '../types';
import { SERVERS, MULTIHOP_PAIRS, SPLIT_TUNNEL_APPS } from '../data/servers';
import { wsClient } from '../services/wsClient';

// ── Types for backend messages ─────────────────────────────────────────────
interface StatusPayload {
  status: 'disconnected' | 'connecting' | 'verifying' | 'connected' | 'disconnecting';
  server?: Server;
  vpnIP?: string;
  realIP?: string;
  verifiedCountry?: string;
  verifiedCountryCode?: string;
}

interface InitPayload {
  openvpnAvailable: boolean;
  realIP: string;
  connected: boolean;
}

interface SpeedPayload {
  download: number;
  upload: number;
  totalDownload: number;
  totalUpload: number;
}

// ── Store ──────────────────────────────────────────────────────────────────
export const useVPNStore = create<VPNState & {
  backendOnline: boolean;
  openvpnAvailable: boolean;
  vpngateServers: Server[];
  connectionLog: string[];
  serverFetchError: string;
  setBackendOnline: (v: boolean) => void;
}>((set, get) => {
  // Wire up WebSocket listeners once
  wsClient.on('init', (raw) => {
    const d = raw as InitPayload;
    set({
      realIP: d.realIP,
      openvpnAvailable: d.openvpnAvailable,
      backendOnline: true,
    });
  });

  wsClient.on('status', (raw) => {
    const d = raw as StatusPayload;
    if (d.status === 'connected') {
      set({
        status: 'connected',
        connectedServer: d.server ?? get().selectedServer,
        connectedSince: new Date(),
        vpnIP: d.vpnIP ?? '',
        verifiedCountry: d.verifiedCountry ?? '',
        verifiedCountryCode: d.verifiedCountryCode ?? '',
      });
    } else if (d.status === 'disconnected') {
      set({
        status: 'disconnected',
        connectedServer: null,
        connectedSince: null,
        vpnIP: '',
        verifiedCountry: '',
        verifiedCountryCode: '',
        downloadSpeed: 0,
        uploadSpeed: 0,
        realIP: d.realIP ?? get().realIP,
      });
      // Auto-reconnect if the drop was unexpected (not from user clicking Disconnect)
      if (!userDisconnected && get().autoConnect) {
        setTimeout(() => {
          if (get().status === 'disconnected') get().connect();
        }, 5000);
      }
      userDisconnected = false;
    } else if (d.status === 'connecting') {
      if (d.server) set({ selectedServer: d.server });
      set({ status: 'connecting' });
    } else if (d.status === 'verifying') {
      if (d.server) set({ selectedServer: d.server });
      set({ status: 'verifying' });
    } else if (d.status === 'disconnecting') {
      set({ status: 'disconnecting' });
    }
  });

  wsClient.on('speed', (raw) => {
    const d = raw as SpeedPayload;
    const history = [...get().speedHistory.slice(-29), {
      timestamp: Date.now(),
      download: d.download,
      upload: d.upload,
    }];
    set({
      downloadSpeed: d.download,
      uploadSpeed: d.upload,
      totalDownload: d.totalDownload,
      totalUpload: d.totalUpload,
      speedHistory: history,
    });
  });

  wsClient.on('log', (raw) => {
    const line = raw as string;
    set(s => ({ connectionLog: [...s.connectionLog.slice(-99), line] }));
  });

  wsClient.on('error', (raw) => {
    const msg = raw as string;
    set(s => ({ connectionLog: [...s.connectionLog.slice(-99), `ERROR: ${msg}`] }));
  });

  wsClient.on('_connected', () => {
    set({ backendOnline: true });
  });

  wsClient.on('_disconnected', () => {
    set({ backendOnline: false });
  });

  // Start connecting to backend
  wsClient.connect();

  const API_BASE = () => `http://${window.location.hostname || 'localhost'}:3001`;

  // Tracks whether the user explicitly clicked Disconnect — prevents the
  // auto-reconnect from firing after a manual disconnect.
  let userDisconnected = false;

  // Feature flags sent to the backend at connect time. These map directly onto
  // real behaviour: CleanWeb → ad/tracker-blocking DNS, killSwitch → OS firewall,
  // rotatingIP → periodic reconnect to a different US server.
  const featureOptions = () => {
    const { cleanWeb, cleanWebLevel, killSwitch, rotatingIP } = get();
    return { cleanWeb, cleanWebLevel, killSwitch, rotatingIP };
  };

  // CleanWeb (DNS) and Rotating IP can only change on a live tunnel by
  // re-establishing it, so reconnect when one is toggled while connected.
  const reapplyIfConnected = () => {
    const { status, backendOnline, connectedServer } = get();
    if (backendOnline && status === 'connected' && connectedServer?.config) {
      set(s => ({ connectionLog: [...s.connectionLog.slice(-99), 'Reconnecting to apply new settings…'] }));
      wsClient.send('connect', { server: connectedServer, options: featureOptions() });
    }
  };

  // Fetch VPNGate servers from backend, with self-recovering retry
  const fetchVPNGateServers = async (attempt: number = 1, force: boolean = false): Promise<void> => {
    try {
      const url = `${API_BASE()}/api/servers${force ? '?force=true' : ''}`;
      const res = await fetch(url);
      const body = await res.json().catch(() => ({})) as { servers?: Server[]; error?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const servers = body.servers;
      if (servers?.length) {
        // Auto-select first real server if current selection has no config
        const cur = get().selectedServer;
        const extra = !cur?.config ? { selectedServer: servers[0] } : {};
        set({ vpngateServers: servers, serverFetchError: '', ...extra });
        // Trigger auto-connect once on first load if the feature is enabled
        const { autoConnect, status } = get();
        if (autoConnect && status === 'disconnected') {
          setTimeout(() => get().connect(), 500);
        }
        return;
      }
      // Reachable but empty — record why so the UI can explain the wait.
      set({ serverFetchError: body.error || 'No USA servers available yet — retrying…' });
    } catch (err) {
      // Backend warming up, VPNGate slow/blocked, or US pool momentarily empty.
      set({ serverFetchError: err instanceof Error ? err.message : 'Server list unavailable — retrying…' });
    }

    // Self-recovery: keep retrying with capped backoff instead of giving up, so
    // the app never gets permanently stuck on "Finding USA servers…". The
    // background (non-force) loop stops the moment servers exist from any source;
    // a manual force refresh retries a bounded number of times.
    if (!force && get().vpngateServers.length > 0) return;
    if (force && attempt >= 6) return;
    const delay = Math.min(attempt * 2000 + 1000, 15000);
    setTimeout(() => fetchVPNGateServers(attempt + 1, force), delay);
  };
  setTimeout(() => fetchVPNGateServers(), 1500); // slight delay to let WS init first

  return {
    // ── Connection state ──
    status: 'disconnected',
    selectedServer: SERVERS[0],
    connectedServer: null,
    connectedSince: null,
    realIP: '...',
    vpnIP: '',
    verifiedCountry: '',
    verifiedCountryCode: '',
    protocol: 'OpenVPN UDP', // the engine actually in use — keep the UI honest
    downloadSpeed: 0,
    uploadSpeed: 0,
    totalDownload: 0,
    totalUpload: 0,
    speedHistory: [],

    // ── Backend / real data ──
    backendOnline: false,
    openvpnAvailable: false,
    vpngateServers: [],
    connectionLog: [],
    serverFetchError: '',

    // ── Features ──
    killSwitch: true,
    cleanWeb: true,
    cleanWebLevel: 'advanced',
    multiHop: false,
    selectedMultiHop: null,
    camouflageMode: false,
    noBordersMode: false,
    rotatingIP: false,
    autoConnect: false,
    splitTunneling: false,
    splitTunnelApps: SPLIT_TUNNEL_APPS,

    // ── Server browser ── (USA-only: non-US static entries are filtered out)
    servers: SERVERS.filter(s => s.countryCode === 'US'),
    multiHopPairs: MULTIHOP_PAIRS,
    searchQuery: '',
    activeRegion: 'All',
    serverTab: 'all',
    recentServers: SERVERS.filter(s => s.countryCode === 'US').slice(0, 3),

    // ── Actions ──
    connect: () => {
      const { selectedServer, backendOnline, status } = get();
      if (!selectedServer) return;
      // Ignore clicks while a connection attempt is already in flight —
      // otherwise the backend ends up with parallel retry loops.
      if (status === 'connecting' || status === 'verifying' || status === 'disconnecting') return;

      if (backendOnline) {
        // Static fallback servers have no OpenVPN config — the backend can't connect to them.
        if (!selectedServer.config) {
          set(s => ({ connectionLog: [...s.connectionLog.slice(-99), 'ERROR: Live server list still loading — please try again in a moment.'] }));
          return;
        }
        set({ status: 'connecting' });
        wsClient.send('connect', { server: selectedServer, options: featureOptions() });
      } else {
        // Simulation fallback when backend isn't running
        set({ status: 'connecting' });
        setTimeout(() => {
          set({
            status: 'connected',
            connectedServer: selectedServer,
            connectedSince: new Date(),
            vpnIP: `${Math.floor(Math.random() * 200 + 10)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
          });
        }, 2200);
      }
    },

    disconnect: () => {
      userDisconnected = true;
      const { backendOnline } = get();
      if (backendOnline) {
        wsClient.send('disconnect');
      } else {
        set({ status: 'disconnecting' });
        setTimeout(() => {
          set({
            status: 'disconnected',
            connectedServer: null,
            connectedSince: null,
            vpnIP: '',
            downloadSpeed: 0,
            uploadSpeed: 0,
            speedHistory: [],
          });
        }, 800);
      }
    },

    selectServer: (server: Server) => {
      const { recentServers } = get();
      const updated = [server, ...recentServers.filter(s => s.id !== server.id)].slice(0, 5);
      set({ selectedServer: server, recentServers: updated });
    },

    connectToServerByIndex: (index: number) => {
      const { vpngateServers, servers, backendOnline, status } = get();
      if (status === 'connecting' || status === 'verifying' || status === 'disconnecting') return;
      const list = backendOnline && vpngateServers.length > 0 ? vpngateServers : servers;
      const server = list[index];
      if (!server) return;
      const { recentServers } = get();
      const updated = [server, ...recentServers.filter(s => s.id !== server.id)].slice(0, 5);
      set({ selectedServer: server, recentServers: updated });
      if (backendOnline) {
        // Static fallback servers carry no OpenVPN config; attempting a real connection
        // would just bounce off the backend with "No VPN config". Wait for the live list.
        if (!server.config) {
          set(s => ({ connectionLog: [...s.connectionLog.slice(-99), 'ERROR: Live server list still loading — please try again in a moment.'] }));
          return;
        }
        set({ status: 'connecting' });
        wsClient.send('connect', { server, options: featureOptions() });
      } else {
        set({ status: 'connecting' });
        setTimeout(() => {
          set({
            status: 'connected',
            connectedServer: server,
            connectedSince: new Date(),
            vpnIP: `${Math.floor(Math.random() * 200 + 10)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
          });
        }, 2200);
      }
    },

    setProtocol: (protocol: Protocol) => set({ protocol }),

    toggleKillSwitch: () => {
      const next = !get().killSwitch;
      set({ killSwitch: next });
      // Kill switch (firewall) can be applied/removed live without a reconnect.
      const { status, backendOnline, connectedServer } = get();
      if (backendOnline && status === 'connected') {
        wsClient.send('setFeature', { killSwitch: next, serverIP: connectedServer?.ip });
      }
    },
    toggleCleanWeb: () => { set(s => ({ cleanWeb: !s.cleanWeb })); reapplyIfConnected(); },
    setCleanWebLevel: (level) => { set({ cleanWebLevel: level }); reapplyIfConnected(); },
    toggleMultiHop: () => set(s => ({ multiHop: !s.multiHop })),
    selectMultiHop: (pair: MultiHopPair) => set({ selectedMultiHop: pair }),
    toggleCamouflageMode: () => set(s => ({ camouflageMode: !s.camouflageMode })),
    toggleNoBordersMode: () => set(s => ({ noBordersMode: !s.noBordersMode })),
    toggleRotatingIP: () => { set(s => ({ rotatingIP: !s.rotatingIP })); reapplyIfConnected(); },
    toggleAutoConnect: () => set(s => ({ autoConnect: !s.autoConnect })),
    toggleSplitTunneling: () => set(s => ({ splitTunneling: !s.splitTunneling })),

    toggleSplitTunnelApp: (appId: string) => set(s => ({
      splitTunnelApps: s.splitTunnelApps.map(a =>
        a.id === appId ? { ...a, excluded: !a.excluded } : a
      ),
    })),

    toggleFavorite: (serverId: string) => set(s => ({
      servers: s.servers.map(sv =>
        sv.id === serverId ? { ...sv, favorite: !sv.favorite } : sv
      ),
      vpngateServers: s.vpngateServers.map(sv =>
        sv.id === serverId ? { ...sv, favorite: !sv.favorite } : sv
      ),
    })),

    setSearchQuery: (query: string) => set({ searchQuery: query }),
    setActiveRegion: (region: ServerRegion | 'All') => set({ activeRegion: region }),
    setServerTab: (tab) => set({ serverTab: tab }),

    setBackendOnline: (v: boolean) => set({ backendOnline: v }),

    refreshServers: async () => {
      // Don't blank vpngateServers here — clearing it makes the UI fall back to
      // the static placeholder list, which looks like the real servers "vanished".
      // The Refresh button's own spinner already signals that work is in progress.
      await fetchVPNGateServers(1, true);
    },

    // Kept for backward compatibility (Statistics page uses it for sim mode)
    updateSpeed: () => {
      const { status, backendOnline } = get();
      if (backendOnline || status !== 'connected') return;
      const dl = Math.max(0.1, 85 + (Math.random() - 0.5) * 40);
      const ul = Math.max(0.1, 22 + (Math.random() - 0.5) * 15);
      const history = [...get().speedHistory.slice(-29), { timestamp: Date.now(), download: dl, upload: ul }];
      set(s => ({
        downloadSpeed: dl,
        uploadSpeed: ul,
        totalDownload: s.totalDownload + dl / 10,
        totalUpload: s.totalUpload + ul / 10,
        speedHistory: history,
      }));
    },
  };
});
