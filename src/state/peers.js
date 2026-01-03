const { MAX_PEERS, PEER_TIMEOUT } = require("../config/constants");
const { LRUCache } = require("./lru");
const { HyperLogLog } = require("./hyperloglog");

class PeerManager {
	constructor() {
		this.seenPeers = new LRUCache(MAX_PEERS);
		this.uniquePeersHLL = new HyperLogLog(10);
		this.mySeq = 0;
	}

	addOrUpdatePeer(id, seq, loc = null) {
		const stored = this.seenPeers.get(id);
		const wasNew = !stored;

		// Track in HyperLogLog for total unique estimation
		this.uniquePeersHLL.add(id);

		// Validate and store location if provided
		const peerLoc =
			loc && typeof loc.lat === "number" && typeof loc.lon === "number"
				? { lat: loc.lat, lon: loc.lon, city: loc.city || null }
				: stored
				? stored.loc
				: null;

		this.seenPeers.set(id, {
			seq,
			lastSeen: Date.now(),
			loc: peerLoc,
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

	getSeenPeers() {
		return this.seenPeers;
	}

	cleanupStalePeers() {
		const now = Date.now();
		let removed = 0;

		for (const [id, data] of this.seenPeers.entries()) {
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

	get totalUniquePeers() {
		return this.uniquePeersHLL.count();
	}

	incrementSeq() {
		return ++this.mySeq;
	}

	getSeq() {
		return this.mySeq;
	}
}

module.exports = { PeerManager };
