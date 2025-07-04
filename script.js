import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Environment } from './environment.js'


// Scene, Camera, Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const environment = new Environment(scene);
environment.init();
environment.createVegetation();

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Web Audio API Setup
let audioContext;
let backgroundMusic;
let analyser;
let dataArray;
let convolver; // For reverb effect
let dryGainNode;
let wetGainNode;
let masterGainNode;

// Initialize Audio Context
function initAudio() {
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Create master gain node
    masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = 0.7; // Initial volume
    masterGainNode.connect(audioContext.destination);

    // Create reverb effect
    dryGainNode = audioContext.createGain();
    dryGainNode.gain.value = 1;

    wetGainNode = audioContext.createGain();
    wetGainNode.gain.value = 0; // Start with no reverb

    // Create convolver for reverb
    convolver = audioContext.createConvolver();

    // Create analyzer for visualizations
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    // Connect nodes
    dryGainNode.connect(masterGainNode);
    wetGainNode.connect(convolver);
    convolver.connect(masterGainNode);

    // Create impulse response for reverb
    createImpulseResponse();

    // Load and play background music
    loadBackgroundMusic();
}

// Create impulse response for reverb effect
function createImpulseResponse() {
    const sampleRate = audioContext.sampleRate;
    const length = 2 * sampleRate; // 2 seconds
    const impulseResponse = audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const channelData = impulseResponse.getChannelData(channel);

        for (let i = 0; i < length; i++) {
            // Exponential decay
            const decay = Math.pow(0.5, i / (length * 0.25));
            channelData[i] = (Math.random() * 2 - 1) * decay;
        }
    }

    convolver.buffer = impulseResponse;
}

// Load background ambient music
function loadBackgroundMusic() {
    fetch('ambient.mp3')
        .then(response => {
            if (!response.ok) {
                // If ambient.mp3 doesn't exist, create oscillator instead
                createOscillatorMusic();
                return null;
            }
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            if (arrayBuffer) {
                return audioContext.decodeAudioData(arrayBuffer);
            }
            return null;
        })
        .then(audioBuffer => {
            if (audioBuffer) {
                playBackgroundMusic(audioBuffer);
            }
        })
        .catch(error => {
            console.error('Error loading audio:', error);
            createOscillatorMusic();
        });
}

// Fallback to oscillator-based ambient sound if no audio file is available
function createOscillatorMusic() {
    // Create oscillator nodes for ambient drones
    const frequencies = [146.83, 196.00, 220.00]; // D3, G3, A3 (peaceful chord)

    frequencies.forEach(freq => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = freq;

        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.05; // Very quiet

        oscillator.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(dryGainNode);

        oscillator.start();
    });

    // Create a slow LFO for subtle movement
    const lfo = audioContext.createOscillator();
    lfo.frequency.value = 0.1; // Very slow modulation
    const lfoGain = audioContext.createGain();
    lfoGain.gain.value = 0.03;

    lfo.connect(lfoGain);
    lfoGain.connect(masterGainNode.gain);
    lfo.start();
}

// Play background music from buffer
function playBackgroundMusic(audioBuffer) {
    backgroundMusic = audioContext.createBufferSource();
    backgroundMusic.buffer = audioBuffer;
    backgroundMusic.loop = true;

    backgroundMusic.connect(analyser);
    analyser.connect(dryGainNode);

    backgroundMusic.start(0);
}


// Update audio effects based on proximity to orb
function updateAudioEffects(proximityFactor) {
    if (!audioContext) return;

    // FIXED: Adjust volume to decrease as you get closer to the orb
    const volume = 0.7 - (proximityFactor * 0.9);
    masterGainNode.gain.setTargetAtTime(volume, audioContext.currentTime, 0.1);

    // console.log(volume)
    // Adjust reverb (wet/dry mix) based on proximity
    wetGainNode.gain.setTargetAtTime(proximityFactor * 0.8, audioContext.currentTime, 0.1);
    dryGainNode.gain.setTargetAtTime(1 - (proximityFactor * 0.5), audioContext.currentTime, 0.1);
}

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffcc66, 1, 10);
pointLight.position.set(0, 3, 0);
scene.add(pointLight);

