// render.js - Renderer and post-processing: tone mapping, soft shadows and bloom.
// ?quality=low turns off bloom and shadows and renders at 1x pixel ratio, for weaker devices.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Heat haze: by mid-morning the warm sand makes the air above it waver, and just under the far
// skyline a thin strip of sky shows on the ground: the inferior mirage, light bent upward by hot
// air near the sand, that looks like water. The depth buffer says what is far away, so only
// distant ground wavers and only the sky is ever mirrored.
const HeatShader = {
    uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
        time: { value: 0 },
        shimmer: { value: 0 }, // 0 .. 1
        mirage: { value: 0 } // 0 .. 1
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float time;
        uniform float shimmer;
        uniform float mirage;
        varying vec2 vUv;

        // Metres to whatever is drawn at uv (the sky is at the far plane)
        float distanceAt(vec2 uv) {
            return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar);
        }

        void main() {
            float distance = distanceAt(vUv);
            bool ground = distance < cameraFar * 0.9;
            float far = ground ? smoothstep(50.0, 220.0, distance) : 0.0;

            // Shimmer: the further the ground, the more air between, the more it wavers
            vec2 offset = vec2(
                sin(vUv.y * 310.0 + time * 6.0 + sin(vUv.x * 37.0 + time * 1.7) * 2.0),
                sin(vUv.x * 160.0 + vUv.y * 90.0 + time * 4.3)
            ) * vec2(0.0014, 0.0011) * shimmer * far;
            vec2 uv = vUv + offset;
            vec4 color = texture2D(tDiffuse, uv);

            // The mirage: on far ground just under the skyline, the sky above it, mirrored
            if (mirage > 0.0 && far > 0.0) {
                float stride = 0.0035;
                for (int k = 1; k <= 6; k++) {
                    vec2 above = vec2(uv.x, uv.y + float(k) * stride);
                    if (distanceAt(above) >= cameraFar * 0.9) {
                        // The skyline is k steps up: reflect about it, wavering
                        float skyline = uv.y + (float(k) - 0.5) * stride;
                        vec2 mirrored = vec2(uv.x + sin(uv.y * 900.0 + time * 9.0) * 0.0012, 2.0 * skyline - uv.y);
                        float strip = 1.0 - (float(k) - 1.0) / 6.0; // Strongest right under the skyline
                        color.rgb = mix(color.rgb, texture2D(tDiffuse, mirrored).rgb, 0.7 * strip * mirage * far);
                        break;
                    }
                }
            }
            gl_FragColor = color;
        }
    `
};

// The heat haze reads this frame's depth from the buffer the scene was drawn into
class HeatPass extends ShaderPass {
    constructor(camera) {
        super(HeatShader);
        this.camera = camera;
    }

    render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
        this.uniforms.tDepth.value = readBuffer.depthTexture;
        this.uniforms.cameraNear.value = this.camera.near;
        this.uniforms.cameraFar.value = this.camera.far;
        super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    }
}

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
            // With a depth texture, so the heat haze can tell near from far
            const size = renderer.getDrawingBufferSize(new THREE.Vector2());
            const target = new THREE.WebGLRenderTarget(size.x, size.y, {
                type: THREE.HalfFloatType,
                depthTexture: new THREE.DepthTexture(size.x, size.y)
            });
            this.composer = new EffectComposer(renderer, target);
            this.composer.addPass(new RenderPass(scene, camera));
            this.heat = new HeatPass(camera);
            this.heat.enabled = false;
            this.composer.addPass(this.heat);

            // Bloom at half resolution: only the brightest things (the light, sun, moon) glow
            this.bloom = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.55, 0.5, 0.85
            );
            this.composer.addPass(this.bloom);
            this.composer.addPass(new OutputPass()); // Tone mapping and colour space conversion
        }

        window.addEventListener('resize', () => this.resize());
    }

    // The heat of the morning: shimmer and mirage 0 none .. 1 full; time: seconds
    setHeat(shimmer, mirage, time) {
        if (!this.heat) return;
        this.heat.enabled = shimmer > 0.01 || mirage > 0.01;
        const uniforms = this.heat.uniforms;
        uniforms.shimmer.value = shimmer;
        uniforms.mirage.value = mirage;
        uniforms.time.value = time;
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
