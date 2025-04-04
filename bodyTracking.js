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

// Mapping landmark indices to body part names for adjustments
const LANDMARK_TO_BODY_PART = {
    11: 'shoulders', // Left Shoulder
    12: 'shoulders', // Right Shoulder
    13: 'leftArm',   // Left Elbow
    14: 'rightArm',  // Right Elbow
    // 15: 'leftArm',   // Left Wrist (Handled by hand tracking or potentially arm)
    // 16: 'rightArm',  // Right Wrist (Handled by hand tracking or potentially arm)
    23: 'hips',      // Left Hip (Use leg adjustments for now)
    24: 'hips',      // Right Hip (Use leg adjustments for now)
    25: 'leftLeg',   // Left Knee
    26: 'rightLeg',  // Right Knee
    27: 'leftLeg',   // Left Ankle
    28: 'rightLeg',  // Right Ankle
    // 29, 30, 31, 32 are feet landmarks, apply leg adjustments
    29: 'leftLeg',
    31: 'leftLeg',
    30: 'rightLeg',
    32: 'rightLeg',
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
const _tempJointPos = new THREE.Vector3(); // Renamed from _initialBodyJointPos for clarity
const _shoulderMidpoint = new THREE.Vector3(); // For neck bone calculation
const _centerPoint = new THREE.Vector3(); // For scaling calculations
const _tempScaleVec = new THREE.Vector3(); // For granular scaling relative to anchor

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
    globalOffset,
    globalScale,
    localOffset, // Overall body-specific offset
    localScale,  // Overall body-specific scale
    bodyPartAdjustments // NEW: Granular adjustments
) {
    const baseScaleFactor = 2.5; // Base scaling from MediaPipe coords
    const baseYOffset = 0.8; // Base Y offset
    const leftHandActive = leftHandLandmarks && leftHandLandmarks.length > 0;
    const rightHandActive = rightHandLandmarks && rightHandLandmarks.length > 0;
    const faceActive = faceLandmarks && faceLandmarks.length > 152 && faceMesh && faceMesh.landmarks[152];

    // --- Z-Axis Alignment Calculation (remains the same) ---
    let targetShoulderZ = null;
    if (faceActive && landmarks && landmarks.length > 12 && faceLandmarks && faceLandmarks.length > 152) {
        const poseNose = landmarks[0];
        const faceChin = faceLandmarks[152]; // Use the raw landmark Z here for calculation
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

    // Conceptual center for GLOBAL scaling
    _centerPoint.set(0, baseYOffset, 0); // Base center before global adjustments

    // Scale and position the joints
    for (let i = 11; i < landmarks.length; i++) {
        let landmark = landmarks[i];
        if (!bodyMesh.joints[i]) continue;

        const joint = bodyMesh.joints[i];

        // Override wrist positions if hand data is available
        if (i === 15 && leftWristPos && (leftWristPos.visibility ?? 1) > 0.5) landmark = leftWristPos;
        else if (i === 16 && rightWristPos && (rightWristPos.visibility ?? 1) > 0.5) landmark = rightWristPos;

        // Apply Z-offset to shoulders if calculated
        let zValue = landmark.z;
        if (targetShoulderZ !== null && (i === 11 || i === 12)) {
            zValue = targetShoulderZ;
        }

        // --- Transformation Order ---
        // 1. Calculate initial position based on MediaPipe coords, base scale/offset, and Z-alignment
        _tempJointPos.set(
            -(landmark.x - 0.5) * baseScaleFactor,
            (landmark.y - 0.5) * -baseScaleFactor + baseYOffset,
            (zValue * baseScaleFactor) // Use potentially adjusted zValue
        );

        // 2. Apply OVERALL body local offset and scale
        _tempJointPos.y -= baseYOffset; // Offset from base Y
        _tempJointPos.multiplyScalar(localScale); // Apply overall body scale
        _tempJointPos.y += baseYOffset; // Add base Y back
        _tempJointPos.add(localOffset); // Apply overall body offset

        // 3. Apply GRANULAR body part offset and scale (if applicable)
        const partName = LANDMARK_TO_BODY_PART[i];
        let partAdjustment = null;
        if(partName && bodyPartAdjustments[partName]) {
            partAdjustment = bodyPartAdjustments[partName];
        } else if (partName === 'hips') { // Apply leg adjustments to hips for now
             partAdjustment = (i === 23) ? bodyPartAdjustments.leftLeg : bodyPartAdjustments.rightLeg;
        }

        if (partAdjustment) {
             // Apply granular offset directly for simplicity
            _tempJointPos.add(partAdjustment.offset);

            // Apply granular scale - this is tricky. Simple approach: scale the vector
            // from a relevant anchor point (shoulder/hip). Let's start simpler:
            // Apply scale centered around the joint itself (less physically accurate for limbs)
            // A better approach would require knowing the parent joint position *after step 2*
            // For now, we'll skip granular scaling to avoid complexity, only apply offset.
            // To implement scaling:
            // let anchorPos;
            // if (partName === 'leftArm' || partName === 'shoulders') anchorPos = bodyMesh.joints[11].position; // Need position *before* global transforms
            // else if (partName === 'rightArm') anchorPos = bodyMesh.joints[12].position;
            // else if (partName === 'leftLeg') anchorPos = bodyMesh.joints[23].position;
            // else if (partName === 'rightLeg') anchorPos = bodyMesh.joints[24].position;
            // if (anchorPos) {
            //     _tempScaleVec.subVectors(_tempJointPos, anchorPos);
            //     _tempScaleVec.multiplyScalar(partAdjustment.scale);
            //     _tempJointPos.addVectors(anchorPos, _tempScaleVec);
            // }
             // TODO: Implement more robust granular scaling if needed. Sticking to offset for now.
        }

        // 4. Apply GLOBAL scale (relative to the global center point)
        _tempJointPos.sub(_centerPoint); // Vector from global center to current pos
        _tempJointPos.multiplyScalar(globalScale); // Scale this vector
        _tempJointPos.add(_centerPoint); // Add back to global center

        // 5. Apply GLOBAL offset
        joint.position.copy(_tempJointPos).add(globalOffset);
        // --- End Transformation Order ---


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
    // Uses the *final* joint positions which include all offsets/scales
    if (faceActive && bodyMesh.neckBone && faceMesh.landmarks[152]) {
        const chinJoint = faceMesh.landmarks[152]; // Position already includes its transforms
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

    // Update bones between joints (uses final joint positions)
    for (const connection of POSE_CONNECTIONS) {
        const [i, j] = connection;
        const connectionKey = connection.join('-');
        const bone = bodyMesh.bones[connectionKey] || bodyMesh.bones[`${j}-${i}`];
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