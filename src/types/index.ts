export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
export type Protocol = 'WireGuard' | 'OpenVPN UDP' | 'OpenVPN TCP' | 'IKEv2/IPSec';
export type ServerRegion = 'Europe' | 'Americas' | 'Asia Pacific' | 'Middle East & Africa';
export type ServerType = 'standard' | 'static' | 'p2p' | 'multihop';

export interface Server {
  id: string;
  country: string;
  countryCode: string;
  flag: string;
  city?: string;
  hostname?: string;
  ip?: string;
  config?: string;
  region: ServerRegion;
  serverCount: number;
  ping: number;
  load: number;
  speedMbps?: number;
  sessions?: number;
  proto?: string;
  port?: number;
  firewallFriendly?: boolean;
  type: ServerType;
  favorite: boolean;
}

export interface MultiHopPair {
  id: string;
  entryCountry: string;
  entryFlag: string;
  exitCountry: string;
  exitFlag: string;
  ping: number;
}

export interface SplitTunnelApp {
  id: string;
  name: string;
  icon: string;
  excluded: boolean;
}

export interface SpeedSample {
  timestamp: number;
  download: number;
  upload: number;
}

export interface VPNState {
  status: ConnectionStatus;
  selectedServer: Server | null;
  connectedServer: Server | null;
  connectedSince: Date | null;
  realIP: string;
  vpnIP: string;
  protocol: Protocol;
  downloadSpeed: number;
  uploadSpeed: number;
  totalDownload: number;
  totalUpload: number;
  speedHistory: SpeedSample[];

  // Features
  killSwitch: boolean;
  cleanWeb: boolean;
  cleanWebLevel: 'basic' | 'advanced';
  multiHop: boolean;
  selectedMultiHop: MultiHopPair | null;
  camouflageMode: boolean;
  noBordersMode: boolean;
  rotatingIP: boolean;
  autoConnect: boolean;
  splitTunneling: boolean;
  splitTunnelApps: SplitTunnelApp[];

  // Servers
  servers: Server[];
  vpngateServers: Server[];
  multiHopPairs: MultiHopPair[];
  searchQuery: string;
  activeRegion: ServerRegion | 'All';
  serverTab: 'all' | 'favorites' | 'recent' | 'multihop';
  recentServers: Server[];

  // Backend
  backendOnline: boolean;
  openvpnAvailable: boolean;
  connectionLog: string[];

  // Actions
  connect: () => void;
  disconnect: () => void;
  selectServer: (server: Server) => void;
  connectToServerByIndex: (index: number) => void;
  setProtocol: (protocol: Protocol) => void;
  toggleKillSwitch: () => void;
  toggleCleanWeb: () => void;
  setCleanWebLevel: (level: 'basic' | 'advanced') => void;
  toggleMultiHop: () => void;
  selectMultiHop: (pair: MultiHopPair) => void;
  toggleCamouflageMode: () => void;
  toggleNoBordersMode: () => void;
  toggleRotatingIP: () => void;
  toggleAutoConnect: () => void;
  toggleSplitTunneling: () => void;
  toggleSplitTunnelApp: (appId: string) => void;
  toggleFavorite: (serverId: string) => void;
  setSearchQuery: (query: string) => void;
  setActiveRegion: (region: ServerRegion | 'All') => void;
  setServerTab: (tab: 'all' | 'favorites' | 'recent' | 'multihop') => void;
  updateSpeed: () => void;
}
