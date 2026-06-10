'use strict';

const http = require('http');
const https = require('https');

// Try HTTPS mirror first (more reliable in some regions), fall back to HTTP
const VPNGATE_URLS = [
  'https://www.vpngate.net/api/iphone/',
  'http://www.vpngate.net/api/iphone/',
];
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cache = { servers: [], ts: 0 };

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 20000 }, (res) => {
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
        serverCount: 1,
        load: Math.min(Math.round((parseInt(cols[7]) || 0) * 5), 95),
        type: 'standard',
        favorite: false,
        region: regionFor(cols[6]),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
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

async function getServers() {
  if (Date.now() - cache.ts < CACHE_TTL_MS && cache.servers.length > 0) {
    return cache.servers;
  }
  const raw = await fetchWithRetry();
  const servers = parseCSV(raw);
  if (servers.length === 0) throw new Error('VPNGate returned no usable servers');
  cache = { servers, ts: Date.now() };
  return servers;
}

module.exports = { getServers };
