// traces.js - Someone made this walk before you. You never meet them; you only find what they
// left: a trail of old, half-erased footprints that wanders out to the light and turns back
// home, a cold campfire, a dry well, a water jar, and a small stack of stones under the old tree.
// At each place, a scrap of a letter weighted with a stone. The letters are written to someone
// they left behind, asleep under the old tree: you.
//
// Their steps tell how they felt: short and dragging where they were tired, long strides down the
// dunes, a scuffle where they sat by the fire. Off their path: the hollow where they lay to look
// at the stars (their feet toward a constellation that really is high that night), a tree drawn
// in the sand and half erased, a white stone they carried from home and set down at the well.
// And at the light itself, a shallow hole they dug, with nothing in it: the treasure was never
// there. Their trail is faint at night; the low sun at dawn brings it out.
//
// The desert also remembers you (see memory.js): your last walk is still faintly in the sand,
// and each time you have sat under the tree, a pebble lies beside their stones.
import * as THREE from 'three';
import { Horizon } from 'astronomy-engine';
import { Footprints } from './footprints.js';
import { createRock } from './props.js';
import { OBSERVER, equatorialVector } from './astronomy.js';
import constellationData from '../data/constellations.json';

const STEP_LENGTH = 0.85;
const TIRED = { from: -98, to: -126 }; // Between the well and the jar (z): the light never came closer

// Constellations someone lying in the sand might watch, best known first
const STARGAZING = ['Ori', 'UMa', 'Cyg', 'Leo', 'Sco', 'Gem', 'Cas', 'Tau', 'Lyr', 'Boo', 'Peg', 'Aql', 'Per', 'Aur', 'Sgr'];

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

export class Traces {
    // world: the World (for heightAt, surface heights and adding objects); oldTree: { x, z }
    // memory: { journeys, path } from memory.js
    constructor(world, oldTree, lightPosition, memory = { journeys: 0, path: [] }) {
        this.world = world;
        this.heightAt = world.heightAt;
        // Old prints sit on whichever is higher: the true dune shape or the coarse mesh
        const groundAt = (x, z) => Math.max(this.heightAt(x, z), world.terrain.surfaceHeightAt(x, z));
        this.groundAt = groundAt;

        this.trail = new Footprints(groundAt, null, { ageing: false, strength: 0.75, name: 'traveller' });
        world.scene.add(this.trail.mesh);
        this.outward = this.layTrail(OUTWARD, 0.3, 0, true);
        // Where the light was, their turn for home is clear; further on the wind has taken more
        this.homeward = this.layTrail(HOMEWARD, 0.4, 25);

        // The places they stopped, each with a letter
        const campfire = this.campfire(1.5, -32);
        const well = this.well(11.5, -100);
        const jar = this.jar(16.5, -124.5);
        const turn = { x: 23.2, z: -146.6 }; // Where the light was, and their trail turns
        this.note(campfire.x - 0.9, campfire.z + 0.6, 0.4);
        this.note(well.x - 1.4, well.z + 0.4, -0.3);
        this.note(jar.x + 0.5, jar.z + 0.5, 1.1);
        this.note(turn.x, turn.z, 2.2);

        // What else they left
        this.scuffle(campfire.x + 0.2, campfire.z + 1.0); // Where they sat by the fire
        const stargazing = this.stargazingHollow(8.5, -68, world.sky);
        this.drawing(jar.x - 2.2, jar.z + 1.4, 0.5);
        this.whiteStone(well.x + 1.35, well.z + 0.5);
        this.dig(lightPosition.x + 0.4, lightPosition.z - 0.5);
        this.places = { campfire, well, jar, turn, stargazing };
        // Everything of theirs worth slowing down for
        this.landmarks = [
            campfire, well, jar, turn, stargazing,
            { x: jar.x - 2.2, z: jar.z + 1.4 }, // The drawing
            { x: well.x + 1.35, z: well.z + 0.5 }, // The white stone
            { x: lightPosition.x + 0.4, z: lightPosition.z - 0.5 } // The hole
        ];

        // Under the old tree: a seat facing the desert, and their small stack of stones beside it
        const toLight = new THREE.Vector2(lightPosition.x - oldTree.x, lightPosition.z - oldTree.z).normalize();
        this.seat = { x: oldTree.x + toLight.x * 1.1, z: oldTree.z + toLight.y * 1.1 };
        this.lookFromSeat = { x: lightPosition.x, z: lightPosition.z };
        this.cairn = this.stackOfStones(this.seat.x + toLight.y * 0.9, this.seat.z - toLight.x * 0.9, memory.journeys);
        this.landmarks.push(this.cairn);
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

    // Footprints along a smooth path through the given points; some are lost to the wind,
    // except along the first `keepFirst` metres. The steps follow the ground and the mood: long
    // strides down a dune, short ones up it, and (outward, between the well and the jar) the
    // short, dragging steps of someone tired.
    layTrail(points, lostToWind, keepFirst = 0, outward = false) {
        const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
        const length = curve.getLength();
        const samples = [];
        let foot = 1;
        for (let travelled = 0; travelled <= length;) {
            const t = travelled / length;
            const point = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t);
            samples.push({ x: point.x, z: point.z });
            foot = -foot;

            // Slope along the way: positive uphill
            const slope = (this.heightAt(point.x + tangent.x * 0.6, point.z + tangent.z * 0.6) -
                this.heightAt(point.x - tangent.x * 0.6, point.z - tangent.z * 0.6)) / 1.2;
            let stride = STEP_LENGTH;
            if (slope < -0.06) stride = THREE.MathUtils.lerp(STEP_LENGTH, 1.2, Math.min(1, (-slope - 0.06) / 0.25));
            else if (slope > 0.06) stride = THREE.MathUtils.lerp(STEP_LENGTH, 0.58, Math.min(1, (slope - 0.06) / 0.25));
            const tired = outward && point.z < TIRED.from && point.z > TIRED.to;
            if (tired) stride = Math.min(stride, 0.6 + Math.random() * 0.06);

            if (travelled <= keepFirst || Math.random() >= lostToWind) {
                const heading = Math.atan2(tangent.x, tangent.z);
                // Tired feet land closer together and drag their toes
                this.trail.add({
                    x: point.x, z: point.z, heading, foot, lift: 0.03,
                    spacing: tired ? 0.07 : undefined, length: tired && Math.random() < 0.5 ? 1.35 : 1
                });
            }
            travelled += stride;
        }
        return samples;
    }

