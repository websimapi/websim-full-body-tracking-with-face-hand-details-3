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
const _initialHandJointPos = new THREE.Vector3();

// Update hand mesh with new landmark data
export function updateHandMesh(landmarks, handMesh, updateBoneFn, globalOffset, globalScale) {
    const localScaleFactor = 2.5;
    const localYOffset = 0.8;

    // Update hand landmarks
    for (let i = 0; i < landmarks.length; i++) {
        if (!handMesh.landmarks[i]) continue;

        const landmark = landmarks[i];
        const joint = handMesh.landmarks[i];

        // 1. Calculate position based on local settings
        _initialHandJointPos.set(
            -(landmark.x - 0.5) * localScaleFactor,
            (landmark.y - 0.5) * -localScaleFactor + localYOffset,
            landmark.z * localScaleFactor
        );

        // 2. Apply global scale (relative to conceptual center)
        const centerPoint = new THREE.Vector3(0, localYOffset, 0);
        _initialHandJointPos.sub(centerPoint);
        _initialHandJointPos.multiplyScalar(globalScale);
        _initialHandJointPos.add(centerPoint);

        // 3. Apply global offset
        joint.position.copy(_initialHandJointPos).add(globalOffset);

        joint.visible = true;
    }

    // Update hand connections (bones inherit transforms from joints)
    for (const connection of HAND_CONNECTIONS) {
        const [i, j] = connection;
        if (!handMesh.connections[connection.join('-')] || !handMesh.landmarks[i] || !handMesh.landmarks[j]) continue;

        const bone = handMesh.connections[connection.join('-')];
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
        handMesh.landmarks[key].visible = false;
    }
    
    for (const key in handMesh.connections) {
        handMesh.connections[key].visible = false;
    }
}