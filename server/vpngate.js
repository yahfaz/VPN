'use strict';

const http = require('http');
const https = require('https');

// Direct VPNGate endpoints (HTTPS first — more reliable in some regions).
const VPNGATE_TARGET = 'https://www.vpngate.net/api/iphone/';
const DIRECT_URLS = [
  'https://www.vpngate.net/api/iphone/',
  'http://www.vpngate.net/api/iphone/',
];
// Public read-only proxies, tried only when the direct API is blocked or returns
// 403 (common on some ISPs / datacenter IPs). The VPNGate server list is public
// data, so routing the fetch through a proxy leaks nothing sensitive.
const PROXY_URLS = [
  `https://api.allorigins.win/raw?url=${encodeURIComponent(VPNGATE_TARGET)}`,
  `https://api.codetabs.com/v1/proxy/?quest=${VPNGATE_TARGET}`,
];
const VPNGATE_URLS = [...DIRECT_URLS, ...PROXY_URLS];
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cache = { servers: [], ts: 0 };
let lastError = null; // last fetch failure reason, surfaced to the UI for diagnosis

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const opts = {
      timeout: 20000,
      // VPNGate rejects some non-browser clients with 403
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
    };
    const req = mod.get(url, opts, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchRaw(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

async function fetchWithRetry() {
  for (const url of VPNGATE_URLS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[vpngate] Fetching ${url} (attempt ${attempt})`);
        const raw = await fetchRaw(url);
        if (raw && raw.length > 500) return raw;
        throw new Error('Response too short');
      } catch (err) {
        console.warn(`[vpngate] ${url} attempt ${attempt} failed: ${err.message}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  throw new Error('All VPNGate endpoints failed');
}

function parseCSV(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('*') && !l.startsWith('#'));
  if (!lines.length) return [];

  return lines
    .map(line => {
      // Fields: HostName,IP,Score,Ping,Speed,CountryLong,CountryShort,
      //         NumVpnSessions,Uptime,TotalUsers,TotalTraffic,
      //         LogType,Operator,Message,OpenVPN_ConfigData_Base64
      const cols = line.split(',');
      if (cols.length < 15) return null;
      const configB64 = cols.slice(14).join(',').trim(); // config may contain commas
      if (!configB64) return null;

      let config;
      try {
        config = Buffer.from(configB64, 'base64').toString('utf8');
        if (!config.includes('remote ')) return null;
      } catch {
        return null;
      }

      // Detect protocol + port from the embedded config. Servers on UDP or
      // port 443 bypass most firewalls/ISP throttling and are far more likely
      // to actually connect, so we use this to bias the sort order.
      const protoMatch = config.match(/^proto\s+(\w+)/m);
      const remoteMatch = config.match(/^remote\s+\S+\s+(\d+)/m);
      const proto = protoMatch ? protoMatch[1].toLowerCase().replace(/[46]$/, '') : 'udp';
      const port = remoteMatch ? parseInt(remoteMatch[1]) : 0;
      const firewallFriendly = proto === 'udp' || port === 443 || port === 1194;

      const speedBps = parseInt(cols[4]) || 0;
      return {
        id: `vg-${cols[1].replace(/\./g, '-')}`,
        hostname: cols[0],
        ip: cols[1],
        score: parseInt(cols[2]) || 0,
        ping: Math.min(parseInt(cols[3]) || 999, 999),
        speedMbps: Math.round(speedBps / 1e6 * 10) / 10,
        country: cols[5],
        countryCode: cols[6].toUpperCase(),
        flag: countryFlag(cols[6]),
        sessions: parseInt(cols[7]) || 0,
        logType: cols[11] || '',
        operator: cols[12] || '',
        config,
        proto,
        port,
        firewallFriendly,
        serverCount: 1,
        load: Math.min(Math.round((parseInt(cols[7]) || 0) * 5), 95),
        type: 'standard',
        favorite: false,
        region: regionFor(cols[6]),
      };
    })
    .filter(Boolean)
    // Firewall-friendly servers first, then by VPNGate score
    .sort((a, b) => {
      if (a.firewallFriendly !== b.firewallFriendly) return a.firewallFriendly ? -1 : 1;
      return b.score - a.score;
    });
}

function countryFlag(code) {
  const c = (code || '').toUpperCase().slice(0, 2);
  if (c.length !== 2) return '🌐';
  return String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

function regionFor(code) {
  const eu = ['AD','AL','AT','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','ES','FI',
               'FR','GB','GR','HR','HU','IE','IS','IT','LI','LT','LU','LV','MC','MD','ME',
               'MK','MT','NL','NO','PL','PT','RO','RS','RU','SE','SI','SK','SM','TR','UA','XK'];
  const am = ['AR','BO','BR','CA','CL','CO','CR','EC','GT','MX','PA','PE','PY','TT','US','UY','VE'];
  const af = ['AE','DZ','EG','IL','KE','NG','QA','SA','TZ','ZA'];
  const c = (code || '').toUpperCase();
  if (eu.includes(c)) return 'Europe';
  if (am.includes(c)) return 'Americas';
  if (af.includes(c)) return 'Middle East & Africa';
  return 'Asia Pacific';
}

let inflight = null; // dedupe concurrent fetches (prewarm + API call racing)

async function getServers(force = false) {
  if (!force && Date.now() - cache.ts < CACHE_TTL_MS && cache.servers.length > 0) {
    return cache.servers;
  }
  // Force-refresh: bust the cache and wait for any in-flight fetch to settle first
  if (force) {
    cache = { servers: [], ts: 0 };
    if (inflight) await inflight.catch(() => {});
    inflight = null;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const raw = await fetchWithRetry();
      const servers = parseCSV(raw);
      if (servers.length === 0) throw new Error('VPNGate returned no usable servers');
      cache = { servers, ts: Date.now() };
      lastError = null;
      return servers;
    } catch (err) {
      lastError = err.message;
      throw err;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function getLastError() { return lastError; }

// Current cached servers without triggering a fetch (may be empty on cold start).
function getCachedServers() { return cache.servers; }

module.exports = { getServers, getLastError, getCachedServers };
