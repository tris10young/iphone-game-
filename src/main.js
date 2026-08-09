import { Game } from './core/Game.js';

/**
 * Entry point.
 *
 * The title veil is not decoration: iOS refuses to start an AudioContext
 * outside a user gesture, so the game needs one tap before it can make any
 * sound. Building the scene behind the veil also means the first frame the
 * player sees is already the finished image.
 */

const canvas = document.getElementById('scene');

let game;
try {
  game = new Game(canvas);
} catch (error) {
  console.error('Failed to start:', error);
  const sub = document.getElementById('boot-sub');
  if (sub) sub.textContent = 'WebGL unavailable';
  throw error;
}

game.ui.onBootTap(async () => {
  await game.start();
});

// Handy for poking at the level from a console during development. Assigned
// before warm-up so it exists during the slowest part of startup.
window.game = game;

// Compile shaders and render one frame now, while the veil still covers the
// canvas, so the first frame the player sees costs nothing.
game.warmUp();
document.getElementById('boot-sub').textContent = 'Tap to begin';
