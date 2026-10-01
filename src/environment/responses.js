// responses.js - How things move when the player disturbs them. Procedural, not rigid-body
// physics: a few springs per object, which always come back to rest and then stop being updated.
//
// Every response has the same shape, so the environment can drive any of them:
//   push(dx, dz, strength)  a sudden push along the ground direction (dx, dz); strength about 0..1
//   lean(dx, dz, amount)    a steady pressure toward (dx, dz), amount 0..1 (a body close by); 0 lets go
//   update(delta)           moves the object; returns false once it is at rest again
//   reset()                 back to rest at once
//   settled()               a promise for the moment it is at rest
//   active                  whether it is moving, or being leaned on
//
// The pose it rests in is taken when it starts to move, so something moved elsewhere rests there.
// `duration` is roughly how many seconds a push takes to die away.
import * as THREE from 'three';
import { spring } from '../player/spring.js';

const SETTLE = 2 * Math.log(50); // An underdamped spring's sway falls to 2% after SETTLE / damping seconds
const MAX_STEP = 1 / 60; // Springs are stepped at least this finely, so stiff ones stay stable
const AT_REST = 1e-4;

// Underdamped spring, stepped semi-implicitly: kicked, it sways back and forth and settles
function oscillate(state, delta, stiffness, damping) {
    state.v += (-stiffness * state.x - damping * state.v) * delta;
    state.x += state.v * delta;
}

function still(state) {
    return Math.abs(state.x) < AT_REST && Math.abs(state.v) < AT_REST * 10;
}

class Response {
    constructor(object) {
        this.object = object;
        this.active = false;
        this.restPosition = new THREE.Vector3();
        this.restQuaternion = new THREE.Quaternion();
        this.waiting = []; // settled() promises
        this.axis = new THREE.Vector3(); // Reused
        this.turn = new THREE.Quaternion();
    }

    // Start moving from wherever the object is now
    wake() {
        if (this.active) return;
        this.restPosition.copy(this.object.position);
        this.restQuaternion.copy(this.object.quaternion);
        this.active = true;
    }

    // Back at rest: put it exactly where it was and stop
    sleep() {
        this.object.position.copy(this.restPosition);
        this.object.quaternion.copy(this.restQuaternion);
        this.active = false;
        const waiting = this.waiting;
        this.waiting = [];
        waiting.forEach(resolve => resolve());
    }

    settled() {
        return this.active ? new Promise(resolve => this.waiting.push(resolve)) : Promise.resolve();
    }

    // Tilt the object from its rest pose so its top moves toward (bx, bz) by |(bx, bz)| radians
    tilt(bx, bz) {
        const angle = Math.hypot(bx, bz);
        this.object.quaternion.copy(this.restQuaternion);
        if (angle < 1e-6) return;
        this.axis.set(bz, 0, -bx).divideScalar(angle); // up × direction
        this.object.quaternion.premultiply(this.turn.setFromAxisAngle(this.axis, angle));
    }
}

// A plant that bends about its base (its origin): it leans away from a player close by, easing in
// and out without bouncing, and a footstep or a touch makes it sway a few times and settle.
export class Sway extends Response {
    // stiffness: how quickly it springs back (higher: stiffer, quicker sway)
    // pushBend: radians a push of strength 1 bends it; leanBend: radians it leans at full lean
    // maxBend: radians it never bends past; leanEase: seconds for a lean to ease halfway in or out
    constructor(object, {
        stiffness = 60, duration = 1.6, pushBend = 0.12, leanBend = 0.18, maxBend = 0.3, leanEase = 0.35
    } = {}) {
        super(object);
        this.stiffness = stiffness;
        this.damping = SETTLE / duration;
        this.omega = Math.sqrt(stiffness);
        this.pushBend = pushBend;
        this.leanBend = leanBend;
        this.maxBend = maxBend;
        this.leanEase = leanEase;
        this.swayX = { x: 0, v: 0 };
        this.swayZ = { x: 0, v: 0 };
        this.leanX = { x: 0, v: 0 };
        this.leanZ = { x: 0, v: 0 };
        this.leanGoalX = 0;
        this.leanGoalZ = 0;
    }

    push(dx, dz, strength) {
        if (strength <= 0) return;
        this.wake();
        const speed = strength * this.pushBend * this.omega; // Sways out to about pushBend × strength
        this.swayX.v += dx * speed;
        this.swayZ.v += dz * speed;
    }

