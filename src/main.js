// main.js - Sets up the scene and runs the experience
import * as THREE from 'three';
import { World } from './world/world.js';
import { Player } from './player.js';
import { Orb } from './orb.js';
import { AmbientAudio } from './audio.js';
import { Footsteps } from './footsteps.js';
import { Effects } from './effects.js';
import { StoryDirector, StoryText } from './story.js';
import { createStages } from './stages.js';
import { Renderer, getQuality } from './render.js';

// The oasis where you wake, and the light far out across the dunes
const OASIS = { x: 0, z: 0, poolX: -7, poolZ: 1 };
const ORB_POSITION = new THREE.Vector3(25, 2.2, -150);
const PLAYER_START = new THREE.Vector3(0, 0, 6);
const PROXIMITY_RANGE = 40; // How far away the orb starts reacting to you

// Scene, camera, renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.copy(PLAYER_START);
camera.lookAt(ORB_POSITION.x, 2, ORB_POSITION.z);

const quality = getQuality();
const renderer = new Renderer(scene, camera, quality);

// World. The real sky of this morning over Al-Fayoum (or ?date=YYYY-MM-DD), turned so the
// sun rises behind the light.
const dateParameter = new URLSearchParams(window.location.search).get('date');
const skyDate = dateParameter ? new Date(`${dateParameter}T12:00:00Z`) : new Date();
const world = new World(scene, {
    oasis: OASIS,
    orb: { x: ORB_POSITION.x, z: ORB_POSITION.z },
    skyOptions: {
        date: Number.isNaN(skyDate.getTime()) ? new Date() : skyDate,
        sceneBearing: THREE.MathUtils.radToDeg(Math.atan2(ORB_POSITION.x - PLAYER_START.x, PLAYER_START.z - ORB_POSITION.z))
    },
    shadows: quality.shadows
});

// The orb, and the warm light it casts on the sand around it
const orb = new Orb(ORB_POSITION);
scene.add(orb.mesh);

const orbLight = new THREE.PointLight(0xffcc66, 40, 35, 2);
orbLight.castShadow = false; // Point light shadows are expensive (six renders per frame)
orbLight.position.copy(ORB_POSITION);
scene.add(orbLight);

const player = new Player(camera, document.body, {
    groundHeightAt: world.heightAt,
    bounds: world.terrain.bounds(),
    colliders: world.colliders,
    isUnderWater: (x, z) => world.isUnderWater(x, z),
    isFirmGround: (x, z) => world.isFirmGround(x, z)
});
player.placeOnGround();
let distanceWalked = 0;
const lastPosition = camera.position.clone();
const audio = new AmbientAudio(`${import.meta.env.BASE_URL}ambient.mp3`);
const footsteps = new Footsteps(audio);

// Every step: a sound, a footprint in the sand, and a few grains kicked back
player.onStep = step => {
    footsteps.step(step);
    if (step.surface !== 'sand') return;
    world.footprints.add(step);
    const ground = world.heightAt(step.x, step.z);
    const backX = -Math.sin(step.heading), backZ = -Math.cos(step.heading);
    world.sandSpray.emit(step.x, ground, step.z, backX * 0.6, backZ * 0.6, 5 + Math.floor(step.intensity * 6), 0.9 + step.downhill);
};
player.onLand = strength => {
    footsteps.land(strength);
    const { x, z } = player.eye;
    const ground = world.heightAt(x, z);
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        world.sandSpray.emit(x, ground, z, Math.cos(angle), Math.sin(angle), 4, 1 + strength * 1.5, 0.3);
    }
};
const effects = new Effects(scene, camera, world.heightAt);

// UI
const ui = {
    instructions: document.getElementById('instructions'),
    story: document.getElementById('story'),
    fadeOverlay: document.getElementById('fade-overlay'),
    restartButton: document.getElementById('restart-button'),
    volumeSlider: document.getElementById('volume-slider')
};
const storyText = new StoryText(ui.story);

// Story
const storyState = {
    orb,
    audio,
    effects,
    storyText,
    ui,
    lights: { orb: orbLight },
    distanceToOrb: camera.position.distanceTo(orb.position),
    sky: world.sky,
    distanceFromStart: 0
};
const story = new StoryDirector(createStages(storyState), 'intro');

// Click to start: lock the pointer and start audio (browsers require a user gesture)
document.addEventListener('click', event => {
    // Let the UI controls be used without grabbing the mouse
    if (event.target.closest('#audio-controls, #restart-button')) return;

    if (!player.isLocked) {
        player.lock();
        audio.start();
    }
});

player.controls.addEventListener('lock', () => ui.instructions.classList.add('hidden'));
player.controls.addEventListener('unlock', () => ui.instructions.classList.remove('hidden'));

audio.setUserVolume(Number(ui.volumeSlider.value));
ui.volumeSlider.addEventListener('input', () => {
    audio.setUserVolume(Number(ui.volumeSlider.value));
});

ui.restartButton.addEventListener('click', () => window.location.reload());

// Main loop
const clock = new THREE.Clock();

function animate() {
    // Clamp so a paused/background tab doesn't cause a huge jump
    const delta = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.elapsedTime;

    player.update(delta);
    // Measured from the eye position, so the head's sway doesn't count as walking
    distanceWalked += Math.hypot(player.eye.x - lastPosition.x, player.eye.z - lastPosition.z);
    lastPosition.copy(player.eye);

    storyState.distanceToOrb = camera.position.distanceTo(orb.position);
    storyState.distanceFromStart = Math.hypot(camera.position.x - PLAYER_START.x, camera.position.z - PLAYER_START.z);
    if (orb.visible) {
        const proximity = Math.max(0, 1 - (storyState.distanceToOrb / PROXIMITY_RANGE));
        orb.setProximity(proximity, elapsed);
        audio.setProximity(proximity);
    }
    orb.update(delta, elapsed, audio.getFrequencyData());

    story.update(delta);
    storyText.update(delta);
    effects.update(delta);
    world.update(delta, elapsed, camera, distanceWalked);

    // Sliding down a dune: a hiss of sand and a spray around the feet
    const slideSpeed = player.slide.length();
    footsteps.slide(slideSpeed);
    if (slideSpeed > 0.8 && Math.random() < delta * 30) {
        const { x, z } = player.eye;
        const dx = player.slide.x / slideSpeed, dz = player.slide.y / slideSpeed;
        world.sandSpray.emit(x + dx * 0.3, world.heightAt(x, z), z + dz * 0.3, dx * 0.5, dz * 0.5, 3, 0.6 + slideSpeed * 0.3, 0.9);
    }
    world.updateEnvironment(renderer.renderer);

    renderer.render();
}

renderer.renderer.setAnimationLoop(animate);

// Dev-only handle for debugging in the browser console (stripped from production builds)
if (import.meta.env.DEV) {
    window.mirage = { scene, camera, player, orb, world, story, storyState, renderer: renderer.renderer };
}