// Ground Plane
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, side: THREE.DoubleSide });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Glowing Orb (Treasure)
const orbGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const orbMaterial = new THREE.MeshStandardMaterial({
    emissive: 0xffcc66,
    emissiveIntensity: 2
});
const orb = new THREE.Mesh(orbGeometry, orbMaterial);
orb.position.set(0, 1, -3); // Position it a bit away from the starting point
scene.add(orb);

// Sound visualization waves around the orb
const waveCount = 32;
const waves = new THREE.Group();
const waveGeometry = new THREE.TorusGeometry(0.8, 0.02, 16, 100);
const waveMaterial = new THREE.MeshBasicMaterial({
    color: 0xffcc66,
    transparent: true,
    opacity: 0.3
});

for (let i = 0; i < waveCount; i++) {
    const wave = new THREE.Mesh(waveGeometry, waveMaterial.clone());
    wave.rotation.x = Math.PI / 2;
    wave.rotation.z = (Math.PI * 2) * (i / waveCount);
    wave.userData = {
        initialScale: 0.6 + (Math.random() * 0.4), // 0.6 to 1.0
        index: i
    };
    waves.add(wave);
}

orb.add(waves);

// Particle effect around the orb
function createOrbParticles() {
    const particleCount = 100;
    const particles = new THREE.Group();

    const particleGeometry = new THREE.SphereGeometry(0.03, 8, 8);
    const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffcc66,
        transparent: true,
        opacity: 0.6
    });

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());

        // Random position around the orb
        const radius = 0.7 + Math.random() * 0.3; // Between 0.7 and 1.0
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;

        particle.position.x = radius * Math.sin(phi) * Math.cos(theta);
        particle.position.y = radius * Math.sin(phi) * Math.sin(theta);
        particle.position.z = radius * Math.cos(phi);

        // Store original position for animation
        particle.userData = {
            originalRadius: radius,
            theta: theta,
            phi: phi,
            speed: 0.5 + Math.random()
        };

        particles.add(particle);
    }

    return particles;
}

const orbParticles = createOrbParticles();
orb.add(orbParticles);

// Camera Position
camera.position.set(0, 2, 5);

// Pointer Lock Controls
const controls = new PointerLockControls(camera, document.body);

// Movement variables
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

// Click to start controls and audio
document.addEventListener('click', () => {
    if (!controls.isLocked) {
        controls.lock();

        // Initialize audio on first click (to satisfy browser autoplay policies)
        if (!audioContext) {
            initAudio();
        }
    }
});

// Movement event listeners
document.addEventListener('keydown', (event) => {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = true;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = true;
            break;
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = false;
            break;
    }
});

// Instructions overlay
const instructions = document.createElement('div');
instructions.style.position = 'absolute';
instructions.style.top = '10px';
instructions.style.width = '100%';
instructions.style.textAlign = 'center';
instructions.style.color = '#ffffff';
instructions.style.fontSize = '18px';
instructions.innerHTML = 'Click to start<br>WASD / Arrow Keys to move';
document.body.appendChild(instructions);

controls.addEventListener('lock', () => {
    instructions.style.display = 'none';
});

controls.addEventListener('unlock', () => {
    instructions.style.display = 'block';
});

// Clock for consistent movement speed
const clock = new THREE.Clock();


