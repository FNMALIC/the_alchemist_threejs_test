// interactable.js - The contract between the interaction system and anything the player can notice.
//
// The interaction system never knows what a thing is. It only knows this shape:
//
//   id               unique name, for code and debugging (never shown to the player)
//   object           the Object3D in the world that the gaze can rest on (all its meshes count)
//   prompt           the word shown under the crosshair, e.g. 'Examine'
//   interactionType  what kind of interaction this is, e.g. 'examine', for later systems to read
//   maxDistance      how close the eye must be (metres); null uses the interaction system's distance
//   repeatable       whether holding E repeats the interaction (otherwise one press, one interaction)
//   cooldown         seconds after an interaction before E works on it again
//   highlight        whether the gentle focus highlight is shown (see focusHighlight.js)
//   enabled          false makes it ignored, as if it weren't there
//   dynamic          true if the object moves: its bounds then follow it every frame (cheaply);
//                    a static object is measured once, or again with updateBounds()
//
//   onFocus(context)   the gaze came to rest on it
//   onBlur(context)    the gaze left it
//   interact(context)  E was pressed while it was in focus. May return a promise: until it
//                      settles, the interaction is still going on and E is ignored.
//
// An interactable can also respond to the player's presence, like any reactive object in the
// environment (see src/environment/reactive.js): reactionRadius, response, onProximity,
// onLeaveProximity, onStepNearby, onLandNearby and the rest are kept as given, and the
// environment picks them up when the interactable is registered.
//
// context: { player, camera, scene, interaction, target, distance, point, eye, position,
//            direction, movementState } (see createContext in interaction.js)
import { Bounds } from './bounds.js';

export function createInteractable({
    id,
    object,
    prompt = 'Examine',
    interactionType = 'examine',
    maxDistance = null,
    repeatable = false,
    cooldown = 0.25,
    highlight = true,
    enabled = true,
    dynamic = false,
    onFocus = null,
    onBlur = null,
    interact = null,
    ...more // Anything else (e.g. how it responds to the player's presence) is kept as given
}) {
    if (!id) throw new Error('An interactable needs an id');
    if (!object?.isObject3D) throw new Error(`Interactable "${id}" needs an object in the world`);

    const tracker = new Bounds(object);
    return {
        ...more,
        id,
        object,
        prompt,
        interactionType,
        maxDistance,
        repeatable,
        cooldown,
        highlight,
        enabled,
        dynamic,
        onFocus,
        onBlur,
        interact,

        // Where it is and how big (a THREE.Sphere in world space): lets the gaze skip things that
        // are nowhere near the centre of the view without testing their triangles
        bounds: tracker.sphere,
        tracker,
        // Measure it again from its meshes (a static object that was moved or changed shape)
        updateBounds() {
            tracker.measure();
            return this;
        },
        // Carry the bounds along with the object (done every frame for dynamic objects)
        followBounds() {
            tracker.follow();
            return this;
        }
    };
}

export function isInteractable(value) {
    return Boolean(value?.object?.isObject3D && value.bounds?.isSphere && typeof value.updateBounds === 'function');
}
