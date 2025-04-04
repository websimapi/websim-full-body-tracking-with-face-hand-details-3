import { config } from './config.js';
import { initBodyTracking, updateBodyMesh, hideBodyMesh, POSE_CONNECTIONS } from './bodyTracking.js';
import { initFaceTracking, updateFaceMesh, hideFaceMesh, FACEMESH_TESSELATION, FACEMESH_CONTOURS } from './faceTracking.js';
import { initHandTracking, updateHandMesh, hideHandMesh, HAND_CONNECTIONS } from './handTracking.js';
import { createBone, updateBone, createTerrain } from './utils.js';
import { domElements, debugState, setupDebugMenuToggle, initDebugControls, resizeCanvasToDisplaySize, updateStatus, updateCameraReadouts } from './ui.js'; // Import UI elements and functions
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Global references to MediaPipe objects (loaded via script tags)
const Holistic = window.Holistic;
const drawConnectors = window.drawConnectors;
const drawLandmarks = window.drawLandmarks;
const Camera = window.Camera;

// --- Core Application State ---
let holistic;
let mediaPipeCamera; // Renamed from camera to avoid conflict with threeJS camera

// --- Three.js Objects ---
let scene, renderer, camera3D, controls;
let bodyMesh = {};
let faceMesh = {};
let leftHandMesh = {};
let rightHandMesh = {};
let terrainMesh;
const clock = new THREE.Clock(); // Clock for animation timing


// --- Initialization ---

