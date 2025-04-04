/**
 * Utility functions for 3D visualization
 */

import * as THREE from 'three';

// Create a bone (cylinder) between joints
export function createBone(material, radius) {
    // Create a cylinder for the bone
    const geometry = new THREE.CylinderGeometry(radius, radius, 1, 8);
    // Rotate the cylinder so it's aligned along the z-axis
    geometry.rotateX(Math.PI / 2);
    const bone = new THREE.Mesh(geometry, material);
    return bone;
}

// Update bone position and orientation
export function updateBone(bone, startPos, endPos) {
    // Position
    const midpoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
    bone.position.copy(midpoint);

    // Orientation
    bone.lookAt(endPos);

    // Scale
    const length = startPos.distanceTo(endPos);
    bone.scale.set(1, 1, length);
}

// Function to create a simple terrain
export function createTerrain(width, height, segmentsWidth, segmentsHeight) {
    const geometry = new THREE.PlaneGeometry(width, height, segmentsWidth, segmentsHeight);
    geometry.rotateX(-Math.PI / 2); // Rotate to be horizontal

    // Make it slightly uneven (simple noise)
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i+1] = (Math.random() - 0.5) * 0.5; // Modify y-coordinate (height) randomly
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals(); // Recalculate normals for lighting

    const material = new THREE.MeshStandardMaterial({
        color: 0x888888, // Greyish color
        roughness: 0.9,
        metalness: 0.1,
        wireframe: false, // Set to true to see the segments
        side: THREE.DoubleSide // Make sure it's visible from below if camera dips
    });

    const terrain = new THREE.Mesh(geometry, material);
    terrain.position.y = -1.5; // Position the terrain below the avatar
    return terrain;
}