const volumeSlider = document.getElementById('volume-slider');
if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
        if (audioContext && masterGainNode) {
            masterGainNode.gain.value = volumeSlider.value;
        }
    });
}
// Handle Window Resize
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// Story and UI Elements
const storyContainer = document.createElement('div');
storyContainer.style.position = 'absolute';
storyContainer.style.top = '50%';
storyContainer.style.left = '50%';
storyContainer.style.transform = 'translate(-50%, -50%)';
storyContainer.style.color = '#ffffff';
storyContainer.style.fontSize = '24px';
storyContainer.style.textAlign = 'center';
storyContainer.style.padding = '20px';
storyContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
storyContainer.style.borderRadius = '10px';
storyContainer.style.maxWidth = '600px';
storyContainer.style.display = 'none';
storyContainer.style.pointerEvents = 'none'; // Don't block controls
document.body.appendChild(storyContainer);

// Story progression states
const storyStates = {
    INTRO: 'intro',
    APPROACHING: 'approaching',
    VERY_CLOSE: 'very_close',
    TOUCH: 'touch',
    TRANSFORMATION: 'transformation',
    EPILOGUE: 'epilogue'
};

let currentStoryState = null;
let storyTimeout = null;
let hasCompletedGame = false;

// Story text for each state
const storyText = {
    [storyStates.INTRO]: "You find yourself in a strange, dark place. In the distance, a pulsing light beckons to you...",
    [storyStates.APPROACHING]: "As you draw closer, the light seems to respond to your presence. You hear faint whispers that you can't quite understand...",
    [storyStates.VERY_CLOSE]: "The light pulses faster now. The whispers grow clearer: \"Seeker... find... truth...\" The orb's energy surrounds you.",
    [storyStates.TOUCH]: "You reach out to touch the light. It responds to your touch, fracturing into countless shards of brilliant light!",
    [storyStates.TRANSFORMATION]: "The fragments of light swirl around you, entering your body. You feel yourself becoming one with the light...",
    [storyStates.EPILOGUE]: "As your consciousness expands, you understand: you were the light all along, separated from yourself. You are whole again."
};

// Show story text and clear after a delay
function showStoryText(state, duration = 3000) {
    // If we're already showing this state, don't restart the timer
    if (currentStoryState === state) return;

    // Clear any existing timeout
    if (storyTimeout) {
        clearTimeout(storyTimeout);
    }

    currentStoryState = state;
    storyContainer.textContent = storyText[state];
    storyContainer.style.display = 'block';

    // Set timeout to hide text after duration
    storyTimeout = setTimeout(() => {
        storyContainer.style.display = 'none';
        currentStoryState = null;
    }, duration);
}

// Update story based on proximity to orb
function updateStory(distanceToOrb) {
    if (hasCompletedGame) return;

    // Don't attempt to show a new story state if one is currently being displayed
    // Unless we're reaching the transformation trigger point
    if (currentStoryState !== null && distanceToOrb >= 1.5) {
        return;
    }

    // Transformation sequence trigger (highest priority)
    if (distanceToOrb < 1.5) {
        // Only trigger transformation if we haven't yet started the sequence
        if (currentStoryState !== storyStates.TOUCH &&
            currentStoryState !== storyStates.TRANSFORMATION &&
            currentStoryState !== storyStates.EPILOGUE) {
            triggerTransformation();
        }
    }
    // Very close to orb
    else if (distanceToOrb < 4) {
        // Only show "very close" if we aren't already showing it
        if (currentStoryState !== storyStates.VERY_CLOSE) {
            showStoryText(storyStates.VERY_CLOSE);
        }
    }
    // Approaching orb
    else if (distanceToOrb < 6) {
        // Only show "approaching" if we aren't already showing it
        if (currentStoryState !== storyStates.APPROACHING) {
            showStoryText(storyStates.APPROACHING);
        }
    }
    // Intro (only if no other story state is active)
    else if (distanceToOrb < 10) {
        if (currentStoryState === null) {
            showStoryText(storyStates.INTRO);
        }
    }
}

