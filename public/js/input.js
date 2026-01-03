import { MAX_VELOCITY_HISTORY, SHORTCUT_DELAY } from './constants.js';
import * as state from './state.js';
import { getParticleAtPoint } from './particle.js';
import { gameState } from './game.js';
import { showAchievement, openHelp, closeDiagnostics, closeHelp } from './ui.js';
import { secretPatterns, triggerNuke, activateKonamiMode, triggerYeet, triggerReverse } from './triggers.js';
import { activateChaosMode, toggleMatrixMode, toggleZenMode, toggleWarpMode, toggleDrunkMode, triggerPartyMode, triggerRaveMode } from './modes.js';

// Typing buffer for secret codes
let typedChars = '';
let typingTimeout = null;

// Pending shortcut system
let pendingShortcut = null;
let pendingShortcutTimer = null;
let pendingShortcutBufferLength = 0;

// Konami and chaos activation codes
let konamiIndex = 0;
const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let chaosCodeIndex = 0;
const chaosCode = ['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowLeft'];

function executePendingShortcut() {
    if (pendingShortcut) {
        if (typedChars.length <= pendingShortcutBufferLength + 1) {
            pendingShortcut();
            typedChars = '';
        }
        pendingShortcut = null;
    }
}

function scheduleShortcut(action) {
    pendingShortcut = action;
    pendingShortcutBufferLength = typedChars.length;
    clearTimeout(pendingShortcutTimer);
    pendingShortcutTimer = setTimeout(executePendingShortcut, SHORTCUT_DELAY);
}

function cancelPendingShortcut() {
    clearTimeout(pendingShortcutTimer);
    pendingShortcut = null;
}

function resetTypingBuffer() {
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typedChars = '';
    }, 1500);
}

// Pointer handlers
export function handlePointerDown(e) {
    const x = e.clientX;
    const y = e.clientY;

    state.interactionState.isMouseDown = true;
    secretPatterns.addClick(x, y);

    const particle = getParticleAtPoint(x, y);
    if (particle) {
        state.interactionState.isDragging = true;
        state.interactionState.draggedParticle = particle;
        particle.isDragged = true;
        state.interactionState.velocityIndex = 0;
        state.interactionState.velocityCount = 0;

        if (particle.isGolden && state.chaosMode) {
            gameState.addScore(100, 'goldenGrab');
            particle.isGolden = false;
            showAchievement('Midas Touch', 'Caught a golden particle!');
        } else {
            gameState.addScore(10, 'grab');
        }

        state.canvas.classList.add('grabbing');
    }

    state.interactionState.mouseX = x;
    state.interactionState.mouseY = y;
    state.interactionState.prevMouseX = x;
    state.interactionState.prevMouseY = y;
    state.interactionState.lastMouseTime = performance.now();
}

export function handlePointerMove(e) {
    const x = e.clientX;
    const y = e.clientY;
    const now = performance.now();
    const dt = (now - state.interactionState.lastMouseTime) / 1000;

    state.interactionState.prevMouseX = state.interactionState.mouseX;
    state.interactionState.prevMouseY = state.interactionState.mouseY;
    state.interactionState.mouseX = x;
    state.interactionState.mouseY = y;

    if (dt > 0) {
        const vx = (x - state.interactionState.prevMouseX) / dt;
        const vy = (y - state.interactionState.prevMouseY) / dt;

        state.interactionState.velocityHistory[state.interactionState.velocityIndex] = { vx, vy, time: now };
        state.interactionState.velocityIndex = (state.interactionState.velocityIndex + 1) % MAX_VELOCITY_HISTORY;
        if (state.interactionState.velocityCount < MAX_VELOCITY_HISTORY) {
            state.interactionState.velocityCount++;
        }
    }

    if (state.interactionState.isDragging && state.interactionState.draggedParticle) {
        state.interactionState.draggedParticle.x = x;
        state.interactionState.draggedParticle.y = y;
    }

    state.interactionState.lastMouseTime = now;
}

