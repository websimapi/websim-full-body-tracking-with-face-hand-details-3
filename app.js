import { config } from './config.js';
import { initBodyTracking, updateBodyMesh, hideBodyMesh, POSE_CONNECTIONS } from './bodyTracking.js';
import { initFaceTracking, updateFaceMesh, hideFaceMesh, FACEMESH_TESSELATION, FACEMESH_CONTOURS } from './faceTracking.js';
import { initHandTracking, updateHandMesh, hideHandMesh, HAND_CONNECTIONS } from './handTracking.js';
import { createBone, updateBone, createTerrain } from './utils.js';
import { initDebugUI, getDebugSettings, updateStatus, updateDebugReadouts } from './debugControls.js'; 
import * as THREE from 'three'; 
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; 

const Holistic = window.Holistic;
const drawConnectors = window.drawConnectors;
const drawLandmarks = window.drawLandmarks;
const Camera = window.Camera;

const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const sceneContainer = document.getElementById('scene-container');

let holistic;
let camera;

let scene, renderer, camera3D, controls;
let bodyMesh = {};
let faceMesh = {};
let leftHandMesh = {};
let rightHandMesh = {};
let terrainMesh;

async function init() {
    try {
        updateStatus("Initializing..."); 

        initDebugUI(); 

        updateStatus("Loading Holistic model...");
        holistic = new Holistic({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`
        });
        holistic.setOptions(config.modelSettings);
        holistic.onResults(onResults);

        updateStatus("Setting up 3D scene...");
        initThreeJS(); 

        updateStatus("Accessing webcam...");
        camera = new Camera(video, {
            onFrame: async () => {
                if (holistic && video.readyState >= 2) { 
                   await holistic.send({image: video});
                }
            },
            width: config.camera.width,
            height: config.camera.height,
            fps: config.camera.fps
        });

        await camera.start();
        resizeCanvasToDisplaySize(); 

        updateStatus("Tracking active");

    } catch (error) {
        console.error("Error initializing:", error);
        updateStatus("Error: " + error.message);
    }
}

function initThreeJS() {
    scene = new THREE.Scene();

    camera3D = new THREE.PerspectiveCamera(75, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.1, 1000);
    camera3D.position.set(0, 0.5, 4);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(window.devicePixelRatio); 
    sceneContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera3D, renderer.domElement);
    controls.target.set(0, 0.5, 0); 
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI / 1.9; 
    controls.minPolarAngle = Math.PI / 4; 
    controls.update();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
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

    terrainMesh = createTerrain(20, 20, 50, 50);
    terrainMesh.receiveShadow = true;
    terrainMesh.position.y = -1.85; 
    scene.add(terrainMesh);

    faceMesh = initFaceTracking(scene, config);
    bodyMesh = initBodyTracking(scene, config);
    leftHandMesh = initHandTracking(scene, config, 'left');
    rightHandMesh = initHandTracking(scene, config, 'right');

    function enableShadows(meshGroup) {
        if (!meshGroup) return;
        Object.values(meshGroup.landmarks || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = false; } });
        Object.values(meshGroup.joints || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = false; } });
        Object.values(meshGroup.connections || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
        Object.values(meshGroup.bones || {}).forEach(mesh => { if(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
        if (meshGroup.neckBone) { meshGroup.neckBone.castShadow = true; meshGroup.neckBone.receiveShadow = true; }
    }
    enableShadows(bodyMesh);
    enableShadows(faceMesh);
    enableShadows(leftHandMesh);
    enableShadows(rightHandMesh);

    window.addEventListener('resize', onWindowResize);

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
     resizeCanvasToDisplaySize(); 
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta(); 

    if(controls) controls.update(); 

    updateDebugReadouts(camera3D, controls);

    if (renderer && scene && camera3D) { 
      renderer.render(scene, camera3D);
    }
}

const clock = new THREE.Clock();

function resizeCanvasToDisplaySize() {
    if (!video || !canvas || video.videoWidth === 0) return; 

    const displayWidth = video.clientWidth;
    const displayHeight = video.clientHeight;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
    }
}

function updateThreeJSPose(results) {
    const settings = getDebugSettings();

    if (settings.showFace && results.faceLandmarks) {
        updateFaceMesh(
            results.faceLandmarks,
            faceMesh,
            updateBone,
            settings.globalOffset,
            settings.globalScale,
            settings.localOffsets.face, 
            settings.localScales.face    
        );
    } else {
        hideFaceMesh(faceMesh);
    }

    if (settings.showBody && results.poseLandmarks) {
        updateBodyMesh(
            results.poseLandmarks,
            bodyMesh,
            updateBone,
            results.leftHandLandmarks,
            results.rightHandLandmarks,
            results.faceLandmarks,
            faceMesh, 
            settings.globalOffset, 
            settings.globalScale,  
            settings.localOffsets.body, 
            settings.localScales.body,   
            settings.bodyPartAdjustments 
        );
    } else {
        hideBodyMesh(bodyMesh);
    }

    if (settings.showHands) {
        if (results.leftHandLandmarks) {
            updateHandMesh(
                results.leftHandLandmarks,
                leftHandMesh,
                updateBone,
                settings.globalOffset,
                settings.globalScale,
                settings.localOffsets.leftHand, 
                settings.localScales.leftHand   
            );
        } else {
            hideHandMesh(leftHandMesh);
        }

        if (results.rightHandLandmarks) {
            updateHandMesh(
                results.rightHandLandmarks,
                rightHandMesh,
                updateBone,
                settings.globalOffset,
                settings.globalScale,
                settings.localOffsets.rightHand, 
                settings.localScales.rightHand  
            );
        } else {
            hideHandMesh(rightHandMesh);
        }
    } else {
        hideHandMesh(leftHandMesh);
        hideHandMesh(rightHandMesh);
    }
}

function onResults(results) {
    resizeCanvasToDisplaySize();
    ctx.save(); 
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!results || !results.poseLandmarks) {
       hideFaceMesh(faceMesh);
       hideBodyMesh(bodyMesh);
       hideHandMesh(leftHandMesh);
       hideHandMesh(rightHandMesh);
       ctx.restore(); 
       return;
    }

    updateThreeJSPose(results);

    const settings = getDebugSettings();

    const scaleX = canvas.width;
    const scaleY = canvas.height;

    const scaleLandmarks = (landmarks) => {
        if (!landmarks) return null;
        return landmarks.map(lm => ({
            x: lm.x * scaleX,
            y: lm.y * scaleY,
            z: lm.z, 
            visibility: lm.visibility
        }));
    };

    const poseLandmarksScaled = scaleLandmarks(results.poseLandmarks);
    const faceLandmarksScaled = scaleLandmarks(results.faceLandmarks);
    const leftHandLandmarksScaled = scaleLandmarks(results.leftHandLandmarks);
    const rightHandLandmarksScaled = scaleLandmarks(results.rightHandLandmarks);

    if (settings.showBody && poseLandmarksScaled) {
        let activePoseConnections = [...POSE_CONNECTIONS];
        if (settings.showHands) {
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
            {color: config.colors.body.connectors, lineWidth: 2} 
        );

        const landmarksToDraw = {};
        const leftFingerBaseIndices = [17, 19, 21];
        const rightFingerBaseIndices = [18, 20, 22];
        const leftHandActive = settings.showHands && leftHandLandmarksScaled;
        const rightHandActive = settings.showHands && rightHandLandmarksScaled;

        poseLandmarksScaled.forEach((lm, index) => {
            if (index < 11) return; 
            if (leftHandActive && (index === 15 || leftFingerBaseIndices.includes(index))) return; 
            if (rightHandActive && (index === 16 || rightFingerBaseIndices.includes(index))) return; 

            landmarksToDraw[index] = lm;
        });

        drawLandmarks(
            ctx, Object.values(landmarksToDraw),
            {color: config.colors.body.landmarks, radius: config.pointSizes.body / 1.5 } 
        );
    }

    if (settings.showFace && faceLandmarksScaled) {
        drawConnectors(
            ctx, faceLandmarksScaled, FACEMESH_CONTOURS, 
            {color: config.colors.face.connectors, lineWidth: 1}
        );
    }

    if (settings.showHands) {
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

    ctx.restore(); 
}

window.addEventListener('DOMContentLoaded', init);