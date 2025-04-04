/**
 * Body tracking module for 3D visualization
 */

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
export function initBodyTracking(scene, THREE, config) {
    const bodyMesh = {
        joints: {},
        bones: {}
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
    
    return bodyMesh;
}

// Update body mesh with new pose data
export function updateBodyMesh(landmarks, bodyMesh, updateBoneFn, leftHandLandmarks, rightHandLandmarks) {
    const scaleFactor = 2.5; // Unified scaling factor
    const leftHandActive = leftHandLandmarks && leftHandLandmarks.length > 0;
    const rightHandActive = rightHandLandmarks && rightHandLandmarks.length > 0;

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

        // Convert to 3D space, flipping coordinates as needed
        joint.position.set(
            -(landmark.x - 0.5) * scaleFactor, // x flipped, centered, and scaled
            (landmark.y - 0.5) * -scaleFactor, // y inverted, centered, and scaled
            (landmark.z * scaleFactor) // z scaled consistently
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
    
    // Update bones between joints (POSE_CONNECTIONS is already filtered)
    for (const connection of POSE_CONNECTIONS) {
        const [i, j] = connection;
        const connectionKey = connection.join('-');
        
        // Ensure the bone exists in our mesh structure
        const bone = bodyMesh.bones[connectionKey];
        if (!bone) {
            // If not found, check the reversed key (should have been stored during init)
             const reversedBone = bodyMesh.bones[`${j}-${i}`];
             if (!reversedBone) continue; // Skip if bone doesn't exist either way
             // Use the reversed bone if found (should not typically happen with new init logic)
             // console.warn(`Using reversed bone key for ${connectionKey}`);
             // bone = reversedBone; // No need to reassign, just use it below
        }
        
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
}