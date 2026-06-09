import { create } from 'zustand';
import { VPNState, Server, Protocol, MultiHopPair, ServerRegion } from '../types';
import { SERVERS, MULTIHOP_PAIRS, SPLIT_TUNNEL_APPS } from '../data/servers';

const FAKE_REAL_IP = '203.45.167.82';
const FAKE_VPN_IPS: Record<string, string> = {
  'us-ny': '104.23.156.44',
  'us-la': '198.41.218.92',
  'gb-lon': '185.156.46.31',
  'de-fra': '194.165.16.78',
  'nl-ams': '149.154.175.50',
  'jp-tok': '103.235.46.55',
  'sg-sin': '128.199.144.202',
  'au-syd': '203.0.113.42',
};

function getVpnIP(server: Server): string {
  return FAKE_VPN_IPS[server.id] ?? `${10 + Math.floor(Math.random() * 240)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

function randomSpeed(base: number, variance: number): number {
  return Math.max(0.1, base + (Math.random() - 0.5) * variance);
}

export const useVPNStore = create<VPNState>((set, get) => ({
  status: 'disconnected',
  selectedServer: SERVERS[0],
  connectedServer: null,
  connectedSince: null,
  realIP: FAKE_REAL_IP,
  vpnIP: '',
  protocol: 'WireGuard',
  downloadSpeed: 0,
  uploadSpeed: 0,
  totalDownload: 0,
  totalUpload: 0,
  speedHistory: [],

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

  servers: SERVERS,
  multiHopPairs: MULTIHOP_PAIRS,
  searchQuery: '',
  activeRegion: 'All',
  serverTab: 'all',
  recentServers: [SERVERS[6], SERVERS[18], SERVERS[50]],

  connect: () => {
    const { selectedServer, multiHop, selectedMultiHop } = get();
    if (!selectedServer) return;
    set({ status: 'connecting' });
    setTimeout(() => {
      const server = selectedServer;
      const vpnIP = multiHop && selectedMultiHop
        ? `${Math.floor(Math.random() * 200 + 10)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`
        : getVpnIP(server);
      set({
        status: 'connected',
        connectedServer: server,
        connectedSince: new Date(),
        vpnIP,
      });
    }, 2200);
  },

  disconnect: () => {
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
  })),

  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setActiveRegion: (region: ServerRegion | 'All') => set({ activeRegion: region }),
  setServerTab: (tab) => set({ serverTab: tab }),

  updateSpeed: () => {
    const { status, totalDownload, totalUpload, speedHistory } = get();
    if (status !== 'connected') return;
    const dl = randomSpeed(85, 40);
    const ul = randomSpeed(22, 15);
    const now = Date.now();
    const sample = { timestamp: now, download: dl, upload: ul };
    const history = [...speedHistory.slice(-29), sample];
    set({
      downloadSpeed: dl,
      uploadSpeed: ul,
      totalDownload: totalDownload + dl / 10,
      totalUpload: totalUpload + ul / 10,
      speedHistory: history,
    });
  },
}));
