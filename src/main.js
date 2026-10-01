// main.js - Sets up the scene and runs the experience
import * as THREE from 'three';
import { World } from './world/world.js';
import { PlayerController } from './player/playerController.js';
import { Orb } from './orb.js';
import { AmbientAudio } from './audio.js';
import { Footsteps } from './footsteps.js';
import { Effects } from './effects.js';
import { StoryDirector, StoryText } from './story.js';
import { createStages } from './stages.js';
import { Renderer, getQuality } from './render.js';
import { InteractionPrompt } from './interactions/interactionPrompt.js';
import { Environment } from './environment/environment.js';
import { registerVegetation } from './environment/vegetation.js';
import { EnvironmentSounds } from './environment/environmentSounds.js';

// The oasis where you wake, and the light far out across the dunes
const OASIS = { x: 0, z: 0, poolX: -7, poolZ: 1 };
const ORB_POSITION = new THREE.Vector3(25, 2.2, -150);
const PLAYER_START = new THREE.Vector3(0, 0, 6);
const PROXIMITY_RANGE = 40; // How far away the orb starts reacting to you
const INTERACTION_DISTANCE = 3; // Metres from the eye at which things can be interacted with

const parameters = new URLSearchParams(window.location.search);

// Scene, camera, renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.copy(PLAYER_START);
camera.lookAt(ORB_POSITION.x, 2, ORB_POSITION.z);
scene.add(camera); // The first-person hands hang from it

const quality = getQuality();
const renderer = new Renderer(scene, camera, quality);

// World. The real sky of this morning over Al-Fayoum (or ?date=YYYY-MM-DD), turned so the
// sun rises behind the light.
const dateParameter = parameters.get('date');
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

const player = new PlayerController(camera, document.body, {
    groundHeightAt: world.heightAt,
    bounds: world.terrain.bounds(),
    colliders: world.colliders,
    isUnderWater: (x, z) => world.isUnderWater(x, z),
    isFirmGround: (x, z) => world.isFirmGround(x, z)
}, {
    scene,
    interaction: {
        distance: INTERACTION_DISTANCE,
        // Trunks, the old tree, rocks and the dunes hide what is behind them
        occlusion: { blockers: world.solids, groundHeightAt: world.heightAt }
    }
});
player.placeOnGround();
renderer.addViewModel(player.hands.camera); // After the lights are made: they light the hands too
let distanceWalked = 0;
const lastPosition = camera.position.clone();
const audio = new AmbientAudio(`${import.meta.env.BASE_URL}ambient.mp3`);
const footsteps = new Footsteps(audio);

// Every step and landing makes a sound; the sand and anything nearby answer through the environment
player.onStep = step => footsteps.step(step);
player.onLand = strength => footsteps.land(strength);
const effects = new Effects(scene, camera, world.heightAt);

// The world noticing the player: sand under the feet, shrubs and flowers that move as you pass
const environment = new Environment({ player, world, scene, low: quality.low });
registerVegetation(environment, world.vegetation);
new EnvironmentSounds(audio, environment, camera);

// UI
const ui = {
    instructions: document.getElementById('instructions'),
    story: document.getElementById('story'),
    fadeOverlay: document.getElementById('fade-overlay'),
    restartButton: document.getElementById('restart-button'),
    volumeSlider: document.getElementById('volume-slider'),
    crosshair: document.getElementById('crosshair'),
    interactionPrompt: document.getElementById('interaction-prompt')
};
const storyText = new StoryText(ui.story);
new InteractionPrompt(player.interaction, { element: ui.interactionPrompt, crosshair: ui.crosshair });

// Development only (left out of production builds): a test stone and flower to try the
// interaction system on (?fixtures=off leaves them out), and ?debug shows what the gaze rests on
let testInteractables = null;
let interactionDebug = null;
if (import.meta.env.DEV) {
    if (parameters.get('fixtures') !== 'off') {
        import('./interactions/testInteractables.js').then(({ createTestInteractables }) => {
            testInteractables = createTestInteractables({
                world, interaction: player.interaction, origin: PLAYER_START, toward: ORB_POSITION
            });
        });
    }
    if (parameters.has('debug')) {
        import('./interactions/interactionDebug.js').then(({ InteractionDebug }) => {
            interactionDebug = new InteractionDebug(player.interaction, environment);
        });
    }
}

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

// While the pointer is locked the crosshair shows; the instructions and volume control step aside
player.pointerLock.addEventListener('lock', () => {
    ui.instructions.classList.add('hidden');
    document.body.classList.add('locked');
});
player.pointerLock.addEventListener('unlock', () => {
    ui.instructions.classList.remove('hidden');
    document.body.classList.remove('locked');
});

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
    environment.update(delta);
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
    interactionDebug?.update(delta);

    // Sliding down a dune: a hiss of sand (the spray around the feet comes from the environment)
    footsteps.slide(player.slide.length());
    world.updateEnvironment(renderer.renderer);

    renderer.render();
}

renderer.renderer.setAnimationLoop(animate);

// Dev-only handle for debugging in the browser console (stripped from production builds)
if (import.meta.env.DEV) {
    window.mirage = {
        scene, camera, player, orb, world, story, storyState, renderer: renderer.renderer,
        interaction: player.interaction,
        environment,
        get testInteractables() { return testInteractables; }
    };
}
