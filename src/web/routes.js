const express = require("express");
const fs = require("fs");
const path = require("path");
const { ENABLE_CHAT, CHAT_MAX_LENGTH, CHAT_NICK_MAX_LENGTH } = require("../config/constants");
const { signMessage } = require("../core/security");
const { ChatRateLimiter } = require("../state/ratelimit");

const HTML_TEMPLATE = fs.readFileSync(
    path.join(__dirname, "../../public/index.html"),
    "utf-8"
);

const chatRateLimiter = new ChatRateLimiter();

const setupRoutes = (app, identity, peerManager, swarm, sseManager, diagnostics) => {
    app.use(express.json());

    app.get("/", (req, res) => {
        const count = peerManager.size;
        const directPeers = swarm.getSwarm().connections.size;

        const html = HTML_TEMPLATE
            .replace(/\{\{COUNT\}\}/g, count)
            .replace(/\{\{ID\}\}/g, "..." + identity.id.slice(-8))
            .replace(/\{\{DIRECT\}\}/g, directPeers);

        res.send(html);
    });

    app.get("/events", (req, res) => {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        sseManager.addClient(res);

        const data = JSON.stringify({
            count: peerManager.size,
            totalUnique: peerManager.totalUniquePeers,
            direct: swarm.getSwarm().connections.size,
            id: identity.id,
            diagnostics: diagnostics.getStats(),
            chatEnabled: ENABLE_CHAT,
            peers: peerManager.getPeersWithIps()
        });
        res.write(`data: ${data}\n\n`);

        req.on("close", () => {
            sseManager.removeClient(res);
        });
    });

    app.get("/api/stats", (req, res) => {
        res.json({
            count: peerManager.size,
            totalUnique: peerManager.totalUniquePeers,
            direct: swarm.getSwarm().connections.size,
            id: identity.id,
            diagnostics: diagnostics.getStats(),
            chatEnabled: ENABLE_CHAT,
            peers: peerManager.getPeersWithIps()
        });
    });

    app.post("/api/chat", (req, res) => {
        if (!ENABLE_CHAT) {
            return res.status(403).json({ error: "Chat disabled" });
        }

        const { msg: content, nick } = req.body;

        // Validate content
        if (!content || typeof content !== 'string' || content.length === 0) {
            return res.status(400).json({ error: "Message required" });
        }
        if (content.length > CHAT_MAX_LENGTH) {
            return res.status(400).json({ error: `Message too long (max ${CHAT_MAX_LENGTH} chars)` });
        }

        // Validate nickname if provided
        if (nick !== null && nick !== undefined) {
            if (typeof nick !== 'string' || nick.length > CHAT_NICK_MAX_LENGTH) {
                return res.status(400).json({ error: "Invalid nickname" });
            }
            if (!/^[a-zA-Z0-9_]*$/.test(nick)) {
                return res.status(400).json({ error: "Nickname must be alphanumeric" });
            }
        }

        // Check rate limit
        if (!chatRateLimiter.canSend(identity.id)) {
            const cooldown = chatRateLimiter.getTimeUntilAllowed(identity.id);
            return res.status(429).json({ 
                error: "Rate limited", 
                cooldown: cooldown 
            });
        }

        // Record the message
        chatRateLimiter.recordMessage(identity.id);

        const ts = Date.now();
        const sig = signMessage(`chat:${content}:${ts}`, identity.privateKey);

        const chatMsg = {
            type: "CHAT",
            id: identity.id,
            nick: nick || null,
            msg: content,
            ts: ts,
            hops: 0,
            nonce: identity.nonce,
            sig: sig
        };

        // Broadcast to P2P network
        swarm.broadcastChat(chatMsg);

        // Broadcast to local web clients
        sseManager.broadcast({
            type: 'CHAT',
            sender: identity.id,
            nick: nick || null,
            content: content,
            timestamp: ts
        });

        res.json({ success: true, cooldown: chatRateLimiter.getTimeUntilAllowed(identity.id) });
    });

    app.use(express.static(path.join(__dirname, "../../public")));
}

module.exports = { setupRoutes };
