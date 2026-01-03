require('dotenv').config();

const { generateIdentity } = require("./src/core/identity");
const { PeerManager } = require("./src/state/peers");
const { DiagnosticsManager } = require("./src/state/diagnostics");
const { MessageHandler } = require("./src/p2p/messaging");
const { relayMessage } = require("./src/p2p/relay");
const { SwarmManager } = require("./src/p2p/swarm");
const { SSEManager } = require("./src/web/sse");
const { createServer, startServer } = require("./src/web/server");
const { DIAGNOSTICS_INTERVAL } = require("./src/config/constants");

const main = async () => {
  const identity = generateIdentity();
  const peerManager = new PeerManager();
  const diagnostics = new DiagnosticsManager();
  const sseManager = new SSEManager();

  peerManager.addOrUpdatePeer(identity.id, peerManager.getSeq(), null);

  const broadcastUpdate = () => {
    sseManager.broadcastUpdate({
      count: peerManager.size,
      direct: swarmManager.getSwarm().connections.size,
      id: identity.id,
      diagnostics: diagnostics.getStats(),
      totalRAM: peerManager.getTotalAvailableRAM(),
    });
  };

  const messageHandler = new MessageHandler(
    peerManager,
    diagnostics,
    (msg, sourceSocket) => relayMessage(msg, sourceSocket, swarmManager.getSwarm(), diagnostics),
    broadcastUpdate
  );

  const swarmManager = new SwarmManager(
    identity,
    peerManager,
    diagnostics,
    messageHandler,
    (msg, sourceSocket) => relayMessage(msg, sourceSocket, swarmManager.getSwarm(), diagnostics),
    broadcastUpdate
  );

  await swarmManager.start();

  diagnostics.startLogging(
    () => peerManager.size,
    () => swarmManager.getSwarm().connections.size
  );

  setInterval(() => {
    broadcastUpdate();
  }, DIAGNOSTICS_INTERVAL);

  const app = createServer(identity, peerManager, swarmManager, sseManager, diagnostics);
  startServer(app, identity);

  const handleShutdown = () => {
    diagnostics.stopLogging();
    swarmManager.shutdown();
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
}

main().catch(console.error);
