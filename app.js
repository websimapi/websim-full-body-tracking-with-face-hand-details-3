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
const sceneContainer = document.getElementById('scene-container');

// Debug Menu Elements
const debugMenu = document.getElementById('debug-menu');
const toggleDebugBtn = document.getElementById('toggle-debug-btn');
const debugContent = document.getElementById('debug-content'); // Content area to hide/show
const statusElement = document.getElementById('status'); // Moved inside debug menu


// Control checkboxes (ensure selectors are correct after HTML move)
const showBodyCheckbox = document.getElementById('show-body');
const showFaceCheckbox = document.getElementById('show-face');
const showHandsCheckbox = document.getElementById('show-hands');

// Debug DOM Elements (Global)
const globalOffsetXSlider = document.getElementById('global-offset-x');
const globalOffsetYSlider = document.getElementById('global-offset-y');
const globalOffsetZSlider = document.getElementById('global-offset-z');
const globalScaleSlider = document.getElementById('global-scale');
const globalOffsetXValue = document.getElementById('global-offset-x-value');
const globalOffsetYValue = document.getElementById('global-offset-y-value');
const globalOffsetZValue = document.getElementById('global-offset-z-value');
const globalScaleValue = document.getElementById('global-scale-value');

// Debug DOM Elements (Part-Specific) - Define refs for all new sliders/values
const debugElements = {
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

// Debug DOM Elements (Readouts)
const camPosDisplay = document.getElementById('cam-pos');
const camTargetDisplay = document.getElementById('cam-target');

// Tracking state
let holistic;
let camera;

// Three.js objects
let scene, renderer, camera3D, controls;
let bodyMesh = {};
let faceMesh = {};
let leftHandMesh = {};
let rightHandMesh = {};
let terrainMesh;

// Debug parameters (Global)
let debugGlobalOffset = new THREE.Vector3(0, 0, 0);
let debugGlobalScale = 1.0;

// Debug parameters (Part-Specific)
let debugLocalOffsets = {
    face: new THREE.Vector3(0, 0, 0),
    body: new THREE.Vector3(0, 0, 0),
    leftHand: new THREE.Vector3(0, 0, 0),
    rightHand: new THREE.Vector3(0, 0, 0),
};
let debugLocalScales = {
    face: 1.0,
    body: 1.0,
    leftHand: 1.0,
    rightHand: 1.0,
};

// Initialize the application
async function init() {
    try {
        statusElement.textContent = "Initializing...";

        // --- Setup UI Controls First ---
        setupDebugMenuToggle(); // Setup the toggle button listener

        // Initialize Debug Controls Listeners (Sliders, etc.)
        initDebugControls();

        // --- Initialize MediaPipe ---
        statusElement.textContent = "Loading Holistic model...";
        holistic = new Holistic({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`
        });
        holistic.setOptions(config.modelSettings);
        holistic.onResults(onResults);

        // --- Initialize Three.js ---
        statusElement.textContent = "Setting up 3D scene...";
        initThreeJS(); // Includes setting up avatar meshes

        // --- Initialize Camera ---
        statusElement.textContent = "Accessing webcam...";
        camera = new Camera(video, {
            onFrame: async () => {
                if (holistic && video.readyState >= 2) { // Check holistic & video ready state
                   await holistic.send({image: video});
                }
            },
            width: config.camera.width,
            height: config.camera.height,
            fps: config.camera.fps
        });

        await camera.start();
        resizeCanvasToDisplaySize(); // Resize overlay canvas

        statusElement.textContent = "Tracking active";

    } catch (error) {
        console.error("Error initializing:", error);
        statusElement.textContent = "Error: " + error.message;
        if (debugMenu) debugMenu.classList.remove('collapsed'); // Show debug menu on error
    }
}


// Setup listener for the debug menu toggle button
function setupDebugMenuToggle() {
    if (toggleDebugBtn && debugMenu) {
        // Start collapsed by default if not on smallest screens (where button moves inside)
        if (window.innerWidth > 480) {
             debugMenu.classList.add('collapsed');
        }

        toggleDebugBtn.addEventListener('click', () => {
            debugMenu.classList.toggle('collapsed');
        });
    } else {
        console.warn("Debug toggle button or menu not found.");
    }
}


// Initialize Three.js scene
function initThreeJS() {
    // Create scene
    scene = new THREE.Scene();
    // scene.background = new THREE.Color(config.threeJS.background); // Replaced by skybox

    // Create camera
    camera3D = new THREE.PerspectiveCamera(75, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.1, 1000);
    camera3D.position.set(0, 0.5, 4);
    // camera3D.lookAt(0, -0.5, 0); // Look slightly down initially

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(window.devicePixelRatio); // Adjust for high DPI screens
    sceneContainer.appendChild(renderer.domElement);

    // Initialize OrbitControls
    controls = new OrbitControls(camera3D, renderer.domElement);
    controls.target.set(0, 0.5, 0); // Target center of potential avatar
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI / 1.9; // Prevent looking straight down or up too far
    controls.minPolarAngle = Math.PI / 4; // Prevent looking too low
    controls.update();

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Slightly brighter ambient
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2); // Slightly brighter directional
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.bias = -0.0005; // Adjust shadow bias to prevent artifacts
    // Set shadow camera bounds appropriately for the scene scale
    const shadowCamSize = 10;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;

    scene.add(directionalLight);
    // Optional: Add a light helper
    // const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 1);
    // scene.add(lightHelper);
    // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // scene.add(shadowHelper);


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
    terrainMesh.position.y = -1.85; // Ensure it's below the origin slightly more
    scene.add(terrainMesh);

    // Initialize avatar meshes
    faceMesh = initFaceTracking(scene, config);
    bodyMesh = initBodyTracking(scene, config);
    leftHandMesh = initHandTracking(scene, config, 'left');
    rightHandMesh = initHandTracking(scene, config, 'right');

    function enableShadows(meshGroup) {
        if (!meshGroup) return;
        Object.values(meshGroup.landmarks || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = false; } }); // Landmarks cast, don't receive much
        Object.values(meshGroup.joints || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = false; } }); // Joints cast
        Object.values(meshGroup.connections || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; } }); // Bones cast and receive
        Object.values(meshGroup.bones || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; } }); // Bones cast and receive
        if (meshGroup.neckBone) { meshGroup.neckBone.castShadow = true; meshGroup.neckBone.receiveShadow = true; }
    }
    enableShadows(bodyMesh);
    enableShadows(faceMesh);
    enableShadows(leftHandMesh);
    enableShadows(rightHandMesh);

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Start animation loop
    animate();
}

function onWindowResize() {
    if (camera3D && renderer && sceneContainer) {
        const width = sceneContainer.clientWidth;
        const height = sceneContainer.clientHeight;

        camera3D.aspect = width / height;
        camera3D.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
     resizeCanvasToDisplaySize(); // Also resize the overlay canvas
}


// Initialize Debug Controls Listeners
function initDebugControls() {
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

    // --- Part-Specific Controls ---
    function setupPartControls(partName) {
        const elements = debugElements[partName];
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

    setupPartControls('face');
    setupPartControls('body');
    setupPartControls('leftHand');
    setupPartControls('rightHand');

    // Set initial display values for global controls
    globalOffsetXValue.textContent = debugGlobalOffset.x.toFixed(2);
    globalOffsetYValue.textContent = debugGlobalOffset.y.toFixed(2);
    globalOffsetZValue.textContent = debugGlobalOffset.z.toFixed(2);
    globalScaleValue.textContent = debugGlobalScale.toFixed(2);
}

// Format vector for display
function formatVector(vec, precision = 2) {
    if (!vec) return 'N/A';
    return `(${vec.x.toFixed(precision)}, ${vec.y.toFixed(precision)}, ${vec.z.toFixed(precision)})`;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta(); // If using physics or time-based animations

    if(controls) controls.update(); // Required if damping is enabled

    // Update debug readouts
    if (camera3D && controls) {
        camPosDisplay.textContent = formatVector(camera3D.position);
        camTargetDisplay.textContent = formatVector(controls.target);
    }

    if (renderer && scene && camera3D) { // Ensure objects exist
      renderer.render(scene, camera3D);
    }
}

// Clock for animation timing (if needed later)
const clock = new THREE.Clock();


// Handle resizing the overlay canvas
// window.addEventListener('resize', resizeCanvasToDisplaySize); // Listener moved to onWindowResize

function resizeCanvasToDisplaySize() {
    if (!video || !canvas || video.videoWidth === 0) return; // Add guards and check video dimensions

    const displayWidth = video.clientWidth;
    const displayHeight = video.clientHeight;

    // Check if the canvas size is different to avoid unnecessary resizing
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        // console.log(`Resized overlay canvas to ${displayWidth}x${displayHeight}`);
    }
}

// Update the 3D scene with new pose data
function updateThreeJSPose(results) {
    // Update face first, as body might depend on its position
    if (showFaceCheckbox.checked && results.faceLandmarks) {
        updateFaceMesh(
            results.faceLandmarks,
            faceMesh,
            updateBone,
            debugGlobalOffset,
            debugGlobalScale,
            debugLocalOffsets.face, // Pass local face offset
            debugLocalScales.face    // Pass local face scale
        );
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
            faceMesh, // Pass face mesh for neck connection
            debugGlobalOffset, // Pass global offset
            debugGlobalScale,  // Pass global scale
            debugLocalOffsets.body, // Pass local body offset
            debugLocalScales.body    // Pass local body scale
        );
    } else {
        hideBodyMesh(bodyMesh);
    }

    // Update hands
    if (showHandsCheckbox.checked) {
        // Update left hand
        if (results.leftHandLandmarks) {
            updateHandMesh(
                results.leftHandLandmarks,
                leftHandMesh,
                updateBone,
                debugGlobalOffset,
                debugGlobalScale,
                debugLocalOffsets.leftHand, // Pass local left hand offset
                debugLocalScales.leftHand   // Pass local left hand scale
            );
        } else {
            hideHandMesh(leftHandMesh);
        }

        // Update right hand
        if (results.rightHandLandmarks) {
            updateHandMesh(
                results.rightHandLandmarks,
                rightHandMesh,
                updateBone,
                debugGlobalOffset,
                debugGlobalScale,
                debugLocalOffsets.rightHand, // Pass local right hand offset
                debugLocalScales.rightHand  // Pass local right hand scale
            );
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
    // Ensure canvas is ready and sized correctly before drawing
    resizeCanvasToDisplaySize();
    ctx.save(); // Save context state
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Only draw if we have results
    if (!results || !results.poseLandmarks) {
       // Optionally hide all meshes if no results are detected for a frame
       hideFaceMesh(faceMesh);
       hideBodyMesh(bodyMesh);
       hideHandMesh(leftHandMesh);
       hideHandMesh(rightHandMesh);
       ctx.restore(); // Restore context state
       return;
    }

    // Update 3D visualization with the new pose data
    updateThreeJSPose(results);

    // --- Draw 2D overlay ---
    // Scale landmarks to canvas coordinates
    const scaleX = canvas.width;
    const scaleY = canvas.height;

    const scaleLandmarks = (landmarks) => {
        if (!landmarks) return null;
        return landmarks.map(lm => ({
            x: lm.x * scaleX,
            y: lm.y * scaleY,
            z: lm.z, // Keep z for potential use, though not used in 2D drawing
            visibility: lm.visibility
        }));
    };

    const poseLandmarksScaled = scaleLandmarks(results.poseLandmarks);
    const faceLandmarksScaled = scaleLandmarks(results.faceLandmarks);
    const leftHandLandmarksScaled = scaleLandmarks(results.leftHandLandmarks);
    const rightHandLandmarksScaled = scaleLandmarks(results.rightHandLandmarks);


    // Draw body pose if enabled (on the small webcam feed)
    if (showBodyCheckbox.checked && poseLandmarksScaled) {
        let activePoseConnections = [...POSE_CONNECTIONS];
        // Filter out wrist-to-finger connections if hands are active
        if (showHandsCheckbox.checked) {
            const wristToFingerLeftIndices = [[15, 17], [15, 19], [15, 21]];
            const wristToFingerRightIndices = [[16, 18], [16, 20], [16, 22]];
            activePoseConnections = activePoseConnections.filter(conn => {
                 const isLeftWf = results.leftHandLandmarks && wristToFingerLeftIndices.some(wf => (wf[0] === conn[0] && wf[1] === conn[1]) || (wf[0] === conn[1] && wf[1] === conn[0]));
                 const isRightWf = results.rightHandLandmarks && wristToFingerRightIndices.some(wf => (wf[0] === conn[0] && wf[1] === conn[1]) || (wf[0] === conn[1] && wf[1] === conn[0]));
                 return !isLeftWf && !isRightWf;
            });
        }

        drawConnectors(
            ctx, poseLandmarksScaled, activePoseConnections,
            {color: config.colors.body.connectors, lineWidth: 2} // Thinner lines for overlay
        );

        // Filter landmarks to draw (excluding face, wrists/fingers if hands shown)
        const landmarksToDraw = {};
        const leftFingerBaseIndices = [17, 19, 21];
        const rightFingerBaseIndices = [18, 20, 22];
        const leftHandActive = showHandsCheckbox.checked && leftHandLandmarksScaled;
        const rightHandActive = showHandsCheckbox.checked && rightHandLandmarksScaled;

        poseLandmarksScaled.forEach((lm, index) => {
            if (index < 11) return; // Skip face landmarks (0-10)
            if (leftHandActive && (index === 15 || leftFingerBaseIndices.includes(index))) return; // Skip left wrist/fingers if hand active
            if (rightHandActive && (index === 16 || rightFingerBaseIndices.includes(index))) return; // Skip right wrist/fingers if hand active

            landmarksToDraw[index] = lm;
        });

        drawLandmarks(
            ctx, Object.values(landmarksToDraw),
            {color: config.colors.body.landmarks, radius: config.pointSizes.body / 1.5 } // Smaller points for overlay
        );
    }

    // Draw face if enabled (on the small webcam feed)
    if (showFaceCheckbox.checked && faceLandmarksScaled) {
        drawConnectors(
            ctx, faceLandmarksScaled, FACEMESH_CONTOURS, // Use contours for less clutter
            {color: config.colors.face.connectors, lineWidth: 1}
        );
        // Optional: draw face landmarks (can be very cluttered)
        // drawLandmarks(
        //     ctx, faceLandmarksScaled,
        //     {color: config.colors.face.landmarks, radius: config.pointSizes.faceMesh}
        // );
    }

    // Draw hands if enabled (on the small webcam feed)
    if (showHandsCheckbox.checked) {
        // Left hand
        if (leftHandLandmarksScaled) {
            drawConnectors(
                ctx, leftHandLandmarksScaled, HAND_CONNECTIONS,
                {color: config.colors.leftHand.connectors, lineWidth: 2}
            );
            drawLandmarks(
                ctx, leftHandLandmarksScaled,
                {color: config.colors.leftHand.landmarks, radius: config.pointSizes.hand / 1.5}
            );
        }

        // Right hand
        if (rightHandLandmarksScaled) {
            drawConnectors(
                ctx, rightHandLandmarksScaled, HAND_CONNECTIONS,
                {color: config.colors.rightHand.connectors, lineWidth: 2}
            );
            drawLandmarks(
                ctx, rightHandLandmarksScaled,
                {color: config.colors.rightHand.landmarks, radius: config.pointSizes.hand / 1.5}
            );
        }
    }

    ctx.restore(); // Restore context state
}

// Initialize the app when the page loads
window.addEventListener('DOMContentLoaded', init);