'use strict';

const { connect, disconnect } = require('../openvpn');
const { getUSAServers, ONLY_USA } = require('./providers/vpngateProvider');
const { ServerSelector } = require('./serverSelector');
const { verifyUSA } = require('./ipVerifier');
const { getPublicIP } = require('../openvpn');

const MAX_ATTEMPTS = 5;

/**
 * Orchestrates a USA-verified VPN connection.
 *
 * @param {object} requestedServer - server object from the client connect message
 * @param {function} sendFn - (type, data) => void  — proxies messages to the WebSocket client
 * @param {function} isAborted - () => boolean  — returns true when a disconnect was requested
 * @returns {Promise<boolean>} true if connected + US-verified, false otherwise
 */
async function connectUSA(requestedServer, sendFn, isAborted) {
  sendFn('status', { status: 'connecting', server: requestedServer });
  sendFn('log', 'Finding USA servers...');

  const allServers = await getUSAServers().catch(() => []);

  if (ONLY_USA && allServers.length === 0) {
    sendFn('error', 'No USA servers available right now.');
    const ip = await getPublicIP();
    sendFn('status', { status: 'disconnected', realIP: ip ?? 'unknown' });
    return false;
  }

  // Requested server first (if it's in the US list), then the rest in order
  const startIdx = allServers.findIndex(s => s.id === requestedServer?.id);
  const ordered = startIdx >= 0
    ? [allServers[startIdx], ...allServers.slice(startIdx + 1), ...allServers.slice(0, startIdx)]
    : allServers;

  const selector = new ServerSelector(ordered);
  let tried = 0;
  let lastErr = null;

  while (tried < MAX_ATTEMPTS) {
    if (isAborted()) break;

    const candidate = selector.next();
    if (!candidate) break;
    tried++;

    sendFn('status', { status: 'connecting', server: candidate });
    sendFn('log', `Connecting to USA server ${candidate.ip} [attempt ${tried}/${MAX_ATTEMPTS}]`);

    // ── OpenVPN connect ────────────────────────────────────────────────────
    try {
      await connect(candidate, (log) => sendFn('log', log));
    } catch (err) {
      selector.markFailed(candidate.id);
      lastErr = err;
      sendFn('log', `Failed: ${err.message}`);
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
      selector.markFailed(candidate.id);
      lastErr = new Error(`IP not in USA (got ${v.countryCode})`);

    } catch (err) {
      sendFn('log', `IP verification error: ${err.message}`);
      await disconnect();
      selector.markFailed(candidate.id);
      lastErr = err;
    }
  }

  // ── All attempts exhausted ─────────────────────────────────────────────
  if (isAborted()) {
    const ip = await getPublicIP();
    sendFn('status', { status: 'disconnected', realIP: ip ?? 'unknown' });
    return false;
  }

  const errorMsg = ONLY_USA
    ? 'No verified USA VPN server available right now.'
    : `All ${tried} servers failed. Last error: ${lastErr?.message}`;
  sendFn('error', errorMsg);
  const ip = await getPublicIP();
  sendFn('status', { status: 'disconnected', realIP: ip ?? 'unknown' });
  return false;
}

module.exports = { connectUSA, ONLY_USA };
