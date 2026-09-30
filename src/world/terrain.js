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
        geometry.setAttribute('color', this.createSandColors(geometry));

        const ripples = createRippleNormalMap();
        ripples.repeat.set(this.size / 4, this.size / 4); // One tile of ripples every 4 units

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.95,
            metalness: 0,
            normalMap: ripples,
            normalScale: new THREE.Vector2(0.4, 0.4)
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.castShadow = true; // Dunes throw long shadows when the sun is low
        return mesh;
    }

    // Sand colour: pale on the crests, deeper in the hollows and on steep faces, damp near the pool
    createSandColors(geometry) {
        const positions = geometry.attributes.position;
        const normals = geometry.attributes.normal;
        const colors = new Float32Array(positions.count * 3);
        const trough = new THREE.Color(0xc29d6c);
        const crest = new THREE.Color(0xe8d0a6);
        const damp = new THREE.Color(0x6f5c45);
        const color = new THREE.Color();

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);
            const height = positions.getY(i);

            color.copy(trough).lerp(crest, THREE.MathUtils.clamp(height / 7, 0, 1));
            color.multiplyScalar(0.8 + 0.2 * normals.getY(i)); // Steeper faces a little darker

            const fromPool = Math.hypot(x - this.oasis.poolX, z - this.oasis.poolZ);
            color.lerp(damp, 1 - smoothstep(5, 8, fromPool));

            color.toArray(colors, i * 3);
        }

        return new THREE.BufferAttribute(colors, 3);
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

// Tileable normal map of wind ripples: sharp crests, soft troughs, gently wavering lines
function createRippleNormalMap(size = 256) {
    const TAU = Math.PI * 2;
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;
            // Integer frequencies only, so the tile repeats seamlessly
            const warp = 0.06 * Math.sin(TAU * (2 * v + 0.3)) + 0.04 * Math.sin(TAU * (3 * u + v)) +
                0.02 * Math.sin(TAU * (5 * v - 2 * u));
            const phase = TAU * (8 * u + warp * 2.5); // Long, gently wavering lines
            const wave = 0.5 + 0.5 * Math.sin(phase);
            heights[y * size + x] = Math.pow(wave, 2.5);
        }
    }

    const data = new Uint8Array(size * size * 4);
    const at = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];
    const strength = 2.5;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
            const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
            const length = Math.hypot(dx, dy, 1);
            const index = (y * size + x) * 4;
            data[index] = ((-dx / length) * 0.5 + 0.5) * 255;
            data[index + 1] = ((-dy / length) * 0.5 + 0.5) * 255;
            data[index + 2] = ((1 / length) * 0.5 + 0.5) * 255;
            data[index + 3] = 255;
        }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}
