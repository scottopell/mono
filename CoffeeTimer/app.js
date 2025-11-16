// Coffee Timer App - State Machine Implementation

// REQ-CT-001: Recipe configurations
const RECIPES = {
    single: {
        type: 'single',
        coffee: 25,
        totalWater: 350,
        bloomWater: 50,
        pourWater: 150
    },
    double: {
        type: 'double',
        coffee: 50,
        totalWater: 700,
        bloomWater: 100,
        pourWater: 300
    }
};

// Application state
const state = {
    currentPhase: 'RECIPE_SELECTION',
    recipe: null,
    phaseStartTime: null,
    lastCheckInTime: null,
    alertActive: false,
    timerInterval: null,
    alertInterval: null
};

// DOM elements
const screens = {
    recipeSelection: document.getElementById('recipe-selection'),
    bloomPhase: document.getElementById('bloom-phase'),
    firstPourPhase: document.getElementById('first-pour-phase'),
    secondPourPhase: document.getElementById('second-pour-phase'),
    brewComplete: document.getElementById('brew-complete')
};

const elements = {
    btnSingle: document.getElementById('btn-single'),
    btnDouble: document.getElementById('btn-double'),
    btnStartBrew: document.getElementById('btn-start-brew'),
    btnBloomComplete: document.getElementById('btn-bloom-complete'),
    btnFirstPourComplete: document.getElementById('btn-first-pour-complete'),
    btnSecondPourComplete: document.getElementById('btn-second-pour-complete'),
    btnNewBrew: document.getElementById('btn-new-brew'),
    bloomInstruction: document.getElementById('bloom-instruction'),
    bloomTimer: document.getElementById('bloom-timer'),
    firstPourInstruction: document.getElementById('first-pour-instruction'),
    firstPourTimer: document.getElementById('first-pour-timer'),
    secondPourInstruction: document.getElementById('second-pour-instruction'),
    secondPourTimer: document.getElementById('second-pour-timer')
};

// Initialize app
function init() {
    // REQ-CT-001: Load last recipe selection from localStorage, default to double
    const savedRecipe = localStorage.getItem('lastRecipe') || 'double';
    state.recipe = RECIPES[savedRecipe];
    updateRecipeSelection(savedRecipe);

    // Event listeners
    elements.btnSingle.addEventListener('click', () => selectRecipe('single'));
    elements.btnDouble.addEventListener('click', () => selectRecipe('double'));
    elements.btnStartBrew.addEventListener('click', startBrew);
    elements.btnBloomComplete.addEventListener('click', startFirstPour);
    elements.btnFirstPourComplete.addEventListener('click', () => completePour('first'));
    elements.btnSecondPourComplete.addEventListener('click', () => completePour('second'));
    elements.btnNewBrew.addEventListener('click', startNewBrew);

    showScreen('recipeSelection');
}

// REQ-CT-001: Recipe selection
function selectRecipe(type) {
    state.recipe = RECIPES[type];
    updateRecipeSelection(type);
    localStorage.setItem('lastRecipe', type);
}

function updateRecipeSelection(type) {
    elements.btnSingle.classList.toggle('selected', type === 'single');
    elements.btnDouble.classList.toggle('selected', type === 'double');
}

// REQ-CT-002: Start brew process
function startBrew() {
    // Update bloom instruction based on selected recipe
    elements.bloomInstruction.textContent = `Pour ${state.recipe.bloomWater}g to bloom grounds`;

    // REQ-CT-003: Start bloom phase
    state.currentPhase = 'BLOOM_PHASE';
    state.phaseStartTime = Date.now();

    // Hide bloom complete button initially
    elements.btnBloomComplete.classList.add('hidden');

    showScreen('bloomPhase');
    startBloomTimer();
}

// REQ-CT-003: Bloom phase countdown timer
function startBloomTimer() {
    const BLOOM_DURATION = 60; // seconds

    state.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.phaseStartTime) / 1000);
        const remaining = BLOOM_DURATION - elapsed;

        if (remaining <= 0) {
            // REQ-CT-003: Show button when bloom complete
            clearInterval(state.timerInterval);
            elements.bloomTimer.textContent = '0:00';
            elements.btnBloomComplete.classList.remove('hidden');
        } else {
            // REQ-CT-009: Display countdown timer
            elements.bloomTimer.textContent = formatTime(remaining);
        }
    }, 100);
}

