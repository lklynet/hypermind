import { TWO_PI } from './constants.js';
import * as state from './state.js';
import { effectsManager, triggerScreenShake } from './effects.js';
import { gameState } from './game.js';
import { showAchievement } from './ui.js';

// Secret click patterns
export const secretPatterns = {
    clicks: [],
    lastClickTime: 0,

    addClick(x, y) {
        if (!state.chaosMode) return;

        const now = performance.now();
        if (now - this.lastClickTime > 1000) {
            this.clicks = [];
        }

        this.clicks.push({ x, y, time: now });
        this.lastClickTime = now;
        this.checkPatterns();

        if (this.clicks.length > 10) this.clicks.shift();
    },

    checkPatterns() {
        // Triple click - explosion
        if (this.clicks.length >= 3) {
            const last3 = this.clicks.slice(-3);
            const allClose = last3.every((c, i) => {
                if (i === 0) return true;
                const prev = last3[i - 1];
                return Math.abs(c.x - prev.x) < 30 && Math.abs(c.y - prev.y) < 30;
            });

            if (allClose && last3[2].time - last3[0].time < 600) {
                triggerLocalExplosion(last3[0].x, last3[0].y);
                this.clicks = [];
            }
        }

        // Circle pattern - black hole
        if (this.clicks.length >= 5) {
            const last5 = this.clicks.slice(-5);
            if (this.isCirclePattern(last5)) {
                activateBlackHole(this.getCenter(last5));
                this.clicks = [];
            }
        }
    },

    isCirclePattern(clicks) {
        const center = this.getCenter(clicks);
        const distances = clicks.map(c =>
            Math.sqrt((c.x - center.x) ** 2 + (c.y - center.y) ** 2)
        );
        const avgDist = distances.reduce((a, b) => a + b) / distances.length;
        return distances.every(d => Math.abs(d - avgDist) < 60) && avgDist > 60;
    },

    getCenter(clicks) {
        const sumX = clicks.reduce((a, c) => a + c.x, 0);
        const sumY = clicks.reduce((a, c) => a + c.y, 0);
        return { x: sumX / clicks.length, y: sumY / clicks.length };
    }
};

export function triggerNuke() {
    if (!state.chaosMode) return;

    const centerX = state.canvas.width / 2;
    const centerY = state.canvas.height / 2;

    for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        const dx = p.x - centerX;
        const dy = p.y - centerY;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq > 1) {
            const invDist = 1 / Math.sqrt(distanceSq);
            const force = 15;
            p.vx += dx * invDist * force;
            p.vy += dy * invDist * force;
        }
    }

    // Big explosion effect
    for (let i = 0; i < 80; i++) {
        const angle = (i / 80) * TWO_PI;
        effectsManager.sparks.push({
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * (8 + Math.random() * 8),
            vy: Math.sin(angle) * (8 + Math.random() * 8),
            size: 3 + Math.random() * 3,
            life: 1,
            hue: Math.random() * 60
        });
    }

    effectsManager.explosions.push({
        x: centerX,
        y: centerY,
        radius: 10,
        speed: 15,
        alpha: 1,
        hue: 30
    });

    triggerScreenShake(20);
    gameState.addScore(500, 'nuke');
    showAchievement('NUKE!', 'Total annihilation!');
}

export function spawnConfetti(x, y) {
    if (!state.chaosMode) return;

    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * TWO_PI;
        const speed = 3 + Math.random() * 5;
        effectsManager.sparks.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 3,
            size: 3 + Math.random() * 3,
            life: 1.5,
            hue: Math.random() * 360
        });
    }
}

export function triggerLocalExplosion(x, y) {
    if (!state.chaosMode) return;

    const maxDistanceSq = 40000; // 200^2
    for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        const dx = p.x - x;
        const dy = p.y - y;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq < maxDistanceSq && distanceSq > 1) {
            const distance = Math.sqrt(distanceSq);
            const force = (200 - distance) / 8;
            p.vx += (dx / distance) * force;
            p.vy += (dy / distance) * force;
        }
    }

    for (let i = 0; i < 40; i++) {
        const angle = Math.random() * TWO_PI;
        effectsManager.sparks.push({
            x, y,
            vx: Math.cos(angle) * (4 + Math.random() * 8),
            vy: Math.sin(angle) * (4 + Math.random() * 8),
            size: 2 + Math.random() * 3,
            life: 1,
            hue: Math.random() * 60
        });
    }

    triggerScreenShake(12);
    showAchievement('Kaboom!', 'Triple-click explosion!');
}

export function activateBlackHole(pos) {
    if (!state.chaosMode) return;

    state.setBlackHoleActive(true);
    state.setBlackHolePos(pos);

    clearTimeout(state.blackHoleTimer);
    state.setBlackHoleTimer(setTimeout(() => {
        state.setBlackHoleActive(false);
        triggerLocalExplosion(state.blackHolePos.x, state.blackHolePos.y);
    }, 5000));

    showAchievement('Event Horizon', 'You summoned a black hole!');
}

export function activateKonamiMode() {
    if (!state.chaosMode) return;

    gameState.score += 9999;
    showAchievement('Konami Code', 'You know the code!');

    for (let i = 0; i < state.particles.length; i++) {
        state.particles[i].hue = (i * 20) % 360;
    }

    for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * TWO_PI;
        effectsManager.sparks.push({
            x: state.canvas.width / 2,
            y: state.canvas.height / 2,
            vx: Math.cos(angle) * 12,
            vy: Math.sin(angle) * 12,
            size: 4,
            life: 1,
            hue: (i * 9) % 360
        });
    }
}

export function triggerYeet() {
    if (!state.chaosMode) return;

    const centerX = state.canvas.width / 2;
    const centerY = state.canvas.height / 2;

    for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        const dx = p.x - centerX;
        const dy = p.y - centerY;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq > 1) {
            const invDist = 1 / Math.sqrt(distanceSq);
            const force = 30;
            p.vx += dx * invDist * force;
            p.vy += dy * invDist * force;
        }
    }

    for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * TWO_PI;
        effectsManager.sparks.push({
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * 15,
            vy: Math.sin(angle) * 15,
            size: 4,
            life: 1,
            hue: 60
        });
    }

    triggerScreenShake(25);
    showAchievement('YEET!', 'GET OUTTA HERE!');
    gameState.addScore(250, 'yeet');
}

export function triggerReverse() {
    if (!state.chaosMode) return;

    for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        p.vx = -p.vx;
        p.vy = -p.vy;
    }

    showAchievement('REVERSE!', 'Time goes backwards!');
    gameState.addScore(100, 'reverse');
}

export function maybeSpawnGoldenParticle() {
    if (!state.chaosMode || Math.random() > 0.0005 || state.particles.length === 0) return;

    const randomParticle = state.particles[Math.floor(Math.random() * state.particles.length)];
    if (!randomParticle.isGolden) {
        randomParticle.isGolden = true;
        randomParticle.goldenTimer = 600;
    }
}
