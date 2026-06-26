'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { cleanWebConfigLines } = require('./vpn/features');

let proc = null;
let onExit = null;
let established = false;   // true once the tunnel is fully up
let intentionalExit = false; // true while we are killing the process ourselves

function getPublicIP() {
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org?format=json', { timeout: 8000 }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).ip); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function patchConfig(raw, options = {}) {
  let cfg = raw
    // ── Deprecated directives removed in OpenVPN 2.5 / 2.6 ──────────────
    // These cause an immediate "Options error" exit before any connection attempt.
    .replace(/^comp-lzo.*$/gm, '')        // replaced by compress; handled via --allow-compression
    .replace(/^compress\b.*$/gm, '')      // strip any existing compress line too
    .replace(/^ns-cert-type.*$/gm, '')    // removed in 2.5, use remote-cert-tls
    .replace(/^tls-remote.*$/gm, '')      // removed in 2.5, use verify-x509-name
    .replace(/^keysize.*$/gm, '')         // removed in 2.5
    .replace(/^cipher\s+BF-CBC.*$/gm, '') // Blowfish removed in 2.6
    // ── Remove directives that break routing / Windows ────────────────────
    .replace(/^route-nopull.*$/gm, '')
    .replace(/^block-outside-dns.*$/gm, '')
    .replace(/^dhcp-option.*$/gm, '')
    // ── Remove any log-file directives (logs stream over WebSocket) ───────
    .replace(/^log\b.*$/gm, '')
    .replace(/^log-append.*$/gm, '');

  // ── Data cipher compatibility (OpenVPN 2.6 ↔ old VPNGate servers) ──────
  // VPNGate servers are old and negotiate legacy ciphers (AES-128-CBC, BF-CBC).
  // In 2.6 the data-channel cipher must be explicitly allowed, otherwise the
  // session can stall right after PUSH_REQUEST (no PUSH_REPLY). We append a
  // broad data-ciphers list plus a fallback so any server cipher is accepted.
  if (!/^data-ciphers\b/m.test(cfg)) {
    cfg += '\ndata-ciphers AES-256-GCM:AES-128-GCM:AES-256-CBC:AES-128-CBC:BF-CBC';
  }
  if (!/^data-ciphers-fallback\b/m.test(cfg)) {
    cfg += '\ndata-ciphers-fallback AES-128-CBC';
  }

  // Replace auth-user-pass with our creds file path. VPNGate servers authenticate
  // with vpn/vpn; cert-based servers (your own VPS via easy-rsa) set
  // authUserPass:false, so we must NOT inject credentials the server never asked
  // for — doing so makes OpenVPN error out before the handshake.
  // OpenVPN config parsing treats backslashes as escape characters, so on Windows the path
  // must use forward slashes (OpenVPN accepts forward slashes on every platform).
  if (options.authUserPass !== false) {
    const authPath = path.join(os.tmpdir(), 'nx3vpn-auth.txt').replace(/\\/g, '/');
    if (/^auth-user-pass\s*$/m.test(cfg)) {
      cfg = cfg.replace(/^auth-user-pass\s*$/m, `auth-user-pass ${authPath}`);
    } else if (!cfg.includes('auth-user-pass')) {
      cfg += `\nauth-user-pass ${authPath}`;
    }
  }

  // Route all traffic through VPN (redirect-gateway is intentionally kept active).
  // localhost traffic is never affected by VPN routing, so the backend on :3001 stays reachable.
  //
  // We intentionally do NOT add `script-security 2` (no client-side scripts are used, so
  // raising the script security level would only widen the attack surface), and we do NOT add
  // `log-append` (the old hardcoded /tmp/nx3vpn.log path does not exist on Windows; logs are
  // already streamed live to the UI over the WebSocket).

  // ── MTU tuning — prevents packet fragmentation during VoIP / video calls ──
  // VPN tunnel overhead (OpenVPN header + AES-GCM IV + auth tag ≈ 80–120 B)
  // means a 1500-byte Ethernet frame can only carry ~1380 B of payload. Call
  // apps (Zoom, WhatsApp, Teams, Meet) send UDP audio/video at up to 1400 B;
  // without these settings those packets get fragmented at the IP layer, causing
  // burst packet loss and the choppy / dropped-call symptom.
  //   tun-mtu 1400  — tells the OS the TUN interface MTU is 1400, so it never
  //                    hands the tunnel a packet that needs fragmenting.
  //   mssfix 1300   — clamps TCP segment size so TCP streams (web calls, HTTPS)
  //                    also stay inside the tunnel MTU.
  //   fragment 1300 — OpenVPN fragments its own outbound UDP at 1300 B as a
  //                    belt-and-suspenders guard for any large UDP burst.
  if (!/^tun-mtu\b/m.test(cfg)) cfg += '\ntun-mtu 1400';
  // mssfix is NOT injected client-side: the server pushes it via PUSH_REPLY.
  // OpenVPN 2.6 warns that mssfix can't be a push option, but that warning is
  // non-fatal and the tunnel works fine. Adding it client-side too would only
  // produce a duplicate and doesn't help.
  if (!/^fragment\b/m.test(cfg)) cfg += '\nfragment 1300';

  // CleanWeb — point the tunnel's DNS at an ad/tracker-blocking resolver. Added
  // last so it overrides anything stripped above. block-outside-dns (Windows)
  // prevents the OS from leaking queries to its configured resolver.
  if (options.cleanWeb) {
    cfg += '\n' + cleanWebConfigLines(options.cleanWebLevel);
  }
  return cfg;
}

