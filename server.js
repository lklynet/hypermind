const express = require("express");
const Hyperswarm = require("hyperswarm");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const TOPIC_NAME = "hypermind-lklynet-v1";
const TOPIC = crypto.createHash("sha256").update(TOPIC_NAME).digest();

// Gossip protocol tuning
const GOSSIP_FANOUT = 10; // Relay to max 10 random peers instead of all
const HEARTBEAT_INTERVAL_FAST = 1000; // 1 second during startup
const HEARTBEAT_INTERVAL_SLOW = 15000; // 15 seconds at steady state
const STARTUP_DURATION = 120000; // Stay in fast mode for 2 minutes
const PEER_STALE_TIMEOUT = 90000; // 90 seconds before peer considered stale

// --- BLOOM FILTER FOR MESSAGE DEDUPLICATION ---
// Simple bloom filter to prevent re-relaying messages we've already seen
class BloomFilter {
  constructor(size = 10000, hashCount = 3) {
    this.size = size;
    this.hashCount = hashCount;
    this.bits = new Uint8Array(Math.ceil(size / 8));
  }

  _hash(str, seed) {
    let h = seed;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h % this.size;
  }

  add(item) {
    for (let i = 0; i < this.hashCount; i++) {
      const idx = this._hash(item, i * 0x9e3779b9);
      this.bits[idx >>> 3] |= (1 << (idx & 7));
    }
  }

  has(item) {
    for (let i = 0; i < this.hashCount; i++) {
      const idx = this._hash(item, i * 0x9e3779b9);
      if ((this.bits[idx >>> 3] & (1 << (idx & 7))) === 0) {
        return false;
      }
    }
    return true;
  }

  clear() {
    this.bits.fill(0);
  }
}

// Time-bucketed bloom filter - rotates every 30 seconds
let currentBloom = new BloomFilter();
let previousBloom = new BloomFilter();

function rotateBloomFilters() {
  previousBloom = currentBloom;
  currentBloom = new BloomFilter();
}

// Check if we've recently relayed this message
function hasRelayedMessage(id, seq) {
  const key = `${id}:${seq}`;
  return currentBloom.has(key) || previousBloom.has(key);
}

// Mark message as relayed
function markRelayed(id, seq) {
  const key = `${id}:${seq}`;
  currentBloom.add(key);
}

// Rotate bloom filters periodically
setInterval(rotateBloomFilters, 30000);

// --- HYPERLOGLOG FOR PEER COUNTING ---
// Approximate unique peer count with fixed ~1.5KB memory
// Accuracy: ~2% error rate, can count millions of peers
class HyperLogLog {
  constructor(precision = 10) {
    // 2^precision registers, precision=10 gives 1024 registers (~1KB)
    this.precision = precision;
    this.registerCount = 1 << precision;
    this.registers = new Uint8Array(this.registerCount);
    this.alphaMM = this._getAlpha() * this.registerCount * this.registerCount;
  }

  _getAlpha() {
    // Bias correction constant
    switch (this.precision) {
      case 4: return 0.673;
      case 5: return 0.697;
      case 6: return 0.709;
      default: return 0.7213 / (1 + 1.079 / this.registerCount);
    }
  }

  _hash(str) {
    // Simple 32-bit hash (good enough for HLL)
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h;
  }

  _countLeadingZeros(value, maxBits) {
    if (value === 0) return maxBits;
    let count = 0;
    while ((value & (1 << (maxBits - 1 - count))) === 0 && count < maxBits) {
      count++;
    }
    return count;
  }

  add(item) {
    const hash = this._hash(item);
    // Use first 'precision' bits for register index
    const registerIndex = hash >>> (32 - this.precision);
    // Use remaining bits to count leading zeros
    const remainingBits = hash << this.precision;
    const leadingZeros = this._countLeadingZeros(remainingBits, 32 - this.precision) + 1;
    
    // Store maximum leading zeros seen for this register
    if (leadingZeros > this.registers[registerIndex]) {
      this.registers[registerIndex] = leadingZeros;
    }
  }

  count() {
    // Harmonic mean of 2^register values
    let harmonicSum = 0;
    let zeroRegisters = 0;
    
    for (let i = 0; i < this.registerCount; i++) {
      harmonicSum += Math.pow(2, -this.registers[i]);
      if (this.registers[i] === 0) zeroRegisters++;
    }
    
    let estimate = this.alphaMM / harmonicSum;
    
    // Small range correction (linear counting)
    if (estimate <= 2.5 * this.registerCount && zeroRegisters > 0) {
      estimate = this.registerCount * Math.log(this.registerCount / zeroRegisters);
    }
    
    return Math.round(estimate);
  }
}

