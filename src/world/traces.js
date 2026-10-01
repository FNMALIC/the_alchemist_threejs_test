// traces.js - Someone else made this walk before you. You never meet them; you only find
// what they left: a trail of old, half-erased footprints that wanders out to the light and
// turns back home, a cold campfire, a dry well, a water jar, and a small stack of stones
// under the old tree.
import * as THREE from 'three';
import { Footprints } from './footprints.js';
import { createRock } from './props.js';

const STEP_LENGTH = 0.85;

// Their way out: from the old tree, curving west of the straight line, past the campfire,
// the well and the jar, to where the light is
const OUTWARD = [
    [-1.6, 4], [-3, -8], [-12, -22], [-18, -36], [-22, -50], [-27, -68], [-28, -84],
    [-22, -100], [-10, -117], [3, -132], [17, -144], [23.5, -148.5]
];
// Their way home: east of the straight line, back to the tree
const HOMEWARD = [
    [24.5, -148], [30, -128], [35, -100], [33, -70], [26, -42], [16, -20], [6, -6], [-0.8, 3.6]
];

const charredWood = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 });
const ash = new THREE.MeshStandardMaterial({ color: 0x45403a, roughness: 1 });
const clay = new THREE.MeshStandardMaterial({ color: 0x9a5a36, roughness: 0.85 });
const darkness = new THREE.MeshBasicMaterial({ color: 0x050403 });

export class Traces {
    // world: the World (for heightAt, surface heights and adding objects); oldTree: { x, z }
    constructor(world, oldTree, lightPosition) {
        this.world = world;
        this.heightAt = world.heightAt;
        // Old prints sit on whichever is higher: the true dune shape or the coarse mesh
        const groundAt = (x, z) => Math.max(this.heightAt(x, z), world.terrain.surfaceHeightAt(x, z));

        this.trail = new Footprints(groundAt, null, { ageing: false, strength: 0.75, name: 'traveller' });
        world.scene.add(this.trail.mesh);
        this.outward = this.layTrail(OUTWARD, 0.3);
        // Where the light was, their turn for home is clear; further on the wind has taken more
        this.homeward = this.layTrail(HOMEWARD, 0.4, 25);

        // Where the things they left are, and what you think when you find them
        const campfire = this.campfire(-16.5, -37.5);
        const well = this.well(-31, -83);
        const jar = this.jar(-8.4, -119);

        // Under the old tree: a seat facing the desert, and their small stack of stones beside it
        const toLight = new THREE.Vector2(lightPosition.x - oldTree.x, lightPosition.z - oldTree.z).normalize();
        this.seat = { x: oldTree.x + toLight.x * 1.1, z: oldTree.z + toLight.y * 1.1 };
        this.lookFromSeat = { x: lightPosition.x, z: lightPosition.z };
        this.cairn = this.stackOfStones(this.seat.x + toLight.y * 0.9, this.seat.z - toLight.x * 0.9);

        this.moments = [
            { ...campfire, radius: 3.5, text: 'Ashes. Someone rested here.' },
            { ...well, radius: 4, text: 'A well. Dry for a long time.' },
            { ...jar, radius: 3, text: 'A water jar, left behind.' }
        ];
    }

    // Footprints along a smooth path through the given points; some are lost to the wind,
    // except along the first `keepFirst` metres
    layTrail(points, lostToWind, keepFirst = 0) {
        const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
        const length = curve.getLength();
        const steps = Math.floor(length / STEP_LENGTH);
        const samples = [];
        let foot = 1;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const point = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t);
            samples.push({ x: point.x, z: point.z });
            foot = -foot;
            if (i * STEP_LENGTH > keepFirst && Math.random() < lostToWind) continue;
            this.trail.add({ x: point.x, z: point.z, heading: Math.atan2(tangent.x, tangent.z), foot, lift: 0.03 });
        }
        return samples;
    }

    // Distance from (x, z) to the nearest point of a trail
    distanceToTrail(trail, x, z) {
        let best = Infinity;
        for (const point of trail) best = Math.min(best, Math.hypot(point.x - x, point.z - z));
        return best;
    }

    ground(x, z) {
        return this.heightAt(x, z);
    }

    // A ring of stones, a few charred sticks and a bed of ash
    campfire(x, z) {
        const y = this.ground(x, z);
        for (let i = 0; i < 9; i++) {
            const angle = (i / 9) * Math.PI * 2 + Math.random() * 0.2;
            this.world.add(createRock(x + Math.cos(angle) * 0.55, z + Math.sin(angle) * 0.55, 0.1 + Math.random() * 0.05, this.heightAt, 0x6a5e52));
        }
        const bed = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2), ash);
        bed.position.set(x, y + 0.02, z);
        bed.receiveShadow = true;
        this.world.add(bed);
        for (let i = 0; i < 3; i++) {
            const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.6, 6), charredWood);
            stick.rotation.set(Math.PI / 2 - 0.15, (i / 3) * Math.PI + Math.random() * 0.3, 0);
            stick.position.set(x + (Math.random() - 0.5) * 0.1, y + 0.06, z + (Math.random() - 0.5) * 0.1);
            stick.castShadow = true;
            this.world.add(stick);
        }
        return { x, z };
    }

    // A low ring of stacked stones around a dark, empty shaft
    well(x, z) {
        const y = this.ground(x, z);
        for (let layer = 0; layer < 3; layer++) {
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2 + layer * 0.26;
                const rock = createRock(x + Math.cos(angle) * 0.95, z + Math.sin(angle) * 0.95, 0.22, this.heightAt, 0x8a7a68);
                rock.position.y = y + 0.1 + layer * 0.17;
                rock.userData.collider = null;
                this.world.add(rock);
            }
        }
        const shaft = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24).rotateX(-Math.PI / 2), darkness);
        shaft.position.set(x, y + 0.35, z);
        this.world.add(shaft);
        this.world.colliders.push({ x, z, radius: 1.15 });
        return { x, z };
    }

    // A clay jar lying on its side, half covered by sand
    jar(x, z) {
        const profile = [
            [0, 0], [0.09, 0.01], [0.16, 0.08], [0.19, 0.2], [0.17, 0.32], [0.1, 0.4], [0.07, 0.45], [0.09, 0.48], [0.075, 0.5]
        ].map(([r, h]) => new THREE.Vector2(r, h));
        const jar = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), clay);
        jar.material.side = THREE.DoubleSide;
        jar.rotation.set(Math.PI / 2 - 0.25, 0, 0.6);
        jar.position.set(x, this.ground(x, z) + 0.06, z);
        jar.castShadow = true;
        this.world.add(jar);
        return { x, z };
    }

    // Flat stones balanced one on another: travellers leave these to say "I was here"
    stackOfStones(x, z) {
        let y = this.ground(x, z);
        const sizes = [0.22, 0.18, 0.15, 0.12, 0.09];
        sizes.forEach((size, i) => {
            const stone = createRock(x + (Math.random() - 0.5) * 0.03, z + (Math.random() - 0.5) * 0.03, size, this.heightAt, 0x9a8a76);
            stone.scale.set(1, 0.45, 1);
            stone.position.y = y + size * 0.3;
            stone.userData.collider = null;
            y += size * 0.55;
            this.world.add(stone);
            if (i === 0) this.world.colliders.push({ x, z, radius: 0.3 });
        });
        return { x, z };
    }
}
