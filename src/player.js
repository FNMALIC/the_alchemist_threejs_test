// player.js - First-person movement with pointer lock and WASD / arrow keys
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

const ACCELERATION = 20.0;
const DAMPING = 10.0;

export class Player {
    constructor(camera, domElement) {
        this.controls = new PointerLockControls(camera, domElement);
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.moving = { forward: false, backward: false, left: false, right: false };

        document.addEventListener('keydown', event => this.setKey(event.code, true));
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

    update(delta) {
        if (!this.controls.isLocked) return;

        const { velocity, direction, moving } = this;

        // Slow down
        velocity.x -= velocity.x * DAMPING * delta;
        velocity.z -= velocity.z * DAMPING * delta;

        direction.z = Number(moving.forward) - Number(moving.backward);
        direction.x = Number(moving.right) - Number(moving.left);
        direction.normalize();

        // Accelerate in the direction we're facing
        if (moving.forward || moving.backward) velocity.z -= direction.z * ACCELERATION * delta;
        if (moving.left || moving.right) velocity.x -= direction.x * ACCELERATION * delta;

        this.controls.moveRight(-velocity.x * delta);
        this.controls.moveForward(-velocity.z * delta);
    }
}
