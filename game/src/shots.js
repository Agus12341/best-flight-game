// The screenshot scenes behind ?shot=start|play|end. Each one flies the real rules forward
// from a fresh world, steered by the game's own autopilot, so the frame is what a short
// flight really looks like and the same seed always gives the same frame. The end scene
// flies honestly first, then puts one bird squarely in the plane's path and lets the real
// collision rule finish the flight.
import { STEP } from './config.js';
import { autopilotAxes, EVENT_OVER, KIND_BIRD } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4.5;
const PLAY_SECONDS = 21;
const END_FLY_SECONDS = 26;

function fly(world, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.step(STEP, autopilotAxes(world.state), false) & EVENT_OVER) break;
  }
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return
 * the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'play' && name !== 'end') {
    fly(world, START_SECONDS);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    fly(world, PLAY_SECONDS);
    // Settle on a frame with a ring ahead in the sky: keep flying until one is mid-distance.
    for (let i = 0; i < 8 / STEP; i += 1) {
      const ringAhead = state.items.some(
        (item) => item.active && item.kind === 0 && item.z > 90 && item.z < 430,
      );
      if (ringAhead || state.over) break;
      if (world.step(STEP, autopilotAxes(state), false) & EVENT_OVER) break;
    }
    return { screen: state.over ? SCREEN_OVER : SCREEN_PLAY, best: Math.floor(state.score) };
  }
  // end: a real flight, then a bird the pilot cannot miss.
  fly(world, END_FLY_SECONDS);
  if (!state.over) {
    state.hull = 1;
    state.hitTimer = 0;
    const bird = state.items.find((item) => !item.active);
    if (bird) {
      bird.active = true;
      bird.kind = KIND_BIRD;
      bird.x = state.lat;
      bird.alt = state.alt;
      bird.z = 55;
      bird.seed = 3;
      bird.passed = 0;
    }
    for (let i = 0; i < 10 / STEP && !state.over; i += 1) {
      world.step(STEP, { x: 0, y: 0 }, false);
    }
  }
  return { screen: SCREEN_OVER, best: Math.floor(state.score) };
}
