'use strict';
// Downloads and extracts OpenVPN 2.6.x + wintun.dll into resources/win/
// Run on Windows before building: npm run prepare:win

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

if (process.platform !== 'win32') {
  console.error('Error: This script must be run on Windows.');
  process.exit(1);
}

const FORCE = process.argv.includes('--force');

const OPENVPN_MSI_URL = 'https://swupdate.openvpn.org/community/releases/OpenVPN-2.6.14-I001-amd64.msi';
const WINTUN_ZIP_URL  = 'https://www.wintun.net/builds/wintun-0.14.1.zip';

const ROOT         = path.join(__dirname, '..');
const OUT_DIR      = path.join(ROOT, 'resources', 'win');
const OPENVPN_OUT  = path.join(OUT_DIR, 'openvpn.exe');

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── helpers ──────────────────────────────────────────────────────────────────

function download(url, dest) {
  console.log(`  Downloading ${url}`);
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    function get(u) {
      https.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    }
    get(url);
  });
}

// ── OpenVPN ──────────────────────────────────────────────────────────────────

async function fetchOpenVPN() {
  if (!FORCE && fs.existsSync(OPENVPN_OUT)) {
    console.log('openvpn.exe already present — skipping (use --force to re-download)');
    return;
  }

  console.log('\n[1/2] Fetching OpenVPN 2.6.14...');
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'surfvpn-ovpn-'));
  const msiPath = path.join(tmpDir, 'openvpn.msi');

  await download(OPENVPN_MSI_URL, msiPath);

  const extractDir = path.join(tmpDir, 'extracted');
  fs.mkdirSync(extractDir);

  console.log('  Extracting MSI (msiexec admin install)...');
  try {
    execSync(`msiexec /a "${msiPath}" /qn TARGETDIR="${extractDir}"`, { stdio: 'inherit' });
  } catch (err) {
    throw new Error(`msiexec failed: ${err.message}\nMake sure you are running as Administrator.`);
  }

  const binDir = path.join(extractDir, 'OpenVPN', 'bin');
  if (!fs.existsSync(binDir)) {
    throw new Error(`Expected bin dir not found after extraction: ${binDir}`);
  }

  console.log('  Copying binaries to resources/win/...');
  for (const file of fs.readdirSync(binDir)) {
    if (file === 'openvpn.exe' || file.endsWith('.dll')) {
      fs.copyFileSync(path.join(binDir, file), path.join(OUT_DIR, file));
      console.log(`    + ${file}`);
    }
  }

  // Keep the MSI so the NSIS installer can run it silently to install
  // tap-windows6 driver + OpenVPN interactive service on the end-user's PC.
  const msiDest = path.join(OUT_DIR, 'openvpn-install.msi');
  fs.copyFileSync(msiPath, msiDest);
  console.log('    + openvpn-install.msi (bundled for NSIS installer)');

  // cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ── wintun ───────────────────────────────────────────────────────────────────

async function fetchWintun() {
  const wintunOut = path.join(OUT_DIR, 'wintun.dll');
  if (!FORCE && fs.existsSync(wintunOut)) {
    console.log('wintun.dll already present — skipping');
    return;
  }

  console.log('\n[2/2] Fetching wintun 0.14.1...');
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'surfvpn-wintun-'));
  const zipPath = path.join(tmpDir, 'wintun.zip');

  await download(WINTUN_ZIP_URL, zipPath);

  const extractDir = path.join(tmpDir, 'extracted');
  fs.mkdirSync(extractDir);

  console.log('  Extracting ZIP...');
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
    { stdio: 'inherit' }
  );

  const dllSrc = path.join(extractDir, 'wintun', 'bin', 'amd64', 'wintun.dll');
  if (!fs.existsSync(dllSrc)) {
    throw new Error(`wintun.dll not found at expected path: ${dllSrc}`);
  }

  fs.copyFileSync(dllSrc, wintunOut);
  console.log('    + wintun.dll');

  // cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ── main ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await fetchOpenVPN();
    await fetchWintun();
    console.log('\nDone. resources/win/ is ready for electron-builder.\n');
  } catch (err) {
    console.error('\nFailed:', err.message);
    process.exit(1);
  }
})();
