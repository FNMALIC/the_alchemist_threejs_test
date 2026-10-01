// movementState.js - What the body is doing right now, worked out once per frame from the movement.
// The head (and later interactions and the story) react to this one state
// instead of each re-deriving it from the physics.
//
//   idle       standing (or pushing against something without getting anywhere)
//   walking    stepping under the player's control
//   sprinting  stepping with Shift held
//   sliding    carried down a dune face by the sand
//   jumping    rising after a jump
//   falling    coming back down
//   landing    the moment the knees take the landing, then back to one of the above
//
// Listen for changes with addEventListener('change', ({ state, previous }) => ...).
import { EventDispatcher } from 'three';

export const MOVEMENT_STATES = Object.freeze([
    'idle', 'walking', 'sprinting', 'sliding', 'jumping', 'falling', 'landing'
]);

const MIN_STEPPING_SPEED = 0.15; // m/s; slower than this the feet aren't really stepping (as in the gait)
const LANDING_TIME = 0.15; // Seconds a soft landing lasts...
const HARD_LANDING_TIME = 0.2; // ...plus this much more for the hardest one

export class MovementState extends EventDispatcher {
    constructor() {
        super();
        this.current = 'idle';
        this.previous = 'idle';
        this.time = 0; // Seconds in the current state
        this.landingStrength = 0; // 0..1, of the most recent landing
        this.landingTimer = 0;
        this.changeEvent = { type: 'change', state: 'idle', previous: 'idle' }; // Reused for every change
    }

    get airborne() {
        return this.current === 'jumping' || this.current === 'falling';
    }

    // The feet touched down after a jump (strength 0..1)
    land(strength) {
        this.landingStrength = strength;
        this.landingTimer = LANDING_TIME + HARD_LANDING_TIME * strength;
    }

    // movement: the Movement, after it has moved this frame
    update(delta, movement) {
        this.landingTimer = Math.max(0, this.landingTimer - delta);
        const next = this.resolve(movement);
        if (next === this.current) {
            this.time += delta;
            return;
        }

        this.previous = this.current;
        this.current = next;
        this.time = 0;
        this.changeEvent.state = next;
        this.changeEvent.previous = this.previous;
        this.dispatchEvent(this.changeEvent);
    }

    resolve(movement) {
        if (!movement.grounded) return movement.verticalSpeed > 0 ? 'jumping' : 'falling';
        if (this.landingTimer > 0) return 'landing';
        if (movement.sliding) return 'sliding';
        if (movement.walking && movement.speed > MIN_STEPPING_SPEED) {
            return movement.moving.hurry ? 'sprinting' : 'walking';
        }
        return 'idle';
    }
}
