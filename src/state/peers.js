const { MAX_PEERS, PEER_TIMEOUT } = require("../config/constants");
const os = require("os");

class PeerManager {
    constructor() {
        this.seenPeers = new Map();
        this.mySeq = 0;
    }

    getAvailableRAM() {
        return os.freemem();
    }

    getTotalAvailableRAM() {
        let total = 0;
        for (const [id, data] of this.seenPeers) {
            if (data.availableRAM) {
                total += data.availableRAM;
            }
        }
        return total;
    }

    addOrUpdatePeer(id, seq, key, availableRAM = null) {
        const stored = this.seenPeers.get(id);
        const wasNew = !stored;

        this.seenPeers.set(id, {
            seq,
            lastSeen: Date.now(),
            key,
            availableRAM: availableRAM !== null ? availableRAM : (stored ? stored.availableRAM : 0),
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
        return this.seenPeers.delete(id);
    }

    hasPeer(id) {
        return this.seenPeers.has(id);
    }

    cleanupStalePeers() {
        const now = Date.now();
        let removed = 0;

        for (const [id, data] of this.seenPeers) {
            if (now - data.lastSeen > PEER_TIMEOUT) {
                this.seenPeers.delete(id);
                removed++;
            }
        }

        return removed;
    }

    get size() {
        return this.seenPeers.size;
    }

    incrementSeq() {
        return ++this.mySeq;
    }

    getSeq() {
        return this.mySeq;
    }
}

module.exports = { PeerManager };
