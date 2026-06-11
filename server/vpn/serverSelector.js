'use strict';

class ServerSelector {
  constructor(servers) {
    this._servers = servers;
    this._failedIds = new Set();
    this._idx = 0;
  }

  next() {
    while (this._idx < this._servers.length) {
      const s = this._servers[this._idx++];
      if (!this._failedIds.has(s.id) && s.config) return s;
    }
    return null;
  }

  markFailed(id) {
    this._failedIds.add(id);
  }
}

module.exports = { ServerSelector };