// REQ-CT-004: Start first pour phase
function startFirstPour() {
    state.currentPhase = 'FIRST_POUR_PHASE';
    state.phaseStartTime = Date.now();
    state.lastCheckInTime = Date.now();

    // Update instruction based on recipe
    elements.firstPourInstruction.textContent = `Pour ${state.recipe.pourWater}g - First Pour`;

    showScreen('firstPourPhase');
    startPourTimer('first');
    startCheckInMonitor(); // REQ-CT-007
}

// REQ-CT-006: Start second pour phase
function startSecondPour() {
    state.currentPhase = 'SECOND_POUR_PHASE';
    state.phaseStartTime = Date.now();
    state.lastCheckInTime = Date.now();

    // Update instruction based on recipe
    elements.secondPourInstruction.textContent = `Pour ${state.recipe.pourWater}g - Final Pour`;

    showScreen('secondPourPhase');
    startPourTimer('second');
    startCheckInMonitor(); // REQ-CT-007
}

// REQ-CT-009: Pour phase elapsed timer
function startPourTimer(phase) {
    const timerElement = phase === 'first' ? elements.firstPourTimer : elements.secondPourTimer;

    state.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.phaseStartTime) / 1000);
        timerElement.textContent = formatTime(elapsed);
    }, 100);
}

// REQ-CT-005: Handle pour completion
function completePour(phase) {
    // Update check-in time and clear alerts
    state.lastCheckInTime = Date.now();
    stopAlert();

    // Clear timer
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
    }

    // Stop check-in monitor
    if (state.alertInterval) {
        clearInterval(state.alertInterval);
    }

    if (phase === 'first') {
        // Advance to second pour
        startSecondPour();
    } else {
        // Advance to completion
        completeBrew();
    }
}

// REQ-CT-010: Brew completion
function completeBrew() {
    state.currentPhase = 'BREW_COMPLETE';
    showScreen('brewComplete');
}

// REQ-CT-010: Start new brew
function startNewBrew() {
    // Reset state but keep recipe selection
    state.currentPhase = 'RECIPE_SELECTION';
    state.phaseStartTime = null;
    state.lastCheckInTime = null;
    showScreen('recipeSelection');
}

// REQ-CT-007: Check-in alert monitoring
function startCheckInMonitor() {
    const CHECK_IN_THRESHOLD = 60000; // 60 seconds in milliseconds

    state.alertInterval = setInterval(() => {
        const timeSinceCheckIn = Date.now() - state.lastCheckInTime;

        if (timeSinceCheckIn > CHECK_IN_THRESHOLD && !state.alertActive) {
            startAlert();
        }
    }, 1000);
}

// REQ-CT-007: Start screen flash and haptic alert
function startAlert() {
    state.alertActive = true;

    // Screen flash
    document.body.classList.add('alert-flash');

    // Haptic feedback (if supported)
    if ('vibrate' in navigator) {
        // Initial vibration
        navigator.vibrate([200, 100, 200]);

        // Repeat vibration every 5 seconds
        state.vibrationInterval = setInterval(() => {
            navigator.vibrate([200, 100, 200]);
        }, 5000);
    }
}

// REQ-CT-007: Stop alert
function stopAlert() {
    if (!state.alertActive) return;

    state.alertActive = false;

    // Stop screen flash
    document.body.classList.remove('alert-flash');

    // Stop vibration
    if (state.vibrationInterval) {
        clearInterval(state.vibrationInterval);
        navigator.vibrate(0); // Cancel any ongoing vibration
    }
}

// Utility: Format time as M:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Utility: Show specific screen
function showScreen(screenName) {
    // Hide all screens
    Object.values(screens).forEach(screen => screen.classList.add('hidden'));

    // Show requested screen
    screens[screenName].classList.remove('hidden');
}

// Start the app
init();
