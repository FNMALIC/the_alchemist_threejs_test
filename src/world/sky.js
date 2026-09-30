// sky.js - Night sky: gradient dome, stars and moon. Follows the camera so it never gets closer.
import * as THREE from 'three';

export const HORIZON_COLOR = new THREE.Color(0x1b2340);
const ZENITH_COLOR = new THREE.Color(0x02030a);
const SKY_RADIUS = 800;

// Direction the moonlight comes from (also used for the moon light in world.js)
export const MOON_DIRECTION = new THREE.Vector3(-0.35, 0.5, -0.8).normalize();

export class Sky {
    constructor() {
        this.group = new THREE.Group();
        this.group.add(this.createDome());
        this.group.add(this.createStars());
        this.group.add(this.createMoon());
    }

    createDome() {
        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                horizonColor: { value: HORIZON_COLOR },
                zenithColor: { value: ZENITH_COLOR }
            },
            vertexShader: /* glsl */`
                varying vec3 vDirection;
                void main() {
                    vDirection = normalize(position);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform vec3 horizonColor;
                uniform vec3 zenithColor;
                varying vec3 vDirection;
                void main() {
                    float height = smoothstep(0.0, 0.6, vDirection.y);
                    gl_FragColor = vec4(mix(horizonColor, zenithColor, height), 1.0);
                }
            `
        });

        const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), material);
        dome.renderOrder = -1;
        return dome;
    }

    createStars(count = 2500) {
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const direction = new THREE.Vector3();
        const color = new THREE.Color();

        for (let i = 0; i < count; i++) {
            // Random direction on the upper part of the sky
            do {
                direction.randomDirection();
            } while (direction.y < 0.02);

            direction.multiplyScalar(SKY_RADIUS * 0.95).toArray(positions, i * 3);

            // Vary brightness, with a hint of warm and cool stars
            const brightness = 0.35 + Math.random() * 0.65;
            color.setHSL(Math.random() < 0.5 ? 0.6 : 0.1, 0.3, brightness).toArray(colors, i * 3);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.8,
            sizeAttenuation: false,
            vertexColors: true,
            fog: false,
            depthWrite: false
        });

        return new THREE.Points(geometry, material);
    }

    createMoon() {
        const moon = new THREE.Group();
        moon.position.copy(MOON_DIRECTION).multiplyScalar(SKY_RADIUS * 0.9);

        const disc = new THREE.Mesh(
            new THREE.SphereGeometry(10, 32, 16),
            new THREE.MeshBasicMaterial({ color: 0xf4f1e0, fog: false })
        );
        moon.add(disc);

        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: createGlowTexture('rgba(200, 210, 255, 0.35)'),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
        }));
        halo.scale.setScalar(90);
        moon.add(halo);

        return moon;
    }

    update(camera) {
        this.group.position.copy(camera.position);
    }
}

// Soft radial glow, shared by the moon halo and the orb
export function createGlowTexture(innerColor, size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    // Fade quickly from the centre so the edge of the sprite is never visible
    const [r, g, b, a] = innerColor.match(/[\d.]+/g).map(Number);
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(0.25, `rgba(${r}, ${g}, ${b}, ${a * 0.35})`);
    gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${a * 0.08})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}
