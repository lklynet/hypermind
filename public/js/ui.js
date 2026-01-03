import * as state from './state.js';

// DOM elements (set by main.js)
let diagnosticsModal = null;
let helpModal = null;

export function initModals(elements) {
    diagnosticsModal = elements.diagnosticsModal;
    helpModal = elements.helpModal;
}

export function openDiagnostics() {
    if (diagnosticsModal) diagnosticsModal.classList.add('active');
}

export function closeDiagnostics() {
    if (diagnosticsModal) diagnosticsModal.classList.remove('active');
}

export function openHelp() {
    if (helpModal) helpModal.classList.add('active');
}

export function closeHelp() {
    if (helpModal) helpModal.classList.remove('active');
}

export function showAchievement(title, desc) {
    if (!state.chaosMode) return;

    const existing = document.querySelector('.achievement-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.className = 'achievement-popup';
    popup.innerHTML = `
        <div class="achievement-icon">&#9733;</div>
        <div class="achievement-text">
            <div class="achievement-title">${title}</div>
            <div class="achievement-desc">${desc}</div>
        </div>
    `;
    document.body.appendChild(popup);

    setTimeout(() => popup.classList.add('show'), 10);

    setTimeout(() => {
        popup.classList.remove('show');
        setTimeout(() => popup.remove(), 500);
    }, 3000);
}

// Show achievement even if chaos mode just activated
export function showAchievementForce(title, desc) {
    const existing = document.querySelector('.achievement-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.className = 'achievement-popup';
    popup.innerHTML = `
        <div class="achievement-icon">&#9733;</div>
        <div class="achievement-text">
            <div class="achievement-title">${title}</div>
            <div class="achievement-desc">${desc}</div>
        </div>
    `;
    document.body.appendChild(popup);

    setTimeout(() => popup.classList.add('show'), 10);

    setTimeout(() => {
        popup.classList.remove('show');
        setTimeout(() => popup.remove(), 500);
    }, 3000);
}

// Make functions available globally for onclick handlers in HTML
window.openDiagnostics = openDiagnostics;
window.closeDiagnostics = closeDiagnostics;
window.openHelp = openHelp;
window.closeHelp = closeHelp;
