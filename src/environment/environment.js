// environment.js - The world noticing the player. The player only reports what it does (its steps,
// its landings, where it stands, what it touches); the environment works out which reactive things
// are near enough to feel it, and lets each respond in its own way (reactive.js).
//
//   Environment
//    ├── reactives    registered things that respond, sorted into a SpatialGrid on the ground
//    ├── proximity    who the player is near: enter / leave once each, and a steady lean while near
//    ├── responses    physical motion (responses.js), updated only while something is moving
//    ├── sand         the sand under the feet (sandResponse.js)
//    └── particles    dust, pollen, dry bits (particles.js)
//
// Interactables that ask to respond to the player's presence (reactionRadius, response,
// onProximity, ...) take part automatically while registered with the interaction system.
//
// Events, as hooks for sound and anything else later (only when something happens, never per frame):
//   'playerenter'  { reactive, context }   the player came within its reactionRadius
//   'playerleave'  { reactive, context }   ...and moved away again
//   'stepnearby'   { reactive, context }   a footstep landed within its stepRadius
//   'landnearby'   { reactive, context }   a landing from a jump, likewise
//   'react'        { reactive, cause, strength, position }   it was moved: 'proximity', 'step', 'land' or 'interact'
//   'sand'         { cause, strength, position }   sand was disturbed: 'step', 'land' or 'interact'
import * as THREE from 'three';
import { SpatialGrid } from './spatialGrid.js';
import { createReactive, wantsToReact } from './reactive.js';
import { Particles } from './particles.js';
import { SandResponse } from './sandResponse.js';
import { WALK_SPEED } from '../player/movement.js';

const LEAVE_FACTOR = 1.15; // The player has to be this much further away to leave than to enter
const BRUSH_DISTANCE = 0.55; // Metres: a step this close to something that brushes moves the hands
const LAND_REACH = 1.3; // A landing is felt this much further than a footstep

export class Environment extends THREE.EventDispatcher {
    // player: PlayerController; world: World; scene: where the particles go; low: low quality
    constructor({ player, world, scene, low = false }) {
        super();
        this.player = player;
        this.world = world;
        this.scene = scene;
        this.low = low;
        this.time = 0;

        this.grid = new SpatialGrid();
        this.reactives = []; // Everything registered
        this.dynamic = []; // ...of which these move around
        this.near = []; // ...these the player is near
        this.moving = []; // ...these have a response in motion
        this.found = []; // Reused for grid queries
        this.fromInteractable = new Map(); // interactable -> the reactive made for it
        this.maxReactionRadius = 0;
        this.maxStepRadius = 0;

        this.particles = new Particles({ groundHeightAt: world.heightAt, low });
        scene.add(this.particles.points);
        this.sand = new SandResponse(world, this.particles, { low });
        this.light = new THREE.Color(); // Reused: how the scene is lit, for the particles
        this.direction = { x: 0, z: 0 }; // Reused: a direction along the ground

        // What the player does
        player.addEventListener('step', ({ step }) => this.handleStep(step));
        player.addEventListener('land', ({ strength }) => this.handleLand(strength));

        // Interactables that respond to the player's presence
        const interaction = player.interaction;
        interaction.registry.items.forEach(item => this.adopt(item));
        interaction.registry.addEventListener('add', ({ interactable }) => this.adopt(interactable));
        interaction.registry.addEventListener('remove', ({ interactable }) => this.release(interactable));
        interaction.addEventListener('interact', ({ interactable, context }) => this.handleInteract(interactable, context));
    }

    // reactive: from createReactive(), or its options. Returns the reactive.
    registerReactive(reactive) {
        const item = reactive?.isReactive ? reactive : createReactive(reactive);
        if (this.reactives.includes(item)) return item;
        item.updateBounds();
        item.inside = false;
        item.updating = false;
        this.reactives.push(item);
        if (item.dynamic) this.dynamic.push(item);
        this.grid.insert(item, item.bounds.center.x, item.bounds.center.z);
        this.maxReactionRadius = Math.max(this.maxReactionRadius, item.reactionRadius * LEAVE_FACTOR);
        this.maxStepRadius = Math.max(this.maxStepRadius, item.stepRadius * LAND_REACH);
        return item;
    }

    // Forget it, and put it back at rest at once (no animation carries on after it's gone)
    unregisterReactive(reactive) {
        const index = this.reactives.indexOf(reactive);
        if (index === -1) return false;
        this.reactives.splice(index, 1);
        remove(this.dynamic, reactive);
        remove(this.near, reactive);
        remove(this.moving, reactive);
        this.grid.remove(reactive);
        reactive.reset();
        reactive.inside = false;
        reactive.updating = false;
        return true;
    }

    adopt(interactable) {
        if (!wantsToReact(interactable) || this.fromInteractable.has(interactable)) return;
        const reactive = createReactive({ ...interactable, tracker: interactable.tracker, interactable });
        this.fromInteractable.set(interactable, this.registerReactive(reactive));
    }

    release(interactable) {
        const reactive = this.fromInteractable.get(interactable);
        if (!reactive) return;
        this.fromInteractable.delete(interactable);
        this.unregisterReactive(reactive);
    }

