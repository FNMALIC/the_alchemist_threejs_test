// sandResponse.js - The sand answering the feet, built on what the desert already has (footprints,
// grains kicked up by SandSpray) plus faint puffs of dust (particles.js). No second sand simulation.
//
//   walking:   a footprint and a few grains kicked back (exactly as before)
//   hurrying:  more grains, kicked further, and a faint puff behind the heel
//   landing:   a small ring of grains around the feet and a low puff of dust
//   sliding:   a steady trickle of grains, and some dust, while the sand carries you
//   disturb(): sand moved by something else, e.g. a stone rocking in its bed
//
// Each returns how strongly the sand was disturbed (0..1), or 0 if there was no sand.
import * as THREE from 'three';
import { WALK_SPEED, HURRY_SPEED } from '../player/movement.js';

export class SandResponse {
    // world: World (heightAt, footprints, sandSpray); particles: Particles; low: low quality
    constructor(world, particles, { low = false } = {}) {
        this.world = world;
        this.particles = particles;
        this.low = low;
        this.grainScale = low ? 0.6 : 1;
    }

    grains(count) {
        return Math.max(1, Math.round(count * this.grainScale));
    }

    // step: the player's step event { surface, x, z, heading, intensity, downhill, speed, foot }
    step(step) {
        if (step.surface !== 'sand') return 0;
        const { world } = this;
        world.footprints.add(step);

        const ground = world.heightAt(step.x, step.z);
        const backX = -Math.sin(step.heading), backZ = -Math.cos(step.heading);
        const hurry = THREE.MathUtils.clamp(((step.speed ?? 0) - WALK_SPEED) / (HURRY_SPEED - WALK_SPEED), 0, 1);
        world.sandSpray.emit(step.x, ground, step.z, backX * 0.6, backZ * 0.6,
            this.grains(5 + Math.floor(step.intensity * 6) + 5 * hurry), (0.9 + step.downhill) * (1 + 0.35 * hurry));
        if (hurry > 0.5) {
            this.particles.emit('puff', step.x + backX * 0.15, ground, step.z + backZ * 0.15, backX, backZ, 1, 0.6 + 0.4 * hurry);
        }
        return 0.4 * step.intensity + 0.6 * hurry;
    }

    // strength: 0..1 how hard the landing was; (x, z): where
    land(strength, x, z) {
        const ground = this.world.heightAt(x, z);
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            this.world.sandSpray.emit(x, ground, z, Math.cos(angle), Math.sin(angle), this.grains(4), 1 + strength * 1.5, 0.3);
        }
        const puffs = 3 + Math.round(3 * strength);
        for (let i = 0; i < puffs; i++) {
            const angle = (i / puffs) * Math.PI * 2 + Math.random() * 0.5;
            const dx = Math.cos(angle), dz = Math.sin(angle);
            this.particles.emit('puff', x + dx * 0.2, ground, z + dz * 0.2, dx, dz, 1, 0.5 + strength * 0.6);
        }
        return Math.min(1, 0.3 + strength);
    }

    // Every frame: while the sand carries the player down a dune (slide: velocity over the ground)
    slide(delta, x, z, slide) {
        const speed = slide.length();
        if (speed <= 0.8) return;
        const dx = slide.x / speed, dz = slide.y / speed;
        const ground = this.world.heightAt(x, z);
        if (Math.random() < delta * 30) {
            this.world.sandSpray.emit(x + dx * 0.3, ground, z + dz * 0.3, dx * 0.5, dz * 0.5,
                this.grains(3), 0.6 + speed * 0.3, 0.9);
        }
        if (Math.random() < delta * Math.min(4, speed)) {
            this.particles.emit('puff', x + dx * 0.4, ground, z + dz * 0.4, dx, dz, 1, 0.5 + speed * 0.15);
        }
    }

    // Sand pushed by something moving in it at (x, z), along (dx, dz); strength 0..1;
    // radius: how far from (x, z) the sand around it lies
    disturb(x, z, strength, dx = 0, dz = 0, radius = 0.4) {
        if (strength <= 0) return 0;
        const ground = this.world.heightAt(x, z);
        const around = 6;
        for (let i = 0; i < around; i++) {
            const angle = (i / around) * Math.PI * 2;
            const ox = Math.cos(angle), oz = Math.sin(angle);
            // More where it was pushed toward
            const toward = Math.max(0, ox * dx + oz * dz);
            this.world.sandSpray.emit(x + ox * radius, ground, z + oz * radius, ox, oz,
                this.grains(1 + Math.round(3 * strength * (0.5 + toward))), 0.4 + 0.3 * strength, 0.3);
        }
        this.particles.emit('puff', x + dx * radius, ground, z + dz * radius, dx, dz, 1 + Math.round(strength), 0.5);
        return Math.min(1, strength);
    }
}
