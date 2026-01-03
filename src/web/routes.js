const express = require("express");
const fs = require("fs");
const path = require("path");

const HTML_TEMPLATE = fs.readFileSync(
    path.join(__dirname, "../../public/index.html"),
    "utf-8"
);

const setupRoutes = (app, identity, peerManager, swarm, sseManager, diagnostics) => {
    app.get("/", (req, res) => {
        const count = peerManager.size;
        const directPeers = swarm.getSwarm().connections.size;

        const html = HTML_TEMPLATE
            .replace(/\{\{COUNT\}\}/g, count)
            .replace(/\{\{ID\}\}/g, identity.id.slice(0, 8) + "...")
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
        });
    });

    app.use(express.static(path.join(__dirname, "../../public")));
}

module.exports = { setupRoutes };