    // The reactive made for an interactable, if it responds to the player's presence
    reactiveFor(interactable) {
        return this.fromInteractable.get(interactable) ?? null;
    }

    update(delta) {
        this.time += delta;
        const position = this.player.position;

        // Things that move carry their bounds (and grid cell) along
        for (const item of this.dynamic) {
            item.followBounds();
            this.grid.move(item, item.bounds.center.x, item.bounds.center.z);
        }

        this.updateProximity(position);

        // Only what is moving is updated; it drops out once it has settled
        for (let i = this.moving.length - 1; i >= 0; i--) {
            const item = this.moving[i];
            if (!item.response.update(delta)) {
                item.updating = false;
                this.moving.splice(i, 1);
            }
        }

        this.sand.slide(delta, position.x, position.z, this.player.slide);
        this.updateLight();
        this.particles.update(delta);
    }

    updateProximity(position) {
        // Coming near
        const found = this.grid.query(position.x, position.z, this.maxReactionRadius, this.found);
        for (const item of found) {
            if (item.inside || !item.enabled) continue;
            const distance = this.distanceTo(item, position);
            if (distance < item.reactionRadius) this.enter(item, distance);
        }
        found.length = 0;

        // Staying near (a steady lean away), or moving away
        for (let i = this.near.length - 1; i >= 0; i--) {
            const item = this.near[i];
            const distance = this.distanceTo(item, position);
            if (!item.enabled || distance > item.reactionRadius * LEAVE_FACTOR) {
                this.leave(item, distance);
            } else if (item.response && item.lean > 0) {
                const closeness = 1 - Math.min(1, distance / item.reactionRadius);
                const amount = item.lean * item.responseStrength * closeness * closeness * (3 - 2 * closeness);
                const { x, z } = this.directionTo(item, position);
                item.response.lean(x, z, amount);
                this.keepMoving(item);
            }
        }
    }

    enter(item, distance) {
        item.inside = true;
        this.near.push(item);
        const context = this.createContext(item, distance);
        item.onProximity?.(context);
        this.dispatchEvent({ type: 'playerenter', reactive: item, context });
        if (item.response && item.lean > 0) this.effects(item, 'proximity', 0.2 * item.lean, null);
    }

    leave(item, distance) {
        item.inside = false;
        remove(this.near, item);
        item.response?.lean(0, 0, 0); // Eases back to rest
        const context = this.createContext(item, distance);
        item.onLeaveProximity?.(context);
        this.dispatchEvent({ type: 'playerleave', reactive: item, context });
    }

    handleStep(step) {
        const disturbed = this.sand.step(step);
        if (disturbed > 0) this.dispatchSand('step', disturbed, step.x, this.world.heightAt(step.x, step.z), step.z);

        // Hurrying steps land harder
        const pace = THREE.MathUtils.clamp((step.speed ?? WALK_SPEED) / WALK_SPEED, 0.4, 1.7);
        const force = 0.45 + 0.35 * pace;
        const travelX = Math.sin(step.heading), travelZ = Math.cos(step.heading);

        const found = this.grid.query(step.x, step.z, this.maxStepRadius, this.found);
        for (const item of found) {
            if (!item.enabled || this.time - item.lastReaction < item.cooldown) continue;
            const dx = item.bounds.center.x - step.x, dz = item.bounds.center.z - step.z;
            const distance = Math.hypot(dx, dz);
            if (distance > item.stepRadius) continue;
            const falloff = (1 - distance / item.stepRadius) ** 2;
            const strength = falloff * force * item.stepStrength;
            if (strength < 0.02 && !item.onStepNearby) continue;

            item.lastReaction = this.time;
            // Pushed away from the foot, and a little along the way the player is going
            const direction = this.blend(dx, dz, distance, travelX, travelZ);
            if (item.response && strength >= 0.02) {
                item.react(direction.x, direction.z, strength);
                this.keepMoving(item);
                this.effects(item, 'step', strength, direction);
            }
            if (item.brushes && distance < BRUSH_DISTANCE) this.brushHands(item, strength);

            const context = this.createContext(item, distance, strength, step);
            item.onStepNearby?.(context);
            this.dispatchEvent({ type: 'stepnearby', reactive: item, context });
        }
        found.length = 0;
    }

    handleLand(strength) {
        const { x, z } = this.player.position;
        const disturbed = this.sand.land(strength, x, z);
        this.dispatchSand('land', disturbed, x, this.world.heightAt(x, z), z);

        const found = this.grid.query(x, z, this.maxStepRadius, this.found);
        for (const item of found) {
            if (!item.enabled) continue;
            const reach = item.stepRadius * LAND_REACH;
            const distance = this.distanceTo(item, this.player.position);
            if (distance > reach) continue;
            const felt = (1 - distance / reach) ** 2 * (0.5 + strength) * item.landStrength;
            item.lastReaction = this.time;
            if (item.response && felt >= 0.02) {
                const direction = this.directionTo(item, this.player.position);
                item.react(direction.x, direction.z, felt);
                this.keepMoving(item);
                this.effects(item, 'land', felt, direction);
            }
            const context = this.createContext(item, distance, felt);
            item.onLandNearby?.(context);
            this.dispatchEvent({ type: 'landnearby', reactive: item, context });
        }
        found.length = 0;
    }

