// astronomy.js - The real sky over the Al-Fayoum oasis (Egypt), from night to sunrise
//
// Positions come from astronomy-engine. The scene is turned so that the sun rises
// just behind the light the player walks toward.
import * as THREE from 'three';
import {
    Observer, Body, SearchAltitude, SearchRiseSet, Equator, Horizon, Illumination
} from 'astronomy-engine';

// Al-Fayoum oasis, where Santiago stays in The Alchemist
export const OBSERVER = new Observer(29.31, 30.84, 25);
const UTC_OFFSET_HOURS = 2;

const DEG = Math.PI / 180;

export const PLANETS = [Body.Venus, Body.Jupiter, Body.Mars, Body.Saturn];

// Horizontal position (azimuth clockwise from north, altitude above horizon, in degrees)
export function horizontalPosition(body, date) {
    const equatorial = Equator(body, date, OBSERVER, true, true);
    return Horizon(date, OBSERVER, equatorial.ra, equatorial.dec);
}

// The morning's twilight at the oasis: from full night to just after sunrise.
// date: any time on the calendar day to use (defaults to today).
export function findDawn(date = new Date()) {
    // Local midnight at the oasis on that calendar day
    const midnight = new Date(Date.UTC(
        date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), -UTC_OFFSET_HOURS
    ));
    const astronomicalDawn = SearchAltitude(Body.Sun, OBSERVER, +1, midnight, 1, -18).date;
    const sunrise = SearchRiseSet(Body.Sun, OBSERVER, +1, midnight, 1).date;

    return {
        start: new Date(astronomicalDawn.getTime() - 15 * 60 * 1000), // Full night
        end: new Date(sunrise.getTime() + 10 * 60 * 1000), // Sun just clear of the horizon
        sunriseAzimuth: horizontalPosition(Body.Sun, sunrise).azimuth
    };
}

// Maps sky directions (azimuth/altitude) to scene directions.
// headingOffset rotates the sky so a chosen azimuth lines up with a chosen scene bearing.
export class SkyFrame {
    // Scene bearings are measured clockwise from -Z when seen from above (so +X is 90°)
    constructor({ azimuth, sceneBearing }) {
        this.headingOffset = sceneBearing - azimuth;
    }

    direction(azimuth, altitude, target = new THREE.Vector3()) {
        const bearing = (azimuth + this.headingOffset) * DEG;
        const alt = altitude * DEG;
        return target.set(
            Math.cos(alt) * Math.sin(bearing),
            Math.sin(alt),
            -Math.cos(alt) * Math.cos(bearing)
        );
    }

    // Rotation from equatorial coordinates (x: RA 0h, y: RA 6h, z: north celestial pole)
    // to scene directions at the given time. Applied to the whole star field at once.
    equatorialToScene(date, target = new THREE.Matrix4()) {
        const toScene = (raHours, decDegrees) => {
            const { azimuth, altitude } = Horizon(date, OBSERVER, raHours, decDegrees);
            return this.direction(azimuth, altitude);
        };
        return target.makeBasis(toScene(0, 0), toScene(6, 0), toScene(0, 90));
    }
}

// Unit vector for a star in equatorial coordinates (matches equatorialToScene's basis)
export function equatorialVector(raHours, decDegrees, target = new THREE.Vector3()) {
    const ra = raHours * 15 * DEG;
    const dec = decDegrees * DEG;
    return target.set(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
}

export function brightness(body, date) {
    return Illumination(body, date);
}

// Journey clock: time moves from night toward sunrise as the player walks,
// and slowly on its own while they stand still.
export class SkyClock {
    constructor({ start, end, walkLength = 160, idleSeconds = 900 }) {
        this.start = start.getTime();
        this.end = end.getTime();
        this.walkLength = walkLength; // Distance walked that brings the sunrise
        this.idleSeconds = idleSeconds; // Real seconds for the full dawn when standing still
        this.progress = 0;
        this.hurrySeconds = 0;
    }

    // Bring the sunrise within the given number of seconds
    hurry(seconds) {
        this.hurrySeconds = seconds;
    }

    update(delta, distanceWalked) {
        const idle = this.progress + delta / this.idleSeconds;
        const walked = distanceWalked / this.walkLength;
        const hurried = this.hurrySeconds > 0 ? this.progress + delta / this.hurrySeconds : 0;
        this.progress = Math.min(1, Math.max(idle, walked, hurried));
    }

    get date() {
        return new Date(this.start + (this.end - this.start) * this.progress);
    }
}
