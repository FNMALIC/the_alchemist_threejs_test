// constellations.js - Rest your gaze on a constellation for a moment, and its figure draws itself
// between the stars, like a pen going from one star to the next, each star ringed as the line
// reaches it; then its name appears beside it. Look away and it fades.
//
// The figures (all 88, from d3-celestial; see scripts/build-constellations.mjs) live in the star
// field, so they turn with the sky. Only on a dark enough night, and only above the horizon.
import * as THREE from 'three';
import data from '../data/constellations.json';
import { equatorialVector } from './astronomy.js';

const DEG = Math.PI / 180;
const RADIUS = 695; // Just in front of the stars
const STAR_GAP = 0.8 * DEG; // Lines stop short of the stars, as in a star atlas
const STEP = 2 * DEG; // Long lines follow the sky's curve
const FIND_DISTANCE = 3.5 * DEG; // The gaze must be this close to a figure's lines to pick it...
const KEEP_DISTANCE = 9 * DEG; // ...and may wander this far before it counts as looking away
const DWELL = 0.9; // Seconds the gaze rests before the figure starts to draw
const LINGER = 0.7; // Seconds after looking away before it fades
const DRAW_SECONDS = 2.4;
const FADE_SECONDS = 0.9;
const COLOR = new THREE.Color(1.0, 0.82, 0.55);

const lineVertexShader = /* glsl */`
    attribute float progress;
    varying float vProgress;
    varying float vHorizon;
    void main() {
        vProgress = progress;
        vHorizon = smoothstep(0.0, 0.08, normalize(mat3(modelMatrix) * position).y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const lineFragmentShader = /* glsl */`
    uniform float reveal;
    uniform float opacity;
    uniform vec3 color;
    varying float vProgress;
    varying float vHorizon;
    void main() {
        if (vProgress > reveal) discard;
        // The pen's tip glows a little while it draws
        float tip = reveal < 1.0 ? smoothstep(reveal - 0.05, reveal, vProgress) : 0.0;
        gl_FragColor = vec4(color * (1.0 + 1.5 * tip), (0.5 + 0.5 * tip) * opacity * vHorizon);
        #include <colorspace_fragment>
    }
