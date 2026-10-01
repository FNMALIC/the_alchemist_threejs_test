// breathing.js - One slow, uneven breath that the head follows.
//
// Breathing in is quicker than breathing out, with a short pause before the next breath. Each
// breath is a little longer or shorter, deeper or shallower than the last, so it never loops.
// Hurrying or a hard climb makes breathing quicker and deeper; it settles again over the next
// half a minute or so.

const RESTING_RATE = 0.2; // Breaths per second at rest (12 a minute)
const EXERTED_RATE = 0.45; // ...and when out of breath
const INHALE = 0.38; // Fraction of a breath spent breathing in
const EXHALE_END = 0.85; // Then breathing out until here, and a pause until the next breath
const CATCH_BREATH = 0.15; // How quickly exertion builds (per second)...
const RECOVER = 0.04; // ...and fades

export class Breathing {
    constructor() {
        this.phase = Math.random(); // Progress through the current breath, 0..1
        this.length = 1; // This breath's length (multiplier)
        this.depth = 1; // This breath's depth (multiplier)
        this.exertion = 0; // 0..1
        this.value = 0; // 0 breathed out .. ~1 a full breath in (deeper when out of breath)
    }

    // effort: 0..1 how hard the body is working right now
    update(delta, effort) {
        const rate = effort > this.exertion ? CATCH_BREATH : RECOVER;
        this.exertion += (effort - this.exertion) * Math.min(1, delta * rate);

        const breathsPerSecond = RESTING_RATE + (EXERTED_RATE - RESTING_RATE) * this.exertion;
        this.phase += (breathsPerSecond / this.length) * delta;
        if (this.phase >= 1) {
            this.phase %= 1;
            this.length = 0.85 + Math.random() * 0.3;
            this.depth = 0.75 + Math.random() * 0.5;
        }

        const p = this.phase;
        let air = 0; // 0..1 how full the lungs are
        if (p < INHALE) air = 0.5 - 0.5 * Math.cos(Math.PI * p / INHALE);
        else if (p < EXHALE_END) air = 0.5 + 0.5 * Math.cos(Math.PI * (p - INHALE) / (EXHALE_END - INHALE));
        this.value = air * this.depth * (1 + 0.8 * this.exertion);
    }
}
