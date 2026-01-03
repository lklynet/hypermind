const countEl = document.getElementById('count');
const directEl = document.getElementById('direct');
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

const updateParticles = (count) => {
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

const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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

const openDiagnostics = () => {
    document.getElementById('diagnosticsModal').classList.add('active');
}

const closeDiagnostics = () => {
    document.getElementById('diagnosticsModal').classList.remove('active');
}

document.getElementById('diagnosticsModal').addEventListener('click', (e) => {
    if (e.target.id === 'diagnosticsModal') {
        closeDiagnostics();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDiagnostics();
        closeMap();
    }
});

// Map Logic
let map = null;
let mapInitialized = false;
let peerMarkers = {}; // id -> marker
let ipCache = {}; // ip -> { lat, lon }
let lastPeerData = [];
let myLocation = null;

const fetchMyLocation = async () => {
    if (myLocation) return;
    try {
        const res = await fetch('https://ipwho.is/');
        const data = await res.json();
        if (data.success) {
            myLocation = { lat: data.latitude, lon: data.longitude, city: data.city, country: data.country };
            updateMap(lastPeerData);
        }
    } catch (e) {
        console.error('My location fetch failed', e);
    }
}

const openMap = () => {
    document.getElementById('mapModal').classList.add('active');
    if (!mapInitialized) {
        initMap();
    } else {
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }
    
    fetchMyLocation();

    if (lastPeerData.length > 0) {
        updateMap(lastPeerData);
    }
}

const closeMap = () => {
    document.getElementById('mapModal').classList.remove('active');
}

document.getElementById('mapModal').addEventListener('click', (e) => {
    if (e.target.id === 'mapModal') {
        closeMap();
    }
});

const initMap = () => {
    if (mapInitialized) return;
    
    map = L.map('map').setView([20, 0], 2);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);
    
    mapInitialized = true;
    
    setTimeout(() => {
        map.invalidateSize();
    }, 100);
}

const fetchLocation = async (ip) => {
    if (ipCache[ip]) return ipCache[ip];
    
    // Skip local IPs
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
        return null;
    }

    try {
        const res = await fetch(`https://ipwho.is/${ip}`);
        const data = await res.json();
        if (data.success) {
            const loc = { lat: data.latitude, lon: data.longitude, city: data.city, country: data.country };
            ipCache[ip] = loc;
            return loc;
        }
    } catch (e) {
        console.error('Geo fetch failed', e);
    }
    return null;
}

const updateMap = async (peers) => {
    if (!mapInitialized) return;
    if (!peers) peers = [];
    
    const currentIds = new Set(peers.map(p => p.id));
    
    // Remove old markers
    for (const id in peerMarkers) {
        if (id !== 'me' && !currentIds.has(id)) {
            map.removeLayer(peerMarkers[id]);
            delete peerMarkers[id];
        }
    }
    
    // Add/Update markers
    for (const peer of peers) {
        if (!peer.ip) continue;
        
        if (!peerMarkers[peer.id]) {
            const loc = await fetchLocation(peer.ip);
            if (loc) {
                const marker = L.circleMarker([loc.lat, loc.lon], {
                    radius: 10,
                    fillColor: "#4ade80",
                    color: "transparent",
                    weight: 0,
                    opacity: 0,
                    fillOpacity: 0.15
                }).addTo(map);
                
                marker.bindPopup(`<b>Node</b> ${peer.id.slice(-8)}<br>${loc.city}, ${loc.country}`);
                peerMarkers[peer.id] = marker;
            }
        }
    }

    // Add My Location
    if (myLocation && !peerMarkers['me']) {
        const marker = L.circleMarker([myLocation.lat, myLocation.lon], {
            radius: 6,
            fillColor: "#ffffff",
            color: "#4ade80",
            weight: 2,
            opacity: 1,
            fillOpacity: 1
        }).addTo(map);
        
        marker.bindPopup(`<b>This Node</b><br>${myLocation.city}, ${myLocation.country}`);
        peerMarkers['me'] = marker;
    }
}

const terminal = document.getElementById('terminal');
const terminalOutput = document.getElementById('terminal-output');
const terminalInput = document.getElementById('terminal-input');
const terminalToggle = document.getElementById('terminal-toggle');
const promptEl = document.querySelector('.prompt');
let myId = null;
let myChatHistory = [];

terminalToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleChat();
});

// Initialize chat state from localStorage
const initChatState = () => {
    const isCollapsed = localStorage.getItem('chatCollapsed') === 'true';
    if (isCollapsed) {
        terminal.classList.add('collapsed');
        terminalToggle.innerText = '▲';
        document.body.classList.remove('chat-active');
        document.body.classList.add('chat-collapsed');
    } else {
        terminal.classList.remove('collapsed');
        terminalToggle.innerText = '▼';
        document.body.classList.add('chat-active');
        document.body.classList.remove('chat-collapsed');
    }
};

