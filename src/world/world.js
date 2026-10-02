// world.js - The desert before dawn: terrain, the real sky, the oasis, scattered rocks and shrubs, drifting sand
import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { Sky } from './sky.js';
import { Dust } from './dust.js';
import { Footprints } from './footprints.js';
import { SandSpray } from './sandSpray.js';
import { SandPatch } from './sandPatch.js';
import { DesertChunks, CHUNK_SIZE, KNOWN_CHUNKS } from './desertChunks.js';
import { Wind } from './wind.js';
import { SandWisps } from './sandWisps.js';
import { FarAway, farPlaces, pyramidHeightAt, PYRAMID } from './farAway.js';
import {
    createOldTree, createPalm, createShrub, createRock, createGrassPatch, createFlower, swayGrass
} from './props.js';

// Night mist is thick at the start and lifts as dawn comes
const FOG_DENSITY_START = 0.012;
const FOG_DENSITY_END = 0.006;

// A sandstorm thickens the air to this fog density
const STORM_FOG_DENSITY = 0.085;
const STORM_SAND = new THREE.Color(0x7d6548);

// Height of the pool's surface; ground below it is under water
export const WATER_LEVEL = -0.15;

// The sand's temperature by sun altitude (degrees): cool and blue at night, gold as the sun comes
// up, warm and plain by mid-morning
const SAND_TINTS = [
    { altitude: -14, tint: new THREE.Color(0.86, 0.92, 1.1) },
    { altitude: -7, tint: new THREE.Color(0.94, 0.95, 1.03) },
    { altitude: -1, tint: new THREE.Color(1.1, 0.99, 0.86) },
    { altitude: 4, tint: new THREE.Color(1.12, 1.0, 0.84) },
    { altitude: 12, tint: new THREE.Color(1.04, 1.0, 0.95) }
];

function sandTintAt(altitude, target) {
    if (altitude <= SAND_TINTS[0].altitude) return target.copy(SAND_TINTS[0].tint);
    for (let i = 1; i < SAND_TINTS.length; i++) {
        const a = SAND_TINTS[i - 1], b = SAND_TINTS[i];
        if (altitude <= b.altitude) return target.copy(a.tint).lerp(b.tint, (altitude - a.altitude) / (b.altitude - a.altitude));
    }
    return target.copy(SAND_TINTS[SAND_TINTS.length - 1].tint);
}