`;

const ringVertexShader = /* glsl */`
    attribute float progress;
    uniform float reveal;
    uniform float pixelRatio;
    varying float vShow;
    varying float vHorizon;
    void main() {
        // Each star's ring opens when the line reaches it, with a small overshoot
        float t = clamp((reveal - progress) / 0.08, 0.0, 1.0);
        vShow = t;
        vHorizon = smoothstep(0.0, 0.08, normalize(mat3(modelMatrix) * position).y);
        gl_PointSize = 13.0 * pixelRatio * (t + 0.35 * sin(t * 3.14159));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const ringFragmentShader = /* glsl */`
    uniform float opacity;
    uniform vec3 color;
    varying float vShow;
    varying float vHorizon;
    void main() {
        float d = length(gl_PointCoord - 0.5);
        float ring = smoothstep(0.5, 0.42, d) * smoothstep(0.28, 0.36, d);
        if (ring <= 0.0 || vShow <= 0.0) discard;
        gl_FragColor = vec4(color, ring * 0.45 * vShow * opacity * vHorizon);
        #include <colorspace_fragment>
    }
`;

// Angle between unit vector p and the great-circle arc a-b
function distanceToArc(p, a, b, normal) {
    const side = p.dot(normal);
    const along = new THREE.Vector3().crossVectors(a, p).dot(normal) >= 0 &&
        new THREE.Vector3().crossVectors(p, b).dot(normal) >= 0;
    if (along) return Math.abs(Math.asin(THREE.MathUtils.clamp(side, -1, 1)));
    return Math.min(p.angleTo(a), p.angleTo(b));
}

export class Constellations {
    // sky: the Sky (its star field carries the figures); label: the element for the name
    // blockers: solid things (the old tree, palms, rocks) the sky can't be seen through
    constructor(sky, label, blockers = []) {
        this.sky = sky;
        this.label = label;
        this.blockers = blockers;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 40;
        this.labelName = label.querySelector('.name');
        this.labelMeaning = label.querySelector('.meaning');
        this.group = new THREE.Group();
        sky.starField.add(this.group); // Turns with the stars

        this.uniforms = {
            pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
            color: { value: COLOR }
        };
        this.figures = data.constellations.map(constellation => this.createFigure(constellation));

        this.candidate = null; // The figure the gaze is resting on, not yet drawn
        this.dwell = 0;
        this.current = null; // The figure drawn (or drawing) now
        this.away = 0;
        this.checkTimer = 0;

        this.toSky = new THREE.Matrix3(); // Scene directions to equatorial ones
        this.gaze = new THREE.Vector3();
        this.view = new THREE.Vector3(); // The gaze in scene directions
        this.eye = new THREE.Vector3();
        this.point = new THREE.Vector3();
    }

    createFigure({ id, name, meaning, lines }) {
        const arcs = []; // For the gaze: { a, b, normal } between neighbouring stars
        const stars = []; // Unique star positions, with when the pen reaches them
        const pieces = []; // Line pieces: [from, to] with their progress

        // Lay out the pen's path, line after line, to know where it is at each moment
        let total = 0;
        const paths = lines.map(flat => {
            const points = [];
            for (let i = 0; i < flat.length; i += 2) points.push(equatorialVector(flat[i], flat[i + 1]));
            return points;
        });
        paths.forEach(points => {
            for (let i = 1; i < points.length; i++) total += points[i - 1].angleTo(points[i]);
        });

        let travelled = 0;
        const seen = new Map();
        const addStar = (point, progress) => {
            const key = `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;
            if (!seen.has(key)) {
                seen.set(key, true);
                stars.push({ point, progress });
            }
        };
        paths.forEach(points => {
            addStar(points[0], travelled / total);
            for (let i = 1; i < points.length; i++) {
                const a = points[i - 1], b = points[i];
                const angle = a.angleTo(b);
                const normal = new THREE.Vector3().crossVectors(a, b).normalize();
                arcs.push({ a, b, normal });

                // Along the great circle from a to b, leaving a gap at each star
                const gap = Math.min(STAR_GAP, angle * 0.3);
                const steps = Math.max(1, Math.ceil((angle - 2 * gap) / STEP));
                for (let s = 0; s < steps; s++) {
                    const from = gap + (angle - 2 * gap) * (s / steps);
                    const to = gap + (angle - 2 * gap) * ((s + 1) / steps);
                    pieces.push([
                        a.clone().applyAxisAngle(normal, from), (travelled + from) / total,
                        a.clone().applyAxisAngle(normal, to), (travelled + to) / total
                    ]);
                }
                travelled += angle;
                addStar(b, travelled / total);
            }
        });

        const linePositions = new Float32Array(pieces.length * 6);
        const lineProgress = new Float32Array(pieces.length * 2);
        pieces.forEach(([from, fromProgress, to, toProgress], i) => {
            from.clone().multiplyScalar(RADIUS).toArray(linePositions, i * 6);
            to.clone().multiplyScalar(RADIUS).toArray(linePositions, i * 6 + 3);
            lineProgress[i * 2] = fromProgress;
            lineProgress[i * 2 + 1] = toProgress;
        });
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
        lineGeometry.setAttribute('progress', new THREE.BufferAttribute(lineProgress, 1));

        const ringPositions = new Float32Array(stars.length * 3);
        const ringProgress = new Float32Array(stars.length);
        stars.forEach(({ point, progress }, i) => {
            point.clone().multiplyScalar(RADIUS).toArray(ringPositions, i * 3);
            ringProgress[i] = progress;
        });
        const ringGeometry = new THREE.BufferGeometry();
        ringGeometry.setAttribute('position', new THREE.BufferAttribute(ringPositions, 3));
        ringGeometry.setAttribute('progress', new THREE.BufferAttribute(ringProgress, 1));

        const uniforms = { ...this.uniforms, reveal: { value: 0 }, opacity: { value: 0 } };
        const material = shaders => new THREE.ShaderMaterial({
            uniforms, ...shaders, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        const lineMesh = new THREE.LineSegments(lineGeometry, material({
            vertexShader: lineVertexShader, fragmentShader: lineFragmentShader
        }));
        const ringMesh = new THREE.Points(ringGeometry, material({
            vertexShader: ringVertexShader, fragmentShader: ringFragmentShader
        }));
        const figure = new THREE.Group();
        figure.add(lineMesh, ringMesh);
        figure.visible = false;
        lineMesh.renderOrder = ringMesh.renderOrder = -0.5; // Over the stars
        lineMesh.frustumCulled = ringMesh.frustumCulled = false;
        this.group.add(figure);

        return {
            id, name, meaning, arcs, object: figure, uniforms,
            stars: stars.map(star => star.point),
            reveal: 0, opacity: 0, showing: false
        };
    }

    // How far the gaze (an equatorial direction) is from the figure's lines
    distance(figure, gaze) {
        let best = Infinity;
        for (const { a, b, normal } of figure.arcs) best = Math.min(best, distanceToArc(gaze, a, b, normal));
        return best;
    }

    nearest(gaze) {
        let found = null;
        let best = FIND_DISTANCE;
        for (const figure of this.figures) {
            const distance = this.distance(figure, gaze);
            if (distance < best) {
                best = distance;
                found = figure;
            }
        }
        return found;
    }

    // enabled: the player is looking around (pointer locked, nothing else in focus)
    update(delta, camera, enabled) {
        const sky = this.sky;
        camera.getWorldDirection(this.point);
        this.view.copy(this.point);
        camera.getWorldPosition(this.eye);
        // Dark enough to see the stars, clear air, and looking above the horizon
        const canSee = enabled && sky.faintestMagnitude > 2.5 && sky.storm < 0.3 && this.point.y > 0.05;

        if (canSee) {
            this.toSky.setFromMatrix4(sky.starField.matrix).transpose();
            this.gaze.copy(this.point).applyMatrix3(this.toSky).normalize();
            this.follow(delta);
        } else {
            this.candidate = null;
            this.dwell = 0;
            if (this.current) this.letGo();
        }

        this.animate(delta, camera);
    }

    follow(delta) {
        // Still looking at the figure that is drawn?
        if (this.current) {
            if (this.distance(this.current, this.gaze) < KEEP_DISTANCE) {
                this.away = 0;
                return;
            }
            this.away += delta;
            if (this.away < LINGER) return;
            this.letGo();
        }

        // Looking for a figure to rest on (a few times a second is plenty), with nothing in the way
        this.checkTimer -= delta;
        if (this.checkTimer <= 0) {
            this.checkTimer = 0.1;
            const found = this.skyIsClear() ? this.nearest(this.gaze) : null;
            if (found !== this.candidate) {
                this.candidate = found;
                this.dwell = 0;
            }
        }
        if (!this.candidate) return;
        this.dwell += delta;
        if (this.dwell >= DWELL) {
            this.current = this.candidate;
            this.current.showing = true;
            this.current.reveal = 0;
            this.current.object.visible = true;
            this.candidate = null;
            this.dwell = 0;
            this.away = 0;
            this.labelName.textContent = this.current.name;
            this.labelMeaning.textContent = this.current.meaning;
        }
    }

    // Nothing solid (leaves, a trunk) between the eye and the sky along the gaze
    skyIsClear() {
        this.raycaster.set(this.eye, this.view);
        return this.raycaster.intersectObjects(this.blockers, true).length === 0;
    }

    letGo() {
        this.current.showing = false;
        this.current = null;
        this.away = 0;
    }

    animate(delta, camera) {
        for (const figure of this.figures) {
            if (!figure.object.visible) continue;
            if (figure.showing) {
                figure.reveal = Math.min(1, figure.reveal + delta / DRAW_SECONDS);
                figure.opacity = Math.min(1, figure.opacity + delta / 0.3);
            } else {
                figure.opacity = Math.max(0, figure.opacity - delta / FADE_SECONDS);
                if (figure.opacity === 0) figure.object.visible = false;
            }
            // Ease the pen: quick in the middle, gentle at the start and the end
            const t = figure.reveal;
            figure.uniforms.reveal.value = t * t * (3 - 2 * t);
            figure.uniforms.opacity.value = figure.opacity;
        }
        this.placeLabel(camera);
    }

    // The name, just under the figure (or over it, near the bottom of the view), once most of it
    // is drawn
    placeLabel(camera) {
        const figure = this.current ?? this.figures.find(f => f.object.visible && f.name === this.labelName.textContent);
        const shown = figure ? figure.opacity * THREE.MathUtils.smoothstep(figure.reveal, 0.55, 0.9) : 0;
        if (shown <= 0.01) {
            this.label.style.opacity = 0;
            return;
        }

        // Where the figure's stars are on screen (0..1 from the top left)
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (const star of figure.stars) {
            this.point.copy(star).applyMatrix4(this.sky.starField.matrix).multiplyScalar(RADIUS)
                .add(this.sky.group.position).project(camera);
            if (this.point.z > 1) continue; // Behind the camera
            const x = (this.point.x + 1) / 2, y = (1 - this.point.y) / 2;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
        if (left === Infinity) {
            this.label.style.opacity = 0;
            return;
        }

        const height = window.innerHeight;
        const below = bottom + 34 / height < 0.85;
        const x = THREE.MathUtils.clamp((left + right) / 2, 0.08, 0.92);
        const y = below ? bottom + 34 / height : Math.max(0.06, top - 34 / height);
        this.label.style.left = `${x * 100}%`;
        this.label.style.top = `${y * 100}%`;
        this.label.style.opacity = shown;
        this.label.style.transform = `translate(-50%, calc(-50% + ${(1 - shown) * 8}px))`;
    }
}