const toggleChat = () => {
    terminal.classList.toggle('collapsed');
    const isCollapsed = terminal.classList.contains('collapsed');
    terminalToggle.innerText = isCollapsed ? '▲' : '▼';
    
    localStorage.setItem('chatCollapsed', isCollapsed);

    if (isCollapsed) {
        document.body.classList.remove('chat-active');
        document.body.classList.add('chat-collapsed');
    } else {
        document.body.classList.add('chat-active');
        document.body.classList.remove('chat-collapsed');
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }
}

const updatePromptStatus = () => {
    const now = Date.now();
    myChatHistory = myChatHistory.filter(t => now - t < 10000);
    
    if (myChatHistory.length >= 5) {
        promptEl.style.color = 'orange';
    } else {
        promptEl.style.color = '#4ade80';
    }
};

setInterval(updatePromptStatus, 500);

const getColorFromId = (id) => {
    if (!id) return '#666';
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
}

const appendMessage = (msg) => {
    const div = document.createElement('div');
    
    if (msg.type === 'SYSTEM') {
        div.className = 'msg-system';
        div.innerText = `[SYSTEM] ${msg.content}`;
    } else if (msg.type === 'CHAT') {
        const senderColor = getColorFromId(msg.sender);
        const senderName = msg.sender === myId ? 'You' : msg.sender.slice(-4);
        
        const senderSpan = document.createElement('span');
        senderSpan.className = 'msg-sender';
        senderSpan.style.color = senderColor;
        senderSpan.innerText = `[${senderName}]`;
        
        const contentSpan = document.createElement('span');
        contentSpan.className = 'msg-content';
        contentSpan.innerText = ` > ${msg.content}`;
        
        div.appendChild(senderSpan);
        div.appendChild(contentSpan);
    }
    
    terminalOutput.appendChild(div);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

terminalInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const content = terminalInput.value.trim();
        if (!content) return;
        
        terminalInput.value = '';
        
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            if (res.ok) {
                myChatHistory.push(Date.now());
                updatePromptStatus();
            } else if (res.status === 429) {
                // Force update if we hit the limit unexpectedly
                // Add a dummy timestamp to force the limit state if not already there
                if (myChatHistory.length < 5) {
                    myChatHistory.push(Date.now());
                }
                updatePromptStatus();
            }
        } catch (err) {
            console.error('Failed to send message', err);
        }
    }
});

const evtSource = new EventSource("/events");

evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'CHAT' || data.type === 'SYSTEM') {
        appendMessage(data);
        return;
    }

    if (data.chatEnabled) {
        terminal.classList.remove('hidden');
        
        // Only initialize state once when chat becomes enabled
        if (!terminal.dataset.initialized) {
            initChatState();
            terminal.dataset.initialized = 'true';
        }
    } else {
        terminal.classList.add('hidden');
        document.body.classList.remove('chat-active');
        document.body.classList.remove('chat-collapsed');
    }
    
    if (data.id) myId = data.id;

    if (data.peers) {
        lastPeerData = data.peers;
        if (mapInitialized && document.getElementById('mapModal').classList.contains('active')) {
            updateMap(data.peers);
        }
    }

    updateParticles(data.count);

    if (countEl.innerText != data.count) {
        countEl.innerText = data.count;
        countEl.classList.remove('pulse');
        void countEl.offsetWidth;
        countEl.classList.add('pulse');
    }

    directEl.innerText = data.direct;

    if (data.diagnostics) {
        const d = data.diagnostics;
        
        const formatBandwidth = (bytes) => {
            const kb = bytes / 1024;
            const mb = kb / 1024;
            const gb = mb / 1024;
            
            if (gb >= 1) {
                return gb.toFixed(2) + ' GB';
            } else if (mb >= 1) {
                return mb.toFixed(2) + ' MB';
            } else {
                return kb.toFixed(1) + ' KB';
            }
        };
        
        document.getElementById('diag-heartbeats-rx').innerText = d.heartbeatsReceived.toLocaleString();
        document.getElementById('diag-heartbeats-tx').innerText = d.heartbeatsRelayed.toLocaleString();
        document.getElementById('diag-new-peers').innerText = d.newPeersAdded.toLocaleString();
        document.getElementById('diag-dup-seq').innerText = d.duplicateSeq.toLocaleString();
        document.getElementById('diag-invalid-pow').innerText = d.invalidPoW.toLocaleString();
        document.getElementById('diag-invalid-sig').innerText = d.invalidSig.toLocaleString();
        document.getElementById('diag-bandwidth-in').innerText = formatBandwidth(d.bytesReceived);
        document.getElementById('diag-bandwidth-out').innerText = formatBandwidth(d.bytesRelayed);
        document.getElementById('diag-leave').innerText = d.leaveMessages.toLocaleString();
    }
};

evtSource.onerror = (err) => {
    // Removing console error here as it's extremely spammy in the browser console and it will reconnct automatically anyway, so pretty redundant.
};

const initialCount = parseInt(countEl.dataset.initialCount) || 0;
countEl.innerText = initialCount;
countEl.classList.add('loaded');
updateParticles(initialCount);
animate();

