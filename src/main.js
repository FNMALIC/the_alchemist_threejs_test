// main.js - Sets up the scene and runs the experience
import * as THREE from 'three';
import { World } from './world/world.js';
import { Player } from './player.js';
import { Orb } from './orb.js';
import { AmbientAudio } from './audio.js';
import { Footsteps } from './footsteps.js';
import { JourneyMusic } from './music.js';
import { StoryDirector, StoryText } from './story.js';
import { createStages } from './stages.js';
import { Moments } from './moments.js';
import { Traces } from './world/traces.js';
import { Storm } from './storm.js';
import { loadMemory, saveMemory, PathRecorder } from './memory.js';
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
    shadows: quality.shadows,
    playerStart: { x: PLAYER_START.x, z: PLAYER_START.z }
});

// The orb, and the warm light it casts on the sand around it
const orb = new Orb(ORB_POSITION);
scene.add(orb.mesh);

const ORB_LIGHT_INTENSITY = 40;
const orbLight = new THREE.PointLight(0xffcc66, ORB_LIGHT_INTENSITY, 35, 2);
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
let slideDistance = 0;
const lastPosition = camera.position.clone();
const audio = new AmbientAudio(`${import.meta.env.BASE_URL}ambient.mp3`);
const footsteps = new Footsteps(audio);
// Footstep sounds are switched off for now (they don't sit well with the rest of the world yet);
// add ?footsteps=on to the URL to hear them
const FOOTSTEP_SOUNDS = new URLSearchParams(window.location.search).get('footsteps') === 'on';
const music = new JourneyMusic(audio);

// Every step: a sound, a footprint in the sand, and a few grains kicked back
player.onStep = step => {
    if (FOOTSTEP_SOUNDS) footsteps.step(step);
    if (step.surface !== 'sand') return;
    world.sandPatch.stamp(step); // A real dent nearby...
    world.footprints.add(step); // ...and a mark that carries the trail on further away
    const ground = world.heightAt(step.x, step.z);
    const backX = -Math.sin(step.heading), backZ = -Math.cos(step.heading);
    world.sandSpray.emit(step.x, ground, step.z, backX * 0.6, backZ * 0.6, 5 + Math.floor(step.intensity * 6), 0.9 + step.downhill);
};
player.onLand = strength => {
    if (FOOTSTEP_SOUNDS) footsteps.land(strength);
    const { x, z } = player.eye;
    const heading = Math.atan2(player.heading.x, player.heading.y);
    [-1, 1].forEach(foot => world.sandPatch.stamp({ x, z, heading, foot }, 1.2 + strength * 0.5));
    const ground = world.heightAt(x, z);
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        world.sandSpray.emit(x, ground, z, Math.cos(angle), Math.sin(angle), 4, 1 + strength * 1.5, 0.3);
    }
};
// Someone else walked here before you. And the desert remembers your earlier walks.
const memory = loadMemory();
const traces = new Traces(world, world.oldTree.position, ORB_POSITION, memory);
const pathRecorder = new PathRecorder();
const storm = new Storm();

// UI
const ui = {
    instructions: document.getElementById('instructions'),
    story: document.getElementById('story'),
    fadeOverlay: document.getElementById('fade-overlay'),
    restartButton: document.getElementById('restart-button'),
    hint: document.getElementById('hint'),
    volumeSlider: document.getElementById('volume-slider')
};
const storyText = new StoryText(ui.story);

// Story
const storyState = {
    orb,
    audio,
    music,
    storyText,
    ui,
    sky: world.sky,
    player,
    traces,
    distanceToOrb: camera.position.distanceTo(orb.position),
    distanceFromStart: 0,
    distanceToSeat: Infinity,
    wantsToSit: false,
    remember: () => saveMemory({ journeys: memory.journeys + 1, path: pathRecorder.points })
};
const story = new StoryDirector(createStages(storyState), 'night');

