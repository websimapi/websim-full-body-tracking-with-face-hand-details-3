/**
 * debugControls.js - Manages the debug UI elements and state.
 */
import * as THREE from 'three';

// --- DOM Element References ---
const debugMenu = document.getElementById('debug-menu');
const toggleDebugBtn = document.getElementById('toggle-debug-btn');
const statusElement = document.getElementById('status');
const showBodyCheckbox = document.getElementById('show-body');
const showFaceCheckbox = document.getElementById('show-face');
const showHandsCheckbox = document.getElementById('show-hands');

// Global Controls
const globalOffsetXSlider = document.getElementById('global-offset-x');
const globalOffsetYSlider = document.getElementById('global-offset-y');
const globalOffsetZSlider = document.getElementById('global-offset-z');
const globalScaleSlider = document.getElementById('global-scale');
const globalOffsetXValue = document.getElementById('global-offset-x-value');
const globalOffsetYValue = document.getElementById('global-offset-y-value');
const globalOffsetZValue = document.getElementById('global-offset-z-value');
const globalScaleValue = document.getElementById('global-scale-value');

// Part-Specific Controls Elements (Main Parts)
const partElements = {
    face: {
        offsetX: document.getElementById('face-offset-x'), 
        offsetY: document.getElementById('face-offset-y'), 
        offsetZ: document.getElementById('face-offset-z'), 
        scale: document.getElementById('face-scale'),
        offsetXValue: document.getElementById('face-offset-x-value'), 
        offsetYValue: document.getElementById('face-offset-y-value'), 
        offsetZValue: document.getElementById('face-offset-z-value'), 
        scaleValue: document.getElementById('face-scale-value'),
    },
    body: { 
        offsetX: document.getElementById('body-offset-x'), 
        offsetY: document.getElementById('body-offset-y'), 
        offsetZ: document.getElementById('body-offset-z'), 
        scale: document.getElementById('body-scale'),
        offsetXValue: document.getElementById('body-offset-x-value'), 
        offsetYValue: document.getElementById('body-offset-y-value'), 
        offsetZValue: document.getElementById('body-offset-z-value'), 
        scaleValue: document.getElementById('body-scale-value'),
    },
    leftHand: {
        offsetX: document.getElementById('lhand-offset-x'), 
        offsetY: document.getElementById('lhand-offset-y'), 
        offsetZ: document.getElementById('lhand-offset-z'), 
        scale: document.getElementById('lhand-scale'),
        offsetXValue: document.getElementById('lhand-offset-x-value'), 
        offsetYValue: document.getElementById('lhand-offset-y-value'), 
        offsetZValue: document.getElementById('lhand-offset-z-value'), 
        scaleValue: document.getElementById('lhand-scale-value'),
    },
    rightHand: {
        offsetX: document.getElementById('rhand-offset-x'), 
        offsetY: document.getElementById('rhand-offset-y'), 
        offsetZ: document.getElementById('rhand-offset-z'), 
        scale: document.getElementById('rhand-scale'),
        offsetXValue: document.getElementById('rhand-offset-x-value'), 
        offsetYValue: document.getElementById('rhand-offset-y-value'), 
        offsetZValue: document.getElementById('rhand-offset-z-value'), 
        scaleValue: document.getElementById('rhand-scale-value'),
    }
};