// Create particle effect for orb shattering
function createShatterEffect(position) {
    const particleCount = 500;
    const particles = new THREE.Group();
    // Tag this group to identify it in the update loop
    particles.userData = { isShatterEffect: true };
    scene.add(particles);

    const particleGeometry = new THREE.SphereGeometry(0.03, 8, 8);
    const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1
    });

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());

        // Start at orb position
        particle.position.copy(position);

        // Random velocity direction
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 3
        );

        particle.userData = {
            velocity: velocity,
            life: 2 + Math.random() * 2 // Random lifetime between 2-4 seconds
        };

        particles.add(particle);
    }

    return particles;
}

// Player transformation effect
function createPlayerTransformationEffect() {
    const particleCount = 300;
    const particles = new THREE.Group();
    // Tag this group to identify it in the update loop
    particles.userData = { isTransformationEffect: true };
    scene.add(particles);

    const particleGeometry = new THREE.SphereGeometry(0.02, 8, 8);
    const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffcc66,
        transparent: true,
        opacity: 0.8
    });

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());

        // Random position around the camera
        const radius = 0.3 + Math.random() * 0.2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;

        particle.position.set(
            camera.position.x + radius * Math.sin(phi) * Math.cos(theta),
            camera.position.y + radius * Math.sin(phi) * Math.sin(theta),
            camera.position.z + radius * Math.cos(phi)
        );

        // Store properties for animation
        particle.userData = {
            originalRadius: radius,
            theta: theta,
            phi: phi,
            phase: Math.random() * Math.PI * 2,
            speed: 0.5 + Math.random()
        };

        particles.add(particle);
    }

    return particles;
}

function triggerTransformation() {
    if (hasCompletedGame) return;
    hasCompletedGame = true;

    // Show touch message
    showStoryText(storyStates.TOUCH, 3000);

    // Create shattering effect
    const shatterParticles = createShatterEffect(orb.position);

    // Hide original orb
    orb.visible = false;

    // After short delay, show transformation message and effect
    setTimeout(() => {
        showStoryText(storyStates.TRANSFORMATION, 5000);

        // Create player transformation effect
        const transformationParticles = createPlayerTransformationEffect();

        // Dim the lights for dramatic effect
        ambientLight.intensity = 0.1;
        pointLight.intensity = 0.2;

        // Increase reverb to maximum
        if (wetGainNode) {
            wetGainNode.gain.setTargetAtTime(1.0, audioContext.currentTime, 0.5);
        }

        // Play a transformation sound
        if (audioContext) {
            const transitionOscillator = audioContext.createOscillator();
            transitionOscillator.type = 'sine';
            transitionOscillator.frequency.setValueAtTime(220, audioContext.currentTime);
            transitionOscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 3);

            const transitionGain = audioContext.createGain();
            transitionGain.gain.setValueAtTime(0, audioContext.currentTime);
            transitionGain.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.1);
            transitionGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 5);

            transitionOscillator.connect(transitionGain);
            transitionGain.connect(masterGainNode);

            transitionOscillator.start();
            transitionOscillator.stop(audioContext.currentTime + 5);
        }

        // After transformation, show epilogue
        setTimeout(() => {
            showStoryText(storyStates.EPILOGUE, 8000);

            // Begin fading to white
            const fadeOverlay = document.createElement('div');
            fadeOverlay.style.position = 'absolute';
            fadeOverlay.style.top = '0';
            fadeOverlay.style.left = '0';
            fadeOverlay.style.width = '100%';
            fadeOverlay.style.height = '100%';
            fadeOverlay.style.backgroundColor = 'white';
            fadeOverlay.style.opacity = '0';
            fadeOverlay.style.transition = 'opacity 8s';
            fadeOverlay.style.pointerEvents = 'none';
            document.body.appendChild(fadeOverlay);

            // Begin fade to white
            setTimeout(() => {
                fadeOverlay.style.opacity = '1';
            }, 100);

            // Show restart button after fade completes
            setTimeout(() => {
                const restartButton = document.createElement('button');
                restartButton.textContent = 'Experience Again';
                restartButton.style.position = 'absolute';
                restartButton.style.top = '50%';
                restartButton.style.left = '50%';
                restartButton.style.transform = 'translate(-50%, -50%)';
                restartButton.style.padding = '15px 30px';
                restartButton.style.fontSize = '20px';
                restartButton.style.backgroundColor = '#ffcc66';
                restartButton.style.border = 'none';
                restartButton.style.borderRadius = '5px';
                restartButton.style.cursor = 'pointer';

                restartButton.addEventListener('click', () => {
                    window.location.reload();
                });

                document.body.appendChild(restartButton);
            }, 8000);
        }, 5000);
    }, 3000);
}

