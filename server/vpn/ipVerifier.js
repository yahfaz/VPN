'use strict';

const https = require('https');
const http = require('http');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { reject(new Error('Invalid JSON response')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

async function verifyUSA() {
  // Step 1 — get current public IP through the tunnel
  const { ip } = await fetchJSON('https://api.ipify.org?format=json');
  if (!ip) throw new Error('Could not determine public IP');

  // Step 2 — geolocate the IP (ip-api.com: free, no key required, 45 req/min)
  const geo = await fetchJSON(`http://ip-api.com/json/${ip}?fields=status,country,countryCode`);
  if (geo.status !== 'success') throw new Error(`ip-api returned status: ${geo.status}`);

  return {
    ip,
    country: geo.country || '',
    countryCode: geo.countryCode || '',
    isUSA: geo.countryCode === 'US',
  };
}

module.exports = { verifyUSA };
