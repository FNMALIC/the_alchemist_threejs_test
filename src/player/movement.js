// movement.js - Moving the body over sand: walking and hurrying, climbing and sliding on dunes,
// sinking a little into soft sand, wading, jumping and bumping into things.
//
// Sand physics (simplified):
// - Walking on sand is hard work, and harder the steeper the climb. Near sand's angle of
//   repose (~34°) you can hardly make progress.
// - Sand grips like friction: undisturbed it holds up to ~34° (its angle of repose).
//   Climbing, your feet dig in and it holds to ~30°; walking across, ~26°; running or
//   sliding downhill loosens it, so from ~22° you start to slide, and gathering speed
//   down a dune face is like surfing.
import * as THREE from 'three';

export const WALK_SPEED = 2.0; // m/s: an unhurried walk
export const HURRY_SPEED = 3.4; // m/s with Shift held
const DAMPING = 8.0; // How quickly walking speed settles (higher = snappier)
export const EYE_HEIGHT = 1.7;
const BODY_RADIUS = 0.35; // For bumping into trunks and rocks

const GRAVITY = 9.8;
const JUMP_SPEED = 4.2;

// Sand
const REPOSE_ANGLE = 34 * Math.PI / 180; // Steepest slope loose sand holds (static friction)
const RESTING_FRICTION = Math.tan(REPOSE_ANGLE); // Undisturbed sand
const CLIMBING_FRICTION = Math.tan(30 * Math.PI / 180); // Feet digging in going up
const WALKING_FRICTION = Math.tan(26 * Math.PI / 180); // Walking across a slope
const LOOSE_FRICTION = Math.tan(22 * Math.PI / 180); // Going down, or already sliding
const SAND_DRAG = 0.6; // Extra slowing while sliding, per second
const SINK_DEPTH = 0.04; // Metres the feet sink into soft sand
const WADING_SPEED = 0.5; // Fraction of normal speed in the pool
const SITTING_EYE_HEIGHT = 0.95;

export class Movement {
    // position: the eye position (without the head's motion), moved in place
    // groundHeightAt(x, z): terrain height; bounds: optional { minX, maxX, minZ, maxZ } the player
    // stays within (the desert has none: it goes on forever)
    // colliders: [{ x, z, radius }] solid things; isUnderWater(x, z): whether a spot is in the pool
    // isFirmGround(x, z): damp, packed sand that doesn't give way (e.g. around the pool)
    constructor(position, {
        groundHeightAt, bounds = null, colliders = [], isUnderWater = () => false, isFirmGround = () => false
    }) {
        this.position = position;
        this.groundHeightAt = groundHeightAt;
        this.bounds = bounds;
        this.colliders = colliders;
        this.isUnderWater = isUnderWater;
        this.isFirmGround = isFirmGround;

        this.velocity = new THREE.Vector3(); // Walking velocity in body space (x: right, z: back)
        this.direction = new THREE.Vector3();
        this.slide = new THREE.Vector2(); // Sliding velocity over the ground (x, z)
        this.moving = { forward: false, backward: false, left: false, right: false, hurry: false };

        this.verticalSpeed = 0;
        this.grounded = true;
        this.wading = false;
        this.walking = false; // Whether the feet are walking under the player's control this frame
        this.sink = 0;
        this.effort = 0; // 0..1 how hard the going is, for the gait and the footstep sounds
        this.walkSlope = 0; // Slope along the walking direction: positive uphill
        this.heading = new THREE.Vector2(0, -1); // Direction of travel on the ground
        this.speed = 0; // Horizontal ground speed (m/s), walking and sliding combined

        this.storm = 0; // 0 calm .. 1 sandstorm: walking is slowed and the wind pushes
        this.windDirection = new THREE.Vector2(1.6, 0.6).normalize();
        this.time = 0;
        this.seated = null; // { x, z } once sitting down
        this.attention = 0; // 0 .. 1 near something that holds the attention: the walk slows
        this.gradient = new THREE.Vector2();
        this.frameStart = new THREE.Vector3(); // Reused every frame
        this.stepStart = new THREE.Vector3();

        // Hook: onLand(strength) when the feet touch down after a jump (strength 0..1)
        this.onLand = null;
    }

    get sliding() {
        return this.slide.length() > 0.8;
    }

    // Returns whether the jump happened (feet on the ground, and not in the water)
    jump() {
        if (this.seated) return false;
        const { x, z } = this.position;
        if (!this.grounded || this.isUnderWater(x, z)) return false;
        this.verticalSpeed = JUMP_SPEED;
        this.grounded = false;
        return true;
    }

