// main.js - Sets up the scene and runs the experience
import * as THREE from 'three';
import { World } from './world/world.js';
import { Player } from './player.js';
import { Orb } from './orb.js';
import { AmbientAudio } from './audio.js';
import { Effects } from './effects.js';
import { StoryDirector, StoryText } from './story.js';
import { createStages } from './stages.js';

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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// World
const world = new World(scene, { oasis: OASIS, orb: { x: ORB_POSITION.x, z: ORB_POSITION.z } });

// The orb, and the warm light it casts on the sand around it
const orb = new Orb(ORB_POSITION);
scene.add(orb.mesh);

const orbLight = new THREE.PointLight(0xffcc66, 40, 35, 2);
orbLight.position.copy(ORB_POSITION);
scene.add(orbLight);

const player = new Player(camera, document.body, {
    groundHeightAt: world.heightAt,
    bounds: world.terrain.bounds()
});
player.placeOnGround();
const startDistance = camera.position.distanceTo(orb.position);
const audio = new AmbientAudio(`${import.meta.env.BASE_URL}ambient.mp3`);
const effects = new Effects(scene, camera);

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
    lights: { ...world.lights, orb: orbLight },
    distanceToOrb: startDistance,
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

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// Main loop
const clock = new THREE.Clock();

function animate() {
    // Clamp so a paused/background tab doesn't cause a huge jump
    const delta = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.elapsedTime;

    player.update(delta);

    storyState.distanceToOrb = camera.position.distanceTo(orb.position);
    storyState.distanceFromStart = Math.hypot(camera.position.x - PLAYER_START.x, camera.position.z - PLAYER_START.z);
    if (orb.visible) {
        const proximity = Math.max(0, 1 - (storyState.distanceToOrb / PROXIMITY_RANGE));
        orb.setProximity(proximity, elapsed);
        audio.setProximity(proximity);
        world.setJourneyProgress(Math.max(0, 1 - storyState.distanceToOrb / startDistance));
    }
    orb.update(delta, elapsed, audio.getFrequencyData());

    story.update(delta);
    storyText.update(delta);
    effects.update(delta);
    world.update(delta, elapsed, camera);

    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

// Dev-only handle for debugging in the browser console (stripped from production builds)
if (import.meta.env.DEV) {
    window.mirage = { scene, camera, player, orb, world, story, storyState, renderer };
}
