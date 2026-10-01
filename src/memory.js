// memory.js - What the desert remembers between visits, kept in this browser only:
// how many times you have sat under the old tree, and the path of your last walk.
// Storage can be unavailable (private windows, blocked site data); then nothing is remembered.

const KEY = 'mirage-of-light';
const MAX_POINTS = 400;

export function loadMemory() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        return {
            journeys: Number.isInteger(saved?.journeys) ? saved.journeys : 0,
            path: Array.isArray(saved?.path) ? saved.path : []
        };
    } catch {
        return { journeys: 0, path: [] };
    }
}

export function saveMemory(memory) {
    try {
        localStorage.setItem(KEY, JSON.stringify(memory));
    } catch {
        // Nothing to do: this visit just won't be remembered
    }
}

// Records where you walk, a point every couple of metres
export class PathRecorder {
    constructor(spacing = 2) {
        this.spacing = spacing;
        this.points = []; // [x, z] pairs
    }

    add(x, z) {
        const last = this.points[this.points.length - 1];
        if (last && Math.hypot(x - last[0], z - last[1]) < this.spacing) return;
        if (this.points.length >= MAX_POINTS) return;
        this.points.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
    }
}
