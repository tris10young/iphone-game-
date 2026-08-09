/**
 * Central tuning values for the battle prototype.
 * Everything gameplay-facing lives here so systems stay free of magic numbers.
 */
export const CONFIG = {
  field: {
    width: 200,
    length: 200,
    hillAmplitude: 0.8, // gentle terrain variation — enough to catch the light
  },

  army: {
    size: 20, // soldiers per side, commander included on the player side
    columns: 4, // 4 across
    spacingX: 2.0, // metres sideways
    spacingZ: 2.5, // metres front-to-back
    playerSpawn: { x: 0, z: -28, facing: 0 }, // facing 0 == +Z (toward the enemy)
    enemySpawn: { x: 0, z: 28, facing: Math.PI },
  },

  soldier: {
    speed: 2.8, // units/second
    catchUpMultiplier: 1.6, // max speed boost when badly out of position
    turnRate: 6.0, // radians/second
    health: 100,
    damage: 25,
    attackCooldown: 1.0, // seconds
    attackRange: 2.0,
    engageRange: 4.5, // will break formation to close on an enemy inside this
    separationRadius: 1.0,
    separationForce: 2.2,
    slotArriveDistance: 0.2,
    radius: 0.4,
    swingDuration: 0.4,
    deathDuration: 0.7,
    targetSearchInterval: 0.2, // seconds; staggered per soldier
  },

  formation: {
    centreSpeed: 2.5, // slightly slower than soldiers so they can keep up
    rotationRate: 1.6, // radians/second
    arriveDistance: 0.4,
  },

  commander: {
    walkSpeed: 5.0,
    sprintSpeed: 8.0,
    eyeHeight: 1.7,
    jumpVelocity: 6.0,
    gravity: 20.0,
    damage: 35,
    attackRange: 2.5,
    attackArcDot: 0.4, // cos of the half-angle of the hit cone
    attackCooldown: 0.55,
    swingDuration: 0.35,
    hitFrame: 0.45, // fraction of the swing at which damage lands
    lookSensitivity: 0.0022,
  },

  tacticalCamera: {
    distance: 68,
    minDistance: 18,
    maxDistance: 140,
    pitch: 0.82, // radians above the horizon
    minPitch: 0.25,
    maxPitch: 1.45,
    yaw: Math.PI, // look from the player army's side of the field
    panSpeed: 40, // units/second at default zoom
    zoomSpeed: 0.0016,
    rotateSpeed: 0.005,
    smoothing: 10, // higher == snappier
    startTarget: { x: 0, z: -10 },
  },

  transition: {
    duration: 0.5, // seconds for the tactical <-> first person camera move
  },

  enemyAI: {
    advanceDelay: 2.5, // seconds before the red army starts marching
    reassessInterval: 1.5, // seconds between re-targeting the player army
    stopDistance: 6, // stop the formation centre this far short of the target
  },

  colors: {
    player: 0x4f7fc4,
    playerAccent: 0x2f4f80,
    enemy: 0xb8524c,
    enemyAccent: 0x7d3430,
    skin: 0xc9a888,
    steel: 0xb9bec4,
    leather: 0x6b5744,
    grass: 0x6f8b49,
    sky: 0x9fb8cf,
  },
};
