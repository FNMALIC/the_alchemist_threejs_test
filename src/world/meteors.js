// meteors.js - Shooting stars at their real rates. A dark desert sky shows a handful of random
// (sporadic) meteors an hour; on the nights of a shower, more, all flying out of one point in the
// sky (the radiant), and only while it is above the horizon. Rates are per hour of your own time,
// as a real watcher would count them, so most visits see one or two, or none. You might miss them.
//
// Rates follow the visual observers' formula: hourly rate = ZHR × sin(radiant altitude) ×
// r^(limiting magnitude − 6.5), so they drop as dawn brightens the sky. Brightness follows the
// population index r: for every meteor of one magnitude there are r of the next fainter one.
import * as THREE from 'three';
import { Horizon } from 'astronomy-engine';
import { OBSERVER } from './astronomy.js';

const DEG = Math.PI / 180;
const SPORADIC_ZHR = 10; // Random meteors, pre-dawn (the morning side of the Earth meets more)
const POPULATION_INDEX = 2.5;
const RADIUS = 690; // Just inside the stars
const POOL = 3; // At most this many at once
const SEGMENTS = 20;
const WIDTH = 3; // Scene units at RADIUS (about two pixels)

// The major annual showers: peak date, zenithal hourly rate at peak, half-width of the activity
// (days), radiant (RA hours, Dec degrees) and entry speed (km/s). From the IMO shower calendar.
const SHOWERS = [
    { name: 'Quadrantids', month: 1, day: 4, zhr: 110, width: 0.6, ra: 15.33, dec: 49, speed: 41 },
    { name: 'Lyrids', month: 4, day: 22, zhr: 18, width: 1.5, ra: 18.07, dec: 34, speed: 49 },
    { name: 'Eta Aquariids', month: 5, day: 6, zhr: 50, width: 5, ra: 22.53, dec: -1, speed: 66 },
    { name: 'Southern Delta Aquariids', month: 7, day: 30, zhr: 25, width: 7, ra: 22.67, dec: -16, speed: 41 },
    { name: 'Perseids', month: 8, day: 12, zhr: 100, width: 2.5, ra: 3.2, dec: 58, speed: 59 },
    { name: 'Southern Taurids', month: 10, day: 10, zhr: 5, width: 15, ra: 2.13, dec: 9, speed: 27 },
    { name: 'Orionids', month: 10, day: 21, zhr: 20, width: 5, ra: 6.4, dec: 16, speed: 66 },
    { name: 'Northern Taurids', month: 11, day: 12, zhr: 5, width: 15, ra: 3.87, dec: 22, speed: 29 },
    { name: 'Leonids', month: 11, day: 17, zhr: 15, width: 1.5, ra: 10.27, dec: 22, speed: 71 },
    { name: 'Geminids', month: 12, day: 14, zhr: 150, width: 1.5, ra: 7.47, dec: 33, speed: 35 },
    { name: 'Ursids', month: 12, day: 22, zhr: 10, width: 1, ra: 14.47, dec: 76, speed: 33 }
];

// Days from the shower's peak to `date` (either way round the year)
function daysFromPeak(shower, date) {
    const peak = Date.UTC(date.getUTCFullYear(), shower.month - 1, shower.day);
    const days = (date.getTime() - peak) / 86400000;
    return ((days % 365.25) + 365.25 * 1.5) % 365.25 - 365.25 / 2;
}

export class Meteors {
    // frame: the SkyFrame (sky directions to scene directions)
    constructor(frame) {
        this.frame = frame;
        this.group = new THREE.Group();
        this.sources = []; // { zhr, speed, radiant: Vector3 | null, rate (per hour) }
        this.active = [];
        this.pool = Array.from({ length: POOL }, () => this.createTrail());
        this.limitingMagnitude = 6;
        this.dimming = 0; // 0 clear .. 1 hidden (a sandstorm)
    }

