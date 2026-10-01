// environmentSounds.js - The small sounds of things the player disturbs: dry leaves rustling, a
// stone shifting in its bed, sand sifting away from it. Made in the browser like the footsteps
// (no audio files), short and quiet, placed left or right of the listener and fading with
// distance. They only answer the environment's events ('react', 'sand'), so these hooks can
// carry other sounds later. (Steps, landings and sliding already sound through footsteps.js.)
import { lowpass, highpass, normalize, scatterGrains } from '../footsteps.js';

const HEARING = 10; // Metres at which a sound has faded away
const MIN_GAP = 0.06; // Seconds between two sounds of the same kind
const KINDS = {
    rustle: { variations: 3, volume: 0.22 },
    stone: { variations: 2, volume: 0.45 },
    sift: { variations: 2, volume: 0.25 }
};

function fadeTail(data, sampleRate, seconds = 0.03) {
    const fade = Math.floor(seconds * sampleRate);
    for (let i = 0; i < fade; i++) data[data.length - 1 - i] *= i / fade;
    return data;
}

// Dry leaves and twigs brushing: a quick swell of tiny clicks
function synthesizeRustle(sampleRate) {
    const length = 0.4;
    const data = new Float32Array(Math.floor(sampleRate * length));
    scatterGrains(data, sampleRate, 260, 0, length - 0.02, t => Math.sin(Math.PI * Math.min(1, t / (length - 0.02))) ** 0.7);
    highpass(data, 1800, sampleRate);
    lowpass(data, 7000, sampleRate);
    normalize(data, 0.8);
    return fadeTail(data, sampleRate);
}

// A stone rocking in sand: a dull knock as it settles back, and grit grinding under it
function synthesizeStone(sampleRate) {
    const length = Math.floor(sampleRate * 0.5);
    const knock = new Float32Array(length);
    const grind = new Float32Array(length);
    const decay = 0.03 * sampleRate;
    for (let i = 0; i < length; i++) knock[i] = (Math.random() * 2 - 1) * Math.exp(-i / decay);
    lowpass(knock, 260, sampleRate);
    lowpass(knock, 260, sampleRate);
    normalize(knock, 1);
    scatterGrains(grind, sampleRate, 180, 0.02, 0.42, t => Math.exp(-t / 0.15));
    highpass(grind, 500, sampleRate);
    lowpass(grind, 2500, sampleRate);
    normalize(grind, 1);
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) data[i] = knock[i] * 0.55 + grind[i] * 0.45;
    normalize(data, 0.8);
    return fadeTail(data, sampleRate);
}

// Sand trickling: a soft fall of fine grains that thins out
function synthesizeSift(sampleRate) {
    const data = new Float32Array(Math.floor(sampleRate * 0.7));
    scatterGrains(data, sampleRate, 500, 0, 0.65, t => Math.exp(-t / 0.25));
    highpass(data, 1200, sampleRate);
    lowpass(data, 5000, sampleRate);
    normalize(data, 0.6);
    return fadeTail(data, sampleRate);
}

const SYNTHESIZE = { rustle: synthesizeRustle, stone: synthesizeStone, sift: synthesizeSift };

export class EnvironmentSounds {
    // audio: AmbientAudio (sounds play once it has started); camera: the listener
    constructor(audio, environment, camera) {
        this.audio = audio;
        this.camera = camera;
        this.buffers = null;
        this.last = { rustle: -Infinity, stone: -Infinity, sift: -Infinity };

        environment.addEventListener('react', ({ reactive, strength, position }) => {
            if (reactive.sound) this.play(reactive.sound, position, strength * reactive.loudness);
        });
        environment.addEventListener('sand', ({ cause, strength, position }) => {
            if (cause === 'interact') this.play('sift', position, strength); // Steps and landings: footsteps.js
        });
    }

    // Synthesise the variations the first time a sound is needed
    getBuffers() {
        if (!this.buffers) {
            const context = this.audio.context;
            this.buffers = {};
            for (const [kind, { variations }] of Object.entries(KINDS)) {
                this.buffers[kind] = Array.from({ length: variations }, () => {
                    const data = SYNTHESIZE[kind](context.sampleRate);
                    const buffer = context.createBuffer(1, data.length, context.sampleRate);
                    buffer.copyToChannel(data, 0);
                    return buffer;
                });
            }
        }
        return this.buffers;
    }

    // kind: 'rustle', 'stone' or 'sift'; position: where (Vector3); strength: 0..1
    play(kind, position, strength) {
        if (!this.audio.started || !KINDS[kind] || strength <= 0.01) return;
        const context = this.audio.context;
        const now = context.currentTime;
        if (now - this.last[kind] < MIN_GAP) return;

        // Fainter further away; panned to the side it is on
        const camera = this.camera.position;
        const dx = position.x - camera.x, dz = position.z - camera.z;
        const distance = Math.hypot(dx, dz);
        const fade = Math.max(0, 1 - distance / HEARING);
        const volume = KINDS[kind].volume * Math.min(1, strength) * fade * fade;
        if (volume < 0.005) return;
        this.last[kind] = now;

        const m = this.camera.matrixWorld.elements; // Column 0: the listener's right
        const right = distance > 0.01 ? (dx * m[0] + dz * m[2]) / distance : 0;

        const buffers = this.getBuffers()[kind];
        const source = context.createBufferSource();
        source.buffer = buffers[Math.floor(Math.random() * buffers.length)];
        source.playbackRate.value = 0.92 + Math.random() * 0.16;
        const gain = context.createGain();
        gain.gain.value = volume;
        const panner = context.createStereoPanner();
        panner.pan.value = right * 0.6;
        source.connect(gain).connect(panner).connect(this.audio.effectsGain);
        source.start(now + 0.005);
    }
}
