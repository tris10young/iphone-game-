import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Optional overlay (toggle with H): formation slots, per-soldier targets,
 * health bars and engagement range. Purely diagnostic — nothing here feeds back
 * into the simulation.
 */
export class DebugView {
  constructor(scene) {
    this.scene = scene;
    this.enabled = false;

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this._slotGeo = new THREE.BoxGeometry(0.3, 0.05, 0.3);
    this._slotMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    this._barGeo = new THREE.PlaneGeometry(1.4, 0.22);

    this.slots = [];
    this.bars = [];
    this._lineGeometry = null;
    this._lines = null;
  }

  build(soldiers) {
    this._clear();

    for (let i = 0; i < soldiers.length; i++) {
      const slot = new THREE.Mesh(this._slotGeo, this._slotMat);
      this.group.add(slot);
      this.slots.push(slot);

      const bar = new THREE.Mesh(
        this._barGeo,
        new THREE.MeshBasicMaterial({ color: 0x6ddf7a, depthTest: false })
      );
      this.group.add(bar);
      this.bars.push(bar);
    }

    // One buffered line pair (soldier -> current target) per soldier.
    const positions = new Float32Array(soldiers.length * 6);
    this._lineGeometry = new THREE.BufferGeometry();
    this._lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._lines = new THREE.LineSegments(
      this._lineGeometry,
      new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.5 })
    );
    this._lines.frustumCulled = false;
    this.group.add(this._lines);
  }

  toggle() {
    this.enabled = !this.enabled;
    this.group.visible = this.enabled;
    return this.enabled;
  }

  update(soldiers, camera) {
    if (!this.enabled) return;
    const positions = this._lineGeometry.attributes.position.array;

    for (let i = 0; i < soldiers.length; i++) {
      const s = soldiers[i];
      const slot = this.slots[i];
      const bar = this.bars[i];

      slot.visible = s.alive;
      bar.visible = s.alive;

      const base = i * 6;
      if (!s.alive) {
        positions[base] = positions[base + 1] = positions[base + 2] = 0;
        positions[base + 3] = positions[base + 4] = positions[base + 5] = 0;
        continue;
      }

      // Formation slot marker.
      slot.position.set(s.formationTarget.x, s.formationTarget.y + 0.05, s.formationTarget.z);

      // Health bar, billboarded to the active camera.
      const ratio = Math.max(0, s.health / CONFIG.soldier.health);
      bar.position.set(s.position.x, s.position.y + 2.25, s.position.z);
      bar.quaternion.copy(camera.quaternion);
      bar.scale.set(Math.max(0.001, ratio), 1, 1);
      bar.material.color.setHex(ratio > 0.6 ? 0x6ddf7a : ratio > 0.3 ? 0xffd166 : 0xe0685f);

      // Line to whatever the soldier is currently heading for.
      const target = s.enemy && s.enemy.alive ? s.enemy.position : s.formationTarget;
      positions[base] = s.position.x;
      positions[base + 1] = s.position.y + 1.0;
      positions[base + 2] = s.position.z;
      positions[base + 3] = target.x;
      positions[base + 4] = target.y + 1.0;
      positions[base + 5] = target.z;
    }

    this._lineGeometry.attributes.position.needsUpdate = true;
  }

  _clear() {
    for (const bar of this.bars) {
      this.group.remove(bar);
      bar.material.dispose();
    }
    for (const slot of this.slots) this.group.remove(slot);
    if (this._lines) {
      this.group.remove(this._lines);
      this._lines.geometry.dispose();
      this._lines.material.dispose();
      this._lines = null;
    }
    this.slots.length = 0;
    this.bars.length = 0;
  }
}
