// sandPatch.js - Sand you can press into: a finely detailed patch of ground that follows the player.
//
// - A 16 m square grid with a vertex every 6.25 cm. The grid itself never changes: the shader
//   places each vertex from a small texture of dune heights, works out its normal and sand
//   colour, and blends the outer edge into the coarse desert mesh (which leaves a hole here,
//   see Terrain.hole). When the player moves, only the strip of new ground is computed.
// - A 1024 × 1024 "deformation" texture (1.6 cm per texel) holds how far the sand has been pushed down
//   or heaped up. It is addressed by world position and wraps around, so moving the patch only means
//   clearing the strip that enters it.
// - Each footstep presses a print into it: the oval of a bare sole, deepest under the heel and the
//   ball, narrower at the arch, with a low rim of sand pushed aside. Sliding cuts a groove. Vertices are displaced by it and every pixel is shaded
//   with its slope, so prints catch the light.
// - The wind slowly fills everything back in: half-filled after ERODE_HALF_LIFE of the wind's
//   work (see wind.js), about a minute in a breeze, a few minutes in still air.
// Further away, the footprint marks in footprints.js carry the trail on.
import * as THREE from 'three';

export const PATCH_SIZE = 16; // Metres across
const SEGMENTS = 256; // Vertices every 6.25 cm
const VERTS = SEGMENTS + 1;
const SPACING = PATCH_SIZE / SEGMENTS;
const TEXELS = 1024; // Deformation texels across (1.6 cm each)
const TEXEL = PATCH_SIZE / TEXELS;
const MAX_DEFORM = 0.08; // ± metres the texture can hold
const RECENTER_DISTANCE = 2; // How far the player may stray from the centre before it moves
const SNAP = 0.5; // The centre moves in steps of whole vertices and texels
const EDGE_BLEND = 1.5; // Metres over which the patch blends into the coarse ground
export const ERODE_HALF_LIFE = 40; // Wind work (Wind.erosion) to half-fill a footprint
const ERODE_INTERVAL = 0.5;

const PRINT_DEPTH = 0.04;
const PRINT_RIM = 0.014;
const MAX_RECORDS = 2000;

// The sole of a bare foot in the foot's own frame (metres): u forward along the foot, v across.
// Returns how far (u, v) is from the middle of the sole, where 1 is its outline.
const SOLE_HALF_LENGTH = 0.135;
function soleDistance(u, v) {
    // Wider at the ball, narrower at the arch (on the inner side), rounded heel
    const halfWidth = 0.05 - 0.01 * Math.exp(-(((u + 0.01) / 0.045) ** 2)) - 0.008 * Math.max(0, -u / SOLE_HALF_LENGTH);
    const across = v + 0.006 * Math.exp(-(((u + 0.01) / 0.045) ** 2)); // The arch curves in
    return Math.hypot(u / SOLE_HALF_LENGTH, across / halfWidth);
}
// How hard each part of the sole presses: heel strike and toe-off press deepest
const soleDepth = u => 0.7 + 0.3 * Math.max(Math.exp(-(((u + 0.085) / 0.045) ** 2)), Math.exp(-(((u - 0.06) / 0.05) ** 2)));
const smooth = (edge0, edge1, x) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};

const mod = (a, n) => ((a % n) + n) % n;

const floatTexture = (data, width, height) => {
    const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.FloatType);
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
};

