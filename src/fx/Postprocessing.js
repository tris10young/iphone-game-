import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Bloom and colour grade.
 *
 * Both are kept deliberately restrained. The brief is soft, clean and elegant,
 * and the fastest way to lose that is an aggressive bloom threshold -- pastel
 * stone is already bright, so a low threshold turns the whole level into a
 * white smear. Only the gold and turquoise emissives are meant to bloom.
 *
 * The grade pass costs one full-screen triangle and does the work that would
 * otherwise need real ambient occlusion: it darkens the frame's edges so the
 * structure sits in the middle of a soft pool of light.
 */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.42 },
    warmth: { value: 0.035 },
    lift: { value: 0.012 },
    saturation: { value: 1.06 },
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
    uniform float vignette;
    uniform float warmth;
    uniform float lift;
    uniform float saturation;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // Warm the highlights and cool the shadows very slightly. This is what
      // makes cream stone read as sunlit rather than flat.
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color += vec3(warmth, warmth * 0.45, -warmth * 0.5) * luma;
      color += vec3(-lift * 0.3, 0.0, lift) * (1.0 - luma);

      color = mix(vec3(luma), color, saturation);

      // Soft radial falloff, biased so it never crushes the top of the frame.
      vec2 offset = vUv - 0.5;
      offset.y *= 0.92;
      float d = length(offset) * 1.42;
      color *= 1.0 - vignette * smoothstep(0.55, 1.25, d);

      gl_FragColor = vec4(max(color, 0.0), texel.a);
    }
  `,
};

export class Postprocessing {
  constructor(renderer, scene, camera, { quality = 'high' } = {}) {
    this.renderer = renderer;
    this.quality = quality;

    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    const size = renderer.getSize(new THREE.Vector2());
    this.bloomPass = new UnrealBloomPass(size, 0.34, 0.7, 0.92);
    this.composer.addPass(this.bloomPass);

    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.setQuality(quality);
  }

  setCamera(camera) {
    this.renderPass.camera = camera;
  }

  setQuality(quality) {
    this.quality = quality;
    // On low quality bloom is disabled outright rather than shrunk: a
    // half-resolution bloom still costs several full-screen passes, and the
    // grade alone keeps the image looking intentional.
    this.bloomPass.enabled = quality !== 'low';
    this.bloomPass.strength = quality === 'high' ? 0.34 : 0.24;
    this.gradePass.uniforms.vignette.value = quality === 'low' ? 0.34 : 0.42;
  }

  setSize(width, height, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(deltaTime) {
    this.composer.render(deltaTime);
  }

  dispose() {
    this.composer.dispose();
    this.bloomPass.dispose?.();
  }
}