async function init() {
    try {
        updateStatus("Initializing...");

        // Setup UI Controls & Listeners (Moved to ui.js)
        setupDebugMenuToggle();
        initDebugControls();

        // Initialize MediaPipe Holistic
        updateStatus("Loading Holistic model...");
        holistic = new Holistic({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`
        });
        holistic.setOptions(config.modelSettings);
        holistic.onResults(onResults);

        // Initialize Three.js Scene
        updateStatus("Setting up 3D scene...");
        initThreeJS(); // Includes avatar setup

        // Initialize Camera Feed
        updateStatus("Accessing webcam...");
        mediaPipeCamera = new Camera(domElements.video, {
            onFrame: async () => {
                // Send video frame to Holistic only if model and video are ready
                if (holistic && domElements.video.readyState >= 2) {
                   await holistic.send({image: domElements.video});
                }
            },
            width: config.camera.width,
            height: config.camera.height,
            fps: config.camera.fps // Use desired FPS from config
        });

        await mediaPipeCamera.start();
        resizeCanvasToDisplaySize(); // Initial resize of overlay canvas

        updateStatus("Tracking active");

    } catch (error) {
        console.error("Initialization Error:", error);
        updateStatus("Error: " + error.message);
        // Ensure debug menu is visible on error
        if (domElements.debugMenu) domElements.debugMenu.classList.remove('collapsed');
    }
}


// --- Three.js Scene Setup ---

function initThreeJS() {
    // Scene
    scene = new THREE.Scene();
    // scene.background = new THREE.Color(config.threeJS.background); // Skybox replaces this

    // Camera
    camera3D = new THREE.PerspectiveCamera(
        75, // Field of View
        domElements.sceneContainer.clientWidth / domElements.sceneContainer.clientHeight, // Aspect Ratio
        0.1, // Near clipping plane
        1000 // Far clipping plane
    );
    camera3D.position.set(0, 0.5, 4); // Initial camera position

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(domElements.sceneContainer.clientWidth, domElements.sceneContainer.clientHeight);
    renderer.shadowMap.enabled = true; // Enable shadows
    renderer.setPixelRatio(window.devicePixelRatio); // Adjust for high DPI displays
    domElements.sceneContainer.appendChild(renderer.domElement);

    // OrbitControls
    controls = new OrbitControls(camera3D, renderer.domElement);
    controls.target.set(0, 0.5, 0); // Point controls towards the center of the potential avatar
    controls.enableDamping = true; // Smooth camera movement
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false; // Prevent panning vertically when orbiting
    controls.minDistance = 1; // Closest zoom
    controls.maxDistance = 20; // Furthest zoom
    controls.maxPolarAngle = Math.PI / 1.9; // Limit looking down
    controls.minPolarAngle = Math.PI / 4;   // Limit looking up
    controls.update();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.bias = -0.0005;
    const shadowCamSize = 10;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    scene.add(directionalLight);

    // Skybox
    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/px.jpg', // Right
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/nx.jpg', // Left
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/py.jpg', // Top
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/ny.jpg', // Bottom
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/pz.jpg', // Front
        'https://threejs.org/examples/textures/cube/skyboxsun25deg/nz.jpg'  // Back
    ]);
    scene.background = texture;

    // Terrain
    terrainMesh = createTerrain(20, 20, 50, 50); // Width, Height, SegmentsW, SegmentsH
    terrainMesh.receiveShadow = true; // Allow terrain to receive shadows
    terrainMesh.position.y = -1.85; // Position below the origin
    scene.add(terrainMesh);

    // Initialize Avatar Meshes (Face, Body, Hands)
    faceMesh = initFaceTracking(scene, config);
    bodyMesh = initBodyTracking(scene, config);
    leftHandMesh = initHandTracking(scene, config, 'left');
    rightHandMesh = initHandTracking(scene, config, 'right');

    // Enable shadows for avatar parts
    enableShadows(bodyMesh);
    enableShadows(faceMesh);
    enableShadows(leftHandMesh);
    enableShadows(rightHandMesh);

    // Handle Window Resizing
    window.addEventListener('resize', onWindowResize);

    // Start the Animation Loop
    animate();
}

/** Helper function to enable casting/receiving shadows for mesh parts */
function enableShadows(meshGroup) {
    if (!meshGroup) return;
    // Landmarks/Joints primarily cast shadows
    Object.values(meshGroup.landmarks || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = false; } });
    Object.values(meshGroup.joints || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = false; } });
    // Connections/Bones cast and can receive shadows
    Object.values(meshGroup.connections || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
    Object.values(meshGroup.bones || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
    if (meshGroup.neckBone) { meshGroup.neckBone.castShadow = true; meshGroup.neckBone.receiveShadow = true; }
}

/** Handles window resize events to update camera and renderer */
function onWindowResize() {
    if (camera3D && renderer && domElements.sceneContainer) {
        const width = domElements.sceneContainer.clientWidth;
        const height = domElements.sceneContainer.clientHeight;

        camera3D.aspect = width / height;
        camera3D.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
    resizeCanvasToDisplaySize(); // Also resize the overlay canvas
}

// --- Animation Loop ---

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta(); // Get time difference for smooth animations

    if(controls) controls.update(delta); // Update OrbitControls (important for damping)

    // Update Debug Readouts (moved to ui.js)
    updateCameraReadouts(camera3D.position, controls.target);

    // Render the Scene
    if (renderer && scene && camera3D) {
      renderer.render(scene, camera3D);
    }
}

// --- MediaPipe Results Processing ---

function onResults(results) {
    // Ensure overlay canvas is ready and sized correctly
    resizeCanvasToDisplaySize();
    domElements.ctx.save(); // Save canvas context state
    domElements.ctx.clearRect(0, 0, domElements.canvas.width, domElements.canvas.height); // Clear previous drawings

    // Check if we have valid pose results to process
    if (!results || !results.poseLandmarks) {
       // Hide all 3D meshes if no results are detected
       hideFaceMesh(faceMesh);
       hideBodyMesh(bodyMesh);
       hideHandMesh(leftHandMesh);
       hideHandMesh(rightHandMesh);
       domElements.ctx.restore(); // Restore canvas context state
       return; // Exit if no results
    }

    // Update the 3D avatar pose based on MediaPipe results and debug settings
    updateThreeJSPose(results);

    // --- Draw 2D Overlay on Webcam Feed ---
    draw2DOverlay(results); // Encapsulated 2D drawing logic

    domElements.ctx.restore(); // Restore canvas context state
}

// --- 3D Pose Update ---

function updateThreeJSPose(results) {
    // Use debugState imported from ui.js for offsets and scales
    const { globalOffset, globalScale, localOffsets, localScales } = debugState;

    // Update Face Mesh
    if (domElements.showFaceCheckbox.checked && results.faceLandmarks) {
        updateFaceMesh(
            results.faceLandmarks, faceMesh, updateBone,
            globalOffset, globalScale, localOffsets.face, localScales.face
        );
    } else {
        hideFaceMesh(faceMesh);
    }

    // Update Body Mesh
    if (domElements.showBodyCheckbox.checked && results.poseLandmarks) {
        updateBodyMesh(
            results.poseLandmarks, bodyMesh, updateBone,
            results.leftHandLandmarks, results.rightHandLandmarks, results.faceLandmarks, faceMesh,
            globalOffset, globalScale, localOffsets.body, localScales.body
        );
    } else {
        hideBodyMesh(bodyMesh);
    }

    // Update Hand Meshes
    if (domElements.showHandsCheckbox.checked) {
        // Left Hand
        if (results.leftHandLandmarks) {
            updateHandMesh(
                results.leftHandLandmarks, leftHandMesh, updateBone,
                globalOffset, globalScale, localOffsets.leftHand, localScales.leftHand
            );
        } else {
            hideHandMesh(leftHandMesh);
        }
        // Right Hand
        if (results.rightHandLandmarks) {
            updateHandMesh(
                results.rightHandLandmarks, rightHandMesh, updateBone,
                globalOffset, globalScale, localOffsets.rightHand, localScales.rightHand
            );
        } else {
            hideHandMesh(rightHandMesh);
        }
    } else {
        hideHandMesh(leftHandMesh);
        hideHandMesh(rightHandMesh);
    }
}


// --- 2D Overlay Drawing ---

/** Draws the 2D landmarks and connectors onto the overlay canvas */
function draw2DOverlay(results) {
    const ctx = domElements.ctx;
    const canvas = domElements.canvas;
    const scaleX = canvas.width;
    const scaleY = canvas.height;

    // Helper to scale landmarks to canvas coordinates
    const scaleLandmarks = (landmarks) => {
        if (!landmarks) return null;
        return landmarks.map(lm => ({
            x: lm.x * scaleX,
            y: lm.y * scaleY,
            z: lm.z, // Keep z, might be useful later
            visibility: lm.visibility
        }));
    };

    // Scale all landmark sets
    const poseLandmarksScaled = scaleLandmarks(results.poseLandmarks);
    const faceLandmarksScaled = scaleLandmarks(results.faceLandmarks);
    const leftHandLandmarksScaled = scaleLandmarks(results.leftHandLandmarks);
    const rightHandLandmarksScaled = scaleLandmarks(results.rightHandLandmarks);

    const showBody = domElements.showBodyCheckbox.checked;
    const showFace = domElements.showFaceCheckbox.checked;
    const showHands = domElements.showHandsCheckbox.checked;

    // Draw Body Pose
    if (showBody && poseLandmarksScaled) {
        drawBodyOverlay(ctx, poseLandmarksScaled, showHands, leftHandLandmarksScaled, rightHandLandmarksScaled);
    }

    // Draw Face Contours
    if (showFace && faceLandmarksScaled) {
        drawFaceOverlay(ctx, faceLandmarksScaled);
    }

    // Draw Hands
    if (showHands) {
        if (leftHandLandmarksScaled) drawHandOverlay(ctx, leftHandLandmarksScaled, 'leftHand');
        if (rightHandLandmarksScaled) drawHandOverlay(ctx, rightHandLandmarksScaled, 'rightHand');
    }
}

/** Draws body landmarks and connectors for the 2D overlay */
function drawBodyOverlay(ctx, landmarks, handsVisible, leftHandActive, rightHandActive) {
    let activePoseConnections = [...POSE_CONNECTIONS];
    // Filter out wrist-to-finger connections if hands are shown separately
    if (handsVisible) {
        const wristToFingerLeftIndices = [[15, 17], [15, 19], [15, 21]];
        const wristToFingerRightIndices = [[16, 18], [16, 20], [16, 22]];
        activePoseConnections = activePoseConnections.filter(conn => {
            const isLeftWf = leftHandActive && wristToFingerLeftIndices.some(wf => (wf[0] === conn[0] && wf[1] === conn[1]) || (wf[0] === conn[1] && wf[1] === conn[0]));
            const isRightWf = rightHandActive && wristToFingerRightIndices.some(wf => (wf[0] === conn[0] && wf[1] === conn[1]) || (wf[0] === conn[1] && wf[1] === conn[0]));
            return !isLeftWf && !isRightWf;
        });
    }

    drawConnectors(ctx, landmarks, activePoseConnections, {
        color: config.colors.body.connectors,
        lineWidth: 2 // Slightly thicker for visibility
    });

    // Draw only relevant body landmarks (exclude face, and wrists/fingers if hands are shown)
    const landmarksToDraw = {};
    const leftFingerBaseIndices = [17, 19, 21];
    const rightFingerBaseIndices = [18, 20, 22];

    landmarks.forEach((lm, index) => {
        if (index < 11) return; // Skip face landmarks (0-10)
        if (handsVisible && leftHandActive && (index === 15 || leftFingerBaseIndices.includes(index))) return;
        if (handsVisible && rightHandActive && (index === 16 || rightFingerBaseIndices.includes(index))) return;
        landmarksToDraw[index] = lm; // Use index as key to handle potential gaps if filtering
    });

    drawLandmarks(ctx, Object.values(landmarksToDraw), { // Draw only the filtered landmarks
        color: config.colors.body.landmarks,
        radius: config.pointSizes.body / 1.5 // Smaller points for overlay
    });
}

/** Draws face contours for the 2D overlay */
function drawFaceOverlay(ctx, landmarks) {
    drawConnectors(ctx, landmarks, FACEMESH_CONTOURS, {
        color: config.colors.face.connectors,
        lineWidth: 1 // Thin lines for face contours
    });
    // Avoid drawing face landmarks usually, too cluttered
    // drawLandmarks(ctx, landmarks, {color: config.colors.face.landmarks, radius: config.pointSizes.faceMesh});
}

/** Draws hand landmarks and connectors for the 2D overlay */
function drawHandOverlay(ctx, landmarks, side) {
    const colorKey = side === 'leftHand' ? 'leftHand' : 'rightHand';
    drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
        color: config.colors[colorKey].connectors,
        lineWidth: 2
    });
    drawLandmarks(ctx, landmarks, {
        color: config.colors[colorKey].landmarks,
        radius: config.pointSizes.hand / 1.5
    });
}


// --- Run Initialization ---
window.addEventListener('DOMContentLoaded', init);

// --- Cleanup (Optional but good practice) ---
window.addEventListener('beforeunload', () => {
    if (mediaPipeCamera) {
        mediaPipeCamera.stop();
    }
    if (holistic) {
        holistic.close();
    }
    // Consider disposing Three.js resources if needed
});