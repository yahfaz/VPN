import { NavLink } from 'react-router-dom';
import { Shield, Globe, Zap, Settings, BarChart2 } from 'lucide-react';
import { useVPNStore } from '../store/vpnStore';
import clsx from 'clsx';

const NAV = [
  { to: '/', icon: Shield, label: 'Dashboard' },
  { to: '/servers', icon: Globe, label: 'Servers' },
  { to: '/features', icon: Zap, label: 'Features' },
  { to: '/stats', icon: BarChart2, label: 'Statistics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const status = useVPNStore(s => s.status);

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-navy-900 border-r border-navy-700 py-6 px-3">
      <div className="flex items-center gap-3 px-3 mb-8">
        <div className={clsx(
          'w-9 h-9 rounded-xl flex items-center justify-center',
          status === 'connected' ? 'bg-teal-500 glow-teal' : 'bg-accent-blue'
        )}>
          <Shield size={20} className="text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-lg leading-none">Nx3VPN</p>
          <p className={clsx(
            'text-xs mt-0.5 font-medium',
            status === 'connected' ? 'text-teal-400' : 'text-gray-400'
          )}>
            {status === 'connected' ? '● Protected' : status === 'connecting' ? '◌ Connecting...' : status === 'disconnecting' ? '◌ Disconnecting...' : '○ Not Protected'}
          </p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
              isActive
                ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                : 'text-gray-400 hover:text-white hover:bg-navy-700'
            )}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-3 pt-4 border-t border-navy-700">
        <p className="text-gray-600 text-xs text-center">Nx3VPN · Secure US VPN</p>
      </div>
    </aside>
  );
}
