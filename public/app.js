const countEl = document.getElementById('count');
const directEl = document.getElementById('direct');
const totalRAMEl = document.getElementById('totalRAM');
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
    }
});

const evtSource = new EventSource("/events");

evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    updateParticles(data.count);

    if (countEl.innerText != data.count) {
        countEl.innerText = data.count;
        countEl.classList.remove('pulse');
        void countEl.offsetWidth;
        countEl.classList.add('pulse');
    }

    directEl.innerText = data.direct;

    if (data.totalRAM !== undefined) {
        const ramGB = Math.round(data.totalRAM / (1024 * 1024 * 1024));
        const ramDollars = Math.round(ramGB * 12.5);
        totalRAMEl.innerText = `${ramGB}GB = $${ramDollars.toLocaleString()}`;
    }

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

