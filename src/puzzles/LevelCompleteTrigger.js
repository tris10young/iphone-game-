import * as THREE from 'three';
import { Easing, clamp } from '../core/Easing.js';

/**
 * Watches for the traveller reaching the portal and runs the ending.
 *
 * The sequence is a small hand-written timeline rather than a tween library:
 * glow swells, motes rise, the camera drifts closer and higher, the chord
 * resolves, the screen fades slightly, then the panel appears. Six seconds
 * total, and the player can skip straight past it by tapping Replay.
 */

const APPROACH_RADIUS = 9;   // metres over which the portal hum fades up
const SEQUENCE_LENGTH = 3.4; // seconds before the panel appears

export class LevelCompleteTrigger {
  constructor({ level, navigation, character, audio, dust, cameraController, ui, onComplete }) {
    this.portal = level.portal;
    this.navigation = navigation;
    this.character = character;
    this.audio = audio;
    this.dust = dust;
    this.camera = cameraController;
    this.ui = ui;
    this.onComplete = onComplete;

    this.baseGlowOpacity = this.portal.userData.glowMaterial.opacity;
    this.baseHaloOpacity = this.portal.userData.haloMaterial.opacity;
    this.baseLightIntensity = this.portal.userData.light.intensity;

    this.triggered = false;
    this.elapsed = 0;
    this._panelShown = false;
    this._portalWorld = new THREE.Vector3();
    this._time = 0;

    navigation.on('arrive', ({ node }) => {
      if (node.tag === 'portal') this.trigger();
    });
  }

  trigger() {
    if (this.triggered) return;
    this.triggered = true;
    this.elapsed = 0;
    this.audio.complete();
    this.camera.nudgeTo(this._portalWorld, { hold: SEQUENCE_LENGTH + 2, weight: 0.72 });
    this.camera.targetDistance = clamp(this.camera.distance * 0.62, this.camera.minDistance, this.camera.maxDistance);
  }

  reset() {
    this.triggered = false;
    this.elapsed = 0;
    this._panelShown = false;
    this.portal.userData.glowMaterial.opacity = this.baseGlowOpacity;
    this.portal.userData.haloMaterial.opacity = this.baseHaloOpacity;
    this.portal.userData.light.intensity = this.baseLightIntensity;
    this.ui.setFade(0);
  }

  update(dt) {
    this._time += dt;
    this.portal.getWorldPosition(this._portalWorld);
    this._portalWorld.y += 2.6;

    if (!this.triggered) {
      // Idle: a slow breath on the portal, and the hum rising with proximity.
      const distance = this.character.position.distanceTo(this._portalWorld);
      const proximity = clamp(1 - distance / APPROACH_RADIUS, 0, 1);
      this.audio.setPortalProximity(proximity);

      const breath = 0.5 + Math.sin(this._time * 1.35) * 0.5;
      this.portal.userData.glowMaterial.opacity = this.baseGlowOpacity * (0.82 + breath * 0.22 + proximity * 0.35);
      this.portal.userData.haloMaterial.opacity = this.baseHaloOpacity * (0.8 + breath * 0.3 + proximity * 0.8);
      this.portal.userData.light.intensity = this.baseLightIntensity * (0.85 + breath * 0.2 + proximity * 0.5);

      if (Math.random() < 0.22) {
        this.dust.burst(this._portalWorld,
          { count: 1, spread: 1.9, speed: 0.24, drift: 0.55, life: 2.6, color: 0x9ff0e2 });
      }
      return;
    }

    // --- completion sequence ---
    this.elapsed += dt;
    const t = clamp(this.elapsed / SEQUENCE_LENGTH, 0, 1);
    const swell = Easing.cinematic(clamp(this.elapsed / 1.5, 0, 1));

    this.portal.userData.glowMaterial.opacity = this.baseGlowOpacity + swell * 0.42;
    this.portal.userData.haloMaterial.opacity = this.baseHaloOpacity + swell * 0.5;
    this.portal.userData.light.intensity = this.baseLightIntensity * (1 + swell * 2.6);
    this.audio.setPortalProximity(1);

    if (this.elapsed < 2.2 && Math.random() < 0.75) {
      this.dust.burst(this._portalWorld,
        { count: 3, spread: 2.4, speed: 0.5, drift: 1.0, life: 2.4, color: 0xa8f2e4 });
    }

    // A gentle veil, not a blackout -- the level should still be visible behind
    // the words.
    this.ui.setFade(Easing.smooth(clamp((this.elapsed - 1.4) / 1.4, 0, 1)) * 0.42);

    if (t >= 1 && !this._panelShown) {
      this._panelShown = true;
      this.onComplete?.();
    }
  }
}
