import { TWO_PI } from './constants.js';
import * as state from './state.js';
import { effectsManager, triggerScreenShake } from './effects.js';
import { showAchievement, showAchievementForce } from './ui.js';

let matrixTimer = null;
let drunkTimer = null;

export function activateChaosMode() {
    if (state.chaosMode) return;
    state.setChaosMode(true);
    document.body.classList.add('chaos-mode');

    showAchievementForce('Chaos Unleashed', 'Let the madness begin!');

    // Celebratory explosion
    for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * TWO_PI;
        effectsManager.sparks.push({
            x: state.canvas.width / 2,
            y: state.canvas.height / 2,
            vx: Math.cos(angle) * (6 + Math.random() * 6),
            vy: Math.sin(angle) * (6 + Math.random() * 6),
            size: 3 + Math.random() * 3,
            life: 1.2,
            hue: Math.random() * 360
        });
    }
    triggerScreenShake(15);
}

export function toggleMatrixMode() {
    if (!state.chaosMode) return;

    state.setMatrixMode(!state.matrixMode);

    if (state.matrixMode) {
        showAchievement('Wake Up, Neo', 'The Matrix has you...');
        clearTimeout(matrixTimer);
        matrixTimer = setTimeout(() => {
            state.setMatrixMode(false);
        }, 30000);
    } else {
        clearTimeout(matrixTimer);
        showAchievement('Unplugged', 'Back to reality');
    }
}

export function toggleZenMode() {
    if (!state.chaosMode) return;

    state.setZenMode(!state.zenMode);

    if (state.zenMode) {
        for (let i = 0; i < state.particles.length; i++) {
            const p = state.particles[i];
            p.vx *= 0.1;
            p.vy *= 0.1;
        }
        state.setGravityMode(0);
        showAchievement('Zen Mode', 'Breathe... relax...');
    } else {
        showAchievement('Zen Off', 'Back to chaos!');
    }
}

export function toggleWarpMode() {
    if (!state.chaosMode) return;

    state.setWarpMode(!state.warpMode);

    if (state.warpMode) {
        for (let i = 0; i < state.particles.length; i++) {
            const p = state.particles[i];
            const angle = Math.random() * TWO_PI;
            p.vx += Math.cos(angle) * 8;
            p.vy += Math.sin(angle) * 8;
        }
        triggerScreenShake(10);
        showAchievement('WARP DRIVE!', 'Ludicrous speed engaged!');
    } else {
        showAchievement('Warp Off', 'Dropping out of hyperspace');
    }
}

export function toggleDrunkMode() {
    if (!state.chaosMode) return;

    state.setDrunkMode(!state.drunkMode);

    if (state.drunkMode) {
        showAchievement('Drunk Mode', '*hic* Everything\'s spinning...');
        clearTimeout(drunkTimer);
        drunkTimer = setTimeout(() => {
            state.setDrunkMode(false);
        }, 15000);
    } else {
        clearTimeout(drunkTimer);
        showAchievement('Sobering Up', 'Clarity returns');
    }
}

export function triggerPartyMode() {
    if (!state.chaosMode) return;

    const points = [
        { x: state.canvas.width * 0.2, y: state.canvas.height * 0.3 },
        { x: state.canvas.width * 0.8, y: state.canvas.height * 0.3 },
        { x: state.canvas.width * 0.5, y: state.canvas.height * 0.2 },
        { x: state.canvas.width * 0.3, y: state.canvas.height * 0.7 },
        { x: state.canvas.width * 0.7, y: state.canvas.height * 0.7 }
    ];

    for (const point of points) {
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * TWO_PI;
            const speed = 4 + Math.random() * 8;
            effectsManager.sparks.push({
                x: point.x,
                y: point.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                size: 3 + Math.random() * 4,
                life: 2,
                hue: Math.random() * 360
            });
        }
    }

    state.setRainbowMode(true);
    setTimeout(() => { state.setRainbowMode(false); }, 5000);

    triggerScreenShake(10);
    showAchievement('PARTY TIME!', 'Let\'s celebrate!');
}

export function triggerRaveMode() {
    if (!state.chaosMode) return;

    state.setRainbowMode(true);
    state.setDiscoMode(true);

    for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        p.vx *= 2;
        p.vy *= 2;
    }

    for (let i = 0; i < 100; i++) {
        effectsManager.sparks.push({
            x: Math.random() * state.canvas.width,
            y: Math.random() * state.canvas.height,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            size: 2 + Math.random() * 4,
            life: 1.5,
            hue: Math.random() * 360
        });
    }

    triggerScreenShake(15);
    showAchievement('RAVE MODE!', 'UNTZ UNTZ UNTZ!');

    setTimeout(() => {
        state.setRainbowMode(false);
        state.setDiscoMode(false);
    }, 8000);
}
