// render.js - Renderer and post-processing: tone mapping, soft shadows and bloom.
// ?quality=low turns off bloom and shadows and renders at 1x pixel ratio, for weaker devices.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

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

export class Renderer {
    constructor(scene, camera, quality) {
        this.scene = scene;
        this.camera = camera;
        this.quality = quality;

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

    resize() {
        const { innerWidth: width, innerHeight: height } = window;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        if (this.composer) {
            this.composer.setSize(width, height);
            this.bloom.resolution.set(width / 2, height / 2);
        }
    }

    render() {
        if (this.composer) this.composer.render();
        else this.renderer.render(this.scene, this.camera);
    }
}
