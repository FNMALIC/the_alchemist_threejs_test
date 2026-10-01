// interaction.js - Noticing things: look at something, it comes into focus, press E to interact.
//
//   none ──gaze rests on a registered thing──▶ focused ──E──▶ interacting
//    ▲                                            │  ▲              │
//    └──────look away / out of reach / Esc────────┘  └─it's done────┘
//
// The system never knows what anything is: it finds the interactable under the crosshair
// (gaze.js), shows a gentle highlight (focusHighlight.js) and calls the interactable's own
// onFocus / onBlur / interact (interactable.js). Everything else listens to its events:
//
//   'focus'        { interactable, context }   the gaze came to rest on something
//   'blur'         { interactable, context }   ...and left it
//   'targetchange' { interactable, previous }  after either (interactable is null when nothing is in focus)
//   'interact'     { interactable, context }   E was pressed; the interactable's interact() runs next
//   'interactend'  { interactable }            its interaction is over (at once, or when its promise settles)
//
// (Three's EventDispatcher uses event.target for itself, hence 'interactable'.)
//
// It only works while the pointer is locked: on Esc the target is let go and E is ignored; once
// the pointer is locked again, the gaze picks up wherever it rests.
//
// Solid things hide what is behind them (occlusion.js): this.occlusion can be switched off
// (occlusion.enabled = false) or given more blockers (occlusion.addBlocker(object)).
import * as THREE from 'three';
import { Gaze } from './gaze.js';
import { Occlusion } from './occlusion.js';
import { FocusHighlight } from './focusHighlight.js';
import { InteractionRegistry } from './interactionRegistry.js';

const INTERACT_KEY = 'KeyE';
export const DEFAULT_INTERACTION_DISTANCE = 3; // Metres from the eye

export class Interaction extends THREE.EventDispatcher {
    // player: PlayerController (camera, pointer lock, state, eye)
    // options: { scene, distance, occlusion }
    //   distance: how far the eye reaches, in metres
    //   occlusion: { blockers, groundHeightAt } what hides things from view (see occlusion.js)
    constructor(player, { scene = null, distance = DEFAULT_INTERACTION_DISTANCE, occlusion = {} } = {}) {
        super();
        this.player = player;
        this.camera = player.camera;
        this.scene = scene;

        this.registry = new InteractionRegistry();
        this.occlusion = new Occlusion(occlusion);
        this.gaze = new Gaze({ distance, occlusion: this.occlusion });
        this.highlight = new FocusHighlight();

        this.target = null; // The interactable in focus
        this.targetDistance = Infinity; // Metres from the eye to the point looked at
        this.targetPoint = new THREE.Vector3();
        this.active = null; // The interactable whose interaction is still going on
        this.time = 0; // Seconds, for cooldowns
        this.lastInteraction = new WeakMap(); // interactable -> this.time of its last interaction

        this.registry.addEventListener('remove', ({ interactable }) => {
            if (interactable === this.target) this.setTarget(null);
            this.highlight.forget(interactable);
        });
        player.pointerLock.addEventListener('unlock', () => this.setTarget(null));
        document.addEventListener('keydown', event => {
            if (event.code !== INTERACT_KEY || event.ctrlKey || event.metaKey || event.altKey) return;
            this.trigger({ repeat: event.repeat });
        });
    }

    // How far the eye reaches (metres)
    get distance() {
        return this.gaze.distance;
    }

    set distance(metres) {
        this.gaze.distance = metres;
    }

    // 'none', 'focused' or 'interacting'
    get state() {
        if (this.active) return 'interacting';
        return this.target ? 'focused' : 'none';
    }

    // interactable: from createInteractable(), or its options. Returns the interactable.
    register(interactable) {
        return this.registry.register(interactable);
    }

    unregister(interactable) {
        return this.registry.unregister(interactable);
    }

    clear() {
        this.registry.clear();
    }

    getTarget() {
        return this.target;
    }

    isFocused(interactable) {
        return interactable !== null && this.target === interactable;
    }

    update(delta) {
        this.time += delta;
        this.highlight.update(delta);
        if (!this.player.isLocked) return; // Esc already let go of the target

        this.camera.updateMatrixWorld(); // The camera was just moved this frame
        const hit = this.gaze.find(this.camera, this.registry, this.target);
        if (hit && hit.interactable === this.target) {
            this.measure(hit);
            return;
        }
        this.setTarget(hit ? hit.interactable : null, hit);
    }

    measure(hit) {
        this.targetDistance = hit.distance;
        this.targetPoint.copy(hit.point);
    }

    // next: the interactable to focus, or null; hit: where the gaze meets it, if known
    setTarget(next, hit = null) {
        const previous = this.target;
        if (next === previous) return;

        if (previous) {
            this.highlight.hide(previous);
            const context = this.createContext(previous); // With where it was last seen
            previous.onBlur?.(context);
            this.dispatchEvent({ type: 'blur', interactable: previous, context });
        }

        this.target = next;
        if (hit) {
            this.measure(hit);
        } else if (next) { // Focused from code rather than by the gaze
            this.targetPoint.copy(next.bounds.center);
            this.targetDistance = this.targetPoint.distanceTo(this.camera.position);
        } else {
            this.targetDistance = Infinity;
        }

        if (next) {
            if (next.highlight) this.highlight.show(next);
            const context = this.createContext(next);
            next.onFocus?.(context);
            this.dispatchEvent({ type: 'focus', interactable: next, context });
        }
        this.dispatchEvent({ type: 'targetchange', interactable: next, previous });
    }

    // Interact with what is in focus (E, or any other input later). repeat: the key is being held.
    // Returns whether an interaction started. Ignored while its last interaction is still going
    // on or cooling down, and for a held key unless the interactable is repeatable.
    trigger({ repeat = false } = {}) {
        const target = this.target;
        if (!this.player.isLocked || !target || !target.interact || this.active) return false;
        if (repeat && !target.repeatable) return false;
        const last = this.lastInteraction.get(target);
        if (last !== undefined && this.time - last < (target.cooldown ?? 0)) return false;

        const context = this.createContext(target);
        this.active = target;
        this.dispatchEvent({ type: 'interact', interactable: target, context });

        const finish = () => {
            if (this.active !== target) return;
            this.active = null;
            this.lastInteraction.set(target, this.time); // The cooldown starts once it's over
            this.dispatchEvent({ type: 'interactend', interactable: target });
        };

        let result;
        try {
            result = target.interact(context);
        } catch (error) {
            finish();
            throw error;
        }
        if (typeof result?.then === 'function') {
            result.then(finish, error => {
                finish();
                console.error(`Interaction with "${target.id}" failed`, error);
            });
        } else {
            finish();
        }
        return true;
    }

    // What an interactable is told when something happens to it
    createContext(interactable) {
        const { player, camera } = this;
        const inFocus = interactable === this.target;
        const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
        return {
            player,
            camera,
            scene: this.scene,
            interaction: this,
            target: interactable,
            distance: inFocus ? this.targetDistance : eye.distanceTo(interactable.bounds.center),
            point: inFocus ? this.targetPoint.clone() : interactable.bounds.center.clone(),
            eye, // Where the eyes are (with the head's motion)
            position: player.eye.clone(), // Where the player stands, at eye height
            direction: camera.getWorldDirection(new THREE.Vector3()), // Which way they are looking
            movementState: player.state.current
        };
    }
}
