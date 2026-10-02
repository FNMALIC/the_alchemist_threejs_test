// playerController.js - The player: a body that walks the sand, a head that looks around and
// moves with each step and breath.
//
//   PlayerController       input, and the order things happen in each frame
//    ├── PointerLock        captures the mouse (Esc releases it, a click locks it again)
//    ├── FirstPersonCamera  the mouse turns the body (yaw) and tilts the head (pitch)
//    ├── Movement           walking, hurrying, jumping and the sand physics
//    ├── MovementState      idle / walking / sprinting / sliding / jumping / falling / landing
//    ├── Breathing          one slow breath, felt in the head
//    ├── HeadBob            the head's motion: gait, breath, landing
//    └── Interaction        noticing things: gaze, focus, E to interact (src/interactions/)
//
// Everything else (footsteps, the story, interactable and reactive things) talks to the player
// through this class: position, state, slide, interaction, the pointer lock events, and what the
// body does: 'step' { step } and 'land' { strength } events (also the onStep / onLand hooks).
// The player never knows what is around it; the environment (src/environment/) listens instead.
import { EventDispatcher } from 'three';
import { PointerLock } from './pointerLock.js';
import { FirstPersonCamera } from './firstPersonCamera.js';
import { Movement, WALK_SPEED } from './movement.js';
import { MovementState } from './movementState.js';
import { Breathing } from './breathing.js';
import { HeadBob } from './headBob.js';
import { Interaction } from '../interactions/interaction.js';
import { TouchControls, isTouchDevice } from './touchControls.js';

const KEY_BINDINGS = {
    ArrowUp: 'forward',
    KeyW: 'forward',
    ArrowDown: 'backward',
    KeyS: 'backward',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ShiftLeft: 'hurry',
    ShiftRight: 'hurry'
};

const HURRY_EFFORT = 0.7; // How hard hurrying works the lungs (0..1; see breathing.js)

export class PlayerController extends EventDispatcher {
    // camera: the scene's camera, placed and pointed where the player starts
    // domElement: what the pointer locks to
    // world: { groundHeightAt, bounds, colliders, isUnderWater, isFirmGround } (see movement.js)
    // options: { scene, interaction: { distance, occlusion } } (see interaction.js)
    constructor(camera, domElement, world, { scene = null, interaction = {} } = {}) {
        super();
        this.camera = camera;
        this.touch = isTouchDevice();
        this.pointerLock = new PointerLock(domElement, { touch: this.touch });
        this.view = new FirstPersonCamera(camera);
        this.movement = new Movement(camera.position.clone(), world);
        this.state = new MovementState();
        this.breathing = new Breathing();
        this.head = new HeadBob();
        this.interaction = new Interaction(this, { scene, ...interaction });
        if (this.touch) this.touchControls = new TouchControls(this, domElement);

        // Hooks: onStep(step) when a foot lands, onLand(strength) after a jump (the 'step' and
        // 'land' events say the same, for any number of listeners)
        // step: { surface: 'sand' | 'water', intensity, speed, foot, x, z, heading, effort, downhill }
        this.onStep = null;
        this.onLand = null;
        this.sitting = null; // { yaw, time } while turning to face the view after sitting down

        this.pointerLock.onMove = (dx, dy) => this.view.look(dx, dy);
        this.pointerLock.addEventListener('unlock', () => this.releaseKeys());
        this.movement.onLand = strength => {
            this.state.land(strength);
            this.head.land(strength);
            this.onLand?.(strength);
            this.dispatchEvent({ type: 'land', strength });
        };

        // Keys typed into a text box (a note for the next traveller) are words, not steps
        const typing = event => event.target instanceof HTMLElement && event.target.closest('input, textarea');
        document.addEventListener('keydown', event => {
            if (typing(event)) return;
            this.setKey(event.code, true);
            if (event.code === 'Space') this.jump();
        });
        document.addEventListener('keyup', event => this.setKey(event.code, false));
        window.addEventListener('blur', () => this.releaseKeys()); // Keys let go in another window never come up
    }