// Global peer counter - tracks all unique peers ever seen
const peerCounter = new HyperLogLog(10); // ~1KB, 2% error

// --- SECURITY ---
// We use Ed25519 for signatures and a PoW puzzle to prevent Sybil attacks.
// Difficulty: Hash(ID + nonce) must start with '0000'
const POW_PREFIX = "0000";

console.log("[Security] Generating Identity & Solving PoW...");
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const MY_ID = publicKey.export({ type: "spki", format: "der" }).toString("hex");
let MY_NONCE = 0;
while (true) {
  const hash = crypto
    .createHash("sha256")
    .update(MY_ID + MY_NONCE)
    .digest("hex");
  if (hash.startsWith(POW_PREFIX)) break;
  MY_NONCE++;
}
console.log(
  `[Security] Identity ready. ID: ${MY_ID.slice(0, 8)}... Nonce: ${MY_NONCE}`
);

let mySeq = 0;

const seenPeers = new Map();

const sseClients = new Set();

seenPeers.set(MY_ID, { seq: mySeq, lastSeen: Date.now() });
peerCounter.add(MY_ID); // Count ourselves

// Throttle updates to once per second
let lastBroadcast = 0;
function broadcastUpdate() {
  const now = Date.now();
  if (now - lastBroadcast < 1000) return;
  lastBroadcast = now;

  const data = JSON.stringify({
    count: peerCounter.count(), // Use HyperLogLog for total peer count
    direct: swarm.connections.size,
    id: MY_ID,
  });

  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
}

const swarm = new Hyperswarm();

swarm.on("connection", (socket) => {
  // Start adaptive heartbeat on first connection
  startHeartbeatIfNeeded();
  
  const sig = crypto
    .sign(null, Buffer.from(`seq:${mySeq}`), privateKey)
    .toString("hex");
  const hello = JSON.stringify({
    type: "HEARTBEAT",
    id: MY_ID,
    seq: mySeq,
    hops: 0,
    nonce: MY_NONCE,
    sig,
  });
  socket.write(hello);
  broadcastUpdate();

  socket.on("data", (data) => {
    try {
      const msgs = data
        .toString()
        .split("\n")
        .filter((x) => x.trim());
      for (const msgStr of msgs) {
        const msg = JSON.parse(msgStr);
        handleMessage(msg, socket);
      }
    } catch (e) {
      // console.error('Invalid message', e);
    }
  });

  socket.on("close", () => {
    if (socket.peerId && seenPeers.has(socket.peerId)) {
      seenPeers.delete(socket.peerId);
    }
    broadcastUpdate();
  });

  socket.on("error", () => {});
});

const discovery = swarm.join(TOPIC);
discovery.flushed().then(() => {
  console.log("[P2P] Joined topic:", TOPIC_NAME);
});

function handleMessage(msg, sourceSocket) {
  if (msg.type === "HEARTBEAT") {
    const { id, seq, hops, nonce, sig } = msg;

    // 1. Verify PoW
    if (!nonce) return;
    const powHash = crypto
      .createHash("sha256")
      .update(id + nonce)
      .digest("hex");
    if (!powHash.startsWith(POW_PREFIX)) return; // Invalid PoW

    // 2. Check Sequence (Optimization: Drop duplicates before expensive verify)
    const stored = seenPeers.get(id);
    if (stored && seq <= stored.seq) return; // Ignore old/duplicate messages

    // 3. Verify Signature
    if (!sig) return;
    try {
      let key;
      if (stored && stored.key) {
        key = stored.key;
      } else {
        key = crypto.createPublicKey({
          key: Buffer.from(id, "hex"),
          format: "der",
          type: "spki",
        });
      }

      const verified = crypto.verify(
        null,
        Buffer.from(`seq:${seq}`),
        key,
        Buffer.from(sig, "hex")
      );
      if (!verified) return; // Invalid Signature

      // Track unique peer in HyperLogLog counter (always, even if over MAX_PEERS)
      const prevCount = peerCounter.count();
      peerCounter.add(id);
      const countChanged = peerCounter.count() !== prevCount;

      // Update Peer
      if (hops === 0) {
        sourceSocket.peerId = id;
      }

      const now = Date.now();
      const wasNew = !stored;
      
      // Store in seenPeers only if we have room (memory limit)
      // But we still count and relay even if we can't store
      const canStore = stored || seenPeers.size < MAX_PEERS;
      if (canStore) {
        seenPeers.set(id, { seq, lastSeen: now, keyDer });
      }

      if ((wasNew && canStore) || countChanged) broadcastUpdate();

      // Only relay if we haven't already relayed this message (bloom filter check)
      if (hops < 3 && !hasRelayedMessage(id, seq)) {
        markRelayed(id, seq);
        relayMessage({ ...msg, hops: hops + 1 }, sourceSocket);
      }
    } catch (e) {
      return;
    }
  } else if (msg.type === "LEAVE") {
    const { id, hops } = msg;
    if (seenPeers.has(id)) {
      seenPeers.delete(id);
      broadcastUpdate();

      // Use id:leave as key for LEAVE messages
      if (hops < 3 && !hasRelayedMessage(id, "leave")) {
        markRelayed(id, "leave");
        relayMessage({ ...msg, hops: hops + 1 }, sourceSocket);
      }
    }
  }
}

