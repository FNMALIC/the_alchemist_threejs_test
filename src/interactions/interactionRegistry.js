// interactionRegistry.js - The things in the world that can be interacted with. The gaze only ever
// looks among these, never through the rest of the scene.
//
// Events: 'add' and 'remove', each with { interactable }.
import { EventDispatcher } from 'three';
import { createInteractable, isInteractable } from './interactable.js';

export class InteractionRegistry extends EventDispatcher {
    constructor() {
        super();
        this.items = []; // Read-only outside this class
        this.byObject = new Map(); // Root Object3D -> interactable
        this.byId = new Map();
    }

    get size() {
        return this.items.length;
    }

    // interactable: from createInteractable(), or the same options, which are turned into one.
    // Returns the interactable.
    register(interactable) {
        const item = isInteractable(interactable) ? interactable : createInteractable(interactable);
        if (this.byObject.get(item.object) === item) return item;
        if (this.byId.has(item.id)) throw new Error(`An interactable called "${item.id}" is already registered`);
        if (this.byObject.has(item.object)) throw new Error(`"${item.id}" uses an object that is already registered`);

        item.updateBounds();
        this.items.push(item);
        this.byObject.set(item.object, item);
        this.byId.set(item.id, item);
        this.dispatchEvent({ type: 'add', interactable: item });
        return item;
    }

    unregister(interactable) {
        const index = this.items.indexOf(interactable);
        if (index === -1) return false;
        this.items.splice(index, 1);
        this.byObject.delete(interactable.object);
        this.byId.delete(interactable.id);
        this.dispatchEvent({ type: 'remove', interactable });
        return true;
    }

    clear() {
        while (this.items.length > 0) this.unregister(this.items[this.items.length - 1]);
    }

    has(interactable) {
        return this.byObject.get(interactable?.object) === interactable;
    }

    get(id) {
        return this.byId.get(id) ?? null;
    }

    // The interactable that an Object3D (e.g. a mesh hit by a ray) belongs to, or null
    findByObject(object) {
        for (let current = object; current; current = current.parent) {
            const item = this.byObject.get(current);
            if (item) return item;
        }
        return null;
    }
}
