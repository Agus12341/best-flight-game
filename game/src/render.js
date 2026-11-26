// Everything the player sees: a chase view over patchwork country, the plane in frame, rings
// and birds and towers rushing out of the distance, then a lit instrument panel and HUD over
// the bottom and top. All of it is drawn from the world state each frame; nothing here keeps
// game rules, only a little smoothing for the camera.

import {
  FOCAL, FONT, HORIZON_Y, PALETTE, RING, SPAWN_Z, VIEW,
} from './config.js';
import { hash01 } from './random.js';
import { KIND_BIRD, KIND_CLOUD, KIND_RING, KIND_TOWER } from './world.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;

const FIELD_COLORS = [PALETTE.fieldA, PALETTE.fieldB, PALETTE.fieldC, PALETTE.fieldD, PALETTE.fieldE];
const PATCH_LEN = 46; // metres per patchwork row
const BAND = 30; // metres per patchwork column

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let focalSmooth = FOCAL;
  let uiTime = 0; // the renderer's own clock: it keeps pulsing prompts alive on frozen screens

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (w !== width || h !== height) {
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
    }
  }
  window.addEventListener('resize', resize);
  resize();

  // -- projection ------------------------------------------------------------
  // The camera sits just behind and above the plane; the plane's own lateral position and
  // altitude are the origin everything else is measured against.
  function project(state, x, alt, z, focal) {
    const s = focal / Math.max(z, 1.5);
    return {
      x: VIEW.width / 2 + (x - state.lat) * s,
      y: HORIZON_Y + state.pitch * 30 - (alt - state.alt) * s,
      s,
    };
  }

  function drawSky(state, shakeX, shakeY) {
    const horizon = HORIZON_Y + state.pitch * 30 + shakeY;
    const grad = ctx.createLinearGradient(0, 0, 0, horizon + 60);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.62, PALETTE.skyMid);
    grad.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Base country under the patchwork, so the world reaches both edges of the frame at
    // every distance: the slices paint their fields over this.
    ctx.fillStyle = '#7cab60';
    ctx.fillRect(0, horizon - 2, VIEW.width, VIEW.height - horizon + 2);
    // The sun, in the clear sky between the compass and the rings box, with a soft halo.
    const sunX = 884 + shakeX * 0.3;
    const sunY = 128 + shakeY * 0.3;
    const halo = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 120);
    halo.addColorStop(0, 'rgba(255,243,196,0.85)');
    halo.addColorStop(0.25, 'rgba(255,243,196,0.35)');
    halo.addColorStop(1, 'rgba(255,243,196,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
    ctx.fill();
    // Two mountain ridges on the horizon, drifting slowly against the flight.
    ridge(horizon, state.distance * 0.012, 46, PALETTE.mountainFar, 0.011, 7);
    ridge(horizon, state.distance * 0.03 + 300, 30, PALETTE.mountainNear, 0.017, 19);
  }

  function ridge(horizon, offset, amp, color, freq, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-20, horizon + 2);
    for (let x = -20; x <= VIEW.width + 20; x += 26) {
      const wx = x + offset;
      const y = horizon - 6 - (Math.sin(wx * freq + seed) * 0.5 + 0.5) * amp
        - (Math.sin(wx * freq * 2.7 + seed * 2) * 0.5 + 0.5) * amp * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VIEW.width + 20, horizon + 2);
    ctx.closePath();
    ctx.fill();
  }

  const fogCache = new Map();
  function fogged(color, z) {
    const bucket = Math.floor(z / 120);
    const key = `${color}|${bucket}`;
    let out = fogCache.get(key);
    if (out === undefined) {
      const t = Math.min(0.42, (bucket * 120) / SPAWN_Z * 0.42);
      const a = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
      const b = [0xcf, 0xe8, 0xf7];
      out = `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
      fogCache.set(key, out);
    }
    return out;
  }

  function drawGround(state, focal, shakeX) {
    // Perspective slices of the ground plane, far to near; each slice is a row of patchwork
    // fields whose colours come from a hash of their world coordinates, so the country is
    // stable as it streams toward the camera. Near slices project far below the screen and
    // are skipped, not stopped at: the visible country is the far slices.
    let zNear = 7;
    for (let k = 0; k < 34; k += 1) {
      const zFar = zNear * 1.21 + 2;
      const row = Math.floor((state.distance + zNear) / PATCH_LEN);
      const yFar = project(state, state.lat, 0, zFar, focal).y;
      if (yFar > VIEW.height + 60) {
        zNear = zFar;
        if (zNear > SPAWN_Z) break;
        continue;
      }
      for (let bx = -14; bx < 14; bx += 1) {
        const x0 = bx * BAND;
        const x1 = x0 + BAND;
        const p00 = project(state, x0, 0, zNear, focal);
        const p10 = project(state, x1, 0, zNear, focal);
        const p01 = project(state, x0, 0, zFar, focal);
        const p11 = project(state, x1, 0, zFar, focal);
        if (p10.x < -60 || p00.x > VIEW.width + 60) continue;
        let color;
        if (bx === 1) color = PALETTE.river; // the river runs along the right of the route
        else if (bx === -2) color = PALETTE.road;
        else color = FIELD_COLORS[Math.floor(hash01(row * 131 + bx * 17 + 5) * FIELD_COLORS.length)];
        ctx.fillStyle = fogged(color, zNear);
        ctx.beginPath();
        ctx.moveTo(p00.x + shakeX, p00.y);
        ctx.lineTo(p10.x + shakeX, p10.y);
        ctx.lineTo(p11.x + shakeX, p11.y);
        ctx.lineTo(p01.x + shakeX, p01.y);
        ctx.closePath();
        ctx.fill();
      }
      zNear = zFar;
      if (zNear > SPAWN_Z) break;
    }
    // The home runway, under the first stretch of every flight.
    const remain = 640 - state.distance;
    if (remain > 30) {
      const zEnd = Math.min(remain, SPAWN_Z);
      const a = project(state, -7.5, 0, 7, focal);
      const b = project(state, 7.5, 0, 7, focal);
      const c = project(state, 7.5, 0, zEnd, focal);
      const d = project(state, -7.5, 0, zEnd, focal);
      ctx.fillStyle = PALETTE.runway;
      ctx.beginPath();
      ctx.moveTo(a.x + shakeX, a.y);
      ctx.lineTo(b.x + shakeX, b.y);
      ctx.lineTo(c.x + shakeX, c.y);
      ctx.lineTo(d.x + shakeX, d.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.runwayLine;
      for (let z = 16; z < zEnd - 8; z += 30) {
        const p = project(state, 0, 0, z, focal);
        const wdt = Math.max(1, 0.5 * p.s);
        const len = Math.max(1.5, 7 * p.s * 0.14);
        ctx.fillRect(p.x - wdt / 2 + shakeX, p.y - len / 2, wdt, len);
      }
    }
  }

  function drawCloud(state, item, focal, shakeX, shakeY) {
    if (item.z < 30) return; // too close: it would fill the whole sky
    const p = project(state, item.x, item.alt, item.z, focal);
    if (p.x < -260 || p.x > VIEW.width + 260 || p.y < -160 || p.y > VIEW.height + 120) return;
    const r = Math.min(10.5 * p.s, 74);
    if (r < 2) return;
    const fade = Math.min(1, (SPAWN_Z - item.z) / 160 + 0.25) * Math.min(1, (item.z - 24) / 90 + 0.3);
    ctx.globalAlpha = 0.34 * fade;
    ctx.fillStyle = PALETTE.cloudShade;
    blob(p.x + shakeX, p.y + shakeY + r * 0.22, r * 1.45, item.seed);
    ctx.globalAlpha = 0.62 * fade;
    ctx.fillStyle = PALETTE.cloud;
    blob(p.x + shakeX, p.y + shakeY, r, item.seed + 3);
    ctx.globalAlpha = 1;
  }

  function blob(x, y, r, seed) {
    // Puffs drawn squashed flat, the way a cloud sits: wide, low and soft-shouldered. The
    // caller paints a wide faint pass under a smaller brighter one, so edges stay soft.
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.58);
    const puffs = 6;
    for (let i = 0; i < puffs; i += 1) {
      const a = hash01(Math.floor(seed * 100) + i * 13) * Math.PI * 2;
      const d = r * 0.46 * hash01(Math.floor(seed * 77) + i * 7);
      const rr = r * (0.4 + hash01(Math.floor(seed * 31) + i) * 0.36);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.5, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRing(state, item, focal, shakeX, shakeY) {
    const p = project(state, item.x, item.alt, item.z, focal);
    const rx = RING.radius * p.s;
    if (rx < 1.5 || p.x < -rx * 2 || p.x > VIEW.width + rx * 2) return;
    const ry = rx * 0.94;
    const dx = item.x - state.lat;
    const da = item.alt - state.alt;
    const aligned = Math.abs(dx) < 3.2 && Math.abs(da) < 3.2;
    let color = aligned ? PALETTE.ringAligned : PALETTE.ring;
    if (item.passed === 1) color = PALETTE.ringAligned;
    else if (item.passed === 3) color = PALETTE.ringMissed;
    const lw = Math.max(2, 0.62 * p.s);
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = lw * 2.6;
    ctx.beginPath();
    ctx.ellipse(p.x + shakeX, p.y + shakeY, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(p.x + shakeX, p.y + shakeY, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Four bright studs ride the rim, turning slowly: the ring reads as a gate, not a hoop.
    ctx.fillStyle = '#fff7e0';
    for (let i = 0; i < 4; i += 1) {
      const a = state.time * 0.9 + item.seed * 6 + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(p.x + shakeX + Math.cos(a) * rx, p.y + shakeY + Math.sin(a) * ry, Math.max(1.4, lw * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBird(state, item, focal, shakeX, shakeY) {
    const p = project(state, item.x, item.alt, item.z, focal);
    const s = Math.max(0.35, p.s * 0.62);
    if (p.x < -60 || p.x > VIEW.width + 60 || p.y < -40 || p.y > VIEW.height + 40) return;
    const flap = Math.sin(state.time * 11 + item.seed * 9) * 0.55;
    ctx.strokeStyle = PALETTE.bird;
    ctx.fillStyle = PALETTE.bird;
    ctx.lineWidth = Math.max(1.2, 0.32 * s);
    ctx.lineCap = 'round';
    const x = p.x + shakeX;
    const y = p.y + shakeY;
    ctx.beginPath(); // body
    ctx.ellipse(x, y, 1.5 * s, 0.62 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // wings, tipped by the flap
    ctx.moveTo(x - 3.4 * s, y - flap * 2.4 * s);
    ctx.quadraticCurveTo(x - 1.4 * s, y + 0.7 * s, x, y);
    ctx.quadraticCurveTo(x + 1.4 * s, y + 0.7 * s, x + 3.4 * s, y - flap * 2.4 * s);
    ctx.stroke();
  }

  function drawTower(state, item, focal, shakeX, shakeY) {
    const base = project(state, item.x, 0, item.z, focal);
    const top = project(state, item.x, item.h, item.z, focal);
    if (base.x < -50 || base.x > VIEW.width + 50 || base.y < -80) return;
    const wBase = Math.max(1, 1.7 * base.s);
    const wTop = Math.max(0.6, 0.5 * base.s);
    ctx.strokeStyle = PALETTE.tower;
    ctx.lineWidth = Math.max(1, 0.22 * base.s);
    ctx.beginPath();
    ctx.moveTo(base.x - wBase + shakeX, base.y + shakeY);
    ctx.lineTo(top.x - wTop + shakeX, top.y + shakeY);
    ctx.moveTo(base.x + wBase + shakeX, base.y + shakeY);
    ctx.lineTo(top.x + wTop + shakeX, top.y + shakeY);
    const braces = 3;
    for (let i = 1; i <= braces; i += 1) {
      const t = i / (braces + 1);
      const y = base.y + (top.y - base.y) * t;
      const w = wBase + (wTop - wBase) * t;
      ctx.moveTo(base.x - w + shakeX, y + shakeY);
      ctx.lineTo(base.x + w + shakeX, y + shakeY);
    }
    ctx.stroke();
    // The warning light blinks, twice a second.
    if (Math.sin(state.time * 6.3 + item.seed * 8) > 0.1) {
      ctx.fillStyle = PALETTE.towerLight;
      ctx.beginPath();
      ctx.arc(top.x + shakeX, top.y + shakeY - 2, Math.max(1.4, 0.3 * base.s), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlane(state, focal, shakeX, shakeY) {
    const px = VIEW.width / 2 - state.bank * 26 + shakeX;
    const py = VIEW.height * 0.585 - state.pitch * 22 + Math.sin(state.time * 2.2) * 3 + shakeY;
    // Ground shadow: an ellipse on the fields below the plane, shrinking and fading as it
    // climbs. (Placed on screen, not projected: the ground point under the plane projects
    // off the bottom of the frame, so a true projection can never be seen.)
    const shScale = Math.max(0.3, 1 - state.alt / 210);
    ctx.fillStyle = `rgba(20,34,18,${(0.32 * shScale).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(px - state.bank * 8, py + 96 + state.alt * 0.42, 66 * shScale + 10, 13 * shScale + 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.bank * 0.42);
    if (state.hitTimer > 0.55 && Math.sin(state.time * 26) > 0) ctx.globalAlpha = 0.45;
    const u = 1.22; // plane unit: the aircraft is drawn about 205 px wingtip to wingtip
    // Tailplane and fin, behind the fuselage.
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.beginPath();
    ctx.moveTo(0, -64 * u);
    ctx.lineTo(9 * u, -34 * u);
    ctx.lineTo(-9 * u, -34 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-34 * u, -30 * u);
    ctx.lineTo(34 * u, -30 * u);
    ctx.lineTo(28 * u, -19 * u);
    ctx.lineTo(-28 * u, -19 * u);
    ctx.closePath();
    ctx.fill();
    // Main wing.
    const wingGrad = ctx.createLinearGradient(0, -6, 0, 26);
    wingGrad.addColorStop(0, '#ffffff');
    wingGrad.addColorStop(1, '#d7dee6');
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(-84 * u, 2 * u);
    ctx.lineTo(-30 * u, -6 * u);
    ctx.lineTo(30 * u, -6 * u);
    ctx.lineTo(84 * u, 2 * u);
    ctx.lineTo(78 * u, 15 * u);
    ctx.lineTo(-78 * u, 15 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.fillRect(-84 * u, 2 * u, 10 * u, 13 * u);
    ctx.fillRect(74 * u, 2 * u, 10 * u, 13 * u);
    // Fuselage, tail at the top of the frame, nose toward the bottom.
    const bodyGrad = ctx.createLinearGradient(-14, 0, 14, 0);
    bodyGrad.addColorStop(0, '#dfe6ee');
    bodyGrad.addColorStop(0.5, '#ffffff');
    bodyGrad.addColorStop(1, '#ccd5df');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(0, -46 * u);
    ctx.bezierCurveTo(11 * u, -30 * u, 13 * u, -4 * u, 11 * u, 22 * u);
    ctx.bezierCurveTo(9 * u, 40 * u, 5 * u, 48 * u, 0, 48 * u);
    ctx.bezierCurveTo(-5 * u, 48 * u, -9 * u, 40 * u, -11 * u, 22 * u);
    ctx.bezierCurveTo(-13 * u, -4 * u, -11 * u, -30 * u, 0, -46 * u);
    ctx.fill();
    // Canopy.
    ctx.fillStyle = '#274b63';
    ctx.beginPath();
    ctx.ellipse(0, -12 * u, 6.4 * u, 13 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,210,240,0.75)';
    ctx.beginPath();
    ctx.ellipse(-1.8 * u, -16 * u, 2.4 * u, 6 * u, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // The propeller, a blurred disc at the nose with two streaks turning in it.
    const propA = state.time * 41;
    ctx.fillStyle = 'rgba(40,48,58,0.20)';
    ctx.beginPath();
    ctx.ellipse(0, 50 * u, 17 * u, 5.4 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,48,58,0.5)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(propA) * -16 * u, 50 * u + Math.sin(propA) * 4.6 * u);
    ctx.lineTo(Math.cos(propA) * 16 * u, 50 * u - Math.sin(propA) * 4.6 * u);
    ctx.stroke();
    ctx.fillStyle = PALETTE.planeDark;
    ctx.beginPath();
    ctx.arc(0, 50 * u, 3 * u, 0, Math.PI * 2);
    ctx.fill();
    // Gear legs and wheels.
    ctx.strokeStyle = PALETTE.planeDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-9 * u, 30 * u);
    ctx.lineTo(-15 * u, 44 * u);
    ctx.moveTo(9 * u, 30 * u);
    ctx.lineTo(15 * u, 44 * u);
    ctx.stroke();
    ctx.fillStyle = PALETTE.planeDark;
    ctx.beginPath();
    ctx.arc(-15 * u, 47 * u, 4.6 * u, 0, Math.PI * 2);
    ctx.arc(15 * u, 47 * u, 4.6 * u, 0, Math.PI * 2);
    ctx.fill();
    // Wingtip lights: red left, green right, and a white strobe that pops now and then.
    ctx.fillStyle = '#ff5040';
    ctx.beginPath();
    ctx.arc(-81 * u, 9 * u, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3dff7a';
    ctx.beginPath();
    ctx.arc(81 * u, 9 * u, 2.6, 0, Math.PI * 2);
    ctx.fill();
    if (Math.sin(state.time * 4.4) > 0.965) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(0, -44 * u, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawParticles(state, focal, shakeX, shakeY) {
    for (const p of state.particles) {
      if (!p.active) continue;
      const pr = project(state, p.x, p.alt, Math.max(p.z, 2), focal);
      if (pr.x < -20 || pr.x > VIEW.width + 20 || pr.y < -20 || pr.y > VIEW.height + 20) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      const r = Math.min(9, Math.max(0.8, p.size * pr.s * 0.14));
      ctx.fillRect(pr.x - r + shakeX, pr.y - r + shakeY, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const t of state.texts) {
      if (!t.active) continue;
      const pr = project(state, t.x, t.alt, Math.max(t.z, 2), focal);
      ctx.globalAlpha = Math.min(1, t.life / 0.5);
      ctx.fillStyle = t.color;
      ctx.font = `700 ${Math.max(13, 15 * pr.s * 0.3)}px ${FONT}`;
      ctx.fillText(t.text, pr.x + shakeX, pr.y + shakeY);
    }
    ctx.globalAlpha = 1;
  }

  function drawSpeedLines(state) {
    if (!state.boosting) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    const cx = VIEW.width / 2;
    const cy = VIEW.height * 0.45;
    for (let i = 0; i < 14; i += 1) {
      const a = hash01(i * 7 + Math.floor(state.time * 9)) * Math.PI * 2;
      const r0 = 330 + hash01(i * 13 + Math.floor(state.time * 9)) * 190;
      const len = 34 + hash01(i * 3) * 40;
      const x = cx + Math.cos(a) * r0;
      const y = cy + Math.sin(a) * r0 * 0.62;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.62);
      ctx.stroke();
    }
  }

  // -- instruments and HUD -----------------------------------------------------

  function gauge(x, y, r, draw) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.gaugeFace;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.stroke();
    ctx.clip();
    draw(x, y, r);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.gaugeTick;
    ctx.fill();
  }

  function needle(x, y, angle, len, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(angle) * len * 0.22, y - Math.sin(angle) * len * 0.22);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  function drawPanel(state) {
    const y0 = VIEW.height - 118;
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(0, y0, VIEW.width, 118, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, y0, VIEW.width, 2);

    const cy = y0 + 56;
    const kmh = state.speed * 3.6;
    // Airspeed, left: 0 to 320 km/h over 270 degrees.
    gauge(120, cy, 45, (x, y, r) => {
      ctx.strokeStyle = PALETTE.good;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, r - 5, Math.PI * 0.75 + (140 / 320) * Math.PI * 1.5, Math.PI * 0.75 + (280 / 320) * Math.PI * 1.5);
      ctx.stroke();
      ctx.fillStyle = PALETTE.gaugeTick;
      ctx.font = `600 9px ${FONT}`;
      ctx.textAlign = 'center';
      for (let v = 0; v <= 320; v += 40) {
        const a = Math.PI * 0.75 + (v / 320) * Math.PI * 1.5;
        ctx.fillText(String(v), x + Math.cos(a) * (r - 13), y + Math.sin(a) * (r - 13) + 3);
      }
      needle(x, y, Math.PI * 0.75 + (kmh / 320) * Math.PI * 1.5, r - 10, PALETTE.gaugeNeedle);
    });
    label(120, y0 + 14, 'AIRSPEED');

    // Artificial horizon, centre: the world tilts and shifts as the plane does.
    gauge(250, cy, 45, (x, y, r) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-state.bank * 0.42);
      const shift = state.pitch * 13;
      ctx.fillStyle = PALETTE.horizonSky;
      ctx.fillRect(-r, -r + shift - 40, r * 2, r + 40);
      ctx.fillStyle = PALETTE.horizonGround;
      ctx.fillRect(-r, shift, r * 2, r + 40);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r, shift);
      ctx.lineTo(r, shift);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = PALETTE.gaugeNeedle;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 20, y);
      ctx.lineTo(x - 7, y);
      ctx.lineTo(x - 7, y + 5);
      ctx.moveTo(x + 20, y);
      ctx.lineTo(x + 7, y);
      ctx.lineTo(x + 7, y + 5);
      ctx.stroke();
      ctx.fillStyle = PALETTE.gaugeNeedle;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    });
    label(250, y0 + 14, 'HORIZON');

    // Altimeter, right of the horizon: 0 to 120 m.
    gauge(380, cy, 45, (x, y, r) => {
      ctx.fillStyle = PALETTE.gaugeTick;
      ctx.font = `600 9px ${FONT}`;
      ctx.textAlign = 'center';
      for (let v = 0; v <= 120; v += 20) {
        const a = Math.PI * 0.75 + (v / 120) * Math.PI * 1.5;
        ctx.fillText(String(v), x + Math.cos(a) * (r - 13), y + Math.sin(a) * (r - 13) + 3);
      }
      needle(x, y, Math.PI * 0.75 + (state.alt / 120) * Math.PI * 1.5, r - 10, PALETTE.gaugeNeedle);
    });
    label(380, y0 + 14, 'ALTIMETER');

    // Digital readouts, the numbers the brief asks for, big and plain.
    ctx.textAlign = 'left';
    readout(520, cy - 26, 'ALT', `${Math.round(state.alt)} m`);
    readout(520, cy + 16, 'SPD', `${Math.round(kmh)} km/h`);
    readout(730, cy - 26, 'HDG', `${String(Math.round(state.heading) % 360).padStart(3, '0')}°`);
    readout(730, cy + 16, 'DIST', `${(state.distance / 1000).toFixed(2)} km`);
    // Boost and gust state, as panel lamps.
    lamp(950, cy - 20, 'BOOST', state.boosting, PALETTE.gold);
    const gustOn = state.gust.phase === 2;
    const gustWarn = state.gust.phase === 1;
    lamp(950, cy + 18, 'GUST', gustOn || gustWarn, gustOn ? PALETTE.bad : PALETTE.gold);
    lamp(1090, cy - 20, 'RING', state.streak >= 2, PALETTE.good);
    lamp(1090, cy + 18, 'HULL', state.hull <= 1, PALETTE.bad);
  }

  function label(x, y, text) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
  }

  function readout(x, y, name, value) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText(name, x, y);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 25px ${FONT}`;
    ctx.fillText(value, x + 52, y + 1);
  }

  function lamp(x, y, text, on, color) {
    ctx.beginPath();
    ctx.arc(x, y - 4, 6, 0, Math.PI * 2);
    ctx.fillStyle = on ? color : 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(text, x + 12, y);
  }

  function drawHud(state, best) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10,16,26,0.45)';
    ctx.beginPath();
    ctx.roundRect(18, 14, 300, 96, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('SCORE', 34, 40);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(String(Math.floor(state.score)).padStart(6, '0'), 34, 76);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`BEST ${Math.max(best, Math.floor(state.score))}`, 190, 76);
    // Hull, as three small hearts under the score.
    for (let i = 0; i < 3; i += 1) {
      heart(44 + i * 30, 94, 9, i < state.hull ? PALETTE.bad : 'rgba(255,255,255,0.18)');
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('HULL', 140, 98);

    // Compass tape, top centre.
    const cx = VIEW.width / 2;
    ctx.fillStyle = 'rgba(10,16,26,0.45)';
    ctx.beginPath();
    ctx.roundRect(cx - 180, 14, 360, 40, 10);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 172, 16, 344, 36);
    ctx.clip();
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    const firstMark = Math.ceil((state.heading - 62) / 5) * 5;
    for (let m = firstMark; m <= state.heading + 62; m += 5) {
      const deg = ((m % 360) + 360) % 360;
      const x = cx + (m - state.heading) * 2.7;
      if (deg % 45 === 0) {
        ctx.font = `700 15px ${FONT}`;
        ctx.fillText(names[deg] ?? String(deg), x, 42);
      } else if (deg % 15 === 0) {
        ctx.fillRect(x - 1, 34, 2, 8);
      }
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(cx - 6, 14);
    ctx.lineTo(cx + 6, 14);
    ctx.lineTo(cx, 24);
    ctx.closePath();
    ctx.fill();

    // Rings and streak, top right.
    ctx.fillStyle = 'rgba(10,16,26,0.45)';
    ctx.beginPath();
    ctx.roundRect(VIEW.width - 318, 14, 300, 96, 10);
    ctx.fill();
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('RINGS', VIEW.width - 34, 40);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(String(state.ringsHit), VIEW.width - 34, 76);
    if (state.streak >= 2) {
      const mult = (1 + 0.5 * Math.min(state.streak - 1, 8)).toFixed(1);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 17px ${FONT}`;
      ctx.fillText(`STREAK x${mult}`, VIEW.width - 34, 100);
    } else {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `600 13px ${FONT}`;
      ctx.fillText(`MISSED ${state.ringsMissed}`, VIEW.width - 34, 100);
    }

    // Gust warnings shout from the middle of the sky.
    if (state.gust.phase === 1 && Math.sin(state.time * 10) > -0.2) {
      banner(`WIND GUST INCOMING ${state.gust.dir < 0 ? '◀' : '▶'}`, PALETTE.gold);
    } else if (state.gust.phase === 2) {
      banner(`GUST ${state.gust.dir < 0 ? '◀◀' : '▶▶'}`, PALETTE.bad);
    }
  }

  function heart(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.4, y, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y, x, y + s * 0.9);
    ctx.fill();
  }

  function banner(text, color) {
    ctx.textAlign = 'center';
    ctx.font = `800 25px ${FONT}`;
    const w = ctx.measureText(text).width + 44;
    ctx.fillStyle = 'rgba(10,16,26,0.55)';
    ctx.beginPath();
    ctx.roundRect(VIEW.width / 2 - w / 2, 74, w, 44, 9);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, VIEW.width / 2, 105);
  }

  // -- screens -------------------------------------------------------------------

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(8,14,24,0.34)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 84px ${FONT}`;
    ctx.fillText('SKYWARD POST', VIEW.width / 2, 168);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText('Fly the mail through every golden ring. Mind the birds.', VIEW.width / 2, 210);
    ctx.font = `500 19px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Steer with the arrow keys, WASD or the mouse. Shift boosts.', VIEW.width / 2, 262);
    ctx.fillText('Climb and dive with ↑ and ↓. Rings pay more in a streak.', VIEW.width / 2, 290);
    if (Math.sin(uiTime * 4.2) > -0.3) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 27px ${FONT}`;
      ctx.fillText('PRESS SPACE OR CLICK TO FLY', VIEW.width / 2, 356);
    }
    if (best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 19px ${FONT}`;
      ctx.fillText(`BEST ${best}`, VIEW.width / 2, 396);
    }
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8,14,24,0.5)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText('PAUSED', VIEW.width / 2, 330);
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Press P or Space to keep flying', VIEW.width / 2, 372);
  }

  function drawOver(state, best) {
    ctx.fillStyle = 'rgba(8,14,24,0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.bad;
    ctx.font = `800 58px ${FONT}`;
    ctx.fillText('FLIGHT OVER', VIEW.width / 2, 196);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 21px ${FONT}`;
    ctx.fillText(state.overReason, VIEW.width / 2, 240);
    ctx.font = `700 24px ${FONT}`;
    const rows = [
      `SCORE  ${Math.floor(state.score)}`,
      `RINGS  ${state.ringsHit}   ·   BEST STREAK  ${state.bestStreak}`,
      `DISTANCE  ${(state.distance / 1000).toFixed(2)} km`,
      `BEST  ${Math.max(best, Math.floor(state.score))}`,
    ];
    rows.forEach((row, i) => {
      ctx.fillStyle = i === 0 ? PALETTE.gold : PALETTE.text;
      ctx.fillText(row, VIEW.width / 2, 300 + i * 38);
    });
    if (Math.sin(uiTime * 4.2) > -0.3) {
      ctx.font = `800 24px ${FONT}`;
      ctx.fillStyle = PALETTE.text;
      ctx.fillText('PRESS SPACE TO FLY AGAIN', VIEW.width / 2, 500);
    }
  }

  function draw(state, screen, best) {
    uiTime += 1 / 60;
    resize();
    ctx.setTransform(width / VIEW.width, 0, 0, width / VIEW.width, 0, 0);
    focalSmooth += ((state.boosting ? FOCAL * 1.13 : FOCAL) - focalSmooth) * 0.08;
    const focal = focalSmooth;
    const trauma = state.trauma * state.trauma;
    const shakeX = trauma * 15 * Math.sin(state.time * 91);
    const shakeY = trauma * 11 * Math.sin(state.time * 113 + 2);

    drawSky(state, shakeX, shakeY);
    drawGround(state, focal, shakeX);

    // Everything in the world, far to near, so nearer things paint over farther ones.
    const sorted = state.items.filter((item) => item.active).sort((a, b) => b.z - a.z);
    for (const item of sorted) {
      if (item.kind === KIND_CLOUD) drawCloud(state, item, focal, shakeX, shakeY);
      else if (item.kind === KIND_RING) drawRing(state, item, focal, shakeX, shakeY);
      else if (item.kind === KIND_BIRD) drawBird(state, item, focal, shakeX, shakeY);
      else if (item.kind === KIND_TOWER) drawTower(state, item, focal, shakeX, shakeY);
    }
    drawParticles(state, focal, shakeX, shakeY);
    drawSpeedLines(state);
    drawPlane(state, focal, shakeX, shakeY);

    if (state.trauma > 0.02) {
      ctx.fillStyle = `rgba(226,72,61,${(state.trauma * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }

    drawPanel(state);
    drawHud(state, best);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
  }

  return { draw };
}
