// footsteps.js - Footstep sounds made in the browser (no audio files).
//
// A step in sand is a soft heel thump followed by the crunch of many tiny grains being
// pressed together as the foot rolls to the toe. A few variations are synthesised once,
// then each step picks one at random and plays it at a slightly different pitch and time.

const VARIATIONS = 8;
const LOUDNESS = 0.9;

// Simple one-pole filters, run over a Float32Array in place
function lowpass(data, cutoff, sampleRate) {
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    let y = 0;
    for (let i = 0; i < data.length; i++) {
        y += a * (data[i] - y);
        data[i] = y;
    }
}

function highpass(data, cutoff, sampleRate) {
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
        low += a * (data[i] - low);
        data[i] -= low;
    }
}

function normalize(data, peak) {
    let max = 0;
    for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
    if (max > 0) for (let i = 0; i < data.length; i++) data[i] *= peak / max;
}

// One step in sand: heel thump + granular crunch that rolls from heel to toe
function synthesizeSandStep(sampleRate) {
    const length = Math.floor(sampleRate * 0.4);
    const heel = new Float32Array(length);
    const crunch = new Float32Array(length);

    // Heel: low, soft thud with a gentle 15 ms attack
    const heelAttack = 0.015 * sampleRate;
    const heelDecay = 0.05 * sampleRate;
    for (let i = 0; i < length; i++) {
        const envelope = i < heelAttack ? i / heelAttack : Math.exp(-(i - heelAttack) / heelDecay);
        heel[i] = (Math.random() * 2 - 1) * envelope;
    }
    lowpass(heel, 160, sampleRate);
    lowpass(heel, 220, sampleRate);
    normalize(heel, 1);

    // Crunch: hundreds of tiny grain clicks. Their density swells as the weight rolls
    // forward (peaking ~110 ms after the heel) and fades as the toe lifts.
    const grains = 250 + Math.floor(Math.random() * 150);
    const rollStart = 0.02, rollPeak = 0.11, rollEnd = 0.3;
    for (let g = 0; g < grains; g++) {
        // Triangular distribution between rollStart and rollEnd, peaking at rollPeak
        const u = Math.random();
        const split = (rollPeak - rollStart) / (rollEnd - rollStart);
        const time = u < split
            ? rollStart + Math.sqrt(u * (rollEnd - rollStart) * (rollPeak - rollStart))
            : rollEnd - Math.sqrt((1 - u) * (rollEnd - rollStart) * (rollEnd - rollPeak));

        const start = Math.floor(time * sampleRate);
        const size = Math.pow(Math.random(), 3); // Mostly tiny grains, a few larger ones
        const grainLength = Math.floor((0.0005 + Math.random() * 0.002) * sampleRate);
        for (let i = 0; i < grainLength && start + i < length; i++) {
            crunch[start + i] += (Math.random() * 2 - 1) * size * Math.exp((-i / grainLength) * 4);
        }
    }
    highpass(crunch, 500, sampleRate);
    lowpass(crunch, 4500, sampleRate);
    normalize(crunch, 1);

    const step = new Float32Array(length);
    for (let i = 0; i < length; i++) step[i] = heel[i] * 0.55 + crunch[i] * 0.45;

    // Fade the tail so nothing clicks at the end
    const fade = Math.floor(0.03 * sampleRate);
    for (let i = 0; i < fade; i++) step[length - 1 - i] *= i / fade;
    normalize(step, 0.9);
    return step;
}

// A step in shallow water: a soft slosh with a few bubbly drips
function synthesizeWaterStep(sampleRate) {
    const length = Math.floor(sampleRate * 0.5);
    const slosh = new Float32Array(length);
    const attack = 0.03 * sampleRate;
    const decay = 0.12 * sampleRate;
    for (let i = 0; i < length; i++) {
        const envelope = i < attack ? i / attack : Math.exp(-(i - attack) / decay);
        slosh[i] = (Math.random() * 2 - 1) * envelope;
    }
    highpass(slosh, 200, sampleRate);
    lowpass(slosh, 1400, sampleRate);
    normalize(slosh, 0.7);

    // Drips: short rising tones, like small bubbles
    const drips = 3 + Math.floor(Math.random() * 4);
    for (let d = 0; d < drips; d++) {
        const start = Math.floor((0.05 + Math.random() * 0.3) * sampleRate);
        const frequency = 600 + Math.random() * 900;
        const dripLength = Math.floor(0.03 * sampleRate);
        for (let i = 0; i < dripLength && start + i < length; i++) {
            const t = i / sampleRate;
            slosh[start + i] += Math.sin(2 * Math.PI * frequency * t * (1 + t * 8)) *
                Math.exp(-i / (dripLength / 4)) * 0.25;
        }
    }
    normalize(slosh, 0.9);
    return slosh;
}

export class Footsteps {
    // audio: the AmbientAudio instance (footsteps play once its context has started)
    constructor(audio) {
        this.audio = audio;
        this.sand = null;
        this.water = null;
        this.foot = 1; // Alternates between left (-1) and right (1)
        this.lastIndex = -1;
    }

    get context() {
        return this.audio.context;
    }

    // Synthesise the variations the first time they're needed
    getSounds() {
        if (!this.sand) {
            const context = this.context;
            const toBuffer = data => {
                const buffer = context.createBuffer(1, data.length, context.sampleRate);
                buffer.copyToChannel(data, 0);
                return buffer;
            };
            this.sand = Array.from({ length: VARIATIONS }, () => toBuffer(synthesizeSandStep(context.sampleRate)));
            this.water = Array.from({ length: 4 }, () => toBuffer(synthesizeWaterStep(context.sampleRate)));
        }
        return { sand: this.sand, water: this.water };
    }

    // Pick a variation, never the same one twice in a row
    pick(buffers) {
        let index = Math.floor(Math.random() * buffers.length);
        if (index === this.lastIndex) index = (index + 1) % buffers.length;
        this.lastIndex = index;
        return buffers[index];
    }

    play(buffer, { volume, rate = 1, pan = 0, brightness = 6000, delay = 0 }) {
        const context = this.context;
        const at = context.currentTime + 0.01 + delay;

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = rate;

        // Softer steps are also duller
        const tone = context.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = brightness;

        const gain = context.createGain();
        gain.gain.value = volume * LOUDNESS;

        const panner = context.createStereoPanner();
        panner.pan.value = pan;

        source.connect(tone).connect(gain).connect(panner).connect(this.audio.effectsGain);
        source.start(at);
    }

    // intensity: 0..1 (walking pace); surface: 'sand' or 'water'
    step(surface, intensity) {
        if (!this.audio.started || intensity <= 0.05) return;

        const sounds = this.getSounds();
        this.foot = -this.foot;
        const vary = spread => 1 + (Math.random() - 0.5) * spread;

        this.play(this.pick(surface === 'water' ? sounds.water : sounds.sand), {
            volume: (0.35 + 0.65 * intensity) * vary(0.3),
            rate: vary(0.12), // Slightly different pitch every step
            pan: this.foot * 0.08,
            brightness: 2500 + 4000 * intensity,
            delay: Math.random() * 0.02 // Human timing, not a metronome
        });
    }

    // strength: 0..1 how hard the landing was: both feet, a little apart, heavier and lower
    land(strength) {
        if (!this.audio.started) return;
        const sounds = this.getSounds();
        const volume = 0.6 + 0.5 * strength;
        this.play(this.pick(sounds.sand), { volume, rate: 0.82, pan: -0.08 });
        this.play(this.pick(sounds.sand), { volume: volume * 0.8, rate: 0.86, pan: 0.08, delay: 0.035 });
    }
}