// Fisher-Yates shuffle for random peer selection
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function relayMessage(msg, sourceSocket) {
  const data = JSON.stringify(msg) + "\n";
  
  // Get all eligible sockets (excluding source)
  const eligibleSockets = [...swarm.connections].filter(s => s !== sourceSocket);
  
  // Apply fanout limiting - only relay to GOSSIP_FANOUT random peers
  const targetSockets = eligibleSockets.length <= GOSSIP_FANOUT 
    ? eligibleSockets 
    : shuffleArray(eligibleSockets).slice(0, GOSSIP_FANOUT);
  
  for (const socket of targetSockets) {
    socket.write(data);
  }
}

// Adaptive Heartbeat - fast at startup, slows down after STARTUP_DURATION
// Timer starts when first connection is established, not at process start
let heartbeatStartTime = null;
let heartbeatStarted = false;

function getHeartbeatInterval() {
  if (!heartbeatStartTime) return HEARTBEAT_INTERVAL_FAST;
  const elapsed = Date.now() - heartbeatStartTime;
  return elapsed < STARTUP_DURATION ? HEARTBEAT_INTERVAL_FAST : HEARTBEAT_INTERVAL_SLOW;
}

function sendHeartbeat() {
  mySeq++;

  seenPeers.set(MY_ID, { seq: mySeq, lastSeen: Date.now() });

  const sig = crypto
    .sign(null, Buffer.from(`seq:${mySeq}`), privateKey)
    .toString("hex");
  const heartbeat =
    JSON.stringify({
      type: "HEARTBEAT",
      id: MY_ID,
      seq: mySeq,
      hops: 0,
      nonce: MY_NONCE,
      sig,
    }) + "\n";
  for (const socket of swarm.connections) {
    socket.write(heartbeat);
  }

  const now = Date.now();
  let changed = false;
  for (const [id, data] of seenPeers) {
    if (now - data.lastSeen > PEER_STALE_TIMEOUT) {
      seenPeers.delete(id);
      changed = true;
    }
  }

  if (changed) broadcastUpdate();
  
  // Schedule next heartbeat with adaptive interval
  setTimeout(sendHeartbeat, getHeartbeatInterval());
}

// Start heartbeat loop on first connection
function startHeartbeatIfNeeded() {
  if (!heartbeatStarted) {
    heartbeatStarted = true;
    heartbeatStartTime = Date.now();
    console.log("[P2P] First connection established, starting fast heartbeat...");
    sendHeartbeat();
  }
}

