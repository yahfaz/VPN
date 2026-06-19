'use strict';

const { connect, disconnect } = require('../openvpn');
const { getUSAServers, ONLY_USA, VPNGATE_FALLBACK } = require('./providers/vpngateProvider');
const { verifyUSA } = require('./ipVerifier');
const { getPublicIP } = require('../openvpn');
const { enableKillSwitch, disableKillSwitch } = require('./features');

// Keep trying hard so the user rarely has to intervene: walk up to MAX_ATTEMPTS
// servers, and when the current candidate list is used up, force-refresh it from
// VPNGate (up to MAX_REFRESHES times) to pull in fresh / recovered servers.
const MAX_ATTEMPTS = 10;
const MAX_REFRESHES = 4;
const RETRY_BACKOFF_MS = 1500;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Orchestrates a USA-verified VPN connection with aggressive auto-retry.
 *
 * @param {object} requestedServer - server object from the client connect message
 * @param {function} sendFn - (type, data) => void  — proxies messages to the WebSocket client
 * @param {function} isAborted - () => boolean  — returns true when a disconnect was requested
 * @param {object} options - feature flags: { cleanWeb, cleanWebLevel, killSwitch }
 * @returns {Promise<boolean>} true if connected + US-verified, false otherwise
 */
async function connectUSA(requestedServer, sendFn, isAborted, options = {}) {
  sendFn('status', { status: 'connecting', server: requestedServer });
  sendFn('log', 'Finding USA servers...');
  // Clear any kill-switch rules from a previous session before we start a new
  // attempt — otherwise a stale "block outbound" policy would prevent the
  // handshake from ever reaching the server.
  disableKillSwitch();

  const failed = new Set(); // server ids that failed within the current list pass
  let refreshes = 0;

  // Build an ordered candidate list: the requested server first (if it's a US
  // server), then the rest in VPNGate's "most favorable" order (firewall-friendly
  // + highest score), dropping anything without a config or already failed.
  async function loadCandidates(force) {
    const all = await getUSAServers(force).catch(() => []);
    const startIdx = all.findIndex(s => s.id === requestedServer?.id);
    const ordered = startIdx >= 0
      ? [all[startIdx], ...all.slice(startIdx + 1), ...all.slice(0, startIdx)]
      : all;
    return ordered.filter(s => s.config && !failed.has(s.id));
  }

  let candidates = await loadCandidates(false);
  // Nothing cached? Try one forced refresh before giving up.
  if (candidates.length === 0) {
    refreshes++;
    candidates = await loadCandidates(true);
  }
  if (ONLY_USA && candidates.length === 0) {
    sendFn('error', 'No USA servers available right now. Please try again shortly.');
    const ip = await getPublicIP();
    sendFn('status', { status: 'disconnected', realIP: ip ?? 'unknown' });
    return false;
  }

  let tried = 0;
  let idx = 0;
  let lastErr = null;

  while (tried < MAX_ATTEMPTS) {
    if (isAborted()) break;

    // Exhausted the current list. Clearing `failed` lets previously-failed
    // servers be retried (they may recover), so we keep using the attempt budget.
    if (idx >= candidates.length) {
      if (candidates.length === 0) break;
      if (VPNGATE_FALLBACK && refreshes < MAX_REFRESHES) {
        // Fallback enabled: pull a fresh list from VPNGate and keep going.
        refreshes++;
        sendFn('log', `Refreshing USA server list (refresh ${refreshes}/${MAX_REFRESHES})…`);
        failed.clear();
        await sleep(RETRY_BACKOFF_MS);
        if (isAborted()) break;
        candidates = await loadCandidates(true);
        idx = 0;
        if (candidates.length === 0) continue;
      } else {
        // VPS-only: no external list to pull from — just retry the primary
        // server until the attempt budget (MAX_ATTEMPTS) is spent.
        failed.clear();
        idx = 0;
        sendFn('log', 'Retrying primary USA server…');
        await sleep(RETRY_BACKOFF_MS);
        if (isAborted()) break;
      }
    }

    const candidate = candidates[idx++];
    if (!candidate || failed.has(candidate.id)) continue;
    tried++;

    sendFn('status', { status: 'connecting', server: candidate });
    sendFn('log', `Connecting to USA server ${candidate.ip} [attempt ${tried}/${MAX_ATTEMPTS}]`);

    // ── OpenVPN connect ────────────────────────────────────────────────────
    try {
      await connect(candidate, (log) => sendFn('log', log), options);
    } catch (err) {
      failed.add(candidate.id);
      lastErr = err;
      sendFn('log', `Failed: ${err.message}`);
      await sleep(RETRY_BACKOFF_MS);
      continue;
    }

    if (isAborted()) {
      await disconnect();
      break;
    }

    // ── IP verification ────────────────────────────────────────────────────
    sendFn('status', { status: 'verifying', server: candidate });
    sendFn('log', 'Verifying USA IP...');

    try {
      const v = await verifyUSA();
      sendFn('log', `Detected: ${v.ip} — ${v.country} (${v.countryCode})`);

      if (v.isUSA) {
        // Engage the kill switch only now that we have a verified US tunnel, so
        // a failed/abandoned attempt never leaves traffic blocked.
        if (options.killSwitch) {
          enableKillSwitch(candidate.ip, (log) => sendFn('log', log));
        }
        sendFn('status', {
          status: 'connected',
          server: candidate,
          vpnIP: v.ip,
          verifiedCountry: v.country,
          verifiedCountryCode: v.countryCode,
        });
        return true;
      }

      // IP not in USA — disconnect and try next
      sendFn('log', `IP check failed: expected US, got ${v.countryCode} (${v.country})`);
      await disconnect();
      failed.add(candidate.id);
      lastErr = new Error(`IP not in USA (got ${v.countryCode})`);

    } catch (err) {
      sendFn('log', `IP verification error: ${err.message}`);
      await disconnect();
      failed.add(candidate.id);
      lastErr = err;
    }
    await sleep(RETRY_BACKOFF_MS);
  }

  // ── All attempts exhausted ─────────────────────────────────────────────
  if (isAborted()) {
    const ip = await getPublicIP();
    sendFn('status', { status: 'disconnected', realIP: ip ?? 'unknown' });
    return false;
  }

  const errorMsg = VPNGATE_FALLBACK
    ? `Couldn't reach a verified USA server after ${tried} attempts. Please try again shortly.`
    : `Couldn't reach the USA server after ${tried} attempts (${lastErr?.message || 'timed out'}). `
      + `Check the server is running and that inbound UDP 1194 is open.`;
  sendFn('error', errorMsg);
  const ip = await getPublicIP();
  sendFn('status', { status: 'disconnected', realIP: ip ?? 'unknown' });
  return false;
}

module.exports = { connectUSA, ONLY_USA };