    createTrail() {
        const count = (SEGMENTS + 1) * 2;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 4), 4));
        const index = [];
        for (let i = 0; i < SEGMENTS; i++) {
            const a = i * 2;
            index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        geometry.setIndex(index);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false
        }));
        mesh.frustumCulled = false;
        mesh.renderOrder = -1;
        mesh.visible = false;
        this.group.add(mesh);
        return mesh;
    }

    // Which showers are active on this date, and their radiants; call when the sky time moves on
    updateSources(date) {
        const sources = [{ zhr: SPORADIC_ZHR, speed: 30 + Math.random() * 30, radiant: null }];
        for (const shower of SHOWERS) {
            const days = daysFromPeak(shower, date);
            const activity = Math.exp(-Math.LN2 * (days / shower.width) ** 2);
            if (activity < 0.02) continue;
            const { azimuth, altitude } = Horizon(date, OBSERVER, shower.ra, shower.dec);
            if (altitude <= 0) continue; // The radiant is below the horizon: none of them reach us
            sources.push({
                name: shower.name,
                zhr: shower.zhr * activity * Math.sin(altitude * DEG),
                speed: shower.speed,
                radiant: this.frame.direction(azimuth, altitude)
            });
        }
        this.sources = sources;
    }

    // delta: real seconds; limitingMagnitude: faintest star visible now
    update(delta, limitingMagnitude) {
        this.limitingMagnitude = limitingMagnitude;
        const seen = Math.pow(POPULATION_INDEX, limitingMagnitude - 6.5);
        for (const source of this.sources) {
            const perSecond = source.zhr * seen * (1 - this.dimming) / 3600;
            if (Math.random() < perSecond * delta) this.spawn(source);
        }

        for (let i = this.active.length - 1; i >= 0; i--) {
            const meteor = this.active[i];
            meteor.age += delta;
            if (meteor.age >= meteor.duration) {
                meteor.mesh.visible = false;
                this.pool.push(meteor.mesh);
                this.active.splice(i, 1);
                continue;
            }
            this.draw(meteor);
        }
    }

    spawn(source) {
        const mesh = this.pool.pop();
        if (!mesh) return;

        // Brightness: mostly faint, now and then a bright one
        const magnitude = 6.5 + Math.log(Math.random()) / Math.log(POPULATION_INDEX);
        if (magnitude > this.limitingMagnitude) {
            this.pool.push(mesh);
            return;
        }

        // Somewhere in the open sky, not too low
        const start = new THREE.Vector3();
        do {
            start.set(Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1);
        } while (start.lengthSq() > 1 || start.lengthSq() < 0.01 || start.clone().normalize().y < 0.25);
        start.normalize();

        // Shower meteors fly straight out of the radiant; their trails are short near it
        let along;
        let length;
        if (source.radiant) {
            const fromRadiant = start.angleTo(source.radiant);
            if (fromRadiant < 8 * DEG) {
                this.pool.push(mesh);
                return;
            }
            along = start.clone().sub(source.radiant.clone().multiplyScalar(start.dot(source.radiant))).normalize();
            length = (8 + Math.random() * 20) * DEG * Math.sin(Math.min(fromRadiant, Math.PI / 2));
        } else {
            along = new THREE.Vector3().randomDirection().projectOnPlane(start).normalize();
            length = (5 + Math.random() * 18) * DEG;
        }
        const axis = new THREE.Vector3().crossVectors(start, along).normalize();

        // Quick meteors cross the sky faster; a meteor lasts a fraction of a second to about one
        const duration = THREE.MathUtils.clamp(length / DEG / (source.speed * 0.45), 0.25, 1.3);
        // Fast ones are a little blue-green, slow ones yellower
        const color = new THREE.Color().setHSL(source.speed > 50 ? 0.48 : 0.12, 0.35, 0.75);
        const brightness = THREE.MathUtils.clamp(Math.pow(2.512, 2 - magnitude), 0.15, 5);

        mesh.visible = true;
        this.active.push({ mesh, start, axis, length, duration, age: 0, color, brightness });
    }

    // Lay the trail along the arc: a bright head and a tail that fades behind it
    draw({ mesh, start, axis, length, duration, age, color, brightness }) {
        const t = age / duration;
        const headAngle = length * t;
        const tailAngle = Math.max(0, headAngle - length * 0.45);
        // Flares a little, then burns out
        const light = brightness * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.6) * (1 - this.dimming);

        const positions = mesh.geometry.attributes.position;
        const colors = mesh.geometry.attributes.color;
        const point = new THREE.Vector3();
        for (let i = 0; i <= SEGMENTS; i++) {
            const s = i / SEGMENTS; // 0 tail .. 1 head
            point.copy(start).applyAxisAngle(axis, tailAngle + (headAngle - tailAngle) * s);
            const width = WIDTH * (0.35 + 0.65 * s) * Math.min(1.6, 0.7 + 0.3 * brightness);
            point.multiplyScalar(RADIUS);
            // The arc turns about `axis`, so across the trail (on the sky) is along it
            positions.setXYZ(i * 2, point.x - axis.x * width / 2, point.y - axis.y * width / 2, point.z - axis.z * width / 2);
            positions.setXYZ(i * 2 + 1, point.x + axis.x * width / 2, point.y + axis.y * width / 2, point.z + axis.z * width / 2);
            const fade = s * s * light;
            const head = s > 0.92 ? 1.6 : 1; // A brighter head, for the bloom to catch
            colors.setXYZW(i * 2, color.r * head, color.g * head, color.b * head, fade);
            colors.setXYZW(i * 2 + 1, color.r * head, color.g * head, color.b * head, fade);
        }
        positions.needsUpdate = true;
        colors.needsUpdate = true;
    }
}