export class SandPatch {
    constructor(terrain, startX, startZ) {
        this.terrain = terrain;
        this.time = 0; // The wind's work so far (Wind.erosion): prints age by it
        this.erodeTimer = 0;
        this.erodedAt = 0;
        this.prints = []; // Recent prints, to re-press them when the patch moves back over them
        this.pits = []; // Holes dug by someone else, long ago: the wind never fills them here

        this.heights = new Float32Array(VERTS * VERTS);
        this.spareHeights = new Float32Array(VERTS * VERTS);
        this.heightTexture = floatTexture(this.heights, VERTS, VERTS);
        this.coarseTexture = floatTexture(terrain.gridHeights, terrain.segments + 1, terrain.segments + 1);

        this.deform = new Float32Array(TEXELS * TEXELS); // Metres, + up / - down
        this.bytes = new Uint8Array(TEXELS * TEXELS).fill(128);
        this.deformTexture = new THREE.DataTexture(this.bytes, TEXELS, TEXELS, THREE.RedFormat, THREE.UnsignedByteType);
        this.deformTexture.wrapS = this.deformTexture.wrapT = THREE.RepeatWrapping;
        this.deformTexture.magFilter = this.deformTexture.minFilter = THREE.LinearFilter;
        this.deformTexture.needsUpdate = true;

        const terrainOrigin = new THREE.Vector2(terrain.center.x - terrain.size / 2, terrain.center.z - terrain.size / 2);
        // The desert mesh follows the player (see terrain.js): read it again where it now is
        terrain.onRecenter.push(() => {
            terrainOrigin.set(terrain.center.x - terrain.size / 2, terrain.center.z - terrain.size / 2);
            this.coarseTexture.needsUpdate = true;
        });
        this.uniforms = {
            heightMap: { value: this.heightTexture },
            coarseMap: { value: this.coarseTexture },
            patchOrigin: { value: new THREE.Vector2() },
            patchSpacing: { value: SPACING },
            edgeBlend: { value: EDGE_BLEND },
            terrainOrigin: { value: terrainOrigin },
            terrainSize: { value: terrain.size },
            coarseCell: { value: terrain.cell },
            coarseSegments: { value: terrain.segments },
            sandTrough: { value: terrain.sandColors.trough },
            sandCrest: { value: terrain.sandColors.crest },
            sandDamp: { value: terrain.sandColors.damp },
            poolCenter: { value: new THREE.Vector2(terrain.oasis.poolX, terrain.oasis.poolZ) },
            deformMap: { value: this.deformTexture },
            deformMax: { value: MAX_DEFORM },
            deformTexel: { value: TEXEL },
            patchSize: { value: PATCH_SIZE },
            patchCenter: { value: new THREE.Vector2() },
            patchHalf: { value: PATCH_SIZE / 2 }
        };

        this.mesh = this.createMesh();
        this.center = null;
        this.recenter(startX, startZ);
    }

