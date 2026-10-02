// touchControls.js - Walking on a phone or tablet. Phones have no pointer lock and no keyboard:
//   - hold the left half of the screen to walk forward; slide that finger down to step back,
//     sideways to step aside, further up to hurry. A faint ring shows where the thumb is.
//   - drag on the right half to look around (like turning a photo sphere: grab the sky)
//   - double-tap the right half to jump
//   - the quiet prompts ("E — sit", "Examine") become things to tap
//   - optionally, turn the phone to look around (the gyroscope), on top of dragging
// Looking goes through the same code as the mouse; walking sets the same keys the keyboard does.

import * as THREE from 'three';

// For turning the phone: its screen faces the viewer (a camera looks down its own -z)
const SCREEN_FACING = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const SCREEN_TURN = new THREE.Quaternion();
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
const VIEW_EULER = new THREE.Euler();

const LOOK_SPEED = 2.4; // Times the mouse's radians per pixel: a phone is small, a sweep should turn far
const DEAD_ZONE = 22; // Pixels the walking thumb can wander before it steers
const HURRY_AT = 70; // Pixels up from where the thumb came down
const DOUBLE_TAP = 0.3; // Seconds
const TILT_JUMP = 0.5; // Radians: a bigger jump between two readings is a glitch, not a turn

// A phone or tablet: its main pointer is a finger. (A laptop with a touch screen still has a
// mouse or trackpad as its main pointer, and keeps the mouse controls.)
export function isTouchDevice() {
    return Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}

// Pretend the keyboard was used, so everything that listens for keys works the same
function pressKey(code, key) {
    document.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true }));
}

export class TouchControls {
    // player: PlayerController; element: where touches are read (the page)
    constructor(player, element = document.body) {
        this.player = player;
        this.walkTouch = null; // { id, x, y } where the walking thumb came down
        this.lookTouch = null; // { id, x, y } the last position of the looking finger
        this.lastLookTap = 0;

        this.ring = document.createElement('div');
        this.ring.className = 'touch-ring';
        document.body.appendChild(this.ring);

        element.addEventListener('touchstart', event => this.start(event), { passive: false });
        element.addEventListener('touchmove', event => this.move(event), { passive: false });
        element.addEventListener('touchend', event => this.end(event));
        element.addEventListener('touchcancel', event => this.end(event));

        this.tilt = null; // { yaw, pitch } last reading, while looking by turning the phone
        this.tiltOn = false;
        this.tiltQuaternion = new THREE.Quaternion();
        this.tiltEuler = new THREE.Euler();
        window.addEventListener('deviceorientation', event => this.orient(event));
        document.addEventListener('visibilitychange', () => { this.tilt = null; });

        // The prompts on screen can be tapped instead of pressing E
        ['hint', 'pause-hint', 'interaction-prompt'].forEach(id => {
            document.getElementById(id)?.addEventListener('click', () => pressKey('KeyE', 'e'));
        });
    }

    start(event) {
        if (!this.player.isLocked) return; // The first tap starts the experience (see main.js)
        if (event.target.closest?.('#hint, #pause-hint, #interaction-prompt, #restart-button')) return;
        event.preventDefault();
        for (const touch of event.changedTouches) {
            if (touch.clientX < window.innerWidth / 2 && !this.walkTouch) {
                this.walkTouch = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
                this.player.standUp(); // Starting to walk gets you up (unless it is the last seat)
                this.steer(0, 0);
                this.ring.style.left = `${touch.clientX}px`;
                this.ring.style.top = `${touch.clientY}px`;
                this.ring.classList.add('visible');
            } else if (!this.lookTouch) {
                this.lookTouch = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
                const now = performance.now() / 1000;
                if (now - this.lastLookTap < DOUBLE_TAP) this.player.jump();
                this.lastLookTap = now;
            }
        }
    }

    move(event) {
        if (!this.player.isLocked) return;
        event.preventDefault();
        for (const touch of event.changedTouches) {
            if (this.walkTouch?.id === touch.identifier) {
                this.steer(touch.clientX - this.walkTouch.x, touch.clientY - this.walkTouch.y);
            } else if (this.lookTouch?.id === touch.identifier) {
                const dx = touch.clientX - this.lookTouch.x;
                const dy = touch.clientY - this.lookTouch.y;
                this.lookTouch.x = touch.clientX;
                this.lookTouch.y = touch.clientY;
                // Grab the sky: drag it left and you turn to the right
                this.player.view.look(-dx * LOOK_SPEED, -dy * LOOK_SPEED);
            }
        }
    }

    end(event) {
        for (const touch of event.changedTouches) {
            if (this.walkTouch?.id === touch.identifier) {
                this.walkTouch = null;
                this.player.releaseKeys();
                this.ring.classList.remove('visible');
            } else if (this.lookTouch?.id === touch.identifier) {
                this.lookTouch = null;
            }
        }
    }

    // Look by turning the phone. On iPhones the browser asks first (it must be from a tap).
    // Returns whether it is on.
    async enableTilt() {
        const Orientation = window.DeviceOrientationEvent;
        if (!Orientation) return false;
        if (typeof Orientation.requestPermission === 'function') {
            try {
                if (await Orientation.requestPermission() !== 'granted') return false;
            } catch {
                return false;
            }
        }
        this.tiltOn = true;
        this.tilt = null;
        return true;
    }

    disableTilt() {
        this.tiltOn = false;
        this.tilt = null;
    }

    // Where the phone points, as yaw and pitch for the eyes; only the change since the last reading
    // turns the view, so dragging still works alongside it
    orient(event) {
        if (!this.tiltOn || !this.player.isLocked || event.alpha === null) return;
        const deg = Math.PI / 180;
        const screenAngle = (screen.orientation?.angle ?? window.orientation ?? 0) * deg;
        // The phone's orientation as a camera looking out of its screen (as three.js's former
        // DeviceOrientationControls did): yaw from alpha, tilt from beta, roll from gamma
        this.tiltEuler.set(event.beta * deg, event.alpha * deg, -event.gamma * deg, 'YXZ');
        this.tiltQuaternion.setFromEuler(this.tiltEuler)
            .multiply(SCREEN_FACING)
            .multiply(SCREEN_TURN.setFromAxisAngle(FORWARD_AXIS, -screenAngle));
        const view = VIEW_EULER.setFromQuaternion(this.tiltQuaternion, 'YXZ');
        const reading = { yaw: view.y, pitch: view.x };
        if (this.tilt) {
            const dYaw = THREE.MathUtils.euclideanModulo(reading.yaw - this.tilt.yaw + Math.PI, Math.PI * 2) - Math.PI;
            const dPitch = reading.pitch - this.tilt.pitch;
            if (Math.abs(dYaw) < TILT_JUMP && Math.abs(dPitch) < TILT_JUMP) this.player.view.turn(dYaw, dPitch);
        }
        this.tilt = reading;
    }

    // (dx, dy): how far the walking thumb has slid from where it came down (pixels).
    // Holding still walks forward.
    steer(dx, dy) {
        const moving = this.player.movement.moving;
        const back = dy > DEAD_ZONE;
        moving.forward = !back;
        moving.backward = back;
        moving.left = dx < -DEAD_ZONE;
        moving.right = dx > DEAD_ZONE;
        moving.hurry = dy < -HURRY_AT;
        this.ring.style.transform = `translate(-50%, -50%) scale(${moving.hurry ? 1.25 : 1})`;
    }
}
