// footsteps.js - Footstep sounds made in the browser from filtered noise (no audio files):
// a soft heel thump and a sand crunch per step, splashes in the pool, a thud when landing.

// Filtering removes most of the noise's energy; this brings steps back to a clearly audible level
const LOUDNESS = 3.5;

export class Footsteps {
    // audio: the AmbientAudio instance (footsteps play once its context has started)
    constructor(audio) {
        this.audio = audio;
        this.noise = null;
        this.foot = 1; // Alternates between left (-1) and right (1)
    }

    get context() {
        return this.audio.context;
    }

    // One second of white noise, sliced into every sound below
    getNoise() {
        if (!this.noise) {
            const context = this.context;
            this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
            const data = this.noise.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        return this.noise;
    }

    // A burst of filtered noise with a quick attack and exponential decay
    burst({ at, duration, volume, filter, frequency, q = 1, sweepTo = null, pan = 0 }) {
        const context = this.context;
        const source = context.createBufferSource();
        source.buffer = this.getNoise();

        const shaping = context.createBiquadFilter();
        shaping.type = filter;
        shaping.frequency.setValueAtTime(frequency, at);
        if (sweepTo) shaping.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);
        shaping.Q.value = q;

        const gain = context.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(volume * LOUDNESS, at + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

        const panner = context.createStereoPanner();
        panner.pan.value = pan;

        source.connect(shaping).connect(gain).connect(panner).connect(this.audio.effectsGain);
        source.start(at, Math.random() * 0.8, duration + 0.05);
    }

    // intensity: 0..1 (walking pace); surface: 'sand' or 'water'
    step(surface, intensity) {
        if (!this.audio.started || intensity <= 0.05) return;

        this.foot = -this.foot;
        const pan = this.foot * 0.15;
        const at = this.context.currentTime + 0.01;
        const vary = (base, spread) => base * (1 + (Math.random() - 0.5) * spread);
        const volume = 0.25 + 0.75 * intensity;

        if (surface === 'water') {
            // Splash: a bright rush that falls away, over a low slosh
            this.burst({ at, duration: vary(0.35, 0.3), volume: 0.35 * volume, filter: 'bandpass', frequency: vary(1400, 0.4), sweepTo: 500, q: 1.5, pan });
            this.burst({ at: at + 0.03, duration: 0.25, volume: 0.25 * volume, filter: 'lowpass', frequency: 450, pan });
            return;
        }

        // Sand: heel thump, then the crunch of grains under the toe
        this.burst({ at, duration: vary(0.09, 0.3), volume: 0.35 * volume, filter: 'lowpass', frequency: vary(380, 0.3), pan });
        this.burst({ at: at + vary(0.045, 0.4), duration: vary(0.14, 0.4), volume: 0.18 * volume, filter: 'bandpass', frequency: vary(2200, 0.4), q: 0.9, pan });
    }

    // strength: 0..1 how hard the landing was
    land(strength) {
        if (!this.audio.started) return;
        const at = this.context.currentTime + 0.01;
        const volume = 0.4 + 0.6 * strength;

        this.burst({ at, duration: 0.18, volume: 0.6 * volume, filter: 'lowpass', frequency: 220 });
        this.burst({ at, duration: 0.22, volume: 0.25 * volume, filter: 'bandpass', frequency: 1800, q: 0.8, pan: -0.1 });
        this.burst({ at: at + 0.02, duration: 0.2, volume: 0.25 * volume, filter: 'bandpass', frequency: 2400, q: 0.8, pan: 0.1 });
    }
}
