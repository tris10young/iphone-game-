import * as THREE from 'three';

/**
 * A single pooled particle system for every puff of stone dust in the level.
 *
 * One draw call, one buffer, no allocation during play. Particles fade by
 * scaling their vertex colour toward black, which under additive blending is
 * exactly invisible -- cheaper than carrying a per-particle alpha attribute.
 */
export class DustSystem {
  constructor(scene, { capacity = 220 } = {}) {
    this.capacity = capacity;
    this.cursor = 0;

    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.tint = new Float32Array(capacity * 3);

    // Park everything far below the level until it is used.
    for (let i = 0; i < capacity; i++) this.positions[i * 3 + 1] = -9999;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geometry.setDrawRange(0, capacity);

    this.material = new THREE.PointsMaterial({
      size: 0.3,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: makeDotTexture(),
      opacity: 0.9,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geometry = geometry;
  }

  /**
   * Emit a puff.
   * @param {THREE.Vector3} origin
   * @param {object} options
   * @param {number} [options.count]
   * @param {number} [options.spread] Radius of the emission volume.
   * @param {number} [options.speed]
   * @param {number} [options.drift] Upward bias; negative falls, positive rises.
   */
  burst(origin, { count = 14, spread = 1.2, speed = 0.8, drift = 0.25, life = 1.5, color = 0xf3e3cc } = {}) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;

      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * spread;
      this.positions[i * 3] = origin.x + Math.cos(angle) * radius;
      this.positions[i * 3 + 1] = origin.y + (Math.random() - 0.4) * spread * 0.6;
      this.positions[i * 3 + 2] = origin.z + Math.sin(angle) * radius;

      this.velocities[i * 3] = Math.cos(angle) * speed * (0.3 + Math.random() * 0.7);
      this.velocities[i * 3 + 1] = drift + (Math.random() - 0.3) * speed * 0.5;
      this.velocities[i * 3 + 2] = Math.sin(angle) * speed * (0.3 + Math.random() * 0.7);

      this.maxLife[i] = life * (0.7 + Math.random() * 0.6);
      this.life[i] = this.maxLife[i];
      this.tint[i * 3] = c.r;
      this.tint[i * 3 + 1] = c.g;
      this.tint[i * 3 + 2] = c.b;
    }
  }

  update(dt) {
    let alive = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      alive = true;
      this.life[i] -= dt;

      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -9999;
        this.colors[i * 3] = this.colors[i * 3 + 1] = this.colors[i * 3 + 2] = 0;
        continue;
      }

      // Air drag, so dust slows and hangs rather than flying off.
      const drag = Math.exp(-1.6 * dt);
      this.velocities[i * 3] *= drag;
      this.velocities[i * 3 + 1] = this.velocities[i * 3 + 1] * drag - 0.55 * dt;
      this.velocities[i * 3 + 2] *= drag;

      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;

      // Fade in fast, out slowly.
      const t = this.life[i] / this.maxLife[i];
      const fade = t > 0.85 ? (1 - t) / 0.15 : t / 0.85;
      this.colors[i * 3] = this.tint[i * 3] * fade * 0.75;
      this.colors[i * 3 + 1] = this.tint[i * 3 + 1] * fade * 0.75;
      this.colors[i * 3 + 2] = this.tint[i * 3 + 2] * fade * 0.75;
    }

    if (alive) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
    }
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.life[i] = 0;
      this.positions[i * 3 + 1] = -9999;
      this.colors[i * 3] = this.colors[i * 3 + 1] = this.colors[i * 3 + 2] = 0;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }
}

function makeDotTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
