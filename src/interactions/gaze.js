// gaze.js - What the player is looking at: the registered interactable under the crosshair.
//
// - A ray from the eye straight through the centre of the view, where the crosshair is.
// - Only registered interactables are tested. A quick check of each one's bounding sphere first
//   skips anything out of reach or nowhere near the centre of the view, so most frames cast no
//   ray at all and nothing else in the scene is ever looked through.
// - Tolerance: if the centre ray misses, rings of rays slightly off centre (1.5°, then 3°) are
//   tried in turn, so a small thing like a flower only has to be looked at roughly. Within the
//   first ring that hits, the closest hit wins, so the result is always the same for the same view.
// - The thing already in focus is held a little longer (a wider ring and a little more reach),
//   so focus doesn't flicker at the edges or as the head bobs.
// - Distance is measured from the eye to the point looked at.
// - Something solid in the way (a palm trunk, a rock, a dune; see occlusion.js) hides what is
//   behind it: a hit is only kept if nothing blocks the line of sight to it.
// - Things that move (dynamic) have their bounds carried along each frame; static ones don't.
import * as THREE from 'three';

const RINGS = [1.5, 3]; // Degrees off centre
const HOLD_RING = 4.5; // Degrees: only for keeping the current target
const RAYS_PER_RING = 8;
const HOLD_DISTANCE = 0.2; // Metres past its reach before the current target is let go

// Ray directions in camera space for a ring `degrees` off centre
function ring(degrees) {
    const angle = THREE.MathUtils.degToRad(degrees);
    return Array.from({ length: RAYS_PER_RING }, (_, i) => {
        const around = (i / RAYS_PER_RING) * Math.PI * 2;
        return new THREE.Vector3(
            Math.sin(angle) * Math.cos(around), Math.sin(angle) * Math.sin(around), -Math.cos(angle)
        );
    });
}

export class Gaze {
    // distance: how far the eye reaches (metres), unless an interactable sets its own maxDistance
    // occlusion: an Occlusion, or null if nothing blocks the gaze
    constructor({ distance = 3, occlusion = null } = {}) {
        this.distance = distance;
        this.occlusion = occlusion;

        this.levels = [[new THREE.Vector3(0, 0, -1)], ...RINGS.map(ring)];
        this.holdLevel = ring(HOLD_RING);
        this.searchAngle = THREE.MathUtils.degToRad(RINGS[RINGS.length - 1]);
        this.holdAngle = THREE.MathUtils.degToRad(HOLD_RING);

        // Reused every frame
        this.raycaster = new THREE.Raycaster();
        this.intersections = [];
        this.candidates = []; // Objects worth casting rays at this frame
        this.single = [null];
        this.origin = new THREE.Vector3();
        this.forward = new THREE.Vector3();
        this.toCenter = new THREE.Vector3();
        this.hit = { interactable: null, distance: Infinity, point: new THREE.Vector3() };
    }

    // How close the eye must be to `item`; the current target is held a little further
    reachOf(item, current) {
        return (item.maxDistance ?? this.distance) + (item === current ? HOLD_DISTANCE : 0);
    }

    // camera: its world matrix must be up to date; registry: InteractionRegistry;
    // current: the interactable in focus now, or null.
    // Returns this.hit ({ interactable, distance, point }, reused) or null if nothing is looked at.
    find(camera, registry, current) {
        const { origin, forward, toCenter, candidates } = this;
        origin.setFromMatrixPosition(camera.matrixWorld);
        forward.set(0, 0, -1).transformDirection(camera.matrixWorld);

        // Broad phase: near enough, and near the centre of the view
        candidates.length = 0;
        let far = 0;
        let currentIsCandidate = false;
        for (const item of registry.items) {
            if (!item.enabled) continue;
            if (item.dynamic) item.followBounds();
            const reach = this.reachOf(item, current);
            const { center, radius } = item.bounds;
            const distance = toCenter.subVectors(center, origin).length();
            if (distance - radius > reach) continue;
            if (distance > radius) {
                const offCentre = forward.angleTo(toCenter) - Math.asin(radius / distance);
                if (offCentre > (item === current ? this.holdAngle : this.searchAngle)) continue;
            }
            candidates.push(item.object);
            far = Math.max(far, reach);
            if (item === current) currentIsCandidate = true;
        }
        if (candidates.length === 0) return null;

        const raycaster = this.raycaster;
        raycaster.camera = camera; // Needed if an interactable contains sprites
        raycaster.near = 0;
        raycaster.far = far;

        // Centre first, then each ring outward
        for (const directions of this.levels) {
            if (this.cast(directions, candidates, camera, registry, current, null)) return this.hit;
        }
        // Not found: is the current target still just about being looked at?
        if (currentIsCandidate) {
            this.single[0] = current.object;
            if (this.cast(this.holdLevel, this.single, camera, registry, current, current)) return this.hit;
        }
        return null;
    }

    // Cast each direction (camera space) at `objects`; keeps the closest valid hit in this.hit.
    // only: if set, the only interactable that counts. Returns whether anything was hit.
    cast(directions, objects, camera, registry, current, only) {
        const { raycaster, intersections, hit } = this;
        hit.interactable = null;
        hit.distance = Infinity;

        for (const direction of directions) {
            raycaster.ray.origin.copy(this.origin);
            raycaster.ray.direction.copy(direction).transformDirection(camera.matrixWorld);
            intersections.length = 0;
            raycaster.intersectObjects(objects, true, intersections);

            // Sorted nearest first: the first one that counts is this ray's answer
            for (const intersection of intersections) {
                if (intersection.distance >= hit.distance) break;
                const item = registry.findByObject(intersection.object);
                if (!item || !item.enabled || (only && item !== only)) continue;
                if (intersection.distance > this.reachOf(item, current)) continue;
                // Hidden behind something solid: so is anything further along this ray
                if (this.occlusion?.blocks(raycaster.ray.origin, raycaster.ray.direction, intersection.distance, item.object)) break;
                hit.interactable = item;
                hit.distance = intersection.distance;
                hit.point.copy(intersection.point);
                break;
            }
        }
        intersections.length = 0;
        return hit.interactable !== null;
    }
}
