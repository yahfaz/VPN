'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

let proc = null;
let onExit = null;

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

function patchConfig(raw) {
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

  // Replace auth-user-pass with our creds file path.
  // OpenVPN config parsing treats backslashes as escape characters, so on Windows the path
  // must use forward slashes (OpenVPN accepts forward slashes on every platform).
  const authPath = path.join(os.tmpdir(), 'surfvpn-auth.txt').replace(/\\/g, '/');
  if (/^auth-user-pass\s*$/m.test(cfg)) {
    cfg = cfg.replace(/^auth-user-pass\s*$/m, `auth-user-pass ${authPath}`);
  } else if (!cfg.includes('auth-user-pass')) {
    cfg += `\nauth-user-pass ${authPath}`;
  }

  // Route all traffic through VPN (redirect-gateway is intentionally kept active).
  // localhost traffic is never affected by VPN routing, so the backend on :3001 stays reachable.
  //
  // We intentionally do NOT add `script-security 2` (no client-side scripts are used, so
  // raising the script security level would only widen the attack surface), and we do NOT add
  // `log-append` (the old hardcoded /tmp/surfvpn.log path does not exist on Windows; logs are
  // already streamed live to the UI over the WebSocket).
  return cfg;
}

async function connect(server, onLog) {
  if (proc) await disconnect();

  const configPath = path.join(os.tmpdir(), 'surfvpn.ovpn');
  const authPath = path.join(os.tmpdir(), 'surfvpn-auth.txt');

  const patched = patchConfig(server.config);
  fs.writeFileSync(configPath, patched, { mode: 0o600 });
  fs.writeFileSync(authPath, 'vpn\nvpn\n', { mode: 0o600 });

  return new Promise((resolve, reject) => {
    const args = [
      '--config', configPath,
      '--verb', '3',
      '--connect-retry-max', '3',
      '--allow-compression', 'asym', // accept server-pushed compression, never compress client side
    ];
    const isWin = process.platform === 'win32';

    // On Windows the app runs as Administrator (requestedExecutionLevel in package.json),
    // so openvpn can be called directly. On Linux/Mac, use sudo.
    let cmd, cmdArgs;
    if (isWin) {
      // Prefer the bundled binary shipped with the Electron app
      const resourcesPath = process.env.RESOURCES_PATH;
      const bundledExe = resourcesPath ? path.join(resourcesPath, 'win', 'openvpn.exe') : null;

      if (bundledExe && fs.existsSync(bundledExe)) {
        cmd = bundledExe;
        cmdArgs = [
          ...args,
          '--windows-driver', 'wintun',
          '--wintun-dll-path', path.join(resourcesPath, 'win', 'wintun.dll'),
        ];
      } else {
        // Fall back to system-installed OpenVPN
        // Use a cheap existence check rather than launching openvpn just to probe for it.
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

    proc = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    // VPNGate servers are free/public and can be slow to negotiate, so allow up to 60s.
    const timer = setTimeout(() => {
      reject(new Error('Connection timed out after 60s'));
      disconnect();
    }, 60000);

    function handleOutput(data) {
      const msg = data.toString();
      onLog(msg.trim());

      if (msg.includes('Initialization Sequence Completed')) {
        clearTimeout(timer);
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
      if (onExit) onExit(code);
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
