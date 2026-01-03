import { MAX_VELOCITY_HISTORY } from './constants.js';

// Canvas and context (set by main.js)
export let canvas = null;
export let ctx = null;

export function initCanvas(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
}

// Particles array
export let particles = [];

export function setParticles(newParticles) {
    particles = newParticles;
}

// Mode flags
export let chaosMode = false;
export let matrixMode = false;
export let rainbowMode = false;
export let discoMode = false;
export let freezeMode = false;
export let vortexMode = false;
export let bounceMode = false;
export let slowMotion = false;
export let gravityMode = 0; // 0 = off, 1 = down, 2 = up
export let zenMode = false;
export let warpMode = false;
export let drunkMode = false;
export let discoHue = 0;

// Setters for mode flags
export function setChaosMode(val) { chaosMode = val; }
export function setMatrixMode(val) { matrixMode = val; }
export function setRainbowMode(val) { rainbowMode = val; }
export function setDiscoMode(val) { discoMode = val; }
export function setFreezeMode(val) { freezeMode = val; }
export function setVortexMode(val) { vortexMode = val; }
export function setBounceMode(val) { bounceMode = val; }
export function setSlowMotion(val) { slowMotion = val; }
export function setGravityMode(val) { gravityMode = val; }
export function setZenMode(val) { zenMode = val; }
export function setWarpMode(val) { warpMode = val; }
export function setDrunkMode(val) { drunkMode = val; }
export function setDiscoHue(val) { discoHue = val; }

// Black hole state
export let blackHoleActive = false;
export let blackHolePos = null;
export let blackHoleTimer = null;

export function setBlackHoleActive(val) { blackHoleActive = val; }
export function setBlackHolePos(val) { blackHolePos = val; }
export function setBlackHoleTimer(val) { blackHoleTimer = val; }

// Right mouse state
export let isRightMouseDown = false;
export function setRightMouseDown(val) { isRightMouseDown = val; }

// Interaction state
export const interactionState = {
    isDragging: false,
    draggedParticle: null,
    isMouseDown: false,
    mouseX: 0,
    mouseY: 0,
    prevMouseX: 0,
    prevMouseY: 0,
    velocityHistory: new Array(MAX_VELOCITY_HISTORY),
    velocityIndex: 0,
    velocityCount: 0,
    lastMouseTime: 0
};
