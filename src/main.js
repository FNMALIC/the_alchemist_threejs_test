// main.js - Sets up the scene and runs the experience
import * as THREE from 'three';
import { Environment } from './world/environment.js';
import { Player } from './player.js';
import { Orb } from './orb.js';
import { AmbientAudio } from './audio.js';
import { Effects } from './effects.js';
import { StoryDirector, StoryText } from './story.js';
import { createStages } from './stages.js';

const ORB_POSITION = new THREE.Vector3(0, 1, -3);
const PLAYER_START = new THREE.Vector3(0, 2, 5);
const PROXIMITY_RANGE = 10; // How far away the orb starts reacting to you

// Scene, camera, renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.copy(PLAYER_START);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const orbLight = new THREE.PointLight(0xffcc66, 1, 10);
orbLight.position.set(0, 3, 0);
scene.add(orbLight);

// World: keep vegetation away from the orb, the start point and the path between them
const environment = new Environment(scene, {
    clearZones: [
        { x: ORB_POSITION.x, z: ORB_POSITION.z, radius: 2.5 },
        { x: PLAYER_START.x, z: PLAYER_START.z, radius: 1.5 },
        { x: (ORB_POSITION.x + PLAYER_START.x) / 2, z: (ORB_POSITION.z + PLAYER_START.z) / 2, radius: 1.5 }
    ]
});
environment.init();

const orb = new Orb(ORB_POSITION);
scene.add(orb.mesh);

const player = new Player(camera, document.body);
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
const world = {
    orb,
    audio,
    effects,
    storyText,
    ui,
    lights: { ambient: ambientLight, orb: orbLight },
    distanceToOrb: camera.position.distanceTo(orb.position)
};
const story = new StoryDirector(createStages(world), 'intro');

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

    world.distanceToOrb = camera.position.distanceTo(orb.position);
    if (orb.visible) {
        const proximity = Math.max(0, 1 - (world.distanceToOrb / PROXIMITY_RANGE));
        orb.setProximity(proximity, elapsed);
        audio.setProximity(proximity);
    }
    orb.update(delta, elapsed, audio.getFrequencyData());

    story.update(delta);
    storyText.update(delta);
    effects.update(delta);
    environment.update(elapsed);

    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
