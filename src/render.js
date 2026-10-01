// render.js - Renderer and post-processing: tone mapping, soft shadows and bloom.
// ?quality=low turns off bloom and shadows and renders at 1x pixel ratio, for weaker devices.
//
// The first-person hands (a "view model") are drawn in a second pass over the world, after
// clearing the depth buffer: they can never sink into a palm trunk or a rock, and they are seen
// through their own, narrower lens. They share the world's lights, shadows and fog.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Objects on this layer are drawn only in the view model pass (the world camera sees layer 0)
export const VIEW_MODEL_LAYER = 1;

export function getQuality() {
    const requested = new URLSearchParams(window.location.search).get('quality');
    const low = requested === 'low';
    return {
        low,
        bloom: !low,
        shadows: !low,
        pixelRatio: low ? 1 : Math.min(window.devicePixelRatio, 1.5)
    };
}

// Draw the view model over what's already rendered: keep the colour, clear only the depth,
// and reuse this frame's shadow maps instead of rendering them again
function renderViewModel(renderer, scene, camera) {
    const { autoClear, autoClearColor } = renderer;
    const shadowsAutoUpdate = renderer.shadowMap.autoUpdate;
    renderer.autoClear = false;
    renderer.autoClearColor = false; // A colour background would otherwise clear the world away
    renderer.shadowMap.autoUpdate = false;

    renderer.clearDepth();
    renderer.render(scene, camera);

    renderer.autoClear = autoClear;
    renderer.autoClearColor = autoClearColor;
    renderer.shadowMap.autoUpdate = shadowsAutoUpdate;
}

class ViewModelPass extends Pass {
    constructor(scene, camera) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.needsSwap = false; // Draws into the same buffer as the world, before bloom
    }

    render(renderer, writeBuffer, readBuffer) {
        renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
        renderViewModel(renderer, this.scene, this.camera);
    }
}

export class Renderer {
    constructor(scene, camera, quality) {
        this.scene = scene;
        this.camera = camera;
        this.quality = quality;
        this.viewModelCamera = null;

        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(quality.pixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.shadowMap.enabled = quality.shadows;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(renderer.domElement);
        this.renderer = renderer;

        if (quality.bloom) {
            this.composer = new EffectComposer(renderer);
            this.composer.addPass(new RenderPass(scene, camera));

            // Bloom at half resolution: only the brightest things (the light, sun, moon) glow
            this.bloom = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.55, 0.5, 0.85
            );
            this.composer.addPass(this.bloom);
            this.composer.addPass(new OutputPass()); // Tone mapping and colour space conversion
        }

        window.addEventListener('resize', () => this.resize());
    }

    // camera: sees only VIEW_MODEL_LAYER, from where the main camera is (e.g. its child).
    // Call once the scene's lights exist: they are put on the view model layer too, so they
    // light the hands (a light added later needs layers.enable(VIEW_MODEL_LAYER) as well).
    addViewModel(camera) {
        this.viewModelCamera = camera;
        this.scene.traverse(object => {
            if (object.isLight) object.layers.enable(VIEW_MODEL_LAYER);
        });
        if (this.composer) this.composer.insertPass(new ViewModelPass(this.scene, camera), 1);
        this.resize();
    }

    resize() {
        const { innerWidth: width, innerHeight: height } = window;
        [this.camera, this.viewModelCamera].forEach(camera => {
            if (!camera) return;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        });
        this.renderer.setSize(width, height);
        if (this.composer) {
            this.composer.setSize(width, height);
            this.bloom.resolution.set(width / 2, height / 2);
        }
    }

    render() {
        if (this.composer) {
            this.composer.render();
            return;
        }
        this.renderer.render(this.scene, this.camera);
        if (this.viewModelCamera) renderViewModel(this.renderer, this.scene, this.viewModelCamera);
    }
}
