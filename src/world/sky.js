// sky.js - The real sky over the oasis: 5,000 naked-eye stars, the moon in its true phase,
// the bright planets, and twilight colours driven by the sun's altitude.
// Follows the camera so it never gets closer.
import * as THREE from 'three';
import { Body } from 'astronomy-engine';
import starData from '../data/stars.json';
import {
    SkyFrame, SkyClock, findDawn, horizontalPosition, equatorialVector, brightness, PLANETS
} from './astronomy.js';

const SKY_RADIUS = 800;
const STAR_RADIUS = 700;
const UPDATE_EVERY_MS = 15 * 1000; // Recompute positions every 15 seconds of sky time

// Sky colours by sun altitude (degrees): full night -> twilight -> sunrise
const PALETTE = [
    { altitude: -18, zenith: 0x02030a, horizon: 0x0c1226, glow: 0x05050c },
    { altitude: -12, zenith: 0x03060f, horizon: 0x151d38, glow: 0x1a1830 },
    { altitude: -8, zenith: 0x08122b, horizon: 0x2c3862, glow: 0x5a3a55 },
    { altitude: -4, zenith: 0x16295a, horizon: 0x5e6590, glow: 0xc0654a },
    { altitude: 0, zenith: 0x2c4f8f, horizon: 0xb3a0a8, glow: 0xff9a50 },
    { altitude: 4, zenith: 0x3d6aae, horizon: 0xd8c2a8, glow: 0xffc070 }
];

// Faintest visible magnitude by sun altitude: stars fade out in the right order as dawn comes
const LIMITING_MAGNITUDE = [
    { altitude: -18, value: 6.0 },
    { altitude: -12, value: 4.8 },
    { altitude: -9, value: 3.2 },
    { altitude: -6, value: 1.6 },
    { altitude: -3, value: 0.0 },
    { altitude: 0, value: -2.5 },
    { altitude: 3, value: -4.2 }
];

// Linear interpolation in a table sorted by altitude
function interpolate(table, altitude, read) {
    if (altitude <= table[0].altitude) return read(table[0], table[0], 0);
    for (let i = 1; i < table.length; i++) {
        if (altitude <= table[i].altitude) {
            const t = (altitude - table[i - 1].altitude) / (table[i].altitude - table[i - 1].altitude);
            return read(table[i - 1], table[i], t);
        }
    }
    const last = table[table.length - 1];
    return read(last, last, 0);
}

const blendColor = new THREE.Color();

function paletteColor(altitude, key, target) {
    return interpolate(PALETTE, altitude, (a, b, t) => target.setHex(a[key]).lerp(blendColor.setHex(b[key]), t));
}

function limitingMagnitude(altitude) {
    return interpolate(LIMITING_MAGNITUDE, altitude, (a, b, t) => a.value + (b.value - a.value) * t);
}

// Approximate star colour from its B-V colour index
function starColor(colorIndex, target) {
    const bv = THREE.MathUtils.clamp(colorIndex, -0.4, 2.0);
    const temperature = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));

    // Blackbody-ish RGB (after Tanner Helland's approximation)
    const t = temperature / 100;
    const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
    const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * Math.pow(t - 60, -0.0755);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
    target.setRGB(
        THREE.MathUtils.clamp(r, 0, 255) / 255,
        THREE.MathUtils.clamp(g, 0, 255) / 255,
        THREE.MathUtils.clamp(b, 0, 255) / 255,
        THREE.SRGBColorSpace
    );
    // Real star colours are subtle to the eye
    return target.lerp(blendColor.setRGB(1, 1, 1), 0.35);
}

const pointVertexShader = /* glsl */`
    attribute float magnitude;
    attribute vec3 starColor;
    attribute float seed;
    uniform float limitingMagnitude;
    uniform float time;
    uniform float pixelRatio;
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        // Fade near the horizon, where starlight passes through more air
        vec3 direction = normalize(mat3(modelMatrix) * position);
        float horizonFade = smoothstep(-0.02, 0.15, direction.y);

        // Fade in and out around the current limiting magnitude
        float visible = clamp((limitingMagnitude - magnitude) / 1.2, 0.0, 1.0);
        float intensity = clamp(1.25 - 0.15 * magnitude, 0.3, 1.0);

        // Gentle twinkling, stronger low in the sky
        float twinkleAmount = mix(0.35, 0.1, clamp(direction.y * 2.0, 0.0, 1.0));
        float twinkle = 1.0 - twinkleAmount * (0.5 + 0.5 * sin(time * (1.5 + seed * 3.0) + seed * 60.0));

        vColor = starColor;
        vAlpha = intensity * visible * horizonFade * twinkle;

        gl_PointSize = clamp(3.8 - 0.5 * magnitude, 1.4, 7.0) * pixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const pointFragmentShader = /* glsl */`
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        float distance = length(gl_PointCoord - 0.5);
        float disc = smoothstep(0.5, 0.1, distance);
        gl_FragColor = vec4(vColor, vAlpha * disc);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

function createPointMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            limitingMagnitude: { value: 6 },
            time: { value: 0 },
            pixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
        },
        vertexShader: pointVertexShader,
        fragmentShader: pointFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
}

export class Sky {
    // sceneBearing: bearing of the light the player walks toward; the sun rises behind it.
    // date: which morning to show (defaults to today)
    constructor({ sceneBearing, date }) {
        const dawn = findDawn(date);
        this.frame = new SkyFrame({ azimuth: dawn.sunriseAzimuth, sceneBearing });
        this.clock = new SkyClock(dawn);

        this.sunDirection = new THREE.Vector3();
        this.moonDirection = new THREE.Vector3();
        this.sunAltitude = -18;
        this.moonAltitude = -90;
        this.moonFraction = 0;
        this.lastUpdate = -Infinity;
        this.colors = {
            zenith: new THREE.Color(),
            horizon: new THREE.Color(),
            glow: new THREE.Color()
        };

        this.storm = 0; // 0 clear .. 1 sandstorm (set by World)
        this.stormColor = new THREE.Color();

        this.group = new THREE.Group();
        this.group.add(this.createDome());

        this.starField = this.createStars();
        this.group.add(this.starField);

        this.planets = this.createPlanets();
        this.group.add(this.planets);

        this.moon = this.createMoon();
        this.group.add(this.moon);

        this.sun = this.createSun();
        this.group.add(this.sun);

        this.lights = {
            hemisphere: new THREE.HemisphereLight(0x33406a, 0x1a1510, 0.5),
            moon: new THREE.DirectionalLight(0xaabbff, 0),
            sun: new THREE.DirectionalLight(0xffa860, 0)
        };
        this.shadowFocus = new THREE.Vector3();

        // A copy of the dome alone, rendered into a reflection map for the water and other surfaces
        this.environmentScene = new THREE.Scene();
        this.environmentScene.add(new THREE.Mesh(this.group.children[0].geometry, this.group.children[0].material));
        this.environmentAltitude = Infinity;
        this.environmentTarget = null;
        this.nightSky = new THREE.Color(0x33406a);
        this.dawnSky = new THREE.Color(0x9fb0d8);
        this.nightGround = new THREE.Color(0x1a1510);
        this.dawnGround = new THREE.Color(0xa07048);

        this.updatePositions(true);
    }

