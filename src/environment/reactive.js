// reactive.js - The contract for things in the world that respond to the player's presence: a
// flower that leans away as you pass, a shrub that rustles at your footsteps, a stone that rocks
// when touched. Nothing in the player knows about them: the environment tells each one what the
// player is doing nearby, and it decides how to respond.
//
//   id, object        a name (for code and debugging) and the Object3D in the world
//   reactionRadius    metres along the ground within which the player is "near" (enter / leave)
//   stepRadius        footsteps and landings within this many metres are felt (default 1.6 × reactionRadius)
//   response          how it moves (responses.js: Sway, Tip), or null for none
//   responseStrength  scales every movement
//   lean              how much it leans away while the player is near (0: not at all)
//   stepStrength      how much a nearby footstep moves it; landStrength, likewise for a landing
//   interactStrength  how much it moves when interacted with (E), if it is also an interactable
//   sand              how much sand it moves when it moves (0: none)
//   sound             what its movement sounds like, for the audio hooks: 'rustle', 'stone' or null
//   loudness          0..1 how loud that is
//   particles         what it sheds when moved: 'motes' (pollen), 'flakes' (dry bits) or null
//   cooldown          seconds before footsteps or landings can move it again
//   dynamic           it moves around: its position is followed every frame
//   enabled           false: ignored, as if it weren't there
//
//   onProximity(context)       the player came near
//   onLeaveProximity(context)  ...and moved away
//   onStepNearby(context)      a footstep landed close by (context.step, context.strength)
//   onLandNearby(context)      the player landed from a jump close by
//
// context: { player, environment, reactive, object, distance, direction (from the player toward
//            it, along the ground), strength, position, movementState, step }
//
// react(dx, dz, strength) gives it a push; reset() puts it back at rest at once.
import { Bounds } from '../interactions/bounds.js';

export const REACTIVE_HOOKS = ['onProximity', 'onLeaveProximity', 'onStepNearby', 'onLandNearby'];

// Whether a definition (e.g. an interactable's) asks to respond to the player's presence
export function wantsToReact(definition) {
    return Boolean(definition.response || definition.reactionRadius ||
        REACTIVE_HOOKS.some(hook => typeof definition[hook] === 'function'));
}

export function createReactive({
    id,
    object,
    reactionRadius = 1.2,
    stepRadius = null,
    response = null,
    responseStrength = 1,
    lean = 1,
    stepStrength = 1,
    landStrength = 1,
    interactStrength = 0,
    sand = 0,
    sound = null,
    loudness = 1,
    particles = null,
    cooldown = 0.12,
    dynamic = false,
    enabled = true,
    onProximity = null,
    onLeaveProximity = null,
    onStepNearby = null,
    onLandNearby = null,
    tracker = null, // Bounds shared with an interactable for the same object
    interactable = null // The interactable this was made for, if any
}) {
    if (!id) throw new Error('A reactive object needs an id');
    if (!object?.isObject3D) throw new Error(`Reactive object "${id}" needs an object in the world`);

    const bounds = tracker ?? new Bounds(object);
    return {
        isReactive: true,
        id,
        object,
        reactionRadius,
        stepRadius: stepRadius ?? reactionRadius * 1.6,
        response,
        responseStrength,
        lean,
        stepStrength,
        landStrength,
        interactStrength,
        sand,
        sound,
        loudness,
        particles,
        cooldown,
        dynamic,
        enabled,
        onProximity,
        onLeaveProximity,
        onStepNearby,
        onLandNearby,
        interactable,

        bounds: bounds.sphere, // World space; its centre is where it stands
        tracker: bounds,
        inside: false, // The player is near (kept by the environment)
        updating: false, // Its response is being updated (kept by the environment)
        lastReaction: -Infinity,

        updateBounds() {
            bounds.measure();
            return this;
        },
        followBounds() {
            bounds.follow();
            return this;
        },
        // A push along the ground direction (dx, dz), strength 0..1 (scaled by responseStrength)
        react(dx, dz, strength) {
            this.response?.push(dx, dz, strength * this.responseStrength);
        },
        reset() {
            this.response?.reset();
        }
    };
}