// Update functions for particle effects
function updateShatterParticles(particles, delta) {
    let particlesToRemove = [];

    particles.children.forEach(particle => {
        const userData = particle.userData;

        // Update position based on velocity
        particle.position.x += userData.velocity.x * delta;
        particle.position.y += userData.velocity.y * delta;
        particle.position.z += userData.velocity.z * delta;

        // Add gravity effect
        userData.velocity.y -= 2 * delta;

        // Reduce life and fade out
        userData.life -= delta;
        particle.material.opacity = Math.max(0, userData.life / 3);

        // Mark particles with no life left for removal
        if (userData.life <= 0) {
            particlesToRemove.push(particle);
        }
    });

    // Remove dead particles
    particlesToRemove.forEach(particle => {
        particles.remove(particle);
    });

    // Remove the group when all particles are gone
    if (particles.children.length === 0) {
        scene.remove(particles);
    }
}

function updateTransformationParticles(particles, delta) {
    particles.children.forEach(particle => {
        const userData = particle.userData;

        // Swirl around the camera, gradually expanding outward
        userData.phase += 0.5 * delta * userData.speed;
        const expandFactor = 1 + (Date.now() % 10000) / 10000; // Expand over time

        const radius = userData.originalRadius * expandFactor;

        // Calculate new position relative to camera
        const newX = radius * Math.sin(userData.phi) * Math.cos(userData.phase);
        const newY = radius * Math.sin(userData.phi) * Math.sin(userData.phase);
        const newZ = radius * Math.cos(userData.phi);

        // Update position (in camera's local space, then convert to world space)
        const cameraDirection = new THREE.Vector3(0, 0, -1);
        cameraDirection.applyQuaternion(camera.quaternion);

        const cameraRight = new THREE.Vector3(1, 0, 0);
        cameraRight.applyQuaternion(camera.quaternion);

        const cameraUp = new THREE.Vector3(0, 1, 0);
        cameraUp.applyQuaternion(camera.quaternion);

        particle.position.copy(camera.position)
            .add(cameraRight.multiplyScalar(newX))
            .add(cameraUp.multiplyScalar(newY))
            .add(cameraDirection.multiplyScalar(newZ));

        // Fade out particles as they expand
        particle.material.opacity = Math.max(0, 1 - (expandFactor - 1) / 2);
    });
}

