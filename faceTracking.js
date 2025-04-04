/**
 * Face tracking module for 3D visualization
 */

// Constants for face mesh visualizations
export const FACEMESH_TESSELATION = [
    // A subset of the full mesh connections
    [127, 34], [34, 139], [139, 127], [11, 0], [0, 37], [37, 11], 
    [232, 231], [231, 120], [120, 232], [72, 37], [37, 39], [39, 72],
    [128, 121], [121, 47], [47, 128], [232, 121], [121, 128], [128, 232],
    [104, 69], [69, 67], [67, 104], [175, 152], [152, 157], [157, 175],
    [36, 142], [142, 70], [70, 36], [124, 46], [46, 91], [91, 124],
    // Simplified for brevity
];

export const FACEMESH_CONTOURS = [
    // Face oval
    [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389], 
    [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397], 
    [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152], 
    [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172], 
    [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162], 
    [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10],
    // Simplified for brevity
];

// Initialize face tracking
export function initFaceTracking(scene, THREE, config) {
    const faceMesh = {
        landmarks: {},
        connections: {}
    };
    
    const faceMaterial = new THREE.MeshStandardMaterial({ 
        color: config.threeJS.faceColor,
        emissive: config.threeJS.faceColor,
        emissiveIntensity: 0.3
    });
    
    const jointGeometry = new THREE.SphereGeometry(config.threeJS.jointRadius * 0.5, 8, 8);
    
    // We'll add key face landmarks
    for (let i = 0; i < 468; i++) {
        const joint = new THREE.Mesh(jointGeometry, faceMaterial);
        joint.visible = false;
        scene.add(joint);
        faceMesh.landmarks[i] = joint;
    }
    
    // Create face connections for important contours
    const faceConnectorMaterial = new THREE.MeshStandardMaterial({ 
        color: config.threeJS.faceColor,
        emissive: config.threeJS.faceColor,
        emissiveIntensity: 0.2
    });
    
    for (const connection of FACEMESH_CONTOURS) {
        const geometry = new THREE.CylinderGeometry(
            config.threeJS.boneRadius * 0.4, 
            config.threeJS.boneRadius * 0.4, 
            1, 8
        );
        geometry.rotateX(Math.PI / 2);
        const bone = new THREE.Mesh(geometry, faceConnectorMaterial);
        scene.add(bone);
        bone.visible = false;
        faceMesh.connections[connection.join('-')] = bone;
    }
    
    return faceMesh;
}

// Update face mesh with new landmark data
export function updateFaceMesh(landmarks, faceMesh, updateBoneFn) {
    const scaleFactor = 2.5; // Unified scaling factor

    // Update face landmarks
    for (let i = 0; i < landmarks.length; i++) {
        if (!faceMesh.landmarks[i]) continue; // Skip if landmark doesn't exist in our mesh
        
        const landmark = landmarks[i];
        const joint = faceMesh.landmarks[i];
        
        // Position face landmarks in 3D space
        joint.position.set(
            -(landmark.x - 0.5) * scaleFactor, 
            (landmark.y - 0.5) * -scaleFactor, 
            (landmark.z * scaleFactor) // Apply consistent scaling
        );
        
        // Assume face landmarks are always visible if detected
        joint.visible = true; 
    }
    
    // Update face contour connections
    for (const connection of FACEMESH_CONTOURS) {
        const [i, j] = connection;
        if (!faceMesh.connections[connection.join('-')] || 
            !faceMesh.landmarks[i] || 
            !faceMesh.landmarks[j]) continue;
        
        const bone = faceMesh.connections[connection.join('-')];
        const jointA = faceMesh.landmarks[i];
        const jointB = faceMesh.landmarks[j];

        // Only show bones if both connected joints are visible (which they should be if face is detected)
        if(jointA.visible && jointB.visible) {
             updateBoneFn(bone, jointA.position, jointB.position);
             bone.visible = true;
        } else {
            bone.visible = false;
        }
    }
}

// Hide face mesh
export function hideFaceMesh(faceMesh) {
    // Hide all face landmarks and connections
    for (const key in faceMesh.landmarks) {
        faceMesh.landmarks[key].visible = false;
    }
    
    for (const key in faceMesh.connections) {
        faceMesh.connections[key].visible = false;
    }
}