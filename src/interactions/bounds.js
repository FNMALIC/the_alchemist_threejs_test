// bounds.js - Where a thing is and how big, as a sphere in world space. The gaze and the
// environment use it to skip things that are nowhere near, without looking at their geometry.
//
// measure() walks the object's meshes once. For things that move, follow() carries the sphere
// along at almost no cost: the sphere is remembered in the object's own space and only re-placed
// with the object's current world matrix, so nothing is walked again.
import * as THREE from 'three';

const box = new THREE.Box3(); // Reused when measuring
const inverse = new THREE.Matrix4();

export class Bounds {
    constructor(object) {
        this.object = object;
        this.sphere = new THREE.Sphere(); // World space
        this.localCenter = new THREE.Vector3(); // The same sphere in the object's own space
        this.localRadius = 0;
    }

    // Measure the object from its meshes (again, if its shape has changed)
    measure() {
        const { object, sphere } = this;
        object.updateWorldMatrix(true, true);
        box.setFromObject(object);
        if (box.isEmpty()) {
            sphere.set(object.getWorldPosition(sphere.center), 0); // Nothing to see: just a point
        } else {
            box.getBoundingSphere(sphere);
        }
        this.localCenter.copy(sphere.center).applyMatrix4(inverse.copy(object.matrixWorld).invert());
        this.localRadius = sphere.radius / object.matrixWorld.getMaxScaleOnAxis();
        return this;
    }

    // Move the sphere to where the object is now
    follow() {
        const object = this.object;
        object.updateWorldMatrix(true, false);
        this.sphere.center.copy(this.localCenter).applyMatrix4(object.matrixWorld);
        this.sphere.radius = this.localRadius * object.matrixWorld.getMaxScaleOnAxis();
        return this;
    }
}
