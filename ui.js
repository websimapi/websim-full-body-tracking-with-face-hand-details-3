/**
 * UI Module: Handles DOM element selection, event listeners for controls,
 * and UI state management (like the debug menu).
 */
import * as THREE from 'three'; // Needed for Vector3 in debug state

// --- DOM Element References ---

export const domElements = {
    // Containers
    sceneContainer: document.getElementById('scene-container'),
    webcamContainer: document.querySelector('.webcam-container'), // For potential future use

    // Webcam & Canvas
    video: document.getElementById('webcam'),
    canvas: document.getElementById('output-canvas'),

    // Debug Menu Core
    debugMenu: document.getElementById('debug-menu'),
    toggleDebugBtn: document.getElementById('toggle-debug-btn'),
    debugContent: document.getElementById('debug-content'),
    statusElement: document.getElementById('status'),

    // Debug Toggles
    showBodyCheckbox: document.getElementById('show-body'),
    showFaceCheckbox: document.getElementById('show-face'),
    showHandsCheckbox: document.getElementById('show-hands'),

    // Debug Sliders & Values (Global)
    globalOffsetXSlider: document.getElementById('global-offset-x'),
    globalOffsetYSlider: document.getElementById('global-offset-y'),
    globalOffsetZSlider: document.getElementById('global-offset-z'),
    globalScaleSlider: document.getElementById('global-scale'),
    globalOffsetXValue: document.getElementById('global-offset-x-value'),
    globalOffsetYValue: document.getElementById('global-offset-y-value'),
    globalOffsetZValue: document.getElementById('global-offset-z-value'),
    globalScaleValue: document.getElementById('global-scale-value'),

    // Debug Sliders & Values (Part-Specific)
    parts: {
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
    },

    // Debug Readouts
    camPosDisplay: document.getElementById('cam-pos'),
    camTargetDisplay: document.getElementById('cam-target'),

    // Derived Elements (convenience)
    ctx: document.getElementById('output-canvas') ? document.getElementById('output-canvas').getContext('2d') : null,
};

// --- Debug State (mirrors sliders/controls) ---

export const debugState = {
    // Global
    globalOffset: new THREE.Vector3(0, 0, 0),
    globalScale: 1.0,

    // Part-Specific Offsets
    localOffsets: {
        face: new THREE.Vector3(0, 0, 0),
        body: new THREE.Vector3(0, 0, 0),
        leftHand: new THREE.Vector3(0, 0, 0),
        rightHand: new THREE.Vector3(0, 0, 0),
    },

    // Part-Specific Scales
    localScales: {
        face: 1.0,
        body: 1.0,
        leftHand: 1.0,
        rightHand: 1.0,
    }
};

// --- UI Initialization Functions ---

/**
 * Sets up the toggle button listener for the debug menu.
 */
export function setupDebugMenuToggle() {
    if (domElements.toggleDebugBtn && domElements.debugMenu) {
        // Start collapsed by default only on larger screens
        if (window.innerWidth > 480) {
            domElements.debugMenu.classList.add('collapsed');
        } else {
             // Ensure it's not collapsed on small screens initially if the toggle moved
            domElements.debugMenu.classList.remove('collapsed');
        }

        domElements.toggleDebugBtn.addEventListener('click', () => {
            domElements.debugMenu.classList.toggle('collapsed');
        });
    } else {
        console.warn("Debug toggle button or menu not found.");
    }
}

/**
 * Initializes event listeners for all debug sliders and checkboxes.
 * Updates the debugState object and corresponding value displays.
 */