export function handlePointerUp() {
    if (state.interactionState.isDragging && state.interactionState.draggedParticle) {
        const throwVelocity = calculateThrowVelocity();

        state.interactionState.draggedParticle.vx = throwVelocity.vx * 0.015;
        state.interactionState.draggedParticle.vy = throwVelocity.vy * 0.015;
        state.interactionState.draggedParticle.isDragged = false;

        const throwSpeed = Math.sqrt(throwVelocity.vx ** 2 + throwVelocity.vy ** 2);
        if (throwSpeed > 500) {
            gameState.addScore(50, 'powerThrow');
        } else if (throwSpeed > 150) {
            gameState.addScore(25, 'throw');
        }

        state.canvas.classList.remove('grabbing');
    }

    state.interactionState.isDragging = false;
    state.interactionState.draggedParticle = null;
    state.interactionState.isMouseDown = false;
}

function calculateThrowVelocity() {
    if (state.interactionState.velocityCount === 0) {
        return { vx: 0, vy: 0 };
    }

    const now = performance.now();
    let totalVx = 0, totalVy = 0;
    let validCount = 0;

    for (let i = 0; i < state.interactionState.velocityCount; i++) {
        const idx = (state.interactionState.velocityIndex - 1 - i + MAX_VELOCITY_HISTORY) % MAX_VELOCITY_HISTORY;
        const v = state.interactionState.velocityHistory[idx];
        if (v && now - v.time <= 100) {
            totalVx += v.vx;
            totalVy += v.vy;
            validCount++;
        }
    }

    if (validCount === 0) {
        return { vx: 0, vy: 0 };
    }

    return {
        vx: totalVx / validCount,
        vy: totalVy / validCount
    };
}

// Set up all event listeners
export function setupInputListeners(canvas) {
    // Mouse events
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', handlePointerUp);

    // Touch events
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        handlePointerDown({ clientX: touch.clientX, clientY: touch.clientY });
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        handlePointerMove({ clientX: touch.clientX, clientY: touch.clientY });
    }, { passive: false });

    canvas.addEventListener('touchend', handlePointerUp);

    // Right-click for attraction
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 2) {
            state.setRightMouseDown(true);
            state.interactionState.mouseX = e.clientX;
            state.interactionState.mouseY = e.clientY;
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 2) {
            state.setRightMouseDown(false);
        }
    });

    // Keyboard events
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('keypress', handleKeyPress);
}