    get isLocked() {
        return this.pointerLock.isLocked;
    }

    // Where the eyes are, without the head's motion
    get eye() {
        return this.movement.position;
    }

    // Where the player is: above the spot they stand on, at eye height (the same point as eye)
    get position() {
        return this.movement.position;
    }

    // Sliding velocity over the ground (x, z)
    get slide() {
        return this.movement.slide;
    }

    get sliding() {
        return this.movement.sliding;
    }

    // The sandstorm, 0 calm .. 1 full: slows the walk, pushes the body, shakes the head
    get storm() {
        return this.movement.storm;
    }

    set storm(value) {
        this.movement.storm = value;
        this.head.storm = value;
    }

    get seated() {
        return this.movement.seated !== null;
    }

    // Sit down at (x, z), and if (lookX, lookZ) is given, turn over a few seconds to face it.
    // Looking around stays free. A permanent seat has no getting up (the end of the journey).
    sit(x, z, lookX, lookZ, { permanent = true } = {}) {
        this.movement.sit(x, z);
        this.permanentSeat = permanent;
        this.sitting = lookX === undefined ? null : { yaw: Math.atan2(-(lookX - x), -(lookZ - z)), time: 0 };
        this.releaseKeys();
    }

    standUp() {
        if (!this.seated || this.permanentSeat) return;
        this.movement.standUp();
        this.sitting = null;
        this.dispatchEvent({ type: 'stand' });
    }

    lock() {
        this.pointerLock.lock();
    }

    setKey(code, pressed) {
        const action = KEY_BINDINGS[code];
        if (!action) return;
        // Starting to walk gets you up (unless it is the last seat)
        if (pressed && action !== 'hurry' && this.seated) this.standUp();
        this.movement.moving[action] = pressed;
    }

    releaseKeys() {
        const moving = this.movement.moving;
        Object.keys(moving).forEach(action => { moving[action] = false; });
    }

    jump() {
        if (this.isLocked && !this.seated) this.movement.jump();
    }

    // Stand on the ground where the camera is, at eye height
    placeOnGround() {
        this.movement.placeOnGround();
        this.view.update(0, this.eye, this.head);
    }

    update(delta) {
        const { movement, state, head } = this;

        // The body moves, then everything else follows from what it did
        movement.update(delta, this.view.yaw, this.isLocked);
        state.update(delta, movement);

        const sliding = movement.sliding;
        const walkSpeed = sliding ? 0 : movement.speed;
        this.breathing.update(delta, state.current === 'sprinting' ? HURRY_EFFORT : movement.effort);
        const stepped = head.update(
            delta, walkSpeed, movement.walking && !sliding, movement.effort, state.airborne, this.breathing.value
        );
        if (stepped) this.step(walkSpeed);

        if (this.sitting && this.sitting.time < 3) {
            this.sitting.time += delta;
            this.view.turnToward(this.sitting.yaw, 0.15, Math.min(1, delta * 1.2));
        }
        this.view.update(delta, movement.position, head);
        this.interaction.update(delta); // From where the eyes are now
    }

    // A foot landed: tell whoever listens (the sand, nearby plants)
    step(walkSpeed) {
        const { movement } = this;
        const { position, heading } = movement;
        const gradient = movement.slopeAt(position.x, position.z);
        const step = {
            surface: movement.wading ? 'water' : 'sand',
            intensity: Math.min(1, walkSpeed / WALK_SPEED),
            speed: walkSpeed, // m/s
            foot: this.head.gait.foot,
            x: position.x,
            z: position.z,
            heading: Math.atan2(heading.x, heading.y),
            effort: movement.effort,
            downhill: Math.max(0, -(gradient.x * heading.x + gradient.y * heading.y))
        };
        this.onStep?.(step);
        this.dispatchEvent({ type: 'step', step });
    }
}
