const express = require("express");
const { PORT } = require("../config/constants");
const { setupRoutes } = require("./routes");

const createServer = (identity, peerManager, swarm, sseManager, diagnostics, locationManager = null) => {
    const app = express();

    setupRoutes(app, identity, peerManager, swarm, sseManager, diagnostics, locationManager);

    return app;
}

const startServer = (app, identity) => {
    app.listen(PORT, () => {
        console.log(`Hypermind Node running on port ${PORT}`);
        console.log(`ID: ${identity.id}`);
    });
}

module.exports = { createServer, startServer };
