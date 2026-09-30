// orb.js - The glowing orb (the "treasure") with sound-reactive waves and orbiting particles
import * as THREE from 'three';
import { createGlowTexture } from './world/sky.js';

const BASE_COLOR = 0xffcc66;
const WAVE_COUNT = 32;
const PARTICLE_COUNT = 100;

export class Orb {
    constructor(position) {
        this.material = new THREE.MeshStandardMaterial({
            emissive: BASE_COLOR,
            emissiveIntensity: 2
        });
        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), this.material);
        this.mesh.position.copy(position);
        this.baseHeight = position.y;

        this.waves = this.createWaves();
        this.mesh.add(this.waves);

        this.particles = this.createParticles();
        this.mesh.add(this.particles);

        // A halo that shines through the fog, so the light is visible from far away
        this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: createGlowTexture('rgba(255, 214, 140, 0.9)'),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
        }));
        this.glow.scale.setScalar(10);
        this.mesh.add(this.glow);
    }

    get position() {
        return this.mesh.position;
    }

    get visible() {
        return this.mesh.visible;
    }

    hide() {
        this.mesh.visible = false;
    }

    // Sound visualisation rings around the orb
    createWaves() {
        const waves = new THREE.Group();
        const geometry = new THREE.TorusGeometry(0.8, 0.02, 16, 100);
        const material = new THREE.MeshBasicMaterial({
            color: BASE_COLOR,
            transparent: true,
            opacity: 0.3
        });

        for (let i = 0; i < WAVE_COUNT; i++) {
            const wave = new THREE.Mesh(geometry, material.clone());
            wave.rotation.x = Math.PI / 2;
            wave.rotation.z = (Math.PI * 2) * (i / WAVE_COUNT);
            wave.userData = {
                initialScale: 0.6 + (Math.random() * 0.4) // 0.6 to 1.0
            };
            waves.add(wave);
        }

        return waves;
    }

    // Small motes of light orbiting the orb
    createParticles() {
        const particles = new THREE.Group();
        const geometry = new THREE.SphereGeometry(0.03, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: BASE_COLOR,
            transparent: true,
            opacity: 0.6
        });

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const particle = new THREE.Mesh(geometry, material.clone());
            particle.userData = {
                originalRadius: 0.7 + Math.random() * 0.3, // Between 0.7 and 1.0
                theta: Math.random() * Math.PI * 2,
                phi: Math.random() * Math.PI,
                speed: 0.5 + Math.random()
            };
            particles.add(particle);
        }

        return particles;
    }

    // proximity: 0 (far) .. 1 (at the orb). The orb brightens, whitens and pulses as you approach.
    setProximity(proximity, elapsed) {
        if (proximity <= 0) {
            this.material.emissiveIntensity = 2;
            this.material.emissive.setHex(BASE_COLOR);
            this.mesh.scale.setScalar(1);
            this.particles.children.forEach(particle => {
                particle.material.opacity = 0.6;
            });
            return;
        }

        this.material.emissiveIntensity = 2 + (proximity * 3);

        // Shift from yellow-orange towards white
        const hue = 0.12 - (proximity * 0.05);
        const saturation = 0.8 - (proximity * 0.3);
        this.material.emissive.setHSL(hue, saturation, 0.5 + (proximity * 0.3));

        const pulseScale = 1 + (Math.sin(elapsed * 5) * 0.05 * proximity);
        this.mesh.scale.setScalar(pulseScale);

        this.particles.children.forEach(particle => {
            particle.material.opacity = 0.6 + (proximity * 0.4);
        });
    }

    update(delta, elapsed, frequencyData) {
        if (!this.visible) return;

        this.mesh.rotation.y += 0.6 * delta;
        this.mesh.position.y = this.baseHeight + Math.sin(elapsed * 0.8) * 0.15; // Gentle hovering

        // Waves react to the music
        if (frequencyData) {
            this.waves.children.forEach((wave, index) => {
                const dataIndex = Math.floor(index / WAVE_COUNT * frequencyData.length);
                const audioValue = frequencyData[dataIndex] / 255;

                const scale = wave.userData.initialScale + (audioValue * 0.3);
                wave.scale.setScalar(scale);
                wave.rotation.z += (0.12 + (audioValue * 0.3)) * delta;
                wave.material.opacity = 0.1 + (audioValue * 0.4);
            });
        }

        // Particles orbit and breathe in and out
        this.particles.children.forEach(particle => {
            const userData = particle.userData;
            userData.theta += 0.6 * userData.speed * delta;

            const pulseFactor = Math.sin(elapsed * userData.speed) * 0.1;
            const radius = userData.originalRadius * (1 + pulseFactor);

            particle.position.set(
                radius * Math.sin(userData.phi) * Math.cos(userData.theta),
                radius * Math.sin(userData.phi) * Math.sin(userData.theta),
                radius * Math.cos(userData.phi)
            );
        });
    }
}
