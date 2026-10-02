// props.js - Things that sit on the ground: trees, palms, shrubs, rocks, grass and flowers.
// Each function returns an Object3D positioned at (x, heightAt(x, z), z).
// Solid props set userData.collider = { x, z, radius } so the player can't walk through them.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const barkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 1 });
const deadWoodMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 1 });
const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2f4a22, roughness: 0.9, flatShading: true });
const palmTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x7a5e3f, roughness: 1 });
const frondMaterial = new THREE.MeshStandardMaterial({ color: 0x3e6b2a, roughness: 0.8, side: THREE.DoubleSide });

// Where the shapes' randomness comes from: Math.random, or a seeded generator inside withRandom
let random = Math.random;

// Make props with `generator` as their randomness, so the same seed grows the same shapes
export function withRandom(generator, make) {
    const previous = random;
    random = generator;
    try {
        return make();
    } finally {
        random = previous;
    }
}

// A small seeded generator (mulberry32): numbers in [0, 1)
export function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Recursively grow branches as tube geometries. Returns { branches, tips }.
function growBranches(start, direction, length, radius, depth, spread, out = { branches: [], tips: [] }) {
    // A gently curving limb
    const bend = new THREE.Vector3(random() - 0.5, 0, random() - 0.5).multiplyScalar(length * 0.25);
    const middle = start.clone().addScaledVector(direction, length * 0.5).add(bend);
    const end = start.clone().addScaledVector(direction, length);
    const curve = new THREE.CatmullRomCurve3([start, middle, end]);
    out.branches.push(new THREE.TubeGeometry(curve, 6, radius, 6, false));

    if (depth === 0) {
        out.tips.push(end);
        return out;
    }

    const childCount = 2 + Math.floor(random() * 2);
    for (let i = 0; i < childCount; i++) {
        const childDirection = direction.clone()
            .add(new THREE.Vector3(
                (random() - 0.5) * spread,
                random() * 0.3,
                (random() - 0.5) * spread
            ))
            .normalize();
        growBranches(end, childDirection, length * 0.7, radius * 0.6, depth - 1, spread, out);
    }
    return out;
}

// The old tree at the oasis, where the journey begins (and one day ends)
export function createOldTree(x, z, heightAt) {
    const tree = new THREE.Group();
    const { branches, tips } = growBranches(
        new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0.1, 1, 0).normalize(), 2.6, 0.45, 3, 1.6
    );
    const wood = new THREE.Mesh(mergeGeometries(branches), barkMaterial);
    wood.castShadow = true;
    tree.add(wood);

    // Leafy clumps at the branch tips
    const clumps = tips.map(tip => {
        const clump = new THREE.IcosahedronGeometry(0.9 + random() * 0.6, 1);
        clump.scale(1, 0.7, 1);
        clump.translate(tip.x, tip.y, tip.z);
        return clump;
    });
    const leaves = new THREE.Mesh(mergeGeometries(clumps), leafMaterial);
    leaves.castShadow = true;
    tree.add(leaves);

    tree.position.set(x, heightAt(x, z), z);
    tree.userData.collider = { x, z, radius: 0.6 };
    return tree;
}

// A dry, leafless desert shrub
export function createShrub(x, z, heightAt) {
    const { branches } = growBranches(
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.35, 0.04, 2, 2.2
    );
    const shrub = new THREE.Mesh(mergeGeometries(branches), deadWoodMaterial);
    shrub.castShadow = true;
    shrub.position.set(x, heightAt(x, z), z);
    shrub.rotation.y = random() * Math.PI * 2;
    return shrub;
}

export function createPalm(x, z, height, heightAt) {
    const palm = new THREE.Group();

    // Leaning, slightly curved trunk
    const leanAngle = random() * Math.PI * 2;
    const lean = new THREE.Vector3(Math.cos(leanAngle), 0, Math.sin(leanAngle)).multiplyScalar(height * 0.25);
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.2, 0),
        new THREE.Vector3(lean.x * 0.2, height * 0.4, lean.z * 0.2),
        new THREE.Vector3(lean.x * 0.6, height * 0.75, lean.z * 0.6),
        new THREE.Vector3(lean.x, height, lean.z)
    ]);
    const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.16, 6, false), palmTrunkMaterial);
    trunk.castShadow = true;
    palm.add(trunk);

    // Arching fronds around the crown. The crown pivots at the top of the trunk so it can sway.
    const top = curve.getPoint(1);
    const crown = new THREE.Group();
    crown.position.copy(top);
    palm.add(crown);
    const frondCount = 7 + Math.floor(random() * 3);
    const fronds = [];
    for (let i = 0; i < frondCount; i++) {
        const length = 2.6 + random() * 0.8;
        const frond = new THREE.PlaneGeometry(0.7, length, 1, 10);
        const positions = frond.attributes.position;
        for (let v = 0; v < positions.count; v++) {
            const t = positions.getY(v) / length + 0.5; // 0 at the crown, 1 at the tip
            positions.setXYZ(
                v,
                positions.getX(v) * (1 - 0.7 * t), // Taper
                0.9 * t - 2.0 * t * t, // Arch up, then droop
                t * length
            );
        }
        frond.rotateY((i / frondCount) * Math.PI * 2 + random() * 0.3);
        fronds.push(frond);
    }
    const frondGeometry = mergeGeometries(fronds);
    frondGeometry.computeVertexNormals();
    const frondMesh = new THREE.Mesh(frondGeometry, frondMaterial);
    frondMesh.castShadow = true;
    crown.add(frondMesh);

    palm.position.set(x, heightAt(x, z), z);
    palm.userData.collider = { x, z, radius: 0.35 };
    palm.userData.crown = crown;
    palm.userData.swayPhase = random() * Math.PI * 2;
    return palm;
}

