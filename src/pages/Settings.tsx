import clsx from 'clsx';
import { useVPNStore } from '../store/vpnStore';
import { Protocol } from '../types';
import { CheckCircle } from 'lucide-react';

const PROTOCOLS: { id: Protocol; label: string; desc: string; badge?: string; disabled?: boolean }[] = [
  { id: 'OpenVPN UDP', label: 'OpenVPN (Auto)', desc: 'UDP or TCP is chosen automatically per server. Powered by OpenVPN 2.6.', badge: 'Active' },
  { id: 'WireGuard', label: 'WireGuard', desc: 'Not yet supported — VPNGate servers use OpenVPN.', disabled: true, badge: 'Coming soon' },
  { id: 'IKEv2/IPSec', label: 'IKEv2/IPSec', desc: 'Not yet supported.', disabled: true, badge: 'Coming soon' },
];

const DNS_OPTIONS = [
  { id: 'surfvpn', label: 'SurfVPN DNS', desc: 'Private, no-log DNS servers. Default.' },
  { id: 'cloudflare', label: 'Cloudflare (1.1.1.1)', desc: 'Privacy-focused, extremely fast.' },
  { id: 'google', label: 'Google (8.8.8.8)', desc: 'Reliable and globally available.' },
  { id: 'custom', label: 'Custom DNS', desc: 'Enter your own DNS server addresses.' },
];

import { useState } from 'react';

export function Settings() {
  const { protocol, setProtocol, autoConnect, toggleAutoConnect } = useVPNStore();
  const [dns, setDns] = useState('surfvpn');
  const [theme, setTheme] = useState<'dark' | 'darker'>('dark');
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [customDns, setCustomDns] = useState('');

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Customize your VPN experience</p>
      </div>

      {/* Protocol */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-white mb-1">VPN Protocol</h2>
        <p className="text-xs text-gray-500 mb-4">Choose how your device connects to the VPN server</p>
        <div className="space-y-2">
          {PROTOCOLS.map(p => (
            <button
              key={p.id}
              onClick={() => !p.disabled && setProtocol(p.id)}
              disabled={p.disabled}
              className={clsx(
                'w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all',
                p.disabled && 'opacity-50 cursor-not-allowed',
                protocol === p.id
                  ? 'bg-accent-blue/15 border border-accent-blue/35'
                  : 'bg-navy-800 border border-transparent',
                !p.disabled && protocol !== p.id && 'hover:bg-navy-700'
              )}
            >
              <div className={clsx(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0 transition-all',
                protocol === p.id ? 'border-accent-blue bg-accent-blue' : 'border-gray-600'
              )}>
                {protocol === p.id && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{p.label}</span>
                  {p.badge && (
                    <span className="text-xs bg-teal-500/20 text-teal-400 border border-teal-500/30 px-2 py-0.5 rounded-full">
                      {p.badge}
                    </span>
                  )}
                </div>
                <p className="text-gray-400 text-xs mt-0.5">{p.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* DNS */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-white mb-1">DNS Settings</h2>
        <p className="text-xs text-gray-500 mb-4">
          Preview — while connected, DNS is currently provided by the VPN server
        </p>
        <div className="space-y-2">
          {DNS_OPTIONS.map(d => (
            <button
              key={d.id}
              onClick={() => setDns(d.id)}
              className={clsx(
                'w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all',
                dns === d.id
                  ? 'bg-teal-500/10 border border-teal-500/25'
                  : 'bg-navy-800 border border-transparent hover:bg-navy-700'
              )}
            >
              <div className={clsx(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0 transition-all',
                dns === d.id ? 'border-teal-500 bg-teal-500' : 'border-gray-600'
              )}>
                {dns === d.id && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <p className="text-white text-sm font-medium">{d.label}</p>
                <p className="text-gray-400 text-xs mt-0.5">{d.desc}</p>
              </div>
            </button>
          ))}
        </div>
        {dns === 'custom' && (
          <input
            type="text"
            placeholder="e.g. 192.168.1.1"
            value={customDns}
            onChange={e => setCustomDns(e.target.value)}
            className="mt-3 w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-teal-500/60"
          />
        )}
      </section>

      {/* General */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-white mb-4">General</h2>
        <div className="space-y-3">
          {[
            { label: 'Auto-Connect', desc: 'Connect VPN on untrusted networks', value: autoConnect, toggle: toggleAutoConnect },
            { label: 'Launch on Startup', desc: 'Start SurfVPN when device boots', value: startOnBoot, toggle: () => setStartOnBoot(v => !v) },
            { label: 'Connection Notifications', desc: 'Show alerts when VPN state changes', value: notifications, toggle: () => setNotifications(v => !v) },
          ].map(({ label, desc, value, toggle }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-navy-700 last:border-0">
              <div>
                <p className="text-white text-sm font-medium">{label}</p>
                <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
              </div>
              <button
                onClick={toggle}
                className={clsx(
                  'relative w-12 h-6 rounded-full transition-all duration-300',
                  value ? 'bg-teal-500' : 'bg-navy-600 border border-gray-600'
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300',
                  value ? 'left-6' : 'left-0.5'
                )} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Theme */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Appearance</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['dark', 'darker'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={clsx(
                'p-4 rounded-xl border transition-all',
                theme === t ? 'border-accent-blue/40 bg-accent-blue/10' : 'border-navy-600 bg-navy-800 hover:bg-navy-700'
              )}
            >
              <div className={clsx(
                'w-8 h-8 rounded-lg mx-auto mb-2',
                t === 'dark' ? 'bg-navy-700' : 'bg-navy-950'
              )} />
              <p className="text-sm text-white capitalize">{t === 'dark' ? 'Dark' : 'Darker'}</p>
              {theme === t && <CheckCircle size={14} className="text-accent-blue mx-auto mt-1" />}
            </button>
          ))}
        </div>
      </section>

      {/* About */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-white mb-3">About</h2>
        <div className="space-y-2">
          {[
            ['Version', '1.0.2'],
            ['VPN Engine', 'OpenVPN 2.6'],
            ['Server Network', 'VPNGate (free, volunteer-run)'],
            ['License', 'Free & Open Source'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-gray-400">{k}</span>
              <span className="text-white font-medium">{v}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
