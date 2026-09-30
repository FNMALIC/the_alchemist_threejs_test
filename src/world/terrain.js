// terrain.js - Desert dunes, flattened around the oasis and the orb, lower along the way between them
import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

const noise = new ImprovedNoise(); // Fixed permutation: the same desert every time

function smoothstep(edge0, edge1, x) {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// Distance from point (px, pz) to the segment a-b on the ground plane
function distanceToSegment(px, pz, a, b) {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / (abx * abx + abz * abz)));
    return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
}

export class Terrain {
    // oasis, orb: { x, z } centres of the two flat areas
    constructor({ oasis, orb, size = 600, segments = 280 }) {
        this.oasis = oasis;
        this.orb = orb;
        this.size = size;
        this.center = { x: (oasis.x + orb.x) / 2, z: (oasis.z + orb.z) / 2 };

        this.mesh = this.createMesh(segments);
    }

    // Ground height at a world position; used for the mesh and to keep things on the ground
    heightAt(x, z) {
        // Dunes: sharp ridges stretched across the wind, plus softer swells and ripples
        const ridge = 1 - Math.abs(noise.noise(x * 0.012, 0.5, z * 0.02));
        const swell = noise.noise(x * 0.035 + 100, 1.5, z * 0.05);
        const ripple = noise.noise(x * 0.1, 7.3, z * 0.1);
        const dunes = ridge * ridge * 9 + swell * 2.5 + ripple * 0.4;

        // Flat ground at the oasis and around the orb; low dunes along the way between them
        const oasisFlat = smoothstep(18, 40, Math.hypot(x - this.oasis.x, z - this.oasis.z));
        const orbFlat = smoothstep(8, 28, Math.hypot(x - this.orb.x, z - this.orb.z));
        const pathLow = 0.3 + 0.7 * smoothstep(6, 35, distanceToSegment(x, z, this.oasis, this.orb));

        // A shallow hollow for the oasis pool
        const poolDip = -0.6 * (1 - smoothstep(3, 6, Math.hypot(x - this.oasis.poolX, z - this.oasis.poolZ)));

        return dunes * oasisFlat * orbFlat * pathLow + poolDip;
    }

    createMesh(segments) {
        const geometry = new THREE.PlaneGeometry(this.size, this.size, segments, segments);
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(this.center.x, 0, this.center.z);

        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            positions.setY(i, this.heightAt(positions.getX(i), positions.getZ(i)));
        }
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0xd9b98a,
            roughness: 1,
            metalness: 0
        });

        return new THREE.Mesh(geometry, material);
    }

    // Where the player may walk: the terrain minus a margin, so the edge stays hidden in the fog
    bounds(margin = 60) {
        const half = this.size / 2 - margin;
        return {
            minX: this.center.x - half,
            maxX: this.center.x + half,
            minZ: this.center.z - half,
            maxZ: this.center.z + half
        };
    }
}