    // Put the eye at eye height above the ground where it stands
    placeOnGround() {
        const position = this.position;
        position.y = this.groundHeightAt(position.x, position.z) + EYE_HEIGHT;
        this.slide.set(0, 0);
    }

    // Slope of the ground at (x, z): gradient (rise per metre in x and z)
    slopeAt(x, z, target = this.gradient) {
        const e = 0.4;
        return target.set(
            (this.groundHeightAt(x + e, z) - this.groundHeightAt(x - e, z)) / (2 * e),
            (this.groundHeightAt(x, z + e) - this.groundHeightAt(x, z - e)) / (2 * e)
        );
    }

    standUp() {
        this.seated = null;
    }

    // Sit down at (x, z)
    sit(x, z) {
        this.seated = { x, z };
        this.velocity.set(0, 0, 0);
        this.slide.set(0, 0);
        Object.keys(this.moving).forEach(key => { this.moving[key] = false; });
    }

    // yaw: the direction the body faces (radians, as the camera's); enabled: whether the
    // player is in control (the pointer is locked). Sliding and falling go on regardless.
    update(delta, yaw, enabled) {
        const position = this.position;
        if (this.seated) {
            this.sitDown(delta);
            return;
        }

        this.time += delta;
        const before = this.frameStart.copy(position);

        this.walking = enabled && this.walk(delta, yaw);
        this.slideOnSand(delta, this.walking);
        // The storm's wind pushes you sideways, in gusts
        if (this.storm > 0 && this.grounded) {
            const gust = 0.6 + 0.4 * Math.sin(this.time * 1.7) * Math.sin(this.time * 0.6);
            position.x += this.windDirection.x * 0.5 * this.storm * gust * delta;
            position.z += this.windDirection.y * 0.5 * this.storm * gust * delta;
        }
        this.collide(position);
        this.keepInBounds(position);
        this.fall(delta);

        const moved = Math.hypot(position.x - before.x, position.z - before.z);
        this.speed = moved / Math.max(delta, 1e-4);
        if (moved > 1e-4) this.heading.set(position.x - before.x, position.z - before.z).normalize();
    }

    // Walking under the player's control; returns whether the player is trying to walk
    walk(delta, yaw) {
        const { velocity, direction, moving } = this;
        const position = this.position;
        const before = this.stepStart.copy(position);

        // Near something that matters, the feet slow on their own
        const targetSpeed = (moving.hurry ? HURRY_SPEED : WALK_SPEED) * (1 - 0.45 * this.attention);
        const acceleration = targetSpeed * DAMPING;

        velocity.x -= velocity.x * DAMPING * delta;
        velocity.z -= velocity.z * DAMPING * delta;

        direction.z = Number(moving.forward) - Number(moving.backward);
        direction.x = Number(moving.right) - Number(moving.left);
        direction.normalize();
        const trying = direction.lengthSq() > 0;

        // Feet only push while on the ground
        const control = this.grounded ? 1 : 0.15;
        if (moving.forward || moving.backward) velocity.z -= direction.z * acceleration * control * delta;
        if (moving.left || moving.right) velocity.x -= direction.x * acceleration * control * delta;

        // Step along the ground in the direction the body faces
        const right = -velocity.x * delta;
        const forward = -velocity.z * delta;
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);
        position.x += cos * right - sin * forward;
        position.z += -sin * right - cos * forward;

        // How the ground slows the step
        const stepX = position.x - before.x;
        const stepZ = position.z - before.z;
        const stepLength = Math.hypot(stepX, stepZ);
        this.effort += ((trying ? 0.15 : 0) - this.effort) * Math.min(1, delta * 3);
        this.walkSlope = 0;
        if (stepLength > 1e-5) {
            const gradient = this.slopeAt(before.x, before.z);
            // Slope along the direction of the step: positive uphill
            const along = (gradient.x * stepX + gradient.y * stepZ) / stepLength;
            this.walkSlope = along;
            const angle = Math.atan(Math.abs(along));

            let speed;
            if (along > 0) {
                // Climbing sand: gets much harder toward the angle of repose
                const steepness = Math.min(1, angle / REPOSE_ANGLE);
                speed = 1 - 0.85 * steepness * steepness;
                this.effort = Math.max(this.effort, steepness);
            } else {
                // Going down: a little quicker, until the sand starts to slide (handled below)
                speed = 1 + 0.2 * Math.min(1, angle / (20 * Math.PI / 180));
            }

            speed *= 1 - 0.45 * this.storm; // Leaning into the wind
            if (this.isUnderWater(position.x, position.z)) speed *= WADING_SPEED;
            else if (!this.isFirmGround(position.x, position.z)) speed *= 0.92; // Soft sand

            position.x = before.x + stepX * speed;
            position.z = before.z + stepZ * speed;
        }

