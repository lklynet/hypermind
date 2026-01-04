const { verifyPoW, verifySignature, createPublicKey } = require("../core/security");
const { MAX_RELAY_HOPS, ENABLE_CHAT, CHAT_MAX_LENGTH, CHAT_NICK_MAX_LENGTH } = require("../config/constants");
const { BloomFilterManager } = require("../state/bloom");
const { ChatRateLimiter } = require("../state/ratelimit");

class MessageHandler {
    constructor(peerManager, diagnostics, relayCallback, broadcastCallback, chatCallback, chatSystemFn) {
        this.peerManager = peerManager;
        this.diagnostics = diagnostics;
        this.relayCallback = relayCallback;
        this.broadcastCallback = broadcastCallback;
        this.chatCallback = chatCallback;
        this.chatSystemFn = chatSystemFn;
        this.bloomFilter = new BloomFilterManager();
        this.bloomFilter.start();
        this.chatRateLimiter = new ChatRateLimiter();
    }

    handleMessage(msg, sourceSocket) {
        if (!validateMessage(msg)) {
            return;
        }

        if (msg.type === "HEARTBEAT") {
            this.handleHeartbeat(msg, sourceSocket);
        } else if (msg.type === "LEAVE") {
            this.handleLeave(msg, sourceSocket);
        } else if (msg.type === "CHAT") {
            this.handleChat(msg, sourceSocket);
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

            const getIp = (sock) => {
                if (sock.remoteAddress) return sock.remoteAddress;
                if (sock.rawStream && sock.rawStream.remoteHost) return sock.rawStream.remoteHost;
                if (sock.rawStream && sock.rawStream.remoteAddress) return sock.rawStream.remoteAddress;
                return null;
            };

            const ip = (hops === 0) ? getIp(sourceSocket) : null;
            const wasNew = this.peerManager.addOrUpdatePeer(id, seq, key, ip);

            if (wasNew) {
                this.diagnostics.increment("newPeersAdded");
                this.broadcastCallback();
                if (ENABLE_CHAT && this.chatSystemFn && hops === 0) {
                    this.chatSystemFn({
                        type: "SYSTEM",
                        content: `Connection established with Node ...${id.slice(-8)}`,
                        timestamp: Date.now()
                    });
                }
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

            if (ENABLE_CHAT && this.chatSystemFn && hops === 0) {
                this.chatSystemFn({
                    type: "SYSTEM",
                    content: `Node ...${id.slice(-8)} disconnected.`,
                    timestamp: Date.now()
                });
            }

            // Use id:leave as key for LEAVE messages
            if (hops < MAX_RELAY_HOPS && !this.bloomFilter.hasRelayed(id, "leave")) {
                this.bloomFilter.markRelayed(id, "leave");
                this.relayCallback({ ...msg, hops: hops + 1 }, sourceSocket);
            }
        }
    }

    handleChat(msg, sourceSocket) {
        if (!ENABLE_CHAT) return;

        const { id, nick, msg: content, ts, hops, nonce, sig } = msg;

        // Verify PoW
        if (!verifyPoW(id, nonce)) {
            return;
        }

        // Rate Limiting using ChatRateLimiter
        if (!this.chatRateLimiter.canSend(id)) {
            return;
        }

        // Verify signature (signed as: chat:${msg}:${ts})
        try {
            const key = createPublicKey(id);
            if (!verifySignature(`chat:${content}:${ts}`, sig, key)) {
                return;
            }
        } catch (e) {
            return;
        }

        // Check bloom filter for deduplication
        const bloomKey = `chat:${ts}`;
        if (this.bloomFilter.hasRelayed(id, bloomKey)) {
            return;
        }

        // Record the message for rate limiting
        this.chatRateLimiter.recordMessage(id);

        // Mark as relayed
        this.bloomFilter.markRelayed(id, bloomKey);

        // Send to web clients
        if (this.chatCallback) {
            this.chatCallback({
                type: 'CHAT',
                sender: id,
                nick: nick || null,
                content: content,
                timestamp: ts
            });
        }

        // Relay to other peers
        if (hops < MAX_RELAY_HOPS) {
            this.relayCallback({ ...msg, hops: hops + 1 }, sourceSocket);
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

    if (msg.type === "CHAT") {
        const allowedFields = ['type', 'id', 'nick', 'msg', 'ts', 'hops', 'nonce', 'sig'];
        const fields = Object.keys(msg);
        if (!fields.every(f => allowedFields.includes(f))) return false;
        if (!msg.id || typeof msg.id !== 'string') return false;
        if (!msg.msg || typeof msg.msg !== 'string') return false;
        if (msg.msg.length > require("../config/constants").CHAT_MAX_LENGTH) return false;
        if (typeof msg.ts !== 'number') return false;
        if (typeof msg.hops !== 'number') return false;
        if (!msg.nonce || !msg.sig) return false;
        // Nickname validation (optional, but if present must be alphanumeric)
        if (msg.nick !== null && msg.nick !== undefined) {
            if (typeof msg.nick !== 'string') return false;
            if (msg.nick.length > require("../config/constants").CHAT_NICK_MAX_LENGTH) return false;
            if (!/^[a-zA-Z0-9_]*$/.test(msg.nick)) return false;
        }
        return true;
    }

    return false;
}

module.exports = { MessageHandler, validateMessage };
