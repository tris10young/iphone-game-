import * as THREE from 'three';

const SELECTED_COLOR = 0x9fd0ff;

/**
 * Tactical-mode player input: select the army, order it somewhere, show the
 * destination marker. Deliberately group-level for the prototype — individual
 * unit selection slots in here later.
 */
export class CommandController {
  constructor({ scene, army, battlefield, cameraManager, ui }) {
    this.scene = scene;
    this.army = army;
    this.battlefield = battlefield;
    this.cameraManager = cameraManager;
    this.ui = ui;

    this.selected = false;
    this.raycaster = new THREE.Raycaster();
    this._point = new THREE.Vector3();

    this._buildDestinationMarker();
  }

  _buildDestinationMarker() {
    const group = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 1.9, 32),
      new THREE.MeshBasicMaterial({
        color: SELECTED_COLOR,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 32),
      new THREE.MeshBasicMaterial({
        color: SELECTED_COLOR,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    disc.rotation.x = -Math.PI / 2;
    group.add(disc);

    group.visible = false;
    this.marker = group;
    this.markerRing = ring;
    this.scene.add(group);
  }

  update(dt, input) {
    for (const click of input.takeClicks(0)) this._handleSelectClick(click, click.touch);
    for (const click of input.takeClicks(2)) this._handleOrderClick(click);

    if (this.marker.visible) {
      if (!this.army.hasOrder) this.hideMarker();
      else {
        this._markerPhase = (this._markerPhase || 0) + dt * 2.4;
        const pulse = 1 + Math.sin(this._markerPhase) * 0.07;
        this.markerRing.scale.setScalar(pulse);
      }
    }
  }

  _handleSelectClick(click, isTouch) {
    const camera = this.cameraManager.pickCamera;
    this.raycaster.setFromCamera(click.ndc, camera);

    const meshes = this.army.soldiers.filter((s) => s.alive).map((s) => s.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (hits.length > 0) {
      this.setSelected(true);
      this.ui.showToast('Army Selected');
      return;
    }

    // There is no right button on a phone: once the army is selected, a tap on
    // open ground is the move order rather than a deselect.
    if (isTouch && this.selected) {
      this._handleOrderClick(click);
      return;
    }
    this.setSelected(false);
  }

  _handleOrderClick(click) {
    if (!this.selected) return;
    const point = this._pickGround(click.ndc);
    if (!point) return;

    this.army.moveTo(point.x, point.z);
    this.showMarker(point.x, point.z);
  }

  _pickGround(ndc) {
    this.raycaster.setFromCamera(ndc, this.cameraManager.pickCamera);
    const hits = this.raycaster.intersectObject(this.battlefield.ground, false);
    if (hits.length === 0) return null;
    return this._point.copy(hits[0].point);
  }

  setSelected(selected) {
    if (this.selected === selected) return;
    this.selected = selected;
    for (const soldier of this.army.soldiers) {
      const material = soldier.marker.material;
      material.opacity = selected ? 0.95 : 0.55;
      material.color.setHex(selected ? SELECTED_COLOR : soldier.tunicMaterial.color.getHex());
    }
    this.ui.setSelection(selected);
  }

  showMarker(x, z) {
    this.marker.position.set(x, this.battlefield.getHeight(x, z) + 0.06, z);
    this.marker.visible = true;
  }

  hideMarker() {
    this.marker.visible = false;
  }

  dispose() {
    this.scene.remove(this.marker);
  }
}