async function connect(server, onLog, options = {}) {
  if (proc) await disconnect();
  established = false;
  intentionalExit = false;

  const configPath = path.join(os.tmpdir(), 'nx3vpn.ovpn');
  const authPath = path.join(os.tmpdir(), 'nx3vpn-auth.txt');

  const patched = patchConfig(server.config, { ...options, authUserPass: server.authUserPass !== false });
  fs.writeFileSync(configPath, patched, { mode: 0o600 });
  fs.writeFileSync(authPath, 'vpn\nvpn\n', { mode: 0o600 });

  return new Promise((resolve, reject) => {
    // Keep a rolling tail of the most recent output so that if openvpn dies
    // during the connect phase we can report *why* instead of a bare timeout.
    const logTail = [];
    let settled = false;
    let tlsEstablished = false; // true once the TLS handshake + PUSH phase completes
    const args = [
      '--config', configPath,
      '--verb', '3',
      '--connect-retry-max', '1', // fail fast; caller retries with next server
      '--allow-compression', 'asym', // accept server-pushed compression, never compress client side
    ];
    const isWin = process.platform === 'win32';

    // On Windows the app runs as Administrator (requestedExecutionLevel in package.json),
    // so openvpn can be called directly. On Linux/Mac, use sudo.
    let cmd, cmdArgs, spawnOpts = { stdio: ['ignore', 'pipe', 'pipe'] };
    if (isWin) {
      // Prefer the bundled binary shipped with the Electron app
      const resourcesPath = process.env.RESOURCES_PATH;
      const bundledExe = resourcesPath ? path.join(resourcesPath, 'win', 'openvpn.exe') : null;

      if (bundledExe && fs.existsSync(bundledExe)) {
        cmd = bundledExe;
        // No --windows-driver flag: the NSIS installer runs openvpn-install.msi
        // which installs tap-windows6 + the interactive service (runs as SYSTEM).
        // OpenVPN auto-selects the available driver; tap-windows6 is reliable and
        // works without SYSTEM privileges for the OpenVPN process itself.
        cmdArgs = args;
        spawnOpts.cwd = path.dirname(bundledExe);
      } else {
        // Fall back to system-installed OpenVPN
        const candidates = [
          'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
          'C:\\Program Files (x86)\\OpenVPN\\bin\\openvpn.exe',
        ];
        cmd = candidates.find(p => fs.existsSync(p)) ?? 'openvpn';
        cmdArgs = args;
      }
    } else {
      try {
        require('child_process').execSync('which sudo', { stdio: 'ignore' });
        cmd = 'sudo'; cmdArgs = ['openvpn', ...args];
      } catch {
        cmd = 'openvpn'; cmdArgs = args;
      }
    }

    proc = spawn(cmd, cmdArgs, spawnOpts);

    // Fail fast (30s) so the caller can move on to the next server quickly.
    // A reachable VPNGate server completes the handshake in well under 30s;
    // anything slower is effectively blocked/unreachable from this network.
    const timer = setTimeout(() => {
      fail(new Error('Connection timed out after 30s — no reply from server. '
        + 'The server replies but they never reached this PC (check the network/firewall), '
        + 'or the TUN adapter could not be opened.'));
    }, 30000);

    // Single-shot settle helpers so a reject and the later exit handler don't
    // both fire (which would crash with "promise already settled" noise).
    function fail(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
      disconnect();
    }
    function succeed(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }

    function handleOutput(data) {
      const msg = data.toString();
      onLog(msg.trim());
      logTail.push(msg.trim());
      if (logTail.length > 12) logTail.shift();

      if (msg.includes('Initialization Sequence Completed')) {
        established = true;
        getPublicIP().then(ip => succeed({ ip }));
      }
      // Track when TLS handshake + push phase is done so post-PUSH option
      // warnings don't get misidentified as fatal config errors.
      if (msg.includes('Peer Connection Initiated') || msg.includes('PUSH_REPLY')) {
        tlsEstablished = true;
      }
      if (msg.includes('AUTH_FAILED')) {
        fail(new Error('Authentication failed (AUTH_FAILED)'));
      }
      if (msg.includes('TLS Error') || msg.includes('TLS key negotiation failed')) {
        fail(new Error('TLS handshake failed — server unreachable or replies blocked on this network'));
      }
      // Only fail on Options errors that appear BEFORE the PUSH phase. After the
      // server sends PUSH_REPLY, OpenVPN 2.6 logs non-fatal warnings about options
      // the server tried to push but that aren't push-able (e.g. "mssfix cannot
      // be used in this context ([PUSH-OPTIONS])"). Treating those as fatal kills
      // a tunnel that is actually up and routing traffic correctly.
      if ((msg.includes('Options error') || msg.includes('Unrecognized option'))
          && !msg.includes('PUSH-OPTIONS') && !tlsEstablished) {
        fail(new Error('VPN config error — bad option in server config'));
      }
      // Windows TUN/TAP/wintun adapter problems. openvpn opens its UDP socket
      // (the server therefore sees the client's hello) BEFORE opening the tunnel
      // adapter — so a missing/locked driver shows up here as the connection
      // dying right after the handshake starts. This is the most common cause of
      // "stuck connecting": the OpenVPN driver was never installed on this PC.
      if (/There are no TAP-Windows adapters|All TAP-Windows adapters .* are currently in use|wintun.*(error|fail)|Cannot find a free TAP|CreateFile failed on TAP|Note: Cannot open TUN\/TAP|There was a problem opening|exit_event/i.test(msg)) {
        fail(new Error('VPN network adapter not available — the OpenVPN/TAP driver is not installed. '
          + 'Reinstall the app (it bundles the driver) or install OpenVPN once from openvpn.net.'));
      }
      if (msg.includes('Exiting due to fatal error')) {
        fail(new Error(`OpenVPN fatal error: ${logTail.join(' | ')}`));
      }
    }

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    proc.on('exit', (code) => {
      proc = null;
      // If openvpn dies during the connect phase (before the tunnel is up) and
      // we didn't kill it ourselves, surface it NOW with the captured log tail
      // instead of letting the caller wait out the full 30s timeout. This is the
      // path a missing TUN/TAP driver takes when its error string isn't matched
      // above — the process simply exits.
      if (!established && !intentionalExit) {
        fail(new Error(`OpenVPN exited (code ${code}) before connecting: ${logTail.join(' | ') || 'no output'}`));
      }
      // Only report *unexpected* drops of an established tunnel. Our own
      // disconnect() sets intentionalExit so the UI doesn't flap mid-retry.
      if (established && !intentionalExit && onExit) onExit(code);
      established = false;
      intentionalExit = false;
    });

    proc.on('error', (err) => {
      fail(new Error(`Failed to start OpenVPN: ${err.message}`));
    });
  });
}

function disconnect() {
  return new Promise((resolve) => {
    if (!proc) { resolve(); return; }
    intentionalExit = true;
    proc.on('exit', () => resolve());
    try {
      if (process.platform === 'win32') {
        require('child_process').execSync(`taskkill /PID ${proc.pid} /F /T`, { stdio: 'ignore' });
      } else {
        require('child_process').execSync(`sudo kill ${proc.pid} 2>/dev/null || kill ${proc.pid} 2>/dev/null`);
      }
    } catch { proc.kill('SIGTERM'); }
    setTimeout(resolve, 3000); // fallback
  });
}

function isRunning() { return proc !== null; }

function setExitCallback(cb) { onExit = cb; }

module.exports = { connect, disconnect, isRunning, setExitCallback, getPublicIP };
