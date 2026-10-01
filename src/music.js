// music.js - Music that grows with the journey (no audio files besides the background track).
//
// Driven by how far you have walked (the same clock that brings the dawn):
//   at the oasis       wind in gusts, the background track barely there
//   leaving it         a low drone on D and A rises
//   mid-desert         the background track comes up to full
//   deep in the walk   a sparse plucked melody, oud-like, in the Hijaz scale (dark, searching)
//   first light        the melody turns to a warm major pentatonic; the drone gains a major third
// Everything except the wind passes through the main mix, so it still fades into silence and
// echo near the light.

// MIDI note numbers. Hijaz on D (D Eb F# G A Bb C), and D major pentatonic for the dawn.
const HIJAZ = [62, 63, 66, 67, 69, 70, 72, 74, 75, 78];
const DAWN = [62, 64, 66, 69, 71, 74, 76, 78];
const TONIC_NOTES = [62, 69, 74]; // D, A, D: where phrases like to come to rest

const midiToFrequency = note => 440 * Math.pow(2, (note - 69) / 12);

const smoothstep = (edge0, edge1, x) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};

// A plucked string (Karplus-Strong): a short burst of noise circulating in a delay line the
// length of one period, softened a little on every pass. Sounds like a gut-strung lute.
function synthesizePluck(frequency, sampleRate, seconds = 3.2) {
    const length = Math.floor(sampleRate * seconds);
    const out = new Float32Array(length);
    const period = Math.max(2, Math.round(sampleRate / frequency - 0.5));
    const line = new Float32Array(period);

    // Excitation: noise, low-passed so the pluck is warm rather than bright
    let smooth = 0;
    for (let i = 0; i < period; i++) {
        smooth += 0.45 * ((Math.random() * 2 - 1) - smooth);
        line[i] = smooth;
    }

    const loss = 0.9965; // How quickly the string dies away
    let index = 0;
    for (let i = 0; i < length; i++) {
        const next = (index + 1) % period;
        const value = line[index];
        out[i] = value;
        line[index] = loss * 0.5 * (value + line[next]);
        index = next;
    }

    // Soft attack (no click) and normalise
    const attack = Math.floor(0.004 * sampleRate);
    for (let i = 0; i < attack; i++) out[i] *= i / attack;
    let peak = 0;
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
    for (let i = 0; i < length; i++) out[i] *= 0.8 / peak;
    return out;
}

// Looping noise for the wind, with crossfaded ends so the loop is seamless
function synthesizeWind(sampleRate, seconds = 6) {
    const length = Math.floor(sampleRate * seconds);
    const data = new Float32Array(length);
    let brown = 0;
    for (let i = 0; i < length; i++) {
        brown = (brown + 0.02 * (Math.random() * 2 - 1)) * 0.998; // Deep, rumbly noise
        data[i] = brown * 3 + (Math.random() * 2 - 1) * 0.15;
    }
    const fade = Math.floor(0.5 * sampleRate);
    for (let i = 0; i < fade; i++) {
        const t = i / fade;
        data[i] = data[i] * t + data[length - fade + i] * (1 - t);
    }
    return data.subarray(0, length - fade);
}

export class JourneyMusic {
    // audio: the AmbientAudio instance; starts playing once its context exists
    constructor(audio) {
        this.audio = audio;
        this.started = false;
        this.time = 0;
        this.nextPhrase = 4; // Seconds until the first melody phrase may begin
        this.noteIndex = 0;
        this.dawn = 0; // 0 night .. 1 after first light (only goes up)
        this.plucks = new Map(); // MIDI note -> AudioBuffer
    }

    get context() {
        return this.audio.context;
    }

    start() {
        if (this.started || !this.audio.context) return;
        this.started = true;
        const context = this.context;

        // Wind: on the effects bus, so it stays when the music fades near the light
        const wind = context.createBufferSource();
        const windData = synthesizeWind(context.sampleRate);
        wind.buffer = context.createBuffer(1, windData.length, context.sampleRate);
        wind.buffer.copyToChannel(windData, 0);
        wind.loop = true;
        this.windFilter = context.createBiquadFilter();
        this.windFilter.type = 'bandpass';
        this.windFilter.Q.value = 0.6;
        this.windGain = context.createGain();
        this.windGain.gain.value = 0;
        wind.connect(this.windFilter).connect(this.windGain).connect(this.audio.effectsGain);
        wind.start();

        // Drone: D2 and A2, two slightly detuned saws each, darkened by a low-pass filter
        this.droneFilter = context.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.frequency.value = 240;
        this.droneFilter.Q.value = 0.7;
        this.droneGain = context.createGain();
        this.droneGain.gain.value = 0;
        this.droneFilter.connect(this.droneGain).connect(this.audio.analyser);
        [[38, -5], [38, 4], [45, -3], [45, 5]].forEach(([note, cents]) => {
            const oscillator = context.createOscillator();
            oscillator.type = 'sawtooth';
            oscillator.frequency.value = midiToFrequency(note);
            oscillator.detune.value = cents;
            oscillator.connect(this.droneFilter);
            oscillator.start();
        });

        // The dawn's major third (F#3), soft and round
        this.thirdGain = context.createGain();
        this.thirdGain.gain.value = 0;
        const third = context.createOscillator();
        third.type = 'triangle';
        third.frequency.value = midiToFrequency(54);
        third.connect(this.thirdGain).connect(this.droneGain);
        third.start();

        // Melody bus with a long, quiet echo, like a voice across open sand
        this.melodyGain = context.createGain();
        this.melodyGain.gain.value = 0;
        const echo = context.createDelay(2);
        echo.delayTime.value = 0.43;
        const feedback = context.createGain();
        feedback.gain.value = 0.32;
        const echoTone = context.createBiquadFilter();
        echoTone.type = 'lowpass';
        echoTone.frequency.value = 1800;
        this.melodyInput = context.createGain();
        this.melodyInput.connect(this.melodyGain);
        this.melodyInput.connect(echo);
        echo.connect(echoTone).connect(feedback).connect(echo);
        echoTone.connect(this.melodyGain);
        this.melodyGain.connect(this.audio.analyser);
    }

