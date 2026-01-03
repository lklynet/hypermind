const fs = require('fs');
const net = require('net');
const { createFeistelGenerator, ipv4ToString } = require('./feistel');
const { signMessage, verifyPoW, verifySignature, createPublicKey } = require('../core/security');
const {
  ENABLE_IPV4_SCAN,
  SCAN_PORT,
  BOOTSTRAP_TIMEOUT,
  PEER_CACHE_ENABLED,
  PEER_CACHE_PATH,
  PEER_CACHE_MAX_AGE,
  BOOTSTRAP_PEER_IP,
  MAX_SCAN_ATTEMPTS,
  SCAN_CONCURRENCY,
  SCAN_CONNECTION_TIMEOUT,
} = require('../config/constants');
const { validateMessage } = require('../p2p/messaging');

/**
 * Bootstrap coordinator for Hypermind peer discovery.
 * 
 * Trys:
 * 1. Load and retry cached peers (fast, zero network overhead)
 * 2. Scan IPv4 address space via Feistel-permuted addresses until first peer found
 * 3. Fall back to Hyperswarm DHT discovery after BOOTSTRAP_TIMEOUT expires
 * 
 * Peer cache is stored as versioned JSON
 */

/**
 * Load peer cache from disk, validate format, and prune stale entries.
 * @returns {Array<Object>} Array of {ip, port, id, lastSeen} objects
 */
function loadPeerCache() {
  if (!PEER_CACHE_ENABLED) {
    return [];
  }

  try {
    if (!fs.existsSync(PEER_CACHE_PATH)) {
      return [];
    }

    const data = JSON.parse(fs.readFileSync(PEER_CACHE_PATH, 'utf8'));

    // Support versioned format
    const peers = data.version ? data.peers : data;

    if (!Array.isArray(peers)) {
      console.warn(`[bootstrap] Invalid cache format, skipping`);
      return [];
    }

    // Prune stale entries
    const now = Date.now();
    const fresh = peers.filter((p) => {
      const age = (now - (p.lastSeen || 0)) / 1000;
      return age < PEER_CACHE_MAX_AGE;
    });

    if (fresh.length < peers.length) {
      console.log(`[bootstrap] Pruned ${peers.length - fresh.length} stale peers from cache`);
    }

    return fresh;
  } catch (err) {
    console.warn(`[bootstrap] Failed to load cache: ${err.message}`);
    return [];
  }
}

/**
 * Save peer cache to disk in versioned format.
 * @param {Array<Object>} peers - Array of peer objects
 */
