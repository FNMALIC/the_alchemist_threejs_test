// traces.js - Someone made this walk before you. You never meet them; you only find what they
// left: a trail of old, half-erased footprints that wanders out to the light and turns back
// home, a cold campfire, a dry well, a water jar, and a small stack of stones under the old tree.
// At each place, a scrap of a letter weighted with a stone, and a cloth on a stick that the
// wind moves, so the eye finds it from afar. The letters are written to someone they left
// behind, asleep under the old tree: you.
//
// The desert also remembers you (see memory.js): your last walk is still faintly in the sand,
// and each time you have sat under the tree, a pebble lies beside their stones.
import * as THREE from 'three';
import { Footprints } from './footprints.js';
import { createRock } from './props.js';

const STEP_LENGTH = 0.85;

// Their way out: from the old tree, a little west of the straight line, past the campfire,
// the well and the jar, to where the light is
const OUTWARD = [
    [-1.6, 4], [-1.5, -10], [-1, -24], [-1.5, -33], [2, -50], [6, -70], [8, -88], [9, -100],
    [12, -112], [14.5, -124], [20, -138], [23.5, -148.5]
];

// Where they stopped, and what they wrote there
const LETTERS = {
    campfire: 'First night. I can still see the palms if I turn around. I don\'t turn around.',
    well: 'The wind took the stars tonight. I walked toward the light because it was the only thing I could see.',
    jar: 'I left the jar here. The light never comes closer, but the sky is changing. Maybe that is enough.',
    turn: 'There was nothing here. Only the morning. I am going home.',
    home: 'I came back. You were asleep under the tree. I didn\'t wake you.'
};
// Their way home: east of the straight line, back to the tree
const HOMEWARD = [
    [24.5, -148], [30, -128], [35, -100], [33, -70], [26, -42], [16, -20], [6, -6], [-0.8, 3.6]
];

const charredWood = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 });
const ash = new THREE.MeshStandardMaterial({ color: 0x45403a, roughness: 1 });
const clay = new THREE.MeshStandardMaterial({ color: 0x9a5a36, roughness: 0.85 });
const darkness = new THREE.MeshBasicMaterial({ color: 0x050403 });
const paper = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, side: THREE.DoubleSide });
const pole = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
const cloth = new THREE.MeshStandardMaterial({ color: 0x8a3b2c, roughness: 0.95, side: THREE.DoubleSide });

export class Traces {
    // world: the World (for heightAt, surface heights and adding objects); oldTree: { x, z }
    // memory: { journeys, path } from memory.js
    constructor(world, oldTree, lightPosition, memory = { journeys: 0, path: [] }) {
        this.world = world;
        this.heightAt = world.heightAt;
        this.flags = [];
        // Old prints sit on whichever is higher: the true dune shape or the coarse mesh
        const groundAt = (x, z) => Math.max(this.heightAt(x, z), world.terrain.surfaceHeightAt(x, z));

        this.trail = new Footprints(groundAt, null, { ageing: false, strength: 0.75, name: 'traveller' });
        world.scene.add(this.trail.mesh);
        this.outward = this.layTrail(OUTWARD, 0.3);
        // Where the light was, their turn for home is clear; further on the wind has taken more
        this.homeward = this.layTrail(HOMEWARD, 0.4, 25);

        // The places they stopped, each with a letter and a cloth that the wind moves
        const campfire = this.campfire(1.5, -32);
        const well = this.well(11.5, -100);
        const jar = this.jar(16.5, -124.5);
        const turn = { x: 23.2, z: -146.6 }; // Where the light was, and their trail turns
        this.note(campfire.x - 0.9, campfire.z + 0.6, 0.4);
        this.note(well.x - 1.4, well.z + 0.4, -0.3);
        this.note(jar.x + 0.5, jar.z + 0.5, 1.1);
        this.note(turn.x, turn.z, 2.2);
        this.flag(campfire.x + 0.9, campfire.z - 0.4);
        this.flag(well.x + 1.5, well.z - 0.6);
        this.flag(jar.x - 0.7, jar.z - 0.6);

        // Under the old tree: a seat facing the desert, and their small stack of stones beside it
        const toLight = new THREE.Vector2(lightPosition.x - oldTree.x, lightPosition.z - oldTree.z).normalize();
        this.seat = { x: oldTree.x + toLight.x * 1.1, z: oldTree.z + toLight.y * 1.1 };
        this.lookFromSeat = { x: lightPosition.x, z: lightPosition.z };
        this.cairn = this.stackOfStones(this.seat.x + toLight.y * 0.9, this.seat.z - toLight.x * 0.9, memory.journeys);
        this.note(this.cairn.x + 0.35, this.cairn.z + 0.3, 0.8);

        // Your own last walk, still faintly in the sand
        this.pastPath = this.layPastWalk(memory.path, groundAt);

        // Letters are read when you come close; the last two only make sense in the morning
        const letter = (place, key, radius = 3.5, when) => ({ ...place, radius, text: LETTERS[key], style: 'letter', duration: 10, when });
        this.moments = [
            letter(campfire, 'campfire'),
            letter(well, 'well', 4),
            letter(jar, 'jar'),
            letter(turn, 'turn', 7, stage => stage === 'morning'),
            letter(this.cairn, 'home', 4, stage => stage === 'morning')
        ];
    }

