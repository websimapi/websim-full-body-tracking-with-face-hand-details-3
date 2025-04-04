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
    faceLandmarks, // Added for alignment
    faceMesh // Added for neck connection
) {
    const scaleFactor = 2.5; // Unified scaling factor
    const yOffset = 0.8; // Vertical offset to move the body up
    const leftHandActive = leftHandLandmarks && leftHandLandmarks.length > 0;
    const rightHandActive = rightHandLandmarks && rightHandLandmarks.length > 0;
    const faceActive = faceLandmarks && faceLandmarks.length > 152 && faceMesh && faceMesh.landmarks[152]; // Check chin landmark exists

    // --- Z-Axis Alignment Calculation ---
    let zShoulderOffset = 0;
    let targetShoulderZ = null;

    if (faceActive && landmarks && landmarks.length > 12) {
        // Use pose landmark 0 (nose) and face landmark 152 (chin) for reference
        const poseNose = landmarks[0];
        const faceChin = faceLandmarks[152];

        // Get Z of pose shoulders
        const poseShoulderMidZ = (landmarks[11].z + landmarks[12].z) / 2;

        // Calculate the target Z for shoulders based on face chin depth,
        // maintaining the relative depth observed in the pose model between nose and shoulders.
        if (poseNose && faceChin && typeof poseShoulderMidZ === 'number') {
             targetShoulderZ = faceChin.z + (poseShoulderMidZ - poseNose.z);
        }
    }
    // --- End Z-Axis Alignment ---


    // Determine wrist positions based on hand tracking if available
    const leftWristPos = leftHandActive ? {
        x: leftHandLandmarks[0].x,
        y: leftHandLandmarks[0].y,
        z: leftHandLandmarks[0].z,
        visibility: leftHandLandmarks[0].visibility || 1 // Assume visible if hand detected
    } : null;

    const rightWristPos = rightHandActive ? {
        x: rightHandLandmarks[0].x,
        y: rightHandLandmarks[0].y,
        z: rightHandLandmarks[0].z,
        visibility: rightHandLandmarks[0].visibility || 1 // Assume visible if hand detected
    } : null;

    // Indices of pose landmarks corresponding to fingers connected to the wrist
    const leftFingerBaseIndices = [17, 19, 21];
    const rightFingerBaseIndices = [18, 20, 22];

    // Scale and position the joints based on the landmarks
    // Start from index 11 to skip face landmarks
    for (let i = 11; i < landmarks.length; i++) {
        let landmark = landmarks[i];
        // Check if joint exists in our mesh (it should if i >= 11)
        if (!bodyMesh.joints[i]) continue;

        const joint = bodyMesh.joints[i];

        // Override wrist positions if hand data is available and visible
        if (i === 15 && leftWristPos && (leftWristPos.visibility ?? 1) > 0.5) { // Left Wrist
            landmark = leftWristPos;
        } else if (i === 16 && rightWristPos && (rightWristPos.visibility ?? 1) > 0.5) { // Right Wrist
            landmark = rightWristPos;
        }

        // Apply Z-offset to shoulders (11, 12) if calculated
        let zValue = landmark.z;
        if (targetShoulderZ !== null && (i === 11 || i === 12)) {
            zValue = targetShoulderZ;
        }
        // maybe apply to torso too?
        // else if (targetShoulderZ !== null && (i === 23 || i === 24)) {
        //    // Interpolate between shoulder Z and hip Z? Or just use shoulder Z?
        //    zValue = targetShoulderZ; // Simplest approach for now
        // }


        // Convert to 3D space, flipping coordinates as needed, and apply offset
        joint.position.set(
            -(landmark.x - 0.5) * scaleFactor, // x flipped, centered, and scaled
            (landmark.y - 0.5) * -scaleFactor + yOffset, // y inverted, centered, scaled, and offset vertically
            (zValue * scaleFactor) // z scaled consistently (using potentially adjusted zValue)
        );

        // Determine joint visibility
        const visibilityThreshold = 0.5;
        let isVisible = (landmarks[i]?.visibility ?? 1) > visibilityThreshold;

        // Ensure wrist joint visibility aligns with hand tracking if active
        if (i === 15 && leftWristPos) isVisible = (leftWristPos.visibility ?? 1) > visibilityThreshold;
        if (i === 16 && rightWristPos) isVisible = (rightWristPos.visibility ?? 1) > visibilityThreshold;

        // Hide finger base joints from pose model if the corresponding hand is active
        if (leftHandActive && leftFingerBaseIndices.includes(i)) {
            isVisible = false;
        }
        if (rightHandActive && rightFingerBaseIndices.includes(i)) {
             isVisible = false;
        }

        joint.visible = isVisible;
    }

    // --- Neck Connection Update ---
    if (faceActive && bodyMesh.neckBone) {
        const chinJoint = faceMesh.landmarks[152];
        const leftShoulderJoint = bodyMesh.joints[11];
        const rightShoulderJoint = bodyMesh.joints[12];

        if (chinJoint && chinJoint.visible && leftShoulderJoint && leftShoulderJoint.visible && rightShoulderJoint && rightShoulderJoint.visible) {
            // Calculate shoulder midpoint using the *updated* joint positions
            const shoulderMidpoint = new THREE.Vector3()
                .addVectors(leftShoulderJoint.position, rightShoulderJoint.position)
                .multiplyScalar(0.5);

            updateBoneFn(bodyMesh.neckBone, shoulderMidpoint, chinJoint.position);
            bodyMesh.neckBone.visible = true;
        } else {
            bodyMesh.neckBone.visible = false;
        }
    } else if (bodyMesh.neckBone) {
        bodyMesh.neckBone.visible = false; // Hide neck if face isn't active
    }
    // --- End Neck Connection Update ---

    // Update bones between joints (POSE_CONNECTIONS is already filtered)
    for (const connection of POSE_CONNECTIONS) {
        const [i, j] = connection;
        const connectionKey = connection.join('-');

        // Ensure the bone exists in our mesh structure
        const bone = bodyMesh.bones[connectionKey];
        if (!bone) continue; // Skip if bone doesn't exist

        // Check if joints exist (they should for i, j >= 11)
        const jointA = bodyMesh.joints[i];
        const jointB = bodyMesh.joints[j];
        if (!jointA || !jointB) continue;

        // Check if this is a wrist-to-finger connection and if the corresponding hand is active
        const skipLeftWristFingers = leftHandActive && isWristToFingerConnection(connection, 'left');
        const skipRightWristFingers = rightHandActive && isWristToFingerConnection(connection, 'right');

        // Hide wrist-to-finger bones if the hand mesh is active, otherwise update based on joint visibility
        if (skipLeftWristFingers || skipRightWristFingers) {
            bone.visible = false;
        } else if (jointA.visible && jointB.visible) { // Update only if both connected joints are visible
            updateBoneFn(bone, jointA.position, jointB.position);
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