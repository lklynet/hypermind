const express = require("express");
const Hyperswarm = require("hyperswarm");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const TOPIC_NAME = "hypermind-lklynet-v1";
const TOPIC = crypto.createHash("sha256").update(TOPIC_NAME).digest();

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

function broadcastUpdate() {
  const data = JSON.stringify({
    count: seenPeers.size,
    direct: swarm.connections.size,
    id: MY_ID,
  });

  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
}

const swarm = new Hyperswarm();

swarm.on("connection", (socket) => {
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

    // 2. Verify Signature
    if (!sig) return;
    try {
      const key = crypto.createPublicKey({
        key: Buffer.from(id, "hex"),
        format: "der",
        type: "spki",
      });
      const verified = crypto.verify(
        null,
        Buffer.from(`seq:${seq}`),
        key,
        Buffer.from(sig, "hex")
      );
      if (!verified) return; // Invalid Signature
    } catch (e) {
      return;
    }

    if (hops === 0) {
      sourceSocket.peerId = id;
    }

    const now = Date.now();
    const stored = seenPeers.get(id);

    let shouldUpdate = false;

    if (!stored) {
      // New peer
      shouldUpdate = true;
    } else if (seq > stored.seq) {
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      const wasNew = !stored;
      seenPeers.set(id, { seq, lastSeen: now });

      if (wasNew) broadcastUpdate();

      if (hops < 3) {
        relayMessage({ ...msg, hops: hops + 1 }, sourceSocket);
      }
    }
  } else if (msg.type === "LEAVE") {
    const { id, hops } = msg;
    if (seenPeers.has(id)) {
      seenPeers.delete(id);
      broadcastUpdate();

      if (hops < 3) {
        relayMessage({ ...msg, hops: hops + 1 }, sourceSocket);
      }
    }
  }
}

function relayMessage(msg, sourceSocket) {
  const data = JSON.stringify(msg) + "\n";
  for (const socket of swarm.connections) {
    if (socket !== sourceSocket) {
      socket.write(data);
    }
  }
}

// Periodic Heartbeat
setInterval(() => {
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
    if (now - data.lastSeen > 2500) {
      seenPeers.delete(id);
      changed = true;
    }
  }

  if (changed) broadcastUpdate();
}, 500);

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
  const count = seenPeers.size;
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
                    const currentCount = particles.length;
                    if (count > currentCount) {
                        for (let i = 0; i < count - currentCount; i++) {
                            particles.push(new Particle());
                        }
                    } else if (count < currentCount) {
                        particles.splice(count, currentCount - count);
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
    count: seenPeers.size,
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
    count: seenPeers.size,
    direct: swarm.connections.size,
    id: MY_ID,
  });
});

app.listen(PORT, () => {
  console.log(`Hypermind Node running on port ${PORT}`);
  console.log(`ID: ${MY_ID}`);
});
