// bodyShadow.js - Your shadow, without a body to see. A plain figure (torso, head, legs) follows
// the eye and turns with you, drawn into the shadow maps only: never into the view. At sunrise
// it stretches long across the sand behind you; on the way home it walks ahead of you. The moon
// casts it too. Sitting down, it folds.
import * as THREE from 'three';

// Seen by the lights, not by the eye: writes no colour and no depth, so it hides nothing
const INVISIBLE = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

function part(geometry, x, y, z) {
    const mesh = new THREE.Mesh(geometry, INVISIBLE);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // Its shadow can be in view while it is not
    return mesh;
}

export class BodyShadow {
    constructor() {
        this.object = new THREE.Group();

        // Heights are from the ground up, for someone whose eyes are at 1.7 m
        this.standing = new THREE.Group();
        // Legs and arms hang from the hips and shoulders, so they swing from there
        const leg = new THREE.CapsuleGeometry(0.075, 0.72, 4, 8).translate(0, -0.43, 0);
        this.leftLeg = part(leg, -0.1, 0.86, 0);
        this.rightLeg = part(leg, 0.1, 0.86, 0);
        const torso = new THREE.CapsuleGeometry(0.17, 0.5, 4, 10);
        torso.scale(1.25, 1, 0.75); // Shoulders wider than deep
        this.standing.add(this.leftLeg, this.rightLeg, part(torso, 0, 1.18, 0));
        const arm = new THREE.CapsuleGeometry(0.05, 0.55, 4, 6).translate(0, -0.32, 0);
        this.leftArm = part(arm, -0.29, 1.42, 0);
        this.rightArm = part(arm, 0.29, 1.42, 0);
        this.standing.add(this.leftArm, this.rightArm);
        this.head = part(new THREE.SphereGeometry(0.11, 12, 8), 0, 1.66, -0.02);
        this.standing.add(this.head);
        this.object.add(this.standing);
        this.stride = 0;
    }

    // eye: where the eyes are; ground: ground height there; yaw: where the body faces
    // walking: speed in m/s (the arms and legs swing a little); seated: sitting down
    update(delta, eye, ground, yaw, speed, seated) {
        this.object.position.set(eye.x, ground, eye.z);
        this.object.rotation.y = yaw;

        if (seated) {
            // Sitting: the figure folds, legs forward (forward is -z, so a positive turn)
            this.standing.scale.set(1, 0.62, 1);
            this.leftLeg.rotation.x = this.rightLeg.rotation.x = 1.3;
            this.leftArm.rotation.x = this.rightArm.rotation.x = 0.4;
            return;
        }
        this.standing.scale.set(1, Math.max(0.5, (eye.y - ground) / 1.7), 1);

        // A gentle swing with the steps (only the outline matters)
        this.stride += delta * speed * 2.6;
        const swing = Math.sin(this.stride) * Math.min(1, speed / 2) * 0.35;
        this.leftLeg.rotation.x = swing;
        this.rightLeg.rotation.x = -swing;
        this.leftArm.rotation.x = -swing * 0.8;
        this.rightArm.rotation.x = swing * 0.8;
    }
}
