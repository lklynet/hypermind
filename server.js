const express = require("express");
const Hyperswarm = require("hyperswarm");
const crypto = require("crypto");
const iploc = require("ip-location-api");

const app = express();

// Location state
let myLocation = null;
let locationOptIn = false;

async function initLocation() {
  try {
    await iploc.reload({ fields: ["latitude", "longitude", "city"] });
    const response = await fetch("https://api.ipify.org?format=json");
    const { ip } = await response.json();
    const loc = await iploc.lookup(ip);

    if (loc && loc.latitude && loc.longitude) {
      myLocation = {
        lat: loc.latitude,
        lon: loc.longitude,
        city: loc.city || "Unknown"
      };
      console.log("[Geo] Location ready");
    } else {
      console.log("[Geo] Could not determine location from IP");
    }
  } catch (e) {
    console.log("[Geo] Location lookup failed:", e.message);
    myLocation = null;
  }
}

initLocation();
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
const MAX_PEERS = 10000;

const sseClients = new Set();

seenPeers.set(MY_ID, { seq: mySeq, lastSeen: Date.now(), loc: null });

// Generate GeoJSON FeatureCollection of peer locations, aggregated by city
function getPeerLocations() {
  const cityGroups = new Map();

  for (const [id, data] of seenPeers) {
    if (data.loc && data.loc.lat != null && data.loc.lon != null) {
      const cityKey = data.loc.city || "Unknown";
      if (!cityGroups.has(cityKey)) {
        cityGroups.set(cityKey, {
          lat: data.loc.lat,
          lon: data.loc.lon,
          count: 0,
          hasSelf: false
        });
      }
      const group = cityGroups.get(cityKey);
      group.count++;
      if (id === MY_ID) group.hasSelf = true;
    }
  }

  const features = [];
  for (const [city, data] of cityGroups) {
    features.push({
      type: "Feature",
      properties: { city, count: data.count, hasSelf: data.hasSelf },
      geometry: { type: "Point", coordinates: [data.lon, data.lat] }
    });
  }
  return { type: "FeatureCollection", features };
}