export function createRock(x, z, size, heightAt, color = 0x7a6a58) {
    // Merge shared corners first, so deforming them keeps the surface closed
    let geometry = new THREE.DodecahedronGeometry(size, 1);
    geometry.deleteAttribute('normal');
    geometry.deleteAttribute('uv');
    geometry = mergeVertices(geometry);

    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        positions.setXYZ(
            i,
            positions.getX(i) + (random() - 0.5) * size * 0.3,
            (positions.getY(i) + (random() - 0.5) * size * 0.3) * 0.6, // Flatter, wind-worn
            positions.getZ(i) + (random() - 0.5) * size * 0.3
        );
    }
    geometry.computeVertexNormals();

    const rockColor = new THREE.Color(color).offsetHSL(0, 0, (random() - 0.5) * 0.08);
    const rock = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: rockColor,
        roughness: 0.95,
        flatShading: true
    }));
    rock.position.set(x, heightAt(x, z) + size * 0.15, z);
    rock.rotation.y = random() * Math.PI * 2;
    rock.castShadow = true;
    rock.receiveShadow = true;
    if (size > 0.5) rock.userData.collider = { x, z, radius: size * 0.85 };
    return rock;
}

// A patch of grass blades that sway in the wind (see swayGrass).
// All blades in a patch are one InstancedMesh: one draw call per patch.
const bladeGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // Pivot at the base
const bladeMaterial = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 });

export function createGrassPatch(x, z, size, heightAt) {
    const bladeCount = Math.floor(size * 20);
    const grass = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, bladeCount);
    grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    grass.receiveShadow = true;

    const blades = [];
    const color = new THREE.Color();
    for (let i = 0; i < bladeCount; i++) {
        const bladeX = x + (random() - 0.5) * size;
        const bladeZ = z + (random() - 0.5) * size;
        blades.push({
            position: new THREE.Vector3(bladeX, heightAt(bladeX, bladeZ), bladeZ),
            scale: new THREE.Vector3(0.02 + random() * 0.03, 0.2 + random() * 0.3, 1),
            turn: random() * Math.PI,
            waveSpeed: 0.5 + random() * 0.5,
            waveAmplitude: 0.1 + random() * 0.15,
            phaseOffset: random() * Math.PI * 2
        });
        grass.setColorAt(i, color.setHSL(
            0.22 + random() * 0.1,
            0.4 + random() * 0.3,
            0.25 + random() * 0.2
        ));
    }
    grass.userData.blades = blades;
    swayGrass(grass, 0, 1);
    return grass;
}

const swayRotation = new THREE.Euler();
const swayQuaternion = new THREE.Quaternion();
const swayMatrix = new THREE.Matrix4();

// Bend each blade in the wind. gust: 0 (still) .. 1+ (windy)
export function swayGrass(grass, elapsed, gust) {
    grass.userData.blades.forEach((blade, i) => {
        const bend = Math.sin(elapsed * blade.waveSpeed * 2 + blade.phaseOffset) * blade.waveAmplitude * gust;
        swayRotation.set(bend, blade.turn, bend * 0.4, 'YXZ');
        swayQuaternion.setFromEuler(swayRotation);
        grass.setMatrixAt(i, swayMatrix.compose(blade.position, swayQuaternion, blade.scale));
    });
    grass.instanceMatrix.needsUpdate = true;
}

export function createFlower(x, z, heightAt) {
    const flower = new THREE.Group();

    const stemHeight = 0.3 + random() * 0.2;
    const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, stemHeight, 8),
        new THREE.MeshStandardMaterial({ color: 0x3d7c25, roughness: 0.8 })
    );
    stem.position.y = stemHeight / 2;
    flower.add(stem);

    const petalColor = new THREE.Color().setHSL(random(), 0.7 + random() * 0.3, 0.5 + random() * 0.3);
    const petalMaterial = new THREE.MeshStandardMaterial({ color: petalColor, side: THREE.DoubleSide });
    const petalCount = Math.floor(random() * 3) + 5;
    const petalLength = 0.08 + random() * 0.05;
    const petalWidth = 0.04 + random() * 0.03;

    for (let i = 0; i < petalCount; i++) {
        const angle = (i / petalCount) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.PlaneGeometry(petalWidth, petalLength), petalMaterial);
        petal.position.set(Math.cos(angle) * (petalLength / 2), stemHeight, Math.sin(angle) * (petalLength / 2));
        petal.rotation.x = -Math.PI / 2;
        petal.rotation.z = angle;
        petal.userData.bloom = { angle, radius: petalLength / 2 }; // Closes at night (see World.bloom)
        flower.add(petal);
    }

    const center = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.5 })
    );
    center.position.y = stemHeight;
    flower.add(center);

    flower.position.set(x, heightAt(x, z), z);
    return flower;
}