export class World {
    // oasis: { x, z, poolX, poolZ }, orb: { x, z }
    // skyOptions: { sceneBearing, date } passed to the Sky (see sky.js)
    // shadows: whether the moon and sun cast shadows
    // playerStart: { x, z } where the detailed sand patch starts
    constructor(scene, { oasis, orb, skyOptions, shadows = true, playerStart = { x: 0, z: 0 } }) {
        this.scene = scene;
        this.oasis = oasis;
        this.orb = orb;
        this.grassPatches = [];
        this.palms = [];
        this.colliders = []; // { x, z, radius } circles the player can't walk into
        this.storm = 0; // 0 calm .. 1 sandstorm (set from main.js)
        this.solids = []; // The objects those belong to (trunks, the old tree, rocks): they block the view
        this.vegetation = []; // { object, kind: 'shrub' | 'flower' } plants that can respond to the player

        // Far out, the wrong way from the light: a compass in the sand, and a pyramid on a plain
        this.far = farPlaces(oasis, orb);
        const pyramid = this.far.pyramid;
        this.terrain = new Terrain({
            oasis, orb, plains: [{ x: pyramid.x, z: pyramid.z, flat: PYRAMID.half + 25, edge: PYRAMID.half + 160 }]
        });
        // Where the endless desert puts no rocks or shrubs
        this.reserved = [{ x: pyramid.x, z: pyramid.z, radius: PYRAMID.half * 1.45 }, { ...this.far.compass, radius: 4 }];
        this.heightAt = (x, z) => this.terrain.heightAt(x, z);
        scene.add(this.terrain.mesh);

        this.sky = new Sky(skyOptions);
        scene.add(this.sky.group);

        // Fog and background take the sky's horizon colour, so distant dunes melt into it
        scene.fog = new THREE.FogExp2(this.sky.horizonColor, FOG_DENSITY_START);
        scene.background = this.sky.horizonColor;

        this.lights = this.sky.lights;
        Object.values(this.lights).forEach(light => {
            scene.add(light);
            if (light.target) scene.add(light.target);
        });
        if (shadows) this.sky.enableShadows();
        scene.environmentIntensity = 0.6;

        this.createOasis();
        this.createDesert();
        // Beyond it, the desert goes on, made as you walk
        this.chunks = new DesertChunks(this, { ...this.terrain.center });

        // One wind for everything that moves with it
        this.wind = new Wind();
        // The compass lies on the highest ground near its spot: where you find it, you can see far
        let best = null;
        for (let dx = -40; dx <= 40; dx += 4) {
            for (let dz = -40; dz <= 40; dz += 4) {
                const x = this.far.compass.x + dx, z = this.far.compass.z + dz;
                const h = this.heightAt(x, z);
                if (!best || h > best.h) best = { x, z, h };
            }
        }
        this.far.compass = { x: best.x, z: best.z };
        this.reserved[1] = { ...this.far.compass, radius: 4 };
        this.farAway = new FarAway(this, this.far);
        // Beyond the dunes that are drawn, a plain of sand out to the horizon: hidden under the
        // dunes from the ground, it is what you see far below from high up (the pyramid's top)
        const { trough, crest } = this.terrain.sandColors;
        this.farGround = new THREE.Mesh(
            new THREE.CircleGeometry(4000, 48).rotateX(-Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: trough.clone().lerp(crest, 0.3), roughness: 1 })
        );
        this.farGround.position.y = -3.5;
        this.farGround.receiveShadow = false;
        scene.add(this.farGround);
        this.dust = new Dust();
        scene.add(this.dust.points);
        this.wisps = new SandWisps(this.heightAt);
        scene.add(this.wisps.points);

