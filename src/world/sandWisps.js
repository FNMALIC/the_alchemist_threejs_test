// sandWisps.js - Sand blowing off the dune crests in thin wisps. When the wind is strong enough to
// lift grains (see Wind.transport), the highest ridges across the wind start to smoke: grains are
// carried up the gentle windward side and thrown off the sharp crest, trailing downwind and
// settling on the lee face. Only on high ridges, only around the player, mostly where they look.
import * as THREE from 'three';
import { createGlowTexture } from './sky.js';

const MAX_GRAINS = 2400;
const MAX_CRESTS = 6;
const NEAREST = 10; // Metres: crests closer than this are left alone (you'd be standing in it)
const FARTHEST = 75;
const HIGH_RIDGE = 4; // Metres: only crests at least this high
const SAND = new THREE.Color(0xd9bf8f);

export class SandWisps {
    // heightAt(x, z): the dunes
    constructor(heightAt) {
        this.heightAt = heightAt;
        this.crests = []; // { x, y, z, along: Vector2 (across the wind), age, life }
        this.grains = []; // Free slots are reused
        this.free = [];
        for (let i = MAX_GRAINS - 1; i >= 0; i--) this.free.push(i);
        this.state = new Float32Array(MAX_GRAINS * 7); // x, y, z, vx, vy, vz, age (life in `lives`)
        this.lives = new Float32Array(MAX_GRAINS);
        this.spawnDebt = 0;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_GRAINS * 3), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_GRAINS * 4), 4));
        this.points = new THREE.Points(geometry, new THREE.PointsMaterial({
            map: createGlowTexture('rgba(255, 255, 255, 1)', 32),
            size: 0.42,
            vertexColors: true,
            transparent: true,
            depthWrite: false
        }));
        this.points.frustumCulled = false;
        this.color = new THREE.Color();
        this.forward = new THREE.Vector3();
    }

    // Is (x, z) the crest of a high ridge across the wind? Returns the crest height, or null.
    crestAt(x, z, wind) {
        const h = this.heightAt;
        // Climb along the wind to the very top of the ridge: in metre steps, then half-metre ones
        for (const step of [1, 0.5]) {
            for (let i = 0; i < 15; i++) {
                const here = h(x, z);
                if (h(x + wind.x * step, z + wind.y * step) > here) { x += wind.x * step; z += wind.y * step; }
                else if (h(x - wind.x * step, z - wind.y * step) > here) { x -= wind.x * step; z -= wind.y * step; }
                else break;
            }
        }
        const top = h(x, z);
        if (top < HIGH_RIDGE) return null;
        // A ridge: rises from upwind, drops away downwind
        const upwind = h(x - wind.x * 2.5, z - wind.y * 2.5);
        const downwind = h(x + wind.x * 2.5, z + wind.y * 2.5);
        if (top - upwind < 0.12 || top - downwind < 0.35) return null;
        return { x, y: top, z };
    }

    // Look for a new crest, somewhere ahead of the eye
    findCrest(camera, wind) {
        camera.getWorldDirection(this.forward);
        const look = Math.atan2(this.forward.x, this.forward.z) + (Math.random() - 0.5) * 2.4;
        const distance = NEAREST + Math.sqrt(Math.random()) * (FARTHEST - NEAREST);
        const crest = this.crestAt(
            camera.position.x + Math.sin(look) * distance, camera.position.z + Math.cos(look) * distance, wind
        );
        if (!crest) return;
        if (this.crests.some(c => Math.hypot(c.x - crest.x, c.z - crest.z) < 6)) return;
        this.crests.push({ ...crest, age: 0, life: 4 + Math.random() * 6 });
    }

    // wind: Wind; light: 0..1 how lit the sand is (moonlight to sunlight)
    // glow: how much brighter blowing sand looks against the light (looking toward a low sun,
    // the grains scatter it forward and shine)
    update(delta, camera, wind, light, glow = 0) {
        const transport = wind.transport;
        const direction = wind.direction;

        // Crests: found while the wind can lift sand, each smoking for a few seconds
        if (transport > 0) {
            for (let i = 0; i < 4 && this.crests.length < MAX_CRESTS; i++) this.findCrest(camera, direction);
        }
        for (let i = this.crests.length - 1; i >= 0; i--) {
            const crest = this.crests[i];
            crest.age += delta;
            const tooFar = Math.hypot(crest.x - camera.position.x, crest.z - camera.position.z) > FARTHEST + 10;
            if (crest.age > crest.life || tooFar) this.crests.splice(i, 1);
        }

        // New grains: far more as the wind rises past the threshold (sand flux grows ~ speed³)
        this.spawnDebt += delta * Math.min(1400, 5000 * transport * transport) * Math.min(1, this.crests.length);
        while (this.spawnDebt >= 1 && this.crests.length > 0 && this.free.length > 0) {
            this.spawnDebt -= 1;
            const crest = this.crests[Math.floor(Math.random() * this.crests.length)];
            const swell = Math.sin(Math.PI * Math.min(1, crest.age / crest.life)); // Rises and dies away
            if (Math.random() > swell) continue;
            this.spawn(crest, direction, wind.strength);
        }
        this.spawnDebt = Math.min(this.spawnDebt, 50);

        // Move them: carried downwind, a little lift, a flutter, then settling
        const { state, lives } = this;
        const positions = this.points.geometry.attributes.position;
        const colors = this.points.geometry.attributes.color;
        this.color.copy(SAND).multiplyScalar(light * (1 + glow));
        for (let i = 0; i < MAX_GRAINS; i++) {
            const o = i * 7;
            if (lives[i] <= 0) continue;
            state[o + 6] += delta;
            const age = state[o + 6];
            if (age >= lives[i]) {
                lives[i] = 0;
                colors.setW(i, 0);
                this.free.push(i);
                continue;
            }
            const flutter = Math.sin(age * 9 + i) * 0.4;
            state[o] += (state[o + 3] + direction.y * flutter) * delta;
            state[o + 1] += state[o + 4] * delta;
            state[o + 2] += (state[o + 5] - direction.x * flutter) * delta;
            state[o + 4] -= 0.35 * delta; // Settling
            positions.setXYZ(i, state[o], state[o + 1], state[o + 2]);
            const t = age / lives[i];
            const alpha = Math.min(1, t * 6) * (1 - t) * 0.6;
            colors.setXYZW(i, this.color.r, this.color.g, this.color.b, alpha);
        }
        positions.needsUpdate = true;
        colors.needsUpdate = true;
    }

    spawn(crest, direction, strength) {
        const i = this.free.pop();
        const o = i * 7;
        const across = (Math.random() - 0.5) * 3; // Along the ridge line
        const speed = (1.2 + Math.random() * 1.6) * Math.min(2.5, 0.6 + strength);
        this.state[o] = crest.x - direction.y * across;
        this.state[o + 1] = crest.y + 0.05 + Math.random() * 0.1;
        this.state[o + 2] = crest.z + direction.x * across;
        this.state[o + 3] = direction.x * speed;
        this.state[o + 4] = 0.25 + Math.random() * 0.45;
        this.state[o + 5] = direction.y * speed;
        this.state[o + 6] = 0;
        this.lives[i] = 1.2 + Math.random() * 1.6;
    }
}
