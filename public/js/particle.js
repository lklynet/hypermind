import { TWO_PI, TRAIL_MAX_LENGTH } from './constants.js';
import * as state from './state.js';

export class Particle {
    constructor() {
        this.x = Math.random() * state.canvas.width;
        this.y = Math.random() * state.canvas.height;
        this.vx = (Math.random() - 0.5) * 1;
        this.vy = (Math.random() - 0.5) * 1;
        this.size = 3 + Math.random() * 3;
        this.mass = this.size * this.size;
        this.speed = 0;
        this.isDragged = false;
        this.glowIntensity = 0;
        this.hue = 140;
        this.trail = new Array(TRAIL_MAX_LENGTH);
        this.trailIndex = 0;
        this.trailLength = 0;
        this.isGolden = false;
        this.goldenTimer = 0;
    }

    update() {
        if (this.isDragged) {
            this.vx = 0;
            this.vy = 0;
            return;
        }

        // Black hole gravity
        if (state.blackHoleActive && state.blackHolePos) {
            const dx = state.blackHolePos.x - this.x;
            const dy = state.blackHolePos.y - this.y;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq > 400) {
                const invDist = 1 / Math.sqrt(distanceSq);
                const force = 400 * invDist * invDist;
                this.vx += dx * invDist * force;
                this.vy += dy * invDist * force;
            }
        }

        // Matrix mode - fall down
        if (state.matrixMode) {
            this.vy += 0.05;
            this.hue = 120;
        }

        // Gravity modes
        if (state.chaosMode && state.gravityMode === 1) {
            this.vy += 0.15;
        } else if (state.chaosMode && state.gravityMode === 2) {
            this.vy -= 0.1;
        }

        // Drunk mode - random wobble
        if (state.chaosMode && state.drunkMode) {
            this.vx += (Math.random() - 0.5) * 0.5;
            this.vy += (Math.random() - 0.5) * 0.5;
        }

        // Zen mode - gentle drift
        if (state.chaosMode && state.zenMode && this.speed > 0.3) {
            this.vx *= 0.98;
            this.vy *= 0.98;
        }

        // Warp mode - continuous random acceleration
        if (state.chaosMode && state.warpMode) {
            const angle = Math.random() * TWO_PI;
            this.vx += Math.cos(angle) * 0.3;
            this.vy += Math.sin(angle) * 0.3;
        }

        // Vortex mode - spiral toward center
        if (state.chaosMode && state.vortexMode) {
            const centerX = state.canvas.width / 2;
            const centerY = state.canvas.height / 2;
            const dx = centerX - this.x;
            const dy = centerY - this.y;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq > 2500) {
                const invDist = 1 / Math.sqrt(distanceSq);
                const tangentX = -dy * invDist;
                const tangentY = dx * invDist;
                this.vx += dx * invDist * 0.05 + tangentX * 0.15;
                this.vy += dy * invDist * 0.05 + tangentY * 0.15;
            }
        }

        // Rainbow mode - cycle hue
        if (state.chaosMode && state.rainbowMode) {
            this.hue = (performance.now() * 0.1 + this.x * 0.5) % 360;
        }

        // Disco mode - pulsing
        if (state.chaosMode && state.discoMode) {
            this.hue = (state.discoHue + this.x * 0.3 + this.y * 0.3) % 360;
        }

        // Calculate speed
        this.speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const naturalSpeed = 0.5;

        // Apply friction when moving fast
        if (this.speed > naturalSpeed) {
            const friction = 0.995;
            this.vx *= friction;
            this.vy *= friction;
        } else if (this.speed < naturalSpeed * 0.5) {
            this.vx += (Math.random() - 0.5) * 0.02;
            this.vy += (Math.random() - 0.5) * 0.02;
        }

        this.x += this.vx;
        this.y += this.vy;

        // Trail - circular buffer
        if (this.speed > 1.5) {
            this.trail[this.trailIndex] = { x: this.x, y: this.y };
            this.trailIndex = (this.trailIndex + 1) % TRAIL_MAX_LENGTH;
            if (this.trailLength < TRAIL_MAX_LENGTH) this.trailLength++;
        } else if (this.trailLength > 0) {
            this.trailLength--;
        }

        // Edge bouncing
        const bounceDamping = (state.chaosMode && state.bounceMode) ? 1.1 : 0.8;
        if (this.x < this.size) {
            this.x = this.size;
            this.vx = Math.abs(this.vx) * bounceDamping;
        } else if (this.x > state.canvas.width - this.size) {
            this.x = state.canvas.width - this.size;
            this.vx = -Math.abs(this.vx) * bounceDamping;
        }

        if (this.y < this.size) {
            this.y = this.size;
            this.vy = Math.abs(this.vy) * bounceDamping;
        } else if (this.y > state.canvas.height - this.size) {
            this.y = state.canvas.height - this.size;
            this.vy = -Math.abs(this.vy) * bounceDamping;
        }

        // Color shift based on velocity
        if (!state.matrixMode && !state.rainbowMode && !state.discoMode) {
            this.hue = 140 - Math.min(this.speed * 20, 140);
        }

        // Decay glow
        this.glowIntensity *= 0.92;

        // Golden timer
        if (this.isGolden) {
            this.goldenTimer--;
            if (this.goldenTimer <= 0) this.isGolden = false;
        }
    }

    draw() {
        const ctx = state.ctx;

        // Draw trail from circular buffer
        if (this.trailLength > 1) {
            ctx.beginPath();
            const startIdx = (this.trailIndex - this.trailLength + TRAIL_MAX_LENGTH) % TRAIL_MAX_LENGTH;
            const firstPoint = this.trail[startIdx];
            ctx.moveTo(firstPoint.x, firstPoint.y);
            for (let i = 1; i < this.trailLength; i++) {
                const idx = (startIdx + i) % TRAIL_MAX_LENGTH;
                ctx.lineTo(this.trail[idx].x, this.trail[idx].y);
            }
            ctx.strokeStyle = `hsla(${this.hue}, 80%, 65%, 0.3)`;
            ctx.lineWidth = this.size * 0.6;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Draw glow
        if ((state.chaosMode && this.glowIntensity > 0.1) || this.isDragged) {
            const glowAmount = this.isDragged ? 1 : this.glowIntensity;
            const gradient = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, this.size * 3
            );
            gradient.addColorStop(0, `hsla(${this.hue}, 100%, 70%, ${0.4 * glowAmount})`);
            gradient.addColorStop(1, `hsla(${this.hue}, 100%, 70%, 0)`);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 3, 0, TWO_PI);
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        // Golden shimmer
        if (this.isGolden && state.chaosMode) {
            const gradient = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, this.size + 5
            );
            gradient.addColorStop(0, 'rgba(255, 215, 0, 0.8)');
            gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size + 5, 0, TWO_PI);
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        // Main particle
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, TWO_PI);
        ctx.fillStyle = this.isGolden ? '#ffd700' : `hsl(${this.hue}, 80%, 65%)`;
        ctx.fill();

        // Highlight when dragged
        if (this.isDragged) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 0.4, 0, TWO_PI);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.fill();
        }
    }
}

// Find particle at point
export function getParticleAtPoint(x, y) {
    const hitRadius = 20;
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        const dx = p.x - x;
        const dy = p.y - y;
        const distanceSq = dx * dx + dy * dy;
        const maxDist = hitRadius + p.size;
        if (distanceSq < maxDist * maxDist) {
            return p;
        }
    }
    return null;
}
