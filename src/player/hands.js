// hands.js - The player's own hands at the bottom of the view.
//
// They hang from the camera, so they always move with the view, and are drawn in their own pass
// (see render.js) so they never sink into a palm trunk or a rock. Their motion comes from the
// player's movement state, gait and breath; they never look at the physics themselves.
// - standing: they rise and fall with the breath, with a faint drift that never repeats
// - walking: a gentle swing in time with the steps, one hand against the other; more when hurrying
// - turning: they trail a moment behind the view, as if they had weight
// - looking up at the sky: they sink out of view
// - jumping and falling: they lift a little; landing: they dip and settle
// - sliding down a dune: they ease outward, for balance
// - noticing something (an interactable in focus): they lift a touch, ready; the right hand opens
// - interacting: the right hand makes a small reach forward, pauses a moment as if touching,
//   gives a little at the contact, and comes back (not all the way to the object; just the
//   beginning of a gesture)
// - brushing past a plant: the hand on that side gives a tiny nudge
// Every motion goes through springs, so it eases in and out instead of snapping.
import * as THREE from 'three';
import { spring } from './spring.js';
import { createHandModel } from './handModel.js';
import { VIEW_MODEL_LAYER } from '../render.js';

// The hands' own lens: narrower than the world's, so they don't stretch toward the screen's edges
const FOV = 60;

// Where the right hand rests, in camera space (the left mirrors it)
// Relaxed: forearms coming up from below, palms turned mostly down, fingers loosely forward
const REST_POSITION = new THREE.Vector3(0.21, -0.235, -0.4);
const REST_ROTATION = new THREE.Euler(0.06, -0.06, 1.05);

// A faint light from over the shoulders that only the hands see. Under the moon the backs of the
// hands face away from the light and would be black; this keeps them just readable at night,
// and is lost under the world's own light once the sun is up.
const FILL_COLOR = 0x8c9cc4;
const FILL_INTENSITY = 0.6;

const TRAIL = 0.018; // Seconds the hands lag behind the turning view
const MAX_TURN_RATE = 4; // rad/s; faster turns don't swing the hands any further
const BREATH_RISE = 0.0035; // Metres the hands rise with a full breath
const BREATH_TILT = 0.008; // Radians they tip up with it
const WALK_SWING = 0.014; // Metres each hand swings forward and back at a walk
const WALK_TILT = 0.05; // Radians the hand tips with the swing
const DOMINANT = 1; // The right hand reaches out
const REACH_OUT = 0.18; // Seconds the reaching hand takes to get there...
const CONTACT_PAUSE = 0.14; // ...and rests there, touching, before it comes back
const REACH_DISTANCE = 0.075; // Metres it moves forward

// Indices into a pose's springs
const PX = 0, PY = 1, PZ = 2, RX = 3, RY = 4, RZ = 5;

// Eases an object toward its rest pose plus an offset (target), through six springs:
// position x, y, z and rotation x, y, z
class Pose {
    constructor(object, halfLife) {
        this.object = object;
        this.restPosition = object.position.clone();
        this.restRotation = object.rotation.clone();
        this.halfLife = halfLife;
        this.springs = Array.from({ length: 6 }, () => ({ x: 0, v: 0 }));
        this.target = new Float32Array(6);
    }

    // A sudden push along one axis (speed in m/s or rad/s)
    kick(axis, speed) {
        this.springs[axis].v += speed;
    }

    update(delta) {
        const { springs, target, restPosition: p, restRotation: r } = this;
        for (let i = 0; i < 6; i++) spring(springs[i], target[i], this.halfLife, delta);
        this.object.position.set(p.x + springs[PX].x, p.y + springs[PY].x, p.z + springs[PZ].x);
        this.object.rotation.set(r.x + springs[RX].x, r.y + springs[RY].x, r.z + springs[RZ].x);
    }
}

export class Hands {
    // camera: the player's camera (added to the scene); the hands become its children
    constructor(camera) {
        // Seen from the same place as the eyes, through the narrower lens
        this.camera = new THREE.PerspectiveCamera(FOV, camera.aspect, 0.01, 10);
        this.camera.layers.set(VIEW_MODEL_LAYER);
        camera.add(this.camera);

        // The rig carries what both hands share (breath, trailing the view, jumps and landings);
        // each hand adds its own swing and drift
        this.rig = new THREE.Group();
        camera.add(this.rig);
        this.rigPose = new Pose(this.rig, 0.09);
        this.right = this.createHand(1);
        this.left = this.createHand(-1);

        const fill = new THREE.DirectionalLight(FILL_COLOR, FILL_INTENSITY);
        fill.layers.set(VIEW_MODEL_LAYER);
        fill.position.set(0.2, 1, 0.8);
        fill.target.position.set(0, -0.2, -0.4);
        camera.add(fill, fill.target);

        this.time = 0;
        this.state = 'idle';
        this.hurry = { x: 0, v: 0 }; // Eases between walking and hurrying
        this.balance = { x: 0, v: 0 }; // Eases in while sliding
        this.ready = { x: 0, v: 0 }; // Eases in while something is in focus
        this.readyGoal = 0;
        this.reaching = { x: 0, v: 0 }; // 0 at rest .. 1 reached out
        this.reachTimer = 0;
        this.contactPending = false;
    }

    // side: 1 right, -1 left. In a hand's own space +x is outward for both.
    createHand(side) {
        const mirror = new THREE.Group();
        mirror.scale.x = side;
        this.rig.add(mirror);

        const hand = createHandModel();
        hand.position.copy(REST_POSITION);
        hand.rotation.copy(REST_ROTATION);
        hand.traverse(part => {
            part.layers.set(VIEW_MODEL_LAYER);
            part.receiveShadow = true; // The shade of a palm falls on them too
        });
        mirror.add(hand);

        // Each hand drifts on its own slow, unrelated rhythms
        const drift = Array.from({ length: 4 }, () => Math.random() * Math.PI * 2);
        return { side, pose: new Pose(hand, 0.07), drift };
    }

