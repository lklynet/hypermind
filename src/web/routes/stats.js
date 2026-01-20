const { ENABLE_CHAT } = require("../../config/constants");

const setupStatsRoutes = (router, dependencies) => {
    const { peerManager, swarm, diagnostics } = dependencies;

    router.get("/api/stats", (req, res) => {
        res.json({
            count: peerManager.size,
            totalUnique: peerManager.totalUniquePeers,
            direct: swarm.getSwarm().connections.size,
            id: dependencies.identity.id,
            screenname: dependencies.identity.screenname,
            diagnostics: diagnostics.getStats(),
            chatEnabled: ENABLE_CHAT,
            peers: peerManager.getPeersWithIps(),
            swarmStats: peerManager.getSwarmStats(),
        });
    });
};

module.exports = { setupStatsRoutes };
