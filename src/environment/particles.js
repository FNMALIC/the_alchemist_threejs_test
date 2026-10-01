// particles.js - Small, short-lived particles for the environment's responses: soft puffs of dust
// kicked up by the feet, a little pollen lifted from a flower, dry bits shaken from a shrub.
//
// One fixed pool, one draw call: nothing is created or destroyed while playing, and when nothing
// is alive the update does no work at all. Their colour follows the light (dim and cool under the
// moon, warm at sunrise) so a puff of dust never glows in the dark. In low quality the pool is
// smaller, there are fewer of each and they fade sooner, and pollen and dry bits are left out.
import * as THREE from 'three';

const POOL = 160;
const LOW_POOL = 64;

// size: metres (grow: how much bigger by the end); life: seconds; speed: m/s outward, rise: m/s up
// drag: per second; gravity: m/s² (negative floats up); flutter: m/s of sideways wobble
// secondary: left out in low quality; settles: lands and rests on the sand
const KINDS = {
    puff: { size: [0.09, 0.15], grow: 1.8, alpha: 0.2, life: [0.9, 1.4], speed: 0.35, rise: 0.15, drag: 3, gravity: 0, flutter: 0, color: 0xd6c19c },
    mote: { size: [0.008, 0.014], grow: 0, alpha: 0.75, life: [1.6, 2.4], speed: 0.12, rise: 0.12, drag: 1.5, gravity: -0.02, flutter: 0.05, color: 0xfff0b0, secondary: true },
    flake: { size: [0.01, 0.018], grow: 0, alpha: 0.85, life: [1.2, 1.8], speed: 0.2, rise: 0.4, drag: 2, gravity: 1.6, flutter: 0.15, color: 0x6a5840, settles: true, secondary: true }
};
const KIND_INDEX = { puff: 0, mote: 1, flake: 2 };
const KIND_LIST = Object.values(KINDS);

const color = new THREE.Color(); // Reused

export class Particles {
    // groundHeightAt(x, z): where falling bits come to rest; low: low quality
    constructor({ groundHeightAt, low = false }) {
        this.groundHeightAt = groundHeightAt;
        this.low = low;
        this.size = low ? LOW_POOL : POOL;
        this.lifeScale = low ? 0.6 : 1;
        this.countScale = low ? 0.5 : 1;
        this.next = 0;
        this.alive = 0;

        const n = this.size;
        this.velocity = new Float32Array(n * 3);
        this.life = new Float32Array(n); // Seconds left; 0 = free
        this.maxLife = new Float32Array(n);
        this.baseSize = new Float32Array(n);
        this.baseAlpha = new Float32Array(n);
        this.kind = new Uint8Array(n);
        this.settled = new Uint8Array(n);
        this.phase = new Float32Array(n);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));

        this.light = new THREE.Color(1, 1, 1);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                light: { value: this.light },
                pixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
            },
            vertexShader: /* glsl */`
                attribute vec3 color;
                attribute float size;
                attribute float alpha;
                uniform float pixelRatio;
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    vColor = color;
                    vAlpha = alpha;
                    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * pixelRatio * 300.0 / -viewPosition.z;
                    gl_Position = projectionMatrix * viewPosition;
                }
            `,
            fragmentShader: /* glsl */`
                uniform vec3 light;
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - 0.5);
                    if (d > 0.5) discard;
                    gl_FragColor = vec4(vColor * light, vAlpha * smoothstep(0.5, 0.1, d));
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

    // How the scene is lit now (a colour, about 0..1 per channel); copied
    setLight(light) {
        this.light.copy(light);
    }

    // Release `count` particles of `kind` ('puff', 'mote', 'flake') from (x, y, z), drifting along
    // the ground direction (dx, dz) at about `speed` × the kind's speed. tint: optional colour.
    // Returns how many were released (fewer in low quality, none of a secondary kind).
    emit(kind, x, y, z, dx, dz, count, speed = 1, tint = null) {
        const spec = KINDS[kind];
        if (!spec || (this.low && spec.secondary)) return 0;
        const total = Math.max(1, Math.round(count * this.countScale));
        const { attributes } = this.points.geometry;

        for (let n = 0; n < total; n++) {
            const i = this.next;
            this.next = (i + 1) % this.size;
            if (this.life[i] <= 0) this.alive++;

            const outward = spec.speed * speed * (0.5 + Math.random() * 0.8);
            const spread = spec.speed * speed * 0.6;
            this.velocity[i * 3] = dx * outward + (Math.random() - 0.5) * spread;
            this.velocity[i * 3 + 1] = spec.rise * (0.5 + Math.random());
            this.velocity[i * 3 + 2] = dz * outward + (Math.random() - 0.5) * spread;
            attributes.position.setXYZ(i, x + (Math.random() - 0.5) * 0.1, y + 0.02, z + (Math.random() - 0.5) * 0.1);

            const life = THREE.MathUtils.lerp(spec.life[0], spec.life[1], Math.random()) * this.lifeScale;
            this.life[i] = this.maxLife[i] = life;
            this.baseSize[i] = THREE.MathUtils.lerp(spec.size[0], spec.size[1], Math.random());
            this.baseAlpha[i] = spec.alpha * (0.7 + Math.random() * 0.3);
            this.kind[i] = KIND_INDEX[kind];
            this.settled[i] = 0;
            this.phase[i] = Math.random() * Math.PI * 2;
            color.set(tint ?? spec.color);
            attributes.color.setXYZ(i, color.r, color.g, color.b);
            attributes.size.setX(i, this.baseSize[i]);
            attributes.alpha.setX(i, 0);
        }
        attributes.color.needsUpdate = true;
        return total;
    }

    update(delta) {
        if (this.alive === 0) return; // Nothing to move or draw

        const { position, size, alpha } = this.points.geometry.attributes;
        for (let i = 0; i < this.size; i++) {
            if (this.life[i] <= 0) continue;
            this.life[i] -= delta;
            if (this.life[i] <= 0) {
                this.life[i] = 0;
                this.alive--;
                alpha.setX(i, 0);
                continue;
            }

            const spec = KIND_LIST[this.kind[i]];
            const age = 1 - this.life[i] / this.maxLife[i]; // 0 .. 1

            if (!this.settled[i]) {
                const v = i * 3;
                const drag = Math.exp(-spec.drag * delta);
                this.velocity[v] *= drag;
                this.velocity[v + 2] *= drag;
                this.velocity[v + 1] = this.velocity[v + 1] * drag - spec.gravity * delta;
                const wobble = spec.flutter * Math.sin(this.phase[i] + age * 14);
                const x = position.getX(i) + (this.velocity[v] + wobble) * delta;
                let y = position.getY(i) + this.velocity[v + 1] * delta;
                const z = position.getZ(i) + (this.velocity[v + 2] - wobble * 0.5) * delta;
                if (spec.settles) {
                    const ground = this.groundHeightAt(x, z) + 0.005;
                    if (y <= ground) {
                        y = ground;
                        this.settled[i] = 1;
                    }
                }
                position.setXYZ(i, x, y, z);
            }

            size.setX(i, this.baseSize[i] * (1 + spec.grow * age));
            // Fade in quickly, then out
            const fade = Math.min(1, age * 10) * (1 - age) * (1 - age);
            alpha.setX(i, this.baseAlpha[i] * fade);
        }
        position.needsUpdate = true;
        size.needsUpdate = true;
        alpha.needsUpdate = true;
    }

    dispose() {
        this.points.removeFromParent();
        this.points.geometry.dispose();
        this.points.material.dispose();
    }
}
