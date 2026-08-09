import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * The ground the battle happens on: terrain mesh, lighting, sky and fog.
 * Exposes getHeight() so every other system can sit units on the surface
 * without knowing how the terrain is generated.
 */
export class Battlefield {
  constructor(scene, { lowQuality = false } = {}) {
    this.scene = scene;
    this.lowQuality = lowQuality;
    this.width = CONFIG.field.width;
    this.length = CONFIG.field.length;
    this.amplitude = CONFIG.field.hillAmplitude;

    this._buildTerrain();
    this._buildLighting();
    this._buildSky();
  }

  /** Deterministic, cheap terrain height. Swap this out for real terrain later. */
  getHeight(x, z) {
    return (
      Math.sin(x * 0.045) * Math.cos(z * 0.037) * this.amplitude +
      Math.sin((x + z) * 0.021) * this.amplitude * 0.6
    );
  }

  /** Clamp a position to the playable area. */
  clamp(vec) {
    const hx = this.width / 2 - 2;
    const hz = this.length / 2 - 2;
    vec.x = Math.max(-hx, Math.min(hx, vec.x));
    vec.z = Math.max(-hz, Math.min(hz, vec.z));
    return vec;
  }

  _buildTerrain() {
    const segments = this.lowQuality ? 48 : 96;
    const geometry = new THREE.PlaneGeometry(this.width, this.length, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.getHeight(x, z));
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({ color: CONFIG.colors.grass });
    this.ground = new THREE.Mesh(geometry, material);
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    this.scene.add(this.ground);

    // Darker apron so the field does not visibly end at the fog line.
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width * 6, this.length * 6),
      new THREE.MeshLambertMaterial({ color: 0x66823f })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.25;
    this.scene.add(apron);
  }

  _buildLighting() {
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    const shadowSize = this.lowQuality ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;

    const cam = sun.shadow.camera;
    cam.left = -90;
    cam.right = 90;
    cam.top = 90;
    cam.bottom = -90;
    cam.near = 1;
    cam.far = 260;
    cam.updateProjectionMatrix();

    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    this.scene.add(new THREE.HemisphereLight(0xbcd4ea, 0x4d5a37, 0.9));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  }

  _buildSky() {
    this.scene.background = new THREE.Color(CONFIG.colors.sky);
    this.scene.fog = new THREE.Fog(CONFIG.colors.sky, 70, 300);
  }
}
