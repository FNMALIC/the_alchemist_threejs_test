// effects.js - One-shot particle effects (orb shattering, player transformation)
import * as THREE from 'three';

export class Effects {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.active = []; // { group, update(delta) -> true when finished }

        // Reused every frame by the transformation effect
        this.cameraRight = new THREE.Vector3();
        this.cameraUp = new THREE.Vector3();
        this.cameraForward = new THREE.Vector3();
    }

    add(group, update) {
        this.scene.add(group);
        this.active.push({ group, update });
    }

    update(delta) {
        this.active = this.active.filter(effect => {
            const finished = effect.update(delta);
            if (finished) this.dispose(effect.group);
            return !finished;
        });
    }

    // Remove a finished effect and free its GPU resources
    dispose(group) {
        const geometries = new Set();
        group.children.forEach(particle => {
            geometries.add(particle.geometry);
            particle.material.dispose();
        });
        geometries.forEach(geometry => geometry.dispose());
        this.scene.remove(group);
    }

    // The orb bursts into falling sparks
    shatter(position) {
        const particleCount = 500;
        const group = new THREE.Group();
        const geometry = new THREE.SphereGeometry(0.03, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1
        });

        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(geometry, material.clone());
            particle.position.copy(position);
            particle.userData = {
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 3,
                    (Math.random() - 0.5) * 3,
                    (Math.random() - 0.5) * 3
                ),
                life: 2 + Math.random() * 2 // 2-4 seconds
            };
            group.add(particle);
        }

        this.add(group, delta => {
            const dead = [];

            group.children.forEach(particle => {
                const userData = particle.userData;
                particle.position.addScaledVector(userData.velocity, delta);
                userData.velocity.y -= 2 * delta; // Gravity

                userData.life -= delta;
                particle.material.opacity = Math.max(0, userData.life / 3);
                if (userData.life <= 0) dead.push(particle);
            });

            dead.forEach(particle => {
                group.remove(particle);
                particle.material.dispose();
            });

            return group.children.length === 0;
        });
    }

    // Motes of light swirl around the player and expand outward
    transformation(duration = 10) {
        const particleCount = 300;
        const group = new THREE.Group();
        const geometry = new THREE.SphereGeometry(0.02, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffcc66,
            transparent: true,
            opacity: 0.8
        });

        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(geometry, material.clone());
            particle.position.copy(this.camera.position);
            particle.userData = {
                originalRadius: 0.3 + Math.random() * 0.2,
                phi: Math.random() * Math.PI,
                phase: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random()
            };
            group.add(particle);
        }

        const { camera, cameraRight, cameraUp, cameraForward } = this;
        let elapsed = 0;

        this.add(group, delta => {
            elapsed += delta;
            const progress = Math.min(1, elapsed / duration);
            if (progress >= 1) return true;

            // Camera axes in world space (computed once per frame)
            cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
            cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
            cameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion);

            // Expand from 1x to 3x over the effect's lifetime
            const expandFactor = 1 + progress * 2;

            group.children.forEach(particle => {
                const userData = particle.userData;
                userData.phase += 0.5 * delta * userData.speed;

                const radius = userData.originalRadius * expandFactor;

                // Position in the camera's local space, converted to world space
                particle.position.copy(camera.position)
                    .addScaledVector(cameraRight, radius * Math.sin(userData.phi) * Math.cos(userData.phase))
                    .addScaledVector(cameraUp, radius * Math.sin(userData.phi) * Math.sin(userData.phase))
                    .addScaledVector(cameraForward, radius * Math.cos(userData.phi));

                particle.material.opacity = 1 - progress;
            });

            return false;
        });
    }
}