// Granular Body Part Controls Elements
const bodyPartElements = {
    shoulders: {
        offsetX: document.getElementById('shoulders-offset-x'), 
        offsetY: document.getElementById('shoulders-offset-y'), 
        offsetZ: document.getElementById('shoulders-offset-z'), 
        scale: document.getElementById('shoulders-scale'),
        offsetXValue: document.getElementById('shoulders-offset-x-value'), 
        offsetYValue: document.getElementById('shoulders-offset-y-value'), 
        offsetZValue: document.getElementById('shoulders-offset-z-value'), 
        scaleValue: document.getElementById('shoulders-scale-value'),
    },
    leftArm:   {
        offsetX: document.getElementById('larm-offset-x'), 
        offsetY: document.getElementById('larm-offset-y'), 
        offsetZ: document.getElementById('larm-offset-z'), 
        scale: document.getElementById('larm-scale'),
        offsetXValue: document.getElementById('larm-offset-x-value'), 
        offsetYValue: document.getElementById('larm-offset-y-value'), 
        offsetZValue: document.getElementById('larm-offset-z-value'), 
        scaleValue: document.getElementById('larm-scale-value'),
    },
    rightArm:  {
        offsetX: document.getElementById('rarm-offset-x'), 
        offsetY: document.getElementById('rarm-offset-y'), 
        offsetZ: document.getElementById('rarm-offset-z'), 
        scale: document.getElementById('rarm-scale'),
        offsetXValue: document.getElementById('rarm-offset-x-value'), 
        offsetYValue: document.getElementById('rarm-offset-y-value'), 
        offsetZValue: document.getElementById('rarm-offset-z-value'), 
        scaleValue: document.getElementById('rarm-scale-value'),
    },
     leftLeg:   {
        offsetX: document.getElementById('lleg-offset-x'), 
        offsetY: document.getElementById('lleg-offset-y'), 
        offsetZ: document.getElementById('lleg-offset-z'), 
        scale: document.getElementById('lleg-scale'),
        offsetXValue: document.getElementById('lleg-offset-x-value'), 
        offsetYValue: document.getElementById('lleg-offset-y-value'), 
        offsetZValue: document.getElementById('lleg-offset-z-value'), 
        scaleValue: document.getElementById('lleg-scale-value'),
    },
    rightLeg:  {
        offsetX: document.getElementById('rleg-offset-x'), 
        offsetY: document.getElementById('rleg-offset-y'), 
        offsetZ: document.getElementById('rleg-offset-z'), 
        scale: document.getElementById('rleg-scale'),
        offsetXValue: document.getElementById('rleg-offset-x-value'), 
        offsetYValue: document.getElementById('rleg-offset-y-value'), 
        offsetZValue: document.getElementById('rleg-offset-z-value'), 
        scaleValue: document.getElementById('rleg-scale-value'),
    }
};


// Readout Elements
const camPosDisplay = document.getElementById('cam-pos');
const camTargetDisplay = document.getElementById('cam-target');

// --- Debug State Variables ---
let debugGlobalOffset = new THREE.Vector3(0, 0, 0);
let debugGlobalScale = 1.0;

let debugLocalOffsets = {
    face: new THREE.Vector3(0, 0, 0),
    body: new THREE.Vector3(0, -1.0, 0), 
    leftHand: new THREE.Vector3(0, 0, 0),
    rightHand: new THREE.Vector3(0, 0, 0),
};
let debugLocalScales = {
    face: 1.0,
    body: 1.0,
    leftHand: 1.0,
    rightHand: 1.0,
};

let debugBodyPartAdjustments = {
    shoulders: { offset: new THREE.Vector3(0, 0, 0), scale: 1.0 },
    leftArm:   { offset: new THREE.Vector3(0, 0, 0), scale: 1.0 },
    rightArm:  { offset: new THREE.Vector3(0, 0, 0), scale: 1.0 },
    leftLeg:   { offset: new THREE.Vector3(0, 0, 0), scale: 1.0 },
    rightLeg:  { offset: new THREE.Vector3(0, 0, 0), scale: 1.0 },
};

// --- Functions ---

// Format vector for display
function formatVector(vec, precision = 2) {
    if (!vec) return 'N/A';
    return `(${vec.x.toFixed(precision)}, ${vec.y.toFixed(precision)}, ${vec.z.toFixed(precision)})`;
}

// Setup listener for the debug menu toggle button
function setupDebugMenuToggle() {
    if (toggleDebugBtn && debugMenu) {
        toggleDebugBtn.addEventListener('click', () => {
            debugMenu.classList.toggle('collapsed');
        });
    } else {
        console.warn("Debug toggle button or menu not found.");
    }
}

