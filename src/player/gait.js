// gait.js - How the head moves while walking, based on human gait:
//
// - About 2 steps a second at a walk; walking faster mostly means quicker steps.
// - The head is lowest just after each heel strike (both feet on the ground)
//   and highest mid-step, when the body passes over the supporting leg.
// - It drifts a little toward the supporting foot: one full side-to-side cycle per two steps,
//   with a hint of roll.
// - Every offset goes through a critically damped spring, so the motion has weight and
//   lag instead of following a perfect sine wave, and no two steps are exactly alike.
import { spring } from './spring.js';

const BOB_HEIGHT = 0.032; // Metres between the lowest and highest point of a step at walking pace
const SWAY = 0.018; // Metres the head drifts over the supporting foot
const ROLL = 0.005; // Radians of roll toward the supporting foot (~0.3°)
const HEEL_STRIKE_DIP = 0.1; // Downward kick given to the head at each heel strike (m/s)

// Steps per second at a given walking speed (m/s)
export function cadence(speed) {
    return 1.1 + 0.4 * speed;
}

export class Gait {
    constructor() {
        this.phase = 0; // Counts steps; the fractional part is progress through the current step
        this.foot = 1; // Supporting foot: 1 right, -1 left
        this.stepVariation = 1; // Each step is slightly longer or shorter
        this.stepHeight = 1; // ... and slightly higher or lower

        this.amount = { x: 0, v: 0 }; // How much of the walking motion is applied (eases in and out)
        this.height = { x: 0, v: 0 };
        this.side = { x: 0, v: 0 };
        this.roll = { x: 0, v: 0 };
    }

    // A sudden downward push, e.g. landing from a jump (strength in m/s)
    impulse(strength) {
        this.height.v -= strength;
    }

    // speed: horizontal walking speed (m/s); walking: whether steps are being taken
    // effort: 0..1 how hard the going is (uphill sand makes steps heavier)
    // Returns true when a foot lands this frame.
    update(dt, speed, walking, effort = 0) {
        spring(this.amount, walking ? Math.min(1, speed / 2) : 0, 0.18, dt);

        let stepped = false;
        if (walking && speed > 0.15) {
            const previous = Math.floor(this.phase);
            this.phase += cadence(speed) * this.stepVariation * dt;
            if (Math.floor(this.phase) !== previous) {
                stepped = true;
                this.foot = -this.foot;
                this.stepVariation = 0.95 + Math.random() * 0.1;
                this.stepHeight = 0.85 + Math.random() * 0.3;
                this.height.v -= HEEL_STRIKE_DIP * this.amount.x * (1 + effort);
            }
        }

        // Height through one step: 0 at heel strike, 1 mid-step. Slightly skewed so the
        // rise after the heel strike is quicker than the fall before the next one.
        const p = this.phase % 1;
        const skewed = p + 0.06 * Math.sin(2 * Math.PI * p);
        const rise = 0.5 - 0.5 * Math.cos(2 * Math.PI * skewed);
        const bobScale = BOB_HEIGHT * this.stepHeight * (1 + 0.3 * effort) * (0.7 + 0.3 * Math.min(1, speed / 3));

        // Side-to-side: one full cycle every two steps, over the supporting foot
        const stride = Math.sin(Math.PI * this.phase);

        spring(this.height, rise * bobScale * this.amount.x, 0.05, dt);
        spring(this.side, stride * SWAY * this.amount.x, 0.12, dt);
        spring(this.roll, stride * ROLL * this.amount.x, 0.15, dt);

        return stepped;
    }

    get offsetY() {
        return this.height.x;
    }

    get offsetSide() {
        return this.side.x;
    }

    get rollAngle() {
        return this.roll.x;
    }
}
