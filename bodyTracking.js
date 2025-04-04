/**
 * Body tracking module for 3D visualization
 */
import * as THREE from 'three';
import { updateBone } from './utils.js'; // Ensure updateBone is imported if used here, though likely passed in

// Constants for body landmark connections
export const POSE_CONNECTIONS = [
    // Connections *excluding* the face landmarks (0-10)
    // Upper body
    [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
    // Body center
    [11, 23], [12, 24], [23, 24],
    // Lower body
    [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31],
    [30, 32], [27, 31], [28, 32]
];

// Specific connections from wrists to fingers in the pose model
const WRIST_TO_FINGER_CONNECTIONS = {
    left: [[15, 17], [15, 19], [15, 21]],
    right: [[16, 18], [16, 20], [16, 22]],
};

// Helper function to check if a connection involves wrist-to-fingers
function isWristToFingerConnection(connection, side) {
    const connectionsToCheck = WRIST_TO_FINGER_CONNECTIONS[side];
    return connectionsToCheck.some(c =>
        (c[0] === connection[0] && c[1] === connection[1]) ||
        (c[0] === connection[1] && c[1] === connection[0])
    );
}

// Helper vector for calculations
const _initialBodyJointPos = new THREE.Vector3();
const _shoulderMidpoint = new THREE.Vector3(); // For neck bone calculation

// Initialize body tracking
export function initBodyTracking(scene, config) {
    const bodyMesh = {
        joints: {},
        bones: {},
        neckBone: null // Add neck bone reference
    };

    // Create a material for body joints
    const jointMaterial = new THREE.MeshStandardMaterial({
        color: config.threeJS.bodyColor,
        emissive: config.threeJS.bodyColor,
        emissiveIntensity: 0.3
    });

    const jointGeometry = new THREE.SphereGeometry(config.threeJS.jointRadius, 16, 16);

    // Add body joints to the scene, skipping face landmarks (0-10)
    for (let i = 11; i < 33; i++) { // Start from index 11 (shoulders)
        const joint = new THREE.Mesh(jointGeometry, jointMaterial);
        joint.visible = false;
        scene.add(joint);
        bodyMesh.joints[i] = joint;
    }

    // Create bones (cylinders between joints)
    const boneMaterial = new THREE.MeshStandardMaterial({
        color: config.threeJS.bodyColor,
        emissive: config.threeJS.bodyColor,
        emissiveIntensity: 0.2
    });

    // Create bones for pose connections (already filtered to exclude face)
    for (const connection of POSE_CONNECTIONS) {
        const geometry = new THREE.CylinderGeometry(config.threeJS.boneRadius, config.threeJS.boneRadius, 1, 8);
        geometry.rotateX(Math.PI / 2);
        const bone = new THREE.Mesh(geometry, boneMaterial);
        scene.add(bone);
        bone.visible = false;
        // Store with both keys for easier lookup later
        bodyMesh.bones[connection.join('-')] = bone;
        bodyMesh.bones[`${connection[1]}-${connection[0]}`] = bone;
    }

    // Create Neck Bone
    const neckGeometry = new THREE.CylinderGeometry(config.threeJS.boneRadius, config.threeJS.boneRadius, 1, 8);
    neckGeometry.rotateX(Math.PI / 2);
    const neckBone = new THREE.Mesh(neckGeometry, boneMaterial); // Use body color
    neckBone.visible = false;
    scene.add(neckBone);
    bodyMesh.neckBone = neckBone;

    return bodyMesh;
}

// Update body mesh with new pose data
export function updateBodyMesh(
    landmarks, // poseLandmarks
    bodyMesh,
    updateBoneFn,
    leftHandLandmarks,
    rightHandLandmarks,
    faceLandmarks,
    faceMesh,
    globalOffset, // Added
    globalScale // Added
) {
    const localScaleFactor = 2.5; // Renamed
    const localYOffset = 0.8; // Renamed
    const leftHandActive = leftHandLandmarks && leftHandLandmarks.length > 0;
    const rightHandActive = rightHandLandmarks && rightHandLandmarks.length > 0;
    // Ensure we check faceMesh existence and the specific landmark 152
    const faceActive = faceLandmarks && faceLandmarks.length > 152 && faceMesh && faceMesh.landmarks[152];

    // --- Z-Axis Alignment Calculation (remains the same) ---
    let targetShoulderZ = null;
    if (faceActive && landmarks && landmarks.length > 12 && faceLandmarks && faceLandmarks.length > 152) {
        const poseNose = landmarks[0];
        const faceChin = faceLandmarks[152];
        const poseShoulderMidZ = (landmarks[11]?.z + landmarks[12]?.z) / 2;

        if (poseNose && faceChin && typeof poseShoulderMidZ === 'number' && !isNaN(poseShoulderMidZ)) {
            targetShoulderZ = faceChin.z + (poseShoulderMidZ - poseNose.z);
        }
    }
    // --- End Z-Axis Alignment ---

    // Determine wrist positions (remains the same)
    const leftWristPos = leftHandActive ? { ...leftHandLandmarks[0], visibility: leftHandLandmarks[0].visibility ?? 1 } : null;
    const rightWristPos = rightHandActive ? { ...rightHandLandmarks[0], visibility: rightHandLandmarks[0].visibility ?? 1 } : null;

    const leftFingerBaseIndices = [17, 19, 21];
    const rightFingerBaseIndices = [18, 20, 22];

    // Conceptual center for scaling
    const centerPoint = new THREE.Vector3(0, localYOffset, 0);

    // Scale and position the joints
    for (let i = 11; i < landmarks.length; i++) {
        let landmark = landmarks[i];
        if (!bodyMesh.joints[i]) continue;

        const joint = bodyMesh.joints[i];

        // Override wrist positions if hand data is available
        if (i === 15 && leftWristPos && (leftWristPos.visibility ?? 1) > 0.5) {
            landmark = leftWristPos;
        } else if (i === 16 && rightWristPos && (rightWristPos.visibility ?? 1) > 0.5) {
            landmark = rightWristPos;
        }

        // Apply Z-offset to shoulders if calculated
        let zValue = landmark.z;
        if (targetShoulderZ !== null && (i === 11 || i === 12)) {
            zValue = targetShoulderZ;
        }

        // 1. Calculate initial position based on local settings and Z-alignment
        _initialBodyJointPos.set(
            -(landmark.x - 0.5) * localScaleFactor,
            (landmark.y - 0.5) * -localScaleFactor + localYOffset,
            (zValue * localScaleFactor) // Use potentially adjusted zValue
        );

        // 2. Apply global scale (relative to center point)
        _initialBodyJointPos.sub(centerPoint);
        _initialBodyJointPos.multiplyScalar(globalScale);
        _initialBodyJointPos.add(centerPoint);

        // 3. Apply global offset
        joint.position.copy(_initialBodyJointPos).add(globalOffset);

        // Determine joint visibility (logic remains the same)
        const visibilityThreshold = 0.5;
        let isVisible = (landmarks[i]?.visibility ?? 1) > visibilityThreshold;
        if (i === 15 && leftWristPos) isVisible = (leftWristPos.visibility ?? 1) > visibilityThreshold;
        if (i === 16 && rightWristPos) isVisible = (rightWristPos.visibility ?? 1) > visibilityThreshold;
        if (leftHandActive && leftFingerBaseIndices.includes(i)) isVisible = false;
        if (rightHandActive && rightFingerBaseIndices.includes(i)) isVisible = false;
        joint.visible = isVisible;
    }

    // --- Neck Connection Update ---
    // Use the *final* joint positions which include global offsets/scale
    if (faceActive && bodyMesh.neckBone && faceMesh.landmarks[152]) { // Check landmark 152 exists
        const chinJoint = faceMesh.landmarks[152]; // This position already includes global offset/scale
        const leftShoulderJoint = bodyMesh.joints[11];
        const rightShoulderJoint = bodyMesh.joints[12];

        if (chinJoint && chinJoint.visible && leftShoulderJoint && leftShoulderJoint.visible && rightShoulderJoint && rightShoulderJoint.visible) {
            _shoulderMidpoint.addVectors(leftShoulderJoint.position, rightShoulderJoint.position).multiplyScalar(0.5);
            updateBoneFn(bodyMesh.neckBone, _shoulderMidpoint, chinJoint.position);
            bodyMesh.neckBone.visible = true;
        } else {
            bodyMesh.neckBone.visible = false;
        }
    } else if (bodyMesh.neckBone) {
        bodyMesh.neckBone.visible = false;
    }
    // --- End Neck Connection Update ---

    // Update bones between joints (logic remains mostly the same, uses final joint positions)
    for (const connection of POSE_CONNECTIONS) {
        const [i, j] = connection;
        const connectionKey = connection.join('-');
        const bone = bodyMesh.bones[connectionKey];
        if (!bone) continue;

        const jointA = bodyMesh.joints[i];
        const jointB = bodyMesh.joints[j];
        if (!jointA || !jointB) continue;

        const skipLeftWristFingers = leftHandActive && isWristToFingerConnection(connection, 'left');
        const skipRightWristFingers = rightHandActive && isWristToFingerConnection(connection, 'right');

        if (skipLeftWristFingers || skipRightWristFingers) {
            bone.visible = false;
        } else if (jointA.visible && jointB.visible) {
            updateBoneFn(bone, jointA.position, jointB.position); // Use final positions
            bone.visible = true;
        } else {
            bone.visible = false;
        }
    }
}

// Hide body mesh
export function hideBodyMesh(bodyMesh) {
    // Hide all existing body joints and bones
    for (const key in bodyMesh.joints) {
        if (bodyMesh.joints[key]) { // Check if exists
            bodyMesh.joints[key].visible = false;
        }
    }

    for (const key in bodyMesh.bones) {
        if (bodyMesh.bones[key]) { // Check if exists
            bodyMesh.bones[key].visible = false;
        }
    }

    // Hide neck bone if it exists
    if (bodyMesh.neckBone) {
        bodyMesh.neckBone.visible = false;
    }
}