// The traveller's traces, found by wandering; their footprints only mean something at night,
// before you know where they lead
const onTheWay = () => ['night', 'crossing'].includes(story.current) && storyState.distanceFromStart > 15 &&
    storyState.distanceToOrb > 30;
const moments = new Moments(storyText, [
    {
        text: 'Footprints. Not yours.',
        test: (x, z) => onTheWay() && traces.distanceToTrail(traces.outward, x, z) < 2
    },
    {
        // Your own last walk, if you have been here before
        text: 'Footprints. Yours.',
        test: (x, z) => onTheWay() && traces.pastPath.length > 0 && traces.distanceToTrail(traces.pastPath, x, z) < 2
    },
    ...traces.moments
], () => story.current);

document.addEventListener('keydown', event => {
    if (event.code === 'KeyE' && story.current === 'morning') storyState.wantsToSit = true;
});

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
const debug = { timeScale: 1 }; // Dev only: fast-forward the experience from the console

function animate() {
    // Clamp so a paused/background tab doesn't cause a huge jump
    const delta = Math.min(clock.getDelta(), 0.1) * debug.timeScale;
    const elapsed = clock.elapsedTime;

    // Physics in small steps, even when fast-forwarding
    for (let remaining = delta; remaining > 1e-6; remaining -= 0.1) player.update(Math.min(remaining, 0.1));
    // Measured from the eye position, so the head's sway doesn't count as walking
    distanceWalked += Math.hypot(player.eye.x - lastPosition.x, player.eye.z - lastPosition.z);
    lastPosition.copy(player.eye);

    storyState.distanceToOrb = Math.hypot(camera.position.x - orb.position.x, camera.position.z - orb.position.z);
    storyState.distanceFromStart = Math.hypot(camera.position.x - PLAYER_START.x, camera.position.z - PLAYER_START.z);
    storyState.distanceToSeat = Math.hypot(camera.position.x - traces.seat.x, camera.position.z - traces.seat.z);
    if (orb.visible) {
        // As the light fades away, the music comes back from its hush
        const proximity = Math.max(0, 1 - (storyState.distanceToOrb / PROXIMITY_RANGE)) * orb.fade;
        orb.setProximity(proximity, elapsed);
        audio.setProximity(proximity);
    }
    orb.update(delta, elapsed, audio.getFrequencyData());
    orbLight.intensity = orb.visible ? ORB_LIGHT_INTENSITY * orb.fade : 0;

    story.update(delta);
    storyText.update(delta);
    moments.update(delta, camera.position.x, camera.position.z);
    if (['night', 'crossing'].includes(story.current)) pathRecorder.add(player.eye.x, player.eye.z);

    // The storm, partway across: it thickens the air, roars over the music and pushes you
    const stormIntensity = storm.update(delta, distanceWalked, storyState.distanceToOrb, story.current === 'crossing');
    world.storm = stormIntensity;
    player.storm = stormIntensity;
    const gust = 0.6 + 0.4 * Math.sin(elapsed * 0.35) + 0.2 * Math.sin(elapsed * 1.3 + 1);
    traces.update(elapsed, gust + stormIntensity * 2);
    world.update(delta, elapsed, camera, distanceWalked);

    // The music grows with the walk and turns toward morning at first light
    music.update(delta, { progress: world.sky.dawnProgress, sunAltitude: world.sky.sunAltitude, storm: stormIntensity });

    // Sliding down a dune: a hiss of sand and a spray around the feet
    const slideSpeed = player.slide.length();
    if (FOOTSTEP_SOUNDS) footsteps.slide(slideSpeed);
    if (slideSpeed > 0.8) {
        // The feet cut a groove as they slide
        slideDistance += slideSpeed * delta;
        if (slideDistance > 0.12) {
            slideDistance = 0;
            world.sandPatch.groove(player.eye.x, player.eye.z, player.slide.x / slideSpeed, player.slide.y / slideSpeed);
        }
    }
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
    window.mirage = { scene, camera, player, orb, world, story, storyState, renderer: renderer.renderer, music, audio, traces, debug, storm };
}
