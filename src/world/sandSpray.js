// sandSpray.js - Grains of sand kicked up by feet, landings and slides.
// A fixed pool of particles in one draw call: they fly, fall with gravity, settle on the dune and fade.
import * as THREE from 'three';

const MAX_GRAINS = 1200;
const GRAVITY = 9.8;
const AIR_DRAG = 1.5; // Fine sand slows quickly in the air

export class SandSpray {
    constructor(heightAt) {
        this.heightAt = heightAt;
        this.next = 0;
        this.velocity = new Float32Array(MAX_GRAINS * 3);
        this.life = new Float32Array(MAX_GRAINS); // Seconds left; 0 = unused
        this.settled = new Uint8Array(MAX_GRAINS);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_GRAINS * 3), 3));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(MAX_GRAINS), 1));
        geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_GRAINS), 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0xd9bf94) },
                pixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
            },
            vertexShader: /* glsl */`
                attribute float alpha;
                attribute float size;
                uniform float pixelRatio;
                varying float vAlpha;
                void main() {
                    vAlpha = alpha;
                    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * pixelRatio * 300.0 / -viewPosition.z;
                    gl_Position = projectionMatrix * viewPosition;
                }
            `,
            fragmentShader: /* glsl */`
                uniform vec3 color;
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - 0.5);
                    if (d > 0.5) discard;
                    gl_FragColor = vec4(color, vAlpha * smoothstep(0.5, 0.2, d));
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }
            `,
            transparent: true,
            depthWrite: false
        });

        this.points = new THREE.Points(geometry, material);
        this.points.frustumCulled = false;
    }

    // Throw `count` grains from (x, y, z), mostly along (dx, dz), with the given speed
    emit(x, y, z, dx, dz, count, speed, spread = 0.6) {
        const positions = this.points.geometry.attributes.position;
        const sizes = this.points.geometry.attributes.size;
        for (let n = 0; n < count; n++) {
            const i = this.next;
            this.next = (this.next + 1) % MAX_GRAINS;

            positions.setXYZ(i, x + (Math.random() - 0.5) * 0.15, y + 0.02, z + (Math.random() - 0.5) * 0.15);
            const s = speed * (0.4 + Math.random() * 0.8);
            this.velocity[i * 3] = (dx + (Math.random() - 0.5) * spread * 2) * s;
            this.velocity[i * 3 + 1] = (0.6 + Math.random() * 0.9) * s;
            this.velocity[i * 3 + 2] = (dz + (Math.random() - 0.5) * spread * 2) * s;
            this.life[i] = 0.8 + Math.random() * 0.8;
            this.settled[i] = 0;
            sizes.setX(i, 0.012 + Math.random() * 0.02);
        }
    }

    update(delta) {
        const positions = this.points.geometry.attributes.position;
        const alphas = this.points.geometry.attributes.alpha;
        const drag = Math.exp(-AIR_DRAG * delta);

        for (let i = 0; i < MAX_GRAINS; i++) {
            if (this.life[i] <= 0) {
                if (alphas.getX(i) !== 0) alphas.setX(i, 0);
                continue;
            }
            this.life[i] -= delta;

            if (!this.settled[i]) {
                const v = i * 3;
                this.velocity[v + 1] -= GRAVITY * delta;
                this.velocity[v] *= drag;
                this.velocity[v + 2] *= drag;
                const x = positions.getX(i) + this.velocity[v] * delta;
                let y = positions.getY(i) + this.velocity[v + 1] * delta;
                const z = positions.getZ(i) + this.velocity[v + 2] * delta;
                const ground = this.heightAt(x, z) + 0.01;
                if (y <= ground) {
                    y = ground; // Lands on the dune and soon blends into the sand
                    this.settled[i] = 1;
                    this.life[i] = Math.min(this.life[i], 0.35);
                }
                positions.setXYZ(i, x, y, z);
            }

            alphas.setX(i, Math.min(1, this.life[i] * 3) * 0.85);
        }

        positions.needsUpdate = true;
        alphas.needsUpdate = true;
    }
}
