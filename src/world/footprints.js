// footprints.js - The trail of footprints further away, beyond the detailed sand around the player
// (where prints are real dents, see sandPatch.js). One mark per step, lying on the dune's surface,
// drawn as a darkening "multiply" decal so they work in moonlight and sunlight alike.
// All marks are one InstancedMesh (one draw call); the oldest are reused after MAX_PRINTS.
// The wind slowly covers them: they fade between FADE_START and FADE_END seconds old.
import * as THREE from 'three';

const MAX_PRINTS = 1500;
const FOOT_SPACING = 0.11; // Metres from the body's centre line to each foot
const PRINT_SIZE = { width: 0.15, length: 0.3 };
const FADE_START = 240;
const FADE_END = 480;
const PATCH_EDGE = 1.0; // Show marks in the patch's outer metre, where its dents fade out

// A bare footprint: heel, arch, ball and toes, darker where the foot pressed deepest.
// White means "no change" with multiply blending.
function createFootprintTexture() {
    const width = 64, height = 128;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.filter = 'blur(2.5px)';

    const press = (x, y, rx, ry, darkness) => {
        const gradient = context.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
        const shade = Math.round(255 * (1 - darkness));
        gradient.addColorStop(0, `rgb(${shade}, ${Math.round(shade * 0.97)}, ${Math.round(shade * 0.93)})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        context.fill();
    };

    // Toes point up (toward v = 1)
    // In loose sand the whole sole sinks: a soft hollow, deepest at heel and ball
    press(32, 66, 26, 58, 0.28); // Hollow of the whole foot
    press(32, 104, 17, 20, 0.5); // Heel
    press(35, 72, 12, 20, 0.3); // Outer arch
    press(30, 44, 20, 17, 0.55); // Ball of the foot, pressed hardest when pushing off
    [[20, 20, 6], [29, 15, 5.5], [37, 14, 5], [44, 17, 4.5], [50, 22, 4]].forEach(([x, y, r]) => press(x, y, r, r * 1.2, 0.42));

    // Kept as plain (linear) values: a shade of 0.6 darkens the sand to exactly 60%
    return new THREE.CanvasTexture(canvas);
}

export class Footprints {
    // hole: { center, half } uniforms of the detailed sand patch, where real dents take over
    //   (null: drawn everywhere, e.g. someone else's old trail)
    // options.ageing: fade with age (the wind covering them); options.strength: 0..1 how dark
    constructor(heightAt, hole, { ageing = true, strength = 1, name = 'player' } = {}) {
        this.heightAt = heightAt;
        this.next = 0;
        this.time = { value: 0 };

        // Flat on the ground, toes toward -Z
        const geometry = new THREE.PlaneGeometry(PRINT_SIZE.width, PRINT_SIZE.length).rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({
            map: createFootprintTexture(),
            blending: THREE.MultiplyBlending,
            premultipliedAlpha: true,
            transparent: true,
            side: THREE.DoubleSide, // Left feet are mirrored, which flips them over
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            fog: false
        });

        // When each print was made, for fading
        this.birth = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PRINTS), 1);
        this.birth.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('birth', this.birth);

        const time = this.time;
        material.onBeforeCompile = shader => {
            shader.uniforms.printTime = time;
            if (hole) {
                shader.uniforms.holeCenter = hole.center;
                shader.uniforms.holeHalf = hole.half;
            }
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>
                    attribute float birth;
                    uniform float printTime;
                    varying float vPrintFade;
                    varying vec2 vPrintPosition;`)
                .replace('#include <project_vertex>', `#include <project_vertex>
                    vPrintFade = ${ageing
                        ? `1.0 - smoothstep(${FADE_START.toFixed(1)}, ${FADE_END.toFixed(1)}, printTime - birth)`
                        : '1.0'} * ${strength.toFixed(2)};
                    vPrintPosition = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>
                    uniform vec2 holeCenter;
                    uniform float holeHalf;
                    varying float vPrintFade;
                    varying vec2 vPrintPosition;`)
                .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
                    ${hole ? `if (all(lessThan(abs(vPrintPosition - holeCenter), vec2(holeHalf - ${PATCH_EDGE.toFixed(1)})))) discard;` : ''}`)
                .replace('#include <map_fragment>', `#include <map_fragment>
                    diffuseColor.rgb = mix(vec3(1.0), diffuseColor.rgb, vPrintFade); // White leaves the sand unchanged`);
        };

        material.customProgramCacheKey = () => `footprints-${name}`; // Each kind compiles its own shader

        this.mesh = new THREE.InstancedMesh(geometry, material, MAX_PRINTS);
        this.mesh.count = 0;
        this.mesh.frustumCulled = false; // Prints are spread over the whole walk
        this.mesh.renderOrder = 1;

        this.matrix = new THREE.Matrix4();
        this.yaw = new THREE.Quaternion();
        this.tilt = new THREE.Quaternion();
        this.normal = new THREE.Vector3();
        this.position = new THREE.Vector3();
        this.scale = new THREE.Vector3();
        this.up = new THREE.Vector3(0, 1, 0);
    }

    // x, z: where the body is; heading: travel direction angle (atan2(dx, dz)); foot: 1 right, -1 left
    add({ x, z, heading, foot, lift = 0.02 }) {
        const hx = Math.sin(heading), hz = Math.cos(heading);
        // Each foot lands a little to its side of the centre line, turned out slightly
        const px = x + -hz * foot * FOOT_SPACING;
        const pz = z + hx * foot * FOOT_SPACING;
        const turnOut = foot * 0.12 + (Math.random() - 0.5) * 0.08;

        const e = 0.15;
        this.normal.set(
            this.heightAt(px - e, pz) - this.heightAt(px + e, pz),
            2 * e,
            this.heightAt(px, pz - e) - this.heightAt(px, pz + e)
        ).normalize();

        this.yaw.setFromAxisAngle(this.up, Math.atan2(-hx, -hz) - turnOut);
        this.tilt.setFromUnitVectors(this.up, this.normal).multiply(this.yaw);
        this.position.set(px, this.heightAt(px, pz) + lift, pz);
        const size = 0.95 + Math.random() * 0.1;
        this.scale.set(foot < 0 ? -size : size, 1, size); // Mirror the left foot

        this.mesh.setMatrixAt(this.next, this.matrix.compose(this.position, this.tilt, this.scale));
        this.birth.setX(this.next, this.time.value);
        this.birth.needsUpdate = true;
        this.next = (this.next + 1) % MAX_PRINTS;
        this.mesh.count = Math.min(MAX_PRINTS, this.mesh.count + 1);
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    update(delta) {
        this.time.value += delta;
    }
}
