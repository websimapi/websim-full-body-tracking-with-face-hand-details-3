import { config } from './config.js';
import { initBodyTracking, updateBodyMesh, hideBodyMesh, POSE_CONNECTIONS } from './bodyTracking.js';
import { initFaceTracking, updateFaceMesh, hideFaceMesh, FACEMESH_TESSELATION, FACEMESH_CONTOURS } from './faceTracking.js';
import { initHandTracking, updateHandMesh, hideHandMesh, HAND_CONNECTIONS } from './handTracking.js';
import { createBone, updateBone, createTerrain } from './utils.js';
import * as THREE from 'three'; // Import Three.js as a module
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; // Import OrbitControls

// Global references to MediaPipe objects now loaded via script tags
const Holistic = window.Holistic;
const drawConnectors = window.drawConnectors;
const drawLandmarks = window.drawLandmarks;
const Camera = window.Camera;

// DOM Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const statusElement = document.getElementById('status');
const sceneContainer = document.getElementById('scene-container');
const calibrationOverlay = document.getElementById('calibration-overlay');
const calibrateButton = document.getElementById('calibrate-button');
const recalibrateButton = document.getElementById('recalibrate-button');
const countdownElement = document.getElementById('countdown');
const calibrationStatusElement = document.getElementById('calibration-status');
const mainContentElement = document.getElementById('main-content');

// Control checkboxes
const showBodyCheckbox = document.getElementById('show-body');
const showFaceCheckbox = document.getElementById('show-face');
const showHandsCheckbox = document.getElementById('show-hands');

// Tracking state
let holistic;
let camera;
let isInitialized = false;
let isCalibrated = false;
let isCalibrating = false;
let captureForCalibration = false;
let calibrationData = null;
let countdownTimer = null;
let countdownValue = 5;
const BASE_SCALE_FACTOR = 2.5; // Base scaling for the 3D model

// Three.js objects
let scene, renderer, camera3D, controls;
let bodyMesh = {};
let faceMesh = {};
let leftHandMesh = {};
let rightHandMesh = {};
let terrainMesh;