// Throttle updates to once per second (force=true bypasses throttle)
let lastBroadcast = 0;
function broadcastUpdate(force = false) {
  const now = Date.now();
  if (!force && now - lastBroadcast < 1000) return;
  lastBroadcast = now;

  const data = JSON.stringify({
    count: seenPeers.size,
    direct: swarm.connections.size,
    id: MY_ID,
    locations: getPeerLocations(),
    optedIn: locationOptIn,
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
    loc: locationOptIn ? myLocation : null,
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
      // Invalid message format
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
    const { id, seq, hops, nonce, sig, loc } = msg;

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
        // Enforce MAX_PEERS for new peers
        if (!stored && seenPeers.size >= MAX_PEERS) return;

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

      // Update Peer
      if (hops === 0) {
        sourceSocket.peerId = id;
      }

      const now = Date.now();
      const wasNew = !stored;

      // Validate and store location if provided
      const peerLoc = loc && typeof loc.lat === "number" && typeof loc.lon === "number"
        ? { lat: loc.lat, lon: loc.lon, city: loc.city || null }
        : null;

      seenPeers.set(id, { seq, lastSeen: now, key, loc: peerLoc });

      if (wasNew) broadcastUpdate();

      if (hops < 3) {
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

  seenPeers.set(MY_ID, { seq: mySeq, lastSeen: Date.now(), loc: locationOptIn ? myLocation : null });

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
      loc: locationOptIn ? myLocation : null,
    }) + "\n";
  for (const socket of swarm.connections) {
    socket.write(heartbeat);
  }

  const now = Date.now();
  let changed = false;
  for (const [id, data] of seenPeers) {
    if (now - data.lastSeen > 15000) {
      seenPeers.delete(id);
      changed = true;
    }
  }

  if (changed) broadcastUpdate();
}, 5000);

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
            <link href="https://unpkg.com/maplibre-gl@5.0.0/dist/maplibre-gl.css" rel="stylesheet" />
            <script src="https://unpkg.com/maplibre-gl@5.0.0/dist/maplibre-gl.js"></script>
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
                .map-container {
                    position: relative;
                    width: 900px;
                    max-width: 90vw;
                    height: 400px;
                    margin: 1.5rem auto;
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid #333;
                    transition: all 0.3s ease;
                }
                .map-container.fullscreen {
                    position: fixed;
                    top: 0; left: 0;
                    width: 100vw; height: 100vh;
                    max-width: 100vw;
                    z-index: 100;
                    border-radius: 0;
                    border: none;
                    margin: 0;
                }
                #map {
                    width: 100%;
                    height: 100%;
                    filter: blur(10px);
                    transition: filter 0.5s ease;
                }
                #map.opted-in { filter: none; }
                .map-controls {
                    position: absolute;
                    top: 8px; right: 8px;
                    z-index: 10;
                    display: flex;
                    gap: 4px;
                }
                .map-btn {
                    background: rgba(17, 17, 17, 0.8);
                    border: 1px solid #4ade80;
                    color: #4ade80;
                    padding: 4px 8px;
                    cursor: pointer;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    display: none;
                }
                .map-btn.visible { display: block; }
                .optin-overlay {
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    z-index: 5;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.5);
                }
                .optin-overlay.hidden { display: none; }
                .optin-btn {
                    background: #4ade80;
                    color: #111;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 0.85rem;
                }
                .optin-btn:hover { background: #22c55e; }
                .cluster-label {
                    color: #fff;
                    font-size: 11px;
                    font-weight: bold;
                    text-shadow: 0 0 4px rgba(0,0,0,0.8);
                    pointer-events: none;
                }
            </style>
        </head>
        <body>
            <canvas id="network"></canvas>
            <div class="container">
                <div id="count" class="count">${count}</div>
                <div class="label">Active Nodes</div>
                <div class="map-container" id="mapContainer">
                    <div id="map"></div>
                    <div class="optin-overlay" id="optinOverlay">
                        <button class="optin-btn" onclick="optIn()">Enable Map</button>
                    </div>
                    <div class="map-controls">
                        <button class="map-btn" id="fullscreenBtn" onclick="toggleFullscreen()">Fullscreen</button>
                    </div>
                </div>
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

                // MapLibre Map
                const map = new maplibregl.Map({
                    container: 'map',
                    style: 'https://tiles.openfreemap.org/styles/liberty',
                    center: [0, 20],
                    zoom: 0.8,
                    interactive: true
                });

                let locationOptedIn = false;

                map.on('load', () => {
                    map.addSource('peers', {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: [] },
                        cluster: true,
                        clusterMaxZoom: 14,
                        clusterRadius: 50,
                        clusterProperties: {
                            totalCount: ['+', ['get', 'count']],
                            hasSelf: ['any', ['get', 'hasSelf']]
                        }
                    });

                    // Cluster glow
                    map.addLayer({
                        id: 'cluster-glow',
                        type: 'circle',
                        source: 'peers',
                        filter: ['has', 'point_count'],
                        paint: {
                            'circle-color': ['case', ['get', 'hasSelf'], '#4ade80', '#22d3ee'],
                            'circle-radius': ['interpolate', ['linear'], ['get', 'totalCount'], 1, 25, 50, 45, 200, 60],
                            'circle-opacity': 0.2,
                            'circle-blur': 1
                        }
                    });

                    // Cluster core dot
                    map.addLayer({
                        id: 'cluster-points',
                        type: 'circle',
                        source: 'peers',
                        filter: ['has', 'point_count'],
                        paint: {
                            'circle-color': ['case', ['get', 'hasSelf'], '#4ade80', '#22d3ee'],
                            'circle-radius': ['interpolate', ['linear'], ['get', 'totalCount'], 1, 10, 50, 20, 200, 30],
                            'circle-opacity': 0.9
                        }
                    });

                    // Individual city glow (unclustered)
                    map.addLayer({
                        id: 'city-glow',
                        type: 'circle',
                        source: 'peers',
                        filter: ['!', ['has', 'point_count']],
                        paint: {
                            'circle-color': ['case', ['get', 'hasSelf'], '#4ade80', '#22d3ee'],
                            'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 20, 10, 35, 50, 50],
                            'circle-opacity': 0.2,
                            'circle-blur': 1
                        }
                    });

                    // Individual city core dot (unclustered)
                    map.addLayer({
                        id: 'city-points',
                        type: 'circle',
                        source: 'peers',
                        filter: ['!', ['has', 'point_count']],
                        paint: {
                            'circle-color': ['case', ['get', 'hasSelf'], '#4ade80', '#22d3ee'],
                            'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 6, 10, 12, 50, 18],
                            'circle-opacity': 0.9
                        }
                    });

                    // Pulse animation - glow expands and fades
                    let pulsePhase = 0;
                    setInterval(() => {
                        pulsePhase = (pulsePhase + 0.05) % (Math.PI * 2);
                        const scale = 1 + Math.sin(pulsePhase) * 0.3;
                        const opacity = 0.25 - Math.sin(pulsePhase) * 0.15;
                        if (map.getLayer('city-glow')) {
                            map.setPaintProperty('city-glow', 'circle-opacity', Math.max(0.05, opacity));
                            map.setPaintProperty('city-glow', 'circle-radius',
                                ['interpolate', ['linear'], ['get', 'count'], 1, 20 * scale, 10, 35 * scale, 50, 50 * scale]);
                        }
                        if (map.getLayer('cluster-glow')) {
                            map.setPaintProperty('cluster-glow', 'circle-opacity', Math.max(0.05, opacity));
                            map.setPaintProperty('cluster-glow', 'circle-radius',
                                ['interpolate', ['linear'], ['get', 'totalCount'], 1, 25 * scale, 50, 45 * scale, 200, 60 * scale]);
                        }
                    }, 50);

                    // HTML markers for counts (clusters and individual cities)
                    const countMarkers = {};

                    function updateCountMarkers() {
                        const source = map.getSource('peers');
                        if (!source) return;

                        // Get visible features (includes both clusters and individual points)
                        const features = map.querySourceFeatures('peers');
                        const seenIds = new Set();

                        features.forEach(f => {
                            const coords = f.geometry.coordinates;
                            const isCluster = f.properties.cluster;
                            const count = isCluster ? f.properties.totalCount : f.properties.count;
                            const markerId = isCluster ? 'cluster-' + f.properties.cluster_id : 'city-' + f.properties.city;

                            if (!count) return;
                            seenIds.add(markerId);

                            if (!countMarkers[markerId]) {
                                const el = document.createElement('div');
                                el.className = 'cluster-label';
                                el.innerText = count;
                                countMarkers[markerId] = new maplibregl.Marker({ element: el })
                                    .setLngLat(coords)
                                    .addTo(map);
                            } else {
                                countMarkers[markerId].setLngLat(coords);
                                countMarkers[markerId].getElement().innerText = count;
                            }
                        });

                        // Remove stale markers
                        Object.keys(countMarkers).forEach(id => {
                            if (!seenIds.has(id)) {
                                countMarkers[id].remove();
                                delete countMarkers[id];
                            }
                        });
                    }

                    map.on('moveend', updateCountMarkers);
                    map.on('sourcedata', (e) => {
                        if (e.sourceId === 'peers' && e.isSourceLoaded) {
                            updateCountMarkers();
                        }
                    });
                });

                async function optIn() {
                    const res = await fetch('/api/location-optin', { method: 'POST' });
                    if (res.ok) {
                        locationOptedIn = true;
                        document.getElementById('map').classList.add('opted-in');
                        document.getElementById('optinOverlay').classList.add('hidden');
                        document.getElementById('fullscreenBtn').classList.add('visible');
                        map.resize();
                    }
                }

                function toggleFullscreen() {
                    if (!locationOptedIn) return;
                    const container = document.getElementById('mapContainer');
                    const btn = document.getElementById('fullscreenBtn');
                    container.classList.toggle('fullscreen');
                    btn.textContent = container.classList.contains('fullscreen') ? 'Exit' : 'Fullscreen';
                    map.resize();
                }

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

                    // Auto-reveal map if server already opted in
                    if (data.optedIn && !locationOptedIn) {
                        locationOptedIn = true;
                        document.getElementById('map').classList.add('opted-in');
                        document.getElementById('optinOverlay').classList.add('hidden');
                        document.getElementById('fullscreenBtn').classList.add('visible');
                    }

                    // Always update map locations (blur handles privacy before opt-in)
                    if (data.locations && map.isStyleLoaded() && map.getSource('peers')) {
                        map.getSource('peers').setData(data.locations);
                    }
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

  const initialData = JSON.stringify({
    count: seenPeers.size,
    direct: swarm.connections.size,
    id: MY_ID,
    locations: getPeerLocations(),
    optedIn: locationOptIn,
  });
  res.write(`data: ${initialData}\n\n`);

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

app.post("/api/location-optin", async (req, res) => {
  locationOptIn = true;

  // If location not ready yet, try to fetch it now
  if (!myLocation) {
    await initLocation();
  }

  // Update self location in seenPeers
  const selfData = seenPeers.get(MY_ID);
  if (selfData && myLocation) {
    selfData.loc = myLocation;
    seenPeers.set(MY_ID, selfData);
  }
  broadcastUpdate(true); // Force bypass throttle
  res.json({ success: true, location: myLocation, hasLocation: !!myLocation });
});

app.listen(PORT, () => {
  console.log(`Hypermind Node running on port ${PORT}`);
  console.log(`ID: ${MY_ID}`);
});
