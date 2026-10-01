// desertChunks.js - The desert beyond the known one. Around the oasis and the light, World
// scatters stones and shrubs once (createDesert). Past that, the desert is made as you walk:
// it is cut into squares (chunks), and each square within reach grows its own stones, dry
// shrubs and, now and then, an outcrop of large rocks. Each square's randomness comes from its
// own seed, so a place looks the same when you come back to it. Squares left far behind are
// taken away again.
import { createRock, createShrub, withRandom, seededRandom } from './props.js';

export const CHUNK_SIZE = 60; // Metres
export const KNOWN_CHUNKS = 4; // Squares either side of the centre that World.createDesert fills
const LOAD_DISTANCE = 4; // Squares around the player that are filled in (beyond the fog)
const UNLOAD_DISTANCE = 5; // ...and how far they may fall behind before they are taken away

const ROCK_COLOR = 0x8a6e52;

export class DesertChunks {
    // world: the World (heightAt, add, remove); origin: { x, z } centre of the known desert
    constructor(world, origin) {
        this.world = world;
        this.origin = origin;
        this.loaded = new Map(); // 'i,j' -> { i, j, objects: [], plants: [] }
        this.current = null; // The square the player is in, as 'i,j'

        // Hooks: a shrub came into or went out of the world ({ object, kind })
        this.onAddPlant = null;
        this.onRemovePlant = null;
    }

    // Call every frame with the player's position
    update(x, z) {
        const ci = Math.round((x - this.origin.x) / CHUNK_SIZE);
        const cj = Math.round((z - this.origin.z) / CHUNK_SIZE);
        const key = `${ci},${cj}`;
        if (key === this.current) return;
        this.current = key;

        for (const chunk of this.loaded.values()) {
            if (Math.max(Math.abs(chunk.i - ci), Math.abs(chunk.j - cj)) > UNLOAD_DISTANCE) this.unload(chunk);
        }
        for (let i = ci - LOAD_DISTANCE; i <= ci + LOAD_DISTANCE; i++) {
            for (let j = cj - LOAD_DISTANCE; j <= cj + LOAD_DISTANCE; j++) {
                const known = Math.max(Math.abs(i), Math.abs(j)) <= KNOWN_CHUNKS;
                if (!known && !this.loaded.has(`${i},${j}`)) this.load(i, j);
            }
        }
    }

    load(i, j) {
        const { world } = this;
        const heightAt = world.heightAt;
        const chunk = { i, j, objects: [], plants: [] };
        const random = seededRandom(Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ 0x9e3779b9);
        const left = this.origin.x + (i - 0.5) * CHUNK_SIZE;
        const top = this.origin.z + (j - 0.5) * CHUNK_SIZE;
        const point = () => [left + random() * CHUNK_SIZE, top + random() * CHUNK_SIZE];

        withRandom(random, () => {
            const rocks = Math.floor(random() * 2.3);
            for (let n = 0; n < rocks; n++) {
                const [x, z] = point();
                chunk.objects.push(world.add(createRock(x, z, 0.3 + random() * 0.9, heightAt, ROCK_COLOR)));
            }

            const shrubs = Math.floor(random() * 2.6);
            for (let n = 0; n < shrubs; n++) {
                const [x, z] = point();
                const plant = { object: world.add(createShrub(x, z, heightAt)), kind: 'shrub' };
                chunk.plants.push(plant);
                this.onAddPlant?.(plant);
            }

            // Now and then a landmark: a cluster of large rocks
            if (random() < 0.07) {
                const [cx, cz] = point();
                const count = 4 + Math.floor(random() * 3);
                for (let n = 0; n < count; n++) {
                    const x = cx + (random() - 0.5) * 8;
                    const z = cz + (random() - 0.5) * 8;
                    chunk.objects.push(world.add(createRock(x, z, 1.2 + random() * 1.8, heightAt, ROCK_COLOR)));
                }
            }
        });
        this.loaded.set(`${i},${j}`, chunk);
    }

    unload(chunk) {
        for (const rock of chunk.objects) {
            this.world.remove(rock);
            rock.geometry.dispose();
            rock.material.dispose(); // Each rock has its own colour
        }
        for (const plant of chunk.plants) {
            this.onRemovePlant?.(plant);
            this.world.remove(plant.object);
            plant.object.geometry.dispose(); // The dead-wood material is shared
        }
        this.loaded.delete(`${chunk.i},${chunk.j}`);
    }
}
