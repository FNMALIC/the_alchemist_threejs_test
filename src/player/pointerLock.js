// pointerLock.js - The Pointer Lock API: hides the cursor and turns mouse movement into looking
// around. Esc (handled by the browser) releases it; clicking locks it again.
//
// Events: 'lock', 'unlock'. Mouse movement goes to onMove(dx, dy) (pixels) while locked.
import { EventDispatcher } from 'three';

// Browsers sometimes report a huge jump in a single mouse event (the first one after locking, or
// a known spike on some systems); those would snap the view around, so they are ignored.
const MAX_MOVEMENT = 400; // Pixels in one event

export class PointerLock extends EventDispatcher {
    constructor(element = document.body) {
        super();
        this.element = element;
        this.isLocked = false;
        this.onMove = null;
        this.skipNextMove = false;

        document.addEventListener('pointerlockchange', () => this.handleChange());
        document.addEventListener('mousemove', event => this.handleMove(event));
    }

    lock() {
        if (this.isLocked) return;
        // Browsers refuse a lock straight after Esc (and Chrome then rejects the returned promise).
        // Nothing is lost: the "Click to start" message stays up and the next click tries again.
        this.element.requestPointerLock()?.catch?.(() => {});
    }

    unlock() {
        if (this.isLocked) document.exitPointerLock();
    }

    handleChange() {
        const locked = document.pointerLockElement === this.element;
        if (locked === this.isLocked) return;
        this.isLocked = locked;
        this.skipNextMove = locked;
        this.dispatchEvent({ type: locked ? 'lock' : 'unlock' });
    }

    handleMove(event) {
        if (!this.isLocked) return;
        if (this.skipNextMove) {
            this.skipNextMove = false;
            return;
        }
        const { movementX, movementY } = event;
        if (Math.abs(movementX) > MAX_MOVEMENT || Math.abs(movementY) > MAX_MOVEMENT) return;
        this.onMove?.(movementX, movementY);
    }
}