function savePeerCache(peers) {
  if (!PEER_CACHE_ENABLED) {
    return;
  }

  try {
    const data = {
      version: 1,
      timestamp: Date.now(),
      peers: peers.slice(0, 100), // Keep only 100 most recent
    };

    fs.writeFileSync(PEER_CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[bootstrap] Saved ${peers.length} peers to cache`);
  } catch (err) {
    console.warn(`[bootstrap] Failed to save cache: ${err.message}`);
  }
}

/**
 * Attempt TCP connection to a peer with short timeout.
 * @param {string} ip - IPv4 address
 * @param {number} port - Port number
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<net.Socket|null>} Connected socket or null on failure
 */
async function tryConnectToPeer(ip, port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, ip, () => {
      resolve(socket);
    });

    socket.setTimeout(timeout);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
    socket.on('error', (err) => {
      socket.destroy();
      resolve(null);
    });
  });
}

/**
 * Validate peer is running Hypermind by exchanging heartbeats.
 * Sends our heartbeat and waits for peer response, validates PoW and signature.
 * 
 * @param {string} ip - IPv4 address
 * @param {number} port - Port number
 * @param {number} timeout - Timeout in milliseconds
 * @param {Object} identity - Our identity {id, privateKey, nonce}
 * @returns {Promise<boolean>} true if valid Hypermind peer, false otherwise
 */
async function validatePeerConnection(ip, port, timeout, identity) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, ip, () => {
      const sig = signMessage(`seq:0`, identity.privateKey);
      const heartbeat = JSON.stringify({
        type: "HEARTBEAT",
        id: identity.id,
        seq: 0,
        hops: 0,
        nonce: identity.nonce,
        sig,
      }) + "\n";

      socket.write(heartbeat);

      let dataBuffer = '';
      const responseTimeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeout);

      socket.on('data', (data) => {
        dataBuffer += data.toString();
        const lines = dataBuffer.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          try {
            const msg = JSON.parse(line);

            if (!validateMessage(msg)) {
              clearTimeout(responseTimeout);
              socket.destroy();
              resolve(false);
              return;
            }

            if (msg.type !== 'HEARTBEAT') continue;

            if (!verifyPoW(msg.id, msg.nonce)) {
              clearTimeout(responseTimeout);
              socket.destroy();
              resolve(false);
              return;
            }

            if (!msg.sig) {
              clearTimeout(responseTimeout);
              socket.destroy();
              resolve(false);
              return;
            }

            try {
              const key = createPublicKey(msg.id);
              if (!verifySignature(`seq:${msg.seq}`, msg.sig, key)) {
                clearTimeout(responseTimeout);
                socket.destroy();
                resolve(false);
                return;
              }

              clearTimeout(responseTimeout);
              socket.destroy();
              resolve(true);
              return;
            } catch (e) {
              clearTimeout(responseTimeout);
              socket.destroy();
              resolve(false);
              return;
            }
          } catch (e) {
            continue;
          }
        }

        dataBuffer = lines[lines.length - 1];
      });

      socket.setTimeout(timeout);
      socket.on('timeout', () => {
        clearTimeout(responseTimeout);
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        clearTimeout(responseTimeout);
        socket.destroy();
        resolve(false);
      });

      socket.on('close', () => {
        clearTimeout(responseTimeout);
      });
    });

    socket.setTimeout(timeout);
    socket.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Retry cached peers from previous runs.
 * @returns {Promise<{ip: string, port: number, id: string}|null>} Connected peer or null
 */
async function retryCachedPeers() {
  const cached = loadPeerCache();

  if (cached.length === 0) {
    console.log(`[bootstrap] No cached peers available`);
    return null;
  }

  console.log(`[bootstrap] Attempting to reconnect to ${cached.length} cached peers...`);

  for (const peer of cached) {
    console.log(`[bootstrap] Trying cached peer ${peer.ip}:${peer.port}`);
    const socket = await tryConnectToPeer(peer.ip, peer.port, 500);

    if (socket) {
      socket.destroy();
      console.log(`[bootstrap] Successfully reconnected to cached peer ${peer.ip}`);
      return peer;
    }
  }

  console.log(`[bootstrap] All cached peers unreachable`);
  return null;
}

/**
 * Scan IPv4 address space via Feistel-permuted addresses with concurrent connections.
 * Attempts TCP connections to multiple addresses in parallel until first success.
 * 
 * @param {number} seed - Seed for Feistel permutation
 * @param {number} timeout - Overall timeout for scan (milliseconds)
 * @param {Object} identity - Our identity {id, privateKey, nonce}
 * @returns {Promise<{ip: string, port: number}|null>} First peer found or null
 */
async function scanIPv4Space(seed, timeout, identity) {
  const generator = createFeistelGenerator(seed);
  const startTime = Date.now();
  let attempts = 0;
  let found = false;
  let result = null;

  console.log(
    `[bootstrap] Starting IPv4 scan on port ${SCAN_PORT} with ${timeout}ms timeout (${SCAN_CONCURRENCY} concurrent)...`
  );

  const pendingPromises = new Map();
  const pendingSockets = new Map();
  let lastProgressLog = Date.now();

  const cleanupAllConnections = () => {
    for (const [, socket] of pendingSockets) {
      if (socket) {
        socket.destroy();
      }
    }
    pendingSockets.clear();
  };

  while (Date.now() - startTime < timeout && !found) {
    // Remove completed promises
    for (const [key, promise] of pendingPromises) {
      if (promise.settled) {
        pendingPromises.delete(key);
        pendingSockets.delete(key);
      }
    }

    // Spawn new connection attempts up to concurrency limit
    while (pendingPromises.size < SCAN_CONCURRENCY && Date.now() - startTime < timeout && !found) {
      let address = generator.next().value;
      let ip = ipv4ToString(address);

      while (shouldSkipAddress(ip)) {
        address = generator.next().value;
        ip = ipv4ToString(address);
      }

      attempts++;
      const key = `${ip}:${attempts}`;

      const promise = tryConnectToPeer(ip, SCAN_PORT, SCAN_CONNECTION_TIMEOUT).then(async (socket) => {
        promise.settled = true;
        if (socket) {
          pendingSockets.set(key, socket);
          socket.destroy();
          
          const isValid = await validatePeerConnection(ip, SCAN_PORT, 1000, identity);
          if (!isValid) {
            pendingSockets.delete(key);
            return null;
          }
          
          console.log(
            `[bootstrap] Found valid Hypermind peer at ${ip}:${SCAN_PORT} after ${attempts} attempts`
          );
          found = true;
          cleanupAllConnections();
          return { ip, port: SCAN_PORT };
        }
        pendingSockets.delete(key);
        return null;
      }).catch(() => {
        promise.settled = true;
        pendingSockets.delete(key);
        return null;
      });

      promise.settled = false;
      pendingPromises.set(key, promise);
      pendingSockets.set(key, true);
    }

    // Log progress periodically
    const now = Date.now();
    if (now - lastProgressLog >= 5000) {
      const progress = (attempts / 0x100000000) * 100;
      const elapsed = (now - startTime) / 1000;
      const rate = (attempts / elapsed).toFixed(0);
      console.log(
        `[bootstrap] Scan progress: ${progress.toFixed(4)}% (${elapsed.toFixed(1)}s, ${rate} addr/s)`
      );
      lastProgressLog = now;
    }

    // Check if any promise found a peer and capture result
    for (const promise of pendingPromises.values()) {
      if (promise.settled && promise.resolved) {
        result = promise.resolved;
        found = true;
        break;
      }
    }

    if (found && result) {
      return result;
    }

    // Yield to event loop
    await new Promise(resolve => setImmediate(resolve));
  }

  // Wait for any remaining pending promises
  const results = await Promise.allSettled(Array.from(pendingPromises.values()));
  cleanupAllConnections();

  for (const promiseResult of results) {
    if (promiseResult.status === 'fulfilled' && promiseResult.value) {
      return promiseResult.value;
    }
  }

  console.log(
    `[bootstrap] IPv4 scan timeout after ${attempts} attempts (${(
      (attempts / 0x100000000) *
      100
    ).toFixed(4)}% coverage)`
  );

  return null;
}

/**
 * Determine if an IPv4 address should be skipped during scan.
 * Skips reserved ranges to avoid unnecessary noise.
 * 
 * @param {string} ip - IPv4 address
 * @returns {boolean} true if address should be skipped
 */
function shouldSkipAddress(ip) {
  const parts = ip.split('.').map(Number);

  // Loopback (127.0.0.0/8)
  if (parts[0] === 127) return true;

  // Private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;

  // Link-local (169.254.0.0/16)
  if (parts[0] === 169 && parts[1] === 254) return true;

  // Multicast (224.0.0.0/4)
  if (parts[0] >= 224 && parts[0] <= 239) return true;

  // Reserved/experimental (240.0.0.0/4)
  if (parts[0] >= 240) return true;

  return false;
}

/**
 * Main bootstrap orchestrator: cached peers → IPv4 scan → DHT fallback.
 * 
 * This function coordinates the three-phase bootstrap strategy and is meant to be called
 * before swarm.start(). It returns immediately (non-blocking) but logs progress.
 * 
 * @param {number} seed - Random seed for Feistel permutation (e.g., process entropy)
 * @param {Object} identity - Our identity {id, privateKey, nonce}
 * @returns {Promise<void>}
 */
async function bootstrapPeers(seed, identity) {
  console.log(`[bootstrap] Starting peer bootstrap with seed: ${seed.toString(16)}`);

  // Debug phase: Direct peer IP (skip cache and scan)
  if (BOOTSTRAP_PEER_IP) {
    console.log(`[bootstrap] DEBUG MODE: Attempting direct connection to ${BOOTSTRAP_PEER_IP}:${SCAN_PORT}`);
    const isValid = await validatePeerConnection(BOOTSTRAP_PEER_IP, SCAN_PORT, 2000, identity);
    if (isValid) {
      console.log(`[bootstrap] Bootstrap complete: connected to debug peer ${BOOTSTRAP_PEER_IP}`);
      return { ip: BOOTSTRAP_PEER_IP, port: SCAN_PORT };
    }
    console.log(`[bootstrap] DEBUG: Failed to connect to ${BOOTSTRAP_PEER_IP}, falling back to normal bootstrap`);
  }

  // Phase 1: Retry cached peers
  const cachedPeer = await retryCachedPeers();
  if (cachedPeer) {
    console.log(`[bootstrap] Bootstrap complete: using cached peer ${cachedPeer.ip}`);
    return cachedPeer;
  }

  // Phase 2: Scan IPv4 space (optional, disabled by default)
  if (ENABLE_IPV4_SCAN) {
    const scannedPeer = await scanIPv4Space(seed, BOOTSTRAP_TIMEOUT, identity);
    if (scannedPeer) {
      // Save successful peer to cache for next time
      const peer = {
        ...scannedPeer,
        id: null, // Will be populated after successful handshake
        lastSeen: Date.now(),
      };
      savePeerCache([peer]);
      console.log(`[bootstrap] Bootstrap complete: found peer via IPv4 scan`);
      return peer;
    }
  }

  // Phase 3: Fall back to DHT (Hyperswarm handles this automatically)
  console.log(`[bootstrap] No peers found via cache${ENABLE_IPV4_SCAN ? ' or scan' : ''}, falling back to DHT discovery`);
  return null;
}

module.exports = {
  bootstrapPeers,
  loadPeerCache,
  savePeerCache,
  retryCachedPeers,
  scanIPv4Space,
  tryConnectToPeer,
  shouldSkipAddress,
};
