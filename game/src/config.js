// Skyward Post: every tuning number and colour in one place. The view is a fixed 1280x720
// logical canvas; the renderer scales it to the window, so no rule depends on screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Perspective: screen scale of a 1 m object 1 m ahead; objects spawn at SPAWN_Z and pass at 0. */
export const FOCAL = 560;
export const SPAWN_Z = 950;
export const HORIZON_Y = 300;

export const PLANE = {
  latMin: -36,
  latMax: 36,
  altMin: 9,
  altMax: 118,
  latSpeed: 30, // m/s of sideways travel at full stick
  climbSpeed: 19, // m/s of climb at full stick
  startAlt: 46,
  hitCooldown: 1.4, // seconds of grace after a hit
};

export const FLIGHT = {
  baseSpeed: 43, // m/s at takeoff
  speedRamp: 0.5, // m/s gained per second aloft
  maxSpeed: 79,
  boostFactor: 1.38,
  hull: 3,
};

export const RING = {
  radius: 7.5,
  firstDelay: 1.1, // the first ring comes almost at once: the game teaches itself
  intervalStart: 1.55,
  intervalMin: 0.95,
  intervalRamp: 0.006, // seconds shaved off the gap per second aloft
  latRange: 27,
  altMin: 20,
  altMax: 96,
  points: 100,
  nearMissPoints: 25,
  nearMissBand: 4.5, // metres outside the rim that still count as a near miss
};

export const BIRD = {
  startAfter: 16, // seconds before the first flock shows up
  intervalStart: 3.6,
  intervalMin: 1.7,
  radius: 3.4, // collision distance in the x/altitude plane
};

export const TOWER = {
  startAfter: 10,
  intervalStart: 4.4,
  intervalMin: 2.2,
  heightMin: 16,
  heightMax: 44,
  radius: 3.2,
};

/** Wind gusts: a warning, then a sideways push with streaking air. */
export const GUST = {
  firstAt: 13,
  everyMin: 12,
  everyMax: 20,
  warnSeconds: 1.2,
  blowSeconds: 2.8,
  push: 7.5, // m/s of sideways drift at full blow
};

export const SCORE = {
  perMeter: 0.055, // distance points: cruising at 50 m/s earns about 2.75 a second... times speed below
  streakStep: 0.5, // each ring in a streak adds this to the ring multiplier
  streakCap: 8,
};

export const PALETTE = {
  skyTop: '#2e6db4',
  skyMid: '#7db3e8',
  skyLow: '#cfe8f7',
  sun: '#fff3c4',
  cloud: '#ffffff',
  cloudShade: '#d9e6f2',
  fieldA: '#69a84f',
  fieldB: '#7fb95c',
  fieldC: '#c9b458',
  fieldD: '#8fbf6d',
  fieldE: '#5d9b47',
  river: '#4f83c2',
  road: '#9a938a',
  runway: '#5c6066',
  runwayLine: '#f5f5f0',
  mountainFar: '#8fa8c8',
  mountainNear: '#6d8ab0',
  snow: '#eef4fa',
  tower: '#c8452c',
  towerLight: '#ffd9d0',
  bird: '#2c3440',
  ring: '#ffb52e',
  ringAligned: '#43e08a',
  ringMissed: '#e5534b',
  planeBody: '#f2f4f6',
  planeTrim: '#e2483d',
  planeDark: '#39424e',
  panel: 'rgba(16,22,32,0.82)',
  panelEdge: '#3d4b61',
  gaugeFace: '#101820',
  gaugeTick: '#cfe0f0',
  gaugeNeedle: '#ffb52e',
  horizonSky: '#3f8fd2',
  horizonGround: '#8a6b42',
  text: '#f4f8fc',
  muted: '#b9c9da',
  good: '#43e08a',
  bad: '#ff6b5e',
  gold: '#ffb52e',
};

export const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'skyward-post.best';