    // E on an interactable that is also reactive: it moves as its interactStrength says
    handleInteract(interactable, context) {
        const item = this.fromInteractable.get(interactable);
        if (!item || !item.enabled || item.interactStrength <= 0) return;
        const direction = context.direction;
        const length = Math.hypot(direction.x, direction.z) || 1;
        const along = { x: direction.x / length, z: direction.z / length };
        item.react(along.x, along.z, item.interactStrength);
        this.keepMoving(item);
        this.effects(item, 'interact', item.interactStrength, along);
    }

    // What a reaction looks and sounds like beyond the movement itself: sand, particles, the event
    effects(item, cause, strength, direction) {
        const { center, radius } = item.bounds;
        if (item.sand > 0 && cause !== 'proximity') {
            const disturbed = this.sand.disturb(center.x, center.z, strength * item.sand,
                direction?.x ?? 0, direction?.z ?? 0, Math.max(0.2, radius * 0.8));
            this.dispatchSand(cause, disturbed, center.x, this.world.heightAt(center.x, center.z), center.z);
        }
        if (item.particles && strength > 0.2) {
            const kind = item.particles === 'motes' ? 'mote' : 'flake';
            this.particles.emit(kind, center.x, center.y + radius * 0.3, center.z,
                direction?.x ?? 0, direction?.z ?? 0, 1 + Math.round(3 * strength), 1);
        }
        this.dispatchEvent({ type: 'react', reactive: item, cause, strength, position: center.clone() });
    }

    dispatchSand(cause, strength, x, y, z) {
        if (strength <= 0) return;
        this.dispatchEvent({ type: 'sand', cause, strength, position: new THREE.Vector3(x, y, z) });
    }

    // Walking right through something that brushes: the hand on that side gives a little
    brushHands(item, strength) {
        const { x, z } = this.player.position;
        const yaw = this.player.view.yaw;
        const right = (item.bounds.center.x - x) * Math.cos(yaw) - (item.bounds.center.z - z) * Math.sin(yaw);
        this.player.hands.brush(right >= 0 ? 1 : -1, strength);
    }

    keepMoving(item) {
        if (item.updating || !item.response?.active) return;
        item.updating = true;
        this.moving.push(item);
    }

    // The particles take the colour of the light: moon, sky and sun
    updateLight() {
        const { hemisphere, moon, sun } = this.world.lights;
        const light = this.light.copy(hemisphere.color).multiplyScalar(hemisphere.intensity);
        light.r += (moon.color.r * moon.intensity + sun.color.r * sun.intensity) * 0.35;
        light.g += (moon.color.g * moon.intensity + sun.color.g * sun.intensity) * 0.35;
        light.b += (moon.color.b * moon.intensity + sun.color.b * sun.intensity) * 0.35;
        // Half as colourful: dust takes the sand's own warmth, not the full blue of the night sky
        const grey = 0.3 * light.r + 0.59 * light.g + 0.11 * light.b;
        light.r = Math.min(1, (light.r + grey) / 2);
        light.g = Math.min(1, (light.g + grey) / 2);
        light.b = Math.min(1, (light.b + grey) / 2);
        this.particles.setLight(light);
    }

    // Horizontal distance from the player to where it stands
    distanceTo(item, position) {
        return Math.hypot(item.bounds.center.x - position.x, item.bounds.center.z - position.z);
    }

    // Unit direction along the ground from the player toward it (reused object: read it at once)
    directionTo(item, position) {
        const dx = item.bounds.center.x - position.x, dz = item.bounds.center.z - position.z;
        const length = Math.hypot(dx, dz) || 1;
        this.direction.x = dx / length;
        this.direction.z = dz / length;
        return this.direction;
    }

    // Away from a point (dx, dz at `distance`), plus a little along the way of travel (unit)
    blend(dx, dz, distance, travelX, travelZ) {
        const away = distance > 1e-3 ? 1 / distance : 0;
        const x = dx * away + travelX * 0.6, z = dz * away + travelZ * 0.6;
        const length = Math.hypot(x, z) || 1;
        this.direction.x = x / length;
        this.direction.z = z / length;
        return this.direction;
    }

    // What a reactive is told when something happens near it (only for events, never per frame)
    createContext(item, distance, strength = 0, step = null) {
        const { player } = this;
        const { x, z } = this.directionTo(item, player.position);
        return {
            player,
            environment: this,
            reactive: item,
            object: item.object,
            distance,
            direction: new THREE.Vector3(x, 0, z),
            strength,
            position: player.position.clone(),
            movementState: player.state.current,
            hands: player.hands,
            step
        };
    }

    dispose() {
        [...this.reactives].forEach(item => this.unregisterReactive(item));
        this.particles.dispose();
    }
}

function remove(list, item) {
    const index = list.indexOf(item);
    if (index !== -1) list.splice(index, 1);
}
