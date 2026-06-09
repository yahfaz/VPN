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
    // Remove directives that cause issues in daemon mode
    .replace(/^route-nopull.*$/gm, '')
    .replace(/^block-outside-dns.*$/gm, '')
    .replace(/^dhcp-option.*$/gm, '');

  // Replace auth-user-pass with our creds file path
  const authPath = path.join(os.tmpdir(), 'surfvpn-auth.txt');
  if (/^auth-user-pass\s*$/m.test(cfg)) {
    cfg = cfg.replace(/^auth-user-pass\s*$/m, `auth-user-pass ${authPath}`);
  } else if (!cfg.includes('auth-user-pass')) {
    cfg += `\nauth-user-pass ${authPath}`;
  }

  // Ensure we don't reroute all traffic (so we don't lose connectivity to the app itself)
  // Comment out redirect-gateway so only the app's own IP routing changes
  cfg = cfg.replace(/^redirect-gateway/gm, '#redirect-gateway');

  cfg += '\nscript-security 2\nlog-append /tmp/surfvpn.log\npull-filter ignore "redirect-gateway"\n';
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
    const args = ['--config', configPath, '--verb', '3', '--connect-retry-max', '3'];
    // Try with sudo if available
    let cmd = 'openvpn';
    let cmdArgs = args;
    try {
      require('child_process').execSync('which sudo', { stdio: 'ignore' });
      cmd = 'sudo';
      cmdArgs = ['openvpn', ...args];
    } catch { /* no sudo, try direct */ }

    proc = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => {
      reject(new Error('Connection timed out after 30s'));
      disconnect();
    }, 30000);

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
      // sudo kill needs special handling
      require('child_process').execSync(`sudo kill ${proc.pid} 2>/dev/null || kill ${proc.pid} 2>/dev/null`);
    } catch { proc.kill('SIGTERM'); }
    setTimeout(resolve, 3000); // fallback
  });
}

function isRunning() { return proc !== null; }

function setExitCallback(cb) { onExit = cb; }

module.exports = { connect, disconnect, isRunning, setExitCallback, getPublicIP };
