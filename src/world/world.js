// world.js - The desert before dawn: terrain, the real sky, the oasis, scattered rocks and shrubs, drifting sand
import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { Sky } from './sky.js';
import { Dust } from './dust.js';
import { Footprints } from './footprints.js';
import { SandSpray } from './sandSpray.js';
import {
    createOldTree, createPalm, createShrub, createRock, createGrassPatch, createFlower, swayGrass
} from './props.js';

// Night mist is thick at the start and lifts as dawn comes
const FOG_DENSITY_START = 0.012;
const FOG_DENSITY_END = 0.006;

// Height of the pool's surface; ground below it is under water
export const WATER_LEVEL = -0.15;

export class World {
    // oasis: { x, z, poolX, poolZ }, orb: { x, z }
    // skyOptions: { sceneBearing, date } passed to the Sky (see sky.js)
    // shadows: whether the moon and sun cast shadows
    constructor(scene, { oasis, orb, skyOptions, shadows = true }) {
        this.scene = scene;
        this.oasis = oasis;
        this.orb = orb;
        this.grassPatches = [];
        this.palms = [];
        this.colliders = []; // { x, z, radius } circles the player can't walk into
        this.solids = []; // The objects those belong to (trunks, the old tree, rocks): they block the view
        this.vegetation = []; // { object, kind: 'shrub' | 'flower' } plants that can respond to the player

        this.terrain = new Terrain({ oasis, orb });
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

        this.dust = new Dust();
        scene.add(this.dust.points);

        // The sand remembers you: footprints, and grains kicked up as you walk
        const surfaceAt = (x, z) => this.terrain.surfaceHeightAt(x, z);
        this.footprints = new Footprints(surfaceAt);
        scene.add(this.footprints.mesh);
        this.sandSpray = new SandSpray(surfaceAt);
        scene.add(this.sandSpray.points);
        this.glitterDirection = new THREE.Vector3();
    }

    add(object) {
        this.scene.add(object);
        if (object.userData.collider) {
            this.colliders.push(object.userData.collider);
            this.solids.push(object);
        }
        return object;
    }

    isUnderWater(x, z) {
        return this.heightAt(x, z) < WATER_LEVEL;
    }

    // Damp, packed sand around the pool: firm underfoot, doesn't slide
    isFirmGround(x, z) {
        return Math.hypot(x - this.oasis.poolX, z - this.oasis.poolZ) < 8;
    }

    // The oasis: the old tree, a pool, palms, grass and flowers
    createOasis() {
        const { x: ox, z: oz, poolX, poolZ } = this.oasis;
        const heightAt = this.heightAt;

        this.oldTree = this.add(createOldTree(ox - 4.5, oz + 3.5, heightAt));

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
        this.grassPatches.push(this.add(createGrassPatch(ox - 4.5, oz + 3.5, 3, heightAt)));

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

    // The open desert: scattered stones, dry shrubs and a few rock outcrops as landmarks
    createDesert() {
        const heightAt = this.heightAt;
        const bounds = this.terrain.bounds(20);

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
        this.sky.update(delta, elapsed, camera, distanceWalked);
        this.scene.fog.color.copy(this.sky.horizonColor); // Fog keeps its own copy of the colour
        this.scene.fog.density = THREE.MathUtils.lerp(FOG_DENSITY_START, FOG_DENSITY_END, this.sky.dawnProgress);
        this.dust.update(delta, elapsed, camera);
        this.sandSpray.update(delta);
        this.updateGlitter();

        // Wind comes in slow gusts; grass and palm crowns bend with it
        const gust = 0.6 + 0.4 * Math.sin(elapsed * 0.35) + 0.2 * Math.sin(elapsed * 1.3 + 1);
        this.grassPatches.forEach(patch => swayGrass(patch, elapsed, gust));
        this.palms.forEach(palm => {
            const { crown, swayPhase } = palm.userData;
            crown.rotation.x = Math.sin(elapsed * 0.9 + swayPhase) * 0.035 * gust;
            crown.rotation.z = Math.sin(elapsed * 0.7 + swayPhase * 1.7) * 0.05 * gust;
        });
    }

    // Sand sparkles in whichever of the moon or sun is brighter
    updateGlitter() {
        const { moon, sun } = this.lights;
        const light = sun.intensity > moon.intensity ? sun : moon;
        const glitter = this.terrain.glitter;
        glitter.direction.value.copy(light.position).sub(light.target.position).normalize();
        glitter.color.value.copy(light.color);
        glitter.strength.value = light.intensity;
    }

    // Keep the sky's reflection map current (the renderer is needed to draw it)
    updateEnvironment(renderer) {
        const environment = this.sky.updateEnvironment(renderer);
        if (environment) this.scene.environment = environment;
    }
}