        return trying && this.grounded;
    }

    // Sliding on sand: gravity pulls down the slope, friction and drag hold back
    slideOnSand(delta, walking) {
        const position = this.position;
        const slide = this.slide;

        if (!this.grounded || this.isUnderWater(position.x, position.z) || this.isFirmGround(position.x, position.z)) {
            slide.multiplyScalar(Math.exp(-delta * 4));
        } else {
            const gradient = this.slopeAt(position.x, position.z);
            const steepness = gradient.length();
            const angle = Math.atan(steepness);
            const cos = Math.cos(angle);

            // Pull along the ground, straight down the slope
            const pull = GRAVITY * Math.sin(angle) * cos;
            // How well the sand holds depends on what the feet are doing to it
            let grip = RESTING_FRICTION;
            if (slide.length() > 0.2 || (walking && this.walkSlope < -0.15)) grip = LOOSE_FRICTION;
            else if (walking && this.walkSlope > 0.15) grip = CLIMBING_FRICTION;
            else if (walking) grip = WALKING_FRICTION;
            const friction = GRAVITY * cos * cos * grip;

            if (steepness > 1e-4) {
                slide.x -= (gradient.x / steepness) * pull * delta;
                slide.y -= (gradient.y / steepness) * pull * delta;
            }

            // Friction and drag slow the slide; they can stop it, never reverse it
            const speed = slide.length();
            if (speed > 0) {
                const slowed = Math.max(0, speed - (friction + SAND_DRAG * speed) * delta);
                slide.multiplyScalar(slowed / speed);
            }
        }

        position.x += slide.x * delta;
        position.z += slide.y * delta;
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
            const nx = dx / distance;
            const nz = dz / distance;
            position.x = collider.x + nx * minDistance;
            position.z = collider.z + nz * minDistance;

            // Stop any sliding into the obstacle
            const into = this.slide.x * nx + this.slide.y * nz;
            if (into < 0) this.slide.set(this.slide.x - into * nx, this.slide.y - into * nz);
        }
    }

    keepInBounds(position) {
        if (!this.bounds) return;
        position.x = THREE.MathUtils.clamp(position.x, this.bounds.minX, this.bounds.maxX);
        position.z = THREE.MathUtils.clamp(position.z, this.bounds.minZ, this.bounds.maxZ);
    }

    // Gravity: follow the dunes when on the ground, arc through the air after a jump
    fall(delta) {
        const position = this.position;
        this.wading = this.grounded && this.isUnderWater(position.x, position.z);

        // Feet sink a little into soft sand, not into packed sand or the pool's bed
        const soft = !this.wading && !this.isFirmGround(position.x, position.z);
        this.sink += ((soft ? SINK_DEPTH * (1 + this.effort) : 0.01) - this.sink) * Math.min(1, delta * 4);
        const groundEye = this.groundHeightAt(position.x, position.z) + EYE_HEIGHT - this.sink;

        if (this.grounded) {
            // Follow the ground, smoothing out small bumps
            position.y += (groundEye - position.y) * Math.min(1, delta * 12);
            return;
        }

        this.verticalSpeed -= GRAVITY * 1.4 * delta; // A little heavier than real, so jumps don't float
        position.y += this.verticalSpeed * delta;
        if (position.y <= groundEye) {
            const strength = Math.min(1, -this.verticalSpeed / 8);
            position.y = groundEye;
            this.verticalSpeed = 0;
            this.grounded = true;
            this.onLand?.(strength);
        }
    }

    // Lower the eye to the seat over a few seconds
    sitDown(delta) {
        const { x, z } = this.seated;
        const position = this.position;
        const ease = Math.min(1, delta * 1.5);
        position.x += (x - position.x) * ease;
        position.z += (z - position.z) * ease;
        position.y += (this.groundHeightAt(x, z) + SITTING_EYE_HEIGHT - position.y) * ease;
        this.walking = false;
        this.speed = 0;
    }
}
