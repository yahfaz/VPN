'use strict';

// Real implementations of the client feature toggles (CleanWeb, Kill Switch).
//
// These hook directly into OpenVPN config generation and the OS firewall, so
// they only do anything in the packaged desktop app running with the privileges
// the installer requests (Administrator on Windows). They degrade safely: if a
// command fails we log and carry on rather than leaving the machine in a broken
// state, and the kill switch is always torn down on disconnect / backend start.

const { execFileSync } = require('child_process');

const isWin = process.platform === 'win32';
const KILL_SWITCH_RULE = 'Nx3VPN-KillSwitch';

// ── CleanWeb: DNS-based ad / tracker blocking ────────────────────────────────
// AdGuard public DNS — "standard" blocks ads + trackers, "advanced" (family)
// additionally blocks adult content. These are real filtering resolvers, so
// pointing the tunnel's DNS at them gives genuine network-wide ad blocking.
function cleanWebDNS(level) {
  return level === 'advanced'
    ? ['94.140.14.15', '94.140.15.16'] // AdGuard Family
    : ['94.140.14.14', '94.140.15.15']; // AdGuard standard (ads + trackers)
}

// Lines appended to the OpenVPN config when CleanWeb is enabled. On Windows we
// also add block-outside-dns so the OS can't leak queries to its own resolver.
function cleanWebConfigLines(level) {
  const dns = cleanWebDNS(level);
  const lines = dns.map(d => `dhcp-option DNS ${d}`);
  if (isWin) lines.push('block-outside-dns');
  return lines.join('\n');
}

// ── Kill Switch: block all traffic unless it flows to the VPN server ─────────
// Standard recipe: flip the default outbound policy to "block", then allow only
// (a) packets to the VPN server (so the encrypted tunnel itself can run),
// (b) LAN / loopback ranges (so the local app + LAN stay reachable).
// Decrypted traffic is encapsulated and sent to the server IP, which is allowed,
// so the tunnel keeps working — but the instant it drops, nothing leaks.
function enableKillSwitch(serverIP, log = () => {}) {
  if (!serverIP) return false;
  try {
    if (isWin) {
      run('netsh', ['advfirewall', 'set', 'allprofiles', 'firewallpolicy', 'blockinbound,blockoutbound']);
      // Allow the encrypted OpenVPN tunnel to reach the VPS
      addWinAllowRule('remoteip', serverIP);
      // Allow traffic that flows THROUGH the VPN tunnel. When the tunnel is up,
      // apps route via the TUN adapter whose source IP is in 10.8.0.0/24 (the
      // subnet pushed by our OpenVPN server). Without this rule blockoutbound
      // drops every app packet because its destination is an arbitrary internet
      // IP — not the VPS — even though the packet is legitimately tunnelled.
      addWinAllowRule('localip', '10.8.0.0/24');
      // Allow LAN and loopback destinations
      addWinAllowRule('remoteip', '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,127.0.0.0/8');
    } else {
      // Linux best-effort via iptables (requires root; the app uses sudo for openvpn).
      runSudo('iptables', ['-I', 'OUTPUT', '-d', serverIP, '-j', 'ACCEPT', '-m', 'comment', '--comment', KILL_SWITCH_RULE]);
      runSudo('iptables', ['-I', 'OUTPUT', '-o', 'lo', '-j', 'ACCEPT', '-m', 'comment', '--comment', KILL_SWITCH_RULE]);
      runSudo('iptables', ['-I', 'OUTPUT', '-o', 'tun+', '-j', 'ACCEPT', '-m', 'comment', '--comment', KILL_SWITCH_RULE]);
      runSudo('iptables', ['-A', 'OUTPUT', '-j', 'DROP', '-m', 'comment', '--comment', KILL_SWITCH_RULE]);
    }
    log('Kill switch engaged — traffic blocked outside the VPN tunnel.');
    return true;
  } catch (err) {
    log(`Kill switch could not be enabled: ${err.message}`);
    // Roll back any partial state so we never leave traffic blocked by accident.
    disableKillSwitch(() => {});
    return false;
  }
}

// Always safe to call, even if the kill switch was never enabled — used both on
// disconnect and as a startup safety net to clear rules left by a prior crash.
function disableKillSwitch(log = () => {}) {
  try {
    if (isWin) {
      // Restore Windows' default policy (outbound allowed) and drop our rules.
      runQuiet('netsh', ['advfirewall', 'set', 'allprofiles', 'firewallpolicy', 'blockinbound,allowoutbound']);
      runQuiet('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${KILL_SWITCH_RULE}`]);
    } else {
      // Strip every rule we tagged with our comment until none remain.
      let guard = 0;
      while (guard++ < 50) {
        try {
          const out = execFileSync('sudo', ['iptables', '-S', 'OUTPUT'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
          const line = out.split('\n').find(l => l.includes(KILL_SWITCH_RULE));
          if (!line) break;
          const spec = line.replace(/^-A /, '').trim().split(/\s+/);
          runSudo('iptables', ['-D', 'OUTPUT', ...spec]);
        } catch { break; }
      }
    }
    log('Kill switch released — normal traffic restored.');
  } catch { /* best effort — never throw from teardown */ }
}

function addWinAllowRule(matchKey, value) {
  run('netsh', ['advfirewall', 'firewall', 'add', 'rule', `name=${KILL_SWITCH_RULE}`,
    'dir=out', 'action=allow', `${matchKey}=${value}`]);
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
}
function runQuiet(cmd, args) {
  try { execFileSync(cmd, args, { stdio: 'ignore' }); } catch { /* ignore */ }
}
function runSudo(cmd, args) {
  execFileSync('sudo', [cmd, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
}

module.exports = { cleanWebConfigLines, enableKillSwitch, disableKillSwitch };
