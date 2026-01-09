const { MAX_PEERS, PEER_TIMEOUT } = require("../config/constants");
const { LRUCache } = require("./lru");
const { HyperLogLog } = require("./hyperloglog");

class PeerManager {
  constructor() {
    // Limits memory usage by only keeping the most recently active peers
    this.seenPeers = new LRUCache(MAX_PEERS);
    // Probabilistic data structure to count total unique peers efficiently
    this.uniquePeersHLL = new HyperLogLog(10);
    // Local sequence number for synchronizing state
    this.mySeq = 0;
  }

  // Updates a peer's status or adds them if they are new.
  // Now supports storing hardware stats (RAM/CPU) passed during handshake.
  addOrUpdatePeer(id, seq, ip = null, hardware = null) {
    const stored = this.seenPeers.get(id);
    const wasNew = !stored;

    // Track in HyperLogLog for total unique estimation
    this.uniquePeersHLL.add(id);

    this.seenPeers.set(id, {
      seq,
      lastSeen: Date.now(),
      ip: ip || (stored ? stored.ip : null),
      // Store hardware stats if provided, otherwise keep existing data
      hardware: hardware || (stored ? stored.hardware : null),
    });

    return wasNew;
  }

  // Calculates the total resources (RAM and CPU) of the entire swarm.
  // Combines the local node's stats with the stats of all connected peers.
  getSwarmStats(localIdentity) {
    let totalRam = 0;
    let totalCores = 0;

    // Add local node's stats first
    if (localIdentity && localIdentity.hardware) {
      totalRam = localIdentity.hardware.ram || 0;
      totalCores = localIdentity.hardware.cpus || 0;
    }

    // Add stats from all connected peers
    for (const [id, data] of this.seenPeers.entries()) {
      if (data.hardware) {
        totalRam += data.hardware.ram || 0;
        totalCores += data.hardware.cpus || 0;
      }
    }

    return { totalRam, totalCores };
  }

  // Checks if we have room to accept a new peer connection
  canAcceptPeer(id) {
    if (this.seenPeers.has(id)) return true;
    return this.seenPeers.size < MAX_PEERS;
  }

  getPeer(id) {
    return this.seenPeers.get(id);
  }

  removePeer(id) {
    return this.seenPeers.delete(id);
  }

  hasPeer(id) {
    return this.seenPeers.has(id);
  }

  // Removes peers that haven't been seen recently to free up slots
  cleanupStalePeers() {
    const now = Date.now();
    let removed = 0;

    for (const [id, data] of this.seenPeers.entries()) {
      if (now - data.lastSeen > PEER_TIMEOUT) {
        this.seenPeers.delete(id);
        removed++;
      } else {
        // Optimization: Since LRUCache maintains insertion order (updated on access),
        // the Map is sorted by lastSeen (ascending).
        break;
      }
    }

    return removed;
  }

  get size() {
    return this.seenPeers.size;
  }

  get totalUniquePeers() {
    return this.uniquePeersHLL.count();
  }

  incrementSeq() {
    return ++this.mySeq;
  }

  getSeq() {
    return this.mySeq;
  }

  // Returns a list of peers that have known IP addresses
  getPeersWithIps() {
    const peers = [];
    for (const [id, data] of this.seenPeers.entries()) {
      if (data.ip) {
        peers.push({ id, ip: data.ip });
      }
    }
    return peers;
  }
}

module.exports = { PeerManager };
