import clsx from 'clsx';
import { Power } from 'lucide-react';
import { useVPNStore } from '../store/vpnStore';

export function ConnectionButton() {
  const { status, connect, disconnect } = useVPNStore();
  const isConnected = status === 'connected';
  const isVerifying = status === 'verifying';
  const isBusy = status === 'connecting' || isVerifying || status === 'disconnecting';

  const handleClick = () => {
    if (isBusy) return;
    if (isConnected) disconnect();
    else connect();
  };

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulse rings */}
      {isConnected && (
        <>
          <div className="absolute w-44 h-44 rounded-full bg-teal-500/10 connect-ring" />
          <div className="absolute w-36 h-36 rounded-full bg-teal-500/15 connect-ring" style={{ animationDelay: '0.5s' }} />
        </>
      )}
      {(status === 'connecting' || isVerifying) && (
        <>
          <div className="absolute w-44 h-44 rounded-full border border-accent-blue/30 animate-ping-slow" />
          <div className="absolute w-36 h-36 rounded-full border border-accent-blue/40 animate-spin-slow" />
        </>
      )}

      {/* Main button */}
      <button
        onClick={handleClick}
        disabled={isBusy}
        className={clsx(
          'relative w-28 h-28 rounded-full flex flex-col items-center justify-center gap-1',
          'font-bold text-sm transition-all duration-300',
          'border-4 focus:outline-none',
          isConnected
            ? 'bg-teal-500/20 border-teal-500 text-teal-400 glow-teal hover:bg-teal-500/30'
            : status === 'disconnected'
            ? 'bg-navy-700 border-gray-600 text-gray-300 hover:border-accent-blue hover:text-white hover:bg-navy-600 glow-blue'
            : 'bg-navy-700 border-accent-blue/50 text-accent-blue',
          isBusy && 'cursor-not-allowed opacity-80'
        )}
      >
        <Power
          size={32}
          className={clsx(
            'transition-all',
            isConnected ? 'text-teal-400' : isBusy ? 'text-accent-blue animate-pulse' : 'text-gray-300'
          )}
        />
        <span className="text-xs font-semibold tracking-wide">
          {isConnected ? 'ON' : isBusy ? '...' : 'OFF'}
        </span>
      </button>
    </div>
  );
}