    lean(dx, dz, amount) {
        if (amount > 0) this.wake();
        this.leanGoalX = dx * amount * this.leanBend;
        this.leanGoalZ = dz * amount * this.leanBend;
    }

    update(delta) {
        if (!this.active) return false;
        const steps = Math.ceil(delta / MAX_STEP);
        const step = delta / steps;
        for (let i = 0; i < steps; i++) {
            oscillate(this.swayX, step, this.stiffness, this.damping);
            oscillate(this.swayZ, step, this.stiffness, this.damping);
        }
        spring(this.leanX, this.leanGoalX, this.leanEase, delta);
        spring(this.leanZ, this.leanGoalZ, this.leanEase, delta);

        let bx = this.leanX.x + this.swayX.x;
        let bz = this.leanZ.x + this.swayZ.x;
        const bend = Math.hypot(bx, bz);
        if (bend > this.maxBend) {
            bx *= this.maxBend / bend;
            bz *= this.maxBend / bend;
        }
        this.tilt(bx, bz);

        if (this.leanGoalX === 0 && this.leanGoalZ === 0 &&
            still(this.swayX) && still(this.swayZ) && still(this.leanX) && still(this.leanZ)) {
            this.reset();
            return false;
        }
        return true;
    }

    reset() {
        this.swayX.x = this.swayX.v = this.swayZ.x = this.swayZ.v = 0;
        this.leanX.x = this.leanX.v = this.leanZ.x = this.leanZ.v = 0;
        this.leanGoalX = this.leanGoalZ = 0;
        if (this.active) this.sleep();
    }
}

// A stone that rocks in its bed of sand: pushed, it tips away, lifts a few millimetres and shifts
// a little, then rocks back and settles where it was, within about a second.
export class Tip extends Response {
    // tipAngle: radians a push of strength 1 tips it; lift, shift: metres it rises and slides
    // ease: seconds for the lift and shift to ease halfway back
    constructor(object, {
        stiffness = 110, duration = 1.0, tipAngle = 0.06, lift = 0.012, shift = 0.015, ease = 0.12
    } = {}) {
        super(object);
        this.stiffness = stiffness;
        this.damping = SETTLE / duration;
        this.omega = Math.sqrt(stiffness);
        this.tipAngle = tipAngle;
        this.liftHeight = lift;
        this.shiftDistance = shift;
        this.ease = ease;
        // A critically damped spring kicked with speed v peaks at v / (e · 2ln2 / ease)
        this.kickToPeak = Math.E * (2 * Math.LN2) / ease;
        this.tipX = { x: 0, v: 0 };
        this.tipZ = { x: 0, v: 0 };
        this.lift = { x: 0, v: 0 };
        this.shiftX = { x: 0, v: 0 };
        this.shiftZ = { x: 0, v: 0 };
    }

    push(dx, dz, strength) {
        if (strength <= 0) return;
        this.wake();
        const tip = strength * this.tipAngle * this.omega;
        this.tipX.v += dx * tip;
        this.tipZ.v += dz * tip;
        this.lift.v += strength * this.liftHeight * this.kickToPeak;
        const shift = strength * this.shiftDistance * this.kickToPeak;
        this.shiftX.v += dx * shift;
        this.shiftZ.v += dz * shift;
    }

    lean() {} // Too heavy to lean away from anyone

    update(delta) {
        if (!this.active) return false;
        const steps = Math.ceil(delta / MAX_STEP);
        const step = delta / steps;
        for (let i = 0; i < steps; i++) {
            oscillate(this.tipX, step, this.stiffness, this.damping);
            oscillate(this.tipZ, step, this.stiffness, this.damping);
        }
        spring(this.lift, 0, this.ease, delta);
        spring(this.shiftX, 0, this.ease, delta);
        spring(this.shiftZ, 0, this.ease, delta);

        this.tilt(this.tipX.x, this.tipZ.x);
        this.object.position.set(
            this.restPosition.x + this.shiftX.x,
            this.restPosition.y + Math.max(0, this.lift.x),
            this.restPosition.z + this.shiftZ.x
        );

        if (still(this.tipX) && still(this.tipZ) && still(this.lift) && still(this.shiftX) && still(this.shiftZ)) {
            this.reset();
            return false;
        }
        return true;
    }

    reset() {
        this.tipX.x = this.tipX.v = this.tipZ.x = this.tipZ.v = 0;
        this.lift.x = this.lift.v = 0;
        this.shiftX.x = this.shiftX.v = this.shiftZ.x = this.shiftZ.v = 0;
        if (this.active) this.sleep();
    }
}
