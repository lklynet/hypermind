const { MAX_PEERS, PEER_TIMEOUT } = require("../config/constants");
const { LRUCache } = require("./lru");
const { HyperLogLog } = require("./hyperloglog");

class PeerManager {
    constructor() {
        this.seenPeers = new LRUCache(MAX_PEERS);
        this.uniquePeersHLL = new HyperLogLog(10);
        this.mySeq = 0;
        // Incremental swarm stats tracking
        this._swarmTotalRam = 0;
        this._swarmTotalCores = 0;
        this._peersWithHardware = 0;
    }

    addOrUpdatePeer(id, seq, ip = null, hardware = null) {
        const stored = this.seenPeers.get(id);

        // If we have a stored peer, only update if the new sequence is higher
        if (stored && seq <= stored.seq) {
            return false;
        }

        const wasNew = !stored;

        // Track in HyperLogLog for total unique estimation
        this.uniquePeersHLL.add(id);

        // Update incremental swarm stats
        if (stored && stored.hardware) {
            this._swarmTotalRam -= stored.hardware.ram;
            this._swarmTotalCores -= stored.hardware.cores;
            this._peersWithHardware--;
        }
        if (hardware) {
            this._swarmTotalRam += hardware.ram;
            this._swarmTotalCores += hardware.cores;
            this._peersWithHardware++;
        }

        this.seenPeers.set(id, {
            seq,
            lastSeen: Date.now(),
            ip: ip || (stored ? stored.ip : null),
            // Only store hardware if explicitly provided (fixes stale data issue)
            hardware: hardware || null,
        });

        return wasNew;
    }

    canAcceptPeer(id) {
        if (this.seenPeers.has(id)) return true;
        return this.seenPeers.size < MAX_PEERS;
    }

    getPeer(id) {
        return this.seenPeers.get(id);
    }

    removePeer(id) {
        const stored = this.seenPeers.get(id);
        if (stored && stored.hardware) {
            this._swarmTotalRam -= stored.hardware.ram;
            this._swarmTotalCores -= stored.hardware.cores;
            this._peersWithHardware--;
        }
        return this.seenPeers.delete(id);
    }

    hasPeer(id) {
        return this.seenPeers.has(id);
    }

    cleanupStalePeers() {
        const now = Date.now();
        let removed = 0;

        for (const [id, data] of this.seenPeers.entries()) {
            if (now - data.lastSeen > PEER_TIMEOUT) {
                if (data.hardware) {
                    this._swarmTotalRam -= data.hardware.ram;
                    this._swarmTotalCores -= data.hardware.cores;
                    this._peersWithHardware--;
                }
                this.seenPeers.delete(id);
                removed++;
            } else {
                // Optimization: Since LRUCache maintains insertion order (updated on access),
                // the Map is sorted by lastSeen (ascending).
                // If we find a non-stale peer, all subsequent peers are also non-stale.
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

    getPeersWithIps() {
        const peers = [];
        for (const [id, data] of this.seenPeers.entries()) {
            if (data.ip) {
                peers.push({ id, ip: data.ip });
            }
        }
        return peers;
    }

    getSwarmStats() {
        // O(1) - uses incrementally maintained totals
        return {
            totalRam: Math.round(this._swarmTotalRam * 10) / 10,
            totalCores: this._swarmTotalCores,
            peersWithHardware: this._peersWithHardware,
        };
    }
}

module.exports = { PeerManager };
