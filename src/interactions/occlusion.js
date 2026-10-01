// occlusion.js - Whether something solid stands between the eye and what it is looking at, so a
// stone behind a palm trunk can't be noticed through the trunk.
//
// What counts as solid is up to the world: by default the things the player can bump into (trunks,
// the old tree, larger rocks; see World.solids), plus the dunes themselves. Shrubs, grass and
// flowers don't block.
//
// It is only asked when the gaze has already found something within reach, and it stays cheap:
// - dunes: a handful of height samples along the line of sight (no terrain triangles)
// - solid things: each one's bounding sphere (measured once) is checked against the line of
//   sight, and only the one or two that it actually crosses have their geometry tested
import * as THREE from 'three';

const TERRAIN_STEP = 0.25; // Metres between height samples along the line of sight
const TERRAIN_CLEARANCE = 0.05; // The ground has to rise this far above the line to block it
const NEAR_TARGET = 0.35; // Metres before the target where the ground isn't checked (it sits on it)

export class Occlusion {
    // blockers: Object3Ds that block the gaze (static: measured once, see addBlocker)
    // groundHeightAt(x, z): the ground's height, so dunes block too (null: they don't)
    constructor({ blockers = [], groundHeightAt = null } = {}) {
        this.enabled = true;
        this.groundHeightAt = groundHeightAt;

        // Reused for every check
        this.raycaster = new THREE.Raycaster();
        this.intersections = [];
        this.toCenter = new THREE.Vector3();
        this.box = new THREE.Box3();
        this.sphere = new THREE.Sphere();

        this.blockers = []; // { object, center, radius }
        blockers.forEach(object => this.addBlocker(object));
    }

    // object: something solid that stays where it is (call again after moving it)
    addBlocker(object) {
        this.removeBlocker(object);
        this.box.setFromObject(object).getBoundingSphere(this.sphere);
        this.blockers.push({ object, center: this.sphere.center.clone(), radius: this.sphere.radius });
    }

    removeBlocker(object) {
        const index = this.blockers.findIndex(blocker => blocker.object === object);
        if (index !== -1) this.blockers.splice(index, 1);
    }

    // Is the point `distance` along the ray (origin, unit direction) hidden from the origin?
    // ignore: the object being looked at (it can't hide itself)
    blocks(origin, direction, distance, ignore = null) {
        if (!this.enabled) return false;
        return this.blockedByGround(origin, direction, distance) ||
            this.blockedBySolid(origin, direction, distance, ignore);
    }

    blockedByGround(origin, direction, distance) {
        const heightAt = this.groundHeightAt;
        if (!heightAt) return false;
        for (let t = TERRAIN_STEP; t < distance - NEAR_TARGET; t += TERRAIN_STEP) {
            const x = origin.x + direction.x * t;
            const z = origin.z + direction.z * t;
            if (heightAt(x, z) > origin.y + direction.y * t + TERRAIN_CLEARANCE) return true;
        }
        return false;
    }

    blockedBySolid(origin, direction, distance, ignore) {
        const { raycaster, intersections, toCenter } = this;
        for (const blocker of this.blockers) {
            if (blocker.object === ignore) continue;
            // Does the line of sight pass through its bounding sphere at all?
            const along = toCenter.subVectors(blocker.center, origin).dot(direction);
            if (along < -blocker.radius || along > distance + blocker.radius) continue;
            if (toCenter.lengthSq() - along * along > blocker.radius * blocker.radius) continue;

            // It might: test its actual shape, up to just short of the target
            raycaster.ray.origin.copy(origin);
            raycaster.ray.direction.copy(direction);
            raycaster.near = 0;
            raycaster.far = distance - 0.02;
            intersections.length = 0;
            raycaster.intersectObject(blocker.object, true, intersections);
            const hit = intersections.length > 0;
            intersections.length = 0;
            if (hit) return true;
        }
        return false;
    }
}
