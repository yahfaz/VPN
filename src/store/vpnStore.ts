import { create } from 'zustand';
import { VPNState, Server, Protocol, MultiHopPair, ServerRegion } from '../types';
import { SERVERS, MULTIHOP_PAIRS, SPLIT_TUNNEL_APPS } from '../data/servers';
import { wsClient } from '../services/wsClient';

// ── Types for backend messages ─────────────────────────────────────────────
interface StatusPayload {
  status: 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
  server?: Server;
  vpnIP?: string;
  realIP?: string;
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
      });
    } else if (d.status === 'disconnected') {
      set({
        status: 'disconnected',
        connectedServer: null,
        connectedSince: null,
        vpnIP: '',
        downloadSpeed: 0,
        uploadSpeed: 0,
        realIP: d.realIP ?? get().realIP,
      });
    } else if (d.status === 'connecting') {
      set({ status: 'connecting' });
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

  // Fetch VPNGate servers from backend
  const fetchVPNGateServers = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/servers`);
      if (!res.ok) return;
      const { servers } = await res.json() as { servers: Server[] };
      if (servers?.length) {
        set({ vpngateServers: servers });
      }
    } catch { /* backend not running */ }
  };
  setTimeout(fetchVPNGateServers, 1000); // slight delay to let WS init first

  return {
    // ── Connection state ──
    status: 'disconnected',
    selectedServer: SERVERS[0],
    connectedServer: null,
    connectedSince: null,
    realIP: '...',
    vpnIP: '',
    protocol: 'WireGuard',
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

    // ── Server browser ──
    servers: SERVERS,
    multiHopPairs: MULTIHOP_PAIRS,
    searchQuery: '',
    activeRegion: 'All',
    serverTab: 'all',
    recentServers: [SERVERS[6], SERVERS[18], SERVERS[50]],

    // ── Actions ──
    connect: () => {
      const { selectedServer, backendOnline } = get();
      if (!selectedServer) return;

      if (backendOnline) {
        wsClient.send('connect', selectedServer);
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

    setProtocol: (protocol: Protocol) => set({ protocol }),

    toggleKillSwitch: () => set(s => ({ killSwitch: !s.killSwitch })),
    toggleCleanWeb: () => set(s => ({ cleanWeb: !s.cleanWeb })),
    setCleanWebLevel: (level) => set({ cleanWebLevel: level }),
    toggleMultiHop: () => set(s => ({ multiHop: !s.multiHop })),
    selectMultiHop: (pair: MultiHopPair) => set({ selectedMultiHop: pair }),
    toggleCamouflageMode: () => set(s => ({ camouflageMode: !s.camouflageMode })),
    toggleNoBordersMode: () => set(s => ({ noBordersMode: !s.noBordersMode })),
    toggleRotatingIP: () => set(s => ({ rotatingIP: !s.rotatingIP })),
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
