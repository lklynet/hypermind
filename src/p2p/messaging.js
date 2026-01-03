const { verifyPoW, verifySignature, createPublicKey } = require("../core/security");
const { MAX_RELAY_HOPS } = require("../config/constants");
const { BloomFilterManager } = require("../state/bloom");

class MessageHandler {
    constructor(peerManager, diagnostics, relayCallback, broadcastCallback) {
        this.peerManager = peerManager;
        this.diagnostics = diagnostics;
        this.relayCallback = relayCallback;
        this.broadcastCallback = broadcastCallback;
        this.bloomFilter = new BloomFilterManager();
        this.bloomFilter.start();
    }

    handleMessage(msg, sourceSocket) {
        if (!validateMessage(msg)) {
            return;
        }

        if (msg.type === "HEARTBEAT") {
            this.handleHeartbeat(msg, sourceSocket);
        } else if (msg.type === "LEAVE") {
            this.handleLeave(msg, sourceSocket);
        }
    }

    handleHeartbeat(msg, sourceSocket) {
        this.diagnostics.increment("heartbeatsReceived");
        const { id, seq, hops, nonce, sig } = msg;

        if (!verifyPoW(id, nonce)) {
            this.diagnostics.increment("invalidPoW");
            return;
        }

        const stored = this.peerManager.getPeer(id);
        if (stored && seq <= stored.seq) {
            this.diagnostics.increment("duplicateSeq");
            return;
        }

        if (!sig) return;

        try {
            // Check if we can accept new peers (only matters for new peers)
            if (!stored && !this.peerManager.canAcceptPeer(id)) return;

            // Derive public key on-demand from peer ID
            const key = createPublicKey(id);

            if (!verifySignature(`seq:${seq}`, sig, key)) {
                this.diagnostics.increment("invalidSig");
                return;
            }

            if (hops === 0) {
                sourceSocket.peerId = id;
            }

            const wasNew = this.peerManager.addOrUpdatePeer(id, seq);

            if (wasNew) {
                this.diagnostics.increment("newPeersAdded");
                this.broadcastCallback();
            }

            // Only relay if we haven't already relayed this message (bloom filter check)
            if (hops < MAX_RELAY_HOPS && !this.bloomFilter.hasRelayed(id, seq)) {
                this.bloomFilter.markRelayed(id, seq);
                this.diagnostics.increment("heartbeatsRelayed");
                this.relayCallback({ ...msg, hops: hops + 1 }, sourceSocket);
            }
        } catch (e) {
            return;
        }
    }

    handleLeave(msg, sourceSocket) {
        this.diagnostics.increment("leaveMessages");
        const { id, hops, sig } = msg;

        if (!sig) return;

        // Only process leave messages for peers we know about
        if (!this.peerManager.hasPeer(id)) return;

        // Derive public key on-demand from peer ID
        const key = createPublicKey(id);

        if (!verifySignature(`type:LEAVE:${id}`, sig, key)) {
            this.diagnostics.increment("invalidSig");
            return;
        }

        if (this.peerManager.hasPeer(id)) {
            this.peerManager.removePeer(id);
            this.broadcastCallback();

            // Use id:leave as key for LEAVE messages
            if (hops < MAX_RELAY_HOPS && !this.bloomFilter.hasRelayed(id, "leave")) {
                this.bloomFilter.markRelayed(id, "leave");
                this.relayCallback({ ...msg, hops: hops + 1 }, sourceSocket);
            }
        }
    }
}

const validateMessage = (msg) => {
    if (!msg || typeof msg !== 'object') return false;
    if (!msg.type) return false;

    const msgSize = JSON.stringify(msg).length;
    if (msgSize > require("../config/constants").MAX_MESSAGE_SIZE) return false;

    if (msg.type === "HEARTBEAT") {
        const allowedFields = ['type', 'id', 'seq', 'hops', 'nonce', 'sig'];
        const fields = Object.keys(msg);
        return fields.every(f => allowedFields.includes(f)) &&
            msg.id && typeof msg.seq === 'number' &&
            typeof msg.hops === 'number' && msg.nonce && msg.sig;
    }

    if (msg.type === "LEAVE") {
        const allowedFields = ['type', 'id', 'hops', 'sig'];
        const fields = Object.keys(msg);
        return fields.every(f => allowedFields.includes(f)) &&
            msg.id && typeof msg.hops === 'number' && msg.sig;
    }

    return false;
}

module.exports = { MessageHandler, validateMessage };