    // Where they sat by the fire: prints every which way, as someone shifts, kneels, gets up
    scuffle(x, z) {
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 0.9;
            this.trail.add({
                x: x + Math.cos(angle) * r, z: z + Math.sin(angle) * r,
                heading: Math.random() * Math.PI * 2, foot: Math.random() < 0.5 ? 1 : -1, lift: 0.03
            });
        }
        this.sandMark(createSittingTexture(), x, z, 0.7, 0.55, Math.random() * Math.PI);
    }

    // A body-shaped hollow, feet toward a constellation that is high in the sky that night
    stargazingHollow(x, z, sky) {
        const clock = sky.clock;
        const date = new Date(clock.start + (clock.end - clock.start) * 0.15); // When you pass by
        let watched = null;
        for (const id of STARGAZING) {
            const figure = constellationData.constellations.find(c => c.id === id);
            if (!figure) continue;
            // Its middle: the average of its stars' directions
            const middle = new THREE.Vector3();
            figure.lines.forEach(line => {
                for (let i = 0; i < line.length; i += 2) middle.add(equatorialVector(line[i], line[i + 1]));
            });
            middle.normalize();
            const ra = ((Math.atan2(middle.y, middle.x) * 12) / Math.PI + 24) % 24;
            const dec = (Math.asin(middle.z) * 180) / Math.PI;
            const { azimuth, altitude } = Horizon(date, OBSERVER, ra, dec);
            if (altitude > 25 && altitude < 75) {
                watched = { id, name: figure.name, azimuth, altitude };
                break;
            }
        }
        // Feet toward it, so lying here you would look straight at it
        const toward = watched ? sky.frame.direction(watched.azimuth, 0) : new THREE.Vector3(0, 0, -1);
        this.sandMark(createBodyTexture(), x, z, 0.75, 1.9, Math.atan2(toward.x, toward.z));
        return { x, z, constellation: watched };
    }

    // A tree drawn with a finger in the sand, half taken by the wind
    drawing(x, z, turn) {
        this.sandMark(createDrawingTexture(), x, z, 1.3, 1.3, turn);
    }

    // A smooth white stone, nothing like the desert's: carried from somewhere else and set down
    whiteStone(x, z) {
        const stone = new THREE.Mesh(
            new THREE.SphereGeometry(0.075, 20, 14).scale(1.25, 0.62, 0.95),
            new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.32 })
        );
        stone.position.set(x, this.ground(x, z) + 0.025, z);
        stone.rotation.y = 0.7;
        stone.castShadow = true;
        stone.receiveShadow = true;
        this.world.add(stone);
    }

    // Under the light: a shallow hole dug in the sand, a heap of what came out, the stick that
    // dug it. Nothing in it.
    dig(x, z) {
        const y = this.ground(x, z);
        this.sandMark(createHoleTexture(), x, z, 0.8, 0.7, 0.3); // Its shadow, seen from further away
        // In the sand itself (the detailed sand around the player), the hole and its heap
        this.world.sandPatch.addPit(x, z, 0.36, 0.07, 0.4);
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.95, 6), charredWood.clone());
        stick.material.color.setHex(0x6b5640);
        stick.rotation.set(Math.PI / 2 - 0.08, 0, 1.1);
        stick.position.set(x - 0.15, y + 0.035, z + 0.55);
        stick.castShadow = true;
        this.world.add(stick);
    }

    // A darkening mark lying on the sand (white leaves it unchanged), following the dunes
    sandMark(texture, x, z, width, length, turn) {
        const geometry = new THREE.PlaneGeometry(width, length, 8, 16).rotateX(-Math.PI / 2).rotateY(turn);
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const px = x + positions.getX(i), pz = z + positions.getZ(i);
            positions.setXYZ(i, px, this.groundAt(px, pz) + 0.025, pz);
        }
        const mark = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            map: texture,
            blending: THREE.MultiplyBlending,
            premultipliedAlpha: true,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            fog: false
        }));
        mark.renderOrder = 1;
        this.world.scene.add(mark);
        return mark;
    }

    // Their trail is faint at night and comes out at dawn, when the low sun rakes across it
    update(sunAltitude) {
        const smoothstep = THREE.MathUtils.smoothstep;
        const raking = smoothstep(sunAltitude, -10, -2) * (1 - smoothstep(sunAltitude, 8, 16));
        const strength = 0.4 + 0.55 * raking + 0.22 * smoothstep(sunAltitude, 8, 16);
        this.trail.strength.value = strength;
        if (this.pastTrail) this.pastTrail.strength.value = strength * 0.65;
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

// Canvas textures for marks in the sand: white is untouched sand, darker is a hollow or a line

function sandCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    return { canvas, context };
}

