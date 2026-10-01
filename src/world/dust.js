// dust.js - Fine sand drifting on the wind around the player
import * as THREE from 'three';
import { createGlowTexture } from './sky.js';

const BOX = new THREE.Vector3(60, 8, 60); // Area around the player that is filled with dust
const WIND = new THREE.Vector3(1.6, 0.05, 0.6);

export class Dust {
    constructor(count = 1500) {
        this.count = count;
        this.offsets = new Float32Array(count * 3); // Position within the box, 0..BOX
        this.drift = new Float32Array(count); // Per-particle speed variation

        for (let i = 0; i < count; i++) {
            this.offsets[i * 3] = Math.random() * BOX.x;
            this.offsets[i * 3 + 1] = Math.random() * BOX.y;
            this.offsets[i * 3 + 2] = Math.random() * BOX.z;
            this.drift[i] = 0.6 + Math.random() * 0.8;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));

        this.points = new THREE.Points(geometry, new THREE.PointsMaterial({
            color: 0xd8c7a0,
            map: createGlowTexture('rgba(255, 255, 255, 1)', 32), // Soft round motes, not squares
            size: 0.08,
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        }));
        this.points.frustumCulled = false; // Always around the camera
    }

    // storm: 0 calm .. 1 sandstorm (thicker, larger grains driven much faster)
    update(delta, elapsed, camera, storm = 0) {
        const positions = this.points.geometry.attributes.position.array;
        const { offsets, drift } = this;
        const box = [BOX.x, BOX.y, BOX.z];
        const force = 1 + storm * 9;
        const wind = [WIND.x * force, WIND.y * (1 + storm * 3), WIND.z * force];
        this.points.material.opacity = 0.4 + storm * 0.45;
        this.points.material.size = 0.08 + storm * 0.1;
        const origin = [camera.position.x - BOX.x / 2, camera.position.y - 3, camera.position.z - BOX.z / 2];

        for (let i = 0; i < this.count; i++) {
            const gust = 1 + Math.sin(elapsed * 0.7 + i) * 0.3;
            for (let axis = 0; axis < 3; axis++) {
                const index = i * 3 + axis;
                offsets[index] += wind[axis] * drift[i] * gust * delta;

                // Wrap relative to the camera so the dust always surrounds the player
                const size = box[axis];
                const position = ((offsets[index] + (axis === 1 ? 0 : -origin[axis])) % size + size) % size;
                positions[index] = origin[axis] + position;
            }
        }

        this.points.geometry.attributes.position.needsUpdate = true;
    }
}
