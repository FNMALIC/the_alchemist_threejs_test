// player.js - First-person movement: walking on sand, slopes, wading, jumping and bumping into things
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const KEY_BINDINGS = {
    ArrowUp: 'forward',
    KeyW: 'forward',
    ArrowDown: 'backward',
    KeyS: 'backward',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right'
};

// Walking speed settles at ACCELERATION / DAMPING units per second on flat ground
const ACCELERATION = 30.0;
const DAMPING = 10.0;
const EYE_HEIGHT = 1.7;
const BODY_RADIUS = 0.35; // For bumping into trunks and rocks

const GRAVITY = 14;
const JUMP_SPEED = 4.2;

const UPHILL_SLOWDOWN = 0.9; // Speed lost per unit of slope when climbing a dune
const DOWNHILL_SPEEDUP = 0.35; // Speed gained per unit of slope when going down
const WADING_SPEED = 0.5; // Fraction of normal speed in the pool

const BOB_HEIGHT = 0.045; // Head bob while walking
const BOB_STEPS_PER_UNIT = 0.65; // Steps per unit walked (about 2 steps a second at walking pace)

export class Player {
    // groundHeightAt(x, z): terrain height; bounds: { minX, maxX, minZ, maxZ } the player stays within
    // colliders: [{ x, z, radius }] solid things; isUnderWater(x, z): whether a spot is in the pool
    constructor(camera, domElement, { groundHeightAt, bounds, colliders = [], isUnderWater = () => false }) {
        this.camera = camera;
        this.groundHeightAt = groundHeightAt;
        this.bounds = bounds;
        this.colliders = colliders;
        this.isUnderWater = isUnderWater;
        this.controls = new PointerLockControls(camera, domElement);

        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.moving = { forward: false, backward: false, left: false, right: false };

        // Eye position without the head bob; the camera is placed relative to it every frame
        this.eye = camera.position.clone();
        this.verticalSpeed = 0;
        this.grounded = true;
        this.stepPhase = 0;
        this.landingDip = 0;
        this.wading = false;

        // Sound hooks: onStep(surface, intensity) each time a foot lands, onLand(strength) after a jump
        this.onStep = null;
        this.onLand = null;

        document.addEventListener('keydown', event => {
            this.setKey(event.code, true);
            if (event.code === 'Space') this.jump();
        });
        document.addEventListener('keyup', event => this.setKey(event.code, false));
    }

    get isLocked() {
        return this.controls.isLocked;
    }

    lock() {
        this.controls.lock();
    }

    setKey(code, pressed) {
        const action = KEY_BINDINGS[code];
        if (action) this.moving[action] = pressed;
    }

    jump() {
        const { x, z } = this.camera.position;
        if (!this.controls.isLocked || !this.grounded || this.isUnderWater(x, z)) return; // No jumping out of water
        this.verticalSpeed = JUMP_SPEED;
        this.grounded = false;
    }

    // Put the player at eye height above the ground at the camera's current position
    placeOnGround() {
        this.eye.copy(this.camera.position);
        this.eye.y = this.groundHeightAt(this.eye.x, this.eye.z) + EYE_HEIGHT;
        this.camera.position.copy(this.eye);
    }

    update(delta) {
        // Work from the un-bobbed eye position
        this.camera.position.copy(this.eye);

        if (this.controls.isLocked) {
            this.walk(delta);
        }
        this.fall(delta);
        this.bob(delta);
    }

