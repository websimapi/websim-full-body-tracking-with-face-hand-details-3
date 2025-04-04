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

// Control checkboxes
const showBodyCheckbox = document.getElementById('show-body');
const showFaceCheckbox = document.getElementById('show-face');
const showHandsCheckbox = document.getElementById('show-hands');

// Debug DOM Elements
const debugOffsetXSlider = document.getElementById('global-offset-x');
const debugOffsetYSlider = document.getElementById('global-offset-y');
const debugOffsetZSlider = document.getElementById('global-offset-z');
const debugScaleSlider = document.getElementById('global-scale');
const debugOffsetXValue = document.getElementById('global-offset-x-value');
const debugOffsetYValue = document.getElementById('global-offset-y-value');
const debugOffsetZValue = document.getElementById('global-offset-z-value');
const debugScaleValue = document.getElementById('global-scale-value');
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

// Debug parameters
let debugGlobalOffset = new THREE.Vector3(0, 0, 0);
let debugGlobalScale = 1.0;

// Initialize the application
async function init() {
    try {
        statusElement.textContent = "Initializing holistic model...";
        
        // Initialize the holistic model
        holistic = new Holistic({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`;
            }
        });
        
        // Configure the model with settings from config.js
        holistic.setOptions(config.modelSettings);
        
        // Set up the callback for processing results
        holistic.onResults(onResults);
        
        // Set up the camera
        camera = new Camera(video, {
            onFrame: async () => {
                await holistic.send({image: video});
            },
            width: config.camera.width,
            height: config.camera.height,
            fps: config.camera.fps
        });
        
        // Initialize Three.js scene
        initThreeJS();

        // Initialize Debug Controls
        initDebugControls();
        
        // Start the camera
        await camera.start();
        
        // Resize canvas to match video dimensions
        resizeCanvasToDisplaySize();
        
        statusElement.textContent = "Tracking active";
    } catch (error) {
        console.error("Error initializing:", error);
        statusElement.textContent = "Error: " + error.message;
    }
}

// Initialize Three.js scene
function initThreeJS() {
    // Create scene
    scene = new THREE.Scene();
    // scene.background = new THREE.Color(config.threeJS.background);

    // Create camera
    camera3D = new THREE.PerspectiveCamera(75, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.1, 1000);
    camera3D.position.set(0, 0.5, 4); 
    // camera3D.lookAt(0, -0.5, 0); 

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    sceneContainer.appendChild(renderer.domElement);

    // Initialize OrbitControls
    controls = new OrbitControls(camera3D, renderer.domElement);
    controls.target.set(0, 0, 0); 
    controls.enableDamping = true; 
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false; 
    controls.minDistance = 1;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI / 1.8; 
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

    // Initialize avatar meshes
    faceMesh = initFaceTracking(scene, config); 
    bodyMesh = initBodyTracking(scene, config); 
    leftHandMesh = initHandTracking(scene, config, 'left');
    rightHandMesh = initHandTracking(scene, config, 'right');

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

    // Handle window resize
    window.addEventListener('resize', () => {
        camera3D.aspect = sceneContainer.clientWidth / sceneContainer.clientHeight;
        camera3D.updateProjectionMatrix();
        renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
    });

    // Start animation loop
    animate();
}

// Initialize Debug Controls Listeners
function initDebugControls() {
    debugOffsetXSlider.addEventListener('input', (e) => {
        debugGlobalOffset.x = parseFloat(e.target.value);
        debugOffsetXValue.textContent = debugGlobalOffset.x.toFixed(2);
    });
    debugOffsetYSlider.addEventListener('input', (e) => {
        debugGlobalOffset.y = parseFloat(e.target.value);
        debugOffsetYValue.textContent = debugGlobalOffset.y.toFixed(2);
    });
    debugOffsetZSlider.addEventListener('input', (e) => {
        debugGlobalOffset.z = parseFloat(e.target.value);
        debugOffsetZValue.textContent = debugGlobalOffset.z.toFixed(2);
    });
    debugScaleSlider.addEventListener('input', (e) => {
        debugGlobalScale = parseFloat(e.target.value);
        debugScaleValue.textContent = debugGlobalScale.toFixed(2);
    });

    // Set initial display values
    debugOffsetXValue.textContent = debugGlobalOffset.x.toFixed(2);
    debugOffsetYValue.textContent = debugGlobalOffset.y.toFixed(2);
    debugOffsetZValue.textContent = debugGlobalOffset.z.toFixed(2);
    debugScaleValue.textContent = debugGlobalScale.toFixed(2);
}

// Format vector for display
function formatVector(vec, precision = 2) {
    return `(${vec.x.toFixed(precision)}, ${vec.y.toFixed(precision)}, ${vec.z.toFixed(precision)})`;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Required if damping or auto-rotation is enabled

    // Update debug readouts
    if (camera3D && controls) {
        camPosDisplay.textContent = formatVector(camera3D.position);
        camTargetDisplay.textContent = formatVector(controls.target);
    }

    renderer.render(scene, camera3D);
}

// Handle window resize
window.addEventListener('resize', resizeCanvasToDisplaySize);

function resizeCanvasToDisplaySize() {
    const vidWidth = video.clientWidth;
    const vidHeight = video.clientHeight;
    
    canvas.width = vidWidth;
    canvas.height = vidHeight;
}

// Update the 3D scene with new pose data
function updateThreeJSPose(results) {
    // Update face first, as body might depend on its position
    if (showFaceCheckbox.checked && results.faceLandmarks) {
        updateFaceMesh(results.faceLandmarks, faceMesh, updateBone, debugGlobalOffset, debugGlobalScale);
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
            debugGlobalOffset, // Pass debug offset
            debugGlobalScale   // Pass debug scale
        );
    } else {
        hideBodyMesh(bodyMesh);
    }

    // Update hands
    if (showHandsCheckbox.checked) {
        // Update left hand
        if (results.leftHandLandmarks) {
            updateHandMesh(results.leftHandLandmarks, leftHandMesh, updateBone, debugGlobalOffset, debugGlobalScale);
        } else {
            hideHandMesh(leftHandMesh);
        }

        // Update right hand
        if (results.rightHandLandmarks) {
            updateHandMesh(results.rightHandLandmarks, rightHandMesh, updateBone, debugGlobalOffset, debugGlobalScale);
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
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Only draw if we have results
    if (!results || !results.poseLandmarks) return; 
    
    // Update 3D visualization with the new pose data
    updateThreeJSPose(results);
    
    // Draw body pose if enabled (on the small webcam feed)
    if (showBodyCheckbox.checked && results.poseLandmarks) {
        let activePoseConnections = [...POSE_CONNECTIONS];
        if (showHandsCheckbox.checked) {
            const wristToFingerLeft = [[15, 17], [15, 19], [15, 21]];
            const wristToFingerRight = [[16, 18], [16, 20], [16, 22]];
            activePoseConnections = activePoseConnections.filter(conn => {
                 const isLeftWf = results.leftHandLandmarks && wristToFingerLeft.some(wf => (wf[0] === conn[0] && wf[1] === conn[1]) || (wf[0] === conn[1] && wf[1] === conn[0]));
                 const isRightWf = results.rightHandLandmarks && wristToFingerRight.some(wf => (wf[0] === conn[0] && wf[1] === conn[1]) || (wf[0] === conn[1] && wf[1] === conn[0]));
                 return !isLeftWf && !isRightWf;
            });
        }

        drawConnectors(
            ctx, results.poseLandmarks, activePoseConnections,
            {color: config.colors.body.connectors}
        );

        const landmarksToDraw = {};
        const leftFingerBaseIndices = [17, 19, 21];
        const rightFingerBaseIndices = [18, 20, 22];
        const leftHandActive = showHandsCheckbox.checked && results.leftHandLandmarks;
        const rightHandActive = showHandsCheckbox.checked && results.rightHandLandmarks;

        results.poseLandmarks.forEach((lm, index) => {
            if (index < 11) return; 
            if (leftHandActive && leftFingerBaseIndices.includes(index)) return; 
            if (rightHandActive && rightFingerBaseIndices.includes(index)) return; 
            if (leftHandActive && index === 15) return;
            if (rightHandActive && index === 16) return;

            landmarksToDraw[index] = lm;
        });

        drawLandmarks(
            ctx, Object.values(landmarksToDraw),
            {color: config.colors.body.landmarks, radius: config.pointSizes.body}
        );
    }
    
    // Draw face if enabled (on the small webcam feed)
    if (showFaceCheckbox.checked) {
        if (results.faceLandmarks) {
            drawConnectors(
                ctx, results.faceLandmarks, FACEMESH_CONTOURS,
                {color: config.colors.face.connectors}
            );
        }
    }
    
    // Draw hands if enabled (on the small webcam feed)
    if (showHandsCheckbox.checked) {
        // Left hand
        if (results.leftHandLandmarks) {
            drawConnectors(
                ctx, results.leftHandLandmarks, HAND_CONNECTIONS,
                {color: config.colors.leftHand.connectors}
            );
            
            drawLandmarks(
                ctx, results.leftHandLandmarks,
                {color: config.colors.leftHand.landmarks, radius: config.pointSizes.hand}
            );
        }
        
        // Right hand
        if (results.rightHandLandmarks) {
            drawConnectors(
                ctx, results.rightHandLandmarks, HAND_CONNECTIONS,
                {color: config.colors.rightHand.connectors}
            );
            
            drawLandmarks(
                ctx, results.rightHandLandmarks,
                {color: config.colors.rightHand.landmarks, radius: config.pointSizes.hand}
            );
        }
    }
}

// Initialize the app when the page loads
window.addEventListener('DOMContentLoaded', init);