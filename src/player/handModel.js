// handModel.js - A simple, stylised right hand and forearm in a loose linen sleeve, built once from
// a few primitives. The left hand is the same model, mirrored. Three meshes per hand (skin, sleeve,
// hem), with geometry and materials shared between the two hands.
//
// Model space: the wrist is at the origin, the fingers point along -Z, the forearm runs back along
// +Z, the thumb is on top (+Y) and the palm faces -X (toward the body's middle).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xa87556, roughness: 0.7 });
const clothMaterial = new THREE.MeshStandardMaterial({ color: 0xc2ab86, roughness: 0.95, side: THREE.DoubleSide });
const hemMaterial = new THREE.MeshStandardMaterial({ color: 0x7a5f3e, roughness: 0.9 });

const SLEEVE_START = 0.025; // Where the sleeve's hem sits, just behind the wrist
const SLEEVE_LENGTH = 0.38;
const SLEEVE_WRIST_RADIUS = 0.049;
const SLEEVE_ELBOW_RADIUS = 0.066;

// Fingers, from the index (top, by the thumb) to the little finger:
// height of the knuckle, how far forward it is, length, thickness, how much it curls, fan
const FINGERS = [
    { y: 0.027, z: -0.097, length: 0.072, radius: 0.0092, curl: 0.22, spread: 0.06 },
    { y: 0.009, z: -0.101, length: 0.08, radius: 0.0096, curl: 0.27, spread: 0 },
    { y: -0.009, z: -0.098, length: 0.075, radius: 0.0091, curl: 0.32, spread: -0.04 },
    { y: -0.026, z: -0.091, length: 0.06, radius: 0.0081, curl: 0.38, spread: -0.1 }
];

const UP = new THREE.Vector3(0, 1, 0);

// A rounded limb segment from one joint to the next
function capsule(from, to, radius) {
    const direction = new THREE.Vector3().subVectors(to, from);
    const geometry = new THREE.CapsuleGeometry(radius, direction.length(), 3, 8);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
    const middle = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    return geometry.translate(middle.x, middle.y, middle.z);
}

// A relaxed finger: two segments, each curling a little more toward the palm
function finger({ y, z, length, radius, curl, spread }) {
    const knuckle = new THREE.Vector3(0.002, y, z);
    const firstLength = length * 0.45;
    const first = new THREE.Vector3(-Math.sin(curl), spread, -Math.cos(curl)).normalize();
    const joint = knuckle.clone().addScaledVector(first, firstLength);
    const second = new THREE.Vector3(-Math.sin(curl * 2.2), spread * 0.5, -Math.cos(curl * 2.2)).normalize();
    const tip = joint.clone().addScaledVector(second, length - firstLength - radius);
    return [capsule(knuckle, joint, radius), capsule(joint, tip, radius * 0.9)];
}

function thumb() {
    const base = new THREE.Vector3(-0.004, 0.026, -0.012);
    const joints = [base];
    [
        [new THREE.Vector3(-0.4, 0.42, -0.81), 0.042],
        [new THREE.Vector3(-0.5, 0.2, -0.84), 0.03],
        [new THREE.Vector3(-0.62, 0.02, -0.78), 0.022]
    ].forEach(([direction, length]) => {
        joints.push(joints[joints.length - 1].clone().addScaledVector(direction.normalize(), length));
    });
    const radii = [0.0145, 0.0115, 0.0105];
    return radii.map((radius, i) => capsule(joints[i], joints[i + 1], radius));
}

function createSkinGeometry() {
    // Palm: a rounded block, narrower and a little thicker toward the wrist
    const palm = new RoundedBoxGeometry(0.028, 0.08, 0.098, 2, 0.011).translate(0, 0, -0.049);
    const position = palm.attributes.position;
    for (let i = 0; i < position.count; i++) {
        const along = THREE.MathUtils.clamp(-position.getZ(i) / 0.098, 0, 1); // 0 wrist .. 1 knuckles
        position.setY(i, position.getY(i) * (0.85 + 0.15 * along));
        position.setX(i, position.getX(i) * (1.1 - 0.15 * along));
    }
    palm.computeVertexNormals();

    const wrist = new THREE.CapsuleGeometry(0.021, 0.045, 3, 10)
        .rotateX(Math.PI / 2).scale(1, 1.25, 1).translate(0, -0.001, 0.018);
    const thenar = new THREE.SphereGeometry(1, 10, 8).scale(0.012, 0.02, 0.028).translate(-0.01, 0.012, -0.035);

    const parts = [palm, wrist, thenar, ...thumb(), ...FINGERS.flatMap(finger)];
    return mergeGeometries(parts.map(part => (part.index ? part.toNonIndexed() : part)));
}

// A loose linen sleeve: wider toward the elbow, with soft folds, hanging a little under the arm
function createSleeveGeometry() {
    const geometry = new THREE.CylinderGeometry(SLEEVE_ELBOW_RADIUS, SLEEVE_WRIST_RADIUS, SLEEVE_LENGTH, 16, 6, true)
        .rotateX(Math.PI / 2)
        .translate(0, 0, SLEEVE_START + SLEEVE_LENGTH / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const along = (position.getZ(i) - SLEEVE_START) / SLEEVE_LENGTH; // 0 at the wrist .. 1 at the elbow
        const angle = Math.atan2(y, x);
        const folds = 1 + (0.03 + 0.08 * along) *
            (0.7 * Math.sin(5 * angle + 4 * along) + 0.4 * Math.sin(9 * angle - 6 * along + 1.7));
        position.setX(i, x * folds * 0.94);
        position.setY(i, y * folds * 1.06 - 0.012 * along);
    }
    geometry.computeVertexNormals();
    return geometry;
}

function createHemGeometry() {
    return new THREE.TorusGeometry(SLEEVE_WRIST_RADIUS + 0.001, 0.0055, 6, 24)
        .scale(0.94, 1.06, 1)
        .translate(0, 0, SLEEVE_START);
}

let geometries = null;

// A new right hand (a Group of meshes); mirror it with scale.x = -1 for the left
export function createHandModel() {
    geometries ??= { skin: createSkinGeometry(), sleeve: createSleeveGeometry(), hem: createHemGeometry() };
    const hand = new THREE.Group();
    hand.add(
        new THREE.Mesh(geometries.skin, skinMaterial),
        new THREE.Mesh(geometries.sleeve, clothMaterial),
        new THREE.Mesh(geometries.hem, hemMaterial)
    );
    return hand;
}
