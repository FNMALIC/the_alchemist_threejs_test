// main.js - Sets up the scene and runs the experience
import * as THREE from 'three';
import { World } from './world/world.js';
import { PlayerController } from './player/playerController.js';
import { BodyShadow } from './player/bodyShadow.js';
import { CrestSeat } from './player/crestSeat.js';
import { Orb } from './orb.js';
import { AmbientAudio } from './audio.js';
import { JourneyMusic } from './music.js';
import { StoryDirector, StoryText } from './story.js';
import { createStages } from './stages.js';
import { Moments } from './moments.js';
import { Traces } from './world/traces.js';
import { Constellations } from './world/constellations.js';
import { Soundscape } from './soundscape.js';
import { Messages } from './messages.js';
import { Storm } from './storm.js';
import { loadMemory, saveMemory, PathRecorder, skyOfThisVisit, returnLine } from './memory.js';
import { Body } from 'astronomy-engine';
import { horizontalPosition } from './world/astronomy.js';
import { Renderer, getQuality } from './render.js';
import { InteractionPrompt } from './interactions/interactionPrompt.js';
import { Environment } from './environment/environment.js';
import { registerVegetation, plantReaction } from './environment/vegetation.js';
import { createReactive } from './environment/reactive.js';

// The oasis where you wake, and the light far out across the dunes
const OASIS = { x: 0, z: 0, poolX: -7, poolZ: 1 };
const ORB_POSITION = new THREE.Vector3(25, 2.2, -150);
const PLAYER_START = new THREE.Vector3(0, 0, 6);
const PROXIMITY_RANGE = 40; // How far away the orb starts reacting to you
const INTERACTION_DISTANCE = 3; // Metres from the eye at which things can be interacted with

const parameters = new URLSearchParams(window.location.search);

// Scene, camera, renderer
const scene = new THREE.Scene();
// Far enough to see the pyramid, far out, through the haze
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.copy(PLAYER_START);
camera.lookAt(ORB_POSITION.x, 2, ORB_POSITION.z);
scene.add(camera);

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

