import { TWO_PI, CONNECTION_DISTANCE_SQ, VISUAL_PARTICLE_LIMIT } from './constants.js';
import * as state from './state.js';
import { Particle } from './particle.js';
import { effectsManager } from './effects.js';
import { gameState, initGameUI } from './game.js';
import { initModals } from './ui.js';
import { setupInputListeners } from './input.js';
import { maybeSpawnGoldenParticle } from './triggers.js';

// DOM elements
const countEl = document.getElementById('count');
const directEl = document.getElementById('direct');
const canvas = document.getElementById('network');

// Diagnostics elements
const diagElements = {
    heartbeatsRx: document.getElementById('diag-heartbeats-rx'),
    heartbeatsTx: document.getElementById('diag-heartbeats-tx'),
    newPeers: document.getElementById('diag-new-peers'),
    dupSeq: document.getElementById('diag-dup-seq'),
    invalidPow: document.getElementById('diag-invalid-pow'),
    invalidSig: document.getElementById('diag-invalid-sig'),
    bandwidthIn: document.getElementById('diag-bandwidth-in'),
    bandwidthOut: document.getElementById('diag-bandwidth-out'),
    leave: document.getElementById('diag-leave')
};

// Initialize canvas
state.initCanvas(canvas);

// Initialize UI modules
initModals({
    diagnosticsModal: document.getElementById('diagnosticsModal'),
    helpModal: document.getElementById('helpModal')
});

initGameUI({
    scoreEl: document.getElementById('score'),
    comboEl: document.getElementById('combo'),
    highScoreEl: document.getElementById('highScore')
});

// Resize handler
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

// Set up input listeners
setupInputListeners(canvas);

// Matrix rain effect
let matrixFrame = 0;

function drawMatrixRain() {
    if (!state.matrixMode) return;
    if (++matrixFrame % 3 !== 0) return;

    state.ctx.font = '14px monospace';
    state.ctx.fillStyle = 'rgba(0, 255, 0, 0.08)';

    for (let i = 0; i < canvas.width; i += 25) {
        const char = String.fromCharCode(0x30A0 + Math.random() * 96);
        state.ctx.fillText(char, i, Math.random() * canvas.height);
    }
}

// Black hole effect
function drawBlackHole() {
    if (!state.blackHoleActive || !state.blackHolePos) return;

    const gradient = state.ctx.createRadialGradient(
        state.blackHolePos.x, state.blackHolePos.y, 0,
        state.blackHolePos.x, state.blackHolePos.y, 60
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
    gradient.addColorStop(0.5, 'rgba(75, 0, 130, 0.5)');
    gradient.addColorStop(1, 'rgba(75, 0, 130, 0)');

    state.ctx.beginPath();
    state.ctx.arc(state.blackHolePos.x, state.blackHolePos.y, 60, 0, TWO_PI);
    state.ctx.fillStyle = gradient;
    state.ctx.fill();
}

// Collision handling
function handleCollisions() {
    const particles = state.particles;
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const p1 = particles[i];
            const p2 = particles[j];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const distanceSq = dx * dx + dy * dy;
            const minDistance = p1.size + p2.size;
            const minDistanceSq = minDistance * minDistance;

            if (distanceSq < minDistanceSq && distanceSq > 0) {
                const distance = Math.sqrt(distanceSq);
                resolveCollision(p1, p2, dx, dy, distance, minDistance);
            }
        }
    }
}

function resolveCollision(p1, p2, dx, dy, distance, minDistance) {
    const nx = dx / distance;
    const ny = dy / distance;

    const dvx = p1.vx - p2.vx;
    const dvy = p1.vy - p2.vy;
    const dvn = dvx * nx + dvy * ny;

    if (dvn > 0) return;

    const restitution = 0.85;
    const massSum = p1.mass + p2.mass;
    const impulse = -(1 + restitution) * dvn / massSum;

    if (!p1.isDragged) {
        p1.vx += impulse * p2.mass * nx;
        p1.vy += impulse * p2.mass * ny;
    }
    if (!p2.isDragged) {
        p2.vx -= impulse * p1.mass * nx;
        p2.vy -= impulse * p1.mass * ny;
    }

    const overlap = minDistance - distance;
    const separationX = overlap * nx * 0.5;
    const separationY = overlap * ny * 0.5;

    if (!p1.isDragged) {
        p1.x -= separationX;
        p1.y -= separationY;
    }
    if (!p2.isDragged) {
        p2.x += separationX;
        p2.y += separationY;
    }

    const collisionSpeed = Math.abs(dvn);

    if (collisionSpeed > 1.5) {
        const collisionX = (p1.x + p2.x) / 2;
        const collisionY = (p1.y + p2.y) / 2;

        effectsManager.spawnSparks(collisionX, collisionY, collisionSpeed);

        if (state.chaosMode) {
            p1.glowIntensity = Math.min(collisionSpeed / 4, 1);
            p2.glowIntensity = Math.min(collisionSpeed / 4, 1);
            gameState.addScore(Math.floor(collisionSpeed * 5), 'collision');

            if (collisionSpeed > 6) {
                effectsManager.screenShake.intensity = Math.min(collisionSpeed * 0.6, 15);
            }
        }
    }
}

