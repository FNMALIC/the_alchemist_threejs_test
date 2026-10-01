// storm.js - One sandstorm, partway across the desert. It rises once you are well away from
// the oasis, lasts for a stretch of walking (or a minute if you stand still), then passes.

const STARTS_WITHIN = 100; // Metres from the light
const LENGTH_WALKED = 35; // Metres of walking it lasts
const LENGTH_SECONDS = 70; // ...or seconds, whichever comes first

const smoothstep = (edge0, edge1, x) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};

export class Storm {
    constructor() {
        this.state = 'waiting'; // waiting -> blowing -> passed
        this.walkedAtStart = 0;
        this.time = 0;
        this.intensity = 0;
    }

    // Returns the storm's intensity, 0 calm .. 1 full storm
    update(delta, distanceWalked, distanceToLight, canStart) {
        if (this.state === 'waiting' && canStart && distanceToLight < STARTS_WITHIN) {
            this.state = 'blowing';
            this.walkedAtStart = distanceWalked;
        }
        if (this.state !== 'blowing') return (this.intensity = 0);

        this.time += delta;
        const progress = Math.max((distanceWalked - this.walkedAtStart) / LENGTH_WALKED, this.time / LENGTH_SECONDS);
        if (progress >= 1) {
            this.state = 'passed';
            return (this.intensity = 0);
        }
        // Rises over the first fifth, holds, dies away over the last third
        this.intensity = smoothstep(0, 0.2, progress) * (1 - smoothstep(0.65, 1, progress));
        return this.intensity;
    }
}
