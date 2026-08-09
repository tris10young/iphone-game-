import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Palette } from './Palette.js';

/**
 * Sky, cloud sea and airborne life.
 *
 * There is deliberately no ground. The structure floats over an endless cloud
 * layer that fades into haze, which is what sells the height -- you cannot see
 * the bottom of anything, so the level reads as suspended rather than placed.
 *
 * Everything here is built to be cheap: one gradient dome, two merged cloud
 * meshes, one Points cloud and a handful of bird triangles.
 */

const SKY_VERTEX = /* glsl */`
  varying vec3 vWorldDirection;
  void main() {
    vWorldDirection = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */`
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform vec3 deepColor;
  varying vec3 vWorldDirection;
  void main() {
    float h = normalize(vWorldDirection).y;
    // The diorama camera looks down, so most of the frame is the ramp BELOW the
    // horizon. It carries the whole sense of altitude and gets three stops:
    // warm haze at the horizon, pale blue beneath it, then deepening blue as
    // the eye falls away into nothing. A flat colour here reads as white void.
    vec3 upper = mix(horizonColor, topColor, smoothstep(0.0, 0.20, h));
    vec3 lower = mix(horizonColor, bottomColor, smoothstep(0.0, -0.16, h));
    lower = mix(lower, deepColor, smoothstep(-0.12, -0.92, h));
    gl_FragColor = vec4(h > 0.0 ? upper : lower, 1.0);
  }
`;

export class Sky {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'sky';
    scene.add(this.group);

    this._buildDome();
    this._buildCloudSea(quality);
    this._buildMotes(quality);
    this._buildBirds(quality);

    this.time = 0;
  }

  _buildDome() {
    const geometry = new THREE.SphereGeometry(900, 40, 28);
    this.domeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(Palette.skyTop) },
        horizonColor: { value: new THREE.Color(Palette.skyHorizon) },
        bottomColor: { value: new THREE.Color(Palette.skyBelow) },
        deepColor: { value: new THREE.Color(Palette.skyDeep) },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(geometry, this.domeMaterial);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
  }

  /**
   * Two rings of low-poly cloud: a near layer just below the structure that
   * drifts perceptibly, and a far, higher layer that barely moves. The
   * difference in speed is what creates the sense of scale.
   */
  _buildCloudSea(quality) {
    const near = quality === 'low' ? 34 : 58;
    const far = quality === 'low' ? 14 : 22;

    this.nearClouds = this._cloudLayer({
      count: near, innerRadius: 30, outerRadius: 300,
      y: -120, ySpread: 10, scale: [16, 34], opacity: 1,
    });
    this.farClouds = this._cloudLayer({
      count: far, innerRadius: 320, outerRadius: 700,
      y: -190, ySpread: 34, scale: [50, 110], opacity: 1,
    });
    this.group.add(this.nearClouds, this.farClouds);
  }

  _cloudLayer({ count, innerRadius, outerRadius, y, ySpread, scale }) {
    const puff = new THREE.IcosahedronGeometry(1, 1);
    const parts = [];
    const rand = mulberry32(0x5eed + count);

    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = innerRadius + rand() * (outerRadius - innerRadius);
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      const cy = y + (rand() - 0.5) * ySpread;
      const size = scale[0] + rand() * (scale[1] - scale[0]);

      // Each cloud is 3-5 flattened blobs, which is enough to read as stylised
      // cumulus from any orbit angle without costing real geometry.
      const blobs = 3 + Math.floor(rand() * 3);
      for (let b = 0; b < blobs; b++) {
        const g = puff.clone();
        const bs = size * (0.55 + rand() * 0.5);
        g.scale(bs, bs * (0.26 + rand() * 0.14), bs * 0.9);
        g.translate(
          cx + (rand() - 0.5) * size * 1.5,
          cy + (rand() - 0.5) * size * 0.28,
          cz + (rand() - 0.5) * size * 1.2,
        );
        parts.push(g);
      }
    }
    puff.dispose();

    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    merged.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({
      color: Palette.cloud,
      emissive: Palette.cloudShade,
      emissiveIntensity: 0.12,
      flatShading: true,
      fog: true,
    });
    const mesh = new THREE.Mesh(merged, material);
    mesh.frustumCulled = false;
    mesh.userData.spin = 0;
    return mesh;
  }

  /** Extremely subtle airborne motes that catch the sun near the structure. */
  _buildMotes(quality) {
    const count = quality === 'low' ? 90 : 220;
    const positions = new Float32Array(count * 3);
    const rand = mulberry32(97);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 90;
      positions[i * 3 + 1] = rand() * 46 - 10;
      positions[i * 3 + 2] = (rand() - 0.5) * 90;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.moteMaterial = new THREE.PointsMaterial({
      color: 0xfff4e2,
      size: 0.34,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: makeDotTexture(),
    });
    this.motes = new THREE.Points(geometry, this.moteMaterial);
    this.motes.frustumCulled = false;
    this._motePositions = positions;
    this.group.add(this.motes);
  }

  /** A few distant birds. First thing dropped on low quality. */
  _buildBirds(quality) {
    this.birds = [];
    if (quality === 'low') return;

    const shape = new THREE.BufferGeometry();
    // A shallow V -- unmistakable as a bird at distance, three triangles cheap.
    shape.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, 0, -1.1, 0.34, -0.5, -0.95, 0, -0.15,
      0, 0, 0, 1.1, 0.34, -0.5, 0.95, 0, -0.15,
    ]), 3));
    shape.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      color: 0x8fa7b8, transparent: true, opacity: 0.5, side: THREE.DoubleSide, fog: true,
    });
    const rand = mulberry32(31);
    for (let i = 0; i < 5; i++) {
      const bird = new THREE.Mesh(shape, material);
      bird.userData = {
        radius: 140 + rand() * 130,
        angle: rand() * Math.PI * 2,
        speed: 0.035 + rand() * 0.03,
        y: -30 + rand() * 40,
        flap: rand() * 6,
      };
      bird.frustumCulled = false;
      this.birds.push(bird);
      this.group.add(bird);
    }
    this._birdGeometry = shape;
    this._birdMaterial = material;
  }

  update(dt, cameraPosition) {
    this.time += dt;

    // Keep the dome and the far layer centred on the camera so they can never
    // be reached or clipped.
    this.dome.position.copy(cameraPosition);

    this.nearClouds.rotation.y += dt * 0.0055;
    this.farClouds.rotation.y += dt * 0.0016;

    // Motes rise slowly and wrap, giving the air a gentle upward drift.
    const p = this._motePositions;
    for (let i = 1; i < p.length; i += 3) {
      p[i] += dt * 0.28;
      if (p[i] > 36) p[i] = -12;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;

    for (const bird of this.birds) {
      const d = bird.userData;
      d.angle += dt * d.speed;
      bird.position.set(Math.cos(d.angle) * d.radius, d.y + Math.sin(this.time * 0.3 + d.flap) * 1.4, Math.sin(d.angle) * d.radius);
      bird.rotation.y = -d.angle + Math.PI / 2;
      bird.scale.setScalar(1.6 + Math.sin(this.time * 5 + d.flap) * 0.14);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material && o.material !== this._birdMaterial) o.material.dispose?.();
    });
    this._birdGeometry?.dispose();
    this._birdMaterial?.dispose();
    this.moteMaterial.map?.dispose();
  }
}

/** Deterministic RNG so the sky is identical on every run and every device. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A soft round dot, generated rather than loaded so there are no assets. */
function makeDotTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
