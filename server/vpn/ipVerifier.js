'use strict';

const https = require('https');
const http = require('http');

function fetchText(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout }, (res) => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => resolve(d.trim()));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

async function fetchJSON(url, timeout) {
  const text = await fetchText(url, timeout);
  try { return JSON.parse(text); }
  catch { throw new Error('Invalid JSON response'); }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Try a list of async producers in order, returning the first that succeeds.
async function firstOk(producers) {
  let lastErr;
  for (const p of producers) {
    try { return await p(); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all sources failed');
}

// Get the current public IP + country. Each service is small/plain so the
// response fits well inside the tunnel MTU (large TLS payloads can be dropped
// when path MTU is constrained, which previously made verification time out).
async function detectOnce() {
  // ip-api.com returns IP *and* geo in a single small HTTP response — fewer
  // round trips, no second lookup needed. HTTP (not HTTPS) keeps packets small.
  const geo = await firstOk([
    async () => {
      const g = await fetchJSON('http://ip-api.com/json/?fields=status,country,countryCode,query');
      if (g.status !== 'success') throw new Error(`ip-api status: ${g.status}`);
      return { ip: g.query, country: g.country || '', countryCode: g.countryCode || '' };
    },
    // Fallback 1: ipwho.is (HTTPS but tiny response)
    async () => {
      const g = await fetchJSON('https://ipwho.is/');
      if (g.success === false) throw new Error('ipwho.is failed');
      return { ip: g.ip, country: g.country || '', countryCode: g.country_code || '' };
    },
    // Fallback 2: plain-text IP, then geolocate separately
    async () => {
      const ip = await fetchText('https://api.ipify.org');
      if (!ip) throw new Error('no ip');
      const g = await fetchJSON(`http://ip-api.com/json/${ip}?fields=status,country,countryCode`);
      return { ip, country: g.country || '', countryCode: g.countryCode || '' };
    },
  ]);
  return { ...geo, isUSA: geo.countryCode === 'US' };
}

// Retry the whole detection a few times before giving up — a freshly-established
// tunnel needs a moment to settle, and a single slow request should never cause
// a working connection to be torn down.
async function verifyUSA() {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await detectOnce();
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(2000);
    }
  }
  throw lastErr || new Error('IP verification failed');
}

module.exports = { verifyUSA };
