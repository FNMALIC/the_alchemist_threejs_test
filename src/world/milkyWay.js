// milkyWay.js - The Milky Way: the faint band of our galaxy, placed by real galactic coordinates
// so it lies where it really does among the stars (it turns with them). It is drawn, not
// photographed: a band that is wider and brighter toward the galactic centre (in Sagittarius),
// mottled with star clouds, split by the dark dust of the Great Rift through Cygnus and Aquila,
// plus the Andromeda galaxy as a small smudge. Only a truly dark sky shows it: it fades with
// twilight and moonlight, and low down, where the air is thick.
import * as THREE from 'three';

const RADIUS = 760; // Between the stars (700) and the sky dome (800)

// Equatorial (J2000; x: RA 0h, y: RA 6h, z: north celestial pole) to galactic coordinates
// (x: galactic centre, z: north galactic pole): the IAU rotation
const TO_GALACTIC = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [0.4941094279, -0.4448296300, 0.7469822445],
    [-0.8676661490, -0.1980763734, 0.4559837762]
].map(row => `vec3(${row.join(', ')})`);

const vertexShader = /* glsl */`
    varying vec3 vEquatorial;
    varying vec3 vSky;
    void main() {
        vEquatorial = position;
        vSky = mat3(modelMatrix) * position; // Scene direction (for the horizon)
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = /* glsl */`
    uniform float strength;
    varying vec3 vEquatorial;
    varying vec3 vSky;

    float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
            f.z);
    }
    float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 5; i++) {
            value += amplitude * noise(p);
            p *= 2.03;
            amplitude *= 0.5;
        }
        return value;
    }

    void main() {
        float altitude = normalize(vSky).y;
        if (altitude < -0.02 || strength <= 0.0) discard;

        vec3 e = normalize(vEquatorial);
        vec3 g = vec3(dot(${TO_GALACTIC[0]}, e), dot(${TO_GALACTIC[1]}, e), dot(${TO_GALACTIC[2]}, e));
        float b = asin(clamp(g.z, -1.0, 1.0)); // Galactic latitude
        float l = atan(g.y, g.x); // Galactic longitude, 0 at the centre

        // The band: wider and brighter toward the galactic centre, faint toward Auriga
        float towardCentre = exp(-l * l);
        float width = radians(5.0) + radians(8.0) * towardCentre;
        float band = exp(-pow(b / width, 2.0)) * (0.3 + 0.7 * towardCentre);
        float bulge = exp(-(pow(l / radians(14.0), 2.0) + pow(b / radians(9.0), 2.0)));
        float fromAndromeda = acos(clamp(dot(e, vec3(0.7386, 0.1393, 0.6597)), -1.0, 1.0));
        // Most of the sky is far from all of it: skip the noise there
        if (band + bulge < 0.004 && fromAndromeda > radians(3.0)) discard;

        // Star clouds and gaps, and a fine grain: countless stars too faint to see one by one
        float clouds = 0.15 + 2.2 * pow(fbm(g * 6.0), 2.2);
        float grain = 0.85 + 0.3 * noise(g * 520.0);

        // Dust: the Great Rift (from Cygnus down to Sagittarius), and fine lanes along the plane
        float riftSpan = smoothstep(radians(-5.0), radians(10.0), l) * (1.0 - smoothstep(radians(65.0), radians(90.0), l));
        float rift = riftSpan * exp(-pow((b - radians(1.5)) / radians(2.4), 2.0)) * (0.55 + 0.6 * fbm(g * 13.0 + 3.0));
        float dust = (1.0 - 0.8 * clamp(rift, 0.0, 1.0)) * (1.0 - 0.4 * exp(-pow(b / radians(1.3), 2.0)) * fbm(g * 22.0));

        float light = (band * clouds + 0.6 * bulge) * dust * grain;

        // The Andromeda galaxy (RA 0h 43m, Dec +41°): a small, faint smudge
        light += 0.35 * exp(-pow(fromAndromeda / radians(0.8), 2.0));

        // Warmer toward the centre; thick air near the horizon hides it
        vec3 color = mix(vec3(0.62, 0.67, 0.82), vec3(0.88, 0.8, 0.66), clamp(bulge + 0.3 * towardCentre, 0.0, 1.0));
        float air = smoothstep(0.0, 0.3, altitude);
        gl_FragColor = vec4(color * light * strength * air * 0.2, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

// A sphere around the sky, drawn in equatorial coordinates: add it to the star field so it turns
// with the stars. Set material.uniforms.strength (0 hidden .. ~1) each frame.
export function createMilkyWay() {
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS, 96, 48),
        new THREE.ShaderMaterial({
            uniforms: { strength: { value: 0 } },
            vertexShader,
            fragmentShader,
            side: THREE.BackSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = -1.5; // After the dome, before the stars
    return mesh;
}