    // Faint prints along the path you walked last time
    layPastWalk(points, groundAt) {
        if (points.length < 10) return [];
        this.pastTrail = new Footprints(groundAt, null, { ageing: false, strength: 0.5, name: 'past' });
        this.world.scene.add(this.pastTrail.mesh);
        let foot = 1;
        const path = points.map(([x, z]) => ({ x, z }));
        for (let i = 1; i < path.length; i++) {
            const a = path[i - 1], b = path[i];
            const length = Math.hypot(b.x - a.x, b.z - a.z);
            const heading = Math.atan2(b.x - a.x, b.z - a.z);
            for (let d = 0; d < length; d += STEP_LENGTH) {
                foot = -foot;
                if (Math.random() < 0.45) continue; // Mostly taken by the wind
                const t = d / length;
                this.pastTrail.add({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading, foot, lift: 0.03 });
            }
        }
        return path;
    }

    // Animate the cloths in the wind. gust: 0 still .. 1+ windy
    update(elapsed, gust = 1) {
        for (const { mesh, rest } of this.flags) {
            const positions = mesh.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const x = rest[i * 3], y = rest[i * 3 + 1];
                const along = x / 0.45; // 0 at the pole, 1 at the free end
                const wave = Math.sin(elapsed * 5 - x * 9 + y * 2) * 0.07 * along * (0.5 + gust);
                positions.setXYZ(i, x, y - along * along * 0.04 * (1.5 - Math.min(1, gust)), rest[i * 3 + 2] + wave);
            }
            positions.needsUpdate = true;
            mesh.geometry.computeVertexNormals();
        }
    }

    // A scrap of paper, folded once, held down by a small stone
    note(x, z, turn) {
        const y = this.ground(x, z);
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22, 2, 1).rotateX(-Math.PI / 2), paper);
        const positions = sheet.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) positions.setY(i, Math.abs(positions.getX(i)) < 0.01 ? 0.012 : 0);
        sheet.geometry.computeVertexNormals();
        sheet.position.set(x, y + 0.02, z);
        sheet.rotation.y = turn;
        sheet.receiveShadow = true;
        this.world.add(sheet);
        const stone = createRock(x + 0.04, z - 0.05, 0.05, this.heightAt, 0x7a6a5a);
        stone.position.y = y + 0.04;
        this.world.add(stone);
    }

    // A walking stick pushed into the sand with a strip of cloth tied to it
    flag(x, z) {
        const y = this.ground(x, z);
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 1.7, 6), pole);
        stick.position.set(x, y + 0.75, z);
        stick.rotation.z = 0.06;
        stick.castShadow = true;
        this.world.add(stick);

        const geometry = new THREE.PlaneGeometry(0.45, 0.22, 10, 3).translate(0.225, 0, 0);
        const strip = new THREE.Mesh(geometry, cloth);
        strip.position.set(x + 0.03, y + 1.45, z);
        strip.rotation.y = -0.5;
        strip.castShadow = true;
        this.world.add(strip);
        this.flags.push({ mesh: strip, rest: Float32Array.from(geometry.attributes.position.array) });
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

    // Flat stones balanced one on another: travellers leave these to say "I was here".
    // Beside them, a pebble for each time you have sat here before.
    stackOfStones(x, z, journeys = 0) {
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
        for (let i = 0; i < Math.min(journeys, 24); i++) {
            const angle = i * 2.4; // Spiral outward, one pebble per visit
            const radius = 0.36 + i * 0.03;
            const pebble = createRock(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius, 0.075, this.heightAt, 0xd2c4ad);
            pebble.scale.set(1, 0.55, 1);
            this.world.add(pebble);
        }
        return { x, z };
    }
}
