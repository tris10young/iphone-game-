import { Game } from './Game.js';

const container = document.getElementById('app');
const game = new Game(container);
game.start();

// Handy for poking at the simulation from the console while prototyping.
window.game = game;