        // The sand remembers you: footprints, and grains kicked up as you walk
        const surfaceAt = (x, z) => this.terrain.surfaceHeightAt(x, z);
        this.sandPatch = new SandPatch(this.terrain, playerStart.x, playerStart.z);
        scene.add(this.sandPatch.mesh);
        this.footprints = new Footprints(surfaceAt, this.terrain.hole, { windDirection: this.wind.direction });
        scene.add(this.footprints.mesh);
        this.sandSpray = new SandSpray(surfaceAt);
        scene.add(this.sandSpray.points);
        this.lookDirection = new THREE.Vector3();
    }

    add(object) {
        this.scene.add(object);
        if (object.userData.collider) {
            this.colliders.push(object.userData.collider);
            this.solids.push(object);
        }
        return object;
    }

    // Take something out of the world again (and out of the way of the player and the gaze)
    remove(object) {
        this.scene.remove(object);
        const collider = this.colliders.indexOf(object.userData.collider);
        if (collider !== -1) this.colliders.splice(collider, 1);
        const solid = this.solids.indexOf(object);
        if (solid !== -1) this.solids.splice(solid, 1);
    }

    // The ground you stand on: the dunes, or the pyramid's stones where it stands
    groundAt(x, z) {
        return Math.max(this.heightAt(x, z), pyramidHeightAt(this.far.pyramid, x, z));
    }

    isReserved(x, z) {
        return this.reserved.some(r => Math.hypot(x - r.x, z - r.z) < r.radius);
    }

    isUnderWater(x, z) {
        return this.heightAt(x, z) < WATER_LEVEL;
    }

    // Damp, packed sand around the pool: firm underfoot, doesn't slide
    // (and the pyramid's stone, which does not slide or give way either)
    isFirmGround(x, z) {
        return Math.hypot(x - this.oasis.poolX, z - this.oasis.poolZ) < 8 || this.farAway.onStone(x, z);
    }

    // The oasis: the old tree, a pool, palms, grass and flowers
    createOasis() {
        const { x: ox, z: oz, poolX, poolZ } = this.oasis;
        const heightAt = this.heightAt;

        // The old tree, just beside where you wake, on dry sand above the pool
        this.oldTree = this.add(createOldTree(ox - 2.5, oz + 5.5, heightAt));

        // Pool: still water in the hollow that mirrors the sky
        const water = new THREE.Mesh(
            new THREE.CircleGeometry(5.2, 48).rotateX(-Math.PI / 2),
            new THREE.MeshStandardMaterial({
                color: 0x0a2233,
                roughness: 0.05,
                metalness: 0.9,
                envMapIntensity: 1.6
            })
        );
        water.position.set(poolX, WATER_LEVEL, poolZ);
        water.receiveShadow = true;
        this.add(water);

        // Palms around the oasis, leaving the way toward the light open
        const palms = [
            [-13, -1, 7], [-11, 7, 6.5], [-7, -7, 7.5], [-3, -12, 6], [7, -9, 7],
            [9, 2, 6.5], [5, 11, 7], [-8, 13, 6], [14, -3, 6], [-15, 5, 5.5]
        ];
        palms.forEach(([x, z, height]) => this.palms.push(this.add(createPalm(ox + x, oz + z, height, heightAt))));

        // Grass and flowers along the water's edge and under the tree
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
            const radius = 5.5 + Math.random() * 1.5;
            const grass = createGrassPatch(
                poolX + Math.cos(angle) * radius, poolZ + Math.sin(angle) * radius, 2 + Math.random(), heightAt
            );
            this.grassPatches.push(this.add(grass));
        }
        this.grassPatches.push(this.add(createGrassPatch(ox - 2.5, oz + 5.5, 3, heightAt)));

        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 5.5 + Math.random() * 2.5;
            const flower = this.add(createFlower(poolX + Math.cos(angle) * radius, poolZ + Math.sin(angle) * radius, heightAt));
            this.vegetation.push({ object: flower, kind: 'flower' });
        }

        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * Math.PI * 2;
            this.add(createRock(poolX + Math.cos(angle) * 6, poolZ + Math.sin(angle) * 6, 0.4 + Math.random() * 0.4, heightAt));
        }
    }

    // The known desert around the oasis and the light: scattered stones, dry shrubs and a few
    // rock outcrops as landmarks along the way (beyond it, see desertChunks.js)
    createDesert() {
        const heightAt = this.heightAt;
        const half = (KNOWN_CHUNKS + 0.5) * CHUNK_SIZE;
        const { x: centerX, z: centerZ } = this.terrain.center;
        const bounds = { minX: centerX - half, maxX: centerX + half, minZ: centerZ - half, maxZ: centerZ + half };

        const randomDesertPoint = () => {
            for (;;) {
                const x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random());
                const z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, Math.random());
                const nearOasis = Math.hypot(x - this.oasis.x, z - this.oasis.z) < 25;
                const nearOrb = Math.hypot(x - this.orb.x, z - this.orb.z) < 12;
                if (!nearOasis && !nearOrb) return { x, z };
            }
        };

        for (let i = 0; i < 50; i++) {
            const { x, z } = randomDesertPoint();
            this.add(createRock(x, z, 0.3 + Math.random() * 0.9, heightAt, 0x8a6e52));
        }

        for (let i = 0; i < 70; i++) {
            const { x, z } = randomDesertPoint();
            this.vegetation.push({ object: this.add(createShrub(x, z, heightAt)), kind: 'shrub' });
        }

        // Outcrops roughly along the way, so the crossing has landmarks
        const outcrops = [[15, -45], [-14, -85], [34, -112]];
        outcrops.forEach(([cx, cz]) => {
            const count = 4 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) {
                const x = cx + (Math.random() - 0.5) * 8;
                const z = cz + (Math.random() - 0.5) * 8;
                this.add(createRock(x, z, 1.2 + Math.random() * 1.8, heightAt, 0x8a6e52));
            }
        });
    }

    // distanceWalked moves the sky from night toward sunrise
    update(delta, elapsed, camera, distanceWalked) {
        // A sandstorm: blowing sand the colour of the dunes, dark at night, glowing as day comes
        const storm = this.storm;
        const daylight = 0.2 + 0.8 * THREE.MathUtils.smoothstep(this.sky.sunAltitude, -14, 2);
        this.sky.stormColor.copy(STORM_SAND).multiplyScalar(daylight);
        this.sky.storm = storm;

        this.sky.update(delta, elapsed, camera, distanceWalked);
        // The desert follows the player: the ground under them, and what lies on it
        this.terrain.follow(camera.position.x, camera.position.z);
        this.chunks.update(camera.position.x, camera.position.z);
        this.scene.fog.color.copy(this.sky.horizonColor).lerp(this.sky.stormColor, storm); // Fog keeps its own copy
        // The haze lies low: from high up (the pyramid) you see much further
        const aboveSand = Math.max(0, camera.position.y - this.heightAt(camera.position.x, camera.position.z));
        const thinning = 1 / (1 + Math.max(0, aboveSand - 8) / 35);
        this.scene.fog.density = THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(FOG_DENSITY_START, FOG_DENSITY_END, this.sky.dawnProgress), STORM_FOG_DENSITY, storm
        ) * thinning;
        this.farGround.position.x = camera.position.x;
        this.farGround.position.z = camera.position.z;
        const wind = this.wind;
        wind.update(delta, this.sky.sunAltitude, storm);
        this.dust.update(delta, elapsed, camera, storm, wind);
        this.wisps.update(delta, camera, wind, this.sandLight(), this.forwardGlow(camera));
        this.sandSpray.update(delta);
        this.sandPatch.update(delta, camera.position.x, camera.position.z, wind.erosion);
        this.footprints.update(wind.erosion);
        this.updateGlitter();
        this.farAway.update(camera, this.sky, this.lights, elapsed);
        sandTintAt(this.sky.sunAltitude, this.terrain.sandTint.value);

        // The ripples creep downwind, a centimetre or two a second (more in a storm). The ripple
        // map repeats every 4 m, so its offset moves in 4 m units; its v runs against world z.
        const creep = (0.006 + 0.02 * Math.min(1, wind.strength)) * delta / 4;
        const ripples = this.terrain.ripples.offset;
        ripples.x = (ripples.x - wind.direction.x * creep) % 1;
        ripples.y = (ripples.y + wind.direction.y * creep) % 1;

        // Grass and palm crowns bend with the wind
        const gust = 0.35 + 1.7 * wind.calm * wind.gust + 2 * storm;
        this.grassPatches.forEach(patch => swayGrass(patch, elapsed, gust));
        this.palms.forEach(palm => {
            const { crown, swayPhase } = palm.userData;
            crown.rotation.x = Math.sin(elapsed * 0.9 + swayPhase) * 0.035 * gust;
            crown.rotation.z = Math.sin(elapsed * 0.7 + swayPhase * 1.7) * 0.05 * gust;
        });
    }

    // Blowing sand seen against the sun or moon shines: light scattered forward through it
    forwardGlow(camera) {
        const look = camera.getWorldDirection(this.lookDirection);
        const { sun, moon } = this.lights;
        const towardSun = Math.max(0, look.dot(this.sky.sunDirection));
        const towardMoon = Math.max(0, look.dot(this.sky.moonDirection));
        return 2.5 * Math.pow(towardSun, 3) * Math.min(1, sun.intensity) + 1.5 * Math.pow(towardMoon, 3) * moon.intensity;
    }

    // How lit the sand is, 0..1 (for things drawn unlit, like blowing sand)
    sandLight() {
        const { moon, sun, hemisphere } = this.lights;
        return THREE.MathUtils.clamp(0.06 + sun.intensity * 0.22 + moon.intensity * 0.3 + hemisphere.intensity * 0.08, 0.05, 1);
    }

    // Sand sparkles in whichever of the moon or sun is brighter
    updateGlitter() {
        const { moon, sun } = this.lights;
        const light = sun.intensity > moon.intensity ? sun : moon;
        const glitter = this.terrain.glitter;
        glitter.direction.value.copy(light.position).sub(light.target.position).normalize();
        glitter.color.value.copy(light.color);
        glitter.strength.value = light.intensity * (1 - this.storm);
    }

    // Keep the sky's reflection map current (the renderer is needed to draw it)
    updateEnvironment(renderer) {
        const environment = this.sky.updateEnvironment(renderer);
        if (environment) this.scene.environment = environment;
    }
}
