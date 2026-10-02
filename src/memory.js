// memory.js - What the desert remembers between visits, kept in this browser only:
// how many times you have sat under the old tree, the path of your last walk, and the sky of
// your last visit (so the next one can notice how it has changed).
// Storage can be unavailable (private windows, blocked site data); then nothing is remembered.

const KEY = 'mirage-of-light';
const MAX_POINTS = 400;

export function loadMemory() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        return {
            journeys: Number.isInteger(saved?.journeys) ? saved.journeys : 0,
            path: Array.isArray(saved?.path) ? saved.path : [],
            lastVisit: saved?.lastVisit && typeof saved.lastVisit === 'object' ? saved.lastVisit : null
        };
    } catch {
        return { journeys: 0, path: [], lastVisit: null };
    }
}

// The sky of this visit: { day (the dawn's date, ms), moonUp, moonFraction, morningStar }
// (sky: Sky at the start of the night; morningStar: whether Venus rises before the sun)
export function skyOfThisVisit(sky, morningStar) {
    return {
        day: sky.clock.start,
        moonUp: sky.moonAltitude > 0,
        moonFraction: Math.round(sky.moonFraction * 100) / 100,
        morningStar
    };
}

// One line noticing how the sky has changed since last time, or null on a first visit
export function returnLine(previous, now) {
    if (!previous || typeof previous.day !== 'number') return null;
    const days = Math.abs(now.day - previous.day) / 86400000;
    if (days < 0.5) return 'The same night again. The sky has hardly moved.';
    if (now.moonUp && !previous.moonUp) return 'A moon tonight. Last time there was none.';
    if (!now.moonUp && previous.moonUp) return 'No moon tonight. Last time it lit the sand.';
    if (now.moonUp && previous.moonUp && Math.abs(now.moonFraction - previous.moonFraction) > 0.2) {
        return now.moonFraction > previous.moonFraction ? 'The moon is fuller than last time.' : 'The moon is thinner than last time.';
    }
    if (now.morningStar && !previous.morningStar) return 'The morning star is back.';
    if (!now.morningStar && previous.morningStar) return 'No morning star this time.';
    if (days > 60) return 'Other stars this time. The seasons have turned.';
    return 'Some nights have passed. The stars have moved on a little.';
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
