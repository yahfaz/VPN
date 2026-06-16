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
    const authPath = path.join(os.tmpdir(), 'surfvpn-auth.txt').replace(/\\/g, '/');
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
  // `log-append` (the old hardcoded /tmp/surfvpn.log path does not exist on Windows; logs are
  // already streamed live to the UI over the WebSocket).

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

  const configPath = path.join(os.tmpdir(), 'surfvpn.ovpn');
  const authPath = path.join(os.tmpdir(), 'surfvpn-auth.txt');

  const patched = patchConfig(server.config, { ...options, authUserPass: server.authUserPass !== false });
  fs.writeFileSync(configPath, patched, { mode: 0o600 });
  fs.writeFileSync(authPath, 'vpn\nvpn\n', { mode: 0o600 });

  return new Promise((resolve, reject) => {
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
      reject(new Error('Connection timed out after 30s'));
      disconnect();
    }, 30000);

    function handleOutput(data) {
      const msg = data.toString();
      onLog(msg.trim());

      if (msg.includes('Initialization Sequence Completed')) {
        clearTimeout(timer);
        established = true;
        getPublicIP().then(ip => resolve({ ip }));
      }
      if (msg.includes('AUTH_FAILED')) {
        clearTimeout(timer);
        reject(new Error('Authentication failed (AUTH_FAILED)'));
        disconnect();
      }
      if (msg.includes('TLS Error')) {
        clearTimeout(timer);
        reject(new Error('TLS handshake failed — server may be offline'));
        disconnect();
      }
      if (msg.includes('Options error') || msg.includes('Unrecognized option')) {
        clearTimeout(timer);
        reject(new Error('VPN config error — bad option in server config'));
        disconnect();
      }
      if (msg.includes('Exiting due to fatal error')) {
        clearTimeout(timer);
        reject(new Error('OpenVPN fatal error — check logs for details'));
        disconnect();
      }
      if (msg.includes('SIGTERM') || msg.includes('process exiting')) {
        clearTimeout(timer);
        reject(new Error('OpenVPN process exited unexpectedly'));
      }
    }

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    proc.on('exit', (code) => {
      proc = null;
      clearTimeout(timer);
      // Only report *unexpected* drops of an established tunnel. Exits during
      // the connect phase (handled by the reject paths above) or triggered by
      // our own disconnect() must not fire the callback — otherwise the UI
      // flaps to "disconnected" in the middle of an auto-retry sequence.
      if (established && !intentionalExit && onExit) onExit(code);
      established = false;
      intentionalExit = false;
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start OpenVPN: ${err.message}`));
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
