// breathMist.js - Your breath in the cold. The desert night is cold, and each breath out leaves a
// small faint cloud in front of you that drifts off on the wind and thins away. Quicker and
// bigger after hurrying. As the sun comes up and warms the air, it fades and is gone.
import * as THREE from 'three';
import { createGlowTexture } from '../world/sky.js';

const PUFFS = 28; // Wisps in the pool (a few per breath)
const BREATH_OUT = 0.38; // Where in a breath the breathing out starts (see breathing.js)

export class BreathMist {
    constructor(scene) {
        const texture = createGlowTexture('rgba(255, 255, 255, 1)', 64);
        this.puffs = Array.from({ length: PUFFS }, () => {
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthWrite: false,
                opacity: 0
            }));
            sprite.visible = false;
            sprite.userData = { age: 0, life: 1, velocity: new THREE.Vector3(), size: 0.3, strength: 0 };
            scene.add(sprite);
            return sprite;
        });
        this.next = 0;
        this.lastPhase = 0;
        this.forward = new THREE.Vector3();
        this.color = new THREE.Color();
    }

    // camera: the eyes; breathing: Breathing; wind: Wind; cold: 0 warm .. 1 a cold night;
    // light: 0..1 how lit the world is (it is seen only by moonlight, starlight, dawn)
    update(delta, camera, breathing, wind, cold, light) {
        // A breath goes out: a few wisps, more and bigger when out of breath
        const phase = breathing.phase;
        const breathedOut = this.lastPhase < BREATH_OUT && phase >= BREATH_OUT;
        this.lastPhase = phase;
        if (breathedOut && cold > 0.02) {
            const deep = breathing.depth * (1 + 0.8 * breathing.exertion);
            const wisps = 3 + Math.round(2 * breathing.exertion);
            for (let i = 0; i < wisps; i++) this.spawn(camera, wind, cold * deep, i / wisps);
        }

        this.color.setScalar(0.25 + 0.75 * light);
        for (const sprite of this.puffs) {
            if (!sprite.visible) continue;
            const puff = sprite.userData;
            puff.age += delta;
            if (puff.age < 0) continue; // Not out yet
            const t = puff.age / puff.life;
            if (t >= 1) {
                sprite.visible = false;
                continue;
            }
            puff.velocity.multiplyScalar(Math.exp(-delta * 1.6)); // The breath slows in the air...
            puff.velocity.x += wind.direction.x * wind.strength * 0.5 * delta; // ...and the wind takes it
            puff.velocity.z += wind.direction.y * wind.strength * 0.5 * delta;
            puff.velocity.y += 0.04 * delta; // Warm, it rises a little
            sprite.position.addScaledVector(puff.velocity, delta);
            sprite.scale.setScalar(puff.size * (0.35 + 1.3 * Math.sqrt(t)));
            sprite.material.opacity = puff.strength * Math.min(1, t * 7) * Math.pow(1 - t, 1.6);
            sprite.material.color.copy(this.color);
        }
    }

    spawn(camera, wind, strength, offset) {
        const sprite = this.puffs[this.next];
        this.next = (this.next + 1) % PUFFS;
        camera.getWorldDirection(this.forward);
        const puff = sprite.userData;
        // From the mouth: a little in front of the eyes and below them
        sprite.position.copy(camera.position).addScaledVector(this.forward, 0.22 + offset * 0.08);
        sprite.position.y -= 0.12;
        puff.velocity.copy(this.forward).multiplyScalar(0.45 + Math.random() * 0.2);
        puff.velocity.y -= 0.05;
        puff.velocity.x += (Math.random() - 0.5) * 0.08;
        puff.velocity.z += (Math.random() - 0.5) * 0.08;
        puff.age = -offset * 0.25; // The wisps of one breath come out one after another
        puff.life = 1.6 + Math.random() * 0.6;
        puff.size = 0.32 + Math.random() * 0.12;
        puff.strength = Math.min(0.22, 0.13 * strength);
        sprite.material.opacity = 0;
        sprite.visible = true;
    }
}
