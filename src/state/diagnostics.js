const { DIAGNOSTICS_INTERVAL } = require("../config/constants");

class DiagnosticsManager {
  constructor() {
    this.stats = {
      heartbeatsReceived: 0,
      heartbeatsRelayed: 0,
      invalidPoW: 0,
      duplicateSeq: 0,
      invalidSig: 0,
      newPeersAdded: 0,
      bytesReceived: 0,
      bytesRelayed: 0,
      leaveMessages: 0,
    };

    this.interval = null;
  }

  increment(key, amount = 1) {
    if (Object.hasOwn(this.stats, key)) {
      this.stats[key] += amount;
    }
  }

  getStats() {
    return { ...this.stats };
  }

  reset() {
    for (const key of Object.keys(this.stats)) {
      this.stats[key] = 0;
    }
  }

  startLogging(_getPeerCount, _getConnectionCount) {
    this.interval = setInterval(() => {
      this.reset();
    }, DIAGNOSTICS_INTERVAL);
  }

  stopLogging() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

module.exports = { DiagnosticsManager };
