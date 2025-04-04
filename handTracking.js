/**
 * Hand tracking module for 3D visualization
 */

import * as THREE from 'three'; // Import Three.js as a module

// Constants for hand landmark connections
export const HAND_CONNECTIONS = [
    // Thumb
    [0, 1], [1, 2], [2, 3], [3, 4],
    // Index finger
    [0, 5], [5, 6], [6, 7], [7, 8],
    // Middle finger
    [0, 9], [9, 10], [10, 11], [11, 12],
    // Ring finger
    [0, 13], [13, 14], [14, 15], [15, 16],
    // Pinky
    [0, 17], [17, 18], [18, 19], [19, 20],
    // Palm
    [0, 17], [5, 9], [9, 13], [13, 17]
];

// Initialize hand tracking
export function initHandTracking(scene, config, side) {
    const handMesh = {
        landmarks: {},
        connections: {}
    };

    const isLeft = side === 'left';
    const colorKey = isLeft ? 'leftHandColor' : 'rightHandColor';

    const handMaterial = new THREE.MeshStandardMaterial({
        color: config.threeJS[colorKey],
        emissive: config.threeJS[colorKey],
        emissiveIntensity: 0.3
    });

    const jointGeometry = new THREE.SphereGeometry(config.threeJS.jointRadius * 0.6, 8, 8);

    // Create hand joints
    for (let i = 0; i < 21; i++) {
        const joint = new THREE.Mesh(jointGeometry, handMaterial);
        joint.visible = false;
        scene.add(joint);
        handMesh.landmarks[i] = joint;
    }

    // Create hand connections
    const handConnectorMaterial = new THREE.MeshStandardMaterial({
        color: config.threeJS[colorKey],
        emissive: config.threeJS[colorKey],
        emissiveIntensity: 0.2
    });

    for (const connection of HAND_CONNECTIONS) {
        const geometry = new THREE.CylinderGeometry(
            config.threeJS.boneRadius * 0.5,
            config.threeJS.boneRadius * 0.5,
            1, 8
        );
        geometry.rotateX(Math.PI / 2);
        const bone = new THREE.Mesh(geometry, handConnectorMaterial);
        scene.add(bone);
        bone.visible = false;
        handMesh.connections[connection.join('-')] = bone;
    }

    return handMesh;
}

// Helper vector for calculations
const _tempJointPos = new THREE.Vector3(); 
const _centerPoint = new THREE.Vector3(); 

// Update hand mesh with new landmark data
export function updateHandMesh(
    landmarks,
    handMesh,
    updateBoneFn,
    globalOffset,
    globalScale,
    localOffset, 
    localScale  
) {
    const baseScaleFactor = 2.5; 
    const baseYOffset = 0.8; 

    _centerPoint.set(0, baseYOffset, 0); 

    // Update hand landmarks
    for (let i = 0; i < landmarks.length; i++) {
        if (!handMesh.landmarks[i]) continue;

        const landmark = landmarks[i];
        const joint = handMesh.landmarks[i];

        _tempJointPos.set(
            -(landmark.x - 0.5) * baseScaleFactor,
            (landmark.y - 0.5) * -baseScaleFactor + baseYOffset,
            landmark.z * baseScaleFactor
        );

        _tempJointPos.y -= baseYOffset; 
        _tempJointPos.multiplyScalar(localScale); 
        _tempJointPos.y += baseYOffset; 
        _tempJointPos.add(localOffset); 

        _tempJointPos.sub(_centerPoint); 
        _tempJointPos.multiplyScalar(globalScale); 
        _tempJointPos.add(_centerPoint); 

        joint.position.copy(_tempJointPos).add(globalOffset);
        joint.visible = true; 
    }

    // Update hand connections 
    for (const connection of HAND_CONNECTIONS) {
        const [i, j] = connection;
        const connectionKey = connection.join('-');
        const bone = handMesh.connections[connectionKey]; 
        if (!bone || !handMesh.landmarks[i] || !handMesh.landmarks[j]) continue;

        const jointA = handMesh.landmarks[i];
        const jointB = handMesh.landmarks[j];

        if (jointA.visible && jointB.visible) {
            updateBoneFn(bone, jointA.position, jointB.position);
            bone.visible = true;
        } else {
            bone.visible = false;
        }
    }
}

// Hide hand mesh
export function hideHandMesh(handMesh) {
    // Hide all hand landmarks and connections
    for (const key in handMesh.landmarks) {
         if (handMesh.landmarks[key]) handMesh.landmarks[key].visible = false;
    }

    for (const key in handMesh.connections) {
         if (handMesh.connections[key]) handMesh.connections[key].visible = false;
    }
}