// A soft dark blob: darkest in the middle, gone at the edge
function blob(context, x, y, rx, ry, darkness) {
    context.save();
    context.translate(x, y);
    context.scale(1, ry / rx);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, rx);
    const shade = Math.round(255 * (1 - darkness));
    gradient.addColorStop(0, `rgba(${shade}, ${shade - 8}, ${shade - 20}, 1)`);
    gradient.addColorStop(0.6, `rgba(${shade}, ${shade - 8}, ${shade - 20}, 0.6)`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, rx, 0, Math.PI * 2);
    context.fill();
    context.restore();
}

function toTexture(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// Blur a canvas by drawing it small and back up again (works in every browser)
function soften(canvas, factor) {
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(canvas.width / factor));
    small.height = Math.max(1, Math.round(canvas.height / factor));
    const smallContext = small.getContext('2d');
    smallContext.imageSmoothingQuality = 'high';
    smallContext.drawImage(canvas, 0, 0, small.width, small.height);
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(small, 0, 0, canvas.width, canvas.height);
}

// Someone lay here on their back: one soft hollow in the shape of a body, head at the top,
// arms a little out, deepest under the head, the shoulders and the heels
function createBodyTexture() {
    const { canvas, context } = sandCanvas(96, 256);
    context.fillStyle = 'rgb(222, 212, 196)';
    const shape = (draw) => { context.beginPath(); draw(); context.fill(); };
    shape(() => context.ellipse(48, 24, 15, 17, 0, 0, Math.PI * 2)); // Head
    shape(() => context.ellipse(48, 82, 24, 44, 0, 0, Math.PI * 2)); // Back and hips
    shape(() => context.ellipse(19, 88, 7, 38, 0.12, 0, Math.PI * 2)); // Arms
    shape(() => context.ellipse(77, 88, 7, 38, -0.12, 0, Math.PI * 2));
    shape(() => context.ellipse(38, 180, 10, 58, 0.04, 0, Math.PI * 2)); // Legs
    shape(() => context.ellipse(58, 180, 10, 58, -0.04, 0, Math.PI * 2));
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = 'rgb(236, 228, 216)';
    shape(() => context.ellipse(48, 22, 9, 10, 0, 0, Math.PI * 2)); // Pressed deeper
    shape(() => context.ellipse(48, 62, 18, 16, 0, 0, Math.PI * 2));
    shape(() => context.ellipse(37, 232, 7, 8, 0, 0, Math.PI * 2));
    shape(() => context.ellipse(59, 232, 7, 8, 0, 0, Math.PI * 2));
    soften(canvas, 8);
    return toTexture(canvas);
}