// Initialize listeners for all debug controls
function initAllControls() {
    // --- Global Controls ---
    globalOffsetXSlider.addEventListener('input', (e) => {
        debugGlobalOffset.x = parseFloat(e.target.value);
        globalOffsetXValue.textContent = debugGlobalOffset.x.toFixed(2);
    });
    globalOffsetYSlider.addEventListener('input', (e) => {
        debugGlobalOffset.y = parseFloat(e.target.value);
        globalOffsetYValue.textContent = debugGlobalOffset.y.toFixed(2);
    });
    globalOffsetZSlider.addEventListener('input', (e) => {
        debugGlobalOffset.z = parseFloat(e.target.value);
        globalOffsetZValue.textContent = debugGlobalOffset.z.toFixed(2);
    });
    globalScaleSlider.addEventListener('input', (e) => {
        debugGlobalScale = parseFloat(e.target.value);
        globalScaleValue.textContent = debugGlobalScale.toFixed(2);
    });

    // --- Part-Specific Controls (Overall Face, Body, Hands) ---
    function setupPartControls(partName) {
        const elements = partElements[partName];
        if (!elements || !elements.offsetX) return; 
        const offset = debugLocalOffsets[partName];
        elements.offsetX.addEventListener('input', (e) => {
            offset.x = parseFloat(e.target.value);
            elements.offsetXValue.textContent = offset.x.toFixed(2);
        });
        elements.offsetY.addEventListener('input', (e) => {
            offset.y = parseFloat(e.target.value);
            elements.offsetYValue.textContent = offset.y.toFixed(2);
        });
        elements.offsetZ.addEventListener('input', (e) => {
            offset.z = parseFloat(e.target.value);
            elements.offsetZValue.textContent = offset.z.toFixed(2);
        });
        elements.scale.addEventListener('input', (e) => {
            debugLocalScales[partName] = parseFloat(e.target.value);
            elements.scaleValue.textContent = debugLocalScales[partName].toFixed(2);
        });

        // Set initial display values for the part
        elements.offsetXValue.textContent = offset.x.toFixed(2);
        elements.offsetYValue.textContent = offset.y.toFixed(2);
        elements.offsetZValue.textContent = offset.z.toFixed(2);
        elements.scaleValue.textContent = debugLocalScales[partName].toFixed(2);
    }

    Object.keys(partElements).forEach(setupPartControls);


    // --- Granular Body Part Controls ---
     function setupBodyPartControls(partName) {
        const elements = bodyPartElements[partName];
        if (!elements || !elements.offsetX) return; 
        const adjustment = debugBodyPartAdjustments[partName];
        elements.offsetX.addEventListener('input', (e) => {
            adjustment.offset.x = parseFloat(e.target.value);
            elements.offsetXValue.textContent = adjustment.offset.x.toFixed(2);
        });
        elements.offsetY.addEventListener('input', (e) => {
            adjustment.offset.y = parseFloat(e.target.value);
            elements.offsetYValue.textContent = adjustment.offset.y.toFixed(2);
        });
        elements.offsetZ.addEventListener('input', (e) => {
            adjustment.offset.z = parseFloat(e.target.value);
            elements.offsetZValue.textContent = adjustment.offset.z.toFixed(2);
        });
        elements.scale.addEventListener('input', (e) => {
            adjustment.scale = parseFloat(e.target.value);
            elements.scaleValue.textContent = adjustment.scale.toFixed(2);
        });

        // Set initial display values for the body part
        elements.offsetXValue.textContent = adjustment.offset.x.toFixed(2);
        elements.offsetYValue.textContent = adjustment.offset.y.toFixed(2);
        elements.offsetZValue.textContent = adjustment.offset.z.toFixed(2);
        elements.scaleValue.textContent = adjustment.scale.toFixed(2);
    }

    Object.keys(bodyPartElements).forEach(setupBodyPartControls);


    // Set initial display values for global controls
    globalOffsetXValue.textContent = debugGlobalOffset.x.toFixed(2);
    globalOffsetYValue.textContent = debugGlobalOffset.y.toFixed(2);
    globalOffsetZValue.textContent = debugGlobalOffset.z.toFixed(2);
    globalScaleValue.textContent = debugGlobalScale.toFixed(2);
}

// --- Public Interface ---

/**
 * Initializes the debug menu toggle and control listeners.
 */
export function initDebugUI() {
    setupDebugMenuToggle();
    initAllControls();
}

/**
 * Updates the status message in the debug menu.
 * @param {string} message - The message to display.
 */
export function updateStatus(message) {
    if (statusElement) {
        statusElement.textContent = message;
    }
}

/**
 * Updates the camera position and target readouts in the debug menu.
 * @param {THREE.PerspectiveCamera} camera - The scene camera.
 * @param {OrbitControls} controls - The orbit controls instance.
 */
export function updateDebugReadouts(camera, controls) {
    if (camera && controls && camPosDisplay && camTargetDisplay) {
        camPosDisplay.textContent = formatVector(camera.position);
        camTargetDisplay.textContent = formatVector(controls.target);
    }
}

/**
 * Gets the current debug settings (offsets, scales, toggles).
 * @returns {object} An object containing the current debug settings.
 */
export function getDebugSettings() {
    return {
        globalOffset: debugGlobalOffset,
        globalScale: debugGlobalScale,
        localOffsets: debugLocalOffsets,
        localScales: debugLocalScales,
        bodyPartAdjustments: debugBodyPartAdjustments, 
        showBody: showBodyCheckbox.checked,
        showFace: showFaceCheckbox.checked,
        showHands: showHandsCheckbox.checked
    };
}