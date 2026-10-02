// farDunes.js - The dunes beyond the dunes. The desert around the player is drawn in detail out to
// about 300 m (terrain.js); past that, this coarse copy of the same dunes (the same height
// formula, a point every 25 m) reaches out 2.5 km, so from high up (the top of the pyramid) the
// dunes carry on to the horizon instead of stopping at an edge. It is cut away wherever the
// detailed desert is drawn, and moves with the player in long strides.
import * as THREE from 'three';

const SIZE = 5000; // Metres across
const CELL = 25;
const SEGMENTS = SIZE / CELL;
const STRIDE = 400; // It moves when the player is this far from its centre (whole cells)
const SINK = 0.4; // A little below the detailed desert where the two overlap

export class FarDunes {
    // terrain: Terrain (the height formula, its sand material and colours, where it is drawn)
    constructor(terrain) {
        this.terrain = terrain;
        this.center = null;

        const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2);
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SIZE);

        // Cut away where the detailed desert is, well inside its edge: where the two meet, this one
        // carries on underneath, so looking down past the edge never shows a gap
        this.inner = { center: { value: new THREE.Vector2() }, half: { value: terrain.size / 2 - 20 } };
        const inner = this.inner;
        const material = terrain.createSandMaterial('far-dunes', shader => {
            shader.uniforms.innerCenter = inner.center;
            shader.uniforms.innerHalf = inner.half;
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>
                    uniform vec2 innerCenter;
                    uniform float innerHalf;`)
                .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
                    if (all(lessThan(abs(vGlitterPosition.xz - innerCenter), vec2(innerHalf)))) discard;`);
        });
        material.normalMap = null; // The ripple map is scaled for the near desert; out here it would be noise

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = false;
        this.mesh.castShadow = false;
        this.mesh.frustumCulled = false;
    }

    // Call every frame with the player's position
    update(x, z) {
        this.inner.center.value.set(this.terrain.center.x, this.terrain.center.z);
        const cx = Math.round(x / STRIDE) * STRIDE, cz = Math.round(z / STRIDE) * STRIDE;
        if (this.center && Math.abs(x - this.center.x) < STRIDE * 0.75 && Math.abs(z - this.center.z) < STRIDE * 0.75) return;
        this.build(cx, cz);
    }

    // Work out the heights, slopes and colours around (cx, cz)
    build(cx, cz) {
        this.center = { x: cx, z: cz };
        const { terrain } = this;
        const geometry = this.mesh.geometry;
        const positions = geometry.attributes.position;
        const normals = geometry.attributes.normal;
        const colors = geometry.attributes.color;
        const row = SEGMENTS + 1;
        const heights = new Float32Array(row * row);
        for (let i = 0; i < positions.count; i++) {
            heights[i] = terrain.heightAt(cx + positions.getX(i), cz + positions.getZ(i));
        }
        const color = new THREE.Color();
        const normal = new THREE.Vector3();
        for (let iz = 0; iz < row; iz++) {
            for (let ix = 0; ix < row; ix++) {
                const i = ix + row * iz;
                const left = heights[Math.max(0, ix - 1) + row * iz], right = heights[Math.min(row - 1, ix + 1) + row * iz];
                const up = heights[ix + row * Math.max(0, iz - 1)], down = heights[ix + row * Math.min(row - 1, iz + 1)];
                normal.set((left - right) / (2 * CELL), 1, (up - down) / (2 * CELL)).normalize();
                normals.setXYZ(i, normal.x, normal.y, normal.z);
                positions.setY(i, heights[i] - SINK);
                terrain.sandColor(cx + positions.getX(i), cz + positions.getZ(i), heights[i], normal.y, color);
                colors.setXYZ(i, color.r, color.g, color.b);
            }
        }
        positions.needsUpdate = normals.needsUpdate = colors.needsUpdate = true;
        this.mesh.position.set(cx, 0, cz);
    }
}
