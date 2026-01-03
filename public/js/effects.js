import { TWO_PI } from './constants.js';
import * as state from './state.js';

export const effectsManager = {
    sparks: [],
    explosions: [],
    floatingScores: [],
    screenShake: { x: 0, y: 0, intensity: 0 },

    update() {
        // Update sparks (in-place to avoid GC)
        let writeIdx = 0;
        for (let i = 0; i < this.sparks.length; i++) {
            const spark = this.sparks[i];
            spark.x += spark.vx;
            spark.y += spark.vy;
            spark.vy += 0.15;
            spark.life -= 0.025;
            spark.size *= 0.97;
            if (spark.life > 0) {
                this.sparks[writeIdx++] = spark;
            }
        }
        this.sparks.length = writeIdx;

        // Update explosions (in-place)
        writeIdx = 0;
        for (let i = 0; i < this.explosions.length; i++) {
            const exp = this.explosions[i];
            exp.radius += exp.speed;
            exp.alpha -= 0.04;
            if (exp.alpha > 0) {
                this.explosions[writeIdx++] = exp;
            }
        }
        this.explosions.length = writeIdx;

        // Update floating scores (in-place)
        writeIdx = 0;
        for (let i = 0; i < this.floatingScores.length; i++) {
            const fs = this.floatingScores[i];
            fs.y += fs.vy;
            fs.life -= 0.02;
            if (fs.life > 0) {
                this.floatingScores[writeIdx++] = fs;
            }
        }
        this.floatingScores.length = writeIdx;

        // Decay screen shake
        this.screenShake.intensity *= 0.9;
        if (this.screenShake.intensity > 0.5) {
            this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity;
            this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity;
        } else {
            this.screenShake.x = 0;
            this.screenShake.y = 0;
        }
    },

    draw() {
        const ctx = state.ctx;

        // Draw sparks
        for (const spark of this.sparks) {
            ctx.beginPath();
            ctx.arc(spark.x, spark.y, spark.size, 0, TWO_PI);
            ctx.fillStyle = `hsla(${spark.hue}, 100%, 70%, ${spark.life})`;
            ctx.fill();
        }

        // Draw explosions
        for (const exp of this.explosions) {
            ctx.beginPath();
            ctx.arc(exp.x, exp.y, exp.radius, 0, TWO_PI);
            ctx.strokeStyle = `hsla(${exp.hue}, 100%, 70%, ${exp.alpha})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Draw floating scores
        for (const fs of this.floatingScores) {
            ctx.font = `bold ${14 + fs.multiplier * 2}px -apple-system, sans-serif`;
            ctx.fillStyle = `rgba(255, 255, 255, ${fs.life})`;
            ctx.textAlign = 'center';
            ctx.fillText(fs.text, fs.x, fs.y);

            if (fs.multiplier > 1) {
                ctx.font = '11px -apple-system, sans-serif';
                ctx.fillStyle = `rgba(255, 215, 0, ${fs.life})`;
                ctx.fillText(`x${fs.multiplier}`, fs.x + 25, fs.y);
            }
        }
    },

    spawnSparks(x, y, intensity) {
        if (!state.chaosMode) return;
        const sparkCount = Math.min(Math.floor(intensity * 3), 20);
        for (let i = 0; i < sparkCount; i++) {
            const angle = Math.random() * TWO_PI;
            const speed = intensity * (0.5 + Math.random());
            this.sparks.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 2,
                life: 1,
                hue: 50 + Math.random() * 30
            });
        }

        if (intensity > 5) {
            this.explosions.push({
                x, y,
                radius: 5,
                speed: intensity * 0.8,
                alpha: 0.7,
                hue: 60
            });
        }
    },

    addFloatingScore(x, y, points, multiplier) {
        if (!state.chaosMode) return;
        this.floatingScores.push({
            x, y,
            text: `+${points}`,
            multiplier,
            life: 1,
            vy: -2
        });
    }
};

export function triggerScreenShake(intensity) {
    if (!state.chaosMode) return;
    effectsManager.screenShake.intensity = Math.min(intensity, 15);
}
