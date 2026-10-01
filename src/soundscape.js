// soundscape.js - What the desert sounds like where you are (the music itself is in music.js):
//   - places of silence: by the cold campfire, at the dry well, at the hollow where they lay
//     looking at the stars, the music falls away completely and only the wind is left
//   - crest or hollow: on top of a dune the wind is open and whistles; down in a hollow, muffled
//   - singing dunes: slide fast down a high dune face and, on some of them (always the same
//     ones), the sand starts to boom
//   - once, at full night, far away: a jackal. Nothing ever comes of it.
import * as THREE from 'three';

const smoothstep = THREE.MathUtils.smoothstep;

const SILENT_NEAR = 4; // Metres from a place of silence: no music at all...
const SILENT_FAR = 11; // ...fading back in from here
const SINGING_HEIGHT = 4.5; // Only high dunes sing
const SINGING_SPEED = 1.6; // m/s of sliding before the sand starts to boom

// A fixed pseudo-random 0..1 for a spot of desert (the same every visit)
function hash(x, z) {
    const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return value - Math.floor(value);
}

export class Soundscape {
    // music: JourneyMusic; world: World; traces: Traces (its quiet places)
    constructor(music, world, traces) {
        this.music = music;
        this.world = world;
        this.quietPlaces = ['campfire', 'well', 'stargazing'].map(name => traces.places[name]);
        this.silence = 0;
        this.exposure = 0;
        this.exposureTimer = 0;
        this.singing = 0;
        this.jackalHeard = false;
        this.jackalWait = 0;
    }

    // eye: where the player is; slide: sliding velocity (Vector2); sunAltitude: degrees
    update(delta, { eye, slide, sunAltitude, storm, distanceWalked }) {
        const { world } = this;

        // Places of silence
        let silence = 0;
        for (const place of this.quietPlaces) {
            const distance = Math.hypot(eye.x - place.x, eye.z - place.z);
            silence = Math.max(silence, 1 - smoothstep(distance, SILENT_NEAR, SILENT_FAR));
        }
        this.silence = silence;

        // Crest or hollow: how high you stand above the ground around you (a few times a second)
        this.exposureTimer -= delta;
        if (this.exposureTimer <= 0) {
            this.exposureTimer = 0.25;
            const here = world.heightAt(eye.x, eye.z);
            let around = 0;
            for (let i = 0; i < 16; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const reach = i < 8 ? 12 : 24;
                around += world.heightAt(eye.x + Math.cos(angle) * reach, eye.z + Math.sin(angle) * reach);
            }
            const target = THREE.MathUtils.clamp((here - around / 16) / 1.4, -1, 1);
            this.exposure += (target - this.exposure) * 0.35;
        }

        // Singing dunes: only some high faces, and only once the sand is really moving
        const speed = slide.length();
        const ground = world.heightAt(eye.x, eye.z);
        const cellX = Math.floor(eye.x / 30), cellZ = Math.floor(eye.z / 30);
        const singsHere = hash(cellX, cellZ) > 0.55 && ground > SINGING_HEIGHT;
        const target = singsHere ? THREE.MathUtils.clamp((speed - SINGING_SPEED) / 1.8, 0, 1) : 0;
        // It builds up as the avalanche grows, and dies away slowly after
        this.singing += (target - this.singing) * Math.min(1, delta * (target > this.singing ? 0.9 : 0.6));
        this.music.sing(this.singing, 72 + 30 * hash(cellZ, cellX));

        // The jackal: once, at full night, some way out from the oasis, in clear air
        if (!this.jackalHeard && sunAltitude < -11 && distanceWalked > 30 && storm < 0.1) {
            this.jackalWait += delta;
            if (this.jackalWait > 20 && Math.random() < delta / 25) {
                this.jackalHeard = true;
                // Somewhere off to one side of where you face
                const side = Math.random() < 0.5 ? -1 : 1;
                this.music.jackal(side * (0.55 + Math.random() * 0.35));
            }
        }
    }
}