    walk(delta) {
        const { velocity, direction, moving } = this;
        const position = this.camera.position;
        const before = position.clone();

        // Slow down
        velocity.x -= velocity.x * DAMPING * delta;
        velocity.z -= velocity.z * DAMPING * delta;

        direction.z = Number(moving.forward) - Number(moving.backward);
        direction.x = Number(moving.right) - Number(moving.left);
        direction.normalize();

        // Accelerate in the direction we're facing (only with feet on the ground)
        const control = this.grounded ? 1 : 0.2;
        if (moving.forward || moving.backward) velocity.z -= direction.z * ACCELERATION * control * delta;
        if (moving.left || moving.right) velocity.x -= direction.x * ACCELERATION * control * delta;

        this.controls.moveRight(-velocity.x * delta);
        this.controls.moveForward(-velocity.z * delta);

        // Sand is harder going uphill, a little easier downhill, and the pool slows you down
        const stepX = position.x - before.x;
        const stepZ = position.z - before.z;
        const stepLength = Math.hypot(stepX, stepZ);
        if (stepLength > 1e-5) {
            const slope = (this.groundHeightAt(position.x, position.z) - this.groundHeightAt(before.x, before.z)) / stepLength;
            let speed = slope > 0 ? 1 - slope * UPHILL_SLOWDOWN : 1 - slope * DOWNHILL_SPEEDUP;
            speed = THREE.MathUtils.clamp(speed, 0.35, 1.25);

            if (this.isUnderWater(position.x, position.z)) speed *= WADING_SPEED;

            position.x = before.x + stepX * speed;
            position.z = before.z + stepZ * speed;
        }

        this.collide(position);

        // Stay inside the world
        position.x = THREE.MathUtils.clamp(position.x, this.bounds.minX, this.bounds.maxX);
        position.z = THREE.MathUtils.clamp(position.z, this.bounds.minZ, this.bounds.maxZ);

        this.walkedThisFrame = Math.hypot(position.x - before.x, position.z - before.z);
    }

    // Push the player out of any trunk or rock they walked into, so they slide along it
    collide(position) {
        for (const collider of this.colliders) {
            const dx = position.x - collider.x;
            const dz = position.z - collider.z;
            const minDistance = collider.radius + BODY_RADIUS;
            const distanceSquared = dx * dx + dz * dz;
            if (distanceSquared >= minDistance * minDistance || distanceSquared === 0) continue;

            const distance = Math.sqrt(distanceSquared);
            position.x = collider.x + (dx / distance) * minDistance;
            position.z = collider.z + (dz / distance) * minDistance;
        }
    }

    // Gravity: follow the dunes when on the ground, arc through the air after a jump
    fall(delta) {
        const position = this.camera.position;
        const groundEye = this.groundHeightAt(position.x, position.z) + EYE_HEIGHT;
        this.wading = this.grounded && this.isUnderWater(position.x, position.z);

        if (this.grounded) {
            // Smoothly follow the ground, smoothing out small bumps
            position.y += (groundEye - position.y) * Math.min(1, delta * 10);
            return;
        }

        this.verticalSpeed -= GRAVITY * delta;
        position.y += this.verticalSpeed * delta;
        if (position.y <= groundEye) {
            // Land softly: a small dip, stronger the faster we came down
            this.landingDip = Math.min(0.25, -this.verticalSpeed * 0.04);
            this.onLand?.(Math.min(1, -this.verticalSpeed / 8));
            position.y = groundEye;
            this.verticalSpeed = 0;
            this.grounded = true;
        }
    }

    // Head bob while walking and the dip after landing; applied on top of the eye position
    bob(delta) {
        this.eye.copy(this.camera.position);

        const walked = this.grounded ? (this.walkedThisFrame || 0) : 0;
        const previousStep = Math.floor(this.stepPhase / Math.PI);
        this.stepPhase += walked * BOB_STEPS_PER_UNIT * Math.PI;
        const speed = walked / Math.max(delta, 1e-4);
        const amount = Math.min(1, speed / 3);

        // A foot lands at the lowest point of each bob
        if (Math.floor(this.stepPhase / Math.PI) !== previousStep) {
            this.onStep?.(this.wading ? 'water' : 'sand', amount);
        }

        this.landingDip = Math.max(0, this.landingDip - delta * 1.2);
        this.camera.position.y += Math.abs(Math.sin(this.stepPhase)) * BOB_HEIGHT * amount - this.landingDip;
        this.walkedThisFrame = 0;
    }
}
