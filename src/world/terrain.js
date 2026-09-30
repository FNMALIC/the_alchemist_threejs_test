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
        this.segments = segments;
        this.cell = size / segments;

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

    // Height of the rendered ground mesh (flat triangles between grid points), for things
    // that must sit exactly on the visible surface, like footprints
    surfaceHeightAt(x, z) {
        const u0 = (x - (this.center.x - this.size / 2)) / this.cell;
        const v0 = (z - (this.center.z - this.size / 2)) / this.cell;
        const ix = Math.floor(u0), iz = Math.floor(v0);
        const u = u0 - ix, v = v0 - iz;
        const x0 = this.center.x - this.size / 2 + ix * this.cell;
        const z0 = this.center.z - this.size / 2 + iz * this.cell;
        const a = this.heightAt(x0, z0);
        const b = this.heightAt(x0, z0 + this.cell);
        const c = this.heightAt(x0 + this.cell, z0 + this.cell);
        const d = this.heightAt(x0 + this.cell, z0);
        // Same split as PlaneGeometry: triangles (a, b, d) and (b, c, d)
        return u + v <= 1
            ? a + (d - a) * u + (b - a) * v
            : c + (b - c) * (1 - u) + (d - c) * (1 - v);
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

        this.addGlitter(material);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.castShadow = true; // Dunes throw long shadows when the sun is low
        return mesh;
    }

    // Sand glitter (after Journey): each tiny cell of sand is a grain facet turned a random way;
    // the few that happen to mirror the moon or sun toward the eye flash briefly as you move.
    // World sets glitter.direction / color / strength from the brightest light every frame.
    addGlitter(material) {
        this.glitter = {
            direction: { value: new THREE.Vector3(0, 1, 0) },
            color: { value: new THREE.Color(1, 1, 1) },
            strength: { value: 0 }
        };

        material.onBeforeCompile = shader => {
            shader.uniforms.glitterDirection = this.glitter.direction;
            shader.uniforms.glitterColor = this.glitter.color;
            shader.uniforms.glitterStrength = this.glitter.strength;

            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nvarying vec3 vGlitterPosition;')
                .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
                    vGlitterPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>
                    uniform vec3 glitterDirection;
                    uniform vec3 glitterColor;
                    uniform float glitterStrength;
                    varying vec3 vGlitterPosition;
                    float glitterHash(vec3 p, vec3 k) { return fract(sin(dot(p, k)) * 43758.5453); }`)
                .replace('#include <opaque_fragment>', `{
                    vec3 grainSpace = vGlitterPosition * 45.0; // ~2 cm grains
                    vec3 cell = floor(grainSpace);
                    vec2 inCell = fract(grainSpace.xz) - 0.5;
                    float pinpoint = smoothstep(0.18, 0.0, length(inCell)); // A tiny point, not the whole cell
                    float a = glitterHash(cell, vec3(12.9898, 78.233, 37.719));
                    float b = glitterHash(cell, vec3(39.346, 11.135, 83.155));
                    float c = glitterHash(cell, vec3(73.156, 52.235, 9.151));
                    vec3 facet = normalize(vec3(a * 2.0 - 1.0, 0.8, b * 2.0 - 1.0));
                    vec3 toEye = normalize(cameraPosition - vGlitterPosition);
                    vec3 halfway = normalize(glitterDirection + toEye);
                    float sparkle = pow(max(dot(facet, halfway), 0.0), 800.0) * step(0.96, c) * pinpoint;
                    float nearby = 1.0 - smoothstep(5.0, 30.0, length(cameraPosition - vGlitterPosition));
                    outgoingLight += glitterColor * sparkle * nearby * glitterStrength * 3.0;
                }
                #include <opaque_fragment>`);
        };
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
