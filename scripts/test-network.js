const { PORT } = require("../src/config/constants");

const SERVER_READY_TIMEOUT = 30000;
const PEER_DISCOVERY_TIMEOUT = 60000;
const POLL_INTERVAL = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchStats() {
  const response = await fetch(`http://localhost:${PORT}/api/stats`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function waitForServer() {
  const start = Date.now();
  console.log("Waiting for server to be ready...");

  while (Date.now() - start < SERVER_READY_TIMEOUT) {
    try {
      await fetchStats();
      console.log("Server is ready");
      return true;
    } catch {
      await sleep(POLL_INTERVAL);
    }
  }

  throw new Error(`Server not available within ${SERVER_READY_TIMEOUT / 1000} seconds`);
}

async function waitForPeers() {
  const start = Date.now();
  console.log("Waiting for peer discovery...");

  while (Date.now() - start < PEER_DISCOVERY_TIMEOUT) {
    const stats = await fetchStats();
    const elapsed = Math.floor((Date.now() - start) / 1000);
    console.log(`[${elapsed}s] count=${stats.count}, direct=${stats.direct}`);

    if (stats.count > 1) {
      console.log(`\nSuccess: Found ${stats.count} peers in the network`);
      console.log("Final stats:", JSON.stringify(stats, null, 2));
      return true;
    }

    await sleep(POLL_INTERVAL);
  }

  const finalStats = await fetchStats();
  throw new Error(
    `Failed to discover peers within ${PEER_DISCOVERY_TIMEOUT / 1000} seconds\n` +
    `Final stats: ${JSON.stringify(finalStats, null, 2)}`
  );
}

async function main() {
  try {
    await waitForServer();
    await waitForPeers();
    process.exit(0);
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

main();