// Where someone sat: a rounded hollow, deeper at the back
function createSittingTexture() {
    const { canvas, context } = sandCanvas(96, 96);
    context.globalCompositeOperation = 'multiply';
    blob(context, 48, 52, 34, 28, 0.16);
    blob(context, 48, 60, 18, 14, 0.12);
    return toTexture(canvas);
}

// A tree drawn with a finger: a trunk, a few branches, a round crown; a line of ground; and a
// small circle above it. Then the wind takes parts of it.
function createDrawingTexture() {
    const size = 256;
    const { canvas, context } = sandCanvas(size, size);
    context.strokeStyle = 'rgb(200, 188, 170)'; // A groove: a shade darker than the sand around it
    context.lineWidth = 6;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const wobbly = (points) => {
        context.beginPath();
        points.forEach(([x, y], i) => {
            const jx = x + (Math.random() - 0.5) * 3, jy = y + (Math.random() - 0.5) * 3;
            if (i === 0) context.moveTo(jx, jy); else context.lineTo(jx, jy);
        });
        context.stroke();
    };
    wobbly([[40, 214], [90, 210], [140, 213], [216, 209]]); // The ground
    wobbly([[124, 212], [126, 170], [122, 140], [128, 112]]); // The trunk
    wobbly([[126, 150], [100, 124], [86, 104]]); // Branches
    wobbly([[125, 138], [152, 116], [168, 98]]);
    wobbly([[127, 118], [118, 96]]);
    context.beginPath(); // The crown
    context.ellipse(126, 92, 52, 34, 0, 0, Math.PI * 2);
    context.stroke();
    context.beginPath(); // Something small in the sky: the light, or the moon
    context.arc(206, 46, 10, 0, Math.PI * 2);
    context.stroke();

    soften(canvas, 2.5);

    // The wind fills it in: softly, more on the side it comes from (left)
    for (let i = 0; i < 70; i++) {
        const x = Math.pow(Math.random(), 1.6) * size;
        const y = Math.random() * size;
        const r = 6 + Math.random() * 22;
        const gradient = context.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, r, 0, Math.PI * 2);
        context.fill();
    }
    return toTexture(canvas);
}

// A shallow hole: dark at the bottom, its far wall in shadow
function createHoleTexture() {
    const { canvas, context } = sandCanvas(128, 112);
    context.globalCompositeOperation = 'multiply';
    blob(context, 64, 56, 54, 46, 0.2);
    blob(context, 64, 50, 34, 26, 0.3);
    blob(context, 64, 44, 18, 13, 0.25);
    return toTexture(canvas);
}
