// farAway.js - For those who walk the wrong way. Turn your back on the light and keep going:
// about 450 m out, a small brass compass lies half buried in the sand, its glass cracked, its
// needle bent. Nothing says what it is or whose. Now and then the low sun or the moon catches
// its glass, a glint you can see from a little way off.
// Far beyond it, more than a kilometre from the oasis, stands a pyramid as large as the Great
// Pyramid, its casing long gone, so its courses make giant steps. You can climb it, one step at a
// time, all the way to the flat top where the capstone is missing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createGlowTexture } from './sky.js';

const COMPASS_DISTANCE = 450; // Metres from the oasis, away from the light
const PYRAMID_DISTANCE = 1150;
export const PYRAMID = {
    half: 115, // Half the base (230 m, like the Great Pyramid)
    courses: 132, // Steps of stone, 1 m each: 132 m tall, a 12 m wide top
    rise: 1.0,
    run: 0.833 // How far each course steps in (the faces slope at about 50°)
};

// Where they are: straight out from the oasis, away from the light
export function farPlaces(oasis, light) {
    const away = new THREE.Vector2(oasis.x - light.x, oasis.z - light.z).normalize();
    // A little off the straight line, so walking dead straight is not quite enough
    const side = new THREE.Vector2(-away.y, away.x);
    return {
        compass: { x: oasis.x + away.x * COMPASS_DISTANCE + side.x * 14, z: oasis.z + away.y * COMPASS_DISTANCE + side.y * 14 },
        pyramid: { x: oasis.x + away.x * PYRAMID_DISTANCE - side.x * 60, z: oasis.z + away.y * PYRAMID_DISTANCE - side.y * 60 }
    };
}

// Height of the pyramid's stones at (x, z), or -Infinity off it (its base is at height 0)
export function pyramidHeightAt(center, x, z) {
    const out = Math.max(Math.abs(x - center.x), Math.abs(z - center.z));
    if (out >= PYRAMID.half) return -Infinity;
    const course = Math.min(PYRAMID.courses, Math.floor((PYRAMID.half - out) / PYRAMID.run) + 1);
    return course * PYRAMID.rise;
}

export class FarAway {
    // world: World; places: from farPlaces()
    constructor(world, places) {
        this.world = world;
        this.places = places;
        this.compass = this.createCompass(places.compass);
        this.pyramid = this.createPyramid(places.pyramid);
        this.glint = this.createGlint(places.compass);
        this.toEye = new THREE.Vector3();
        this.mirror = new THREE.Vector3();
    }

    createCompass({ x, z }) {
        const brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.9, roughness: 0.35 });
        const compass = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.058, 0.018, 24), brass);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.004, 6, 24).rotateX(Math.PI / 2), brass);
        ring.position.y = 0.009;
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.049, 24).rotateX(-Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.8 }));
        face.position.y = 0.0095;
        // The needle, bent where something struck it
        const needleMaterial = new THREE.MeshStandardMaterial({ color: 0x6a1f1a, roughness: 0.6 });
        const north = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.04).translate(0, 0, -0.02), needleMaterial);
        const south = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.036).translate(0, 0, 0.018),
            new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.6 }));
        north.rotation.y = 0.4;
        south.rotation.y = 0.4 + 0.5;
        north.position.y = south.position.y = 0.0115;
        // The glass, cracked across
        const glass = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24).rotateX(-Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.25 }));
        glass.position.y = 0.0135;
        const crack = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.0005, 0.0012).rotateY(0.7),
            new THREE.MeshBasicMaterial({ color: 0xf4f0e8 }));
        crack.position.y = 0.0138;
        compass.add(body, ring, face, north, south, glass, crack);
        compass.traverse(part => { part.castShadow = true; part.receiveShadow = true; });
        // Half buried, tipped up on one side
        compass.position.set(x, this.world.heightAt(x, z) - 0.004, z);
        compass.rotation.set(0.22, 1.9, -0.1);
        this.world.scene.add(compass);
        return compass;
    }

    createPyramid(center) {
        // One slab per course, each a step smaller than the one below, all in one mesh
        const slabs = [];
        const color = new THREE.Color();
        for (let i = 0; i < PYRAMID.courses; i++) {
            const size = 2 * (PYRAMID.half - i * PYRAMID.run);
            const slab = new THREE.BoxGeometry(size, PYRAMID.rise, size);
            slab.translate(0, (i + 0.5) * PYRAMID.rise, 0);
            // Each course quarried from a slightly different bed of stone
            color.setHex(0xcdb48a).offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
            const colors = new Float32Array(slab.attributes.position.count * 3);
            for (let j = 0; j < colors.length; j += 3) color.toArray(colors, j);
            slab.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            slabs.push(slab);
        }
        const geometry = mergeGeometries(slabs);
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
        // So large it shows through the haze from far away: less fog on it than on the dunes
        material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `
                #ifdef USE_FOG
                    float farFog = 1.0 - exp(-fogDensity * fogDensity * 0.02 * vFogDepth * vFogDepth);
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, farFog);
                #endif`);
        };
        material.customProgramCacheKey = () => 'pyramid';
        const pyramid = new THREE.Mesh(geometry, material);
        pyramid.position.set(center.x, 0, center.z);
        pyramid.castShadow = true;
        pyramid.receiveShadow = true;
        this.world.scene.add(pyramid);
        return pyramid;
    }

    // A glint of light off the compass glass, seen from a little way off
    createGlint({ x, z }) {
        const glint = new THREE.Sprite(new THREE.SpriteMaterial({
            map: createGlowTexture('rgba(255, 250, 235, 1)', 32),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
            opacity: 0
        }));
        glint.position.set(x, this.world.heightAt(x, z) + 0.03, z);
        this.world.scene.add(glint);
        return glint;
    }

    // Is (x, z) the pyramid's stone (firm, no sliding, no prints)?
    onStone(x, z) {
        const { x: px, z: pz } = this.places.pyramid;
        return Math.max(Math.abs(x - px), Math.abs(z - pz)) < PYRAMID.half;
    }

    // The glint: sunlight (or moonlight) mirrored off the glass toward the eye
    update(camera, sky, lights, elapsed) {
        const glint = this.glint;
        const distance = this.toEye.subVectors(camera.position, glint.position).length();
        if (distance > 120 || distance < 1.5) {
            glint.material.opacity = 0;
            return;
        }
        this.toEye.divideScalar(distance);
        const sunLeads = lights.sun.intensity > lights.moon.intensity;
        const light = sunLeads ? sky.sunDirection : sky.moonDirection;
        const brightness = sunLeads ? Math.min(1, lights.sun.intensity) : lights.moon.intensity;
        // The glass faces up, tipped a little and trembling in the heat: mirror the light in it
        const wobble = 0.05 * Math.sin(elapsed * 1.7);
        this.mirror.set(Math.sin(0.22) + wobble, 1, 0.1).normalize();
        const reflected = this.mirror.multiplyScalar(2 * light.dot(this.mirror)).sub(light);
        const shine = Math.pow(Math.max(0, reflected.dot(this.toEye)), 60);
        glint.material.opacity = Math.min(1, shine * brightness * 2);
        glint.scale.setScalar(0.012 * distance + 0.05); // About the same few pixels at any distance
    }
}