const player = new PlayerController(camera, document.body, {
    groundHeightAt: (x, z) => world.groundAt(x, z), // The dunes, or the pyramid's steps
    sandHeightAt: world.heightAt, // The dunes alone (sliding and slopes are for sand)
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
player.movement.windDirection = world.wind.direction; // The storm pushes the way the wind blows
// Your shadow on the sand, with no body to see
const bodyShadow = new BodyShadow();
scene.add(bodyShadow.object);
const ORB_GLOW = new THREE.Color(1.0, 0.72, 0.38);
const ORB_BOUNCE = new THREE.Color(0.85, 0.55, 0.28); // Its light, coming back up off the sand
let distanceWalked = 0;
let slideDistance = 0;
const lastPosition = camera.position.clone();
const audio = new AmbientAudio(`${import.meta.env.BASE_URL}ambient.mp3`);
const music = new JourneyMusic(audio);

// Every step and landing presses a real dent into the sand nearby. The footprint marks further
// away and the grains kicked up come from the environment (sandResponse.js). Walking is silent.
player.onStep = step => {
    if (step.surface === 'sand') world.sandPatch.stamp(step);
};
player.onLand = strength => {
    const { x, z } = player.eye;
    const heading = Math.atan2(player.movement.heading.x, player.movement.heading.y);
    [-1, 1].forEach(foot => world.sandPatch.stamp({ x, z, heading, foot }, 1.2 + strength * 0.5));
};
// Someone else walked here before you. And the desert remembers your earlier walks.
const memory = loadMemory();
const traces = new Traces(world, world.oldTree.position, ORB_POSITION, memory);
// This night's sky, to compare with next time: is Venus up before the sun (the morning star)?
const morningStar = horizontalPosition(Body.Venus, new Date(world.sky.clock.end - 40 * 60000)).altitude > 5;
const thisVisit = skyOfThisVisit(world.sky, morningStar);
const soundscape = new Soundscape(music, world, traces); // Silence, crests and hollows, singing dunes
const pathRecorder = new PathRecorder();
const walkRecorder = new PathRecorder(3, 900); // Your whole walk, for sharing it
const storm = new Storm();

// The world noticing the player: sand under the feet, shrubs and flowers that move as you pass
const environment = new Environment({ player, world, scene, low: quality.low });
registerVegetation(environment, world.vegetation);
// ...and the shrubs of the endless desert, as it is made and taken away around you
const wildPlants = new Map();
world.chunks.onAddPlant = ({ object, kind }) => wildPlants.set(object, environment.registerReactive(
    createReactive({ id: `wild-${kind}-${object.id}`, object, ...plantReaction(object, kind) })
));
world.chunks.onRemovePlant = ({ object }) => {
    environment.unregisterReactive(wildPlants.get(object));
    wildPlants.delete(object);
};

// UI
const ui = {
    instructions: document.getElementById('instructions'),
    story: document.getElementById('story'),
    fadeOverlay: document.getElementById('fade-overlay'),
    restartButton: document.getElementById('restart-button'),
    hint: document.getElementById('hint'),
    volumeSlider: document.getElementById('volume-slider'),
    crosshair: document.getElementById('crosshair'),
    interactionPrompt: document.getElementById('interaction-prompt')
};
const storyText = new StoryText(ui.story);
// Sit on any high crest and watch (not where the story has its own seat, nor at its end)
const crestSeat = new CrestSeat(player, (x, z) => world.groundAt(x, z), document.getElementById('pause-hint'), () =>
    story.current !== 'rest' && !player.interaction.target &&
    !(story.current === 'morning' && storyState.distanceToSeat < 4));
// Rest your gaze on a constellation and its figure draws itself
const constellations = new Constellations(world.sky, document.getElementById('constellation'), world.solids);
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
    returnLine: returnLine(memory.lastVisit, thisVisit), // Coming back: what has changed in the sky
    remember: () => saveMemory({ journeys: memory.journeys + 1, path: pathRecorder.points, lastVisit: thisVisit })
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

// Leave something for the next traveller (N), share your walk; or find what a friend left
const messages = new Messages({ player, traces, storyText, moments, path: () => walkRecorder.points });
messages.receive(onTheWay).then(found => {
    if (found) storyState.returnLine = 'Someone walked here before you. They left you something.';
});

document.addEventListener('keydown', event => {
    // E is also for interacting: it only means "sit" when nothing is in focus
    if (event.code === 'KeyE' && player.isLocked && story.current === 'morning' && !player.interaction.target) storyState.wantsToSit = true;
});

// On a phone or tablet: how to walk with fingers, and the prompts can be tapped
if (player.touch) {
    document.body.classList.add('touch');
    ui.instructions.innerHTML = 'Tap to start<br>Hold the left side to walk (slide up to hurry) · Drag the right side to look<br>' +
        '"Leave something" leaves a note or a picture for whoever walks here after you';
}

// On a phone: look by turning it, if you like (iPhones ask permission, from this tap)
const tiltToggle = document.getElementById('tilt-toggle');
tiltToggle.addEventListener('click', async () => {
    const touch = player.touchControls;
    if (!touch) return;
    if (touch.tiltOn) touch.disableTilt();
    else if (!(await touch.enableTilt())) {
        tiltToggle.textContent = 'Turning the phone is not available here';
        return;
    }
    tiltToggle.classList.toggle('on', touch.tiltOn);
    tiltToggle.textContent = `Look by turning the phone: ${touch.tiltOn ? 'on' : 'off'}`;
});

// Click (or tap) to start: lock the pointer and start audio (browsers require a user gesture)
let wakeLock = null;
document.addEventListener('click', event => {
    // Let the UI controls be used without grabbing the mouse
    if (event.target.closest('#audio-controls, #restart-button, #tilt-toggle, #leave, #leave-button, #share-button, #share-link')) return;

    if (!player.isLocked) {
        player.lock();
        audio.start();
        audio.context?.resume?.(); // Phones may start (or bring back) the sound suspended
        // Keep a phone's screen on during the walk
        if (player.touch && !wakeLock) {
            navigator.wakeLock?.request('screen').then(lock => {
                wakeLock = lock;
                lock.addEventListener('release', () => { wakeLock = null; });
            }).catch(() => {});
        }
    }
});

// While the pointer is locked the crosshair shows; the instructions and volume control step aside
let visitRemembered = false;
player.pointerLock.addEventListener('lock', () => {
    // This visit counts once it has begun (its sky is compared with the next one's)
    if (!visitRemembered) {
        visitRemembered = true;
        document.body.classList.add('walked'); // Now there is a walk to share
        saveMemory({ journeys: memory.journeys, path: memory.path, lastVisit: thisVisit });
    }
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
const debug = { timeScale: 1 }; // Dev only: fast-forward the experience from the console

function animate() {
    // Clamp so a paused/background tab doesn't cause a huge jump
    const delta = Math.min(clock.getDelta(), 0.1) * debug.timeScale;
    const elapsed = clock.elapsedTime;

    // Physics in small steps, even when fast-forwarding
    for (let remaining = delta; remaining > 1e-6; remaining -= 0.1) player.update(Math.min(remaining, 0.1));
    environment.update(delta);
    // Measured from the eye position, so the head's sway doesn't count as walking
    const stepped = Math.hypot(player.eye.x - lastPosition.x, player.eye.z - lastPosition.z);
    distanceWalked += stepped;
    // After sunrise the morning goes on as you walk (home, or anywhere): the sun climbs, the sand warms
    if (['morning', 'rest'].includes(story.current) || world.sky.clock.progress >= 1) {
        world.sky.clock.passMorning(stepped * 0.4 + delta * 0.1);
    }
    lastPosition.copy(player.eye);

    storyState.distanceToOrb = Math.hypot(camera.position.x - orb.position.x, camera.position.z - orb.position.z);
    storyState.distanceFromStart = Math.hypot(camera.position.x - PLAYER_START.x, camera.position.z - PLAYER_START.z);
    storyState.distanceToSeat = Math.hypot(camera.position.x - traces.seat.x, camera.position.z - traces.seat.z);
    let orbProximity = 0;
    if (orb.visible) {
        // As the light fades away, the music comes back from its hush
        orbProximity = Math.max(0, 1 - (storyState.distanceToOrb / PROXIMITY_RANGE)) * orb.fade;
        orb.setProximity(orbProximity, elapsed);
        audio.setProximity(orbProximity);
    }
    orb.update(delta, elapsed, audio.getFrequencyData());
    orbLight.intensity = orb.visible ? ORB_LIGHT_INTENSITY * orb.fade : 0;
    // Its glow pools on the sand around it, warmer and wider as you come close
    world.terrain.orbGlow.position.value.copy(orb.position);
    world.terrain.orbGlow.color.value.copy(ORB_GLOW).multiplyScalar(orb.visible ? orb.fade * (0.5 + 0.9 * orbProximity) : 0);

    story.update(delta);
    storyText.update(delta);
    moments.update(delta, camera.position.x, camera.position.z);
    if (['night', 'crossing'].includes(story.current)) pathRecorder.add(player.eye.x, player.eye.z);
    if (visitRemembered && !player.seated) walkRecorder.add(player.eye.x, player.eye.z);

    // The storm, partway across: it thickens the air, roars over the music and pushes you
    const stormIntensity = storm.update(delta, distanceWalked, storyState.distanceToOrb, story.current === 'crossing');
    world.storm = stormIntensity;
    player.storm = stormIntensity;
    world.update(delta, elapsed, camera, distanceWalked);
    interactionDebug?.update(delta);
    constellations.update(delta, camera, player.isLocked && !player.interaction.target);

    traces.update(world.sky.sunAltitude); // Their trail comes out in the low sun

    // The music grows with the walk and turns toward morning at first light; where you stand
    // changes it (places of silence, crests, hollows)
    soundscape.update(delta, {
        eye: player.eye, slide: player.slide, sunAltitude: world.sky.sunAltitude, storm: stormIntensity, distanceWalked
    });
    crestSeat.update(delta, soundscape.exposure);
    // Near the traveller's things, the walk slows on its own, as if paying attention
    let nearest = Infinity;
    for (const mark of traces.landmarks) nearest = Math.min(nearest, Math.hypot(player.eye.x - mark.x, player.eye.z - mark.z));
    player.movement.attention = 1 - THREE.MathUtils.smoothstep(nearest, 1.5, 6);
    music.update(delta, {
        progress: world.sky.dawnProgress, sunAltitude: world.sky.sunAltitude, storm: stormIntensity, wind: world.wind,
        silence: soundscape.silence, exposure: soundscape.exposure
    });

    // Sliding down a dune: the feet cut a groove (the spray around them comes from the environment)
    const slideSpeed = player.slide.length();
    if (slideSpeed > 0.8) {
        slideDistance += slideSpeed * delta;
        if (slideDistance > 0.12) {
            slideDistance = 0;
            world.sandPatch.groove(player.eye.x, player.eye.z, player.slide.x / slideSpeed, player.slide.y / slideSpeed);
        }
    }
    world.updateEnvironment(renderer.renderer);
    // Near the light, its glow comes back up off the sand and warms everything from below
    world.lights.hemisphere.groundColor.lerp(ORB_BOUNCE, 0.55 * orbProximity);
    bodyShadow.update(delta, player.eye, world.groundAt(player.eye.x, player.eye.z), player.view.yaw, player.movement.speed, player.seated);
    // After sunrise the sand warms: the far air wavers, then the horizon starts to look like water
    const clearAir = 1 - stormIntensity;
    renderer.setHeat(
        THREE.MathUtils.smoothstep(world.sky.sunAltitude, 5, 12) * clearAir,
        THREE.MathUtils.smoothstep(world.sky.sunAltitude, 3, 9) * clearAir,
        elapsed
    );

    renderer.render();
}

renderer.renderer.setAnimationLoop(animate);

// Dev-only handle for debugging in the browser console (stripped from production builds)
if (import.meta.env.DEV) {
    window.mirage = {
        scene, camera, player, orb, world, story, storyState, renderer: renderer.renderer,
        music, audio, traces, debug, storm, constellations, rendering: renderer, soundscape, crestSeat, messages, moments,
        interaction: player.interaction,
        environment,
        get testInteractables() { return testInteractables; }
    };
}