export function initDebugControls() {
    // --- Global Controls ---
    domElements.globalOffsetXSlider?.addEventListener('input', (e) => {
        debugState.globalOffset.x = parseFloat(e.target.value);
        domElements.globalOffsetXValue.textContent = debugState.globalOffset.x.toFixed(2);
    });
    domElements.globalOffsetYSlider?.addEventListener('input', (e) => {
        debugState.globalOffset.y = parseFloat(e.target.value);
        domElements.globalOffsetYValue.textContent = debugState.globalOffset.y.toFixed(2);
    });
    domElements.globalOffsetZSlider?.addEventListener('input', (e) => {
        debugState.globalOffset.z = parseFloat(e.target.value);
        domElements.globalOffsetZValue.textContent = debugState.globalOffset.z.toFixed(2);
    });
    domElements.globalScaleSlider?.addEventListener('input', (e) => {
        debugState.globalScale = parseFloat(e.target.value);
        domElements.globalScaleValue.textContent = debugState.globalScale.toFixed(2);
    });

    // --- Part-Specific Controls ---
    function setupPartControls(partName) {
        const elements = domElements.parts[partName];
        const offset = debugState.localOffsets[partName];
        if (!elements || !offset) return; // Guard against missing elements/state

        elements.offsetX?.addEventListener('input', (e) => {
            offset.x = parseFloat(e.target.value);
            elements.offsetXValue.textContent = offset.x.toFixed(2);
        });
        elements.offsetY?.addEventListener('input', (e) => {
            offset.y = parseFloat(e.target.value);
            elements.offsetYValue.textContent = offset.y.toFixed(2);
        });
        elements.offsetZ?.addEventListener('input', (e) => {
            offset.z = parseFloat(e.target.value);
            elements.offsetZValue.textContent = offset.z.toFixed(2);
        });
        elements.scale?.addEventListener('input', (e) => {
            debugState.localScales[partName] = parseFloat(e.target.value);
            elements.scaleValue.textContent = debugState.localScales[partName].toFixed(2);
        });

        // Set initial display values for the part
        if(elements.offsetXValue) elements.offsetXValue.textContent = offset.x.toFixed(2);
        if(elements.offsetYValue) elements.offsetYValue.textContent = offset.y.toFixed(2);
        if(elements.offsetZValue) elements.offsetZValue.textContent = offset.z.toFixed(2);
        if(elements.scaleValue) elements.scaleValue.textContent = debugState.localScales[partName].toFixed(2);
    }

    setupPartControls('face');
    setupPartControls('body');
    setupPartControls('leftHand');
    setupPartControls('rightHand');

    // Set initial display values for global controls
    if(domElements.globalOffsetXValue) domElements.globalOffsetXValue.textContent = debugState.globalOffset.x.toFixed(2);
    if(domElements.globalOffsetYValue) domElements.globalOffsetYValue.textContent = debugState.globalOffset.y.toFixed(2);
    if(domElements.globalOffsetZValue) domElements.globalOffsetZValue.textContent = debugState.globalOffset.z.toFixed(2);
    if(domElements.globalScaleValue) domElements.globalScaleValue.textContent = debugState.globalScale.toFixed(2);
}

/**
 * Formats a THREE.Vector3 for display.
 * @param {THREE.Vector3} vec - The vector to format.
 * @param {number} precision - Number of decimal places.
 * @returns {string} Formatted string or 'N/A'.
 */
export function formatVector(vec, precision = 2) {
    if (!vec) return 'N/A';
    return `(${vec.x.toFixed(precision)}, ${vec.y.toFixed(precision)}, ${vec.z.toFixed(precision)})`;
}

/**
 * Resizes the overlay canvas to match the video element's display size.
 */
export function resizeCanvasToDisplaySize() {
    const video = domElements.video;
    const canvas = domElements.canvas;
    if (!video || !canvas || video.videoWidth === 0) return;

    const displayWidth = video.clientWidth;
    const displayHeight = video.clientHeight;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
    }
}

/**
 * Updates the status message in the debug menu.
 * @param {string} message - The message to display.
 */
export function updateStatus(message) {
    if (domElements.statusElement) {
        domElements.statusElement.textContent = message;
    }
}

/**
 * Updates the camera position and target readouts in the debug menu.
 * @param {THREE.Vector3} position - Camera position.
 * @param {THREE.Vector3} target - Controls target.
 */
export function updateCameraReadouts(position, target) {
     if (domElements.camPosDisplay && domElements.camTargetDisplay) {
        domElements.camPosDisplay.textContent = formatVector(position);
        domElements.camTargetDisplay.textContent = formatVector(target);
    }
}