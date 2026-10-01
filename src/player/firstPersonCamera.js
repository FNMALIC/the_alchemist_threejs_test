// firstPersonCamera.js - The player's eyes. Moving the mouse sideways turns the body (yaw);
// up and down tilts the head (pitch), clamped so you can look up at the stars or down at the
// sand but never tip over backwards. Every frame the camera is put at the eye with the head's
// motion (gait, breath, landing) laid on top.
import * as THREE from 'three';

const LOOK_SPEED = 0.002; // Radians per pixel of mouse movement (the same as before)
const MAX_PITCH_UP = THREE.MathUtils.degToRad(85);
const MAX_PITCH_DOWN = THREE.MathUtils.degToRad(80);
const TURN_SMOOTHING = 18; // How quickly the measured turning speed follows the mouse (per second)

function clampPitch(pitch) {
    return THREE.MathUtils.clamp(pitch, -MAX_PITCH_DOWN, MAX_PITCH_UP);
}

export class FirstPersonCamera {
    constructor(camera) {
        this.camera = camera;

        // Start looking wherever the camera was pointed
        const start = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        this.yaw = start.y; // Body: turning left and right
        this.pitch = clampPitch(start.x); // Head: looking up and down

        // How fast the view is turning (rad/s, x: yaw, y: pitch), smoothed; the hands lag behind it
        this.turnRate = new THREE.Vector2();
        this.turned = new THREE.Vector2(); // Turning since the last frame

        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.right = new THREE.Vector3();
    }

    // Mouse movement in pixels
    look(dx, dy) {
        const yaw = -dx * LOOK_SPEED;
        const pitch = clampPitch(this.pitch - dy * LOOK_SPEED);
        this.turned.x += yaw;
        this.turned.y += pitch - this.pitch;
        this.yaw = THREE.MathUtils.euclideanModulo(this.yaw + yaw + Math.PI, Math.PI * 2) - Math.PI;
        this.pitch = pitch;
    }

    // eye: where the eyes are, without the head's motion
    // head: { offsetY, offsetSide, pitch, roll } the head's motion on top (see headBob.js)
    update(delta, eye, head) {
        if (delta > 0) {
            const blend = Math.min(1, delta * TURN_SMOOTHING);
            this.turnRate.x += (this.turned.x / delta - this.turnRate.x) * blend;
            this.turnRate.y += (this.turned.y / delta - this.turnRate.y) * blend;
        }
        this.turned.set(0, 0);

        const camera = this.camera;
        this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); // Body's right, level with the ground
        camera.position.copy(eye);
        camera.position.y += head.offsetY;
        camera.position.addScaledVector(this.right, head.offsetSide);

        // Yaw turns the body, pitch tilts the head, roll leans it over the supporting foot
        this.euler.set(this.pitch + head.pitch, this.yaw, head.roll);
        camera.quaternion.setFromEuler(this.euler);
    }
}