// Update the main animation loop
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Handle movement (your existing movement code)
    if (controls.isLocked) {
        // Slow down velocity
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        // Set direction
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        // Move in the direction we're facing
        if (moveForward || moveBackward) velocity.z -= direction.z * 20.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 20.0 * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
    }

    // Orb animation
    if (orb.visible) {
        orb.rotation.y += 0.01;
    }

    // Calculate distance to orb for proximity effects
    const distanceToOrb = camera.position.distanceTo(orb.position);

    // Update story based on proximity
    updateStory(distanceToOrb);

    // Your existing orb proximity effects
    const maxDistance = 10; // Maximum distance for effects
    if (distanceToOrb < maxDistance && orb.visible) {
        const proximityFactor = 1 - (distanceToOrb / maxDistance);

        // Increase glow based on proximity
        orbMaterial.emissiveIntensity = 2 + (proximityFactor * 3);

        // Change color slightly (from yellow-orange to more white)
        const hue = 0.12 - (proximityFactor * 0.05); // Slight hue shift
        const saturation = 0.8 - (proximityFactor * 0.3); // Decrease saturation
        orbMaterial.emissive.setHSL(hue, saturation, 0.5 + (proximityFactor * 0.3));

        // Pulse effect
        const pulseScale = 1 + (Math.sin(Date.now() * 0.005) * 0.05 * proximityFactor);
        orb.scale.set(pulseScale, pulseScale, pulseScale);

        // Make particles more visible
        orbParticles.children.forEach(particle => {
            particle.material.opacity = 0.6 + (proximityFactor * 0.4);
        });

        // Update audio effects based on proximity
        if (audioContext) {
            updateAudioEffects(proximityFactor);
        }
    } else if (orb.visible) {
        // Reset orb properties when far away
        orbMaterial.emissiveIntensity = 2;
        orbMaterial.emissive.setHex(0xffcc66);
        orb.scale.set(1, 1, 1);

        orbParticles.children.forEach(particle => {
            particle.material.opacity = 0.6;
        });

        // Reset audio effects
        if (audioContext) {
            updateAudioEffects(0);
        }
    }

    // Update audio visualization (your existing code)
    if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);

        // Update wave visualizers based on audio data
        waves.children.forEach((wave, index) => {
            const dataIndex = Math.floor(index / waveCount * dataArray.length);
            const audioValue = dataArray[dataIndex] / 255; // Normalize to 0-1

            // Scale waves based on audio amplitude
            const baseScale = wave.userData.initialScale;
            const scaleWithAudio = baseScale + (audioValue * 0.3);
            wave.scale.set(scaleWithAudio, scaleWithAudio, scaleWithAudio);

            // Rotate waves based on audio
            wave.rotation.z += 0.002 + (audioValue * 0.005);

            // Update wave opacity based on audio
            wave.material.opacity = 0.1 + (audioValue * 0.4);
        });
    }

    // Animate orb particles (your existing code)
    if (orb.visible) {
        orbParticles.children.forEach(particle => {
            const userData = particle.userData;

            // Rotate around orb center
            userData.theta += 0.01 * userData.speed;

            // Move in and out slightly
            const pulseFactor = Math.sin(Date.now() * 0.001 * userData.speed) * 0.1;
            const radius = userData.originalRadius * (1 + pulseFactor);

            particle.position.x = radius * Math.sin(userData.phi) * Math.cos(userData.theta);
            particle.position.y = radius * Math.sin(userData.phi) * Math.sin(userData.theta);
            particle.position.z = radius * Math.cos(userData.phi);
        });
    }

    // // Update any active effect particles
    // scene.children.forEach(child => {
    //     // Check for shatter particles
    //     if (child.userData && child.userData.isShatterEffect) {
    //         updateShatterParticles(child, delta);
    //     }
    //
    //     // Check for transformation particles
    //     if (child.userData && child.userData.isTransformationEffect) {
    //         updateTransformationParticles(child, delta);
    //     }
    // });
    // In your animate function, update this part:
    // Update any active effect particles
    scene.children.forEach(child => {
        // Check for shatter particles
        if (child.userData && child.userData.isShatterEffect) {
            updateShatterParticles(child, delta);
        }

        // Check for transformation particles
        if (child.userData && child.userData.isTransformationEffect) {
            updateTransformationParticles(child, delta);
        }
    });
    // Update environment elements
    if (environment.grassPatches) {
        environment.grassPatches.forEach(grassPatch => {
            grassPatch.children.forEach(blade => {
                const userData = blade.userData;
                const time = Date.now() * 0.001;
                blade.rotation.x = userData.originalHeight * Math.sin(time * userData.waveSpeed + userData.phaseOffset) * userData.waveAmplitude;
            });
        });
    }


    renderer.render(scene, camera);
}

animate()
// Initialize story
setTimeout(() => {
    if (currentStoryState === null) {
        showStoryText(storyStates.INTRO);
    }
}, 2000);