    createDome() {
        const material = this.domeMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                stormColor: { value: this.stormColor },
                stormAmount: { value: 0 },
                zenithColor: { value: this.colors.zenith },
                horizonColor: { value: this.colors.horizon },
                glowColor: { value: this.colors.glow },
                sunDirection: { value: this.sunDirection }
            },
            vertexShader: /* glsl */`
                varying vec3 vDirection;
                void main() {
                    vDirection = normalize(position);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform vec3 stormColor;
                uniform float stormAmount;
                uniform vec3 zenithColor;
                uniform vec3 horizonColor;
                uniform vec3 glowColor;
                uniform vec3 sunDirection;
                varying vec3 vDirection;
                void main() {
                    vec3 direction = normalize(vDirection);
                    vec3 color = mix(horizonColor, zenithColor, smoothstep(0.0, 0.6, direction.y));

                    // Dawn glow on the horizon toward the (still hidden) sun
                    vec3 flatSun = normalize(vec3(sunDirection.x, 0.0, sunDirection.z));
                    float towardSun = max(dot(normalize(vec3(direction.x, 0.0, direction.z)), flatSun), 0.0);
                    float nearHorizon = 1.0 - smoothstep(0.0, 0.45, abs(direction.y));
                    color += glowColor * pow(towardSun, 4.0) * nearHorizon;

                    color = mix(color, stormColor, stormAmount); // A sandstorm hides the sky
                    gl_FragColor = vec4(color, 1.0);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }
            `
        });

        const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), material);
        dome.renderOrder = -2;
        return dome;
    }

    createStars() {
        const values = starData.stars;
        const count = values.length / 4;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const magnitudes = new Float32Array(count);
        const seeds = new Float32Array(count);
        const vector = new THREE.Vector3();
        const color = new THREE.Color();

        for (let i = 0; i < count; i++) {
            const [ra, dec, magnitude, colorIndex] = values.slice(i * 4, i * 4 + 4);
            equatorialVector(ra, dec, vector).multiplyScalar(STAR_RADIUS).toArray(positions, i * 3);
            starColor(colorIndex, color).toArray(colors, i * 3);
            magnitudes[i] = magnitude;
            seeds[i] = Math.random();
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('starColor', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('magnitude', new THREE.BufferAttribute(magnitudes, 1));
        geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

        const stars = new THREE.Points(geometry, createPointMaterial());
        stars.matrixAutoUpdate = false; // Rotated to the sky's time in updatePositions()
        stars.frustumCulled = false;
        stars.renderOrder = -1;
        return stars;
    }

    // Venus, Jupiter, Mars and Saturn as bright points, positioned each update
    createPlanets() {
        const count = PLANETS.length;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setAttribute('magnitude', new THREE.BufferAttribute(new Float32Array(count), 1));
        geometry.setAttribute('seed', new THREE.BufferAttribute(new Float32Array(count).fill(0.5), 1));

        const colors = [0xfff6e0, 0xfff0d8, 0xffb080, 0xffe8b0]; // Venus, Jupiter, Mars, Saturn
        const colorArray = new Float32Array(count * 3);
        colors.forEach((hex, i) => new THREE.Color(hex).toArray(colorArray, i * 3));
        geometry.setAttribute('starColor', new THREE.BufferAttribute(colorArray, 3));

        const planets = new THREE.Points(geometry, createPointMaterial());
        planets.frustumCulled = false;
        planets.renderOrder = -1;
        return planets;
    }

    // The moon, shaded by the real direction of the sun so it shows its true phase
    createMoon() {
        const moon = new THREE.Group();

        const disc = new THREE.Mesh(
            new THREE.SphereGeometry(13, 32, 16), // About 4x the real size, so it reads on screen
            new THREE.ShaderMaterial({
                uniforms: { sunDirection: { value: this.sunDirection } },
                vertexShader: /* glsl */`
                    varying vec3 vNormal;
                    void main() {
                        vNormal = normalize(mat3(modelMatrix) * normal);
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: /* glsl */`
                    uniform vec3 sunDirection;
                    varying vec3 vNormal;
                    void main() {
                        float light = smoothstep(-0.05, 0.1, dot(normalize(vNormal), sunDirection));
                        vec3 earthshine = vec3(0.06, 0.07, 0.09);
                        gl_FragColor = vec4(mix(earthshine, vec3(0.96, 0.94, 0.86), light) * 1.6, 1.0);
                        #include <tonemapping_fragment>
                        #include <colorspace_fragment>
                    }
                `
            })
        );
        moon.add(disc);

        this.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: createGlowTexture('rgba(200, 210, 255, 0.5)'),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
        }));
        this.moonHalo.scale.setScalar(110);
        moon.add(this.moonHalo);

        return moon;
    }

    createSun() {
        const sun = new THREE.Sprite(new THREE.SpriteMaterial({
            map: createGlowTexture('rgba(255, 220, 160, 1)'),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
        }));
        sun.material.color.setRGB(3, 2.4, 1.6); // Brighter than white, so the bloom catches it
        sun.scale.setScalar(120);
        return sun;
    }

    // Recompute sun, moon, planet and star positions for the current sky time
    updatePositions(force = false) {
        const date = this.clock.date;
        if (!force && Math.abs(date.getTime() - this.lastUpdate) < UPDATE_EVERY_MS) return;
        this.lastUpdate = date.getTime();

        const sun = horizontalPosition(Body.Sun, date);
        this.sunAltitude = sun.altitude;
        this.frame.direction(sun.azimuth, sun.altitude, this.sunDirection);

        const moon = horizontalPosition(Body.Moon, date);
        this.moonAltitude = moon.altitude;
        this.moonFraction = brightness(Body.Moon, date).phase_fraction;
        this.frame.direction(moon.azimuth, moon.altitude, this.moonDirection);

        // Stars: rotate the whole field at once
        this.frame.equatorialToScene(date, this.starField.matrix);
        this.starField.matrixWorldNeedsUpdate = true;

        // Planets
        const planetPositions = this.planets.geometry.attributes.position;
        const planetMagnitudes = this.planets.geometry.attributes.magnitude;
        const direction = new THREE.Vector3();
        PLANETS.forEach((body, i) => {
            const { azimuth, altitude } = horizontalPosition(body, date);
            this.frame.direction(azimuth, altitude, direction).multiplyScalar(STAR_RADIUS);
            planetPositions.setXYZ(i, direction.x, direction.y, direction.z);
            planetMagnitudes.setX(i, brightness(body, date).mag);
        });
        planetPositions.needsUpdate = true;
        planetMagnitudes.needsUpdate = true;

        this.moon.position.copy(this.moonDirection).multiplyScalar(STAR_RADIUS);
        this.sun.position.copy(this.sunDirection).multiplyScalar(STAR_RADIUS);
    }

    update(delta, elapsed, camera, distanceWalked) {
        this.clock.update(delta, distanceWalked);
        this.updatePositions();

        this.group.position.copy(camera.position);

        const sunAltitude = this.sunAltitude;
        paletteColor(sunAltitude, 'zenith', this.colors.zenith);
        paletteColor(sunAltitude, 'horizon', this.colors.horizon);
        paletteColor(sunAltitude, 'glow', this.colors.glow);

        const faintest = limitingMagnitude(sunAltitude);
        [this.starField, this.planets].forEach(points => {
            points.material.uniforms.limitingMagnitude.value = faintest - this.storm * 9;
            points.material.uniforms.time.value = elapsed;
        });

        // Moon and sun visibility
        this.moon.visible = this.moonAltitude > -3 && this.storm < 0.5;
        this.domeMaterial.uniforms.stormAmount.value = this.storm * 0.95;
        this.moonHalo.material.opacity = this.moonFraction * (1 - THREE.MathUtils.smoothstep(sunAltitude, -10, 0));
        this.sun.visible = sunAltitude > -3;

        // Light on the ground: moonlight at night, warming to sunlight at dawn
        const dawn = THREE.MathUtils.smoothstep(sunAltitude, -12, 3);
        const { hemisphere, moon, sun } = this.lights;
        hemisphere.color.copy(this.nightSky).lerp(this.dawnSky, dawn);
        hemisphere.groundColor.copy(this.nightGround).lerp(this.dawnGround, dawn);
        hemisphere.intensity = (0.5 + dawn * 0.6) * (1 - 0.35 * this.storm);

        moon.intensity = 1.1 * this.moonFraction *
            THREE.MathUtils.smoothstep(this.moonAltitude, -2, 10) * (1 - dawn);
        sun.intensity = 4 * THREE.MathUtils.smoothstep(sunAltitude, -4, 4);
        moon.intensity *= 1 - 0.8 * this.storm;
        sun.intensity *= 1 - 0.8 * this.storm;

        // Lights (and their shadow area) follow the player; snapped to a grid to avoid shimmering
        this.shadowFocus.set(Math.round(camera.position.x), 0, Math.round(camera.position.z));
        this.shadowFocus.y = camera.position.y;
        moon.target.position.copy(this.shadowFocus);
        sun.target.position.copy(this.shadowFocus);
        moon.position.copy(this.moonDirection).multiplyScalar(100).add(this.shadowFocus);
        sun.position.copy(this.sunDirection).multiplyScalar(100).add(this.shadowFocus);

        // Only the stronger of the two casts shadows
        const sunLeads = sun.intensity > moon.intensity;
        sun.castShadow = this.shadowsEnabled && sunLeads && sun.intensity > 0.05;
        moon.castShadow = this.shadowsEnabled && !sunLeads && moon.intensity > 0.05;
    }

    // Soft shadows from the moon and sun, in an 80 x 80 area around the player
    enableShadows() {
        this.shadowsEnabled = true;
        [this.lights.moon, this.lights.sun].forEach(light => {
            light.shadow.mapSize.set(2048, 2048);
            const camera = light.shadow.camera;
            camera.left = camera.bottom = -40;
            camera.right = camera.top = 40;
            camera.near = 1;
            camera.far = 250;
            light.shadow.bias = -0.0004;
            light.shadow.normalBias = 0.04;
            light.shadow.radius = 3;
        });
    }

    // Reflection map of the current sky, re-rendered whenever the sun has moved by a degree
    updateEnvironment(renderer) {
        if (Math.abs(this.sunAltitude - this.environmentAltitude) < 1) return null;
        this.environmentAltitude = this.sunAltitude;

        this.pmrem ??= new THREE.PMREMGenerator(renderer);
        const previous = this.environmentTarget;
        this.environmentTarget = this.pmrem.fromScene(this.environmentScene, 0, 1, 1000);
        previous?.dispose();
        return this.environmentTarget.texture;
    }

    // Colour the fog should use so distant dunes melt into the horizon
    get horizonColor() {
        return this.colors.horizon;
    }

    // 0 at full night .. 1 at sunrise
    get dawnProgress() {
        return this.clock.progress;
    }
}

// Soft radial glow, shared by the moon halo, the sun and the orb
export function createGlowTexture(innerColor, size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    // Fade quickly from the centre so the edge of the sprite is never visible
    const [r, g, b, a] = innerColor.match(/[\d.]+/g).map(Number);
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(0.25, `rgba(${r}, ${g}, ${b}, ${a * 0.35})`);
    gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${a * 0.08})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}