    createMesh() {
        // A fixed grid; the shader moves it into place
        const geometry = new THREE.PlaneGeometry(PATCH_SIZE, PATCH_SIZE, SEGMENTS, SEGMENTS)
            .rotateX(-Math.PI / 2)
            .translate(PATCH_SIZE / 2, 0, PATCH_SIZE / 2); // Vertex (i, j) at (i, j) × spacing
        const white = new Float32Array(geometry.attributes.position.count * 3).fill(1);
        geometry.setAttribute('color', new THREE.BufferAttribute(white, 3)); // Replaced in the shader

        const uniforms = this.uniforms;
        const common = /* glsl */`
            uniform sampler2D heightMap;
            uniform sampler2D coarseMap;
            uniform vec2 patchOrigin;
            uniform float patchSpacing;
            uniform float edgeBlend;
            uniform vec2 terrainOrigin;
            uniform float terrainSize;
            uniform float coarseCell;
            uniform float coarseSegments;
            uniform vec3 sandTrough;
            uniform vec3 sandCrest;
            uniform vec3 sandDamp;
            uniform vec2 poolCenter;
            uniform sampler2D deformMap;
            uniform float deformMax;
            uniform float deformTexel;
            uniform float patchSize;
            uniform vec2 patchCenter;
            uniform float patchHalf;
            varying vec2 vDeformPosition;
            varying float vDeformFade;
            float deformAt(vec2 p) {
                return (texture2D(deformMap, p / patchSize).r * 255.0 - 128.0) / 127.0 * deformMax;
            }`;

        const vertexFunctions = /* glsl */`
            // Height of the coarse desert mesh (its flat triangles) at a world position
            float coarseHeight(vec2 p) {
                vec2 g = (p - terrainOrigin) / coarseCell;
                vec2 cell = clamp(floor(g), vec2(0.0), vec2(coarseSegments - 1.0));
                vec2 f = g - cell;
                ivec2 c = ivec2(cell);
                float a = texelFetch(coarseMap, c, 0).r;
                float b = texelFetch(coarseMap, c + ivec2(0, 1), 0).r;
                float d = texelFetch(coarseMap, c + ivec2(1, 0), 0).r;
                float e = texelFetch(coarseMap, c + ivec2(1, 1), 0).r;
                return f.x + f.y <= 1.0
                    ? a + (d - a) * f.x + (b - a) * f.y
                    : e + (b - e) * (1.0 - f.x) + (d - e) * (1.0 - f.y);
            }
            // The true dune height at a patch vertex, easing into the coarse mesh at the edges
            float patchHeight(ivec2 v) {
                ivec2 inside = clamp(v, ivec2(0), ivec2(${SEGMENTS}));
                float exact = texelFetch(heightMap, inside, 0).r;
                float edge = float(min(min(v.x, ${SEGMENTS} - v.x), min(v.y, ${SEGMENTS} - v.y))) * patchSpacing;
                if (edge >= edgeBlend) return exact;
                return mix(coarseHeight(patchOrigin + vec2(v) * patchSpacing), exact, smoothstep(0.0, edgeBlend, edge));
            }`;

        const material = this.terrain.createSandMaterial('patch', shader => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>\n${common}\n${vertexFunctions}`)
                .replace('#include <beginnormal_vertex>', `
                    ivec2 patchVertex = ivec2(round(position.xz / patchSpacing));
                    float patchY = patchHeight(patchVertex);
                    vec3 objectNormal = normalize(vec3(
                        patchHeight(patchVertex - ivec2(1, 0)) - patchHeight(patchVertex + ivec2(1, 0)),
                        2.0 * patchSpacing,
                        patchHeight(patchVertex - ivec2(0, 1)) - patchHeight(patchVertex + ivec2(0, 1))
                    ));
                    #ifdef USE_TANGENT
                        vec3 objectTangent = vec3(tangent.xyz);
                    #endif`)
                .replace('#include <begin_vertex>', `
                    vec3 transformed = vec3(patchOrigin.x + position.x, patchY, patchOrigin.y + position.z);
                    vDeformPosition = transformed.xz;
                    // Fade the pressing out at the edges, where the patch meets the coarse ground
                    float edgeDistance = patchHalf - max(abs(transformed.x - patchCenter.x), abs(transformed.z - patchCenter.y));
                    vDeformFade = smoothstep(0.0, 1.0, edgeDistance);
                    transformed.y += deformAt(transformed.xz) * vDeformFade;

                    // Sand colour, as Terrain.sandColor: pale crests, darker steep faces, damp by the pool
                    vColor = mix(sandTrough, sandCrest, clamp(patchY / 7.0, 0.0, 1.0)) * (0.8 + 0.2 * objectNormal.y);
                    vColor = mix(vColor, sandDamp, 1.0 - smoothstep(5.0, 8.0, distance(transformed.xz, poolCenter)));

                    // Wind ripples continue seamlessly from the desert mesh
                    vec2 rippleUv = vec2(
                        (transformed.x - terrainOrigin.x) / terrainSize,
                        1.0 - (transformed.z - terrainOrigin.y) / terrainSize
                    );
                    vNormalMapUv = (normalMapTransform * vec3(rippleUv, 1.0)).xy;`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>\n${common}`)
                .replace('#include <color_fragment>', `#include <color_fragment>
                    // Disturbed sand in a hollow is a little darker
                    diffuseColor.rgb *= 1.0 - clamp(-deformAt(vDeformPosition) * vDeformFade * 3.0, 0.0, 0.12);`)
                .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
                    {
                        // Tilt the surface by the slope of the pressed sand, per pixel
                        float e = deformTexel;
                        float dx = (deformAt(vDeformPosition + vec2(e, 0.0)) - deformAt(vDeformPosition - vec2(e, 0.0))) / (2.0 * e);
                        float dz = (deformAt(vDeformPosition + vec2(0.0, e)) - deformAt(vDeformPosition - vec2(0.0, e))) / (2.0 * e);
                        vec3 bump = vec3(-dx, 0.0, -dz) * vDeformFade;
                        normal = normalize(normal + (viewMatrix * vec4(bump, 0.0)).xyz);
                    }`);
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.castShadow = false; // The coarse desert casts the dunes' shadows
        mesh.frustumCulled = false; // Always around the player
        return mesh;
    }

    // Move the patch so it is centred near (x, z)
    recenter(x, z) {
        const cx = Math.round(x / SNAP) * SNAP;
        const cz = Math.round(z / SNAP) * SNAP;
        const previous = this.center;
        this.center = { x: cx, z: cz };

        this.updateHeights(previous);
        this.updateTextureWindow(previous);

        this.uniforms.patchOrigin.value.set(cx - PATCH_SIZE / 2, cz - PATCH_SIZE / 2);
        this.uniforms.patchCenter.value.set(cx, cz);
        this.terrain.hole.center.value.set(cx, cz);
        this.terrain.hole.half.value = PATCH_SIZE / 2 - 0.05;
    }

    // Exact dune heights at every vertex, reusing what is already known when the patch shifts
    updateHeights(previous) {
        const x0 = this.center.x - PATCH_SIZE / 2;
        const z0 = this.center.z - PATCH_SIZE / 2;
        const terrain = this.terrain;
        const source = this.heights;
        const target = this.spareHeights;

        let di = Infinity, dj = Infinity;
        if (previous) {
            di = Math.round((this.center.x - previous.x) / SPACING);
            dj = Math.round((this.center.z - previous.z) / SPACING);
        }

        for (let j = 0; j < VERTS; j++) {
            const oj = j + dj;
            const rowKnown = oj >= 0 && oj < VERTS;
            // Columns of this row that the old patch already had
            const from = rowKnown ? Math.max(0, -di) : 0;
            const to = rowKnown ? Math.min(VERTS, VERTS - di) : 0;
            if (from < to) target.set(source.subarray(from + di + VERTS * oj, to + di + VERTS * oj), from + VERTS * j);
            for (let i = 0; i < VERTS; i++) {
                if (i >= from && i < to) continue;
                target[i + VERTS * j] = terrain.heightAt(x0 + i * SPACING, z0 + j * SPACING);
            }
        }

        // Swap buffers; the texture shows the new heights
        this.spareHeights = source;
        this.heights = target;
        this.heightTexture.image.data = target;
        this.heightTexture.needsUpdate = true;
    }

    // The deformation texture wraps around: clear the texels that now stand for newly covered
    // ground, then press back any prints that were made there before
    updateTextureWindow(previous) {
        const tx0 = Math.round((this.center.x - PATCH_SIZE / 2) / TEXEL);
        const tz0 = Math.round((this.center.z - PATCH_SIZE / 2) / TEXEL);
        if (!previous) {
            this.window = { tx0, tz0 };
            return;
        }
        const old = this.window;
        this.window = { tx0, tz0 };
        const inOld = (tx, tz) => tx >= old.tx0 && tx < old.tx0 + TEXELS && tz >= old.tz0 && tz < old.tz0 + TEXELS;

        const clear = (tx, tz) => {
            const index = mod(tx, TEXELS) + TEXELS * mod(tz, TEXELS);
            this.deform[index] = 0;
            this.bytes[index] = 128;
        };
        // New columns (whole height), then new rows (remaining width)
        const columnsFrom = tx0 < old.tx0 ? tx0 : Math.max(tx0, old.tx0 + TEXELS);
        const columnsTo = tx0 < old.tx0 ? Math.min(tx0 + TEXELS, old.tx0) : tx0 + TEXELS;
        for (let tx = columnsFrom; tx < columnsTo; tx++) for (let tz = tz0; tz < tz0 + TEXELS; tz++) clear(tx, tz);
        const rowsFrom = tz0 < old.tz0 ? tz0 : Math.max(tz0, old.tz0 + TEXELS);
        const rowsTo = tz0 < old.tz0 ? Math.min(tz0 + TEXELS, old.tz0) : tz0 + TEXELS;
        for (let tz = rowsFrom; tz < rowsTo; tz++) {
            for (let tx = tx0; tx < tx0 + TEXELS; tx++) if (inOld(tx, old.tz0)) clear(tx, tz);
        }

        for (const print of this.prints) {
            const tx = Math.floor(print.x / TEXEL), tz = Math.floor(print.z / TEXEL);
            const inNew = tx >= tx0 && tx < tx0 + TEXELS && tz >= tz0 && tz < tz0 + TEXELS;
            if (inNew && !inOld(tx, tz)) {
                this.pressFoot(print, print.strength * Math.pow(0.5, (this.time - print.time) / ERODE_HALF_LIFE));
            }
        }
        this.pits.forEach(pit => this.pressPit(pit));
        this.deformTexture.needsUpdate = true;
    }

    // Add a displacement at a texel: deeper hollows win; rims only build on undisturbed sand
    apply(tx, tz, amount) {
        const { tx0, tz0 } = this.window;
        if (tx < tx0 || tx >= tx0 + TEXELS || tz < tz0 || tz >= tz0 + TEXELS) return;
        const index = mod(tx, TEXELS) + TEXELS * mod(tz, TEXELS);
        const current = this.deform[index];
        let value = current;
        if (amount < current) value = amount;
        else if (amount > 0 && current >= 0) value = Math.max(current, amount);
        if (value === current) return;
        this.deform[index] = value;
        this.bytes[index] = Math.max(0, Math.min(255, Math.round(128 + (value / MAX_DEFORM) * 127)));
    }

    // Press one bare foot into the sand. step: { x, z, heading, foot } as sent by the player
    pressFoot({ x, z, heading, foot }, strength = 1) {
        const hx = Math.sin(heading), hz = Math.cos(heading);
        const footX = x - hz * foot * 0.11;
        const footZ = z + hx * foot * 0.11;
        // The foot turns out slightly; its frame: forward (fx, fz), right (rx, rz)
        const angle = heading - foot * 0.12;
        const fx = Math.sin(angle), fz = Math.cos(angle);
        const rx = -fz, rz = fx;

        const reach = 0.3;
        for (let tx = Math.floor((footX - reach) / TEXEL); tx <= Math.floor((footX + reach) / TEXEL); tx++) {
            for (let tz = Math.floor((footZ - reach) / TEXEL); tz <= Math.floor((footZ + reach) / TEXEL); tz++) {
                const px = (tx + 0.5) * TEXEL - footX, pz = (tz + 0.5) * TEXEL - footZ;
                const u = px * fx + pz * fz;
                const v = (px * rx + pz * rz) * foot; // Mirrored for the left foot

                const distance = soleDistance(u, v);
                if (distance > 1.8) continue;
                const dent = smooth(1.05, 0.7, distance) * soleDepth(u);
                // Sand pushed aside: a low rim just outside the outline
                const rim = smooth(1.75, 1.15, distance) * smooth(0.9, 1.1, distance);
                const amount = (-dent * PRINT_DEPTH + rim * PRINT_RIM) * strength;
                if (Math.abs(amount) > 0.0004) this.apply(tx, tz, amount);
            }
        }
    }

    // A shallow hole dug in the sand: a bowl with a low rim, and the dug sand heaped on one side
    // (toward pileAngle). It stays: pressed whenever the patch covers it, again after the wind.
    addPit(x, z, radius, depth, pileAngle) {
        const pit = { x, z, radius, depth, pileX: x + Math.cos(pileAngle) * radius * 1.75, pileZ: z + Math.sin(pileAngle) * radius * 1.75 };
        this.pits.push(pit);
        this.pressPit(pit);
        this.deformTexture.needsUpdate = true;
    }

    pressPit({ x, z, radius, depth, pileX, pileZ }) {
        const reach = radius * 2.6;
        for (let tx = Math.floor((x - reach) / TEXEL); tx <= Math.floor((x + reach) / TEXEL); tx++) {
            for (let tz = Math.floor((z - reach) / TEXEL); tz <= Math.floor((z + reach) / TEXEL); tz++) {
                const px = (tx + 0.5) * TEXEL, pz = (tz + 0.5) * TEXEL;
                const r = Math.hypot(px - x, pz - z) / radius;
                const bowl = r < 1 ? -depth * (1 - r * r) : 0;
                const rim = 0.018 * Math.exp(-(((r - 1.2) / 0.22) ** 2));
                const pile = 0.055 * Math.exp(-((Math.hypot(px - pileX, pz - pileZ) / (radius * 0.75)) ** 2));
                const amount = bowl < 0 ? bowl : rim + pile;
                if (Math.abs(amount) > 0.0004) this.apply(tx, tz, amount);
            }
        }
    }

    // A footstep: press the print and remember it
    stamp(step, strength = 1) {
        const record = { x: step.x, z: step.z, heading: step.heading, foot: step.foot, strength, time: this.time };
        this.prints.push(record);
        if (this.prints.length > MAX_RECORDS) this.prints.shift();
        this.pressFoot(record, strength);
        this.deformTexture.needsUpdate = true;
    }

    // Sliding feet cut a shallow groove with low banks. (dx, dz): unit direction of the slide
    groove(x, z, dx, dz) {
        const reach = 0.25;
        for (let tx = Math.floor((x - reach) / TEXEL); tx <= Math.floor((x + reach) / TEXEL); tx++) {
            for (let tz = Math.floor((z - reach) / TEXEL); tz <= Math.floor((z + reach) / TEXEL); tz++) {
                const px = (tx + 0.5) * TEXEL - x, pz = (tz + 0.5) * TEXEL - z;
                const along = px * dx + pz * dz;
                const across = px * -dz + pz * dx;
                const shape = Math.exp(-((along / 0.12) ** 2));
                const trough = Math.exp(-((across / 0.1) ** 2));
                const banks = Math.exp(-(((Math.abs(across) - 0.16) / 0.05) ** 2));
                const amount = (-0.02 * trough + 0.008 * banks) * shape;
                if (Math.abs(amount) > 0.0004) this.apply(tx, tz, amount);
            }
        }
        this.deformTexture.needsUpdate = true;
    }

    // erosion: the wind's accumulated work (Wind.erosion)
    update(delta, playerX, playerZ, erosion) {
        this.time = erosion;

        if (Math.max(Math.abs(playerX - this.center.x), Math.abs(playerZ - this.center.z)) > RECENTER_DISTANCE) {
            this.recenter(playerX, playerZ);
        }

        // The wind slowly fills footprints back in
        this.erodeTimer += delta;
        if (this.erodeTimer >= ERODE_INTERVAL) {
            const keep = Math.pow(0.5, (this.time - this.erodedAt) / ERODE_HALF_LIFE);
            this.erodeTimer = 0;
            this.erodedAt = this.time;
            const { deform, bytes } = this;
            let changed = false;
            for (let i = 0; i < deform.length; i++) {
                const value = deform[i];
                if (value === 0) continue;
                const next = Math.abs(value) < 0.0005 ? 0 : value * keep;
                deform[i] = next;
                const byte = Math.round(128 + (next / MAX_DEFORM) * 127);
                if (byte !== bytes[i]) {
                    bytes[i] = byte;
                    changed = true;
                }
            }
            if (this.pits.length > 0) {
                this.pits.forEach(pit => this.pressPit(pit));
                changed = true;
            }
            if (changed) this.deformTexture.needsUpdate = true;
        }
    }
}
