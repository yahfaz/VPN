import clsx from 'clsx';
import { useVPNStore } from '../store/vpnStore';
import { FeatureToggle } from '../components/FeatureToggle';

export function Features() {
  const {
    killSwitch, cleanWeb, cleanWebLevel, multiHop, selectedMultiHop, multiHopPairs,
    camouflageMode, noBordersMode, rotatingIP, autoConnect, splitTunneling, splitTunnelApps,
    toggleKillSwitch, toggleCleanWeb, setCleanWebLevel, toggleMultiHop, selectMultiHop,
    toggleCamouflageMode, toggleNoBordersMode, toggleRotatingIP, toggleAutoConnect,
    toggleSplitTunneling, toggleSplitTunnelApp,
  } = useVPNStore();

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">VPN Features</h1>
        <p className="text-gray-400 text-sm mt-1">Advanced privacy and security controls</p>
      </div>

      <div className="text-xs text-gray-300 bg-navy-800 border border-navy-600 rounded-xl px-3 py-2 space-y-1">
        <p>
          <span className="text-teal-400 font-semibold">Live</span> features affect your real
          connection: <span className="text-white">Kill Switch</span> (OS firewall),
          <span className="text-white"> CleanWeb</span> (ad/tracker-blocking DNS),
          <span className="text-white"> Rotating IP</span>, and
          <span className="text-white"> Auto-Connect</span>.
        </p>
        <p className="text-gray-500">
          <span className="text-gray-400 font-semibold">Preview</span> features
          (MultiHop, Camouflage, NoBorders, Split Tunneling) aren't functional on free single-hop
          VPNGate servers yet.
        </p>
      </div>

      {/* Security */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 px-1">Security</h2>
        <div className="space-y-3">
          <FeatureToggle
            title="Kill Switch"
            description="Cuts all internet traffic if the VPN connection drops, preventing data leaks. Enforced with OS firewall rules."
            icon="🔒"
            enabled={killSwitch}
            onToggle={toggleKillSwitch}
            badge="Live"
            badgeTone="live"
          />

          <FeatureToggle
            title="CleanWeb"
            description="Blocks ads, trackers, and malicious domains by routing the tunnel's DNS through an ad-blocking resolver."
            icon="🧹"
            enabled={cleanWeb}
            onToggle={toggleCleanWeb}
            badge="Live"
            badgeTone="live"
          >
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-2">Protection level:</p>
              <div className="grid grid-cols-2 gap-2">
                {(['basic', 'advanced'] as const).map(level => (
                  <button
                    key={level}
                    onClick={() => setCleanWebLevel(level)}
                    className={clsx(
                      'p-3 rounded-xl text-sm font-medium transition-all capitalize',
                      cleanWebLevel === level
                        ? 'bg-teal-500/20 border border-teal-500/40 text-teal-400'
                        : 'bg-navy-900 border border-navy-600 text-gray-400 hover:text-white'
                    )}
                  >
                    {level === 'basic' ? '🛡️ Basic' : '🔰 Advanced'}
                    <p className="text-xs font-normal mt-1 text-gray-500">
                      {level === 'basic' ? 'Ads & trackers' : 'Ads, trackers, cookie popups & malware'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </FeatureToggle>
        </div>
      </section>

      {/* Privacy */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 px-1">Privacy</h2>
        <div className="space-y-3">
          <FeatureToggle
            title="MultiHop (Double VPN)"
            description="Routes your traffic through two VPN servers instead of one. Not available on free single-hop VPNGate servers."
            icon="🔀"
            enabled={multiHop}
            onToggle={toggleMultiHop}
            badge="Preview"
            badgeTone="muted"
          >
            <p className="text-xs text-gray-400 mb-3">Select a MultiHop route:</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {multiHopPairs.slice(0, 8).map(pair => (
                <button
                  key={pair.id}
                  onClick={() => selectMultiHop(pair)}
                  className={clsx(
                    'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left',
                    selectedMultiHop?.id === pair.id
                      ? 'bg-teal-500/15 border border-teal-500/30'
                      : 'bg-navy-900 border border-navy-700 hover:bg-navy-800'
                  )}
                >
                  <span>{pair.entryFlag}</span>
                  <span className="text-gray-500 text-xs">→</span>
                  <span>{pair.exitFlag}</span>
                  <span className="text-sm text-white">{pair.entryCountry} → {pair.exitCountry}</span>
                  <span className="ml-auto text-xs text-yellow-400 font-mono">{pair.ping}ms</span>
                </button>
              ))}
            </div>
          </FeatureToggle>

          <FeatureToggle
            title="Rotating IP"
            description="Reconnects to a different USA server every 10 minutes so your public IP changes over time."
            icon="🔄"
            enabled={rotatingIP}
            onToggle={toggleRotatingIP}
            badge="Live"
            badgeTone="live"
          />
        </div>
      </section>

      {/* Obfuscation */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 px-1">Obfuscation</h2>
        <div className="space-y-3">
          <FeatureToggle
            title="Camouflage Mode"
            description="Makes VPN traffic look like regular HTTPS, bypassing deep packet inspection. Requires obfuscation-capable servers, which free VPNGate doesn't provide."
            icon="🕵️"
            enabled={camouflageMode}
            onToggle={toggleCamouflageMode}
            badge="Preview"
            badgeTone="muted"
          />

          <FeatureToggle
            title="NoBorders Mode"
            description="Detects restrictive network conditions and selects servers that work best in your region."
            icon="🌍"
            enabled={noBordersMode}
            onToggle={toggleNoBordersMode}
            badge="Preview"
            badgeTone="muted"
          />
        </div>
      </section>

      {/* Traffic control */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 px-1">Traffic Control</h2>
        <div className="space-y-3">
          <FeatureToggle
            title="Split Tunneling (Bypasser)"
            description="Choose which apps bypass the VPN and connect directly. Per-app routing isn't wired into the tunnel yet."
            icon="✂️"
            enabled={splitTunneling}
            onToggle={toggleSplitTunneling}
            badge="Preview"
            badgeTone="muted"
          >
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-2">
                Excluded apps connect outside the VPN tunnel:
              </p>
              {splitTunnelApps.map(app => (
                <label
                  key={app.id}
                  className={clsx(
                    'flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all',
                    app.excluded
                      ? 'bg-accent-blue/10 border border-accent-blue/25'
                      : 'bg-navy-900 border border-navy-700 hover:bg-navy-800'
                  )}
                >
                  <span className="text-lg">{app.icon}</span>
                  <span className="text-sm text-white flex-1">{app.name}</span>
                  <input
                    type="checkbox"
                    checked={app.excluded}
                    onChange={() => toggleSplitTunnelApp(app.id)}
                    className="w-4 h-4 accent-teal-500 cursor-pointer"
                  />
                  <span className={clsx('text-xs font-medium', app.excluded ? 'text-accent-blue' : 'text-gray-600')}>
                    {app.excluded ? 'Excluded' : 'Protected'}
                  </span>
                </label>
              ))}
            </div>
          </FeatureToggle>

          <FeatureToggle
            title="Auto-Connect"
            description="Automatically connects to a USA server on startup and reconnects if the tunnel drops unexpectedly."
            icon="⚡"
            enabled={autoConnect}
            onToggle={toggleAutoConnect}
            badge="Live"
            badgeTone="live"
          />
        </div>
      </section>
    </div>
  );
}