    // The feet touched down after a jump (strength 0..1): the hands dip, then settle
    land(strength) {
        this.rigPose.kick(PY, -(0.3 + 0.7 * strength));
        this.rigPose.kick(RX, -(0.2 + 0.4 * strength));
    }

    // Something can be interacted with (true) or not any more (false)
    setReady(ready) {
        this.readyGoal = ready ? 1 : 0;
    }

    // A small reach toward what is in focus, a moment's touch, and back
    reach() {
        this.reachTimer = REACH_OUT + CONTACT_PAUSE;
        this.contactPending = true;
    }

    // Brushed past something on this side (1 right, -1 left), strength 0..1
    brush(side, strength) {
        const { pose } = side === 1 ? this.right : this.left;
        const s = Math.min(1, strength);
        pose.kick(PX, -0.12 * s); // Gives inward (+x is outward for both hands)
        pose.kick(PY, 0.15 * s);
        pose.kick(RZ, 0.4 * s);
    }

    // state: MovementState; gait: the head's Gait (step rhythm); breath: Breathing.value;
    // view: FirstPersonCamera (pitch and turning speed)
    update(delta, state, gait, breath, view) {
        this.time += delta;
        const current = state.current;
        if (current !== this.state) {
            if (current === 'jumping') this.rigPose.kick(PY, 0.25); // Arms lift with the push off
            this.state = current;
        }
        spring(this.hurry, current === 'sprinting' ? 1 : 0, 0.3, delta);
        spring(this.balance, current === 'sliding' ? 1 : 0, 0.25, delta);
        spring(this.ready, this.readyGoal, 0.2, delta);
        this.reachTimer = Math.max(0, this.reachTimer - delta);
        if (this.contactPending && this.reachTimer <= CONTACT_PAUSE) {
            // The fingertips meet it: a tiny give back and down
            this.contactPending = false;
            const dominant = DOMINANT === 1 ? this.right : this.left;
            dominant.pose.kick(PZ, 0.12);
            dominant.pose.kick(RX, -0.6);
        }
        spring(this.reaching, this.reachTimer > 0 ? 1 : 0, 0.08, delta);

        this.updateRig(delta, state, gait, breath, view);
        this.updateHand(this.right, delta, gait);
        this.updateHand(this.left, delta, gait);
    }

    updateRig(delta, state, gait, breath, view) {
        const target = this.rigPose.target;
        const turnYaw = THREE.MathUtils.clamp(view.turnRate.x, -MAX_TURN_RATE, MAX_TURN_RATE);
        const turnPitch = THREE.MathUtils.clamp(view.turnRate.y, -MAX_TURN_RATE, MAX_TURN_RATE);
        const lookingUp = THREE.MathUtils.smoothstep(view.pitch, 0.25, 1.1);
        const lookingDown = THREE.MathUtils.smoothstep(-view.pitch, 0.3, 1.2);
        const air = state.current === 'jumping' ? 1 : state.current === 'falling' ? 1.5 : 0;
        const ready = this.ready.x;

        target[PX] = 0;
        // The hands rise and fall with the body at each step, but lag the head a little
        target[PY] = breath * BREATH_RISE + 0.012 * air - 0.25 * gait.offsetY + 0.005 * ready;
        target[PZ] = -0.002 * breath - 0.006 * ready;
        // Turning: rotate about the eye against the turn, so the hands trail behind it
        target[RX] = breath * BREATH_TILT + 0.04 * air - turnPitch * TRAIL - 0.4 * lookingUp + 0.08 * lookingDown +
            0.02 * ready;
        target[RY] = -turnYaw * TRAIL;
        target[RZ] = 0;
        this.rigPose.update(delta);
    }

    updateHand({ side, pose, drift }, delta, gait) {
        const target = pose.target;
        const t = this.time;
        const hurry = this.hurry.x;
        const balance = this.balance.x;
        // Only the dominant hand opens and reaches toward what is in focus
        const ready = side === DOMINANT ? this.ready.x : 0;
        const reach = side === DOMINANT ? this.reaching.x : 0;

        // One full swing every two steps, each arm against the leg on its side
        const swing = Math.sin(Math.PI * gait.phase) * side * gait.amount.x;
        const stride = WALK_SWING * (1 + 0.6 * hurry);

        target[PX] = -0.008 * hurry + 0.025 * balance - 0.025 * reach +
            0.0012 * (Math.sin(t * 0.31 + drift[0]) + 0.6 * Math.sin(t * 0.173 + drift[1]));
        target[PY] = swing * stride * 0.35 + 0.012 * hurry - 0.004 * balance + 0.004 * ready + 0.03 * reach +
            0.001 * (Math.sin(t * 0.27 + drift[2]) + 0.5 * Math.sin(t * 0.119 + drift[3]));
        target[PZ] = -swing * stride - 0.006 * ready - REACH_DISTANCE * reach;
        target[RX] = swing * WALK_TILT * (1 + 0.5 * hurry) + 0.06 * hurry + 0.1 * reach +
            0.005 * Math.sin(t * 0.37 + drift[1]);
        target[RY] = 0;
        // The palm turns a little inward, open toward the thing
        target[RZ] = 0.25 * balance - 0.06 * ready - 0.35 * reach + 0.006 * Math.sin(t * 0.21 + drift[2]);
        pose.update(delta);
    }
}
