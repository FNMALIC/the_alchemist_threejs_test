// headBob.js - How the head moves on top of the eye position:
// - walking: the gait (see gait.js): rise and fall with each step, drift and roll over the
//   supporting foot, a little stronger and quicker when hurrying; it eases out in the air
// - standing still: only the faint rise and fall of breathing
// - landing: the knees give (a dip) and the head nods slightly, then settles
// Everything is a few millimetres or a fraction of a degree: it should be felt, not seen.
import { Gait } from './gait.js';
import { spring } from './spring.js';

const BREATH_HEIGHT = 0.0025; // Metres the head rises with a full breath
const BREATH_PITCH = 0.0018; // Radians the head tips back with a full breath (~0.1°)
const LANDING_NOD = 0.35; // Downward pitch speed (rad/s) a hard landing gives the head (peaks under 1°)

export class HeadBob {
    constructor() {
        this.gait = new Gait();
        this.stillness = { x: 1, v: 0 }; // 1 standing still (breathing shows), 0 walking or in the air
        this.nod = { x: 0, v: 0 };
        this.storm = 0; // 0 calm .. 1 sandstorm: the wind buffets the head
        this.time = 0;

        // The motion, read by the camera
        this.offsetY = 0;
        this.offsetSide = 0;
        this.pitch = 0;
        this.roll = 0;
    }

    // The feet touched down after a jump (strength 0..1)
    land(strength) {
        this.gait.impulse(0.6 + strength * 0.8); // Knees absorb the landing
        this.nod.v -= LANDING_NOD * (0.3 + strength);
    }

    // speed: walking speed (m/s); walking: whether steps are being taken; effort: 0..1;
    // airborne: in the air; breath: Breathing.value. Returns true when a foot lands this frame.
    update(delta, speed, walking, effort, airborne, breath) {
        const stepped = this.gait.update(delta, speed, walking, effort);
        spring(this.stillness, walking || airborne ? 0 : 1, 0.4, delta);
        spring(this.nod, 0, 0.12, delta);

        const breathing = breath * this.stillness.x;
        this.offsetY = this.gait.offsetY + breathing * BREATH_HEIGHT;
        this.offsetSide = this.gait.offsetSide;
        this.pitch = this.nod.x + breathing * BREATH_PITCH;
        this.roll = this.gait.rollAngle;

        // Buffeted by the storm: small, uneven shakes
        this.time += delta;
        if (this.storm > 0) {
            const t = this.time;
            const buffet = this.storm * (Math.sin(t * 13.1) * Math.sin(t * 2.3) + 0.5 * Math.sin(t * 7.7));
            this.offsetY += buffet * 0.012;
            this.roll += buffet * 0.006;
        }
        return stepped;
    }
}
