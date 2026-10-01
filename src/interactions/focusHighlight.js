// focusHighlight.js - The gentle sign that something can be interacted with: while in focus, the
// object catches a little more light along its edges, as if the light far away had found it.
// It fades in, breathes very slowly, and fades out when the gaze moves on.
//
// The object's own materials are never touched, so nothing has to be restored and nothing can be
// left changed. Instead each of its meshes gets a thin shell, drawn just outside its surface with
// the same geometry (shared, not copied), that brightens what is already there: barely where the
// surface faces the eye, more toward its silhouette, a little warmer. Because it multiplies the
// object's own light rather than adding new light, it is just as gentle under the moon as in
// the sunrise. Shells are taken off once faded out. Each interactable has one small material (so
// two can fade at once); it is disposed when the interactable is forgotten.
import * as THREE from 'three';

const COLOR = new THREE.Color(1, 0.86, 0.62); // Warm, like the light far away
const STRENGTH = 0.9; // At full focus the edges are nearly twice as bright, the middle about 1.05x
const THICKNESS = 0.008; // Metres the shell sits outside the surface
const FADE_IN = 0.25; // Seconds
const FADE_OUT = 0.15;
const PULSE_SPEED = 1.6; // Radians per second: one slow breath every ~4 seconds
const PULSE_DEPTH = 0.15;

const template = new THREE.ShaderMaterial({
    uniforms: {
        color: { value: COLOR },
        strength: { value: 0 },
        thickness: { value: THICKNESS }
    },
    vertexShader: /* glsl */ `
        uniform float thickness;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position + normal * thickness, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform float strength;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
            vec3 normal = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
            float facing = max(dot(normal, normalize(vViewPosition)), 0.0);
            float rim = pow(1.0 - facing, 2.0);
            // Not a colour but how much brighter to make what is behind it (see blending below),
            // so no tone mapping or colour space conversion
            gl_FragColor = vec4(color * (0.05 + 0.95 * rim) * strength, 1.0);
        }
    `,
    transparent: true,
    // result = behind * (1 + shell): brightens the object's own light instead of adding new light
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.OneFactor,
    depthWrite: false,
    side: THREE.DoubleSide // Thin things like petals are seen from both sides
});

function noRaycast() {} // The gaze looks at the object, never at its shell

// Meshes that can carry a shell (instanced and skinned meshes would need their own shaders)
function shellable(object) {
    return object.isMesh && !object.isInstancedMesh && !object.isSkinnedMesh &&
        !object.userData.isFocusShell && object.geometry?.attributes.normal !== undefined;
}

export class FocusHighlight {
    constructor() {
        this.records = new Map(); // interactable -> { material, shells: Map(mesh -> shell), level, goal }
        this.fading = []; // Records currently visible or fading
        this.time = 0;
        this.meshes = []; // Reused when collecting an object's meshes
    }

    show(interactable) {
        let record = this.records.get(interactable);
        if (!record) {
            record = { material: template.clone(), shells: new Map(), level: 0, goal: 0, attached: false };
            this.records.set(interactable, record);
        }
        record.goal = 1;
        if (!record.attached) this.attach(interactable, record);
        if (!this.fading.includes(record)) this.fading.push(record);
    }

    hide(interactable) {
        const record = this.records.get(interactable);
        if (record) record.goal = 0;
    }

    // Take it off at once and free its material (e.g. when the interactable is unregistered)
    forget(interactable) {
        const record = this.records.get(interactable);
        if (!record) return;
        this.detach(record);
        record.material.dispose();
        this.records.delete(interactable);
        const index = this.fading.indexOf(record);
        if (index !== -1) this.fading.splice(index, 1);
    }

    update(delta) {
        this.time += delta;
        const pulse = 1 - PULSE_DEPTH + PULSE_DEPTH * Math.sin(this.time * PULSE_SPEED);
        for (let i = this.fading.length - 1; i >= 0; i--) {
            const record = this.fading[i];
            const rate = record.goal > record.level ? delta / FADE_IN : -delta / FADE_OUT;
            record.level = THREE.MathUtils.clamp(record.level + rate, 0, 1);
            // Ease in and out rather than fade linearly
            const eased = record.level * record.level * (3 - 2 * record.level);
            record.material.uniforms.strength.value = eased * STRENGTH * pulse;
            if (record.level === 0 && record.goal === 0) {
                this.detach(record);
                this.fading.splice(i, 1);
            }
        }
    }

    attach(interactable, record) {
        const meshes = this.meshes;
        meshes.length = 0;
        interactable.object.traverse(object => {
            if (shellable(object)) meshes.push(object);
        });
        for (const mesh of meshes) {
            let shell = record.shells.get(mesh);
            if (!shell) {
                shell = new THREE.Mesh(mesh.geometry, record.material);
                shell.userData.isFocusShell = true;
                shell.raycast = noRaycast;
                shell.renderOrder = 1;
                record.shells.set(mesh, shell);
            }
            mesh.add(shell);
        }
        meshes.length = 0;
        record.attached = true;
    }

    detach(record) {
        record.shells.forEach(shell => shell.removeFromParent());
        record.attached = false;
    }
}
