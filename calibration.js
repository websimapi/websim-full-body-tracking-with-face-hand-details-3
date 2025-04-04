/**
 * Calibration Module
 * Handles the user calibration process for determining initial scale.
 */

// Internal state for calibration process
let isCalibrating = false;
let countdownTimer = null;
let countdownValue = 5;
const COUNTDOWN_START_VALUE = 5;
const VISIBILITY_THRESHOLD = 0.6; // Minimum visibility for shoulder landmarks during calibration

// Helper function to calculate 2D distance between landmarks (normalized coords)
function calculateDistance2D(p1, p2) {
    if (!p1 || !p2) return 0;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Attempts to perform calibration using the provided MediaPipe results.
 * Checks for necessary landmarks and their visibility.
 * @param {object} results - The results object from MediaPipe Holistic.
 * @param {HTMLElement} statusElement - The DOM element to display status messages.
 * @returns {object|null} Calibration data ({ referenceShoulderWidth }) on success, null on failure.
 */
export function performCalibration(results, statusElement) {
    isCalibrating = false; // Calibration attempt is finished

    if (!results || !results.poseLandmarks || results.poseLandmarks.length < 13) {
        statusElement.textContent = "Calibration failed: Could not detect full body pose. Please try again.";
        console.warn("Calibration failed: Insufficient pose landmarks.", results?.poseLandmarks?.length);
        return null;
    }

    const shoulderLeft = results.poseLandmarks[11];
    const shoulderRight = results.poseLandmarks[12];

    // Check if shoulders are detected and visible enough
    if (!shoulderLeft || !shoulderRight) {
         statusElement.textContent = "Calibration failed: Could not detect both shoulders. Please ensure they are visible.";
         console.warn("Calibration failed: Shoulder landmarks missing.");
         return null;
    }
    const leftVisibility = shoulderLeft.visibility ?? 0;
    const rightVisibility = shoulderRight.visibility ?? 0;

    if (leftVisibility < VISIBILITY_THRESHOLD || rightVisibility < VISIBILITY_THRESHOLD) {
        statusElement.textContent = `Calibration failed: Shoulders not clearly visible (Visibility Left: ${leftVisibility.toFixed(2)}, Right: ${rightVisibility.toFixed(2)}). Try better lighting or position.`;
        console.warn(`Calibration failed: Low shoulder visibility. Left: ${leftVisibility}, Right: ${rightVisibility}`);
        return null;
    }


    // Use 2D distance on the capture frame as the reference
    const refWidth = calculateDistance2D(shoulderLeft, shoulderRight);

    if (refWidth < 0.01) { // Check for very small or zero width
        statusElement.textContent = "Calibration failed: Shoulders too close or detected incorrectly (Width: " + refWidth.toFixed(3) + "). Please reposition and try again.";
        console.warn("Calibration failed: Invalid shoulder width.", refWidth);
        return null;
    }

    // Success
    statusElement.textContent = "Calibration Successful! Processing..."; // Updated by handleCalibrationResult later
    return {
        referenceShoulderWidth: refWidth
    };
}

/**
 * Starts the calibration sequence: shows overlay, starts camera, runs countdown.
 * @param {object} domElements - Object containing references to necessary DOM elements (overlay, mainContent, startButton, recalibrateButton, countdown, status).
 * @param {object} camera - The MediaPipe Camera instance.
 * @param {HTMLVideoElement} videoElement - The video element.
 * @param {function} setCaptureFlagCallback - Callback function in app.js to set the capture flag.
 * @param {function} calibrationResultCallback - Callback function in app.js to handle the calibration result.
 */
export async function startCalibrationSequence(domElements, camera, videoElement, setCaptureFlagCallback, calibrationResultCallback) {
    if (isCalibrating) return; // Prevent multiple starts

    isCalibrating = true;
    setCaptureFlagCallback(false); // Ensure capture flag is reset initially
    if (countdownTimer) clearInterval(countdownTimer); // Clear any existing timer

    // Disable buttons
    domElements.startButton.disabled = true;
    domElements.recalibrateButton.disabled = true;
    domElements.status.textContent = "Starting camera...";
    domElements.countdown.style.display = 'none'; // Hide countdown initially

    // Ensure overlay is visible, main content hidden
    domElements.overlay.classList.remove('hidden');
    domElements.mainContent.classList.add('hidden');

    try {
        // Start the camera if not already running (or restart if needed)
        // Use camera.start() which returns a promise
        if (!camera.video || videoElement.paused || videoElement.ended || videoElement.readyState < 3) {
             await camera.start(); // Wait for camera to actually start
             console.log("Camera started for calibration.");
        } else {
            console.log("Camera already running.");
        }

        // Double check video state after attempting start
        if (videoElement.readyState < 3) { // HAVE_FUTURE_DATA or more
            throw new Error("Camera could not be started or is not ready.");
        }


        domElements.status.textContent = "Get in T-pose (arms bent 90°, hands up)...";

        // Start countdown
        countdownValue = COUNTDOWN_START_VALUE;
        domElements.countdown.textContent = countdownValue;
        domElements.countdown.style.display = 'block'; // Show countdown

        countdownTimer = setInterval(() => {
            countdownValue--;
            domElements.countdown.textContent = countdownValue;
            if (countdownValue <= 0) {
                clearInterval(countdownTimer);
                countdownTimer = null;
                domElements.status.textContent = "Capturing pose...";
                setCaptureFlagCallback(true); // Signal app.js to capture the *next* frame in onResults
                // Keep overlay visible until calibration result is processed in app.js
                // Buttons remain disabled until calibrationResultCallback is called.
            }
        }, 1000);

    } catch (error) {
        console.error("Error starting camera for calibration:", error);
        domElements.status.textContent = `Error starting camera: ${error.message}. Check permissions and refresh.`;
        isCalibrating = false; // Reset state
        setCaptureFlagCallback(false);
         // Reset UI and re-enable buttons immediately on error
        domElements.startButton.disabled = false;
        domElements.recalibrateButton.disabled = false;
        domElements.countdown.style.display = 'none';
        // Call the result callback with null to indicate failure? No, let the UI show the error.
    }
}

// Clean up timer on unload
window.addEventListener('beforeunload', () => {
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }
});