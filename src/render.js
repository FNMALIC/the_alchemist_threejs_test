// render.js - Renderer and post-processing: tone mapping, soft shadows and bloom.
// ?quality=low turns off bloom and shadows and renders at 1x pixel ratio, for weaker devices.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Heat shimmer: by mid-morning the warm sand makes the air above it waver. Only the distant
// ground just under the horizon wobbles, by a pixel or two.
const ShimmerShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        strength: { value: 0 },
        horizon: { value: 0.5 } // Where the horizon is on screen (0 bottom .. 1 top)
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float strength;
        uniform float horizon;
        varying vec2 vUv;
        void main() {
            float below = horizon - vUv.y;
            float band = smoothstep(-0.006, 0.01, below) * (1.0 - smoothstep(0.04, 0.16, below));
            float amount = strength * band;
            vec2 offset = vec2(
                sin(vUv.y * 310.0 + time * 6.0 + sin(vUv.x * 37.0 + time * 1.7) * 2.0),
                sin(vUv.x * 160.0 + vUv.y * 90.0 + time * 4.3)
            ) * vec2(0.0014, 0.0011) * amount;
            gl_FragColor = texture2D(tDiffuse, vUv + offset);
        }
    `
};

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
        this.forward = new THREE.Vector3();

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
            this.shimmer = new ShaderPass(ShimmerShader);
            this.shimmer.enabled = false;
            this.composer.addPass(this.shimmer);

            // Bloom at half resolution: only the brightest things (the light, sun, moon) glow
            this.bloom = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.55, 0.5, 0.85
            );
            this.composer.addPass(this.bloom);
            this.composer.addPass(new OutputPass()); // Tone mapping and colour space conversion
        }

        window.addEventListener('resize', () => this.resize());
    }

    // strength: 0 none .. 1 a hot morning; time: seconds
    setShimmer(strength, time) {
        if (!this.shimmer) return;
        this.shimmer.enabled = strength > 0.01;
        if (!this.shimmer.enabled) return;
        const uniforms = this.shimmer.uniforms;
        uniforms.strength.value = strength;
        uniforms.time.value = time;
        // The horizon is below the centre of the view when looking up, by tan(pitch) / tan(fov / 2)
        const pitch = Math.asin(THREE.MathUtils.clamp(this.camera.getWorldDirection(this.forward).y, -1, 1));
        uniforms.horizon.value = 0.5 - 0.5 * Math.tan(pitch) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
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
        if (this.composer) {
            this.composer.render();
            return;
        }
        this.renderer.render(this.scene, this.camera);
    }
}
