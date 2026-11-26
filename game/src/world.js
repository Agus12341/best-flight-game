// The flight simulation: a mail plane flying forever forward over patchwork country, through
// golden rings, past birds and radio towers, in weather that sometimes shoves it sideways.
// Everything advances in fixed steps from a seeded random source, so a seed always flies the
// same sky. Rendering only reads this state; input arrives as steering axes each step.

import { BIRD, FLIGHT, GUST, PLANE, RING, SCORE, SPAWN_Z, TOWER } from './config.js';

export const EVENT_RING = 1;
export const EVENT_NEAR = 2;
export const EVENT_HIT = 4;
export const EVENT_OVER = 8;
export const EVENT_GUST = 16;

export const KIND_RING = 0;
export const KIND_BIRD = 1;
export const KIND_TOWER = 2;
export const KIND_CLOUD = 3;

const POOL = 220;
const PARTICLE_POOL = 320;
const TEXT_POOL = 12;

function makePool(size, make) {
  const pool = [];
  for (let i = 0; i < size; i += 1) pool.push(make());
  return pool;
}

function take(pool) {
  for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
  return null;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createWorld(random) {
  const state = {
    time: 0,
    distance: 0,
    score: 0,
    speed: FLIGHT.baseSpeed,
    boosting: false,
    lat: 0,
    alt: PLANE.startAlt,
    bank: 0,
    pitch: 0,
    heading: 0,
    hull: FLIGHT.hull,
    hitTimer: 0,
    streak: 0,
    bestStreak: 0,
    ringsHit: 0,
    ringsMissed: 0,
    nearMisses: 0,
    trauma: 0,
    over: false,
    overReason: '',
    gust: { phase: 0, timer: GUST.firstAt, dir: 1 }, // phase 0 idle, 1 warning, 2 blowing
    items: makePool(POOL, () => ({ active: false, kind: 0, x: 0, alt: 0, z: 0, h: 0, seed: 0, passed: 0 })),
    particles: makePool(PARTICLE_POOL, () => ({ active: false, x: 0, alt: 0, z: 0, vx: 0, va: 0, vz: 0, life: 0, maxLife: 1, size: 2, color: '#fff', grav: 0 })),
    texts: makePool(TEXT_POOL, () => ({ active: false, x: 0, alt: 0, z: 0, life: 0, text: '', color: '#fff' })),
  };

  let ringTimer = RING.firstDelay;
  let birdTimer = BIRD.intervalStart;
  let towerTimer = TOWER.intervalStart * 0.6;
  let cloudTimer = 0;

  function burst(x, alt, z, color, count, spread, baseVz) {
    for (let i = 0; i < count; i += 1) {
      const p = take(state.particles);
      if (p === null) return;
      const angle = random() * Math.PI * 2;
      const mag = (0.3 + random() * 0.7) * spread;
      p.active = true;
      p.x = x; p.alt = alt; p.z = z;
      p.vx = Math.cos(angle) * mag;
      p.va = Math.sin(angle) * mag;
      p.vz = baseVz - random() * 14;
      p.maxLife = 0.5 + random() * 0.6;
      p.life = p.maxLife;
      p.size = 1.6 + random() * 2.6;
      p.color = color;
      p.grav = -3;
    }
  }

  function floatText(x, alt, z, text, color) {
    const t = take(state.texts);
    if (t === null) return;
    t.active = true;
    t.x = x; t.alt = alt; t.z = z;
    t.life = 1.15;
    t.text = text;
    t.color = color;
  }

  function spawnRing() {
    const item = take(state.items);
    if (item === null) return;
    item.active = true;
    item.kind = KIND_RING;
    item.x = (random() * 2 - 1) * RING.latRange;
    item.alt = RING.altMin + random() * (RING.altMax - RING.altMin);
    item.z = SPAWN_Z;
    item.passed = 0;
    item.seed = random();
  }

  function spawnBird() {
    const item = take(state.items);
    if (item === null) return;
    item.active = true;
    item.kind = KIND_BIRD;
    // Birds like the plane's band of sky: near its altitude, somewhere across its path.
    item.x = state.lat + (random() * 2 - 1) * 34;
    item.alt = clamp(state.alt + (random() * 2 - 1) * 26, 14, 112);
    item.z = SPAWN_Z;
    item.seed = random() * 10;
    item.passed = 0;
  }

  function spawnTower() {
    const item = take(state.items);
    if (item === null) return;
    item.active = true;
    item.kind = KIND_TOWER;
    item.x = (random() * 2 - 1) * 44;
    item.alt = 0;
    item.h = TOWER.heightMin + random() * (TOWER.heightMax - TOWER.heightMin);
    item.z = SPAWN_Z;
    item.seed = random();
    item.passed = 0;
  }

  function spawnCloud(ahead) {
    const item = take(state.items);
    if (item === null) return;
    item.active = true;
    item.kind = KIND_CLOUD;
    item.x = (random() * 2 - 1) * 130;
    item.alt = 40 + random() * 114;
    item.z = ahead ? SPAWN_Z : 150 + random() * (SPAWN_Z - 150);
    item.seed = random() * 10;
    item.passed = 0;
  }

  function hit(kind) {
    state.hull -= 1;
    state.hitTimer = PLANE.hitCooldown;
    state.trauma = 1;
    state.streak = 0;
    burst(state.lat, state.alt, 6, '#e2483d', 22, 9, -state.speed * 0.3);
    burst(state.lat, state.alt, 6, '#39424e', 12, 6, -state.speed * 0.3);
    if (state.hull <= 0) {
      state.over = true;
      state.overReason = kind === KIND_BIRD
        ? 'A bird strike took the last of the hull.'
        : 'One tower too many. The Post thanks you for flying.';
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function step(dt, axes, boost) {
    if (state.over) return 0;
    let events = 0;
    state.time += dt;

    // --- the plane answers the stick
    const gustPush = state.gust.phase === 2 ? state.gust.dir * GUST.push * Math.min(1, state.gust.timer / 0.6 + 0.4) : 0;
    state.lat = clamp(state.lat + (axes.x * PLANE.latSpeed + gustPush) * dt, PLANE.latMin, PLANE.latMax);
    state.alt = clamp(state.alt + axes.y * PLANE.climbSpeed * dt, PLANE.altMin, PLANE.altMax);
    state.bank += (clamp(axes.x, -1, 1) - state.bank) * Math.min(1, dt * 6);
    state.pitch += (clamp(axes.y, -1, 1) - state.pitch) * Math.min(1, dt * 5);
    state.heading = (state.heading + axes.x * 7 * dt + 360) % 360;

    const cruise = Math.min(FLIGHT.maxSpeed, FLIGHT.baseSpeed + FLIGHT.speedRamp * state.time);
    state.boosting = boost;
    state.speed = boost ? cruise * FLIGHT.boostFactor : cruise;
    state.distance += state.speed * dt;
    state.score += state.speed * dt * SCORE.perMeter;

    // --- weather
    const gust = state.gust;
    gust.timer -= dt;
    if (gust.phase === 0 && gust.timer <= 0) {
      gust.phase = 1;
      gust.timer = GUST.warnSeconds;
      gust.dir = random() < 0.5 ? -1 : 1;
      events |= EVENT_GUST;
    } else if (gust.phase === 1 && gust.timer <= 0) {
      gust.phase = 2;
      gust.timer = GUST.blowSeconds;
    } else if (gust.phase === 2 && gust.timer <= 0) {
      gust.phase = 0;
      gust.timer = GUST.everyMin + random() * (GUST.everyMax - GUST.everyMin);
    }

    // --- spawns
    ringTimer -= dt;
    if (ringTimer <= 0) {
      spawnRing();
      const gap = Math.max(RING.intervalMin, RING.intervalStart - RING.intervalRamp * state.time);
      ringTimer = gap * (0.85 + random() * 0.3);
    }
    if (state.time > BIRD.startAfter) {
      birdTimer -= dt;
      if (birdTimer <= 0) {
        spawnBird();
        if (random() < 0.4) spawnBird();
        const gap = Math.max(BIRD.intervalMin, BIRD.intervalStart - state.time * 0.02);
        birdTimer = gap * (0.7 + random() * 0.6);
      }
    }
    if (state.time > TOWER.startAfter) {
      towerTimer -= dt;
      if (towerTimer <= 0) {
        spawnTower();
        const gap = Math.max(TOWER.intervalMin, TOWER.intervalStart - state.time * 0.018);
        towerTimer = gap * (0.7 + random() * 0.6);
      }
    }
    cloudTimer -= dt;
    if (cloudTimer <= 0) {
      spawnCloud(true);
      cloudTimer = 0.9 + random() * 1.3;
    }

    // --- the world rushes past; crossings are judged as things pass the plane
    if (state.hitTimer > 0) state.hitTimer -= dt;
    const dz = state.speed * dt;
    for (let i = 0; i < state.items.length; i += 1) {
      const item = state.items[i];
      if (!item.active) continue;
      const prevZ = item.z;
      item.z -= dz;
      if (item.kind === KIND_CLOUD) item.x += dt * 0.6; // a slow drift of its own
      if (item.z < -14) {
        item.active = false;
        continue;
      }
      if (prevZ > 0 && item.z <= 0) {
        if (item.kind === KIND_RING) {
          const d = Math.hypot(item.x - state.lat, item.alt - state.alt);
          if (d <= RING.radius - 1.2) {
            state.streak += 1;
            state.bestStreak = Math.max(state.bestStreak, state.streak);
            const mult = 1 + SCORE.streakStep * Math.min(state.streak - 1, SCORE.streakCap);
            const gained = Math.round(RING.points * mult);
            state.score += gained;
            state.ringsHit += 1;
            item.passed = 1;
            burst(item.x, item.alt, 4, '#ffb52e', 20, 8, -state.speed * 0.25);
            burst(item.x, item.alt, 4, '#43e08a', 10, 6, -state.speed * 0.25);
            floatText(item.x, item.alt + RING.radius + 2, 6, `+${gained}`, '#ffd97a');
            events |= EVENT_RING;
          } else if (d <= RING.radius + RING.nearMissBand) {
            state.score += RING.nearMissPoints;
            state.nearMisses += 1;
            item.passed = 2;
            floatText(item.x, item.alt + RING.radius + 2, 6, `NEAR +${RING.nearMissPoints}`, '#b9c9da');
            events |= EVENT_NEAR;
          } else {
            state.streak = 0;
            state.ringsMissed += 1;
            item.passed = 3;
          }
        } else if (item.kind === KIND_BIRD) {
          const d = Math.hypot(item.x - state.lat, item.alt - state.alt);
          if (d < BIRD.radius && state.hitTimer <= 0) {
            item.active = false;
            events |= hit(KIND_BIRD);
            if (state.over) return events;
          }
        } else if (item.kind === KIND_TOWER) {
          if (Math.abs(item.x - state.lat) < TOWER.radius && state.alt < item.h + 2.5 && state.hitTimer <= 0) {
            events |= hit(KIND_TOWER);
            if (state.over) return events;
          }
        }
      }
    }

    // --- sparks and floating scores live briefly
    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.alt += p.va * dt;
      p.va += p.grav * dt;
      p.z += p.vz * dt - dz;
    }
    for (let i = 0; i < state.texts.length; i += 1) {
      const t = state.texts[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      t.alt += dt * 5;
      t.z -= dz;
    }
    state.trauma = Math.max(0, state.trauma - dt * 1.5);
    return events;
  }

  function reset() {
    state.time = 0;
    state.distance = 0;
    state.score = 0;
    state.speed = FLIGHT.baseSpeed;
    state.boosting = false;
    state.lat = 0;
    state.alt = PLANE.startAlt;
    state.bank = 0;
    state.pitch = 0;
    state.heading = 0;
    state.hull = FLIGHT.hull;
    state.hitTimer = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.ringsHit = 0;
    state.ringsMissed = 0;
    state.nearMisses = 0;
    state.trauma = 0;
    state.over = false;
    state.overReason = '';
    state.gust.phase = 0;
    state.gust.timer = GUST.firstAt;
    state.gust.dir = 1;
    for (const item of state.items) item.active = false;
    for (const p of state.particles) p.active = false;
    for (const t of state.texts) t.active = false;
    ringTimer = RING.firstDelay;
    birdTimer = BIRD.intervalStart;
    towerTimer = TOWER.intervalStart * 0.6;
    cloudTimer = 0;
    // Pre-fill the sky so the first frame is already a world, not an empty runway.
    for (let i = 0; i < 10; i += 1) spawnCloud(false);
  }

  reset();
  return { state, step, reset };
}

/**
 * Steer toward the next ring, dodging what is close: the pilot of the title screen's attract
 * mode and of the staged screenshot scenes.
 */
export function autopilotAxes(state) {
  let ring = null;
  for (const item of state.items) {
    if (item.active && item.kind === KIND_RING && item.z > 6 && (ring === null || item.z < ring.z)) ring = item;
  }
  let tx = 0;
  let ty = 50;
  if (ring !== null) {
    tx = ring.x;
    ty = ring.alt;
  }
  // Dodge: anything solid and close gets a wide berth, upward for towers, away for birds.
  for (const item of state.items) {
    if (!item.active || item.z < 4 || item.z > 130) continue;
    if (item.kind === KIND_BIRD && Math.abs(item.x - state.lat) < 7 && Math.abs(item.alt - state.alt) < 7) {
      ty = state.alt + (state.alt >= item.alt ? 16 : -16);
      tx = state.lat + (state.lat >= item.x ? 10 : -10);
    } else if (item.kind === KIND_TOWER && Math.abs(item.x - state.lat) < 7 && state.alt < item.h + 12) {
      ty = item.h + 16;
    }
  }
  const ax = clamp((tx - state.lat) / 9, -1, 1);
  const ay = clamp((ty - state.alt) / 9, -1, 1);
  return { x: Math.abs(ax) < 0.06 ? 0 : ax, y: Math.abs(ay) < 0.06 ? 0 : ay };
}