// Helper function to calculate 2D distance between landmarks
function calculateDistance2D(p1, p2) {
    if (!p1 || !p2) return 0;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Initialize the application logic (called after DOM loaded)
async function initializeApp() {
    if (isInitialized) return;
    isInitialized = true; // Prevent re-initialization

    try {
        statusElement.textContent = "Initializing holistic model...";
        calibrationStatusElement.textContent = "Waiting for calibration...";

        // Initialize the holistic model
        holistic = new Holistic({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`
        });

        // Configure the model
        holistic.setOptions(config.modelSettings);

        // Set up the callback for processing results
        holistic.onResults(onResults);

        // Set up the camera - DON'T START YET
        camera = new Camera(video, {
            onFrame: async () => {
                // Send frame only if model is ready and camera is active
                if (holistic && video.readyState === 4) {
                    try {
                        await holistic.send({ image: video });
                    } catch (error) {
                        console.error("Error sending frame to Holistic:", error);
                        statusElement.textContent = "Error processing video frame.";
                        // Optionally stop camera or reset state here
                    }
                }
            },
            width: config.camera.width,
            height: config.camera.height,
            facingMode: 'user' // Explicitly request user-facing camera
        });

        // Initialize Three.js scene
        initThreeJS();

        // Setup calibration button listener
        calibrateButton.addEventListener('click', startCalibration);
        recalibrateButton.addEventListener('click', startCalibration); // Allow recalibration

        // Initial UI state: show calibration overlay, hide main content
        calibrationOverlay.classList.remove('hidden');
        mainContentElement.classList.add('hidden');

        // Don't start camera automatically, wait for calibration button click
        statusElement.textContent = "Ready to calibrate.";

    } catch (error) {
        console.error("Error initializing:", error);
        statusElement.textContent = "Initialization Error: " + error.message;
        calibrationStatusElement.textContent = "Initialization failed. Please refresh.";
        // Hide calibration button if init fails fundamentally
        calibrateButton.style.display = 'none';
    }
}

// Start the calibration process
async function startCalibration() {
    if (isCalibrating) return; // Prevent multiple clicks

    isCalibrating = true;
    isCalibrated = false; // Reset calibration status
    calibrationData = null;
    calibrateButton.disabled = true; // Disable button during calibration
    recalibrateButton.disabled = true;
    calibrationStatusElement.textContent = "Starting camera...";
    countdownElement.style.display = 'none'; // Hide countdown initially

    // Ensure overlay is visible, main content hidden
    calibrationOverlay.classList.remove('hidden');
    mainContentElement.classList.add('hidden');

    try {
        // Start the camera if not already running (or restart if needed)
        if (!camera.video) { // Check if camera was ever started
            await camera.start();
        } else if (video.paused) { // If paused from previous session
            video.play();
        }
        resizeCanvasToDisplaySize(); // Ensure canvas is sized correctly
        calibrationStatusElement.textContent = "Get in position...";

        // Start countdown
        countdownValue = 5;
        countdownElement.textContent = countdownValue;
        countdownElement.style.display = 'block'; // Show countdown

        countdownTimer = setInterval(() => {
            countdownValue--;
            countdownElement.textContent = countdownValue;
            if (countdownValue <= 0) {
                clearInterval(countdownTimer);
                countdownTimer = null;
                calibrationStatusElement.textContent = "Capturing pose...";
                captureForCalibration = true; // Signal onResults to capture the next frame
                // Keep the overlay visible until calibration is confirmed in onResults
            }
        }, 1000);

    } catch (error) {
        console.error("Error starting camera for calibration:", error);
        calibrationStatusElement.textContent = "Error starting camera. Please check permissions.";
        isCalibrating = false;
        calibrateButton.disabled = false;
        recalibrateButton.disabled = false;
        countdownElement.style.display = 'none';
    }
}

// Perform calibration using captured results
function calibrate(results) {
    if (!results || !results.poseLandmarks || results.poseLandmarks.length < 13) {
        calibrationStatusElement.textContent = "Calibration failed: Could not detect full body pose. Please try again.";
        console.warn("Calibration failed: Insufficient pose landmarks.", results?.poseLandmarks?.length);
        // Allow user to try again
        isCalibrating = false;
        captureForCalibration = false;
        calibrateButton.disabled = false;
        recalibrateButton.disabled = false;
        countdownElement.style.display = 'none'; // Hide countdown
        return false; // Indicate failure
    }

    const shoulderLeft = results.poseLandmarks[11];
    const shoulderRight = results.poseLandmarks[12];

    // Use 2D distance on the capture frame as the reference
    const refWidth = calculateDistance2D(shoulderLeft, shoulderRight);

    if (refWidth < 0.01) { // Check for very small or zero width
        calibrationStatusElement.textContent = "Calibration failed: Shoulders too close or not detected properly. Please reposition and try again.";
        console.warn("Calibration failed: Invalid shoulder width.", refWidth);
        // Allow user to try again
        isCalibrating = false;
        captureForCalibration = false;
        calibrateButton.disabled = false;
        recalibrateButton.disabled = false;
        countdownElement.style.display = 'none'; // Hide countdown
        return false; // Indicate failure
    }

    calibrationData = {
        referenceShoulderWidth: refWidth
    };
    console.log("Calibration successful. Reference shoulder width:", refWidth);
    calibrationStatusElement.textContent = "Calibration Successful!";
    return true; // Indicate success
}

// Initialize Three.js scene (called once during initializeApp)
function initThreeJS() {
    // Create scene
    scene = new THREE.Scene();
    // scene.background = new THREE.Color(config.threeJS.background); // Skybox overrides this

    // Create camera
    camera3D = new THREE.PerspectiveCamera(75, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.1, 1000);
    camera3D.position.set(0, 0.5, 4);
    // camera3D.lookAt(0, -0.5, 0); // OrbitControls manages looking

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    sceneContainer.appendChild(renderer.domElement);

    // Initialize OrbitControls
    controls = new OrbitControls(camera3D, renderer.domElement);
    controls.target.set(0, 0, 0); // Look at the center origin
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI / 1.8; // Prevent looking directly down/up too far
    controls.update();

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    scene.add(directionalLight);

    // Add a Skybox
    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/px.jpg',
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/nx.jpg',
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/py.jpg',
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/ny.jpg',
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/pz.jpg',
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/nz.jpg'
    ]);
    scene.background = texture;

    // Create and add terrain
    terrainMesh = createTerrain(20, 20, 50, 50);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // Initialize avatar meshes (pass base scale)
    faceMesh = initFaceTracking(scene, config, BASE_SCALE_FACTOR);
    bodyMesh = initBodyTracking(scene, config, BASE_SCALE_FACTOR);
    leftHandMesh = initHandTracking(scene, config, 'left', BASE_SCALE_FACTOR);
    rightHandMesh = initHandTracking(scene, config, 'right', BASE_SCALE_FACTOR);

    function enableShadows(meshGroup) {
        if (!meshGroup) return;
        Object.values(meshGroup.landmarks || {}).forEach(mesh => mesh.castShadow = true);
        Object.values(meshGroup.joints || {}).forEach(mesh => mesh.castShadow = true);
        Object.values(meshGroup.connections || {}).forEach(mesh => mesh.castShadow = true);
        Object.values(meshGroup.bones || {}).forEach(mesh => mesh.castShadow = true);
        if (meshGroup.neckBone) meshGroup.neckBone.castShadow = true;
    }
    enableShadows(bodyMesh);
    enableShadows(faceMesh);
    enableShadows(leftHandMesh);
    enableShadows(rightHandMesh);

    // Handle window resize for Three.js canvas
    window.addEventListener('resize', () => {
        if (!renderer || !camera3D) return; // Don't resize if not initialized
        const width = sceneContainer.clientWidth;
        const height = sceneContainer.clientHeight;
        if (width > 0 && height > 0) {
            camera3D.aspect = width / height;
            camera3D.updateProjectionMatrix();
            renderer.setSize(width, height);
        }
    });

    // Start animation loop
    animate();
}

// Animation loop for Three.js
function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update(); // Update orbit controls
    if (renderer && scene && camera3D) { // Check if initialized
        renderer.render(scene, camera3D);
    }
}

// Handle window resize for webcam canvas
window.addEventListener('resize', resizeCanvasToDisplaySize);

function resizeCanvasToDisplaySize() {
    if (!video || !canvas) return;
    // Use video intrinsic dimensions once loaded, or client dimensions otherwise
    const displayWidth = video.clientWidth;
    const displayHeight = video.clientHeight;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        console.log(`Resized output canvas to ${displayWidth}x${displayHeight}`);
    }
}

// Update the 3D scene with new pose data
function updateThreeJSPose(results, dynamicScale) {
    // Ensure dynamicScale is a valid number, default to 1.0 if not
    const scale = (typeof dynamicScale === 'number' && isFinite(dynamicScale)) ? dynamicScale : 1.0;

    // Update face first
    if (showFaceCheckbox.checked && results.faceLandmarks) {
        updateFaceMesh(results.faceLandmarks, faceMesh, updateBone, scale); // Pass scale
    } else {
        hideFaceMesh(faceMesh);
    }

    // Update body pose
    if (showBodyCheckbox.checked && results.poseLandmarks) {
        updateBodyMesh(
            results.poseLandmarks,
            bodyMesh,
            updateBone,
            results.leftHandLandmarks,
            results.rightHandLandmarks,
            results.faceLandmarks,
            faceMesh,
            scale // Pass scale
        );
    } else {
        hideBodyMesh(bodyMesh);
    }

    // Update hands
    if (showHandsCheckbox.checked) {
        if (results.leftHandLandmarks) {
            updateHandMesh(results.leftHandLandmarks, leftHandMesh, updateBone, scale); // Pass scale
        } else {
            hideHandMesh(leftHandMesh);
        }
        if (results.rightHandLandmarks) {
            updateHandMesh(results.rightHandLandmarks, rightHandMesh, updateBone, scale); // Pass scale
        } else {
            hideHandMesh(rightHandMesh);
        }
    } else {
        hideHandMesh(leftHandMesh);
        hideHandMesh(rightHandMesh);
    }
}

// Process and visualize the tracking results
function onResults(results) {
    // Ensure canvas context is valid
    if (!ctx || canvas.width === 0 || canvas.height === 0) {
        // console.warn("Canvas not ready for drawing.");
        return;
    }
    // Ensure video dimensions are available for canvas sizing
    if (video.videoWidth > 0 && video.videoHeight > 0) {
        resizeCanvasToDisplaySize(); // Adjust canvas size if video size changed
    }

    // Handle calibration capture
    if (isCalibrating && captureForCalibration) {
        captureForCalibration = false; // Only capture once
        if (calibrate(results)) { // Perform calibration
            // Calibration successful
            isCalibrated = true;
            isCalibrating = false;
            statusElement.textContent = "Tracking active";
            // Hide overlay, show main content
            calibrationOverlay.classList.add('hidden');
            mainContentElement.classList.remove('hidden');
            calibrateButton.disabled = false; // Re-enable buttons
            recalibrateButton.disabled = false;
            // Optional: Brief success message then clear
            setTimeout(() => { calibrationStatusElement.textContent = ""; }, 2000);

        } else {
            // Calibration failed - UI handled within calibrate()
            // Keep overlay visible, main content hidden
            isCalibrating = false; // Reset calibrating flag
            calibrateButton.disabled = false;
            recalibrateButton.disabled = false;
            // Don't proceed with drawing or updating 3D pose
            return;
        }
    }

    // --- Regular Processing ---
    // Don't process further if not calibrated
    if (!isCalibrated) {
        // Clear canvas if we were previously drawing but lost calibration somehow
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Optionally hide 3D model parts if calibration is lost?
        // hideBodyMesh(bodyMesh); hideFaceMesh(faceMesh); etc.
        return;
    }

    // Calculate dynamic scale based on current shoulder width vs calibrated width
    let dynamicScale = 1.0;
    if (calibrationData && results.poseLandmarks && results.poseLandmarks.length > 12) {
        const currentShoulderWidth = calculateDistance2D(results.poseLandmarks[11], results.poseLandmarks[12]);
        if (calibrationData.referenceShoulderWidth > 0.01 && currentShoulderWidth > 0.01) {
            // Scale = current / reference. If current is smaller, scale is < 1 (further away)
            dynamicScale = currentShoulderWidth / calibrationData.referenceShoulderWidth;
            // Clamp scale to avoid extreme values? e.g., dynamicScale = Math.max(0.3, Math.min(2.0, dynamicScale));
        }
    }

    // --- Update 3D Visualization ---
    try {
        // Only update if we have the necessary landmarks
        if (results.poseLandmarks) {
            updateThreeJSPose(results, dynamicScale);
        } else {
            // If pose landmarks are lost, hide the entire model?
            hideBodyMesh(bodyMesh);
            hideFaceMesh(faceMesh);
            hideHandMesh(leftHandMesh);
            hideHandMesh(rightHandMesh);
        }
    } catch (error) {
        console.error("Error updating 3D pose:", error);
        statusElement.textContent = "Error updating 3D view.";
        // Consider hiding the model or showing an error state in 3D?
    }

    // --- Draw 2D Overlay on Webcam Feed ---
    ctx.save(); // Save context state
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw body pose if enabled
    if (showBodyCheckbox.checked && results.poseLandmarks) {
        let activePoseConnections = [...POSE_CONNECTIONS];
        drawConnectors(
            ctx, results.poseLandmarks, activePoseConnections,
            { color: config.colors.body.connectors, lineWidth: 2 } // Thinner lines?
        );

        // Optionally draw fewer landmarks
        const landmarksToDraw = {};
        results.poseLandmarks.forEach((lm, index) => {
            // Example: Draw only major joints, skip face (0-10) and maybe fingers if hands active
            if (index > 10) { // Skip face
                // Further filtering if needed based on hand visibility
                landmarksToDraw[index] = lm;
            }
        });

        drawLandmarks(
            ctx, Object.values(landmarksToDraw),
            { color: config.colors.body.landmarks, radius: config.pointSizes.body }
        );
    }

    // Draw face if enabled
    if (showFaceCheckbox.checked && results.faceLandmarks) {
        drawConnectors(
            ctx, results.faceLandmarks, FACEMESH_CONTOURS, // Use contours for cleaner look
            { color: config.colors.face.connectors, lineWidth: 1 }
        );
    }

    // Draw hands if enabled
    if (showHandsCheckbox.checked) {
        if (results.leftHandLandmarks) {
            drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: config.colors.leftHand.connectors, lineWidth: 2 });
            drawLandmarks(ctx, results.leftHandLandmarks, { color: config.colors.leftHand.landmarks, radius: config.pointSizes.hand });
        }
        if (results.rightHandLandmarks) {
            drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: config.colors.rightHand.connectors, lineWidth: 2 });
            drawLandmarks(ctx, results.rightHandLandmarks, { color: config.colors.rightHand.landmarks, radius: config.pointSizes.hand });
        }
    }

    ctx.restore(); // Restore context state
}

// Initialize the app when the page loads
window.addEventListener('DOMContentLoaded', initializeApp);

// Graceful shutdown/cleanup
window.addEventListener('beforeunload', () => {
    if (camera) {
        camera.stop();
    }
    if (holistic) {
        holistic.close();
    }
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }
    // Optional: Remove event listeners if needed, though usually handled by browser unload
});