function handleKeyDown(e) {
    // Chaos mode activation code
    if (e.key === chaosCode[chaosCodeIndex]) {
        chaosCodeIndex++;
        if (chaosCodeIndex === chaosCode.length) {
            activateChaosMode();
            chaosCodeIndex = 0;
        }
    } else if (e.key.startsWith('Arrow')) {
        chaosCodeIndex = 0;
    }

    // Konami code
    const konamiKey = konamiCode[konamiIndex];
    const keyMatches = e.key === konamiKey || e.key.toLowerCase() === konamiKey;
    if (keyMatches) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
            activateKonamiMode();
            konamiIndex = 0;
        }
    } else if (!e.key.startsWith('Arrow') || konamiCode[konamiIndex].startsWith('Arrow')) {
        konamiIndex = 0;
    }

    // Escape to close modals
    if (e.key === 'Escape') {
        closeDiagnostics();
        closeHelp();
    }

    const isTypingSecrets = typedChars.length > 0;
    const inKonamiSequence = konamiIndex > 0;

    // H or ? to open help
    if (!isTypingSecrets && !inKonamiSequence && (e.key === 'h' || e.key === 'H' || e.key === '?')) {
        openHelp();
    }

    // Chaos mode controls with delayed execution
    if (state.chaosMode) {
        if (e.key === 'g' || e.key === 'G') {
            scheduleShortcut(() => {
                state.setGravityMode((state.gravityMode + 1) % 3);
                const modes = ['off', 'DOWN', 'UP'];
                showAchievement('Gravity: ' + modes[state.gravityMode],
                    state.gravityMode === 0 ? 'Weightless' : state.gravityMode === 1 ? 'What goes up...' : 'Defying physics!');
            });
        }

        if (e.key === 'n' || e.key === 'N') {
            scheduleShortcut(() => triggerNuke());
        }

        if (e.key === 'r' || e.key === 'R') {
            scheduleShortcut(() => {
                state.setRainbowMode(!state.rainbowMode);
                showAchievement(state.rainbowMode ? 'Rainbow Mode!' : 'Rainbow Off',
                    state.rainbowMode ? 'Taste the rainbow' : 'Back to normal');
            });
        }

        if (e.key === 'd' || e.key === 'D') {
            scheduleShortcut(() => {
                state.setDiscoMode(!state.discoMode);
                showAchievement(state.discoMode ? 'DISCO MODE!' : 'Disco Off',
                    state.discoMode ? 'Stayin\' alive!' : 'Party\'s over');
            });
        }

        if (e.key === 'm' || e.key === 'M') {
            scheduleShortcut(() => toggleMatrixMode());
        }

        if (e.key === 'f' || e.key === 'F') {
            scheduleShortcut(() => {
                state.setFreezeMode(!state.freezeMode);
                showAchievement(state.freezeMode ? 'FREEZE!' : 'Thawed',
                    state.freezeMode ? 'Time stands still' : 'Motion restored');
            });
        }

        if (e.key === 'v' || e.key === 'V') {
            scheduleShortcut(() => {
                state.setVortexMode(!state.vortexMode);
                showAchievement(state.vortexMode ? 'VORTEX!' : 'Vortex Off',
                    state.vortexMode ? 'Into the spiral!' : 'Escaping the whirlpool');
            });
        }

        if (e.key === 'b' || e.key === 'B') {
            scheduleShortcut(() => {
                state.setBounceMode(!state.bounceMode);
                showAchievement(state.bounceMode ? 'SUPER BOUNCE!' : 'Bounce Off',
                    state.bounceMode ? 'Walls amplify energy!' : 'Normal physics');
            });
        }

        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            state.setSlowMotion(true);
            showAchievement('Bullet Time', 'Everything slows down...');
        }
    }
}

function handleKeyUp(e) {
    if (e.code === 'Space') {
        state.setSlowMotion(false);
    }
}

function handleKeyPress(e) {
    if (!e.key.match(/[a-zA-Z]/)) return;

    typedChars += e.key.toUpperCase();
    resetTypingBuffer();

    // Check for secret words - cancel pending shortcuts when triggered
    if (typedChars.includes('MATRIX')) {
        cancelPendingShortcut();
        toggleMatrixMode();
        typedChars = '';
    } else if (typedChars.includes('PARTY')) {
        cancelPendingShortcut();
        triggerPartyMode();
        typedChars = '';
    } else if (typedChars.includes('RAVE')) {
        cancelPendingShortcut();
        triggerRaveMode();
        typedChars = '';
    } else if (typedChars.includes('YEET')) {
        cancelPendingShortcut();
        triggerYeet();
        typedChars = '';
    } else if (typedChars.includes('ZEN')) {
        cancelPendingShortcut();
        toggleZenMode();
        typedChars = '';
    } else if (typedChars.includes('WARP')) {
        cancelPendingShortcut();
        toggleWarpMode();
        typedChars = '';
    } else if (typedChars.includes('DRUNK')) {
        cancelPendingShortcut();
        toggleDrunkMode();
        typedChars = '';
    } else if (typedChars.includes('REVERSE')) {
        cancelPendingShortcut();
        triggerReverse();
        typedChars = '';
    }

    if (typedChars.length > 10) {
        typedChars = typedChars.slice(-10);
    }
}
