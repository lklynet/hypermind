import * as state from './state.js';
import { effectsManager, triggerScreenShake } from './effects.js';
import { showAchievement } from './ui.js';
import { spawnConfetti } from './triggers.js';

// DOM elements (set by main.js)
let scoreEl = null;
let comboEl = null;
let highScoreEl = null;

export function initGameUI(elements) {
    scoreEl = elements.scoreEl;
    comboEl = elements.comboEl;
    highScoreEl = elements.highScoreEl;
}

export const gameState = {
    score: 0,
    displayScore: 0,
    combo: 0,
    lastInteractionTime: 0,
    comboTimeout: 2000,
    highScore: parseInt(localStorage.getItem('hypermindHighScore')) || 0,
    achievements: JSON.parse(localStorage.getItem('hypermindAchievements')) || {},
    totalCollisions: 0,
    totalThrows: 0,
    maxCombo: 0,

    addScore(points, type) {
        if (!state.chaosMode) return;

        const now = performance.now();

        if (now - this.lastInteractionTime < this.comboTimeout) {
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);

            // Confetti on milestone combos
            if (this.combo === 10 || this.combo === 25 || this.combo === 50 || this.combo === 100) {
                spawnConfetti(state.canvas.width / 2, state.canvas.height / 2);
                if (this.combo >= 25) {
                    triggerScreenShake(this.combo / 5);
                }
            }
        } else {
            this.combo = 1;
        }

        const multiplier = Math.min(this.combo, 10);
        const totalPoints = points * multiplier;

        this.score += totalPoints;
        this.lastInteractionTime = now;

        if (type === 'collision') this.totalCollisions++;
        if (type === 'throw' || type === 'powerThrow') this.totalThrows++;

        effectsManager.addFloatingScore(
            state.interactionState.mouseX || state.canvas.width / 2,
            state.interactionState.mouseY || state.canvas.height / 2,
            totalPoints,
            multiplier
        );

        this.checkAchievements();
    },

    update() {
        if (!state.chaosMode) return;

        const diff = this.score - this.displayScore;
        this.displayScore += diff * 0.1;

        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('hypermindHighScore', this.highScore);
        }

        if (performance.now() - this.lastInteractionTime > this.comboTimeout) {
            this.combo = 0;
        }

        this.updateUI();
    },

    updateUI() {
        if (scoreEl) scoreEl.textContent = Math.floor(this.displayScore).toLocaleString();
        if (highScoreEl) highScoreEl.textContent = this.highScore.toLocaleString();

        if (comboEl) {
            if (this.combo > 1) {
                comboEl.textContent = `${this.combo}x COMBO`;
                comboEl.style.opacity = '1';
            } else {
                comboEl.style.opacity = '0';
            }
        }
    },

    checkAchievements() {
        const checks = [
            { id: 'firstBlood', check: () => this.totalCollisions >= 1, title: 'First Blood', desc: 'Cause your first collision' },
            { id: 'chainReaction', check: () => this.combo >= 10, title: 'Chain Reaction', desc: 'Get a 10x combo' },
            { id: 'centurion', check: () => this.totalCollisions >= 100, title: 'Centurion', desc: '100 total collisions' },
            { id: 'pitcher', check: () => this.totalThrows >= 50, title: 'The Pitcher', desc: 'Throw 50 particles' },
            { id: 'highRoller', check: () => this.score >= 10000, title: 'High Roller', desc: 'Score 10,000 points' },
            { id: 'comboKing', check: () => this.maxCombo >= 25, title: 'Combo King', desc: '25x combo' },
            { id: 'legend', check: () => this.score >= 100000, title: 'Legend', desc: 'Score 100,000 points' }
        ];

        for (const ach of checks) {
            if (!this.achievements[ach.id] && ach.check()) {
                this.achievements[ach.id] = true;
                localStorage.setItem('hypermindAchievements', JSON.stringify(this.achievements));
                showAchievement(ach.title, ach.desc);
            }
        }
    }
};
