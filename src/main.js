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

// Render one frame immediately so the scene is warm and the shaders are
// compiled before the veil lifts.
game.post.render(0);

// Handy for poking at the level from a console during development.
window.game = game;