// Graceful Shutdown
function handleShutdown() {
  console.log("[P2P] Shutting down, sending goodbye...");
  const goodbye = JSON.stringify({ type: "LEAVE", id: MY_ID, hops: 0 }) + "\n";
  for (const socket of swarm.connections) {
    socket.write(goodbye);
  }

  setTimeout(() => {
    process.exit(0);
  }, 500);
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

// --- WEB SERVER ---

app.get("/", (req, res) => {
  const count = peerCounter.count(); // HyperLogLog approximate count
  const directPeers = swarm.connections.size;

  res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Hypermind</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    height: 100vh; 
                    background: #111; 
                    color: #eee; 
                    margin: 0; 
                }
                .container { text-align: center; position: relative; z-index: 10; }
                #network { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; }
                .count { font-size: 8rem; font-weight: bold; color: #4ade80; transition: color 0.2s; }
                .label { font-size: 1.5rem; color: #9ca3af; margin-top: 1rem; }
                .footer { margin-top: 2rem; font-size: 0.9rem; color: #4b5563; }
                .debug { font-size: 0.8rem; color: #333; margin-top: 1rem; }
                a { color: #4b5563; text-decoration: none; border-bottom: 1px dotted #4b5563; }
                .pulse { animation: pulse 0.5s ease-in-out; }
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.1); color: #fff; }
                    100% { transform: scale(1); }
                }
            </style>
        </head>
        <body>
            <canvas id="network"></canvas>
            <div class="container">
                <div id="count" class="count">${count}</div>
                <div class="label">Active Nodes</div>
                <div class="footer">
                    powered by <a href="https://github.com/lklynet/hypermind" target="_blank">hypermind</a>
                </div>
                <div class="debug">
                    ID: ${MY_ID.slice(0, 8)}...<br>
                    Direct Connections: <span id="direct">${directPeers}</span>
                </div>
            </div>
            <script>
                const countEl = document.getElementById('count');
                const directEl = document.getElementById('direct');
                
                // Particle System
                const canvas = document.getElementById('network');
                const ctx = canvas.getContext('2d');
                let particles = [];

                function resize() {
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;
                }
                window.addEventListener('resize', resize);
                resize();

                class Particle {
                    constructor() {
                        this.x = Math.random() * canvas.width;
                        this.y = Math.random() * canvas.height;
                        this.vx = (Math.random() - 0.5) * 1;
                        this.vy = (Math.random() - 0.5) * 1;
                        this.size = 3;
                    }

                    update() {
                        this.x += this.vx;
                        this.y += this.vy;

                        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
                    }

                    draw() {
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                        ctx.fillStyle = '#4ade80';
                        ctx.fill();
                    }
                }

                function updateParticles(count) {
                    // Limit visual particles to 500 to prevent browser crash
                    const VISUAL_LIMIT = 500;
                    const visualCount = Math.min(count, VISUAL_LIMIT);
                    
                    const currentCount = particles.length;
                    if (visualCount > currentCount) {
                        for (let i = 0; i < visualCount - currentCount; i++) {
                            particles.push(new Particle());
                        }
                    } else if (visualCount < currentCount) {
                        particles.splice(visualCount, currentCount - visualCount);
                    }
                }
                
                // Initialize with server-rendered count
                updateParticles(${count});

                function animate() {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // Draw connections
                    ctx.strokeStyle = 'rgba(74, 222, 128, 0.15)';
                    ctx.lineWidth = 1;
                    for (let i = 0; i < particles.length; i++) {
                        for (let j = i + 1; j < particles.length; j++) {
                            const dx = particles[i].x - particles[j].x;
                            const dy = particles[i].y - particles[j].y;
                            const distance = Math.sqrt(dx * dx + dy * dy);

                            if (distance < 150) {
                                ctx.beginPath();
                                ctx.moveTo(particles[i].x, particles[i].y);
                                ctx.lineTo(particles[j].x, particles[j].y);
                                ctx.stroke();
                            }
                        }
                    }

                    particles.forEach(p => {
                        p.update();
                        p.draw();
                    });

                    requestAnimationFrame(animate);
                }

                animate();

                // Use Server-Sent Events for realtime updates
                const evtSource = new EventSource("/events");
                
                evtSource.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    
                    updateParticles(data.count);

                    // Only update and animate if changed
                    if (countEl.innerText != data.count) {
                        countEl.innerText = data.count;
                        countEl.classList.remove('pulse');
                        void countEl.offsetWidth; // trigger reflow
                        countEl.classList.add('pulse');
                    }
                    
                    directEl.innerText = data.direct;
                };
                
                evtSource.onerror = (err) => {
                    console.error("EventSource failed:", err);
                };
            </script>
        </body>
        </html>
    `);
});

// SSE Endpoint
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.add(res);

  const data = JSON.stringify({
    count: peerCounter.count(),
    direct: swarm.connections.size,
    id: MY_ID,
  });
  res.write(`data: ${data}\n\n`);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

app.get("/api/stats", (req, res) => {
  res.json({
    count: peerCounter.count(),
    direct: swarm.connections.size,
    id: MY_ID,
  });
});

app.listen(PORT, () => {
  console.log(`Hypermind Node running on port ${PORT}`);
  console.log(`ID: ${MY_ID}`);
});