    pluck(note) {
        if (!this.plucks.has(note)) {
            const data = synthesizePluck(midiToFrequency(note), this.context.sampleRate);
            const buffer = this.context.createBuffer(1, data.length, this.context.sampleRate);
            buffer.copyToChannel(data, 0);
            this.plucks.set(note, buffer);
        }
        return this.plucks.get(note);
    }

    playNote(note, at, velocity) {
        const context = this.context;
        const source = context.createBufferSource();
        source.buffer = this.pluck(note);
        const gain = context.createGain();
        gain.gain.value = velocity;
        const panner = context.createStereoPanner();
        panner.pan.value = (Math.random() - 0.5) * 0.6;
        source.connect(gain).connect(panner).connect(this.melodyInput);
        source.start(at);
    }

    // A short phrase of 1-4 notes wandering through the scale, often coming to rest on D or A
    playPhrase() {
        const scale = this.dawn > 0.5 ? DAWN : HIJAZ;
        this.noteIndex = Math.min(this.noteIndex, scale.length - 1);
        const length = 1 + Math.floor(Math.random() * 4);
        let at = this.context.currentTime + 0.05;

        for (let i = 0; i < length; i++) {
            const step = [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
            this.noteIndex = Math.max(0, Math.min(scale.length - 1, this.noteIndex + step));
            let note = scale[this.noteIndex];
            if (i === length - 1 && Math.random() < 0.6) {
                // Resolve to the nearest resting note
                note = TONIC_NOTES.reduce((best, n) => (Math.abs(n - note) < Math.abs(best - note) ? n : best));
                this.noteIndex = scale.indexOf(note);
            }
            this.playNote(note, at, 0.55 + Math.random() * 0.35);
            if (Math.random() < 0.15) this.playNote(note - 12, at, 0.35); // An occasional low doubling
            at += 0.32 + Math.random() * 0.45;
        }
    }

    // A small bird somewhere in the palms: a few quick rising chirps
    birdsong() {
        if (!this.started) return;
        const context = this.context;
        let at = context.currentTime + 0.1;
        const chirps = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < chirps; i++) {
            const oscillator = context.createOscillator();
            oscillator.type = 'sine';
            const base = 2600 + Math.random() * 900;
            oscillator.frequency.setValueAtTime(base, at);
            oscillator.frequency.exponentialRampToValueAtTime(base * 1.45, at + 0.07);
            oscillator.frequency.exponentialRampToValueAtTime(base * 1.1, at + 0.11);
            const gain = context.createGain();
            gain.gain.setValueAtTime(0, at);
            gain.gain.linearRampToValueAtTime(0.06, at + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0005, at + 0.12);
            const panner = context.createStereoPanner();
            panner.pan.value = 0.4;
            oscillator.connect(gain).connect(panner).connect(this.audio.effectsGain);
            oscillator.start(at);
            oscillator.stop(at + 0.15);
            at += 0.14 + Math.random() * 0.12;
        }
    }

    // progress: 0..1 along the journey (distance walked); sunAltitude: degrees
    update(delta, { progress, sunAltitude }) {
        if (!this.started) {
            if (!this.audio.started) return;
            this.start();
        }
        this.time += delta;
        const now = this.context.currentTime;
        const ease = (param, value, seconds = 1.5) => param.setTargetAtTime(value, now, seconds);

        // First light: once the sun is 6° below the horizon, the music turns toward morning
        if (sunAltitude > -6) this.dawn = Math.min(1, this.dawn + delta / 12);

        // Wind gusts (same rhythm as the swaying palms), a little calmer at dawn
        const gust = 0.6 + 0.4 * Math.sin(this.time * 0.35) + 0.2 * Math.sin(this.time * 1.3 + 1);
        ease(this.windGain.gain, (0.13 + 0.17 * gust) * (1 - 0.4 * this.dawn), 0.3);
        ease(this.windFilter.frequency, 300 + 400 * gust, 0.3);

        // The layers come in as the walk goes on
        this.audio.setTrackLevel?.(0.35 + 0.65 * smoothstep(0.1, 0.45, progress));
        ease(this.droneGain.gain, 0.05 * smoothstep(0.06, 0.3, progress));
        ease(this.droneFilter.frequency, 240 + 260 * this.dawn + 40 * Math.sin(this.time * 0.15));
        ease(this.thirdGain.gain, 0.5 * this.dawn, 4);
        const melody = smoothstep(0.28, 0.6, progress);
        ease(this.melodyGain.gain, 0.22 * melody);

        // Melody phrases, closer together as the walk goes on and the light nears
        this.nextPhrase -= delta;
        if (melody > 0.02 && this.nextPhrase <= 0) {
            this.playPhrase();
            this.nextPhrase = (7 - 3.5 * progress) * (0.7 + Math.random() * 0.6);
        }
    }
}