// Mouse repulsion/attraction
function applyMouseRepulsion() {
    if (!state.interactionState.isMouseDown || state.interactionState.isDragging) return;

    const repulsionRadius = 120;
    const repulsionRadiusSq = repulsionRadius * repulsionRadius;
    const repulsionStrength = 0.8;

    for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        if (p.isDragged) continue;

        const dx = p.x - state.interactionState.mouseX;
        const dy = p.y - state.interactionState.mouseY;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq < repulsionRadiusSq && distanceSq > 0) {
            const distance = Math.sqrt(distanceSq);
            const force = (repulsionRadius - distance) / repulsionRadius * repulsionStrength;
            p.vx += (dx / distance) * force;
            p.vy += (dy / distance) * force;
        }
    }
}

function applyMouseAttraction() {
    if (!state.isRightMouseDown || !state.chaosMode) return;

    const attractRadius = 200;
    const attractRadiusSq = attractRadius * attractRadius;
    const minDistSq = 400;
    const attractStrength = 0.4;

    for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        if (p.isDragged) continue;

        const dx = state.interactionState.mouseX - p.x;
        const dy = state.interactionState.mouseY - p.y;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq < attractRadiusSq && distanceSq > minDistSq) {
            const distance = Math.sqrt(distanceSq);
            const force = (attractRadius - distance) / attractRadius * attractStrength;
            p.vx += (dx / distance) * force;
            p.vy += (dy / distance) * force;
        }
    }
}

// Update particle count
function updateParticles(count) {
    const visualCount = Math.min(count, VISUAL_PARTICLE_LIMIT);
    const currentCount = state.particles.length;

    if (visualCount > currentCount) {
        const newParticles = [...state.particles];
        for (let i = 0; i < visualCount - currentCount; i++) {
            newParticles.push(new Particle());
        }
        state.setParticles(newParticles);
    } else if (visualCount < currentCount) {
        state.setParticles(state.particles.slice(0, visualCount));
    }
}

// Main animation loop
function animate() {
    const ctx = state.ctx;

    ctx.save();
    ctx.translate(effectsManager.screenShake.x, effectsManager.screenShake.y);
    ctx.clearRect(-20, -20, canvas.width + 40, canvas.height + 40);

    drawMatrixRain();
    drawBlackHole();

    // Connection lines
    ctx.lineWidth = 1;
    for (let i = 0; i < state.particles.length; i++) {
        for (let j = i + 1; j < state.particles.length; j++) {
            const dx = state.particles[i].x - state.particles[j].x;
            const dy = state.particles[i].y - state.particles[j].y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq < CONNECTION_DISTANCE_SQ) {
                let alpha = 0.15;
                if (state.chaosMode) {
                    const maxSpeed = Math.max(state.particles[i].speed, state.particles[j].speed);
                    alpha = 0.15 + Math.min(maxSpeed * 0.03, 0.25);
                }
                ctx.strokeStyle = `rgba(74, 222, 128, ${alpha})`;
                ctx.beginPath();
                ctx.moveTo(state.particles[i].x, state.particles[i].y);
                ctx.lineTo(state.particles[j].x, state.particles[j].y);
                ctx.stroke();
            }
        }
    }

    handleCollisions();
    applyMouseRepulsion();
    applyMouseAttraction();

    // Update disco hue
    if (state.discoMode) {
        state.setDiscoHue((state.discoHue + 5) % 360);
    }

    // Update and draw particles
    if (state.freezeMode) {
        for (let i = 0; i < state.particles.length; i++) {
            state.particles[i].draw();
        }
    } else if (state.slowMotion) {
        const doUpdate = Math.random() > 0.7;
        for (let i = 0; i < state.particles.length; i++) {
            const p = state.particles[i];
            if (doUpdate) p.update();
            p.draw();
        }
    } else {
        for (let i = 0; i < state.particles.length; i++) {
            const p = state.particles[i];
            p.update();
            p.draw();
        }
    }

    // Disco flash effect
    if (state.discoMode && state.chaosMode) {
        ctx.fillStyle = `hsla(${state.discoHue}, 100%, 50%, 0.03)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Chaos mode extras
    if (state.chaosMode) {
        effectsManager.update();
        effectsManager.draw();
        gameState.update();
        maybeSpawnGoldenParticle();
    }

    ctx.restore();
    requestAnimationFrame(animate);
}

// Bandwidth formatting
function formatBandwidth(bytes) {
    const kb = bytes / 1024;
    const mb = kb / 1024;
    const gb = mb / 1024;

    if (gb >= 1) return gb.toFixed(2) + ' GB';
    if (mb >= 1) return mb.toFixed(2) + ' MB';
    return kb.toFixed(1) + ' KB';
}

// SSE connection
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

    if (data.diagnostics) {
        const d = data.diagnostics;
        diagElements.heartbeatsRx.innerText = d.heartbeatsReceived.toLocaleString();
        diagElements.heartbeatsTx.innerText = d.heartbeatsRelayed.toLocaleString();
        diagElements.newPeers.innerText = d.newPeersAdded.toLocaleString();
        diagElements.dupSeq.innerText = d.duplicateSeq.toLocaleString();
        diagElements.invalidPow.innerText = d.invalidPoW.toLocaleString();
        diagElements.invalidSig.innerText = d.invalidSig.toLocaleString();
        diagElements.bandwidthIn.innerText = formatBandwidth(d.bytesReceived);
        diagElements.bandwidthOut.innerText = formatBandwidth(d.bytesRelayed);
        diagElements.leave.innerText = d.leaveMessages.toLocaleString();
    }
};

evtSource.onerror = () => {
    // SSE reconnects automatically
};

// Initialize
const initialCount = parseInt(countEl.dataset.initialCount) || 0;
countEl.innerText = initialCount;
countEl.classList.add('loaded');
updateParticles(initialCount);
animate();
