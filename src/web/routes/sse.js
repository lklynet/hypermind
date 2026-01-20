const { ENABLE_CHAT, ENABLE_MAP } = require("../../config/constants");

const setupSSERoutes = (router, dependencies) => {
    const { identity, peerManager, swarm, sseManager, diagnostics } = dependencies;

    router.get("/events", (req, res) => {
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
            screenname: identity.screenname,
            diagnostics: diagnostics.getStats(),
            chatEnabled: ENABLE_CHAT,
            mapEnabled: ENABLE_MAP,
            peers: peerManager.getPeersWithIps(),
            swarmStats: peerManager.getSwarmStats(),
        });
        res.write(`data: ${data}\n\n`);

        req.on("close", () => {
            sseManager.removeClient(res);
        });
    });
};

module.exports = { setupSSERoutes };
