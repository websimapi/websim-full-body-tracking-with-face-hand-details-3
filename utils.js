/**
 * Utility functions for 3D visualization
 */
import * as THREE from 'three'; // Import Three.js as a module

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
    // Add a small epsilon to prevent zero scale which can cause issues
    bone.scale.set(1, 1, length + 0.001);
}

// Function to create a simple flat terrain
export function createTerrain(width, height, segmentsWidth, segmentsHeight) {
    const geometry = new THREE.PlaneGeometry(width, height, segmentsWidth, segmentsHeight);
    geometry.rotateX(-Math.PI / 2); // Rotate to be horizontal

    // Remove noise for flat terrain
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i+1] = 0; // Set y-coordinate to 0 for flat terrain
    }
    geometry.attributes.position.needsUpdate = true; 
    geometry.computeVertexNormals(); // Recalculate normals for lighting

    const material = new THREE.MeshStandardMaterial({
        color: 0x4CAF50, // Grass green color
        roughness: 0.9,
        metalness: 0.1,
        wireframe: false,
        side: THREE.DoubleSide
    });

    const terrain = new THREE.Mesh(geometry, material);
    terrain.position.y = -1.8; // Position the terrain slightly lower to ensure avatar is above it
    return terrain;
}